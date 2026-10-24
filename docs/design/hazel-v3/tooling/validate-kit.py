"""Read-only source checks; writes only this kit's QA and distribution ZIP."""
import hashlib
import json
import re
import zipfile
from pathlib import Path, PureWindowsPath
from xml.etree import ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
KIT = ROOT / "docs/design/hazel-v3"
spec = json.loads((KIT / "tokens.json").read_text(encoding="utf-8-sig"))
provenance = json.loads((KIT / "provenance.json").read_text(encoding="utf-8-sig"))
errors = []
link_checks = 0
for document in [ROOT / "docs/design/DESIGN-SYSTEM.md", KIT / "README.md"]:
    for link in re.findall(r"\]\(([^)]+)\)", document.read_text(encoding="utf-8-sig")):
        if "://" not in link and not link.startswith("#"):
            link_checks += 1
            if not (document.parent / link.split("#")[0]).exists():
                errors.append("missing document link:" + link)
sha = lambda data: hashlib.sha256(data).hexdigest()
css = (ROOT / "apps/desktop/src/renderer/styles/tokens.css").read_text(encoding="utf-8-sig")
defs = re.findall(r"(--pioneer-[\w-]+)\s*:\s*([^;]+);", css)
values = dict(defs)
if len(values) != len(defs):
    errors.append("duplicate CSS token")
for key, color in spec["palette"].items():
    if values.get("--pioneer-palette-" + key, "").lower() != color.lower():
        errors.append("palette:" + key)
for entry in spec["colors"]:
    expected = "var(--pioneer-palette-" + entry["primitive"].split("/")[-1] + ")"
    if values.get(entry["css"]) != expected:
        errors.append(entry["name"])
for entry in spec["dimensions"]:
    if values.get(entry["css"]) != f'var(--pioneer-number-{entry["value"]})':
        errors.append(entry["name"])
app_css = (ROOT / "apps/desktop/src/renderer/styles/app.css").read_text(encoding="utf-8")
missing = sorted(set(re.findall(r"var\((--pioneer-[\w-]+)", css + app_css)) - values.keys())
errors.extend("undefined:" + key for key in missing)

assets = []
for entry in provenance["assets"]:
    file = KIT / "assets" / entry["file"]
    data = file.read_bytes()
    if sha(data) != entry["sha256"]:
        errors.append("asset hash:" + file.name)
    result = {"file": file.name, "sha256": sha(data), "bytes": len(data)}
    if file.suffix == ".png":
        im = Image.open(file)
        if im.mode != "RGBA":
            errors.append("not RGBA:" + file.name)
        rgba = im.convert("RGBA")
        result.update(dimensions=list(im.size), mode=im.mode,
                      cornerAlpha=[rgba.getpixel(p)[3] for p in [(0, 0), (im.width-1, 0), (0, im.height-1), (im.width-1, im.height-1)]],
                      alphaRange=list(rgba.getchannel("A").getextrema()))
        if any(result["cornerAlpha"]) or result["alphaRange"] != [0, 255]:
            errors.append("transparency:" + file.name)
        alpha = rgba.getchannel("A")
        result["visibleBounds"] = list(alpha.getbbox())
        result["edgeAlphaMax"] = max(
            alpha.crop((0, 0, im.width, 1)).getextrema()[1],
            alpha.crop((0, im.height-1, im.width, im.height)).getextrema()[1],
            alpha.crop((0, 0, 1, im.height)).getextrema()[1],
            alpha.crop((im.width-1, 0, im.width, im.height)).getextrema()[1])
        # Imagegen preserves a 1/255 alpha fringe in the existing jelly and
        # three derived poses. Inspectable content has generous margins;
        # preserve the native pixels, do not crop/remove backgrounds to pass QA.
        result["lowAlphaEdgeFringe"] = result["edgeAlphaMax"] == 1
        result["contentBoundsAbove8"] = list(alpha.point(lambda x: 255 if x > 8 else 0).getbbox())
        if result["edgeAlphaMax"] > 1:
            errors.append("clipped edge:" + file.name)
    else:
        svg = ET.fromstring(data)
        result["viewBox"] = svg.attrib.get("viewBox")
        images = [node for node in svg.iter() if node.tag.split("}")[-1] == "image"]
        result["embeddedImages"] = len(images)
        if not result["viewBox"] or images or b"data:image" in data or b"http://" in data.replace(b"http://www.w3.org/2000/svg", b""):
            errors.append("non-native SVG:" + file.name)
    assets.append(result)
