import { useEffect, useRef, type ReactNode } from 'react';

export function PanelMenu({
  label,
  children,
  className = '',
  summary = '•••',
}: {
  label: string;
  children: ReactNode;
  className?: string;
  summary?: string;
}): React.JSX.Element {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      if (
        details.current?.open &&
        event.target instanceof Node &&
        !details.current.contains(event.target)
      )
        details.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  return (
    <details
      ref={details}
      className={`panel-menu ${className}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && details.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          details.current.open = false;
          details.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary aria-label={label}>{summary}</summary>
      <div>{children}</div>
    </details>
  );
}
