/** Distance & walking time: haversine × 1.35 street detour factor ÷ 84 m/min. */

export const DETOUR_FACTOR = 1.35;
export const WALK_SPEED_M_PER_MIN = 84;

/** Default origin (Bascom Hill) when geolocation is unavailable. */
export const CAMPUS_CENTER = { lat: 43.07495, lng: -89.40405 };

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  // Clamp against float error so sqrt never sees a negative
  const c = 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, s))), Math.sqrt(Math.min(1, Math.max(0, 1 - s))));
  const d = R * c;
  return Number.isFinite(d) ? d : 0;
}

export function walkMinutes(meters: number): number {
  if (!Number.isFinite(meters)) return 0;
  return (meters * DETOUR_FACTOR) / WALK_SPEED_M_PER_MIN;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
