
const F={"colors":{"color/canvas":"VariableID:716:1613","color/surface":"VariableID:716:1614","color/surface-muted":"VariableID:716:1615","color/text-primary":"VariableID:716:1616","color/text-secondary":"VariableID:716:1617","color/text-on-action":"VariableID:716:1618","color/action":"VariableID:716:1619","color/action-hover":"VariableID:716:1620","color/border-subtle":"VariableID:716:1621","color/border-control":"VariableID:716:1622","color/focus":"VariableID:716:1623","color/notice-surface":"VariableID:716:1624","color/notice-border":"VariableID:716:1625","color/notice-text":"VariableID:716:1626","color/success-surface":"VariableID:716:1627","color/success-text":"VariableID:716:1628","color/error-surface":"VariableID:716:1629","color/error-text":"VariableID:716:1630","color/danger-action":"VariableID:716:1631","color/identity-slate":"VariableID:716:1632","color/identity-jade":"VariableID:716:1633","color/icon":"VariableID:716:1634","color/code-surface":"VariableID:716:1635","color/code-text":"VariableID:716:1636"},"dimensions":{"space/0":"VariableID:716:1637","space/4":"VariableID:716:1638","space/8":"VariableID:716:1639","space/12":"VariableID:716:1640","space/16":"VariableID:716:1641","space/24":"VariableID:716:1642","space/32":"VariableID:716:1643","space/48":"VariableID:716:1644","space/64":"VariableID:716:1645","radius/0":"VariableID:716:1646","radius/8":"VariableID:716:1647","radius/12":"VariableID:716:1648","radius/16":"VariableID:716:1649","stroke/1":"VariableID:716:1650","stroke/2":"VariableID:716:1651","type/12":"VariableID:716:1652","type/14":"VariableID:716:1653","type/15":"VariableID:716:1654","type/20":"VariableID:716:1655","type/24":"VariableID:716:1656","control/32":"VariableID:716:1657","control/36":"VariableID:716:1658","control/40":"VariableID:716:1659","control/48":"VariableID:716:1660"},"textStyles":{"Pioneer v2 / Heading/Large":"S:257c6c917d8fa2dde989032051b51b26f3c9a197,","Pioneer v2 / Heading/Medium":"S:5f654470ee0fa802090097da484862b9991ae33e,","Pioneer v2 / Body/Reading":"S:009108471da5abf19de0f60cac5d933e051e0b67,","Pioneer v2 / Body/Default":"S:2d0b0108f7903d2148b96ff53086cca00eaaa24a,","Pioneer v2 / UI/Label":"S:1bf61ddccb263e7fe2ba02396fb5ac0147d7f9a5,","Pioneer v2 / UI/Small":"S:1ef90af28ba27bff54c0e0f7b65c5c40917e9819,","Pioneer v2 / UI/Small Strong":"S:162f281c8522b6bd9b95f7172ec5385575cedc60,","Pioneer v2 / Code/Default":"S:c2b51bf8345deeaf843453037b01769be1b43769,","Pioneer v2 / Code/Small":"S:23fe9b0e29ac8c065b16eb54041a8e02d7410ebe,"},"effects":{"Pioneer v2 / Elevation / Flat":"S:43eabf74852819294e4c160b892848375d07c072,","Pioneer v2 / Elevation / Overlay":"S:6362f0e1103f41c9d20b804efecca4ce35cba08a,"}}, SPEC={"textStyles":[{"name":"Pioneer v2 / Heading/Large","family":"Noto Sans SC","style":"Bold","size":24,"lineHeight":32},{"name":"Pioneer v2 / Heading/Medium","family":"Noto Sans SC","style":"Medium","size":20,"lineHeight":28},{"name":"Pioneer v2 / Body/Reading","family":"Noto Sans SC","style":"Regular","size":15,"lineHeight":24},{"name":"Pioneer v2 / Body/Default","family":"Noto Sans SC","style":"Regular","size":14,"lineHeight":22},{"name":"Pioneer v2 / UI/Label","family":"Noto Sans SC","style":"Medium","size":14,"lineHeight":20},{"name":"Pioneer v2 / UI/Small","family":"Noto Sans SC","style":"Regular","size":12,"lineHeight":18},{"name":"Pioneer v2 / UI/Small Strong","family":"Noto Sans SC","style":"Medium","size":12,"lineHeight":18},{"name":"Pioneer v2 / Code/Default","family":"JetBrains Mono","style":"Regular","size":14,"lineHeight":22},{"name":"Pioneer v2 / Code/Small","family":"JetBrains Mono","style":"Regular","size":12,"lineHeight":20}]};
const ALLV=await figma.variables.getLocalVariablesAsync(); const VM=Object.fromEntries(ALLV.map(v=>[v.id,v]));
const V={}; for(const [k,id] of Object.entries({...F.colors,...F.dimensions})) V[k]=await figma.variables.getVariableByIdAsync(id);
for(const s of SPEC.textStyles) await figma.loadFontAsync({family:s.family,style:s.style});
function paint(k){if(!V[k])throw Error("Missing token "+k);let val=Object.values(V[k].valuesByMode)[0];while(val.type==="VARIABLE_ALIAS")val=Object.values(VM[val.id].valuesByMode)[0];return figma.variables.setBoundVariableForPaint({type:"SOLID",color:{r:val.r,g:val.g,b:val.b}},"color",V[k]);}
function dim(n,p,k){n.setBoundVariable(p,V[k]);}
function radius(n,x){for(const p of ["topLeftRadius","topRightRadius","bottomLeftRadius","bottomRightRadius"])dim(n,p,"radius/"+x);}
function box(n,{fill=null,stroke=null,pad=0,gap=0,r=0}={}){
n.fills=fill?[paint("color/"+fill)]:[]; n.strokes=stroke?[paint("color/"+stroke)]:[];radius(n,r);
if(stroke)dim(n,"strokeWeight","stroke/1");
if("layoutMode" in n&&n.layoutMode!=="NONE"){for(const p of ["paddingTop","paddingBottom","paddingLeft","paddingRight"])dim(n,p,"space/"+pad);dim(n,"itemSpacing","space/"+gap);}
return n;}
function frame(parent,name,dir="VERTICAL",w=400,opts={}){const n=figma.createAutoLayout(dir);n.name=name;box(n,opts);n.resize(w,10);parent.appendChild(n);n.layoutSizingHorizontal="FIXED";n.layoutSizingVertical="HUG";return n;}
async function txt(parent,name,content,style="Body/Default",color="text-primary",w=null){
const sid=F.textStyles["Pioneer v2 / "+style];if(!sid)throw Error("Missing text style "+style);
const n=figma.createText();n.name=name;n.fontName={family:"Noto Sans SC",style:"Regular"};await n.setTextStyleIdAsync(sid);n.characters=content;n.fills=[paint("color/"+color)];parent.appendChild(n);
if(w!==null){n.resize(w,1);n.textAutoResize="HEIGHT";n.layoutSizingHorizontal="FIXED";}else{n.textAutoResize="WIDTH_AND_HEIGHT";n.layoutSizingHorizontal="HUG";}n.layoutSizingVertical="HUG";return n;}
async function doc(name,desc,x,y,width=1200){
const n=frame(page,name,"VERTICAL",width,{fill:"surface",stroke:"border-subtle",pad:32,gap:24,r:16});n.x=x;n.y=y;
await txt(n,"Title",name,"Heading/Large");await txt(n,"Usage",desc,"Body/Reading","text-secondary",width-64);return n;}
function props(cs,defaults){const keys={};for(const [k,val]of Object.entries(defaults))keys[k]=cs.addComponentProperty(k,"TEXT",val);
for(const v of cs.children)for(const n of v.findAllWithCriteria({types:["TEXT"]}))if(keys[n.name])n.componentPropertyReferences={characters:keys[n.name]};return keys;}
function grid(cs,cols,cellWidth,gap=24){
const children=cs.children;const rows=Math.ceil(children.length/cols);let y=24;
for(let row=0;row<rows;row++){const group=children.slice(row*cols,(row+1)*cols);const h=Math.max(...group.map(n=>n.height));group.forEach((n,col)=>{n.x=24+col*(cellWidth+gap);n.y=y;});y+=h+gap;}
cs.resize(cols*cellWidth+(cols-1)*gap+48,y-gap+24);box(cs,{fill:"canvas",r:12});return cs;}
function allIds(n){return [n.id,...("findAll" in n?n.findAll(()=>true).map(x=>x.id):[])];}
function evidence(cs){return {id:cs.id,name:cs.name,variants:cs.children.map(v=>({id:v.id,name:v.name,width:v.width,height:v.height,autoLayout:v.layoutMode,fill:v.fills.map(f=>f.boundVariables?.color?.id),textStyles:v.findAllWithCriteria({types:["TEXT"]}).map(t=>({id:t.id,size:t.fontSize,style:t.textStyleId}))})),properties:cs.componentPropertyDefinitions};}

