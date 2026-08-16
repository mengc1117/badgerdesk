'use client';

import { forwardRef } from 'react';
import type { Filters, Scored, VoteField } from '@/lib/types';
import { AMENITY_FIELDS } from '@/lib/types';
import { formatDistance } from '@/lib/geo';
import { CATEGORY_LABEL } from '@/lib/ui';
import { Completeness, ConfidenceBadge, LevelBar, VerdictChip } from './Bits';

type Props = {
  s: Scored;
  filters: Filters;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
  onFill: (field: VoteField) => void;
  onReport: () => void;
};

export const SpotCard = forwardRef<HTMLLIElement, Props>(function SpotCard(
  { s, filters, selected, hovered, onSelect, onHover, onFill, onReport },
  ref,
) {
  const { spot, live, openState } = s;

  // Up to 4 chips: filtered fields first, then up to 2 known + 2 unknown
  const isUnknown = (f: (typeof AMENITY_FIELDS)[number]) => (live.amenities[f]?.state ?? 'unknown') === 'unknown';
  const filtered = AMENITY_FIELDS.filter((f) => (filters.amenities[f] ?? 0) > 0);
  const rest = AMENITY_FIELDS.filter((f) => !filtered.includes(f));
  const shown = [
    ...filtered,
    ...rest.filter((f) => !isUnknown(f)).slice(0, Math.max(0, 2 - filtered.length)),
    ...rest.filter(isUnknown).slice(0, 2),
  ].slice(0, 4);

  return (
    <li
      ref={ref}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className="scroll-mt-2 rounded-xl border transition-colors"
      style={{
        borderColor: selected ? 'var(--accent)' : hovered ? 'var(--line-strong)' : 'var(--line)',
        background: selected ? 'var(--accent-soft)' : 'var(--surface)',
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        aria-current={selected}
        className="w-full rounded-t-xl px-3.5 pb-2.5 pt-3 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[14.5px] font-semibold tracking-tight">{spot.name}</h3>
            <p className="mt-0.5 truncate text-[11.5px]" style={{ color: 'var(--muted)' }}>
              {CATEGORY_LABEL[spot.category]}
              {spot.floorHint ? ` · ${spot.floorHint}` : ''} · {formatDistance(s.meters)} ·{' '}
              {Math.max(1, Math.round(s.walkMinutes))} min walk
            </p>
          </div>
          <OpenPill state={openState} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <LevelBar value={live.live.crowd} kind="crowd" />
          <LevelBar value={live.live.noise} kind="noise" />
        </div>

        <ConfidenceBadge live={live.live} className="mt-2" />
      </button>

      <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
        {shown.map((f) => (
          <VerdictChip key={f} field={f} verdict={live.amenities[f]} onFill={onFill} />
        ))}
      </div>

      <div className="flex items-center gap-3 border-t px-3.5 py-2.5" style={{ borderColor: 'var(--line)' }}>
        <Completeness n={live.completeness} onClick={live.completeness < AMENITY_FIELDS.length ? onSelect : undefined} />
        <button
          type="button"
          onClick={onReport}
          className="shrink-0 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors hover:border-accent hover:text-accent"
          style={{ borderColor: 'var(--line)' }}
        >
          ⚡ Report
        </button>
      </div>
    </li>
  );
});

function OpenPill({ state }: { state: Scored['openState'] }) {
  if (state.state === 'unknown') {
    return (
      <span
        className="unknown-box shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px]"
        title="Nobody maintains this spot's hours yet"
      >
        Hours unknown
      </span>
    );
  }
  if (state.state === 'open') {
    return (
      <span
        className="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px]"
        style={{ color: 'var(--crowd-1-ink)', background: 'color-mix(in oklch, var(--crowd-1) 16%, transparent)' }}
      >
        Open · until {state.until}
        {state.restricted && ' · Wiscard'}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px]" style={{ color: 'var(--muted)', background: 'var(--surface-2)' }}>
      Closed{state.next ? ` · opens ${state.next}` : ''}
    </span>
  );
}
