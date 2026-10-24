// Historical composition. Requires current external state; do not run as a reset.
const state = __STATE__,
  uploads = __UPLOADS__;
const page = await figma.getNodeByIdAsync('824:1277');
await figma.setCurrentPageAsync(page);
const existing = page.children.find(
  (n) => n.name === 'Greendou / Expansion v3.1',
);
if (existing) return { existing: true, id: existing.id };
const created = [],
  mutated = [],
  removed = [],
  components = {};
const V = {};
await Promise.all(
  Object.entries(state.variables).map(async ([k, id]) => {
    V[k] = await figma.variables.getVariableByIdAsync(id);
  }),
);
const S = {};
await Promise.all(
  Object.entries(state.styles).map(async ([k, id]) => {
    S[k] = await figma.getStyleByIdAsync(id);
    await figma.loadFontAsync(S[k].fontName);
  }),
);
const add = (n) => (created.push(n.id), n);
const paint = (k) =>
  figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
    'color',
    V[k],
  );
function box(name, w, dir = 'VERTICAL', gap = 24) {
  const n = add(figma.createAutoLayout(dir));
  n.name = name;
  n.resize(w, 100);
  n.primaryAxisSizingMode = dir === 'VERTICAL' ? 'AUTO' : 'FIXED';
  n.counterAxisSizingMode = dir === 'VERTICAL' ? 'FIXED' : 'AUTO';
  n.setBoundVariable('itemSpacing', V['space/' + gap]);
  n.fills = [];
  n.clipsContent = false;
  return n;
}
async function text(
  parent,
  value,
  w,
  style = 'Body/Default',
  color = 'color/text-primary',
) {
  const t = add(figma.createText());
  t.fontName = S[style].fontName;
  t.characters = value;
  await t.setTextStyleIdAsync(S[style].id);
  t.fills = [paint(color)];
  parent.appendChild(t);
  t.resize(w, t.height);
  t.textAutoResize = 'HEIGHT';
  return t;
}
function padding(n, size) {
  for (const key of [
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
  ])
    n.setBoundVariable(key, V['space/' + size]);
}
const hash = Object.fromEntries(
  uploads.map((u) => [u.file, u.response.imageHash]),
);
function master(file, size, name) {
  const c = add(figma.createComponent());
  c.name = name;
  c.resize(size, size);
  c.layoutMode = 'HORIZONTAL';
  c.primaryAxisSizingMode = 'FIXED';
  c.counterAxisSizingMode = 'FIXED';
  c.fills = [];
  c.clipsContent = false;
  c.description =
    'Decorative only; not status, approval, task execution or a control. One per view. ' +
    file;
  const r = add(figma.createRectangle());
  r.name = 'Illustration / ' + file;
  r.resize(size, size);
  r.fills = [{ type: 'IMAGE', imageHash: hash[file], scaleMode: 'FIT' }];
  c.appendChild(r);
  return c;
}
const poses = [
  ['Reading', 'greendou-reading.png', '阅读', '新会话欢迎；不是 AI 正在阅读'],
  [
    'Organizing',
    'greendou-organizing.png',
    '整理',
    '工作区入口；不是已整理文件',
  ],
  [
    'Listening',
    'greendou-listening.png',
    '陪伴',
    '专注欢迎；不表示音频或在线状态',
  ],
];
const poseComps = [];
for (const [pose, file] of poses) {
  for (const size of [88, 64]) {
    const c = master(file, size, 'Pose=' + pose + ', Size=' + size);
    poseComps.push(c);
    components[pose + '/' + size] = c.id;
  }
}
const set = add(figma.combineAsVariants(poseComps, page));
set.name = 'Pioneer v3 / Greendou Companion';
set.layoutMode = 'VERTICAL';
set.resize(136, 100);
set.primaryAxisSizingMode = 'AUTO';
set.counterAxisSizingMode = 'FIXED';
set.fills = [];
padding(set, 24);
set.setBoundVariable('itemSpacing', V['space/16']);
set.x = 1700;
set.y = 1850;
set.description =
  '3 poses × 2 sizes; static empty-state context, never bound to task status. Remove after first message; hide in conversation containers below 380px.';
const motifs = [
  ['Bookmark', 'cherry-bookmark.png', '樱桃书签', '阅读文化配饰，不是收藏控件'],
  [
    'Butterfly',
    'paper-butterfly.png',
    '纸蝶',
    '来源／关于配饰，不是发送或成功',
  ],
  [
    'Charm',
    'jelly-ribbon-charm.png',
    '制服果冻挂饰',
    '身份配饰，不是验证或批准徽章',
  ],
];
const motifComps = [];
for (const [motif, file] of motifs) {
  const c = master(file, 48, 'Motif=' + motif + ', Size=48');
  motifComps.push(c);
  components[motif + '/48'] = c.id;
}
const motifSet = add(figma.combineAsVariants(motifComps, page));
motifSet.name = 'Pioneer v3 / Hazel Accessory';
motifSet.layoutMode = 'VERTICAL';
motifSet.resize(96, 100);
motifSet.primaryAxisSizingMode = 'AUTO';
motifSet.counterAxisSizingMode = 'FIXED';
motifSet.fills = [];
padding(motifSet, 24);
motifSet.setBoundVariable('itemSpacing', V['space/24']);
motifSet.x = 1920;
motifSet.y = 1850;
motifSet.description =
  'One 48px optional accessory in About/source patterns. Not implemented as a new product page. No interactions; not functional icons.';