const CONTROL={"sets":[{"variants":[{"id":"720:1584","name":"Style=Primary, State=Default"},{"id":"720:1585","name":"Style=Primary, State=Hover"},{"id":"720:1586","name":"Style=Primary, State=Pressed"},{"id":"720:1587","name":"Style=Primary, State=Focus"},{"id":"720:1588","name":"Style=Primary, State=Disabled"},{"id":"720:1589","name":"Style=Primary, State=Loading"},{"id":"720:1590","name":"Style=Secondary, State=Default"},{"id":"720:1591","name":"Style=Secondary, State=Hover"},{"id":"720:1592","name":"Style=Secondary, State=Pressed"},{"id":"720:1593","name":"Style=Secondary, State=Focus"},{"id":"720:1594","name":"Style=Secondary, State=Disabled"},{"id":"720:1595","name":"Style=Secondary, State=Loading"},{"id":"720:1596","name":"Style=Quiet, State=Default"},{"id":"720:1597","name":"Style=Quiet, State=Hover"},{"id":"720:1598","name":"Style=Quiet, State=Pressed"},{"id":"720:1599","name":"Style=Quiet, State=Focus"},{"id":"720:1600","name":"Style=Quiet, State=Disabled"},{"id":"720:1601","name":"Style=Quiet, State=Loading"},{"id":"720:1602","name":"Style=Danger, State=Default"},{"id":"720:1603","name":"Style=Danger, State=Hover"},{"id":"720:1604","name":"Style=Danger, State=Pressed"},{"id":"720:1605","name":"Style=Danger, State=Focus"},{"id":"720:1606","name":"Style=Danger, State=Disabled"},{"id":"720:1607","name":"Style=Danger, State=Loading"}]}]}, CONTROLFIX={"props":{"Button":{"Label":"Label#720:0","DangerLabel":"Danger label#721:0"},"Field":{"Label":"Label#720:25","Value":"Value#720:31","Helper":"Helper#721:25","Disabled reason":"Disabled reason#721:31","Error message":"Error message#721:37","Progress message":"Progress message#721:43"}}};
async function button(parent,label,style="Secondary",state="Default",width=148){
const entry=CONTROL.sets[0].variants.find(v=>v.name==="Style="+style+", State="+state);const c=await figma.getNodeByIdAsync(entry.id);const i=c.createInstance();i.name="Action · "+label;parent.appendChild(i);i.resize(width,44);i.setProperties({[style==="Danger"?CONTROLFIX.props.Button.DangerLabel:CONTROLFIX.props.Button.Label]:label});return i;}

