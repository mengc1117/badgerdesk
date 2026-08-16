'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { postAmenity, RateLimited } from '@/lib/api';
import type { AmenityValue, VoteField } from '@/lib/types';
import { FIELD_QUESTION, NOISE_BASE_OPTIONS, OUTLET_OPTIONS } from '@/lib/ui';

/** One-question micro-survey; field definitions are shown verbatim. */
export function AmenityAsk({
  spotId,
  field,
  onDone,
  onSkip,
  autoFocus,
}: {
  spotId: string;
  field: VoteField;
  onDone: (next: VoteField | null) => void;
  onSkip: () => void;
  autoFocus?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (value: AmenityValue) => postAmenity(spotId, field, value),
    onSuccess: (res) => onDone(res.nextQuestion),
    onError: (e) => setError(e instanceof RateLimited ? e.message : "Didn't go through — try again in a bit"),
  });

  const options: { value: AmenityValue; label: string; short?: string }[] =
    field === 'outlets'
      ? OUTLET_OPTIONS.map((o) => ({ value: o.value, label: o.label, short: o.short }))
      : field === 'noise_base'
        ? NOISE_BASE_OPTIONS.map((o) => ({ value: o.value, label: o.label, short: o.short }))
        : [
            { value: true, label: 'Yes' },
            { value: false, label: 'No' },
          ];

  const isChoice = field === 'outlets' || field === 'noise_base';

  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
      <p className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
        Answer one quick thing?
      </p>
      <p className="mb-3.5 mt-1 text-[15px] font-medium">{FIELD_QUESTION[field]}</p>

      <div className={isChoice ? 'space-y-1.5' : 'flex gap-2'}>
        {options.map((o, i) => (
          <button
            key={String(o.value)}
            type="button"
            autoFocus={autoFocus && i === 0}
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate(o.value);
            }}
            className={`rounded-lg border text-left transition-all hover:border-accent hover:bg-accent-soft disabled:opacity-50 ${
              isChoice ? 'flex w-full items-baseline gap-2.5 px-3 py-2.5' : 'flex-1 px-3 py-2.5 text-center'
            }`}
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            {o.short && (
              <span className="shrink-0 text-[13px] font-medium" style={{ minWidth: '3.5em' }}>
                {o.short}
              </span>
            )}
            <span className={o.short ? 'text-[12.5px]' : 'text-[13.5px] font-medium'} style={o.short ? { color: 'var(--muted)' } : undefined}>
              {o.label}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--accent)' }}>
          {error}
        </p>
      )}

      <div className="mt-3 flex justify-end">
        {/* Skips are not votes */}
        <button type="button" onClick={onSkip} className="text-[12.5px] transition-colors hover:underline" style={{ color: 'var(--muted)' }}>
          Not sure / skip →
        </button>
      </div>
    </div>
  );
}
