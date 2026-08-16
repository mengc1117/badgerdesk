/**
 * Storage facade. Two interchangeable backends behind one async interface:
 *
 *   file store (this file)  — zero-config local dev; in-memory Map + JSON
 *                             persistence under .data/. Semantics mirror the
 *                             Postgres schema 1:1 (append-only reports,
 *                             composite-PK upsert votes, rate limits).
 *   supabase-store.ts       — production; selected automatically when
 *                             SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 *
 * Aggregation is shared (lib/aggregate.ts), so both backends produce
 * identical LiveMaps from identical rows.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AmenityValue, LiveMap, SpotLive, Verdict, VoteField } from './types';
import { VOTE_FIELDS } from './types';
import type { HourlyStat } from './estimate';
import { aggregate, pickNextQuestion, type RawReport } from './aggregate';
import { getSpots } from './spots';
import { supabaseEnabled, getLiveSB, getHeatmapSB, addReportSB, addAmenityVoteSB } from './supabase-store';

export { getSpots };

/* ────────────────────────── config ────────────────────────── */

/** File-backend demo seeding. BADGERDESK_DEMO=0 disables it; always off when Supabase is configured. */
export const DEMO_MODE = process.env.BADGERDESK_DEMO !== '0' && !supabaseEnabled;

/** Never persist under Vitest, so tests can't dirty .data/. */
const PERSIST = process.env.BADGERDESK_PERSIST !== '0' && !process.env.VITEST;

const RATE = {
  /** File backend: one report per spot per device per 30 min. (Supabase uses an hourly unique constraint.) */
  reportCooldownMin: 30,
  /** One device: at most 40 write ops per day. */
  dailyOps: 40,
};

/* ────────────────────────── tables ────────────────────────── */

type Report = { id: number; spotId: string; deviceId: string; crowd: number | null; noise: number | null; createdAt: number };
type Db = {
  reports: Report[];
  /** key = `${spotId}|${deviceId}|${field}` — composite PK, upsert semantics */
  amenityVotes: Map<string, AmenityValue>;
  hourly: HourlyStat[];
  nextId: number;
  /** Written only by seedDemo. Stays 0 outside demo mode. */
  demoSeededAt: number;
};

const DATA_DIR = resolve(process.cwd(), '.data');
const DATA_FILE = resolve(DATA_DIR, 'store.json');

declare global {
  var __badgerdeskDb: Db | undefined;
}

function persist(db: Db) {
  if (!PERSIST) return;
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      DATA_FILE,
      JSON.stringify({
        reports: db.reports,
        amenityVotes: [...db.amenityVotes],
        hourly: db.hourly,
        nextId: db.nextId,
        demoSeededAt: db.demoSeededAt,
      }),
    );
  } catch {
    // Read-only filesystems (serverless) degrade to memory-only; fine.
  }
}

function load(): Db | null {
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    return {
      reports: raw.reports ?? [],
      amenityVotes: new Map(raw.amenityVotes ?? []),
      hourly: raw.hourly ?? [],
      nextId: raw.nextId ?? 1,
      demoSeededAt: raw.demoSeededAt ?? 0,
    };
  } catch {
    return null;
  }
}

/* ────────────────────── demo activity generator ────────────────────── */

/** Deterministic PRNG: the same seed always yields the same demo data. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hour12: false });
/** Demo timestamps must follow Madison local time or they contradict hours.json. */
const chicagoHour = (ms: number) => Number(hourFmt.format(new Date(ms))) % 24;

/** Daily traffic curve: 2 pm main peak, 8 pm secondary, empty overnight. */
function diurnal(hour: number): number {
  const a = Math.exp(-((hour - 14) ** 2) / 18);
  const b = 0.85 * Math.exp(-((hour - 20) ** 2) / 8);
  return Math.min(1, a + b);
}

const NOISE_BASE_BY_CATEGORY: Record<string, number> = { library: 1.6, academic: 2.8, union: 4.1, cafe: 3.8, other: 2.6 };