const CM={"Button":{"id":"720:1608","variants":[{"id":"720:1584","name":"Style=Primary, State=Default"},{"id":"720:1585","name":"Style=Primary, State=Hover"},{"id":"720:1586","name":"Style=Primary, State=Pressed"},{"id":"720:1587","name":"Style=Primary, State=Focus"},{"id":"720:1588","name":"Style=Primary, State=Disabled"},{"id":"720:1589","name":"Style=Primary, State=Loading"},{"id":"720:1590","name":"Style=Secondary, State=Default"},{"id":"720:1591","name":"Style=Secondary, State=Hover"},{"id":"720:1592","name":"Style=Secondary, State=Pressed"},{"id":"720:1593","name":"Style=Secondary, State=Focus"},{"id":"720:1594","name":"Style=Secondary, State=Disabled"},{"id":"720:1595","name":"Style=Secondary, State=Loading"},{"id":"720:1596","name":"Style=Quiet, State=Default"},{"id":"720:1597","name":"Style=Quiet, State=Hover"},{"id":"720:1598","name":"Style=Quiet, State=Pressed"},{"id":"720:1599","name":"Style=Quiet, State=Focus"},{"id":"720:1600","name":"Style=Quiet, State=Disabled"},{"id":"720:1601","name":"Style=Quiet, State=Loading"},{"id":"720:1602","name":"Style=Danger, State=Default"},{"id":"720:1603","name":"Style=Danger, State=Hover"},{"id":"720:1604","name":"Style=Danger, State=Pressed"},{"id":"720:1605","name":"Style=Danger, State=Focus"},{"id":"720:1606","name":"Style=Danger, State=Disabled"},{"id":"720:1607","name":"Style=Danger, State=Loading"}],"properties":{"Label#720:0":{"type":"TEXT","defaultValue":"保存到会话"},"Danger label#721:0":{"type":"TEXT","defaultValue":"删除会话"},"Style":{"type":"VARIANT","defaultValue":"Primary","variantOptions":["Primary","Secondary","Quiet","Danger"]},"State":{"type":"VARIANT","defaultValue":"Default","variantOptions":["Default","Hover","Pressed","Focus","Disabled","Loading"]}}},"Field":{"id":"720:1670","variants":[{"id":"720:1665","name":"State=Default"},{"id":"720:1666","name":"State=Focus"},{"id":"720:1667","name":"State=Disabled"},{"id":"720:1668","name":"State=Error"},{"id":"720:1669","name":"State=Loading"}],"properties":{"Label#720:25":{"type":"TEXT","defaultValue":"工作区名称"},"Value#720:31":{"type":"TEXT","defaultValue":"Pioneer"},"Helper#721:25":{"type":"TEXT","defaultValue":"仅修改本机显示名称"},"Disabled reason#721:31":{"type":"TEXT","defaultValue":"当前不可编辑：工作区不可访问"},"Error message#721:37":{"type":"TEXT","defaultValue":"名称不能为空，已保留当前输入"},"Progress message#721:43":{"type":"TEXT","defaultValue":"正在检查名称，请稍候"},"State":{"type":"VARIANT","defaultValue":"Default","variantOptions":["Default","Focus","Disabled","Error","Loading"]}}},"Status":{"id":"720:1700","variants":[{"id":"720:1694","name":"Tone=Neutral"},{"id":"720:1695","name":"Tone=Info"},{"id":"720:1696","name":"Tone=Wait"},{"id":"720:1697","name":"Tone=Success"},{"id":"720:1698","name":"Tone=Error"},{"id":"720:1699","name":"Tone=Unknown"}],"properties":{"Text#720:43":{"type":"TEXT","defaultValue":"仅保存在本机"},"Tone":{"type":"VARIANT","defaultValue":"Neutral","variantOptions":["Neutral","Info","Wait","Success","Error","Unknown"]}}},"Session Tab":{"id":"722:1591","variants":[{"id":"722:1587","name":"State=Active"},{"id":"722:1588","name":"State=Inactive"},{"id":"722:1589","name":"State=Hover"},{"id":"722:1590","name":"State=Focus"}],"properties":{"Title#722:0":{"type":"TEXT","defaultValue":"整理毕业项目"},"Workspace#722:5":{"type":"TEXT","defaultValue":"Pioneer · 本机记录"},"State":{"type":"VARIANT","defaultValue":"Active","variantOptions":["Active","Inactive","Hover","Focus"]}}},"Local Tab":{"id":"722:1619","variants":[{"id":"722:1615","name":"State=Active"},{"id":"722:1616","name":"State=Inactive"},{"id":"722:1617","name":"State=Focus"},{"id":"722:1618","name":"State=Disabled"}],"properties":{"Label#722:10":{"type":"TEXT","defaultValue":"预览"},"State":{"type":"VARIANT","defaultValue":"Active","variantOptions":["Active","Inactive","Focus","Disabled"]}}},"Workspace Poster":{"id":"722:1630","variants":[{"id":"722:1627","name":"State=Ready"},{"id":"722:1628","name":"State=Stale"},{"id":"722:1629","name":"State=Unavailable"}],"properties":{"Identifier#722:15":{"type":"TEXT","defaultValue":"P"},"Title#722:19":{"type":"TEXT","defaultValue":"Pioneer"},"Summary#722:23":{"type":"TEXT","defaultValue":"模块化 Agent 交互系统"},"Timestamp#722:27":{"type":"TEXT","defaultValue":"上次扫描：09:28"},"Path#722:31":{"type":"TEXT","defaultValue":"D:/Project/Pioneer"},"State":{"type":"VARIANT","defaultValue":"Ready","variantOptions":["Ready","Stale","Unavailable"]}}},"Panel Header":{"id":"722:1660","variants":[{"id":"722:1658","name":"State=Open"},{"id":"722:1659","name":"State=Compact"}],"properties":{"Title#722:35":{"type":"TEXT","defaultValue":"上下文"},"State":{"type":"VARIANT","defaultValue":"Open","variantOptions":["Open","Compact"]}}},"Session Row":{"id":"722:1675","variants":[{"id":"722:1672","name":"State=Open"},{"id":"722:1673","name":"State=Closed"},{"id":"722:1674","name":"State=Draft"}],"properties":{"Title#722:38":{"type":"TEXT","defaultValue":"整理毕业项目"},"Workspace#722:42":{"type":"TEXT","defaultValue":"Pioneer"},"Last active#722:46":{"type":"TEXT","defaultValue":"最近活动：今天 09:28"},"State":{"type":"VARIANT","defaultValue":"Open","variantOptions":["Open","Closed","Draft"]}}},"Context Row":{"id":"725:1580","variants":[{"id":"725:1577","name":"State=Attached"},{"id":"725:1578","name":"State=Stale"},{"id":"725:1579","name":"State=Unavailable"}],"properties":{"Title#725:0":{"type":"TEXT","defaultValue":"设计说明.md"},"Path#725:4":{"type":"TEXT","defaultValue":"docs/design/设计说明.md"},"State":{"type":"VARIANT","defaultValue":"Attached","variantOptions":["Attached","Stale","Unavailable"]}}},"Artifact Card":{"id":"725:1618","variants":[{"id":"725:1614","name":"State=Ready"},{"id":"725:1615","name":"State=Generating"},{"id":"725:1616","name":"State=Failed"},{"id":"725:1617","name":"State=Stale"}],"properties":{"Title#725:8":{"type":"TEXT","defaultValue":"结构梳理.md"},"Source#725:13":{"type":"TEXT","defaultValue":"来源：整理毕业项目 · task-example · v3"},"Path#725:18":{"type":"TEXT","defaultValue":"artifacts/结构梳理.md"},"State":{"type":"VARIANT","defaultValue":"Ready","variantOptions":["Ready","Generating","Failed","Stale"]}}},"Permission Card":{"id":"725:1678","variants":[{"id":"725:1674","name":"State=Awaiting"},{"id":"725:1675","name":"State=Denied"},{"id":"725:1676","name":"State=Expired"},{"id":"725:1677","name":"State=Approved"}],"properties":{"Operation#725:23":{"type":"TEXT","defaultValue":"对象：毕业项目的设计文档"},"Scope#725:28":{"type":"TEXT","defaultValue":"路径：D:/Project/Pioneer/docs\n权限：只读；不写入、不执行命令"},"Recipient#725:33":{"type":"TEXT","defaultValue":"接收方：本地示例运行器；不外发"},"Expiry#725:38":{"type":"TEXT","defaultValue":"时效：仅此一次；目标变更或超时即失效"},"State":{"type":"VARIANT","defaultValue":"Awaiting","variantOptions":["Awaiting","Denied","Expired","Approved"]}}},"Run Status":{"id":"725:1747","variants":[{"id":"725:1742","name":"State=Running"},{"id":"725:1743","name":"State=Stopping"},{"id":"725:1744","name":"State=Stopped"},{"id":"725:1745","name":"State=Unknown"},{"id":"725:1746","name":"State=Failed"}],"properties":{"Last event#725:43":{"type":"TEXT","defaultValue":"最后确认：task-example / event-12 / 09:28:12"},"State":{"type":"VARIANT","defaultValue":"Running","variantOptions":["Running","Stopping","Stopped","Unknown","Failed"]}}},"Validation":{"id":"725:1803","variants":[{"id":"725:1799","name":"State=Never"},{"id":"725:1800","name":"State=Running"},{"id":"725:1801","name":"State=Passed"},{"id":"725:1802","name":"State=Failed"}],"properties":{"Target#725:49":{"type":"TEXT","defaultValue":"目标：结构梳理.md · v3"},"Method#725:54":{"type":"TEXT","defaultValue":"步骤：检查路径引用与章节完整性"},"State":{"type":"VARIANT","defaultValue":"Never","variantOptions":["Never","Running","Passed","Failed"]}}},"Composer":{"id":"725:1854","variants":[{"id":"725:1847","name":"State=LocalEmpty"},{"id":"725:1848","name":"State=LocalDraft"},{"id":"725:1849","name":"State=Saving"},{"id":"725:1850","name":"State=Saved"},{"id":"725:1851","name":"State=Error"},{"id":"725:1852","name":"State=RemoteReady"},{"id":"725:1853","name":"State=Running"}],"properties":{"Draft#727:0":{"type":"TEXT","defaultValue":"请梳理毕业项目的文档结构，先说明你的理解。"},"Placeholder#727:8":{"type":"TEXT","defaultValue":"写下当前想整理的内容…"},"State":{"type":"VARIANT","defaultValue":"LocalEmpty","variantOptions":["LocalEmpty","LocalDraft","Saving","Saved","Error","RemoteReady","Running"]}}}};
async function inst(name,state,parent,width,overrides={}){
const spec=CM[name];if(!spec)throw Error("Missing family "+name);
const v=spec.variants.find(v=>v.name==="State="+state||v.name==="Tone="+state);
if(!v)throw Error("Missing variant "+name+"/"+state);const master=await figma.getNodeByIdAsync(v.id);const i=master.createInstance();i.name=name+" · "+state;parent.appendChild(i);
if(width){i.resize(width,i.height);i.layoutSizingHorizontal="FIXED";}
const p={};for(const[k,val]of Object.entries(overrides)){const key=name==="Status"&&k==="Text"?{"Neutral":"Text#720:43","Info":"Info text#749:0","Wait":"Wait text#749:7","Success":"Success text#749:14","Error":"Error text#749:21","Unknown":"Unknown text#749:28"}[state]:Object.keys(spec.properties).find(x=>x.startsWith(k+"#"));if(!key)throw Error("Missing prop "+name+" "+k);p[key]=val;}if(Object.keys(p).length)i.setProperties(p);return i;
}
function spacer(parent){const n=frame(parent,"Flexible space","HORIZONTAL",8,{});n.resize(8,8);n.layoutSizingHorizontal="FILL";return n;}
async function globalNav(root,w,active="session"){
const row=frame(root,"Global session navigation","HORIZONTAL",w,{fill:"surface",pad:8,gap:8});row.resize(w,64);row.layoutSizingVertical="FIXED";row.counterAxisAlignItems="CENTER";
await txt(row,"App name","Pioneer","UI/Label","text-primary",80);
await button(row,"工作区库",active==="library"?"Secondary":"Quiet","Default",100);
await inst("Session Tab",active==="session"?"Active":"Inactive",row,244);
await inst("Session Tab","Inactive",row,220,{Title:"整理阅读笔记",Workspace:"阅读集 · 本机记录"});
await button(row,"新会话","Quiet","Default",92);spacer(row);await button(row,"全部会话","Quiet","Default",100);await button(row,"设置",active==="settings"?"Secondary":"Quiet","Default",72);return row;
}
async function screen(group,id,title,w=1440,h=900){
const wrapper=frame(group,id+" · "+title,"VERTICAL",w,{gap:12});
await txt(wrapper,"Screen specification",id+" · "+title+" · v2设计稿（非应用截图）","UI/Label","text-primary",w);
const root=frame(wrapper,id+" / Window","VERTICAL",w,{fill:"canvas",stroke:"border-subtle",r:12});root.resize(w,h);root.layoutSizingVertical="FIXED";root.clipsContent=true;
return {wrapper,root,id,w,h};
}
async function footer(root,w){const f=frame(root,"Local boundary","HORIZONTAL",w,{fill:"surface",pad:8});f.resize(w,32);f.layoutSizingVertical="FIXED";await txt(f,"Local truth","仅保存到本机 · 未发送给模型 · 运行器尚未接入","UI/Small","text-secondary",w-16);}
async function group(id,title,description,x,y){
const g=frame(page,id+" · "+title,"VERTICAL",3040,{gap:24});g.x=x;g.y=y;await txt(g,"Section heading",id+"  "+title,"Heading/Large");await txt(g,"Section boundary",description,"Body/Reading","text-secondary",1400);
const row=frame(g,"Screen row","HORIZONTAL",3040,{gap:160});return {g,row};
}