const board = box('Greendou / Expansion v3.1', 1440);
board.x = 100;
board.y = 1840;
padding(board, 32);
board.fills = [paint('color/surface')];
await text(board, '绿冻 · 安静的三种姿态', 1376, 'Display/Welcome');
await text(
  board,
  '2026-10-01 · 6 张新透明 PNG。保留兔耳、樱桃与柔和笔触，只换姿态和小道具。插画表达陪伴，不表达执行。新增素材不增加应用装饰预算。',
  1376,
  'Body/Reading',
);
const poseRow = box(
  'Pose specimens / not application view',
  1376,
  'HORIZONTAL',
  16,
);
board.appendChild(poseRow);
for (const [pose, file, label, meaning] of poses) {
  const cell = box(label, 448, 'VERTICAL', 12);
  poseRow.appendChild(cell);
  await text(cell, label, 448, 'UI/Card Title');
  const row = box('88px + 64px specimens', 448, 'HORIZONTAL', 24);
  row.counterAxisAlignItems = 'CENTER';
  cell.appendChild(row);
  for (const size of [88, 64]) {
    const col = box('Size ' + size, 120, 'VERTICAL', 8);
    row.appendChild(col);
    const c = await figma.getNodeByIdAsync(components[pose + '/' + size]);
    const inst = add(c.createInstance());
    col.appendChild(inst);
    await text(col, size + 'px', 120, 'UI/Small', 'color/text-secondary');
  }
  await text(cell, file, 448, 'UI/Small');
  await text(cell, meaning, 448, 'Body/Default');
}
await text(board, '配饰 · 每次只选一件', 1376, 'Heading/Medium');
const motifRow = box(
  'Accessory specimens / not application view',
  1376,
  'HORIZONTAL',
  16,
);
board.appendChild(motifRow);
for (const [motif, file, label, meaning] of motifs) {
  const cell = box(label, 448, 'VERTICAL', 12);
  motifRow.appendChild(cell);
  const c = await figma.getNodeByIdAsync(components[motif + '/48']);
  cell.appendChild(add(c.createInstance()));
  await text(cell, label + ' · 48px', 448, 'UI/Card Title');
  await text(cell, file, 448, 'UI/Small');
  await text(cell, meaning, 448, 'Body/Default');
}
await text(board, '配饰布局样例 · 不新增应用功能', 1376, 'Heading/Medium');
await text(
  board,
  '以下是来源／关于类排版合同，非当前运行页面。每个独立样例只有一件配饰，不可点击，正文仍是主角。原图与商用权利未独立核验，不标为官方资产。',
  1376,
  'Body/Default',
);
const patterns = box('Accessory placement patterns', 1376, 'HORIZONTAL', 16);
board.appendChild(patterns);
for (const [motif, file, label] of motifs) {
  const card = box('Source pattern / ' + label, 448, 'VERTICAL', 16);
  padding(card, 24);
  card.fills = [paint('color/canvas')];
  card.strokes = [paint('color/border-subtle')];
  card.setBoundVariable('cornerRadius', V['radius/12']);
  patterns.appendChild(card);
  const heading = box('Source heading', 400, 'HORIZONTAL', 24);
  heading.counterAxisAlignItems = 'CENTER';
  card.appendChild(heading);
  const copy = box('Title copy', 328, 'VERTICAL', 4);
  heading.appendChild(copy);
  await text(copy, '素材与来源', 328, 'UI/Card Title');
  await text(
    copy,
    'Hazel × Claude · Pioneer',
    328,
    'UI/Small',
    'color/text-secondary',
  );
  const c = await figma.getNodeByIdAsync(components[motif + '/48']);
  heading.appendChild(add(c.createInstance()));
  await text(
    card,
    '制服、绿冻与纸面的独立演绎。\n生成素材用于少量留白，不是功能图标。',
    400,
    'Body/Default',
  );
  await text(
    card,
    '仅关于／来源布局 · 48px · 不可点击',
    400,
    'UI/Small',
    'color/text-secondary',
  );
}
await text(
  board,
  '界面规则不变：一屏最多一张插画；欢迎 88px／窄屏 64px；正文安全距 24px。已有消息、权限、错误、未知结果与活跃任务都不显示角色插画。小于 380px 的会话容器隐藏。',
  1376,
  'Body/Default',
);
for (const u of uploads) {
  const n = await figma.getNodeByIdAsync(u.response.placedOnNodeId);
  if (n) {
    removed.push(n.id);
    n.remove();
  }
}
return {
  createdNodeIds: created,
  mutatedNodeIds: mutated,
  removedNodeIds: removed,
  board: { id: board.id, w: board.width, h: board.height },
  families: [
    {
      id: set.id,
      name: set.name,
      count: set.children.length,
      properties: set.componentPropertyDefinitions,
    },
    {
      id: motifSet.id,
      name: motifSet.name,
      count: motifSet.children.length,
      properties: motifSet.componentPropertyDefinitions,
    },
  ],
  components,
};
