'use client';

import * as Slider from '@radix-ui/react-slider';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AMENITY_FIELDS, type AmenityField, type FilterTri, type Filters } from '@/lib/types';
import { AMENITY_LABEL } from '@/lib/scoring';
import { FIELD_ICON, NOISE_BASE_OPTIONS } from '@/lib/ui';

/** Cycle: any → required → strict → any. */
const nextTri = (t: FilterTri): FilterTri => (((t + 1) % 3) as FilterTri);

const TRI_HINT = ['Any', 'Required — unknowns still shown, ranked lower', 'Strict: confirmed only, unknowns excluded'];

export function FilterBar({
  filters,
  patch,
  reset,
  resultCount,
  unknownForFiltered,
  onFillUnknown,
}: {
  filters: Filters;
  patch: (p: Partial<Filters>) => void;
  reset: () => void;
  resultCount: number;
  /** [field, count of listed spots where it is unknown] */
  unknownForFiltered: [AmenityField, number][];
  onFillUnknown: (field: AmenityField) => void;
}) {
  const dirty =
    filters.maxWalk !== 15 ||
    filters.openNow ||
    filters.noisePref !== 2 ||
    AMENITY_FIELDS.some((f) => (filters.amenities[f] ?? 0) > 0);

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="border-b" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 py-2.5 lg:flex-wrap lg:overflow-visible">
          {/* walk time */}
          <div
            className="flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-1.5"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            <label htmlFor="maxwalk" className="whitespace-nowrap text-[12.5px]" style={{ color: 'var(--muted)' }}>
              Max walk
            </label>
            <Slider.Root
              id="maxwalk"
              className="relative flex h-4 w-[88px] touch-none select-none items-center"
              value={[filters.maxWalk]}
              min={2}
              max={30}
              step={1}
              onValueChange={([v]) => patch({ maxWalk: v })}
              aria-label="Maximum walking time in minutes"
            >
              <Slider.Track className="relative h-[3px] grow rounded-full" style={{ background: 'var(--line-strong)' }}>
                <Slider.Range className="absolute h-full rounded-full" style={{ background: 'var(--accent)' }} />
              </Slider.Track>
              <Slider.Thumb
                className="block size-3.5 rounded-full border-2 shadow"
                style={{ background: 'var(--bg)', borderColor: 'var(--accent)' }}
              />
            </Slider.Root>
            <span className="w-[3.5em] shrink-0 text-[12.5px] tabular-nums">{filters.maxWalk} min</span>
          </div>

          {/* open now */}
          <Chip active={filters.openNow} onClick={() => patch({ openNow: !filters.openNow })} pressed>
            Open now
          </Chip>

          {/* Noise preference is a MATCH, not a minimum — some people want background hum (§2) */}
          <div
            className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            <label htmlFor="noisepref" className="whitespace-nowrap text-[12.5px]" style={{ color: 'var(--muted)' }}>
              I want
            </label>
            <select
              id="noisepref"
              value={filters.noisePref}
              onChange={(e) => patch({ noisePref: Number(e.target.value) })}
              className="bg-transparent text-[12.5px] outline-none"
            >
              {NOISE_BASE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.short}
                </option>
              ))}
            </select>
          </div>

          <span className="mx-0.5 h-5 w-px shrink-0" style={{ background: 'var(--line)' }} />

          {/* tri-state amenity filters */}
          {AMENITY_FIELDS.map((f) => {
            const tri = (filters.amenities[f] ?? 0) as FilterTri;
            return (
              <Tooltip.Root key={f}>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    onClick={() => patch({ amenities: { ...filters.amenities, [f]: nextTri(tri) } })}
                    aria-label={`${AMENITY_LABEL[f]} filter: ${TRI_HINT[tri]}. Click to cycle`}
                    className="shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors"
                    style={
                      tri === 2
                        ? { borderColor: 'var(--accent)', background: 'var(--accent)', color: 'var(--accent-fg)' }
                        : tri === 1
                          ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)' }
                          : { borderColor: 'var(--line)', background: 'var(--surface)' }
                    }
                  >
                    <span aria-hidden="true">{FIELD_ICON[f]}</span> {AMENITY_LABEL[f]}
                    {tri > 0 && <span aria-hidden="true"> {tri === 1 ? '✓' : '✓✓'}</span>}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    sideOffset={6}
                    className="z-[120] max-w-[16rem] rounded-lg border px-2.5 py-1.5 text-[12px] shadow-lg"
                    style={{ background: 'var(--surface)', borderColor: 'var(--line)', boxShadow: 'var(--shadow-pop)' }}
                  >
                    {TRI_HINT[tri]}
                    <Tooltip.Arrow style={{ fill: 'var(--surface)' }} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          })}

          {dirty && (
            <button
              type="button"
              onClick={reset}
              className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors hover:underline"
              style={{ color: 'var(--muted)' }}
            >
              Clear
            </button>
          )}
        </div>

        {/* live result count + unknown-field helper chips */}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 pb-2.5 text-[12px]"
          aria-live="polite"
          style={{ color: 'var(--muted)' }}
        >
          <span>{resultCount} spot{resultCount === 1 ? '' : 's'} found</span>
          {unknownForFiltered.map(([f, n]) =>
            n === 0 ? null : (
              <button
                key={f}
                type="button"
                onClick={() => onFillUnknown(f)}
                className="unknown-box rounded-md px-1.5 py-0.5 text-[11.5px] transition-colors"
              >
                {n} with unknown {AMENITY_LABEL[f].toLowerCase()} · help fill in →
              </button>
            ),
          )}
        </div>
      </div>
    </Tooltip.Provider>
  );
}

function Chip({
  active,
  onClick,
  children,
  pressed,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(pressed ? { 'aria-pressed': active } : {})}
      className="shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors"
      style={
        active
          ? { borderColor: 'var(--accent)', background: 'var(--accent)', color: 'var(--accent-fg)' }
          : { borderColor: 'var(--line)', background: 'var(--surface)' }
      }
    >
      {children}
    </button>
  );
}