runtime_asset = ROOT / "apps/desktop/src/renderer/assets/hazel/jelly-companion.png"
if sha(runtime_asset.read_bytes()) != sha((KIT / "assets/jelly-companion.png").read_bytes()):
    errors.append("runtime asset differs")

expansion = json.loads((KIT / "expansion/assets.json").read_text(encoding="utf-8-sig"))
prompts = json.loads((KIT / "expansion/prompts.json").read_text(encoding="utf-8-sig"))
generated = json.loads((KIT / "expansion/generation-record.json").read_text(encoding="utf-8-sig"))
expected = {a["file"] for a in expansion["assets"]}
if len(expected) != 6 or expected != {a["file"] for a in prompts["items"]}:
    errors.append("expansion prompt inventory")
if not prompts["transparentBackground"] or prompts["tool"] != "built-in image_gen.imagegen":
    errors.append("generation mode")
if expansion["runtimeIntegrated"] or len(expansion["placements"]) != 4:
    errors.append("expansion delivery boundary")
if expansion["budget"]["maxIllustrationsPerView"] != 1 or expansion["budget"]["activeTaskIllustrations"] != 0:
    errors.append("decoration budget changed")
provenance_files = {a["file"]: a for a in provenance["assets"]}
generated_files = {a["file"]:a["generatedFile"] for a in generated["accepted"]}
copy_checks = []
for a in expansion["assets"]:
    if a["sha256"] != provenance_files[a["file"]]["sha256"]:
        errors.append("expansion contract hash:" + a["file"])
    for source in provenance_files[a["file"]]["sourceAssets"]:
        if sha((KIT / "assets" / source["file"]).read_bytes()) != source["sha256"]:
            errors.append("reference asset changed:" + source["file"])
    original = Path.home()/".codex/generated_images/01a0f208-3e5e-7050-99a0-fd43041f5e3e"/generated_files[a["file"]]
    same = original.exists() and sha(original.read_bytes()) == a["sha256"]
    copy_checks.append({"file":a["file"],"matchesOriginalGeneratedBytes":same})
    if not same:
        errors.append("accepted output copy:" + a["file"])
figma_expansion = json.loads((KIT / "qa/expansion-figma-audit.json").read_text(encoding="utf-8-sig"))
if not figma_expansion["pass"]:
    errors.append("Figma expansion audit failed")
# v3.1's dated expansion above remains historical. The user's v3.2 request
# explicitly approves single-slot accessory alternatives, not arbitrary usage.
decoration = json.loads((KIT / "decoration-policy.json").read_text(encoding="utf-8-sig"))
approved_runtime = {a["file"] for a in decoration["assets"]}
reserved_runtime = set(decoration["selection"]["reservedNoRuntime"])
required_budget = {"brandMark": 20, "maxIllustrationsPerView": 1,
                   "emptyIllustration": 88, "compactEmptyIllustration": 64,
                   "accessory": 48, "safeTextGap": 24, "hideConversationBelow": 380,
                   "activeTaskIllustrations": 0, "errorPermissionUnknownIllustrations": 0}
if any(decoration["budget"].get(k) != v for k, v in required_budget.items()):
    errors.append("v3.2 decoration budget changed")
if len(approved_runtime) != 12 or len(provenance_files) != 14 or approved_runtime & reserved_runtime:
    errors.append("v3.2 approved/reserved inventory")
selected = {decoration["selection"]["onboarding"]} | {
    f for pool in decoration["selection"]["pools"].values() for f in pool}
if selected != approved_runtime or not decoration["selection"]["emptyOnly"] or not decoration["selection"]["removeOnMessagesOrSaveError"]:
    errors.append("v3.2 empty-only theme policy")
