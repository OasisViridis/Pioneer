import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  PermissionCard,
  type PermissionCardState,
} from '../../apps/desktop/src/renderer/components/PermissionCard';

const base = {
  operation: '对象：毕业项目的设计文档',
  scope: '路径：D:/Project/Pioneer/docs\n权限：只读；不写入、不执行命令',
  recipient: '接收方：本地示例运行器；不外发',
  expiry: '时效：仅此一次；目标变更或超时即失效',
};

const states: PermissionCardState[] = [
  'Awaiting',
  'Denied',
  'Expired',
  'Approved',
];

const render = (state: PermissionCardState, props = {}) =>
  renderToStaticMarkup(
    createElement(PermissionCard, { ...base, state, ...props }),
  );

describe('PermissionCard', () => {
  it('renders every reviewed state with its title, message and action labels', () => {
    const expected = new Map<PermissionCardState, string[]>([
      [
        'Awaiting',
        [
          '是否批准本次读取？',
          '尚未读取；拒绝不丢失当前讨论',
          '批准本次读取',
          '拒绝并保留讨论',
        ],
      ],
      [
        'Denied',
        [
          '你已拒绝本次读取',
          '未执行，可修改需求后重新核对',
          '重新核对范围',
          '返回讨论',
        ],
      ],
      [
        'Expired',
        [
          '本次批准已失效',
          '不得复用旧授权；先核对对象和范围',
          '重新核对范围',
          '返回讨论',
        ],
      ],
      [
        'Approved',
        [
          '本次读取已批准',
          '批准不等于已执行，等待真实执行事件',
          '撤回本次授权',
          '查看批准范围',
        ],
      ],
    ]);
    for (const state of states) {
      const html = render(state);
      const texts = expected.get(state);
      if (!texts) throw new Error(`Missing expected copy for ${String(state)}`);
      expect(html).toContain(`data-state="${String(state)}"`);
      for (const text of texts) expect(html).toContain(text);
    }
  });

  it('reports actions to the caller and never grants on render', () => {
    const onAction = vi.fn();
    const html = render('Awaiting', { onAction });
    expect(onAction).not.toHaveBeenCalled();
    expect(html).toContain('批准本次读取');
    expect(html).toContain('拒绝并保留讨论');
  });

  it('keeps the design-only note out of runtime unless explicitly supplied', () => {
    expect(render('Awaiting')).not.toContain('设计示例 · 尚未接入');
    expect(
      render('Awaiting', {
        note: '设计示例 · 尚未接入 · 不具授权效力',
      }),
    ).toContain('设计示例 · 尚未接入 · 不具授权效力');
  });

  it('labels the section by its own heading and preserves scope newlines', () => {
    const html = render('Awaiting');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    if (!labelledBy) throw new Error('PermissionCard has no labelled heading');
    expect(html).toContain(`id="${labelledBy}"`);
    expect(html).toContain('路径：D:/Project/Pioneer/docs');
    expect(html).toContain('权限：只读；不写入、不执行命令');
  });

  it('can disable preview actions without changing the reviewed copy', () => {
    const html = render('Awaiting', { disabled: true });
    expect(html).toContain('disabled=""');
    expect(html).toContain('批准本次读取');
    expect(html).toContain('拒绝并保留讨论');
  });
});
