'use client';

import type { LiveMap, Spot } from '@/lib/types';
import { crowdColor, crowdWord } from '@/lib/ui';

/**
 * A horizontally drifting strip of all 39 real spots and their current state.
 * Unknowns keep their dashed circles — the landing page doesn't hide "we don't know" either.
 */
export function Marquee({ spots, live }: { spots: Spot[]; live: LiveMap }) {
  const items = spots.map((s) => ({
    id: s.id,
    name: s.name.replace(/ — .*/, ''),
    detail: s.floorHint ?? s.building,
    crowd: live[s.id]?.live.crowd ?? null,
  }));

  const Row = ({ ariaHidden }: { ariaHidden: boolean }) => (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={ariaHidden || undefined}>
      {items.map((it, i) => (
        <li key={`${it.id}-${i}`} className="flex shrink-0 items-center gap-2.5">
          {it.crowd === null ? (
            <span
              className="size-2.5 shrink-0 rounded-full border-[1.5px] border-dashed"
              style={{ borderColor: 'oklch(0.6 0.012 260)' }}
            />
          ) : (
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: crowdColor(it.crowd) }} />
          )}
          <span className="whitespace-nowrap text-[13px] tracking-tight" style={{ color: 'var(--scene-fg)' }}>
            {it.name}
          </span>
          <span className="whitespace-nowrap text-[12px]" style={{ color: 'var(--scene-muted)' }}>
            {crowdWord(it.crowd)}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className="relative flex overflow-hidden border-y py-3.5"
      style={{ borderColor: 'var(--scene-line)', maskImage: 'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)' }}
    >
      <div className="flex min-w-max" style={{ animation: 'drift 90s linear infinite' }}>
        <Row ariaHidden={false} />
        <Row ariaHidden />
      </div>
    </div>
  );
}