for a in decoration["assets"]:
    if a["sha256"] != provenance_files[a["file"]]["sha256"]:
        errors.append("v3.2 canonical hash:" + a["file"])
    if a["file"].endswith(".png") and a["intrinsicWidth"] != Image.open(KIT / "assets" / a["file"]).width:
        errors.append("v3.2 intrinsic dimension:" + a["file"])
figma_decoration = json.loads((KIT / "qa/decoration-figma-audit-2026-10-01.json").read_text(encoding="utf-8-sig"))
if not figma_decoration["pass"] or figma_decoration["variantCount"] != 24:
    errors.append("v3.2 Figma decoration audit")
approved_source = "apps/desktop/src/renderer/components/HazelCompanion.tsx"
runtime_imports = []
runtime_names = set()
for source in (ROOT / "apps/desktop/src").rglob("*"):
    if source.is_file() and source.suffix in [".tsx", ".ts", ".css"]:
        source_text = source.read_text(encoding="utf-8-sig")
        found = {name for name in provenance_files if name in source_text}
        if found:
            path = source.relative_to(ROOT).as_posix()
            runtime_imports.append({"path": path, "assets": sorted(found)})
            runtime_names.update(found)
            if path != approved_source or found - approved_runtime:
                errors.append("unapproved runtime asset usage:" + path)
if runtime_names != approved_runtime:
    errors.append("approved runtime theme inventory")
runtime_copy_checks = []
for name in sorted(approved_runtime):
    runtime_file = ROOT / "apps/desktop/src/renderer/assets/hazel" / name
    same = runtime_file.exists() and sha(runtime_file.read_bytes()) == provenance_files[name]["sha256"]
    runtime_copy_checks.append({"file": name, "matchesSourceBytes": same})
    if not same:
        errors.append("runtime theme copy:" + name)
# Certification-like seal and duplicate brand source remain design-only, even
# without an import. Every runtime asset must be in the approved local catalog.
for name in reserved_runtime:
    if (ROOT / "apps/desktop/src/renderer/assets/hazel" / name).exists():
        errors.append("reserved asset in runtime:" + name)
actual_runtime = {p.name for p in (ROOT / "apps/desktop/src/renderer/assets/hazel").iterdir() if p.is_file()}
if actual_runtime != approved_runtime:
    errors.append("runtime assets outside approved catalog")

