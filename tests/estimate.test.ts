import { describe, expect, it } from 'vitest';
import { estimate, resolvePrior, confidenceTier, HALF_LIFE_MIN, type HourlyStat } from '@/lib/estimate';

describe('estimate — time-decay weighted mean', () => {
  it('returns null with no reports and no prior', () => {
    expect(estimate([], null, 'crowd')).toEqual({ value: null, confidence: 0 });
  });

  it('returns the prior with zero confidence when there are no reports', () => {
    const r = estimate([], 4.2, 'crowd');
    expect(r.value).toBeCloseTo(4.2, 6);
    expect(r.confidence).toBe(0);
  });

  it('weights fresh reports more than old ones', () => {
    const fresh = estimate([{ value: 5, ageMinutes: 0 }], 1, 'crowd');
    const old = estimate([{ value: 5, ageMinutes: 90 }], 1, 'crowd');
    expect(fresh.value!).toBeGreaterThan(old.value!);
    expect(fresh.confidence).toBeGreaterThan(old.confidence);
  });

  it('weight at the half-life is exactly 0.5', () => {
    const H = HALF_LIFE_MIN.crowd;
    // value=5, prior=1, PRIOR_WEIGHT=1.5 → (0.5*5 + 1.5*1) / (0.5 + 1.5) = 2
    expect(estimate([{ value: 5, ageMinutes: H }], 1, 'crowd').value).toBeCloseTo(2, 6);
  });

  it('drops reports older than LOOKBACK_MIN', () => {
    const r = estimate([{ value: 5, ageMinutes: 181 }], null, 'crowd');
    expect(r).toEqual({ value: null, confidence: 0 });
  });

  it('noise decays faster than crowd (20 vs 30 min half-life)', () => {
    const age = 30;
    const crowd = estimate([{ value: 5, ageMinutes: age }], 1, 'crowd');
    const noise = estimate([{ value: 5, ageMinutes: age }], 1, 'noise');
    // Same age → lower weight for noise, so it sits closer to the prior
    expect(noise.value!).toBeLessThan(crowd.value!);
  });

  it('confidence grows with report count and stays below 1', () => {
    const one = estimate([{ value: 3, ageMinutes: 0 }], null, 'crowd').confidence;
    const five = estimate(
      Array.from({ length: 5 }, () => ({ value: 3, ageMinutes: 0 })),
      null,
      'crowd',
    ).confidence;
    expect(five).toBeGreaterThan(one);
    expect(five).toBeLessThan(1);
  });

  it('confidence tiers match the display thresholds', () => {
    expect(confidenceTier(0.8)).toBe('fresh');
    expect(confidenceTier(0.6)).toBe('fresh');
    expect(confidenceTier(0.4)).toBe('stale');
    expect(confidenceTier(0.25)).toBe('stale');
    expect(confidenceTier(0.1)).toBe('historical');
    expect(confidenceTier(0)).toBe('none');
  });
});

describe('resolvePrior — fallback chain', () => {
  const categoryOf = (id: string) => (id.startsWith('lib') ? 'library' : 'cafe');
  const row = (spotId: string, dow: number, hour: number, crowdMean: number, nSamples: number): HourlyStat => ({
    spotId,
    dow,
    hour,
    crowdMean,
    noiseMean: crowdMean,
    nSamples,
  });

  it('prefers the spot+slot mean', () => {
    const stats = [row('lib-a', 1, 14, 4.5, 10), row('lib-a', 2, 14, 1, 10)];
    expect(resolvePrior(stats, 'lib-a', 'library', categoryOf, 1, 14, 'crowd')).toEqual({ value: 4.5, source: 'slot' });
  });

  it('falls back to the spot+hour any-day mean when the slot lacks samples', () => {
    const stats = [row('lib-a', 1, 14, 4.5, 1), row('lib-a', 2, 14, 2, 8), row('lib-a', 3, 14, 2, 8)];
    const r = resolvePrior(stats, 'lib-a', 'library', categoryOf, 1, 14, 'crowd');
    expect(r.source).toBe('hour');
    expect(r.value).toBeCloseTo((4.5 * 1 + 2 * 8 + 2 * 8) / 17, 6);
  });

  it('falls back to the category+slot mean next', () => {
    const stats = [row('lib-b', 1, 14, 3.2, 20), row('lib-c', 1, 14, 3.2, 20)];
    const r = resolvePrior(stats, 'lib-a', 'library', categoryOf, 1, 14, 'crowd');
    expect(r.source).toBe('category');
    expect(r.value).toBeCloseTo(3.2, 6);
  });

  it('returns null when every level lacks samples', () => {
    expect(resolvePrior([], 'lib-a', 'library', categoryOf, 1, 14, 'crowd')).toEqual({ value: null, source: 'none' });
  });

  it('excludes zero-sample cells from means', () => {
    const stats = [row('lib-a', 1, 14, 5, 0), row('lib-a', 1, 14, 1, 9)];
    expect(resolvePrior(stats, 'lib-a', 'library', categoryOf, 1, 14, 'crowd').value).toBeCloseTo(1, 6);
  });
});
