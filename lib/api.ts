import type { AmenityValue, LiveMap, SpotLive, Verdict, VoteField } from './types';
import { getDeviceId } from './device';

export type LiveResponse = { demo: boolean; at: string; spots: LiveMap };

export async function fetchLive(): Promise<LiveResponse> {
  const r = await fetch('/api/live', { cache: 'no-store' });
  if (!r.ok) throw new Error('Failed to fetch live data');
  return r.json();
}

export class RateLimited extends Error {
  constructor(
    message: string,
    readonly retryAfterSec: number,
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-id': getDeviceId() },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 429) throw new RateLimited(data.error ?? 'Too many requests', data.retryAfterSec ?? 60);
  if (!r.ok) throw new Error(data.error ?? 'Submission failed');
  return data as T;
}

export function postReport(spotId: string, body: { crowd?: number; noise?: number }) {
  return post<{ live: SpotLive; nextQuestion: VoteField | null }>(`/api/spots/${spotId}/reports`, body);
}

export function postAmenity(spotId: string, field: VoteField, value: AmenityValue) {
  return post<{ field: VoteField; verdict: Verdict; live: SpotLive; nextQuestion: VoteField | null }>(
    `/api/spots/${spotId}/amenities`,
    { field, value },
  );
}

export async function fetchHeatmap(spotId: string) {
  const r = await fetch(`/api/spots/${spotId}/heatmap`, { cache: 'no-store' });
  if (!r.ok) throw new Error('Failed to fetch heatmap data');
  return (await r.json()) as { cells: { dow: number; hour: number; crowd: number | null; n: number }[] };
}
