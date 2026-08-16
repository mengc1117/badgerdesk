/**
 * Simulated activity generator.
 *
 * Solves the cold-start problem for a demo project honestly: a GitHub Actions
 * cron runs this hourly against the deployed site, posting a handful of
 * reports that follow realistic daily patterns (libraries fill up at 2 pm,
 * empty out overnight, cafés buzz on weekends). Recruiters always land on a
 * live-looking map, and the two-window realtime demo works at any hour.
 *
 * The README states plainly that activity is simulated — pretending it's real
 * traffic would be a lie; engineering around the cold start is a feature.
 *
 *   node scripts/simulate.mjs --url https://your-app.vercel.app [--burst 8]
 *   node scripts/simulate.mjs --url http://localhost:3000 --burst 20
 *
 * Goes through the public HTTP API (same code path as real users), so it
 * works against either storage backend and exercises rate limiting too.
 */
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const BASE = (flag('url') ?? process.env.DEPLOY_URL ?? '').replace(/\/$/, '');
if (!BASE) {
  console.error('Usage: node scripts/simulate.mjs --url https://your-app.example [--burst 8]');
  process.exit(1);
}
const BURST = Number(flag('burst', '8'));

/* ── realistic daily pattern (Madison local time) ── */

const chicagoHour = () =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hour12: false }).format(new Date())) % 24;
const chicagoDow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).getDay();

/** 2 pm main peak, 8 pm secondary, dead overnight. */
const diurnal = (h) => Math.min(1, Math.exp(-((h - 14) ** 2) / 18) + 0.85 * Math.exp(-((h - 20) ** 2) / 8));

const NOISE_BASE = { library: 1.6, academic: 2.8, union: 4.1, cafe: 3.8, other: 2.6 };
const clamp15 = (v) => Math.min(5, Math.max(1, Math.round(v)));
const jitter = (amp) => (Math.random() - 0.5) * 2 * amp;

/** Stable per-spot popularity so the same buildings are reliably busy. */
const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

/* ── main ── */

const res = await fetch(`${BASE}/spots.json`);
if (!res.ok) {
  console.error(`✗ ${BASE}/spots.json → ${res.status}`);
  process.exit(1);
}
const { spots } = await res.json();

const hour = chicagoHour();
const dow = chicagoDow();
const weekend = dow === 0 || dow === 6;
const activity = diurnal(hour);

// Overnight the campus is asleep: send at most one straggler report.
const n = Math.max(activity < 0.08 ? (Math.random() < 0.4 ? 1 : 0) : 1, Math.round(BURST * activity));

const AMENITY_FIELDS = ['outlets', 'group_rooms', 'silent_zone', 'natural_light', 'food_ok', 'coffee', 'restroom', 'needs_wiscard', 'noise_base'];
const OUTLET_BY_CAT = { library: ['moderate', 'abundant'], cafe: ['none', 'sparse'], academic: ['sparse', 'moderate'], union: ['sparse', 'moderate'], other: ['sparse', 'moderate'] };

let sent = 0;
let votes = 0;
let limited = 0;

for (let i = 0; i < n; i++) {
  // Weight spot choice by popularity × (cafés livelier on weekends)
  const weighted = spots.map((s) => {
    let w = 0.4 + hashStr(s.id) * 0.6;
    if (weekend && s.category === 'cafe') w *= 1.6;
    if (weekend && s.category === 'library') w *= 0.7;
    return { s, w };
  });
  const total = weighted.reduce((a, x) => a + x.w, 0);
  let roll = Math.random() * total;
  const spot = weighted.find((x) => (roll -= x.w) <= 0)?.s ?? spots[0];

  const popularity = 0.45 + hashStr(spot.id) * 0.55;
  const crowd = clamp15(1 + 4 * activity * popularity * (weekend ? 0.75 : 1) + jitter(0.9));
  const noise = clamp15((NOISE_BASE[spot.category] ?? 2.5) + jitter(1));

  const deviceId = randomUUID(); // each simulated report is its own anonymous "device"
  const r = await fetch(`${BASE}/api/spots/${spot.id}/reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-id': deviceId },
    body: JSON.stringify(Math.random() < 0.85 ? { crowd, noise } : { crowd }),
  });

  if (r.status === 429) {
    limited++;
    continue;
  }
  if (!r.ok) {
    console.error(`  ✗ report ${spot.id} → ${r.status}`);
    continue;
  }
  sent++;

  // ~20%: also answer one amenity question, like a real piggyback flow
  if (Math.random() < 0.2) {
    const field = AMENITY_FIELDS[Math.floor(Math.random() * AMENITY_FIELDS.length)];
    const value =
      field === 'outlets'
        ? (OUTLET_BY_CAT[spot.category] ?? ['sparse'])[Math.floor(Math.random() * 2) % 2]
        : field === 'noise_base'
          ? clamp15((NOISE_BASE[spot.category] ?? 2.5) + jitter(0.8))
          : Math.random() < 0.6;
    const v = await fetch(`${BASE}/api/spots/${spot.id}/amenities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': deviceId },
      body: JSON.stringify({ field, value }),
    });
    if (v.ok) votes++;
  }
}

console.log(
  `✓ ${BASE} — hour ${hour} (activity ${(activity * 100).toFixed(0)}%): ${sent} reports, ${votes} amenity votes${limited ? `, ${limited} rate-limited` : ''}`,
);
