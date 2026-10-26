// Safe-retry foundations builder. Existing v2 pages/variables are never mutated.
const spec=__SPEC__;
const created=[],mutated=[];
const newNames=['design-system · v3','assets · Hazel v3','components · v3','main · v3'];
const pages={};for(const name of newNames){let p=figma.root.children.find(p=>p.name===name);if(!p){p=figma.createPage();p.name=name;created.push(p.id);}pages[name]=p;}
await figma.setCurrentPageAsync(pages[newNames[0]]);
const hex=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255,a:1});
const allColl=await figma.variables.getLocalVariableCollectionsAsync();const allVar=await figma.variables.getLocalVariablesAsync();
function coll(name){let c=allColl.find(c=>c.name===name);if(!c){c=figma.variables.createVariableCollection(name);c.renameMode(c.modes[0].modeId,'Light');allColl.push(c);}return c;}
const prim=coll('Pioneer v3 / Primitives'),colors=coll('Pioneer v3 / Color'),geo=coll('Pioneer v3 / Geometry');const vars={};
function variable(c,name,type,value,scopes,css){let v=allVar.find(v=>v.variableCollectionId===c.id&&v.name===name);if(!v){v=figma.variables.createVariable(name,c,type);allVar.push(v);}v.scopes=scopes;v.setValueForMode(c.modes[0].modeId,value);v.setVariableCodeSyntax('WEB','var('+css+')');vars[(c===prim?'primitive/':'')+name]=v;return v;}
for(const [key,value] of Object.entries(spec.palette))variable(prim,'color/'+key,'COLOR',hex(value),[],'--pioneer-palette-'+key);
for(const num of [...new Set(spec.dimensions.map(d=>d.value))])variable(prim,'number/'+num,'FLOAT',num,[],'--pioneer-number-'+num);
for(const c of spec.colors)variable(colors,c.name,'COLOR',figma.variables.createVariableAlias(vars['primitive/'+c.primitive]),c.scopes,c.css);
for(const d of spec.dimensions)variable(geo,d.name,'FLOAT',figma.variables.createVariableAlias(vars['primitive/number/'+d.value]),[d.scope],d.css);
const oldStyles=await figma.getLocalTextStylesAsync();const styles={};
for(const s of spec.textStyles){const f={family:s.family,style:s.style};await figma.loadFontAsync(f);let st=oldStyles.find(x=>x.name===s.name);if(!st){st=figma.createTextStyle();st.name=s.name;}st.fontName=f;st.fontSize=s.size;st.lineHeight={unit:'PIXELS',value:s.lineHeight};styles[s.name.split(' / ')[1]]=st;}
const paint=name=>figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',vars[name]);
const assignments=new Map();const ids=[];function add(n){ids.push(n.id);return n;}
function box(name,w=1440){const n=add(figma.createAutoLayout());n.name=name;n.layoutMode='VERTICAL';n.primaryAxisSizingMode='AUTO';n.counterAxisSizingMode='FIXED';n.resize(w,100);n.paddingTop=n.paddingBottom=n.paddingLeft=n.paddingRight=32;n.itemSpacing=24;n.fills=[paint('color/surface')];n.setBoundVariable('itemSpacing',vars['space/24']);return n;}
function text(str,style='Body/Default',w=1376,color='color/text-primary'){const t=add(figma.createText());t.name=str.slice(0,40);t.fontName=styles[style].fontName;t.characters=str;t.fontSize=styles[style].fontSize;t.lineHeight=styles[style].lineHeight;assignments.set(t.id,styles[style].id);t.fills=[paint(color)];t.resize(w,24);t.textAutoResize='HEIGHT';return t;}
// Await style assignment in bulk below; all font families were awaited above.
if(!figma.currentPage.children.some(n=>n.name==='Hazel × Claude / Quiet companion')){
 let y=100;
 const blocks=[];
 const make=(name,title,body)=>{const b=box(name);b.appendChild(text(title,'Display/Welcome'));b.appendChild(text(body,'Body/Reading'));b.x=100;b.y=y;blocks.push(b);y+=b.height+40;return b;};
 make('Hazel × Claude / Quiet companion','Pioneer · 安静的工作台','Hazel × Claude · v3 / 应用设计\n银灰与制服藏蓝建立身份，暖白与阅读排版提供安静。角色装饰只出现在进入、空态与关于。\n规范与原生组件可编辑；旧v2完整保留。真实执行、权限与保存状态不因换皮改变。');
 const c=make('Color / Roles','颜色有角色，不抢内容','画布与正文默认安静。薄荷是身份或有文字的成功底，香槟只点缀，莓红只作配饰。不可拿装饰符号替代批准、连接或完成。');
 const grid=add(figma.createAutoLayout());grid.name='Semantic palette';grid.layoutMode='HORIZONTAL';grid.layoutWrap='WRAP';grid.resize(1376,100);grid.primaryAxisSizingMode='FIXED';grid.counterAxisSizingMode='AUTO';grid.itemSpacing=16;grid.counterAxisSpacing=16;grid.fills=[];c.appendChild(grid);
 for(const name of ['canvas','surface','surface-muted','ink','secondary','navy','silver','control-border','mint','gold','berry','rose']){const cell=box('Palette '+name,208);cell.paddingTop=cell.paddingBottom=cell.paddingLeft=cell.paddingRight=12;cell.itemSpacing=8;const sw=add(figma.createRectangle());sw.name='Swatch';sw.resize(184,48);sw.cornerRadius=8;sw.fills=[paint('primitive/color/'+name)];cell.appendChild(sw);cell.appendChild(text(name+'  '+spec.palette[name],'UI/Small',184));grid.appendChild(cell);}
 // Reset final y after content-driven heights, avoiding overlap.
 const typo=make('Typography / Read first','用字体区分阅读与操作','Serif只用于欢迎、工作区与设置页主标题。按钮、权限、日志和长对话坚持清晰的Sans与Mono。Windows未内置Noto时保留明确本地回退，不运行时下载字体。');
 for(const s of spec.textStyles){const key=s.name.split(' / ')[1];typo.appendChild(text(key+'  '+s.size+'/'+s.lineHeight+'  从一个具体任务开始',key));}
 make('Decoration / Budget','让灰泽满陪着，不挡着','品牌标记20px；欢迎插画88px，窄屏64px；关于配饰48px；一屏至多一张插画。\n活跃任务正文：0张立绘、0层纹理、0个水印。文字安全距24px。错误与审批没有卖萌文案。\n不复制Viridis的针织底、花束或标本标签；不用常驻角色侧栏、格纹工作底、满屏星光。');
 make('Components / Contract','功能不因换皮改变','延续14个组件家族及原有业务/交互状态。颜色、几何与文字样式迁移到独立v3变量；旧变量与原型不改值。\n只读扫描、本机保存、未连接、未知结果、取消与返回焦点必须持续可见。现有v2状态矩阵仍是行为参考，而非v3运行时证明。');
 make('Delivery / Evidence','设计与运行，各自拿证据','交付：3层变量、11种文字样式、14组件家族、6项素材、12份用户图溯源、应用关键屏与真实Electron截图。\n以tokens.json / DESIGN-SYSTEM.md为工程入口。Figma屏幕与变量不是Electron行为证据；未发布团队库与Code Connect。');
 y=100;for(const b of blocks){b.y=y;y+=b.height+40;}
}
// Set styles deterministically with awaited API calls (including newly created text).
for(const t of figma.currentPage.findAllWithCriteria({types:['TEXT']})){const id=assignments.get(t.id);if(id)await t.setTextStyleIdAsync(id);}
return {createdNodeIds:[...created,...ids],mutatedNodeIds:mutated,pages:Object.fromEntries(Object.entries(pages).map(([k,p])=>[k,p.id])),collections:[prim,colors,geo].map(c=>({id:c.id,name:c.name,count:c.variableIds.length})),variables:Object.fromEntries(Object.entries(vars).map(([k,v])=>[k,v.id])),styles:Object.fromEntries(Object.entries(styles).map(([k,v])=>[k,v.id])),frames:figma.currentPage.children.map(n=>({id:n.id,name:n.name,width:n.width,height:n.height}))};


