import Link from 'next/link';
import { DEMO_MODE, getLive, getSpots } from '@/lib/store';
import { isOpenNow, TZ } from '@/lib/hours';
import { Constellation } from '@/components/landing/Constellation';
import { Marquee } from '@/components/landing/Marquee';
import { ReportDemo } from '@/components/landing/ReportDemo';
import { Reveal } from '@/components/landing/Reveal';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const spots = getSpots();
  const live = await getLive();
  const now = new Date();

  const openCount = spots.filter((s) => isOpenNow(s.hours, now).state === 'open').length;
  const reportedCount = spots.filter((s) => (live[s.id]?.live.reportCount ?? 0) > 0).length;

  const madisonClock = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  return (
    <div className="scene grain relative min-h-dvh overflow-x-hidden">
      {/* ─────────────────────────── nav ─────────────────────────── */}
      <header
        className="fixed inset-x-0 top-0 z-50 backdrop-blur-xl"
        style={{ background: 'linear-gradient(to bottom, oklch(0.145 0.014 62 / 0.88), oklch(0.145 0.014 62 / 0.55) 60%, transparent)' }}
      >
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="relative grid size-7 place-items-center">
              <span className="absolute inset-0 rounded-md" style={{ background: 'var(--scene-accent)', opacity: 0.16 }} />
              <span className="size-2 rounded-full" style={{ background: 'var(--scene-accent)' }} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">BadgerDesk</span>
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-3">
            <a
              href="#how"
              className="hidden rounded-lg px-3 py-2 text-[13.5px] transition-colors sm:block"
              style={{ color: 'var(--scene-muted)' }}
            >
              How it works
            </a>
            <Link
              href="/map"
              className="rounded-lg px-4 py-2 text-[13.5px] font-medium transition-transform hover:scale-[1.03]"
              style={{ background: 'var(--scene-fg)', color: 'oklch(0.16 0.014 62)' }}
            >
              Open the map
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ─────────────────────────── hero ─────────────────────────── */}
        <section className="relative flex min-h-dvh flex-col justify-center overflow-hidden">
          <Constellation spots={spots} live={live} />

          <div
            className="pointer-events-none absolute inset-0 z-[2]"
            style={{
              background:
                'radial-gradient(68% 62% at 4% 50%, oklch(0.145 0.014 62 / 0.93) 0%, oklch(0.145 0.014 62 / 0.66) 40%, transparent 72%)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-52"
            style={{ background: 'linear-gradient(to top, var(--scene-bg), transparent)' }}
          />

          <div className="pointer-events-none relative z-10 mx-auto w-full max-w-[1240px] px-5 pb-28 pt-32 sm:px-8">
            <p
              className="rise mb-7 flex items-center gap-2.5 text-[11.5px] font-medium uppercase tracking-[0.2em]"
              style={{ color: 'var(--scene-muted)', animationDelay: '.05s' }}
            >
              UW–Madison · {spots.length} study spots · {madisonClock} in Madison
            </p>

            <h1 className="display rise text-[clamp(3rem,8.5vw,7rem)]" style={{ animationDelay: '.12s' }}>
              Where to
              <br />
              study right now?
            </h1>

            <p
              className="rise mt-9 max-w-[44ch] text-[16.5px] leading-[1.75] sm:text-[17.5px]"
              style={{ color: 'var(--scene-muted)', animationDelay: '.24s' }}
            >
              Live crowd and noise levels for study spots across campus, reported by the people who are there. No account needed.
            </p>

            <div className="rise mt-10 flex flex-wrap items-center gap-3" style={{ animationDelay: '.34s' }}>
              <Link
                href="/map"
                className="pointer-events-auto group inline-flex items-center gap-2.5 rounded-xl px-6 py-3.5 text-[15px] font-medium shadow-lg transition-all hover:gap-3.5 hover:shadow-xl"
                style={{ background: 'var(--scene-accent)', color: 'oklch(0.15 0.02 40)' }}
              >
                Open the map
                <span aria-hidden="true">→</span>
              </Link>
              <a
                href="#how"
                className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border px-6 py-3.5 text-[15px] transition-colors"
                style={{ borderColor: 'var(--scene-line)', color: 'var(--scene-fg)' }}
              >
                How it works
              </a>
            </div>

            <dl className="rise mt-14 flex flex-wrap gap-x-12 gap-y-6 sm:mt-16" style={{ animationDelay: '.44s' }}>
              <Stat n={openCount} unit={`/ ${spots.length}`} label="open right now" />
              <Stat n={reportedCount} label="reported in the last 3 h" />
            </dl>

            {openCount === 0 && (
              <p className="rise mt-6 max-w-[44ch] text-[13px] leading-[1.7]" style={{ color: 'var(--scene-muted)', animationDelay: '.5s' }}>
                Campus is closed at this hour — spots light up as doors open.
              </p>
            )}
          </div>
        </section>

        <Marquee spots={spots} live={live} />

        {/* ─────────────────────── how it works ─────────────────────── */}
        <section id="how" className="mx-auto max-w-[1240px] scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
          <Reveal>
            <h2 className="display max-w-[18ch] text-[clamp(1.9rem,4.6vw,3.2rem)]">How it works</h2>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                n: '1',
                t: 'Check the map',
                d: 'Markers are colored by current crowd level; a dashed gray marker means no recent data. Click any spot for details, hours and its typical weekly pattern.',
              },
              {
                n: '2',
                t: 'Filter and pick',
                d: 'Set how far you’ll walk, whether it needs to be open now, and the amenities you care about (outlets, group rooms, quiet zones…). Results are ranked by distance, crowd and noise. Filters live in the URL, so links are shareable.',
              },
              {
                n: '3',
                t: 'Report when you’re there',
                d: 'Two taps: how full, how loud. You may get one optional follow-up question about the spot’s amenities. Reports are anonymous and rate-limited per device.',
              },
            ].map((c, i) => (
              <Reveal key={c.n} delay={0.06 * i}>
                <article
                  className="flex h-full flex-col rounded-2xl border p-7"
                  style={{ borderColor: 'var(--scene-line)', background: 'oklch(0.17 0.014 60)' }}
                >
                  <p className="text-[13px] font-medium tabular-nums" style={{ color: 'var(--scene-accent)' }}>
                    {c.n}
                  </p>
                  <h3 className="mt-2 text-[18px] tracking-tight">{c.t}</h3>
                  <p className="mt-3 text-[14px] leading-[1.7]" style={{ color: 'var(--scene-muted)' }}>
                    {c.d}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>

          {/* Reporting, shown rather than described */}
          <div className="mt-16 grid items-center gap-10 lg:grid-cols-[1fr_auto]">
            <Reveal>
              <div className="max-w-[52ch]">
                <h3 className="text-[18px] tracking-tight">About the data</h3>
                <p className="mt-3 text-[14.5px] leading-[1.75]" style={{ color: 'var(--scene-muted)' }}>
                  Crowd and noise are aggregated from recent reports with a time decay, so the numbers reflect roughly the last hour or
                  two. Amenity fields start out unknown and are filled in by reports over time; a field shows how many people
                  have confirmed it. Where there isn&apos;t enough data yet, the app says so instead of guessing.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.08} className="flex justify-center lg:justify-end">
              <ReportDemo />
            </Reveal>
          </div>
        </section>

        {/* ─────────────────────── closing ─────────────────────── */}
        <section className="border-t" style={{ borderColor: 'var(--scene-line)' }}>
          <div className="mx-auto max-w-[1240px] px-5 py-20 text-center sm:px-8">
            <Reveal>
              <Link
                href="/map"
                className="inline-flex items-center gap-2.5 rounded-xl px-8 py-4 text-[16px] font-medium shadow-xl transition-all hover:gap-4"
                style={{ background: 'var(--scene-fg)', color: 'oklch(0.16 0.014 62)' }}
              >
                Open the map
                <span aria-hidden="true">→</span>
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: 'var(--scene-line)' }}>
        <div
          className="mx-auto flex max-w-[1240px] flex-col gap-4 px-5 py-9 text-[12.5px] sm:flex-row sm:items-center sm:justify-between sm:px-8"
          style={{ color: 'var(--scene-muted)' }}
        >
          <p>BadgerDesk · a campus study-spot finder · no personal data collected</p>
          <p className="flex items-center gap-4">
            {DEMO_MODE && (
              <span
                className="rounded-md border-[1.5px] border-dashed px-2 py-1"
                style={{ borderColor: 'oklch(0.45 0.012 260)' }}
                title="Reports are seeded with simulated activity so the demo has data at any hour."
              >
                Showing simulated activity
              </span>
            )}
            <Link href="/map" style={{ color: 'var(--scene-fg)' }}>
              Open the map →
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ n, unit, label }: { n: number; unit?: string; label: string }) {
  return (
    <div>
      <dd className="display text-[32px] leading-none tabular-nums sm:text-[38px]">
        {n}
        {unit && (
          <span className="ml-1 text-[16px]" style={{ color: 'var(--scene-muted)' }}>
            {unit}
          </span>
        )}
      </dd>
      <dt className="mt-2 text-[12.5px]" style={{ color: 'var(--scene-muted)' }}>
        {label}
      </dt>
    </div>
  );
}