function seedDemo(db: Db) {
  const spots = getSpots();
  const now = Date.now();

  db.reports = db.reports.filter((r) => !r.deviceId.startsWith('demo-'));
  for (const k of [...db.amenityVotes.keys()]) if (k.includes('|demo-')) db.amenityVotes.delete(k);
  db.hourly = [];

  for (const spot of spots) {
    const rnd = mulberry32(hashStr(spot.id));
    const popularity = 0.45 + rnd() * 0.55;
    const noiseBase = NOISE_BASE_BY_CATEGORY[spot.category] ?? 2.5;

    /* 7×24 historical stats */
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const weekend = dow === 0 || dow === 6 ? 0.7 : 1;
        const c = 1 + 4 * diurnal(hour) * popularity * weekend;
        // Leave some cells at zero samples (rendered as unknown)
        const nSamples = hour < 6 || rnd() < 0.12 ? 0 : Math.floor(2 + rnd() * 22);
        db.hourly.push({
          spotId: spot.id,
          dow,
          hour,
          crowdMean: nSamples ? Math.min(5, Math.max(1, c + (rnd() - 0.5) * 0.6)) : null,
          noiseMean: nSamples ? Math.min(5, Math.max(1, noiseBase + (rnd() - 0.5) * 0.8)) : null,
          nSamples,
        });
      }
    }

    /* Recent reports: ~2/3 of spots have some; the rest stay "no reports yet" */
    const hasReports = rnd() >= 0.34;
    const n = hasReports ? 1 + Math.floor(rnd() * 5) : 0;
    for (let i = 0; i < n; i++) {
      const ageMin = Math.floor(rnd() * 150);
      const hour = chicagoHour(now - ageMin * 60_000);
      const c = Math.min(5, Math.max(1, Math.round(1 + 4 * diurnal(hour) * popularity + (rnd() - 0.5) * 1.4)));
      const ns = Math.min(5, Math.max(1, Math.round(noiseBase + (rnd() - 0.5) * 1.6)));
      db.reports.push({
        id: db.nextId++,
        spotId: spot.id,
        deviceId: `demo-${spot.id}-${i}`,
        crowd: c,
        noise: rnd() < 0.85 ? ns : null,
        createdAt: now - ageMin * 60_000,
      });
    }

    /* Amenity votes: leave many unknowns, produce all verdict states */
    for (const field of VOTE_FIELDS) {
      const roll = rnd();
      if (roll < 0.42) continue;

      const truth = demoTruth(spot.category, field, rnd);
      let votes: number;
      let conflict = false;
      if (roll < 0.58) votes = 1;
      else if (roll < 0.68) votes = 2;
      else if (roll < 0.74) { votes = 4; conflict = true; } // conflicting: 2 vs 2
      else votes = 3 + Math.floor(rnd() * 4); // confirmed

      for (let i = 0; i < votes; i++) {
        const flip = conflict ? i % 2 === 1 : rnd() < 0.12;
        db.amenityVotes.set(`${spot.id}|demo-${field}-${i}|${field}`, flip ? demoFlip(field, truth) : truth);
      }
    }
  }

  db.demoSeededAt = now;
}

function demoTruth(category: string, field: VoteField, rnd: () => number): AmenityValue {
  switch (field) {
    case 'outlets': {
      const t: AmenityValue[] = ['none', 'sparse', 'moderate', 'abundant'];
      const bias = category === 'library' ? 2 : category === 'cafe' ? 0 : 1;
      return t[Math.min(3, bias + Math.floor(rnd() * 2))];
    }
    case 'noise_base': {
      const base = NOISE_BASE_BY_CATEGORY[category] ?? 2.5;
      return Math.min(5, Math.max(1, Math.round(base + (rnd() - 0.5) * 1.2)));
    }
    case 'group_rooms': return category === 'library' ? rnd() < 0.6 : rnd() < 0.2;
    case 'silent_zone': return category === 'library' ? rnd() < 0.55 : rnd() < 0.1;
    case 'natural_light': return rnd() < 0.6;
    case 'food_ok': return category === 'library' ? rnd() < 0.35 : rnd() < 0.85;
    case 'coffee': return category === 'cafe' ? true : rnd() < 0.45;
    case 'restroom': return rnd() < 0.9;
    case 'needs_wiscard': return rnd() < 0.22;
  }
}

function demoFlip(field: VoteField, v: AmenityValue): AmenityValue {
  if (field === 'outlets') {
    const t: AmenityValue[] = ['none', 'sparse', 'moderate', 'abundant'];
    return t[(t.indexOf(v) + 1) % 4];
  }
  if (field === 'noise_base') return Math.min(5, Math.max(1, (v as number) + 1));
  return !(v as boolean);
}

/* ────────────────────────── init ────────────────────────── */

function db(): Db {
  if (!globalThis.__badgerdeskDb) {
    globalThis.__badgerdeskDb = load() ?? { reports: [], amenityVotes: new Map(), hourly: [], nextId: 1, demoSeededAt: 0 };
  }
  const d = globalThis.__badgerdeskDb;
  // Reseed stale demo data every 90 min; `|| 0` guards legacy persisted values
  if (DEMO_MODE && Date.now() - (d.demoSeededAt || 0) > 90 * 60_000) {
    seedDemo(d);
    persist(d);
  }
  return d;
}

/* ────────────────────── file-backend internals ────────────────────── */

function voteMapOf(d: Db): Map<string, AmenityValue[]> {
  const m = new Map<string, AmenityValue[]>();
  for (const [key, value] of d.amenityVotes) {
    const [spotId, , field] = key.split('|');
    const k = `${spotId}|${field}`;
    const arr = m.get(k);
    if (arr) arr.push(value);
    else m.set(k, [value]);
  }
  return m;
}

