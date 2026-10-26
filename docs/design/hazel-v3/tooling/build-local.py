import json, hashlib, sys
if '--rebuild-initial' not in sys.argv:
    raise SystemExit('Historical migration only: --rebuild-initial required; this overwrites the manifest and runtime CSS. Use validate-kit.py for final QA.')
from pathlib import Path
root=Path.cwd(); out=root/'docs/design/hazel-v3'; src=root/'docs/design/pioneer-design-tokens-v2.json'
v=json.loads(src.read_text(encoding='utf-8-sig'))
v.update(version='3.0.0',status='in-progress',date='2026-09-30',source='Hazel user reference artwork + Claude public visual grammar; independent application interpretation')
v['palette'].update({'canvas':'#F6F5F1','surface':'#FDFCFA','surface-muted':'#EEEDEA','secondary':'#64696F','silver':'#D9D7D2','mint':'#DCE9DF','berry':'#944B59'})
v['colors'].append({'name':'color/decorative-berry','primitive':'color/berry','css':'--pioneer-decorative-berry','scopes':['SHAPE_FILL']})
for s in v['textStyles']: s['name']=s['name'].replace('v2','v3')
v['textStyles'].append({'name':'Pioneer v3 / Display/Welcome','family':'Noto Serif SC','style':'Medium','size':28,'lineHeight':40})
v['textStyles'].append({'name':'Pioneer v3 / UI/Card Title','family':'Noto Sans SC','style':'Medium','size':16,'lineHeight':24})
v['decoration']={'brandMark':20,'emptyIllustration':88,'aboutMotif':48,'maxIllustrationsPerView':1,'safeTextGap':24,'activeTaskIllustrations':0,'prohibited':['wallpaper','watermark behind text','mascot status indicator','patterned work surface','repeating gold trims','automatic celebratory animation']}
(out/'tokens.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
css=['/* Pioneer v3 - Quiet companion. See docs/design/hazel-v3/tokens.json. */',':root {','  color-scheme: light;']
for k,x in v['palette'].items(): css.append(f'  --pioneer-palette-{k}: {x.lower()};')
for n in sorted(set(x['value'] for x in v['dimensions'])): css.append(f'  --pioneer-number-{n}: {n}px;')
for c in v['colors']: css.append(f"  {c['css']}: var(--pioneer-palette-{c['primitive'].split('/')[-1]});")
for x in v['dimensions']: css.append(f"  {x['css']}: var(--pioneer-number-{x['value']});")
css.extend(['  --pioneer-gold-ink: var(--pioneer-palette-gold-ink);','  --pioneer-radius: var(--pioneer-radius-12);','  --pioneer-space: var(--pioneer-space-16);',"  --pioneer-font-ui: Inter, 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif;","  --pioneer-font-display: 'Noto Serif SC', 'Songti SC', SimSun, Georgia, serif;",'  --pioneer-motion-fast: 120ms;','}'])
# Compatibility CSS names (old v2 aliases already include mint/gold/slate/rose).
text='\n'.join(css)+'\n'
(out/'tokens.css').write_text(text,encoding='utf-8'); (root/'apps/desktop/src/renderer/styles/tokens.css').write_text(text,encoding='utf-8')
attachments=Path(r'C:\Users\Oasis\.codex\attachments\c8d41eb2-23c2-4ac6-9a6f-1fb39fd496bd')
roles=['chibi + jelly palette','jelly rabbit + cherry hair clip','schedule: paper / navy / clipped corner','QR collateral; never embed QR as app decoration','school uniform / sky, not application background','merchandise composition; crowded counterexample','pastel painting; mood only','alternate hood; mood only','white dress; secondary reference','uniform chibi + jelly glyph + bow','uniform: navy / silver / champagne / bow','school uniform: navy / gray / mint']
from PIL import Image
refs=[]
for i in range(1,13):
 f=next(attachments.glob(f'image-{i}.*')); im=Image.open(f)
 refs.append({'image':i,'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'dimensions':list(im.size),'source':'user-supplied; artist and publication rights not independently verified','use':roles[i-1]})
assets=[]
for f in sorted((out/'assets').iterdir()):
 assets.append({'file':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'type':'GPT generated PNG' if f.suffix=='.png' else 'original editable SVG interpretation','references':[2,10] if f.name=='jelly-companion.png' else [11] if 'ribbon' in f.name else [10,11], 'notOfficial':True})
(out/'provenance.json').write_text(json.dumps({'references':refs,'assets':assets,'policy':'Not an official Hazel or Anthropic design system; no official attribution, commercial license, or registered brand status claimed. Original user reference art is not redistributed in the asset ZIP.'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Manifest:',len(v['palette']),'palette,',len(v['colors']),'semantics,',len(v['dimensions']),'geometry,',len(v['textStyles']),'styles; sources:',len(refs),'assets:',len(assets))


