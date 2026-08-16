'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { VOTE_FIELDS, type Scored, type VoteField } from '@/lib/types';
import { formatDistance } from '@/lib/geo';
import { DOW_LABEL, todayHoursText } from '@/lib/hours';
import { CATEGORY_LABEL, gmapsUrl } from '@/lib/ui';
import { Completeness, ConfidenceBadge, LevelBar, VerdictChip } from './Bits';
import { AmenityAsk } from './AmenityAsk';
import { Heatmap } from './Heatmap';

/** Spot detail: live stats, amenity list, completeness, hours, heatmap. */
export function DetailPanel({
  s,
  askField,
  onAsk,
  onClose,
  onReport,
  favorite,
  onToggleFavorite,
}: {
  s: Scored;
  askField: VoteField | null;
  onAsk: (f: VoteField | null) => void;
  onClose: () => void;
  onReport: () => void;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const qc = useQueryClient();
  const { spot, live, openState } = s;
  const [hoursReported, setHoursReported] = useState(false);
  const askRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (askField) askRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [askField]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3.5" style={{ borderColor: 'var(--line)' }}>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight">{spot.name}</h2>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--muted)' }}>
            {CATEGORY_LABEL[spot.category]} · {spot.building}
            {spot.floorHint ? ` · ${spot.floorHint}` : ''} · {formatDistance(s.meters)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorite}
            aria-label={favorite ? 'Remove from favorites' : 'Save to favorites'}
            className="grid size-8 place-items-center rounded-lg text-[14px] transition-colors hover:bg-surface-2"
          >
            {favorite ? '★' : '☆'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="grid size-8 place-items-center rounded-lg text-[14px] transition-colors hover:bg-surface-2"
            style={{ color: 'var(--muted)' }}
          >
            ✕
          </button>
        </div>
      </header>

      <div className="thin-scroll flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {/* live */}
        <section>
          <div className="grid grid-cols-2 gap-3">
            <BigStat label="How full right now" value={live.live.crowd} kind="crowd" />
            <BigStat label="How loud right now" value={live.live.noise} kind="noise" />
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <ConfidenceBadge live={live.live} />
            <button
              type="button"
              onClick={onReport}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              ⚡ I&apos;m here — report
            </button>
          </div>
        </section>

        {/* follow-up question / fill-in form */}
        {askField && (
          <div ref={askRef}>
            <AmenityAsk
              spotId={spot.id}
              field={askField}
              autoFocus
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['live'] });
                onAsk(null);
              }}
              onSkip={() => onAsk(null)}
            />
          </div>
        )}

        {/* amenities; unknown chips open the fill-in form */}
        <section>
          <h3 className="mb-2.5 text-[13px] font-semibold">Amenities</h3>
          <div className="flex flex-wrap gap-1.5">
            {VOTE_FIELDS.map((f) => (
              <VerdictChip key={f} field={f} verdict={live.amenities[f]} onFill={onAsk} size="md" />
            ))}
          </div>
          <div className="mt-3.5">
            <Completeness n={live.completeness} />
          </div>
        </section>

        {/* hours */}
        <section>
          <div className="mb-2.5 flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold">Today&apos;s hours</h3>
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
              {spot.hoursSource === 'libcal' ? 'Synced from LibCal' : 'Manually maintained'}
            </span>
          </div>

          {spot.hours ? (
            <>
              <p className="text-[13.5px]">{todayHoursText(spot.hours)}</p>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>
                {openState.state === 'open'
                  ? `Open now until ${openState.until}${openState.restricted ? ' · Wiscard required during this window' : ''}`
                  : openState.state === 'closed'
                    ? `Closed right now${openState.next ? ` — opens ${openState.next}` : ''}`
                    : ''}
              </p>
              {spot.hours.note && (
                <p className="mt-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>
                  {spot.hours.note}
                </p>
              )}
              <details className="mt-2.5">
                <summary className="cursor-pointer text-[12px]" style={{ color: 'var(--muted)' }}>
                  Full week
                </summary>
                <ul className="mt-2 space-y-1">
                  {spot.hours.week.map((ivs, dow) => (
                    <li key={dow} className="flex justify-between text-[12px]">
                      <span style={{ color: 'var(--muted)' }}>{DOW_LABEL[dow]}</span>
                      <span>{ivs.length === 0 ? 'Closed' : ivs.map((iv) => `${iv.open}–${iv.close}`).join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            /* null hours renders as unknown, not closed */
            <p className="unknown-box inline-block rounded-lg px-2.5 py-1.5 text-[12.5px]">Hours unknown · nobody maintains this spot&apos;s schedule yet</p>
          )}

          {/* hours-correction report (UI only for now) */}
          <button
            type="button"
            disabled={hoursReported}
            onClick={() => setHoursReported(true)}
            className="mt-2.5 text-[12px] transition-colors hover:underline disabled:no-underline"
            style={{ color: hoursReported ? 'var(--crowd-1-ink)' : 'var(--muted)' }}
          >
            {hoursReported ? "✓ Noted — we'll double-check" : 'Hours look wrong? Tell us →'}
          </button>
        </section>

        {/* data-quality notes */}
        {(spot.coordsProvisional || spot.statusNote) && (
          <section className="unknown-box rounded-lg px-3 py-2.5 text-[12px]">
            {spot.coordsProvisional && <p>📍 {spot.coordsProvisional}</p>}
            {spot.statusNote && <p className={spot.coordsProvisional ? 'mt-1' : ''}>⚠ {spot.statusNote}</p>}
          </section>
        )}

        <section>
          <Heatmap spotId={spot.id} />
        </section>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: 'var(--muted)' }}>
          {spot.address && <span>{spot.address}</span>}
          {/* Photos & street view live on Google Maps — no hotlinking, no ToS issues */}
          <a href={gmapsUrl(spot)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" style={{ color: 'var(--accent)' }}>
            Open in Google Maps ↗
          </a>
        </p>
      </div>
    </div>
  );
}

function BigStat({ label, value, kind }: { label: string; value: number | null; kind: 'crowd' | 'noise' }) {
  return (
    <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p className="mt-1.5 text-[22px] leading-none tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
        {value === null ? <span style={{ color: 'var(--unknown-ink)', fontSize: '15px' }}>No data</span> : value.toFixed(1)}
      </p>
      <div className="mt-2.5">
        <LevelBar value={value} kind={kind} />
      </div>
    </div>
  );
}
