import { useRef } from 'react';

/** Pointer previews stay local; only the final value or a keyboard step is persisted. */
export function ResizeHandle({
  label,
  orientation,
  value,
  min,
  max,
  extent,
  onPreview,
  onCommit,
}: {
  label: string;
  orientation: 'vertical' | 'horizontal';
  value: number;
  min: number;
  max: number;
  extent: number;
  onPreview: (value: number | null) => void;
  onCommit: (value: number) => void;
}): React.JSX.Element {
  const drag = useRef<{ origin: number; value: number; latest: number } | null>(
    null,
  );
  const clamp = (next: number): number => Math.min(max, Math.max(min, next));
  const finish = (cancel = false): void => {
    const current = drag.current;
    drag.current = null;
    onPreview(null);
    if (current && !cancel) onCommit(current.latest);
  };
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${String(Math.round(value))}%`}
      tabIndex={0}
      className={`resize-handle resize-handle--${orientation}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          origin: orientation === 'vertical' ? event.clientX : event.clientY,
          value,
          latest: value,
        };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || extent <= 0) return;
        current.latest = clamp(
          current.value +
            (((orientation === 'vertical' ? event.clientX : event.clientY) -
              current.origin) /
              extent) *
              100,
        );
        onPreview(current.latest);
      }}
      onPointerUp={() => {
        finish();
      }}
      onPointerCancel={() => {
        finish(true);
      }}
      onLostPointerCapture={() => {
        if (drag.current) finish();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && drag.current) {
          event.preventDefault();
          finish(true);
          return;
        }
        const lower = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
        const higher = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
        if (![lower, higher, 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        onCommit(
          event.key === 'Home'
            ? min
            : event.key === 'End'
              ? max
              : clamp(value + (event.key === lower ? -2 : 2)),
        );
      }}
    >
      <span aria-hidden="true" />
    </div>
  );
}
