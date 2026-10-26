// Read-only Figma completion audit. Pass auditInput in the tool wrapper.
// Static design evidence only: this does not test prototype clicking or Electron.
async function auditDelivery(input) {
  const page = await figma.getNodeByIdAsync(input.pageId);
  if (!page || page.type !== 'PAGE') throw new Error('Missing page');
  await figma.setCurrentPageAsync(page);
  const problems = [];
  const result = { pageId: page.id, pageName: page.name, problems };
  if (input.pageId === '717:1578')
    result.prototype = {
      starts: page.flowStartingPoints,
      reactionNodes: page.findAll(
        (v) => 'reactions' in v && v.reactions.length > 0,
      ).length,
    };
  const textOf = (n) =>
    n
      .findAll((x) => x.type === 'TEXT' && x.visible !== false)
      .map((x) => x.characters)
      .join('\n');
  for (const c of input.components || []) {
    const n = await figma.getNodeByIdAsync(c.id);
    if (!n || n.type !== 'COMPONENT_SET') {
      problems.push({ missingComponent: c.id });
      continue;
    }
    for (const key of ['id', 'name']) {
      if (
        JSON.stringify(n.children.map((v) => v[key]).sort()) !==
        JSON.stringify(c.variants.map((v) => v[key]).sort())
      )
        problems.push({ component: c.name, variantMismatch: key });
    }
    const refs = new Set(
      n
        .findAll((x) => 'componentPropertyReferences' in x)
        .flatMap((x) => Object.values(x.componentPropertyReferences || {})),
    );
    for (const [key, p] of Object.entries(n.componentPropertyDefinitions))
      if (p.type === 'TEXT' && !refs.has(key))
        problems.push({ component: c.name, unusedTextProperty: key });
    (result.components ||= []).push({
      name: c.name,
      id: n.id,
      variants: n.children.length,
    });
  }
  if (input.pageId === '717:1576') {
    const close = await figma.getNodeByIdAsync('722:1580');
    if (!close || close.type !== 'COMPONENT_SET' || close.children.length !== 3)
      problems.push({ internalClose: 'missing or wrong count' });
    else result.internalCloseVariants = 3;
  }
  for (const s of input.screens || []) {
    const n = await figma.getNodeByIdAsync(s.nodeId);
    if (!n) {
      problems.push({ missingScreen: s.screenId });
      continue;
    }
    if (n.width !== (s.width || 1440) || n.height !== (s.height || 900))
      problems.push({
        screen: s.screenId,
        wrongDimensions: [n.width, n.height],
      });
    const future = [
      'D02',
      'P02',
      'R01',
      'R02',
      'A01',
      'A02',
      'V07',
      'V08',
    ].includes(s.screenId);
    if (future && !/设计示例|目标界面/.test(textOf(n)))
      problems.push({ screen: s.screenId, futureMarkerMissing: true });
    (result.screens ||= []).push({
      screenId: s.screenId,
      nodeId: n.id,
      name: n.name,
      width: n.width,
      height: n.height,
      future,
      instances: n.findAll((x) => x.type === 'INSTANCE').length,
    });
  }
  for (const s of input.states || []) {
    const n = await figma.getNodeByIdAsync(s.nodeId);
    if (!n) {
      problems.push({ missingState: s.stateId });
      continue;
    }
    if (!n.name.startsWith(s.stateId + ' '))
      problems.push({ state: s.stateId, name: n.name });
    if (s.future && !/设计示例|目标界面/.test(textOf(n)))
      problems.push({ state: s.stateId, futureMarkerMissing: true });
    const ui = await figma.getNodeByIdAsync(s.uiId);
    if (!ui || ui.width <= 0 || ui.height <= 0)
      problems.push({ state: s.stateId, missingUI: s.uiId });
    (result.states ||= []).push({
      stateId: s.stateId,
      nodeId: n.id,
      name: n.name,
      uiId: s.uiId,
      future: !!s.future,
      instances: n.findAll((x) => x.type === 'INSTANCE').length,
    });
  }
  const vars = await figma.variables.getLocalVariablesAsync();
  const vm = new Map(vars.map((v) => [v.id, v]));
  function resolve(id, seen = new Set()) {
    if (seen.has(id)) return null;
    seen.add(id);
    const v = vm.get(id);
    if (!v) return null;
    const value = Object.values(v.valuesByMode)[0];
    return value && value.type === 'VARIABLE_ALIAS'
      ? resolve(value.id, seen)
      : value;
  }
  if (input.foundations) {
    const f = input.foundations,
      t = input.tokens;
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    for (const c of f.collections) {
      const a = collections.find((v) => v.id === c.id);
      if (!a || a.name !== c.name || a.variableIds.length !== c.count)
        problems.push({ collection: c.id, mismatch: true });
    }
    for (const c of t.colors) {
      const v = vm.get(f.colors[c.name]),
        value = v && resolve(v.id),
        alias = v && Object.values(v.valuesByMode)[0];
      const hex = t.palette[c.primitive.replace('color/', '')];
      const rgb = hex
        ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        : [];
      if (
        !v ||
        alias?.id !== f.primitives[c.primitive] ||
        JSON.stringify([...v.scopes].sort()) !==
          JSON.stringify([...c.scopes].sort()) ||
        v.codeSyntax.WEB !== 'var(' + c.css + ')' ||
        !value ||
        rgb.some((x, i) => Math.abs(x - value[['r', 'g', 'b'][i]]) > 0.00001)
      )
        problems.push({ color: c.name, mismatch: true });
    }
    for (const c of t.dimensions) {
      const v = vm.get(f.dimensions[c.name]);
      if (
        !v ||
        resolve(v.id) !== c.value ||
        Object.values(v.valuesByMode)[0]?.type !== 'VARIABLE_ALIAS' ||
        JSON.stringify(v.scopes) !== JSON.stringify([c.scope]) ||
        v.codeSyntax.WEB !== 'var(' + c.css + ')'
      )
        problems.push({ dimension: c.name, mismatch: true });
    }
    const styles = await figma.getLocalTextStylesAsync();
    for (const s of t.textStyles) {
      const a = styles.find((v) => v.id === f.textStyles[s.name]);
      if (
        !a ||
        a.name !== s.name ||
        a.fontName.family !== s.family ||
        a.fontName.style !== s.style ||
        a.fontSize !== s.size ||
        a.lineHeight.unit !== 'PIXELS' ||
        a.lineHeight.value !== s.lineHeight
      )
        problems.push({ textStyle: s.name, mismatch: true });
    }
    const effects = await figma.getLocalEffectStylesAsync();
    for (const [name, id] of Object.entries(f.effects))
      if (!effects.some((v) => v.id === id && v.name === name))
        problems.push({ missingEffectStyle: id });
    result.foundations = {
      collections: f.collections.map((c) => ({
        id: c.id,
        count: collections.find((v) => v.id === c.id)?.variableIds.length,
      })),
      colors: t.colors.length,
      dimensions: t.dimensions.length,
      textStyles: t.textStyles.length,
      effects: effects
        .filter((v) => Object.values(f.effects).includes(v.id))
        .map((v) => ({ id: v.id, name: v.name, effects: v.effects })),
      boards: page.children.map((v) => ({
        id: v.id,
        name: v.name,
        width: v.width,
        height: v.height,
      })),
    };
  }
  if (input.recheckStructureAndContrast) {
    const nodes = page.findAll(() => true),
      texts = nodes.filter((v) => v.type === 'TEXT');
    const issues = {
      unboundPaints: [],
      unresolvedPaints: [],
      stalePaintCache: [],
      missingTextStyles: [],
      unexpectedFonts: [],
      cjkInMono: [],
      overflows: [],
    };
    const documentedExceptions = {
      insideStrokeBoundaryOffsets: [],
      cjkCodeFallbacks: [],
    };
    for (const n of nodes) {
      for (const prop of ['fills', 'strokes']) {
        if (!(prop in n) || !Array.isArray(n[prop])) continue;
        for (const p of n[prop])
          if (
            p.type === 'SOLID' &&
            p.visible !== false &&
            (p.opacity ?? 1) > 0
          ) {
            const id = p.boundVariables?.color?.id,
              value = id && resolve(id);
            if (!id) issues.unboundPaints.push({ id: n.id, prop });
            else if (!value || typeof value.r !== 'number')
              issues.unresolvedPaints.push({ id: n.id, prop });
            else if (
              Math.max(
                ...['r', 'g', 'b'].map((c) => Math.abs(value[c] - p.color[c])),
              ) > 0.00001
            )
              issues.stalePaintCache.push({ id: n.id, prop });
          }
      }
      const p = n.parent;
      if (p && p.type !== 'PAGE' && 'width' in p && 'x' in n) {
        const excess = Math.max(
          -n.x,
          -n.y,
          n.x + n.width - p.width,
          n.y + n.height - p.height,
        );
        if (excess > 0.5) {
          const detail = {
            id: n.id,
            parent: p.id,
            bounds: [n.x, n.y, n.width, n.height],
            parentSize: [p.width, p.height],
          };
          // Read-only backend offsets auto-layout content by an INSIDE 1px stroke.
          // Accept only frames/panel-header instances within that exact border;
          // never exempt text or an arbitrary action instance. Record every case.
          const container =
            n.type === 'FRAME' ||
            (n.type === 'INSTANCE' && /Panel Header/.test(n.name));
          const strokeOffset =
            container &&
            p.type === 'FRAME' &&
            p.layoutMode !== 'NONE' &&
            p.strokeAlign === 'INSIDE' &&
            p.strokeWeight === 1 &&
            Array.isArray(p.strokes) &&
            p.strokes.some(
              (v) => v.visible !== false && (v.opacity ?? 1) > 0,
            ) &&
            Math.abs(n.x - 1) <= 0.01 &&
            n.y >= 0 &&
            Math.abs(n.width - p.width) <= 0.01 &&
            Math.abs(n.x + n.width - p.width - 1) <= 0.01 &&
            n.y + n.height <= p.height + 0.01;
          if (strokeOffset)
            documentedExceptions.insideStrokeBoundaryOffsets.push(detail);
          else issues.overflows.push(detail);
        }
      }
      if (n.type === 'TEXT') {
        const segments = n.getStyledTextSegments([
          'fontName',
          'fontSize',
          'lineHeight',
          'textStyleId',
        ]);
        for (const s of segments) {
          if (!s.textStyleId) {
            // A CJK font override deliberately detaches only that span from the
            // adjacent Code style. Require a linked, same-metric mono peer.
            const peer = segments.find(
              (v) =>
                (v.end === s.start || v.start === s.end) &&
                (input.codeStyleIds || []).includes(v.textStyleId) &&
                v.fontName.family === 'JetBrains Mono' &&
                v.fontSize === s.fontSize &&
                v.lineHeight.unit === s.lineHeight.unit &&
                v.lineHeight.value === s.lineHeight.value,
            );
            const fallback =
              /[\u3400-\u9fff]/.test(s.characters) &&
              s.fontName.family === 'Noto Sans SC' &&
              s.fontName.style === 'Regular' &&
              ((s.fontSize === 12 &&
                s.lineHeight.unit === 'PIXELS' &&
                s.lineHeight.value === 20) ||
                (s.fontSize === 14 &&
                  s.lineHeight.unit === 'PIXELS' &&
                  s.lineHeight.value === 22)) &&
              !!peer;
            if (fallback)
              documentedExceptions.cjkCodeFallbacks.push({
                id: n.id,
                start: s.start,
                end: s.end,
                text: s.characters,
                font: s.fontName,
                fontSize: s.fontSize,
                lineHeight: s.lineHeight,
                adjacentCodePeer: {
                  start: peer.start,
                  end: peer.end,
                  textStyleId: peer.textStyleId,
                },
              });
            else issues.missingTextStyles.push({ id: n.id });
          }
          if (
            !['Noto Sans SC', 'Inter', 'JetBrains Mono'].includes(
              s.fontName.family,
            )
          )
            issues.unexpectedFonts.push({ id: n.id, font: s.fontName });
          if (
            s.fontName.family === 'JetBrains Mono' &&
            /[\u3400-\u9fff]/.test(s.characters)
          )
            issues.cjkInMono.push({ id: n.id, text: s.characters });
        }
      }
    }
    const linear = (x) =>
      x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    const lum = (c) =>
      0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
    const blend = (a, b, o) =>
      Object.fromEntries(
        ['r', 'g', 'b'].map((k) => [k, a[k] * o + b[k] * (1 - o)]),
      );
    function background(n) {
      let cur = n.parent;
      const layers = [];
      while (cur && cur.type !== 'PAGE') {
        if ('fills' in cur && Array.isArray(cur.fills)) {
          const p = cur.fills
            .filter(
              (v) =>
                v.type === 'SOLID' &&
                v.visible !== false &&
                (v.opacity ?? 1) > 0,
            )
            .at(-1);
          if (p) {
            const o = (p.opacity ?? 1) * (cur.opacity ?? 1);
            layers.push({ color: p.color, opacity: o });
            if (o >= 0.999) {
              let c = p.color;
              for (let i = layers.length - 2; i >= 0; i--)
                c = blend(layers[i].color, c, layers[i].opacity);
              return c;
            }
          }
        }
        cur = cur.parent;
      }
      return null;
    }
    const failures = [],
      unknown = [];
    let tested = 0,
      minRatio = Infinity;
    for (const n of texts) {
      const bg = background(n);
      if (!bg) {
        unknown.push({ id: n.id });
        continue;
      }
      tested++;
      for (const s of n.getStyledTextSegments([
        'fontName',
        'fontSize',
        'fills',
      ])) {
        if (!s.characters.trim()) continue;
        const p = s.fills.find(
          (v) => v.type === 'SOLID' && v.visible !== false,
        );
        if (!p) {
          unknown.push({ id: n.id, noForeground: true });
          continue;
        }
        const fg = blend(p.color, bg, (p.opacity ?? 1) * (n.opacity ?? 1));
        const ratio =
          (Math.max(lum(fg), lum(bg)) + 0.05) /
          (Math.min(lum(fg), lum(bg)) + 0.05);
        minRatio = Math.min(minRatio, ratio);
        const required =
          s.fontSize >= 24 ||
          (s.fontSize >= 18.66 && /Bold/i.test(s.fontName.style))
            ? 3
            : 4.5;
        if (ratio + 0.0001 < required)
          failures.push({ id: n.id, text: s.characters, ratio, required });
      }
    }
    result.qa = {
      structure: {
        pageId: page.id,
        name: page.name,
        nodes: nodes.length,
        texts: texts.length,
        instances: nodes.filter((v) => v.type === 'INSTANCE').length,
        roots: page.children.map((v) => ({
          id: v.id,
          name: v.name,
          x: v.x,
          y: v.y,
          width: v.width,
          height: v.height,
        })),
        issues,
        documentedExceptions,
      },
      contrast: {
        pageId: page.id,
        name: page.name,
        tested,
        minRatio,
        failures,
        unknown,
      },
    };
  }
  return result;
}
