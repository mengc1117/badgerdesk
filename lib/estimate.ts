/** Live-value estimation: time-decay weighted mean of recent reports, pulled toward a prior. */

export const HALF_LIFE_MIN = { crowd: 30, noise: 20 } as const;
export const PRIOR_WEIGHT = 1.5;
export const LOOKBACK_MIN = 180;

export type Metric = keyof typeof HALF_LIFE_MIN;

export function estimate(
  reports: { value: number; ageMinutes: number }[],
  prior: number | null,
  metric: Metric,
): { value: number | null; confidence: number } {
  const H = HALF_LIFE_MIN[metric];
  let num = 0,
    den = 0;

  for (const r of reports) {
    if (r.ageMinutes > LOOKBACK_MIN) continue;
    const w = Math.pow(0.5, r.ageMinutes / H);
    num += w * r.value;
    den += w;
  }

  if (den === 0 && prior === null) return { value: null, confidence: 0 };

  const p = prior ?? 3.0;
  return {
    value: (num + PRIOR_WEIGHT * p) / (den + PRIOR_WEIGHT),
    confidence: 1 - Math.exp(-den),
  };
}

/** Confidence display tiers. */
export type ConfidenceTier = 'fresh' | 'stale' | 'historical' | 'none';

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.6) return 'fresh';
  if (confidence >= 0.25) return 'stale';
  if (confidence > 0) return 'historical';
  return 'none';
}

/** Prior fallback chain: spot+slot → spot+hour (any day) → category+slot → null. */
export type HourlyStat = { spotId: string; dow: number; hour: number; crowdMean: number | null; noiseMean: number | null; nSamples: number };

const MIN_SAMPLES = 3;

export function resolvePrior(
  stats: HourlyStat[],
  spotId: string,
  category: string,
  categoryOf: (spotId: string) => string | undefined,
  dow: number,
  hour: number,
  metric: Metric,
): { value: number | null; source: 'slot' | 'hour' | 'category' | 'none' } {
  const pick = (s: HourlyStat) => (metric === 'crowd' ? s.crowdMean : s.noiseMean);
  const mean = (rows: HourlyStat[]) => {
    let num = 0,
      den = 0;
    for (const r of rows) {
      const v = pick(r);
      if (v === null || r.nSamples === 0) continue;
      num += v * r.nSamples;
      den += r.nSamples;
    }
    return den >= MIN_SAMPLES ? num / den : null;
  };

  const slot = mean(stats.filter((s) => s.spotId === spotId && s.dow === dow && s.hour === hour));
  if (slot !== null) return { value: slot, source: 'slot' };

  const allWeek = mean(stats.filter((s) => s.spotId === spotId && s.hour === hour));
  if (allWeek !== null) return { value: allWeek, source: 'hour' };

  const cat = mean(stats.filter((s) => s.dow === dow && s.hour === hour && categoryOf(s.spotId) === category));
  if (cat !== null) return { value: cat, source: 'category' };

  return { value: null, source: 'none' };
}
