/** Amenity vote aggregation. One vote per device per field (upsert). */
import type { AmenityValue, Verdict } from './types';

/** Confirmation threshold: ≥3 votes with ≥2/3 agreement. */
export const CONFIRM_VOTES = 3;
export const CONFIRM_AGREEMENT = 2 / 3;
/** At this many votes without agreement, treat as a real dispute. */
export const CONFLICT_VOTES = 4;

export function resolveAmenity<T extends AmenityValue>(votes: T[]): Verdict<T> {
  if (votes.length === 0) return { state: 'unknown' };

  const counts = new Map<T, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);

  const [value, top] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const agreement = top / votes.length;

  if (votes.length >= CONFIRM_VOTES && agreement >= CONFIRM_AGREEMENT) {
    return { state: 'confirmed', value, votes: votes.length, agreement };
  }

  if (votes.length >= CONFLICT_VOTES) {
    return {
      state: 'conflicting',
      value,
      votes: votes.length,
      agreement,
      breakdown: [...counts].sort((a, b) => b[1] - a[1]).map(([v, n]) => [String(v), n] as [string, number]),
    };
  }

  return { state: 'tentative', value, votes: votes.length };
}

/** Known = any state except unknown. */
export function isKnown(v: Verdict | undefined): boolean {
  return !!v && v.state !== 'unknown';
}
