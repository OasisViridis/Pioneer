
const made=[],entries=[];
async function renderBoard(spec,x,y){
if(page.children.some(n=>n.name===spec.key+" · "+spec.title))throw Error("Board already exists: "+spec.key);
const board=await doc(spec.key+" · "+spec.title,spec.desc,x,y,1664);made.push(board);
for(let r=0;r<Math.ceil(spec.tiles.length/3);r++){
const row=frame(board,spec.key+" / State row "+(r+1),"HORIZONTAL",1600,{gap:32});
for(const t of spec.tiles.slice(r*3,r*3+3)){
const tile=frame(row,t.id+" · "+t.title,"VERTICAL",512,{gap:12});
await txt(tile,"State name",t.id+" · "+t.title,"UI/Label","text-primary",512);
const ui=frame(tile,t.id+" / UI","VERTICAL",512,{fill:"surface",stroke:t.focus?"focus":"border-control",pad:24,gap:16,r:12});
if(t.future)await banner(ui,"设计示例 · 待实现 · 不具授权效力",464);
if(t.badge)await inst("Status",t.badge[0],ui,null,{Text:t.badge[1]});
if(t.lead)await txt(ui,"Message",t.lead,"Body/Reading","text-primary",464);
for(const f of t.fields||[])await inst("Field",f[0],ui,464,f[1]);
for(const c of t.components||[])await inst(c[0],c[1],ui,464,c[2]);
if(t.actions?.length){for(let j=0;j<t.actions.length;j+=2){const arow=frame(ui,"Action row "+(j/2+1),"HORIZONTAL",464,{gap:16});
for(const a of t.actions.slice(j,j+2))await button(arow,a[0],a[1]||"Secondary",a[2]||"Default",224);}}
await txt(tile,"Interaction and evidence boundary",t.note,"Body/Default","text-secondary",512);
entries.push({stateId:t.id,title:t.title,nodeId:tile.id,uiId:ui.id,future:!!t.future,components:(t.components||[]).map(c=>({family:c[0],state:c[1]})),focusAndReturn:t.note});
}}
return board;}
async function repairCJK(root){const ids=[];for(const n of root.findAllWithCriteria({types:["TEXT"]})){for(const seg of n.getStyledTextSegments(["fontName"])){await figma.loadFontAsync(seg.fontName);if(seg.fontName.family!=="JetBrains Mono")continue;const re=/[\u3000-\u9fff\uff00-\uffef]+/g;let m;while((m=re.exec(seg.characters))!==null){await figma.loadFontAsync({family:"Noto Sans SC",style:"Regular"});n.setRangeFontName(seg.start+m.index,seg.start+m.index+m[0].length,{family:"Noto Sans SC",style:"Regular"});ids.push(n.id);}}}return ids;}

