'use client';

import type { Live, VoteField, Verdict } from '@/lib/types';
import { AMENITY_FIELDS } from '@/lib/types';
import { crowdInk, crowdWord, noiseWord, FIELD_ICON, verdictText } from '@/lib/ui';
import { AMENITY_LABEL } from '@/lib/scoring';

/* ───────────────── confidence badge ───────────────── */

export function ConfidenceBadge({ live, className = '' }: { live: Live; className?: string }) {
  const { conf, crowd, lastReportMin, reportCount } = live;

  // "No data" keys off the value being null; confidence tiers apply otherwise
  const [icon, text, tone] =
    crowd === null
      ? ['⬜', 'No data yet · be the first to report', 'var(--unknown-ink)']
      : conf >= 0.6
        ? ['🟢', lastReportMin !== null && lastReportMin <= 2 ? 'Updated just now' : `Updated ${lastReportMin} min ago`, 'var(--crowd-1-ink)']
        : conf >= 0.25
          ? ['🟡', `${lastReportMin} min ago · ${reportCount} report${reportCount === 1 ? '' : 's'}`, 'var(--crowd-3-ink)']
          : ['⚪', 'Estimated from history · no reports yet', 'var(--muted)'];

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] ${className}`} style={{ color: tone }}>
      <span aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}

/* ───────────────── crowd / noise level bar ───────────────── */

export function LevelBar({
  value,
  kind,
  showWord = true,
}: {
  value: number | null;
  kind: 'crowd' | 'noise';
  showWord?: boolean;
}) {
  const word = kind === 'crowd' ? crowdWord(value) : noiseWord(value);
  const n = value === null ? 0 : Math.min(5, Math.max(1, Math.round(value)));
  const ink = kind === 'crowd' ? crowdInk(value) : value === null ? 'var(--unknown-ink)' : 'var(--fg)';

  return (
    <span
      className="inline-flex items-center gap-2 text-[12.5px]"
      role="img"
      aria-label={`${kind === 'crowd' ? 'Crowd' : 'Noise'}: ${word}${value === null ? '' : `, level ${n} of 5`}`}
    >
      <span className="flex gap-[3px]" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`size-[7px] rounded-full ${value === null ? 'border-[1.5px] border-dashed' : ''}`}
            style={
              value === null
                ? { borderColor: 'var(--unknown)' }
                : { background: i <= n ? ink : 'var(--line-strong)', opacity: i <= n ? 1 : 0.55 }
            }
          />
        ))}
      </span>
      {showWord && <span style={{ color: ink }}>{word}</span>}
    </span>
  );
}

/* ───────────────── amenity verdict chip ───────────────── */

export function VerdictChip({
  field,
  verdict,
  onFill,
  size = 'sm',
}: {
  field: VoteField;
  verdict: Verdict | undefined;
  onFill?: (field: VoteField) => void;
  size?: 'sm' | 'md';
}) {
  const label = AMENITY_LABEL[field as keyof typeof AMENITY_LABEL] ?? 'Usual noise';
  const pad = size === 'sm' ? 'px-2 py-1 text-[11.5px]' : 'px-2.5 py-1.5 text-[12.5px]';
  const v = verdict ?? { state: 'unknown' as const };

  /* Unknown: the whole chip is the fill-in entry point */
  if (v.state === 'unknown') {
    return (
      <button
        type="button"
        onClick={() => onFill?.(field)}
        disabled={!onFill}
        className={`unknown-box inline-flex items-center gap-1.5 rounded-lg transition-colors ${pad} disabled:cursor-default`}
        aria-label={`${label} unknown${onFill ? ' — click to fill it in' : ''}`}
      >
        <span aria-hidden="true">❓</span>
        {label} unknown
      </button>
    );
  }

  if (v.state === 'conflicting') {
    return (
      <button
        type="button"
        onClick={() => onFill?.(field)}
        disabled={!onFill}
        className={`inline-flex items-center gap-1.5 rounded-lg border transition-colors ${pad} disabled:cursor-default`}
        style={{ borderColor: 'var(--crowd-3)', color: 'var(--crowd-3-ink)', background: 'color-mix(in oklch, var(--crowd-3) 10%, transparent)' }}
        aria-label={`${label} disputed: ${v.breakdown.map(([val, n]) => `${n} say ${val}`).join(', ')}${onFill ? ' — click to vote' : ''}`}
      >
        <span aria-hidden="true">⚠</span>
        {label} disputed ({v.breakdown.slice(0, 2).map(([, n]) => n).join(' vs ')})
      </button>
    );
  }

  const tentative = v.state === 'tentative';
  return (
    <button
      type="button"
      onClick={() => onFill?.(field)}
      disabled={!onFill}
      className={`inline-flex items-center gap-1.5 rounded-lg border transition-colors ${pad} ${tentative ? 'tentative' : ''} disabled:cursor-default`}
      style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
      aria-label={`${label}: ${verdictText(field, v)}${tentative ? `, only ${v.votes} report${v.votes === 1 ? '' : 's'}` : `, confirmed by ${v.votes}`}${onFill ? ' — click to change' : ''}`}
    >
      <span aria-hidden="true">{FIELD_ICON[field]}</span>
      {label} {verdictText(field, v)}
      {tentative && (
        <span className="rounded px-1 py-px text-[10px]" style={{ background: 'var(--line)' }}>
          {v.votes} report{v.votes === 1 ? '' : 's'}
        </span>
      )}
    </button>
  );
}

/* ───────────────── completeness ───────────────── */

export function Completeness({ n, onClick }: { n: number; onClick?: () => void }) {
  const total = AMENITY_FIELDS.length;
  const pct = (n / total) * 100;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className="group flex w-full items-center gap-2 text-left"
      aria-label={`Profile ${n} of ${total} fields known${onClick ? ' — click to help fill in' : ''}`}
    >
      <span className="shrink-0 text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>
        Info {n}/{total}
      </span>
      <span className="h-[3px] w-14 shrink-0 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: n === total ? 'var(--crowd-1-ink)' : `color-mix(in oklch, var(--accent) 78%, var(--line))`,
          }}
        />
      </span>
      {onClick && (
        <span className="ml-auto shrink-0 text-[11px] transition-colors group-hover:underline" style={{ color: 'var(--accent)' }}>
          Help fill in →
        </span>
      )}
    </Tag>
  );
}
