import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  dismissible?: boolean;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);
  return (
    <dialog
      aria-label={title}
      className="modal"
      ref={dialog}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      onClose={() => {
        if (dismissible) onClose();
      }}
    >
      <header className="modal__header">
        <h2>{title}</h2>
        {dismissible ? (
          <button type="button" aria-label="关闭对话框" onClick={onClose}>
            ×
          </button>
        ) : null}
      </header>
      {children}
    </dialog>
  );
}
