import { useRef } from 'react';

export function LocalTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  panelId,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className: string;
  panelId: string;
}): React.JSX.Element {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  return (
    <div role="tablist" aria-label={label} className={className}>
      {items.map((item, index) => (
        <button
          key={item.id}
          id={`${panelId}-tab-${item.id}`}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          aria-controls={item.id === value ? panelId : undefined}
          tabIndex={item.id === value ? 0 : -1}
          ref={(element) => {
            if (element) buttons.current.set(item.id, element);
            else buttons.current.delete(item.id);
          }}
          onClick={() => {
            onChange(item.id);
          }}
          onKeyDown={(event) => {
            let target: number | undefined;
            if (event.key === 'ArrowRight') target = (index + 1) % items.length;
            if (event.key === 'ArrowLeft')
              target = (index - 1 + items.length) % items.length;
            if (event.key === 'Home') target = 0;
            if (event.key === 'End') target = items.length - 1;
            if (target === undefined) return;
            event.preventDefault();
            const next = items[target];
            if (next) {
              onChange(next.id);
              buttons.current.get(next.id)?.focus();
            }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