async function sessionToolbar(root,w,mode="专注布局"){
const bar=frame(root,"Session toolbar","HORIZONTAL",w,{fill:"surface",pad:16,gap:12});bar.resize(w,72);bar.layoutSizingVertical="FIXED";bar.counterAxisAlignItems="CENTER";
const id=frame(bar,"Session identity","VERTICAL",400,{gap:4});await txt(id,"Session title","整理毕业项目","Heading/Medium");await txt(id,"Workspace identity","Pioneer · 本机会话","UI/Small","text-secondary");spacer(bar);
await button(bar,mode,"Secondary","Default",124);await button(bar,"面板与布局","Quiet","Default",132);return bar;}
async function banner(parent,message,w,tone="notice-surface",ink="notice-text"){
const n=frame(parent,"Boundary · "+message,"VERTICAL",w,{fill:tone,pad:12,r:8});await txt(n,"Boundary text",message,"Body/Default",ink,w-24);return n;}
async function panel(parent,title,w){
const n=frame(parent,title+" panel","VERTICAL",w,{fill:"surface",stroke:"border-subtle",r:12});n.layoutSizingVertical="FILL";await inst("Panel Header","Open",n,w,{Title:title});return n;}
function resizeHandle(parent){const n=frame(parent,"Resize handle · 24px hit area","VERTICAL",24,{});n.layoutSizingVertical="FILL";n.counterAxisAlignItems="CENTER";const line=figma.createRectangle();line.name="Visual separator · 1px";line.resize(1,100);line.fills=[paint("color/icon")];n.appendChild(line);line.layoutSizingVertical="FILL";return n;}
async function conversation(parent,w,state="LocalDraft"){
const inner=frame(parent,"Local conversation","VERTICAL",w,{pad:16,gap:16});inner.layoutSizingVertical="FILL";
const timeline=frame(inner,"Local history","VERTICAL",w-32,{gap:12});timeline.layoutSizingVertical="FILL";await txt(timeline,"Record origin","你的本机记录","UI/Small","text-secondary");await txt(timeline,"Record body","先整理需求，再决定下一步。当前不会调用模型或执行工作区操作。","Body/Reading","text-primary",w-32);
await inst("Composer",state,inner,w-32);return inner;}
function screenEvidence(s){const over=[];for(const n of s.root.findAll(()=>true)){if(!n.visible||!n.parent.visible||!("width" in n))continue;const p=n.parent;if(n.x< -2||n.y< -2||n.x+n.width>p.width+2||n.y+n.height>p.height+2)over.push({id:n.id,name:n.name,box:[n.x,n.y,n.width,n.height],parentBox:[p.width,p.height]});}
return {screenId:s.id,nodeId:s.root.id,wrapperId:s.wrapper.id,width:s.w,height:s.h,potentialOverflows:over};}