def luminance(hex_color):
    channels = [int(hex_color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in channels]
    return sum(c*w for c, w in zip(linear, [.2126, .7152, .0722]))

p = spec["palette"]
pairs = [("ink", "canvas", 4.5), ("secondary", "canvas", 4.5), ("secondary", "surface", 4.5),
         ("on-navy", "navy", 4.5), ("on-navy", "risk", 4.5), ("success-ink", "mint", 4.5),
         ("risk-ink", "rose", 4.5), ("ink", "notice", 4.5), ("control-border", "surface", 3),
         ("navy", "canvas", 3)]
contrast = []
for fg, bg, minimum in pairs:
    a, b = luminance(p[fg]), luminance(p[bg])
    ratio = (max(a, b)+.05)/(min(a, b)+.05)
    contrast.append({"foreground": fg, "background": bg, "ratio": round(ratio, 3), "minimum": minimum, "pass": ratio >= minimum})
    if ratio < minimum:
        errors.append("contrast:" + fg + "/" + bg)

baseline = json.loads((KIT / "qa/inherited-baseline.json").read_text(encoding="utf-8-sig"))
original = next(e for e in baseline if e["path"] == "docs/design/DESIGN-SYSTEM.md")
archive_hash = sha((KIT / "references/DESIGN-SYSTEM-v2.md").read_bytes())
if archive_hash.upper() != original["sha256"].upper():
    errors.append("v2 original archive changed")

# The distributable has metadata, not the user's source artwork or absolute paths.
public_provenance = json.loads(json.dumps(provenance))
for reference in public_provenance["references"]:
    reference["path"] = PureWindowsPath(reference["path"]).name
files = {"assets/" + a["file"]: (KIT / "assets" / a["file"]).read_bytes() for a in provenance["assets"]}
for name in ["README.md", "tokens.json", "tokens.css", "prompts.md"]:
    files[name] = (KIT / name).read_bytes()
files["README.md"] = files["README.md"].replace(b"(../DESIGN-SYSTEM.md)", b"(https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1276)")
public_readme = files["README.md"].decode("utf-8").replace("[素材与 token ZIP](Pioneer-Hazel-v3-assets.zip)", "本素材与 token 包")
# QA lives in the repository, not this distributable. Do not turn an engineering
# evidence link into a Figma link or include profiles/logs/screenshots in the ZIP.
public_readme = re.sub(r"\[([^\]]+)\]\((qa/[^)]+)\)",
                      lambda m: m[1] + "（仓库证据 `" + m[2] + "`；不含在本包）", public_readme)
files["README.md"] = public_readme.encode("utf-8")
for name in ["assets.json", "generation-record.json"]:
    files["expansion/"+name] = (KIT/"expansion"/name).read_bytes()
public_prompts = json.loads(json.dumps(prompts))
for item in public_prompts["items"]:
    item["references"] = [PureWindowsPath(path).name for path in item["references"]]
files["expansion/prompts.json"] = (json.dumps(public_prompts, ensure_ascii=False, indent=2)+"\n").encode("utf-8")
files["provenance.json"] = (json.dumps(public_provenance, ensure_ascii=False, indent=2)+"\n").encode("utf-8")
files["decoration-policy.json"] = (KIT / "decoration-policy.json").read_bytes()
zip_path = KIT / "Pioneer-Hazel-v3-assets.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(name, (2026, 10, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, data)
with zipfile.ZipFile(zip_path) as archive:
    zip_error = archive.testzip()
    if zip_error:
        errors.append("ZIP CRC:" + zip_error)
    for name, data in files.items():
        if sha(archive.read(name)) != sha(data):
            errors.append("ZIP hash:" + name)
        if name.endswith((".md", ".json", ".css")) and re.search(rb"(?<![A-Za-z])[A-Za-z]:[\\\\/]", data):
            errors.append("ZIP absolute path:" + name)
    for name, data in files.items():
        if name.endswith(".md"):
            for link in re.findall(r"\]\(([^)]+)\)", data.decode("utf-8")):
                if "://" not in link and not link.startswith("#"):
                    target = str((Path(name).parent/link.split("#")[0])).replace("\\", "/")
                    if target not in files:
                        errors.append("ZIP broken document link:" + target)
report = {"date": "2026-10-01", "tokenBaselineDate": spec["date"], "pass": not errors, "errors": errors,
          "relativeLinksChecked": link_checks,
          "palette": len(spec["palette"]), "semantics": len(spec["colors"]), "geometry": len(spec["dimensions"]),
          "textStyles": len(spec["textStyles"]), "cssDefinitions": len(values), "undefinedCss": missing,
          "referenceCount": len(provenance["references"]), "assets": assets, "contrast": contrast,
          "expansion": {"generatedAssets":len(expected), "copyChecks":copy_checks, "figmaAuditPassed":figma_expansion["pass"],
                        "historicalStaticDeliveryRuntimeIntegrated":False,
                        "runtimeBehaviorVerifiedByThisTool":False},
          "decorationDiversity": {"version": decoration["version"], "outputAssets": len(provenance_files),
                                   "approvedRuntimeAssets": len(approved_runtime),
                                   "runtimeSourceIntegrated":runtime_names == approved_runtime,
                                   "runtimeThemeCopyChecks":runtime_copy_checks, "runtimeAssetImports":runtime_imports,
                                   "figmaVariantCount":figma_decoration["variantCount"],
                                   "reservedDesignOnly":sorted(reserved_runtime),
                                   "runtimeBehaviorVerifiedByThisTool":False},
          "v2ArchiveSha256": archive_hash,
          "zip": {"file": zip_path.name, "sha256": sha(zip_path.read_bytes()), "files": sorted(files), "crcError": zip_error,
                  "referenceImagesIncluded": False, "absolutePathsIncluded": False}}
(KIT / "qa/local-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
print(json.dumps({"pass": report["pass"], "errors": errors, "zip": report["zip"], "contrast": contrast}, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)
