'use client';

import { useEffect, useReducer } from 'react';

const CROWD = ['😌', '🙂', '😐', '😖', '😱'];
const NOISE = ['🤫', '🔉', '🔊', '🗣️', '📢'];

/** Step durations: idle · crowd picked · noise picked · submitting · success · follow-up picked. */
const STEPS = [1800, 1100, 1100, 700, 1900, 2200];

/** Self-playing demo of the report flow. */
export function ReportDemo() {
  const [step, next] = useReducer((s: number) => (s + 1) % 6, 0);

  useEffect(() => {
    const t = setTimeout(next, STEPS[step]);
    return () => clearTimeout(t);
  }, [step]);

  const done = step >= 4;

  return (
    <div
      className="relative w-full max-w-[340px] overflow-hidden rounded-2xl border p-5 shadow-2xl"
      style={{ borderColor: 'var(--scene-line)', background: 'var(--scene-bg-2)' }}
      role="img"
      aria-label="Reporting demo: pick crowd and noise levels, submit, then the UI asks one amenity question"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="size-1.5 rounded-full" style={{ background: 'var(--scene-accent)' }} />
        <span className="text-[13px] font-medium tracking-tight">College Library — 3F North</span>
      </div>

      {!done ? (
        <div className="space-y-5">
          <Row label="How full is it?" emojis={CROWD} picked={step >= 1 ? 2 : -1} />
          <Row label="How loud is it?" emojis={NOISE} picked={step >= 2 ? 0 : -1} />
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              tabIndex={-1}
              className="rounded-lg px-4 py-2 text-[13px] font-medium transition-all"
              style={{
                background: step >= 3 ? 'var(--scene-accent)' : 'oklch(0.28 0.02 60)',
                color: step >= 3 ? 'oklch(0.16 0.02 40)' : 'var(--scene-muted)',
                transform: step === 3 ? 'scale(0.96)' : 'none',
              }}
            >
              Submit
            </button>
            <span className="text-[12px]" style={{ color: 'var(--scene-muted)' }}>
              Skip →
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-5" style={{ animation: 'rise .5s cubic-bezier(.16,1,.3,1) both' }}>
          <div className="flex items-center gap-2 text-[15px]" style={{ color: 'oklch(0.78 0.14 150)' }}>
            <span>✓</span>
            <span>Updated! Your report changed this spot</span>
          </div>
          <div className="h-px" style={{ background: 'var(--scene-line)' }} />
          <div>
            <p className="text-[12px]" style={{ color: 'var(--scene-muted)' }}>
              Answer one quick thing?
            </p>
            <p className="mb-3 mt-1 text-[15px]">How are the outlets here?</p>
            <div className="flex flex-wrap gap-2">
              {['None', 'Few', 'Some', 'Plenty'].map((t, i) => (
                <span
                  key={t}
                  className="rounded-lg border px-3 py-1.5 text-[12.5px] transition-all"
                  style={
                    step === 5 && i === 3
                      ? { borderColor: 'var(--scene-accent)', background: 'oklch(0.32 0.07 32)', color: 'oklch(0.92 0.05 40)' }
                      : { borderColor: 'var(--scene-line)', color: 'var(--scene-muted)' }
                  }
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-3 text-right text-[12px]" style={{ color: 'var(--scene-muted)' }}>
              Not sure →
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, emojis, picked }: { label: string; emojis: string[]; picked: number }) {
  return (
    <div>
      <p className="mb-2 text-[13px]" style={{ color: 'var(--scene-muted)' }}>
        {label}
      </p>
      <div className="flex gap-1.5">
        {emojis.map((e, i) => (
          <span
            key={i}
            className="grid size-11 place-items-center rounded-xl border text-[19px] transition-all duration-300"
            style={
              picked === i
                ? { borderColor: 'var(--scene-accent)', background: 'oklch(0.3 0.06 32)', transform: 'translateY(-2px)' }
                : { borderColor: 'var(--scene-line)', opacity: picked >= 0 ? 0.42 : 0.8 }
            }
          >
            {e}
          </span>
        ))}
      </div>
    </div>
  );
}