async function futureShell(s,mode){
await globalNav(s.root,s.w);
const t=await sessionToolbar(s.root,s.w,mode);const label=t.findOne(n=>n.type==="TEXT"&&n.name==="Workspace identity");label.characters="Pioneer · M3/M4设计示例";
await banner(s.root,"设计示例 · 运行器尚未接入 · 以下内容为手工示例，不代表真实执行，也不具授权效力。",s.w);
}
async function futureFooter(root,w){const f=frame(root,"Future boundary footer","HORIZONTAL",w,{fill:"surface",pad:8});f.resize(w,32);f.layoutSizingVertical="FIXED";await txt(f,"Not a running task","未来能力示例 · 任务/文件/事件均为示例 · 发布、外发和写入仍需独立批准","UI/Small","text-secondary",w-16);}
async function futureConversation(parent,w){const inner=frame(parent,"Future conversation","VERTICAL",w,{pad:16,gap:16});inner.layoutSizingVertical="FILL";const timeline=frame(inner,"Example user context","VERTICAL",w-32,{gap:12});timeline.layoutSizingVertical="FILL";await txt(timeline,"Example origin","用户目标 · 设计示例","UI/Small","text-secondary");await txt(timeline,"Example intent","整理文档结构，先核对范围，再审阅结果。不要改写未经批准的文件。","Body/Reading","text-primary",w-32);await inst("Composer","RemoteReady",inner,w-32);return inner;}


