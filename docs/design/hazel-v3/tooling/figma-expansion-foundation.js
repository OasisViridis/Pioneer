const state = __STATE__;
const p = await figma.getNodeByIdAsync('824:1276');
await figma.setCurrentPageAsync(p);
const created = [],
  mutated = [];
const V = {},
  S = {};
await Promise.all(
  Object.entries(state.variables).map(async ([k, id]) => {
    V[k] = await figma.variables.getVariableByIdAsync(id);
  }),
);
await Promise.all(
  Object.entries(state.styles).map(async ([k, id]) => {
    S[k] = await figma.getStyleByIdAsync(id);
    await figma.loadFontAsync(S[k].fontName);
  }),
);
const paint = (k) =>
  figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
    'color',
    V[k],
  );
const add = (n) => (created.push(n.id), n);
function box(name, w, dir = 'VERTICAL', gap = 24) {
  const n = add(figma.createAutoLayout(dir));
  n.name = name;
  n.resize(w, 100);
  n.primaryAxisSizingMode = dir === 'VERTICAL' ? 'AUTO' : 'FIXED';
  n.counterAxisSizingMode = dir === 'VERTICAL' ? 'FIXED' : 'AUTO';
  n.fills = [];
  n.setBoundVariable('itemSpacing', V['space/' + gap]);
  return n;
}
async function txt(parent, value, w, style = 'Body/Default') {
  const t = add(figma.createText());
  t.fontName = S[style].fontName;
  t.characters = value;
  await t.setTextStyleIdAsync(S[style].id);
  t.fills = [paint('color/text-primary')];
  parent.appendChild(t);
  t.resize(w, t.height);
  t.textAutoResize = 'HEIGHT';
  return t;
}
const existing = p.children.find((n) => n.name === 'Greendou / Usage v3.1');
if (existing) return { existing: true, id: existing.id };
const b = box('Greendou / Usage v3.1', 1440);
b.x = 100;
b.y = 2252;
b.fills = [paint('color/surface')];
for (const key of [
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
])
  b.setBoundVariable(key, V['space/32']);
await txt(b, '绿冻扩展 · 素材增加，预算不增加', 1376, 'Heading/Large');
await txt(
  b,
  '固定身份：两只圆兔耳、扇边薄荷果冻、藏蓝眼睛、奶油与单颗樱桃。保持柔和水粉笔触；不加表情包边框、状态徽章或背景纹理。',
  1376,
);
const row = box('Scene choices', 1376, 'HORIZONTAL', 16);
b.appendChild(row);
for (const [id, label, meaning] of [
  ['856:1280', '整理', 'L00 工作区空态'],
  ['856:1284', '陪伴', 'W01 新会话／R02 中屏'],
  ['856:1276', '阅读', 'W02 审阅尚无内容'],
]) {
  const cell = box(label, 448, 'HORIZONTAL', 24);
  row.appendChild(cell);
  const c = await figma.getNodeByIdAsync(id);
  const inst = add(c.createInstance());
  cell.appendChild(inst);
  created.push(...inst.findAll(() => true).map((n) => n.id));
  const copy = box('Use copy', 336, 'VERTICAL', 8);
  cell.appendChild(copy);
  await txt(copy, label, 336, 'UI/Card Title');
  await txt(copy, meaning, 336);
  await txt(copy, '空态语境，不代表 AI 行为', 336, 'UI/Small');
}
await txt(
  b,
  '欢迎图 88px，窄屏 64px；正文安全距 24px，一屏最多一张。会话容器 <380px 隐藏；已有消息、运行、权限、错误、未知与验收不显示角色。配饰仅在关于／来源类样例任选一件 48px，不新增应用页面或交互。',
  1376,
);
await txt(
  b,
  '6 项新透明 PNG + 原有 6 项素材 = 12 项输出。新增 2 装饰家族 / 9 变体，不计入原有 14 功能家族。生成工具：内置 image_gen；原图不进入 ZIP，不声称官方或商用授权。',
  1376,
  'UI/Small',
);
const delivery = await figma.getNodeByIdAsync('824:1443');
for (const seg of delivery.getStyledTextSegments(['fontName']))
  await figma.loadFontAsync(seg.fontName);
delivery.characters =
  '交付：3层变量、11种文字样式、14功能组件家族（另2装饰家族）、12项素材、12份用户图溯源、7张关键屏。\n2026-10-01插画扩展为可编辑静态设计；原有Electron证据仍以2026-09-30工程门禁为准。未新增运行时姿态切换、关于页或团队库。';
mutated.push(delivery.id);
return {
  createdNodeIds: created,
  mutatedNodeIds: mutated,
  board: { id: b.id, w: b.width, h: b.height },
  delivery: { id: delivery.id, characters: delivery.characters },
};
