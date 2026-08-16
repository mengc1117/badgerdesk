'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Snap points: peek 15% / half 55% / full 92%. */
export const SNAPS = [0.15, 0.55, 0.92] as const;
export type SnapIndex = 0 | 1 | 2;

/** Mobile list container; draggable, plus an expand/collapse button and Esc. */
export function BottomSheet({
  snap,
  onSnapChange,
  header,
  children,
}: {
  snap: SnapIndex;
  onSnapChange: (s: SnapIndex) => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState<number | null>(null);
  const drag = useRef<{ startY: number; baseY: number } | null>(null);

  // At rest position with a percentage (SSR-safe); pixels only while dragging
  const pctFor = (s: SnapIndex) => ((SNAPS[2] - SNAPS[s]) / SNAPS[2]) * 100;
  const yFor = useCallback((s: SnapIndex) => (SNAPS[2] - SNAPS[s]) * window.innerHeight, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && snap > 0) onSnapChange(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snap, onSnapChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, baseY: yFor(snap) };
    setDragY(yFor(snap));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const next = drag.current.baseY + (e.clientY - drag.current.startY);
    setDragY(Math.min(yFor(0), Math.max(yFor(2), next)));
  };

  const onPointerUp = () => {
    if (dragY === null) return;
    let best: SnapIndex = 0;
    let bestD = Infinity;
    for (const i of [0, 1, 2] as SnapIndex[]) {
      const d = Math.abs(yFor(i) - dragY);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    drag.current = null;
    setDragY(null);
    onSnapChange(best);
  };

  return (
    <div
      ref={sheetRef}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t shadow-2xl lg:hidden"
      style={{
        height: `${SNAPS[2] * 100}dvh`,
        transform: dragY === null ? `translateY(${pctFor(snap)}%)` : `translateY(${dragY}px)`,
        transition: dragY === null ? 'transform .34s cubic-bezier(.16,1,.3,1)' : 'none',
        background: 'var(--bg)',
        borderColor: 'var(--line)',
        boxShadow: 'var(--shadow-pop)',
      }}
    >
      <div
        className="shrink-0 cursor-grab touch-none px-3 pb-1 pt-2.5 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="mx-auto h-1 w-9 rounded-full" style={{ background: 'var(--line-strong)' }} />
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
        <div className="min-w-0 flex-1">{header}</div>
        <button
          type="button"
          onClick={() => onSnapChange(snap === 2 ? 0 : ((snap + 1) as SnapIndex))}
          aria-label={snap === 2 ? 'Collapse list' : 'Expand list'}
          aria-expanded={snap > 0}
          className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px]"
          style={{ borderColor: 'var(--line)' }}
        >
          {snap === 2 ? 'Collapse ▾' : 'Expand ▴'}
        </button>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}
