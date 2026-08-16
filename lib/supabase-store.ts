/**
 * Supabase backend, selected by lib/store.ts when SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY are set. API routes use the service-role key;
 * the RLS policies in supabase/schema.sql govern the public anon key.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AmenityValue, LiveMap, SpotLive, Verdict, VoteField } from './types';
import type { HourlyStat } from './estimate';
import { aggregate, pickNextQuestion, type RawReport } from './aggregate';
import { getSpots } from './spots';

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseEnabled = Boolean(URL && SERVICE_KEY);

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) client = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  return client;
}

const DAILY_OPS_CAP = 40;

type ReportRow = { spot_id: string; crowd: number | null; noise: number | null; created_at: string };
type VoteRow = { spot_id: string; field: VoteField; value: AmenityValue };
type StatRow = { spot_id: string; dow: number; hour: number; crowd_mean: number | null; noise_mean: number | null; n_samples: number };

async function fetchRaw(now: Date) {
  const since = new Date(now.getTime() - 180 * 60_000).toISOString();
  const [reports, votes, stats] = await Promise.all([
    sb().from('reports').select('spot_id, crowd, noise, created_at').gte('created_at', since),
    sb().from('amenity_votes').select('spot_id, field, value'),
    sb().from('spot_stats_hourly').select('spot_id, dow, hour, crowd_mean, noise_mean, n_samples'),
  ]);
  if (reports.error) throw reports.error;
  if (votes.error) throw votes.error;
  if (stats.error) throw stats.error;

  const rawReports: RawReport[] = (reports.data as ReportRow[]).map((r) => ({
    spotId: r.spot_id,
    crowd: r.crowd,
    noise: r.noise,
    createdAt: new Date(r.created_at).getTime(),
  }));

  const voteMap = new Map<string, AmenityValue[]>();
  for (const v of votes.data as VoteRow[]) {
    const k = `${v.spot_id}|${v.field}`;
    const arr = voteMap.get(k);
    if (arr) arr.push(v.value);
    else voteMap.set(k, [v.value]);
  }

  const hourly: HourlyStat[] = (stats.data as StatRow[]).map((s) => ({
    spotId: s.spot_id,
    dow: s.dow,
    hour: s.hour,
    crowdMean: s.crowd_mean,
    noiseMean: s.noise_mean,
    nSamples: s.n_samples,
  }));

  return { rawReports, voteMap, hourly };
}

export async function getLiveSB(now: Date = new Date()): Promise<LiveMap> {
  const { rawReports, voteMap, hourly } = await fetchRaw(now);
  return aggregate(getSpots(), rawReports, voteMap, hourly, now);
}

export async function getHeatmapSB(spotId: string) {
  const { data, error } = await sb()
    .from('spot_stats_hourly')
    .select('dow, hour, crowd_mean, n_samples')
    .eq('spot_id', spotId);
  if (error) throw error;
  return (data as { dow: number; hour: number; crowd_mean: number | null; n_samples: number }[]).map((h) => ({
    dow: h.dow,
    hour: h.hour,
    crowd: h.crowd_mean,
    n: h.n_samples,
  }));
}

async function dailyOps(deviceId: string): Promise<number> {
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [r, v] = await Promise.all([
    sb().from('reports').select('id', { count: 'exact', head: true }).eq('device_id', deviceId).gte('created_at', dayAgo),
    sb().from('amenity_votes').select('spot_id', { count: 'exact', head: true }).eq('device_id', deviceId).gte('updated_at', dayAgo),
  ]);
  return (r.count ?? 0) + (v.count ?? 0);
}

async function answeredFields(spotId: string, deviceId: string): Promise<Set<VoteField>> {
  const { data } = await sb().from('amenity_votes').select('field').eq('spot_id', spotId).eq('device_id', deviceId);
  return new Set((data ?? []).map((r) => r.field as VoteField));
}

export async function addReportSB(
  spotId: string,
  deviceId: string,
  body: { crowd?: number | null; noise?: number | null },
): Promise<{ ok: true; live: SpotLive; nextQuestion: VoteField | null } | { ok: false; retryAfterSec: number; reason: string }> {
  if ((await dailyOps(deviceId)) >= DAILY_OPS_CAP) {
    return { ok: false, retryAfterSec: 3600, reason: 'Daily contribution limit reached — thanks for the enthusiasm, try again tomorrow' };
  }

  const { error } = await sb().from('reports').insert({ spot_id: spotId, device_id: deviceId, crowd: body.crowd ?? null, noise: body.noise ?? null });

  if (error) {
    // 23505 = unique (spot_id, device_id, time_bucket) violation → rate limited
    if (error.code === '23505') {
      const now = new Date();
      const secsToNextHour = 3600 - (now.getMinutes() * 60 + now.getSeconds());
      return {
        ok: false,
        retryAfterSec: secsToNextHour,
        reason: `You already reported this spot this hour — try again in ${Math.ceil(secsToNextHour / 60)} min`,
      };
    }
    throw error;
  }

  const live = (await getLiveSB())[spotId];
  return { ok: true, live, nextQuestion: pickNextQuestion(live.amenities, await answeredFields(spotId, deviceId)) };
}

export async function addAmenityVoteSB(
  spotId: string,
  deviceId: string,
  field: VoteField,
  value: AmenityValue,
): Promise<
  { ok: true; verdict: Verdict; live: SpotLive; nextQuestion: VoteField | null } | { ok: false; retryAfterSec: number; reason: string }
> {
  if ((await dailyOps(deviceId)) >= DAILY_OPS_CAP) {
    return { ok: false, retryAfterSec: 3600, reason: 'Daily contribution limit reached — thanks for the enthusiasm, try again tomorrow' };
  }

  const { error } = await sb()
    .from('amenity_votes')
    .upsert(
      { spot_id: spotId, device_id: deviceId, field, value, updated_at: new Date().toISOString() },
      { onConflict: 'spot_id,device_id,field' },
    );
  if (error) throw error;

  const live = (await getLiveSB())[spotId];
  return {
    ok: true,
    verdict: live.amenities[field] ?? { state: 'unknown' },
    live,
    nextQuestion: pickNextQuestion(live.amenities, await answeredFields(spotId, deviceId)),
  };
}
