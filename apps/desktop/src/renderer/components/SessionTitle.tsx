import { useLayoutEffect, useRef, useState } from 'react';

export function SessionTitle({
  title,
  onRename,
}: {
  title: string;
  onRename: (title: string) => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      button.current?.focus();
    }
  }, [editing]);
  const finish = (save: boolean): void => {
    if (save && !draft.trim()) return;
    if (save) onRename(draft);
    restoreFocus.current = true;
    setEditing(false);
  };
  return editing ? (
    <form
      className="session-title-edit"
      onSubmit={(event) => {
        event.preventDefault();
        finish(true);
      }}
    >
      <input
        ref={input}
        aria-label="会话名称"
        maxLength={48}
        value={draft}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            finish(false);
          }
        }}
      />
      <button type="submit" className="quiet-button" disabled={!draft.trim()}>
        保存名称
      </button>
      <button
        type="button"
        className="quiet-button"
        onClick={() => {
          finish(false);
        }}
      >
        取消
      </button>
    </form>
  ) : (
    <h1>
      <button
        ref={button}
        type="button"
        className="session-title"
        aria-label="重命名会话"
        title={`${title} · 点击重命名`}
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
      >
        {title}
      </button>
    </h1>
  );
}
