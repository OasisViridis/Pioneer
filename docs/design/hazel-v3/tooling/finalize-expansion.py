"""Record accepted v3.1 design-only expansion; does not change app sources."""
from pathlib import Path
import hashlib
import json
from PIL import Image

kit = Path(__file__).resolve().parents[1]
def read(name):
    return json.loads((kit/name).read_text(encoding='utf-8-sig'))
def write(name, data):
    (kit/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

prompts = read('expansion/prompts.json')
record = read('expansion/generation-record.json')
generated = {a['file']:a['generatedFile'] for a in record['accepted']}
figma = read('qa/expansion-figma-assets.json')
placements = read('qa/expansion-figma-main.json')['placements']
foundation = read('qa/expansion-figma-foundation.json')
uploads = {u['file']:u['response'] for u in read('qa/expansion-uploads.json')}
roles = [
 ('Reading', 'empty-state companion', [88,64], 'W02 conversation welcome; not the review-result panel', [2,10]),
 ('Organizing', 'empty-state companion', [88,64], 'L00 workspace onboarding; does not imply files changed', [2,10]),
 ('Listening', 'empty-state companion', [88,64], 'W01 new-session welcome and R02; no audio/online semantics', [2,10]),
 ('Bookmark', 'accessory', [48], 'Source/About layout pattern only; not a bookmark control', [10,11]),
 ('Butterfly', 'accessory', [48], 'Source/About layout pattern only; not send/success', [10,11]),
 ('Charm', 'accessory', [48], 'Source/About layout pattern only; not validation/approval', [2,10,11]),
]
provenance = read('provenance.json')
assets = []
for item, (variant,role,sizes,usage,refs) in zip(prompts['items'],roles):
    file = item['file']
    path = kit/'assets'/file
    im = Image.open(path)
    sources = []
    direct = []
    for reference in item['references']:
        source = Path(reference)
        if source.parent.name == 'assets':
            sources.append({'file':source.name,'sha256':digest(source)})
        else:
            direct.append({'file':source.name,'sha256':digest(source)})
    entry = {'file':file, 'sha256':digest(path), 'type':'GPT generated PNG', 'references':refs,
             'sourceAssets':sources, 'directReferenceImages':direct, 'notOfficial':True,
             'generation':{'tool':record['tool'],'date':record['date'],'generatedFile':generated[file],
                           'exactPrompt':'expansion/prompts.json#'+file,'transparentBackground':True},
             'use':usage}
    previous = next((i for i,a in enumerate(provenance['assets']) if a['file']==file),None)
    if previous is None:
        provenance['assets'].append(entry)
    else:
        provenance['assets'][previous]=entry
    assets.append({'file':file,'sha256':entry['sha256'],'dimensions':list(im.size),'role':role,'variant':variant,
                   'sizes':sizes,'usage':usage,'decorativeOnly':True,'clickable':False,'taskStatusDriven':False,
                   'figmaComponents':{str(size):figma['components'][variant+'/'+str(size)] for size in sizes},
                   'figmaImageHash':uploads[file]['imageHash']})
provenance['figmaExpansionRequest']={'date':record['date'],'fileKey':'EQis9ep9ZQsEenrUVXwlFU',
    'scope':'Only the 6 generated v3.1 PNG outputs; no additional original user files',
    'request':'使用图像生成能力扩展绿冻形象与其他装饰元素，加入设计规范并落地到设计稿',
    'publicLicenseGranted':False,'distinctFromInitial18ItemConsent':True}
write('provenance.json',provenance)
contract={'version':'3.1.0','date':record['date'],'scope':'design specification and editable Figma only',
          'tool':record['tool'],'invariants':['round rabbit ears','scalloped mint jelly','navy eyes and small smile','cream and one cherry','soft gouache'],
          'budget':read('tokens.json')['decoration'],'assets':assets,'figmaFamilies':figma['families'],
          'placements':placements,'board':figma['board'],'foundation':foundation['board'],
          'runtimeIntegrated':False,'originalAssetsPreserved':True,'sourceArtRedistributed':False}
write('expansion/assets.json',contract)
state=read('figma-state.json')
state['currentVersion']='3.1.0'
state['expansion']={'date':record['date'],'assets':assets,'families':figma['families'],
                    'board':figma['board'],'foundation':foundation['board'],'placements':placements,
                    'qa':'qa/expansion-figma-audit.json','runtimeIntegrated':False}
write('figma-state.json',state)
tokens=read('tokens.json')
tokens['version']='3.1.0'
tokens['date']=record['date']
tokens['decorativeComponents']=[{'name':f['name'],'variants':f['count'],'id':f['id']} for f in figma['families']]
tokens['decoration']['assetContract']='expansion/assets.json'
tokens['decoration']['runtimeExpansionIntegrated']=False
write('tokens.json',tokens)
print(json.dumps({'newAssets':len(assets),'allAssets':len(provenance['assets']), 'placements':len(placements), 'families':len(figma['families'])}))
