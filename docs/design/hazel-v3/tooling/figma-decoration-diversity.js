// Scoped v3.2 composition. Requires the explicitly captured external state.
// Not a reset command; existing canvas IDs and original assets remain intact.
const state = __STATE__;
const page = await figma.getNodeByIdAsync('824:1277');
await figma.setCurrentPageAsync(page);
if (page.children.some(n => n.name === 'Quiet decoration / Slot policy v3.2'))
  throw new Error('Existing v3.2 composition: inspect and resume by returned IDs.');
const created = [], mutated = [], components = {}, V = {}, S = {};
await Promise.all(Object.entries(state.variables).map(async ([k,id]) => {
  V[k] = await figma.variables.getVariableByIdAsync(id);
}));
await Promise.all(Object.entries(state.styles).map(async ([k,id]) => {
  S[k] = await figma.getStyleByIdAsync(id); await figma.loadFontAsync(S[k].fontName);
}));
const add = n => (created.push(n.id),n);
const paint = k => figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',V[k]);
function box(name,w,dir='VERTICAL',gap=16) {
  const n=add(figma.createAutoLayout(dir)); n.name=name; n.resize(w,100);
  n.primaryAxisSizingMode=dir==='VERTICAL'?'AUTO':'FIXED';
  n.counterAxisSizingMode=dir==='VERTICAL'?'FIXED':'AUTO';
  n.setBoundVariable('itemSpacing',V['space/'+gap]);n.fills=[];n.clipsContent=false;return n;
}
async function txt(p,value,w,style='Body/Default',color='color/text-primary') {
  const t=add(figma.createText()); t.fontName=S[style].fontName;t.characters=value;
  await t.setTextStyleIdAsync(S[style].id); t.fills=[paint(color)];p.appendChild(t);
  t.resize(w,t.height);t.textAutoResize='HEIGHT';return t;
}
const inventory = [
  ['Organizing','整理绿冻','greendou-organizing.png','856:1280','856:1282'],
  ['Listening','陪伴绿冻','greendou-listening.png','856:1284','856:1286'],
  ['Reading','阅读绿冻','greendou-reading.png','856:1276','856:1278'],
  ['Quiet','原版绿冻','jelly-companion.png'],
  ['Butterfly','纸蝶','paper-butterfly.png','856:1291','856:1291'],
  ['Bookmark','樱桃书签','cherry-bookmark.png','856:1289','856:1289'],
  ['Charm','果冻挂饰','jelly-ribbon-charm.png','856:1293','856:1293'],
  ['UniformRibbon','制服蝴蝶结','uniform-ribbon.png'],
  ['RibbonOutline','蝴蝶结轮廓','ribbon-outline.svg'],
  ['CherryPair','樱桃小枝','cherry-pair.svg'],
  ['PaperFold','银灰折页 · 新','silver-paper-fold.svg'],
  ['JellyOutline','果冻线描 · 新','jelly-outline.svg'],
];
const colors={'333c50':'primitive/color/navy','fdfcfa':'primitive/color/surface','eeedea':'primitive/color/subtle','858d92':'primitive/color/control-border','d9d7d2':'primitive/color/silver','c6af94':'primitive/color/gold','dce9df':'primitive/color/mint','944b59':'primitive/color/berry'};
const variants=[];
for(const [theme,label,file,desktopMaster,compactMaster] of inventory) {
  components[file]={};
  for(const size of [88,64]) {
    const c=add(figma.createComponent());c.name=`Theme=${theme}, Slot=${size}`;c.resize(size,size);
    c.layoutMode='HORIZONTAL';c.primaryAxisSizingMode='FIXED';c.counterAxisSizingMode='FIXED';
    c.primaryAxisAlignItems='MAX';c.counterAxisAlignItems='MIN';c.fills=[];c.clipsContent=false;
    c.description=`One quiet empty-state slot; ${file}. Static local session theme, never status/control. Motifs <=48px; companion 88/64px. No stacking; 24px text gap; remove for messages/errors/permissions/unknown.`;
    let art;
    if(desktopMaster) {
      const m=await figma.getNodeByIdAsync(size===88?desktopMaster:compactMaster);
      art=add(m.createInstance()); created.push(...art.findAll(()=>true).map(n=>n.id));
    } else if(file.endsWith('.svg')) {
      art=add(figma.createNodeFromSvg(state.svg[file]));art.resize(48,48);
      created.push(...art.findAll(()=>true).map(n=>n.id));
      for(const node of art.findAll(()=>true)) for(const field of ['fills','strokes']) {
        if(!(field in node)||!Array.isArray(node[field]))continue;
        node[field]=node[field].map(p=>{
          if(p.type!=='SOLID')return p;
          const hex=['r','g','b'].map(k=>Math.round(p.color[k]*255).toString(16).padStart(2,'0')).join('');
          return colors[hex]&&V[colors[hex]]?figma.variables.setBoundVariableForPaint(p,'color',V[colors[hex]]):p;
        });
      }
    } else {
      const a=state.assets.find(a=>a.file===file);if(!a?.imageHash)throw new Error('Missing original image:'+file);
      art=add(figma.createRectangle());art.resize(file==='jelly-companion.png'?size:48,file==='jelly-companion.png'?size:48);
      art.fills=[{type:'IMAGE',imageHash:a.imageHash,scaleMode:'FIT'}];
    }
    art.name='Decorative asset / '+file;c.appendChild(art);variants.push(c);components[file][size]=c.id;
  }
}
// Variant construction/grid placement follows createComponentWithVariants.js.
const set=add(figma.combineAsVariants(variants,page));set.name='Pioneer v3 / Quiet Decoration';
set.description='12 themes × two fixed budget slots. Companions 88/64; eight smaller motifs 48. Exactly one per quiet empty view. Choose by immutable session ID, never task state or timer.';
set.x=2180;set.y=2900;
set.children.forEach((n,i)=>{n.x=24+(i%2)*112;n.y=24+Math.floor(i/2)*112;});set.resize(248,1392);
const board=box('Quiet decoration / Slot policy v3.2',1440,'VERTICAL',24);
board.x=100;board.y=2894;board.fills=[paint('color/surface')];
for(const k of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])board.setBoundVariable(k,V['space/32']);
await txt(board,'同一个槽位，更多种安静的陪伴',1376,'Heading/Large');
await txt(board,'v3.2 · 复用 6 件闲置配饰，只补 2 件原生 SVG。以下是素材比较，不是同时显示的应用视图。每个实际视图仍最多一张；暖纸面、制服藏蓝与字体不变。',1376,'Body/Reading');
for(let rowIndex=0;rowIndex<3;rowIndex++) {
  const row=box('Asset comparison row '+(rowIndex+1),1376,'HORIZONTAL',16);board.appendChild(row);
  for(const [theme,label,file] of inventory.slice(rowIndex*4,rowIndex*4+4)) {
    const card=box(label,332,'VERTICAL',12);row.appendChild(card);
    await txt(card,label,332,'UI/Card Title');
    const slots=box('Desktop / compact comparison',332,'HORIZONTAL',24);card.appendChild(slots);
    for(const size of [88,64]) {const m=await figma.getNodeByIdAsync(components[file][size]);const i=add(m.createInstance());slots.appendChild(i);created.push(...i.findAll(()=>true).map(n=>n.id));}
    await txt(card,file,332,'UI/Small','color/text-secondary');
    await txt(card,file.startsWith('greendou-')||file==='jelly-companion.png'?'主体 88 / 64px':'配饰 48px · 替换，不叠加',332,'UI/Small');
  }
}
await txt(board,'真实视图样例 · 每张卡只占用一个插画槽',1376,'Heading/Medium');
const examples=box('Single-slot welcome examples',1376,'HORIZONTAL',16);board.appendChild(examples);
for(const [name,file,note] of [['专注空态','jelly-outline.svg','线描果冻，不代表在线'],['审阅欢迎','cherry-bookmark.png','书签配饰，不是收藏按钮'],['交付欢迎','uniform-ribbon.png','制服配饰，不代表已交付']]) {
  const card=box(name,448,'VERTICAL',24);examples.appendChild(card);card.fills=[paint('color/canvas')];
  for(const k of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])card.setBoundVariable(k,V['space/24']);
  const row=box('Welcome text + one slot',400,'HORIZONTAL',24);card.appendChild(row);
  const copy=box('Welcome copy',288,'VERTICAL',12);row.appendChild(copy);
  await txt(copy,name,288,'UI/Card Title');await txt(copy,'从一个具体任务开始',288,'Heading/Medium');
  const m=await figma.getNodeByIdAsync(components[file][88]);const i=add(m.createInstance());row.appendChild(i);created.push(...i.findAll(()=>true).map(n=>n.id));
  await txt(card,note+'。仅本机保存，尚未发送；已有消息、权限、错误、未知与活跃任务均无图。',400,'Body/Default');
}
await txt(board,'预算锁：品牌 20px；一个空态槽 88 / 64px；配饰 48px；文字安全距至少 24px；会话容器 <380px 隐藏。静态会话主题不因输入、重命名、排序或重启而变化；不轮播、不动画、不新建关于页。徽章保留仅来源用途。',1376,'Body/Default');
for(const id of ['856:1295','834:1280','834:1296','834:1300']) {
  const n=await figma.getNodeByIdAsync(id);n.description='Original asset preserved. Also allowed as the sole <=48px decoration replacing a quiet empty-state slot in v3.2; never an action, status, approval or result.';mutated.push(id);
}
for(const [id,value] of [['834:1283','莓红配饰 · 48px · 静态空态备选'],['834:1299','蝴蝶结轮廓 · 48px · 静态空态备选'],['834:1303','制服蝴蝶结 · 48px · 静态空态备选']]) {
  const n=await figma.getNodeByIdAsync(id);for(const s of n.getStyledTextSegments(['fontName']))await figma.loadFontAsync(s.fontName);n.characters=value;mutated.push(id);
}
return {createdNodeIds:created,mutatedNodeIds:mutated,setId:set.id,boardId:board.id,components,variantCount:set.children.length,boardBounds:{x:board.x,y:board.y,w:board.width,h:board.height},actualViews:examples.children.map(n=>({id:n.id,name:n.name,decorativeSlotCount:n.findAllWithCriteria({types:['INSTANCE']}).filter(i=>i.mainComponent?.parent?.id===set.id).length}))};
