/** Client-side filtering and ranking over the full in-memory spot list. */
import { haversine, walkMinutes } from './geo';
import { isOpenNow } from './hours';
import {
  AMENITY_FIELDS,
  type AmenityField,
  type AmenityValue,
  type Filters,
  type LiveMap,
  type Scored,
  type Spot,
  type Verdict,
} from './types';

export const WEIGHTS = { dist: 0.3, crowd: 0.3, noise: 0.25, amenity: 0.15 } as const;

const EMPTY: { state: 'unknown' } = { state: 'unknown' };

/** Whether a field value satisfies the user's preference (needs_wiscard is inverted). */
export function satisfies(field: AmenityField, value: AmenityValue): boolean {
  if (field === 'outlets') return value === 'moderate' || value === 'abundant';
  if (field === 'needs_wiscard') return value === false;
  return value === true;
}

/** Explicit negative: known and not satisfying. Unknown/conflicting don't count. */
function isNegative(field: AmenityField, v: Verdict): boolean {
  if (v.state === 'unknown') return false;
  if (v.state === 'conflicting') return false;
  return !satisfies(field, v.value);
}

export function filterAndRank(
  spots: Spot[],
  liveMap: LiveMap,
  filters: Filters,
  origin: { lat: number; lng: number },
  now: Date = new Date(),
): Scored[] {
  const prefs = AMENITY_FIELDS.filter((f) => (filters.amenities[f] ?? 0) > 0);

  const out: Scored[] = [];

  for (const spot of spots) {
    const meters = haversine(origin, spot);
    const mins = walkMinutes(meters);
    if (mins > filters.maxWalk) continue;

    if (filters.categories.length && !filters.categories.includes(spot.category)) continue;

    const openState = isOpenNow(spot.hours, now);
    // "Open now" drops closed spots only; unknown hours pass through
    if (filters.openNow && openState.state === 'closed') continue;

    const sl = liveMap[spot.id];
    const amenities = sl?.amenities ?? {};

    let excluded = false;
    for (const f of prefs) {
      const tri = filters.amenities[f]!;
      const v = (amenities[f] ?? EMPTY) as Verdict;
      if (tri === 2) {
        // Strict: confirmed-satisfying only
        if (!(v.state === 'confirmed' && satisfies(f, v.value))) { excluded = true; break; }
      } else if (tri === 1) {
        // Required: drop explicit negatives, keep unknowns
        if (isNegative(f, v)) { excluded = true; break; }
      }
    }
    if (excluded) continue;

    const crowd = sl?.live.crowd ?? null;
    const noise = sl?.live.noise ?? null;

    const fDist = Math.exp(-mins / 8);
    // Unknown scores a neutral 0.5, not 0
    const fCrowd = crowd === null ? 0.5 : 1 - (crowd - 1) / 4;
    const fNoise = noise === null ? 0.5 : 1 - Math.abs(noise - filters.noisePref) / 4;
    const fAmenity =
      prefs.length === 0
        ? 0.5
        : prefs.filter((f) => {
            const v = (amenities[f] ?? EMPTY) as Verdict;
            return v.state === 'confirmed' && satisfies(f, v.value);
          }).length / prefs.length;

    const parts = { dist: fDist, crowd: fCrowd, noise: fNoise, amenity: fAmenity };
    const score =
      WEIGHTS.dist * fDist + WEIGHTS.crowd * fCrowd + WEIGHTS.noise * fNoise + WEIGHTS.amenity * fAmenity;

    out.push({
      spot,
      live: sl ?? { live: { crowd: null, noise: null, conf: 0, noiseConf: 0, lastReportMin: null, reportCount: 0 }, amenities: {}, completeness: 0 },
      meters,
      walkMinutes: mins,
      score,
      parts,
      openState,
    });
  }

  return out.sort((a, b) => b.score - a.score || a.meters - b.meters);
}

/* ───────────────── score parts → one-line reason tags ───────────────── */

export type ReasonTag = { text: string; tone: 'good' | 'bad' | 'unknown'; field?: AmenityField };

export const AMENITY_LABEL: Record<AmenityField, string> = {
  outlets: 'Outlets',
  group_rooms: 'Group rooms',
  silent_zone: 'Silent zone',
  natural_light: 'Daylight',
  food_ok: 'Food OK',
  coffee: 'Coffee',
  restroom: 'Restroom',
  needs_wiscard: 'Wiscard',
};

export const CROWD_WORD = ['', 'Empty', 'Not bad', 'Filling up', 'Crowded', 'Packed'];
export const NOISE_WORD = ['', 'Silent', 'Quiet', 'Low hum', 'Conversational', 'Loud'];

export function reasonTags(s: Scored, filters: Filters): ReasonTag[] {
  const tags: ReasonTag[] = [];

  tags.push({
    text: `${Math.max(1, Math.round(s.walkMinutes))} min walk`,
    tone: s.walkMinutes <= 8 ? 'good' : 'bad',
  });

  const crowd = s.live.live.crowd;
  tags.push(
    crowd === null
      ? { text: 'Crowd unknown', tone: 'unknown' }
      : { text: CROWD_WORD[Math.min(5, Math.max(1, Math.round(crowd)))], tone: crowd <= 3 ? 'good' : 'bad' },
  );

  for (const f of AMENITY_FIELDS) {
    if ((filters.amenities[f] ?? 0) === 0) continue;
    const v = (s.live.amenities[f] ?? EMPTY) as Verdict;
    if (v.state === 'unknown') tags.push({ text: `${AMENITY_LABEL[f]} unknown`, tone: 'unknown', field: f });
    else if (v.state === 'conflicting') tags.push({ text: `${AMENITY_LABEL[f]} disputed`, tone: 'unknown', field: f });
    else tags.push({ text: AMENITY_LABEL[f], tone: satisfies(f, v.value) ? 'good' : 'bad', field: f });
  }

  return tags.slice(0, 4);
}
