"""Requirement-level completion evidence for the design-only v3.1 expansion."""
from pathlib import Path
import hashlib
import json
import re
import zipfile
from PIL import Image

kit=Path(__file__).resolve().parents[1]
root=kit.parents[2]
def read(file):
    return json.loads((kit/file).read_text(encoding='utf-8-sig'))
def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()
local=read('qa/local-validation.json')
figma=read('qa/expansion-figma-audit.json')
contract=read('expansion/assets.json')
prompts=read('expansion/prompts.json')
runtime=read('qa/expansion-runtime-boundary.json')
provenance=read('provenance.json')
tokens=read('tokens.json')
state=read('figma-state.json')
names={a['file'] for a in contract['assets']}
doc=(root/'docs/design/DESIGN-SYSTEM.md').read_text(encoding='utf-8')
evidence=[]
def requirement(name,passed,source):
    evidence.append({'requirement':name,'pass':bool(passed),'evidence':source})
requirement('Use built-in image generation and persist six accepted transparent assets',
    len(names)==6 and prompts['tool']=='built-in image_gen.imagegen' and
    local['pass'] and all(c['matchesOriginalGeneratedBytes'] for c in local['expansion']['copyChecks']),
    ['expansion/prompts.json','expansion/generation-record.json','qa/local-validation.json'])
requirement('Derive recognizable poses and accessories from existing Hazel material',
    figma['visualReview']['pass'] and len(provenance['assets'])==12 and
    all(a['sourceAssets'] for a in provenance['assets'] if a['file'] in names),
    ['provenance.json','qa/expansion-small-size.png','qa/expansion-figma-assets.png'])
requirement('Integrate all new assets into current human and machine-readable design specifications',
    all(name in doc for name in names) and tokens['version']=='3.1.0' and
    tokens['decoration']['maxIllustrationsPerView']==1 and tokens['decoration']['activeTaskIllustrations']==0 and
    len(tokens['decorativeComponents'])==2 and state['currentVersion']=='3.1.0',
    ['../DESIGN-SYSTEM.md','README.md','tokens.json','expansion/assets.json','figma-state.json'])
requirement('Use all three poses in four existing editable application empty-state screens',
    figma['screens']['pass'] and figma['screens']['changedScreens']==4 and
    len({p['pose'].split('/')[0] for p in contract['placements']})==3 and
    not figma['screens']['flattenedFullUiImages'] and
    all(s['illustrationCount']<=1 for s in figma['screens']['screens']),
    ['qa/expansion-figma-main.json','qa/expansion-figma-audit.json','qa/expansion-figma-L00.png',
     'qa/expansion-figma-W01.png','qa/expansion-figma-W02.png','qa/expansion-figma-R02.png'])
requirement('Provide reusable decorative variants and restrained accessory placement examples',
    figma['assets']['pass'] and len(figma['assets']['families'])==2 and
    sum(f['count'] for f in figma['assets']['families'])==9 and
    len(figma['assets']['board']['instances'])==12 and not figma['assets']['strayNodes'],
    ['qa/expansion-figma-assets.json','qa/expansion-figma-assets.png','qa/expansion-figma-audit.json'])
zip_file=kit/'Pioneer-Hazel-v3-assets.zip'
with zipfile.ZipFile(zip_file) as z:
    zip_names=z.namelist()
    package_ok=z.testzip() is None and all('assets/'+name in zip_names for name in names)
    package_ok=package_ok and all(z.read('assets/'+name)==(kit/'assets'/name).read_bytes() for name in names)
    package_ok=package_ok and all(not re.match(r'(^|/)image-\d+\.(png|jpg)$',name) for name in zip_names)
requirement('Ship verifiable local outputs, prompts and updated offline asset package without original reference art',
    package_ok and len(zip_names)==20 and sha(zip_file)==local['zip']['sha256'],
    ['Pioneer-Hazel-v3-assets.zip','qa/local-validation.json'])
requirement('Preserve application/runtime boundary and clean temporary upload material',
    not contract['runtimeIntegrated'] and runtime['pass'] and
    not local['expansion']['runtimeNewAssetImports'] and
    not (kit/'qa/expansion-upload-temporary.json').exists(),
    ['qa/expansion-runtime-boundary.json','qa/expansion-uploads.json','README.md'])
renders=[]
for view in figma['visualReview']['reviewedRenders']:
    path=kit/'qa'/view['file']
    with Image.open(path) as im:
        renders.append({'file':view['file'],'dimensions':list(im.size),'sha256':sha(path)})
report={'date':'2026-10-01','version':'3.1.0','pass':all(r['pass'] for r in evidence),
        'objective':'使用图像生成能力扩展绿冻形象与其他装饰元素，加入设计规范并落地到设计稿',
        'requirements':evidence,'newGeneratedAssets':6,'allAssets':12,'decorativeFamilies':2,'decorativeVariants':9,
        'updatedApplicationScreens':4,'renders':renders,'zip':local['zip'],
        'pixelNote':'Original jelly and three poses retain native edge alpha at most 1/255; no visible subject is clipped. No raster background cleanup or cropping was performed.',
        'engineeringBoundary':{'runtimeExpansionIntegrated':False,'pnpmCheckRerunThisExpansion':False,
                               'priorEngineeringGate':'2026-09-30','priorInputFingerprintsChecked':len(runtime['checks'])},
        'published':False}
(kit/'qa/expansion-completion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pass':report['pass'],'requirements':evidence,'zipSha256':report['zip']['sha256']},ensure_ascii=False,indent=2))
raise SystemExit(0 if report['pass'] else 1)
