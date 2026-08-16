export type Category = 'library' | 'union' | 'academic' | 'cafe' | 'other';

export type HoursInterval = { open: string; close: string; restricted?: boolean };
export type Hours = {
  tz: string;
  /** Index 0 = Sunday (matches Date#getDay). Empty array = closed that day. */
  week: HoursInterval[][];
  note?: string | null;
};

export type Spot = {
  id: string;
  name: string;
  building: string;
  floorHint: string | null;
  category: Category;
  address: string | null;
  lat: number;
  lng: number;
  hoursSource: 'libcal' | 'manual';
  /** null = unknown; never rendered as "closed". */
  hours: Hours | null;
  coordsProvisional?: string;
  statusNote?: string;
};

/* ─────────────────────────── amenities ─────────────────────────── */

export type OutletLevel = 'none' | 'sparse' | 'moderate' | 'abundant';

/** The 8 amenity fields; denominator of the "Info x/8" completeness. */
export const AMENITY_FIELDS = [
  'outlets',
  'group_rooms',
  'silent_zone',
  'natural_light',
  'food_ok',
  'coffee',
  'restroom',
  'needs_wiscard',
] as const;
export type AmenityField = (typeof AMENITY_FIELDS)[number];

/** noise_base ("how loud is it usually", 1–5) is votable but excluded from completeness; it feeds the noise prior. */
export type VoteField = AmenityField | 'noise_base';
export const VOTE_FIELDS: VoteField[] = [...AMENITY_FIELDS, 'noise_base'];

export type AmenityValue = OutletLevel | boolean | number;

export type Verdict<T = AmenityValue> =
  | { state: 'unknown' }
  | { state: 'tentative'; value: T; votes: number }
  | { state: 'confirmed'; value: T; votes: number; agreement: number }
  /** ≥4 votes with <2/3 agreement. */
  | { state: 'conflicting'; value: T; votes: number; agreement: number; breakdown: [string, number][] };

export type VerdictState = Verdict['state'];

/* ─────────────────────────── live ─────────────────────────── */

export type Live = {
  crowd: number | null;
  noise: number | null;
  /** Crowd confidence, 0–1. */
  conf: number;
  noiseConf: number;
  /** Minutes since the latest report; null if none. */
  lastReportMin: number | null;
  reportCount: number;
};

export type SpotLive = {
  live: Live;
  amenities: Partial<Record<VoteField, Verdict>>;
  /** Count of the 8 amenity fields with any non-unknown verdict. */
  completeness: number;
};

export type LiveMap = Record<string, SpotLive>;

/* ─────────────────────────── filtering & ranking ─────────────────────────── */

/** Amenity filter state: 0 any · 1 required (unknowns shown, ranked lower) · 2 strict (unknowns excluded). */
export type FilterTri = 0 | 1 | 2;

export type Filters = {
  maxWalk: number;
  openNow: boolean;
  noisePref: number;
  categories: Category[];
  amenities: Partial<Record<AmenityField, FilterTri>>;
};

export type ScoreBreakdown = {
  dist: number;
  crowd: number;
  noise: number;
  amenity: number;
};

export type Scored = {
  spot: Spot;
  live: SpotLive;
  meters: number;
  walkMinutes: number;
  score: number;
  parts: ScoreBreakdown;
  openState: OpenState;
};

export type OpenState =
  | { state: 'unknown' }
  | { state: 'open'; until: string; restricted: boolean }
  | { state: 'closed'; next: string | null };