function getLiveFile(now: Date): LiveMap {
  const d = db();
  const raw: RawReport[] = d.reports.map((r) => ({ spotId: r.spotId, crowd: r.crowd, noise: r.noise, createdAt: r.createdAt }));
  return aggregate(getSpots(), raw, voteMapOf(d), d.hourly, now);
}

type RateResult = { ok: true } | { ok: false; retryAfterSec: number; reason: string };

function checkRate(deviceId: string, spotId: string | null, kind: 'report' | 'amenity'): RateResult {
  const d = db();
  const now = Date.now();
  const dayAgo = now - 24 * 3600_000;

  const ops = d.reports.filter((r) => r.deviceId === deviceId && r.createdAt > dayAgo).length + countRecentVotes(deviceId);
  if (ops >= RATE.dailyOps) {
    return { ok: false, retryAfterSec: 3600, reason: 'Daily contribution limit reached — thanks for the enthusiasm, try again tomorrow' };
  }

  if (kind === 'report' && spotId) {
    const last = d.reports
      .filter((r) => r.deviceId === deviceId && r.spotId === spotId)
      .reduce((m, r) => Math.max(m, r.createdAt), 0);
    const elapsed = (now - last) / 60_000;
    if (last && elapsed < RATE.reportCooldownMin) {
      return {
        ok: false,
        retryAfterSec: Math.ceil((RATE.reportCooldownMin - elapsed) * 60),
        reason: `You already reported this spot — try again in ${Math.ceil(RATE.reportCooldownMin - elapsed)} min`,
      };
    }
  }

  return { ok: true };
}

const voteTimes = new Map<string, number[]>();
function countRecentVotes(deviceId: string): number {
  const cutoff = Date.now() - 24 * 3600_000;
  const arr = (voteTimes.get(deviceId) ?? []).filter((t) => t > cutoff);
  voteTimes.set(deviceId, arr);
  return arr.length;
}

function answeredByDevice(spotId: string, deviceId: string): Set<VoteField> {
  const d = db();
  const set = new Set<VoteField>();
  for (const f of VOTE_FIELDS) if (d.amenityVotes.has(`${spotId}|${deviceId}|${f}`)) set.add(f);
  return set;
}

function clampInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

/* ────────────────────────── public async facade ────────────────────────── */

export async function getLive(now: Date = new Date()): Promise<LiveMap> {
  return supabaseEnabled ? getLiveSB(now) : getLiveFile(now);
}

export async function getSpotLive(spotId: string, now: Date = new Date()): Promise<SpotLive | null> {
  return (await getLive(now))[spotId] ?? null;
}

/** 7×24 heatmap cells (§9.5). */
export async function getHeatmap(spotId: string): Promise<{ dow: number; hour: number; crowd: number | null; n: number }[]> {
  if (supabaseEnabled) return getHeatmapSB(spotId);
  return db()
    .hourly.filter((h) => h.spotId === spotId)
    .map((h) => ({ dow: h.dow, hour: h.hour, crowd: h.crowdMean, n: h.nSamples }));
}

export async function addReport(
  spotId: string,
  deviceId: string,
  body: { crowd?: number | null; noise?: number | null },
): Promise<{ ok: true; live: SpotLive; nextQuestion: VoteField | null } | { ok: false; retryAfterSec: number; reason: string }> {
  const crowd = clampInt(body.crowd);
  const noise = clampInt(body.noise);
  if (crowd === null && noise === null) throw new Error('At least one of crowd / noise is required');

  if (supabaseEnabled) return addReportSB(spotId, deviceId, { crowd, noise });

  const rate = checkRate(deviceId, spotId, 'report');
  if (!rate.ok) return rate;

  const d = db();
  d.reports.push({ id: d.nextId++, spotId, deviceId, crowd, noise, createdAt: Date.now() });
  persist(d);

  const live = getLiveFile(new Date())[spotId];
  return { ok: true, live, nextQuestion: pickNextQuestion(live.amenities, answeredByDevice(spotId, deviceId)) };
}

export async function addAmenityVote(
  spotId: string,
  deviceId: string,
  field: VoteField,
  value: AmenityValue,
): Promise<
  { ok: true; verdict: Verdict; live: SpotLive; nextQuestion: VoteField | null } | { ok: false; retryAfterSec: number; reason: string }
> {
  if (supabaseEnabled) return addAmenityVoteSB(spotId, deviceId, field, value);

  const rate = checkRate(deviceId, null, 'amenity');
  if (!rate.ok) return rate;

  const d = db();
  d.amenityVotes.set(`${spotId}|${deviceId}|${field}`, value);
  voteTimes.set(deviceId, [...(voteTimes.get(deviceId) ?? []), Date.now()]);
  persist(d);

  const live = getLiveFile(new Date())[spotId];
  return {
    ok: true,
    verdict: live.amenities[field] ?? { state: 'unknown' },
    live,
    nextQuestion: pickNextQuestion(live.amenities, answeredByDevice(spotId, deviceId)),
  };
}
