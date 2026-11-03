import { useId } from 'react';

export type PermissionCardState =
  'Awaiting' | 'Denied' | 'Expired' | 'Approved';

export type PermissionCardAction =
  'approve' | 'deny' | 'recheck' | 'back' | 'withdraw' | 'view-scope';

interface PermissionCardCopy {
  title: string;
  message: string;
  actions: readonly PermissionCardAction[];
}

const ACTIONS: Record<
  PermissionCardAction,
  { label: string; tone: 'primary' | 'secondary' }
> = {
  approve: { label: '批准本次读取', tone: 'primary' },
  deny: { label: '拒绝并保留讨论', tone: 'secondary' },
  recheck: { label: '重新核对范围', tone: 'secondary' },
  back: { label: '返回讨论', tone: 'secondary' },
  withdraw: { label: '撤回本次授权', tone: 'secondary' },
  'view-scope': { label: '查看批准范围', tone: 'secondary' },
};

const STATES: Record<PermissionCardState, PermissionCardCopy> = {
  Awaiting: {
    title: '是否批准本次读取？',
    message: '尚未读取；拒绝不丢失当前讨论',
    actions: ['approve', 'deny'],
  },
  Denied: {
    title: '你已拒绝本次读取',
    message: '未执行，可修改需求后重新核对',
    actions: ['recheck', 'back'],
  },
  Expired: {
    title: '本次批准已失效',
    message: '不得复用旧授权；先核对对象和范围',
    actions: ['recheck', 'back'],
  },
  Approved: {
    title: '本次读取已批准',
    message: '批准不等于已执行，等待真实执行事件',
    actions: ['withdraw', 'view-scope'],
  },
};

export interface PermissionCardProps {
  operation: string;
  scope: string;
  recipient: string;
  expiry: string;
  state: PermissionCardState;
  onAction?: (action: PermissionCardAction) => void;
  /** Design-only annotation; runtime cards must not claim they are inert. */
  note?: string;
  /** Preview surfaces disable the controls until a real approval flow exists. */
  disabled?: boolean;
}

/**
 * Visual permission review card. It renders the reviewed Figma states and
 * reports an action to its caller; it never grants, records or infers a
 * permission itself.
 */
export function PermissionCard({
  operation,
  scope,
  recipient,
  expiry,
  state,
  onAction,
  note,
  disabled = false,
}: PermissionCardProps) {
  const titleId = useId();
  const copy = STATES[state];
  return (
    <section
      className="permission-card"
      data-state={state}
      aria-labelledby={titleId}
    >
      {note ? <p className="permission-card__note">{note}</p> : null}
      <header className="permission-card__header">
        <p className="permission-card__eyebrow">Permission Card</p>
        <h2 id={titleId}>{copy.title}</h2>
        <p className="permission-card__message" aria-live="polite">
          {copy.message}
        </p>
      </header>
      <dl className="permission-card__details">
        <div>
          <dt>Operation</dt>
          <dd>{operation}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>{scope}</dd>
        </div>
        <div>
          <dt>Recipient</dt>
          <dd>{recipient}</dd>
        </div>
        <div>
          <dt>Expiry</dt>
          <dd>{expiry}</dd>
        </div>
      </dl>
      <div className="permission-card__actions">
        {copy.actions.map((action) => (
          <button
            key={action}
            type="button"
            className={`permission-card__action permission-card__action--${ACTIONS[action].tone}`}
            disabled={disabled}
            onClick={() => onAction?.(action)}
          >
            {ACTIONS[action].label}
          </button>
        ))}
      </div>
    </section>
  );
}
