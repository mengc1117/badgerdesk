import type { Category, OutletLevel, Spot, VoteField, Verdict } from './types';
import { CROWD_WORD, NOISE_WORD } from './scoring';

export { CROWD_WORD, NOISE_WORD };

/** Crowd level → color token. null goes through the unknown treatment, clearly distinct from "empty (green)" (§8.1). */
export function crowdColor(crowd: number | null): string {
  if (crowd === null) return 'var(--unknown)';
  const b = Math.min(5, Math.max(1, Math.round(crowd)));
  return `var(--crowd-${b})`;
}

export function crowdInk(crowd: number | null): string {
  if (crowd === null) return 'var(--unknown-ink)';
  const b = Math.min(5, Math.max(1, Math.round(crowd)));
  return `var(--crowd-${b}-ink)`;
}

export function crowdWord(crowd: number | null): string {
  return crowd === null ? 'No data yet' : CROWD_WORD[Math.min(5, Math.max(1, Math.round(crowd)))];
}

export function noiseWord(noise: number | null): string {
  return noise === null ? 'No data yet' : NOISE_WORD[Math.min(5, Math.max(1, Math.round(noise)))];
}

export const CATEGORY_LABEL: Record<Category, string> = {
  library: 'Library',
  union: 'Union',
  academic: 'Academic',
  cafe: 'Café',
  other: 'Other',
};

/* ───────── Field definitions (§6.3) — shown VERBATIM in the reporting UI ─────────
   The biggest risk in crowdsourced data is people reading the same word
   differently. These definitions live in the UI, not just in docs. */

export const OUTLET_OPTIONS: { value: OutletLevel; label: string; short: string }[] = [
  { value: 'none', label: "Couldn't find a usable outlet", short: 'None' },
  { value: 'sparse', label: "Only along the walls — most seats can't reach", short: 'Few' },
  { value: 'moderate', label: 'Roughly 1 per 4 seats', short: 'Some' },
  { value: 'abundant', label: 'Roughly 1 per 2 seats, or right on the table', short: 'Plenty' },
];

export const NOISE_BASE_OPTIONS: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Silent zone — talking gets shushed', short: 'Silent' },
  { value: 2, label: 'Very quiet, whispers only', short: 'Very quiet' },
  { value: 3, label: 'Low background hum; normal talking would draw looks', short: 'Low hum' },
  { value: 4, label: 'Normal-volume conversation is fine', short: 'Conversational' },
  { value: 5, label: 'Pretty loud — you have to raise your voice', short: 'Loud' },
];

export const BOOLEAN_QUESTION: Record<string, string> = {
  group_rooms: "Are there enclosed group rooms with doors? (Open tables don't count)",
  silent_zone: 'Is there a posted quiet/silent policy? ("Usually pretty quiet" doesn\'t count)',
  natural_light: 'Is it mostly daylight from windows during the day?',
  food_ok: 'Can you bring food in?',
  coffee: 'Can you buy coffee in this building?',
  restroom: 'Is there a restroom on this floor or the next one?',
  needs_wiscard: 'Do you need to swipe a Wiscard to get in?',
};

export const FIELD_QUESTION: Record<VoteField, string> = {
  outlets: 'How are the outlets here?',
  noise_base: 'How loud is this place usually?',
  ...BOOLEAN_QUESTION,
} as Record<VoteField, string>;

export const FIELD_ICON: Record<VoteField, string> = {
  outlets: '🔌',
  group_rooms: '🚪',
  silent_zone: '🤫',
  natural_light: '☀️',
  food_ok: '🍎',
  coffee: '☕',
  restroom: '🚻',
  needs_wiscard: '💳',
  noise_base: '🔉',
};

/** Render a Verdict as a short human-readable value. Unknown is handled by callers (it becomes an action). */
export function verdictText(field: VoteField, v: Verdict | undefined): string {
  if (!v || v.state === 'unknown') return 'Unknown';
  if (field === 'outlets') {
    return OUTLET_OPTIONS.find((o) => o.value === v.value)?.short ?? String(v.value);
  }
  if (field === 'noise_base') {
    return NOISE_BASE_OPTIONS.find((o) => o.value === Number(v.value))?.short ?? String(v.value);
  }
  return v.value === true ? 'Yes' : 'No';
}

/** "Open in Google Maps" deep link — photos and street view live there, not here (no hotlinking, no ToS issues). */
export function gmapsUrl(spot: Spot): string {
  const q = spot.address ? `${spot.building}, ${spot.address}` : `${spot.name}, Madison WI`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/* ───────── lat/lng projection shared by the landing page and the map ───────── */

export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export function boundsOf(spots: Spot[]): Bounds {
  return spots.reduce<Bounds>(
    (b, s) => ({
      minLat: Math.min(b.minLat, s.lat),
      maxLat: Math.max(b.maxLat, s.lat),
      minLng: Math.min(b.minLng, s.lng),
      maxLng: Math.max(b.maxLng, s.lng),
    }),
    { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 },
  );
}

/**
 * Equirectangular projection with latitude correction, fitting the campus into
 * a given viewBox. The landing constellation needs the right shape, not
 * geodesic accuracy.
 */
export function makeProjector(b: Bounds, width: number, height: number, pad = 0.06) {
  const kx = Math.cos(((b.minLat + b.maxLat) / 2) * (Math.PI / 180));
  const w = (b.maxLng - b.minLng) * kx;
  const h = b.maxLat - b.minLat;
  const px = width * pad;
  const py = height * pad;
  const sx = (width - px * 2) / w;
  const sy = (height - py * 2) / h;
  const s = Math.min(sx, sy);
  const offX = (width - w * s) / 2;
  const offY = (height - h * s) / 2;

  return (lat: number, lng: number): [number, number] => [
    offX + (lng - b.minLng) * kx * s,
    height - offY - (lat - b.minLat) * s, // latitude grows upward, SVG y grows downward
  ];
}