const page=await figma.getNodeByIdAsync("757:1574");await figma.setCurrentPageAsync(page);if(page.children.length)throw Error("Responsive page already populated");

const screens=[],groups=[];
async function compactNav(root,w){
const row=frame(root,"Compact global session navigation","HORIZONTAL",w,{fill:"surface",pad:8,gap:8});row.resize(w,64);row.layoutSizingVertical="FIXED";row.counterAxisAlignItems="CENTER";
await txt(row,"App name","Pioneer","UI/Label","text-primary",56);
await button(row,"工作区库","Quiet","Default",76);
await inst("Session Tab","Active",row,w-396,{Title:"整理毕业项目"});
await button(row,"新会话","Quiet","Default",64);
await button(row,"全部会话","Quiet","Default",88);
await button(row,"设置","Quiet","Default",56);}
async function responsiveToolbar(root,w){
const bar=frame(root,"Responsive session toolbar","HORIZONTAL",w,{fill:"surface",pad:16,gap:12});bar.resize(w,72);bar.layoutSizingVertical="FIXED";bar.counterAxisAlignItems="CENTER";
const title=frame(bar,"Session identity","VERTICAL",w-264,{gap:4});
await txt(title,"Session title","整理毕业项目","Heading/Medium","text-primary",w-264);
await txt(title,"Workspace identity","Pioneer · 本机记录","UI/Small","text-secondary",w-264);
await button(bar,"展开面板","Secondary","Default",112);await button(bar,"布局","Quiet","Default",96);}
async function rg(title,x,y,w){const b=frame(page,title,"VERTICAL",w,{gap:24});b.x=x;b.y=y;await txt(b,"Responsive group",title,"Heading/Large","text-primary",w);groups.push(b);return frame(b,"Sample row","HORIZONTAL",w,{gap:160});}
async function localFocus(s,state,notice){
if(s.w>=1001)await globalNav(s.root,s.w);else await compactNav(s.root,s.w);
await responsiveToolbar(s.root,s.w);
const body=frame(s.root,"Responsive focus content","VERTICAL",s.w,{pad:16,gap:16});body.layoutSizingVertical="FILL";body.counterAxisAlignItems="CENTER";
const w=Math.min(840,s.w-32);const history=frame(body,"Independently scrollable history","VERTICAL",w,{gap:12});history.layoutSizingVertical="FILL";
await txt(history,"Local record origin","你的本机记录","UI/Small","text-secondary",w);
await txt(history,"Local record content",notice,"Body/Reading","text-primary",w);
await inst("Composer",state,body,w);
await footer(s.root,s.w);
screens.push(s);}
async function note(s,content){await txt(s.wrapper,"Breakpoint and focus contract",content,"Body/Default","text-secondary",s.w);}

