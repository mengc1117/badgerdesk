'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHeatmap } from '@/lib/api';
import { localNow, DOW_LABEL } from '@/lib/hours';
import { crowdColor, crowdWord } from '@/lib/ui';

const CELL = 13;
const GAP = 2;
const LEFT = 26;
const TOP = 16;

/** 7×24 historical heatmap. Hand-written SVG; zero-sample cells get a hatched fill. */
export function Heatmap({ spotId }: { spotId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['heatmap', spotId], queryFn: () => fetchHeatmap(spotId), staleTime: 5 * 60_000 });
  const [focus, setFocus] = useState<{ dow: number; hour: number } | null>(null);

  const now = useMemo(() => localNow(), []);
  const nowHour = Math.floor(now.minutes / 60);

  const grid = useMemo(() => {
    const m = new Map<string, { crowd: number | null; n: number }>();
    for (const c of data?.cells ?? []) m.set(`${c.dow}-${c.hour}`, { crowd: c.crowd, n: c.n });
    return m;
  }, [data]);

  const W = LEFT + 24 * (CELL + GAP);
  const H = TOP + 7 * (CELL + GAP) + 4;

  const cur = focus ?? null;
  const curCell = cur ? grid.get(`${cur.dow}-${cur.hour}`) : null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="text-[13px] font-semibold">Typical week (7 × 24)</h4>
        <p className="text-[11.5px]" style={{ color: 'var(--muted)' }} aria-live="polite">
          {cur
            ? `${DOW_LABEL[cur.dow]} ${String(cur.hour).padStart(2, '0')}:00 · ${
                curCell && curCell.n > 0 ? `${crowdWord(curCell.crowd)} (${curCell.n} reports)` : 'no samples for this hour yet'
              }`
            : 'Arrow keys explore cell by cell'}
        </p>
      </div>

      {isLoading ? (
        <div className="h-[132px] animate-pulse rounded-lg" style={{ background: 'var(--surface-2)' }} />
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="group"
          aria-label="Historical crowd heatmap by weekday and hour. Use arrow keys to explore."
          tabIndex={0}
          onFocus={() => setFocus((f) => f ?? { dow: now.dow, hour: nowHour })}
          onBlur={() => setFocus(null)}
          onKeyDown={(e) => {
            if (!e.key.startsWith('Arrow')) return;
            e.preventDefault();
            setFocus((f) => {
              const c = f ?? { dow: now.dow, hour: nowHour };
              if (e.key === 'ArrowLeft') return { ...c, hour: (c.hour + 23) % 24 };
              if (e.key === 'ArrowRight') return { ...c, hour: (c.hour + 1) % 24 };
              if (e.key === 'ArrowUp') return { ...c, dow: (c.dow + 6) % 7 };
              return { ...c, dow: (c.dow + 1) % 7 };
            });
          }}
        >
          <defs>
            {/* Hatched fill for zero-sample cells — a solid color would read as "nobody comes at this hour" */}
            <pattern id="hm-unknown" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="4" height="4" fill="var(--unknown-bg)" />
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--unknown)" strokeWidth="1.1" opacity="0.65" />
            </pattern>
          </defs>

          {[0, 6, 12, 18].map((h) => (
            <text key={h} x={LEFT + h * (CELL + GAP)} y={10} fontSize="8.5" fill="var(--muted)">
              {h}:00
            </text>
          ))}

          {DOW_LABEL.map((d, dow) => (
            <text key={d} x={0} y={TOP + dow * (CELL + GAP) + CELL - 3} fontSize="8.5" fill="var(--muted)">
              {d}
            </text>
          ))}

          {Array.from({ length: 7 }, (_, dow) =>
            Array.from({ length: 24 }, (_, hour) => {
              const c = grid.get(`${dow}-${hour}`);
              const isNow = dow === now.dow && hour === nowHour;
              const isFocus = cur?.dow === dow && cur?.hour === hour;
              const empty = !c || c.n === 0 || c.crowd === null;
              return (
                <rect
                  key={`${dow}-${hour}`}
                  x={LEFT + hour * (CELL + GAP)}
                  y={TOP + dow * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  fill={empty ? 'url(#hm-unknown)' : crowdColor(c.crowd)}
                  opacity={empty ? 1 : 0.92}
                  stroke={isFocus ? 'var(--fg)' : isNow ? 'var(--accent)' : 'transparent'}
                  strokeWidth={isFocus ? 1.6 : isNow ? 1.4 : 0}
                  onPointerEnter={() => setFocus({ dow, hour })}
                  onPointerLeave={() => setFocus(null)}
                />
              );
            }),
          )}
        </svg>
      )}

      <div className="mt-2 flex items-center gap-3 text-[10.5px]" style={{ color: 'var(--muted)' }}>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--crowd-1)' }} /> Empty
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--crowd-5)' }} /> Full
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-[3px] border-[1.2px] border-dashed" style={{ borderColor: 'var(--unknown)' }} /> No samples
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-[3px] border-[1.4px]" style={{ borderColor: 'var(--accent)' }} /> Now
        </span>
      </div>
    </div>
  );
}
