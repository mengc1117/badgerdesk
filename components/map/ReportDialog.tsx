'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postReport, RateLimited, type LiveResponse } from '@/lib/api';
import type { Spot, VoteField } from '@/lib/types';
import { AmenityAsk } from './AmenityAsk';

const CROWD = [
  { v: 1, e: '😌', t: 'Empty' },
  { v: 2, e: '🙂', t: 'Not bad' },
  { v: 3, e: '😐', t: 'Filling up' },
  { v: 4, e: '😖', t: 'Crowded' },
  { v: 5, e: '😱', t: 'Packed' },
];
const NOISE = [
  { v: 1, e: '🤫', t: 'Silent' },
  { v: 2, e: '🔉', t: 'Quiet' },
  { v: 3, e: '🔊', t: 'Low hum' },
  { v: 4, e: '🗣️', t: 'Chatty' },
  { v: 5, e: '📢', t: 'Loud' },
];

/** Report dialog: crowd + noise, then one optional follow-up question. */
export function ReportDialog({ spot, open, onOpenChange }: { spot: Spot | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [crowd, setCrowd] = useState<number | null>(null);
  const [noise, setNoise] = useState<number | null>(null);
  const [question, setQuestion] = useState<VoteField | null>(null);
  const [phase, setPhase] = useState<'form' | 'done'>('form');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCrowd(null);
      setNoise(null);
      setQuestion(null);
      setPhase('form');
      setError(null);
    }
  }, [open, spot?.id]);

  /** Optimistic update: patch the cache immediately, roll back on error. */
  const mutation = useMutation({
    mutationFn: () => postReport(spot!.id, { crowd: crowd ?? undefined, noise: noise ?? undefined }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['live'] });
      const prev = qc.getQueryData<LiveResponse>(['live']);
      if (prev && spot) {
        qc.setQueryData<LiveResponse>(['live'], {
          ...prev,
          spots: {
            ...prev.spots,
            [spot.id]: {
              ...prev.spots[spot.id],
              live: {
                ...prev.spots[spot.id].live,
                crowd: crowd ?? prev.spots[spot.id].live.crowd,
                noise: noise ?? prev.spots[spot.id].live.noise,
                conf: Math.max(0.6, prev.spots[spot.id].live.conf),
                lastReportMin: 0,
                reportCount: prev.spots[spot.id].live.reportCount + 1,
              },
            },
          },
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['live'], ctx.prev);
      setError(e instanceof RateLimited ? e.message : "Didn't go through — try again in a bit");
    },
    onSuccess: (res) => {
      // Replace the optimistic entry with the server's aggregate
      const prev = qc.getQueryData<LiveResponse>(['live']);
      if (prev && spot) qc.setQueryData<LiveResponse>(['live'], { ...prev, spots: { ...prev.spots, [spot.id]: res.live } });
      setQuestion(res.nextQuestion);
      setPhase('done');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['live'] }),
  });

  if (!spot) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] backdrop-blur-[2px]" style={{ background: 'oklch(0.2 0.02 260 / 0.42)' }} />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[101] w-[min(94vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 shadow-2xl"
          style={{ background: 'var(--bg)', borderColor: 'var(--line)', boxShadow: 'var(--shadow-pop)' }}
        >
          <Dialog.Title className="text-[15px] font-semibold tracking-tight">{spot.name}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>
            {phase === 'form' ? 'Either one works on its own — no need to fill both' : 'Your report updated this spot'}
          </Dialog.Description>

          {phase === 'form' ? (
            <div className="mt-5 space-y-5">
              <Choice legend="How full is it?" options={CROWD} value={crowd} onChange={setCrowd} />
              <Choice legend="How loud is it?" options={NOISE} value={noise} onChange={setNoise} />

              {error && (
                <p role="alert" className="text-[12.5px]" style={{ color: 'var(--accent)' }}>
                  {error}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={(crowd === null && noise === null) || mutation.isPending}
                  onClick={() => {
                    setError(null);
                    mutation.mutate();
                  }}
                  className="rounded-lg px-5 py-2.5 text-[14px] font-medium transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  {mutation.isPending ? 'Submitting…' : 'Submit'}
                </button>
                <Dialog.Close className="text-[13px] transition-colors hover:underline" style={{ color: 'var(--muted)' }}>
                  Skip →
                </Dialog.Close>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4" style={{ animation: 'rise .4s cubic-bezier(.16,1,.3,1) both' }}>
              <p className="flex items-center gap-2 text-[14px]" style={{ color: 'var(--crowd-1-ink)' }}>
                <span aria-hidden="true">✓</span> Updated!
              </p>

              {question ? (
                <AmenityAsk
                  spotId={spot.id}
                  field={question}
                  autoFocus
                  onDone={() => {
                    qc.invalidateQueries({ queryKey: ['live'] });
                    onOpenChange(false);
                  }}
                  onSkip={() => onOpenChange(false)}
                />
              ) : (
                <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
                  You&apos;ve filled in everything for this spot — thanks.
                </p>
              )}

              {!question && (
                <Dialog.Close
                  className="w-full rounded-lg border py-2.5 text-[13.5px] transition-colors"
                  style={{ borderColor: 'var(--line)' }}
                >
                  Close
                </Dialog.Close>
              )}
            </div>
          )}

          <Dialog.Close
            aria-label="Close"
            className="absolute right-3.5 top-3.5 grid size-7 place-items-center rounded-lg text-[15px] transition-colors hover:bg-surface-2"
            style={{ color: 'var(--muted)' }}
          >
            ✕
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Choice({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { v: number; e: string; t: string }[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px]" style={{ color: 'var(--muted)' }}>
        {legend}
      </legend>
      <div className="flex gap-1.5">
        {options.map((o) => {
          const on = value === o.v;
          return (
            <button
              key={o.v}
              type="button"
              aria-pressed={on}
              aria-label={o.t}
              onClick={() => onChange(on ? null : o.v)}
              className="flex flex-1 flex-col items-center gap-1 rounded-xl border py-2 transition-all"
              style={{
                borderColor: on ? 'var(--accent)' : 'var(--line)',
                background: on ? 'var(--accent-soft)' : 'var(--surface)',
                transform: on ? 'translateY(-2px)' : undefined,
              }}
            >
              <span className="text-[19px]" aria-hidden="true">
                {o.e}
              </span>
              <span className="text-[10.5px]" style={{ color: on ? 'var(--accent)' : 'var(--muted)' }}>
                {o.t}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