const a=await rg("V · 宽度与分栏",200,200,2340);
const s1=await screen(a,"V01","1280×800 · 审阅空态",1280,800);
await globalNav(s1.root,s1.w);await sessionToolbar(s1.root,s1.w,"审阅布局");
const content=frame(s1.root,"Read-only review layout","HORIZONTAL",1280,{pad:16});content.layoutSizingVertical="FILL";
const left=await panel(content,"改动",724);const empty=frame(left,"No real diff","VERTICAL",724,{pad:24,gap:16});empty.layoutSizingVertical="FILL";
const tabs=frame(empty,"Local artifact tabs","HORIZONTAL",676,{gap:8});await inst("Local Tab","Active",tabs,120,{Label:"改动"});await inst("Local Tab","Disabled",tabs,120,{Label:"验收记录"});
await txt(empty,"No changes title","当前没有改动","Heading/Medium","text-primary",676);
await txt(empty,"No changes explanation","运行器尚未接入。这里不会填充示例 Diff 或通过记录。","Body/Reading","text-secondary",676);
await button(empty,"返回会话","Secondary","Default",148);
resizeHandle(content);const right=await panel(content,"会话",500);await conversation(right,500,"LocalDraft");await footer(s1.root,1280);screens.push(s1);
await note(s1,"1280×800：724/500px 双栏 + 24px 手柄；键盘可调整比例。焦点顺序为全局 → 工具栏 → 改动 → 会话输入。未接运行器的验收禁用并说明原因。");
const s2=await screen(a,"V02","900×700 · 工具暂收",900,700);
await localFocus(s2,"LocalDraft","继续梳理文档。上下文面板已临时收起，原布局仍保留。");await note(s2,"900px：收纳额外标签与工具，全部会话/展开面板仍可达；关闭临时面板后焦点回展开按钮，不永久改写布局。");
const b=await rg("V · 最窄与短窗口",200,1320,2080);
const s3=await screen(b,"V03","640×720 · 单列专注",640,720);
await localFocus(s3,"LocalDraft","先整理需求，再决定下一步。当前输入只保存在本机。");await note(s3,"640px：保留完整活动标签、工作区库、新会话、全部会话、设置。输入列608px；主操作与本机边界不裁切。");
const s4=await screen(b,"V04","1280×560 · 保存失败",1280,560);
await localFocus(s4,"Error","未保存的内容仍在输入区。先重试保存，或复制草稿后再离开。");await note(s4,"短窗口560px：错误与重试仍可见；历史区独立滚动，输入不浮盖内容。审批长内容须独立滚动且取消/批准固定在审批区，运行时另测。");
const c=await rg("V · 759 / 760 临界",200,2410,1679);
for(const [id,w]of [["V05",759],["V06",760]]){
const s=await screen(c,id,w+"×720 · 单列保底",w,720);
await localFocus(s,"Saved","窗口变化只影响当前可见布局。草稿、会话和已保存布局不变。");
await note(s,w===759?"759px：使用单列保底。展开面板进入临时视图，Esc/关闭回到会话并恢复触发器焦点。":"760px：不是强制双栏开关；扣除边距/命中区后若不足主栏360+侧栏320，仍保持单列。入口、焦点与保存布局不变。");
}
const audits=screens.map(screenEvidence);
for(const s of screens)await s.root.screenshot();
return {pageId:page.id,createdNodeIds:groups.flatMap(allIds),groups:groups.map(g=>({id:g.id,name:g.name,x:g.x,y:g.y,width:g.width,height:g.height})),screens:audits};

