const p = await figma.getNodeByIdAsync('824:1279');
await figma.setCurrentPageAsync(p);
const targets = [
  {
    old: '838:1369',
    screen: '838:1350',
    label: 'L00',
    pose: 'Organizing/88',
    component: '856:1280',
  },
  {
    old: '838:1437',
    screen: '838:1379',
    label: 'W01',
    pose: 'Listening/88',
    component: '856:1284',
  },
  {
    old: '838:1510',
    screen: '838:1455',
    label: 'W02',
    pose: 'Reading/88',
    component: '856:1276',
  },
  {
    old: '838:1696',
    screen: '838:1641',
    label: 'R02',
    pose: 'Listening/64',
    component: '856:1286',
  },
];
const created = [],
  mutated = [],
  removed = [],
  placements = [];
for (const t of targets) {
  const screen = await figma.getNodeByIdAsync(t.screen);
  const prev = await figma.getNodeByIdAsync(t.old);
  if (!prev) {
    const current = screen.findOne(
      (n) => n.name === 'Hazel companion / decorative only',
    );
    placements.push({ label: t.label, id: current.id, existing: true });
    continue;
  }
  const master = await figma.getNodeByIdAsync(t.component);
  const parent = prev.parent;
  const i = parent.children.indexOf(prev);
  const n = master.createInstance();
  n.name = 'Hazel companion / decorative only';
  parent.insertChild(i, n);
  created.push(n.id, ...n.findAll(() => true).map((d) => d.id));
  mutated.push(parent.id);
  removed.push(prev.id);
  prev.remove();
  placements.push({
    label: t.label,
    screen: t.screen,
    instance: n.id,
    master: t.component,
    pose: t.pose,
    size: [n.width, n.height],
    parent: parent.id,
  });
}
return {
  createdNodeIds: created,
  mutatedNodeIds: mutated,
  removedNodeIds: removed,
  placements,
};
