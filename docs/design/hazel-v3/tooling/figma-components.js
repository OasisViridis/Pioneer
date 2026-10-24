const state=__STATE__;
const page=await figma.getNodeByIdAsync(state.pages['components · v3']);await figma.setCurrentPageAsync(page);
const sourceIds=['720:1608','720:1670','720:1700','722:1580','722:1591','722:1619','722:1630','722:1660','722:1675','725:1580','725:1618','725:1678','725:1747','725:1803','725:1854'];
const vs=await figma.variables.getLocalVariablesAsync();const cs=await figma.variables.getLocalVariableCollectionsAsync();const oldV=vs.filter(v=>cs.find(c=>c.id===v.variableCollectionId)?.name.startsWith('Pioneer v2'));const vMap={};for(const v of oldV){const c=cs.find(c=>c.id===v.variableCollectionId);const key=(c.name.endsWith('Primitives')?'primitive/':'')+v.name;if(state.variables[key])vMap[v.id]=await figma.variables.getVariableByIdAsync(state.variables[key]);}
const styles=await figma.getLocalTextStylesAsync();const oldStyleMap=Object.fromEntries(styles.filter(s=>s.name.startsWith('Pioneer v2')).map(s=>[s.id,state.styles[s.name.split(' / ')[1]]]));
const source=[];const fonts=new Map();for(const id of sourceIds){const n=await figma.getNodeByIdAsync(id);source.push(n);for(const t of n.findAllWithCriteria({types:['TEXT']}))for(const s of t.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);}
for(const f of fonts.values())await figma.loadFontAsync(f);
const created=[];const map={};const roots=[];
function pair(a,b){map[a.id]=b.id;created.push(b.id);if('children' in a)for(let i=0;i<a.children.length;i++)pair(a.children[i],b.children[i]);}
let y=100;for(const n of source){const name=n.name.replace('v2','v3');let c=page.children.find(c=>c.name===name);if(!c){c=n.clone();page.appendChild(c);c.name=name;pair(n,c);}else pair(n,c);c.x=100;c.y=y;y+=c.height+100;roots.push(c);}
const swaps=[];const mutated=[];let bindings=0;for(const root of roots){const nodes=[root,...root.findAll(()=>true)];for(const n of nodes){mutated.push(n.id);if(n.type==='TEXT'){const segs=n.getStyledTextSegments(['fontName']);if(oldStyleMap[n.textStyleId])await n.setTextStyleIdAsync(oldStyleMap[n.textStyleId]);for(const s of segs)n.setRangeFontName(s.start,s.end,s.fontName);}
 for(const prop of ['fills','strokes'])if(prop in n&&Array.isArray(n[prop]))n[prop]=n[prop].map(p=>{if(p.type==='SOLID'&&p.boundVariables?.color&&vMap[p.boundVariables.color.id]){bindings++;return figma.variables.setBoundVariableForPaint(p,'color',vMap[p.boundVariables.color.id]);}return p;});
 for(const [field,value] of Object.entries(n.boundVariables??{})){if(Array.isArray(value)||['fills','strokes','effects'].includes(field))continue;if(value?.id&&vMap[value.id]){n.setBoundVariable(field,vMap[value.id]);bindings++;}}
 if(n.type==='COMPONENT'||n.type==='COMPONENT_SET')n.description=n.description+'\nPioneer v3: Quiet companion. Application decoration budget applies; identity is not permission or run status.';
 if(n.type==='INSTANCE'){const main=await n.getMainComponentAsync();if(main&&map[main.id])swaps.push({instance:n.id,component:map[main.id]});}
}}
for(const s of swaps.reverse()){const n=await figma.getNodeByIdAsync(s.instance);if(n)n.swapComponent(await figma.getNodeByIdAsync(s.component));}
const liveCreated=roots.flatMap(n=>[n.id,...n.findAll(()=>true).map(c=>c.id)]);
const poster=roots.find(n=>n.name==='Pioneer v3 / Workspace Poster');return {createdNodeIds:liveCreated,mutatedNodeIds:liveCreated,componentMap:map,components:roots.map(n=>({id:n.id,name:n.name,variants:n.children.length,width:n.width,height:n.height,y:n.y})),bindings,posterChildren:poster.children[0].children.map(n=>({id:n.id,name:n.name,type:n.type,width:n.width,height:n.height,layoutMode:n.layoutMode,children:'children'in n?n.children.map(c=>({id:c.id,name:c.name,type:c.type,width:c.width,height:c.height})):[]}))};


