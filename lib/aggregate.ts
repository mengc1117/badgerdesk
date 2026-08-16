/** Pure aggregation shared by both storage backends: raw rows in → LiveMap out. */
import { AMENITY_FIELDS, VOTE_FIELDS, type AmenityValue, type LiveMap, type Spot, type Verdict, type VoteField } from './types';
import { estimate, resolvePrior, type HourlyStat } from './estimate';
import { resolveAmenity, isKnown } from './amenity';
import { localNow } from './hours';

export type RawReport = {
  spotId: string;
  crowd: number | null;
  noise: number | null;
  /** epoch ms */
  createdAt: number;
};

export function aggregate(
  spots: Spot[],
  reports: RawReport[],
  /** key = `${spotId}|${field}` */
  votes: Map<string, AmenityValue[]>,
  hourly: HourlyStat[],
  now: Date = new Date(),
): LiveMap {
  const categoryOf = (id: string) => spots.find((s) => s.id === id)?.category;
  const t = now.getTime();
  // Priors are keyed by Madison local weekday/hour
  const { dow, minutes } = localNow(now);
  const hour = Math.floor(minutes / 60);

  const bySpot = new Map<string, RawReport[]>();
  for (const r of reports) {
    const age = (t - r.createdAt) / 60_000;
    if (age > 180) continue;
    const arr = bySpot.get(r.spotId);
    if (arr) arr.push(r);
    else bySpot.set(r.spotId, [r]);
  }

  const out: LiveMap = {};

  for (const spot of spots) {
    const rs = bySpot.get(spot.id) ?? [];

    const amenities: Partial<Record<VoteField, Verdict>> = {};
    for (const field of VOTE_FIELDS) {
      const v = votes.get(`${spot.id}|${field}`);
      amenities[field] = v ? resolveAmenity(v) : { state: 'unknown' };
    }

    // Noise prior: crowdsourced noise_base first, then historical stats
    const nb = amenities.noise_base;
    const noiseBaseVote = nb && nb.state !== 'unknown' ? Number(nb.value) : null;

    const crowdPrior = resolvePrior(hourly, spot.id, spot.category, categoryOf, dow, hour, 'crowd').value;
    const noisePrior = noiseBaseVote ?? resolvePrior(hourly, spot.id, spot.category, categoryOf, dow, hour, 'noise').value;

    const crowdEst = estimate(
      rs.filter((r) => r.crowd !== null).map((r) => ({ value: r.crowd!, ageMinutes: (t - r.createdAt) / 60_000 })),
      crowdPrior,
      'crowd',
    );
    const noiseEst = estimate(
      rs.filter((r) => r.noise !== null).map((r) => ({ value: r.noise!, ageMinutes: (t - r.createdAt) / 60_000 })),
      noisePrior,
      'noise',
    );

    const lastMs = rs.length ? Math.max(...rs.map((r) => r.createdAt)) : null;

    out[spot.id] = {
      live: {
        crowd: crowdEst.value === null ? null : Math.round(crowdEst.value * 100) / 100,
        noise: noiseEst.value === null ? null : Math.round(noiseEst.value * 100) / 100,
        conf: Math.round(crowdEst.confidence * 100) / 100,
        noiseConf: Math.round(noiseEst.confidence * 100) / 100,
        lastReportMin: lastMs === null ? null : Math.max(0, Math.round((t - lastMs) / 60_000)),
        reportCount: rs.length,
      },
      amenities,
      completeness: AMENITY_FIELDS.filter((f) => isKnown(amenities[f])).length,
    };
  }

  return out;
}

/** Follow-up question priority, most-filtered fields first. */
export const QUESTION_PRIORITY: VoteField[] = [
  'outlets',
  'group_rooms',
  'silent_zone',
  'noise_base',
  'food_ok',
  'needs_wiscard',
  'natural_light',
  'coffee',
  'restroom',
];

export function pickNextQuestion(
  amenities: Partial<Record<VoteField, Verdict>>,
  answeredByDevice: Set<VoteField>,
): VoteField | null {
  for (const f of QUESTION_PRIORITY) {
    if (answeredByDevice.has(f)) continue;
    const v = amenities[f];
    if (!v || v.state === 'unknown' || v.state === 'tentative' || v.state === 'conflicting') return f;
  }
  return null;
}
