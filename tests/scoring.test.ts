import { describe, expect, it } from 'vitest';
import { haversine, walkMinutes, formatDistance, CAMPUS_CENTER } from '@/lib/geo';
import { filterAndRank, satisfies, reasonTags, WEIGHTS } from '@/lib/scoring';
import type { Filters, LiveMap, Spot, SpotLive } from '@/lib/types';

const spot = (id: string, lat: number, lng: number, extra: Partial<Spot> = {}): Spot => ({
  id,
  name: id,
  building: id,
  floorHint: null,
  category: 'library',
  address: null,
  lat,
  lng,
  hoursSource: 'manual',
  hours: null,
  ...extra,
});

const emptyLive = (): SpotLive => ({
  live: { crowd: null, noise: null, conf: 0, noiseConf: 0, lastReportMin: null, reportCount: 0 },
  amenities: {},
  completeness: 0,
});

const baseFilters: Filters = { maxWalk: 15, openNow: false, noisePref: 2, categories: [], amenities: {} };

describe('haversine / walk time', () => {
  it('same point → 0, no NaN', () => {
    expect(haversine(CAMPUS_CENTER, CAMPUS_CENTER)).toBe(0);
  });

  it('origin in Lake Mendota → finite distance', () => {
    const lake = { lat: 43.1097, lng: -89.4206 };
    const d = haversine(lake, { lat: 43.0765, lng: -89.4014 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
    expect(Number.isFinite(walkMinutes(d))).toBe(true);
  });

  it('antipodal points → finite', () => {
    const d = haversine({ lat: 90, lng: 0 }, { lat: -90, lng: 0 });
    expect(Number.isFinite(d)).toBe(true);
  });

  it('walk time = meters × 1.35 ÷ 84', () => {
    expect(walkMinutes(840)).toBeCloseTo((840 * 1.35) / 84, 6);
  });

  it('non-finite input is guarded', () => {
    expect(walkMinutes(NaN)).toBe(0);
    expect(formatDistance(NaN)).toBe('—');
  });

  it('distance formatting switches units at 1 km', () => {
    expect(formatDistance(340)).toBe('340 m');
    expect(formatDistance(1500)).toBe('1.5 km');
  });
});

describe('filterAndRank — cold start', () => {
  const spots = [spot('a', 43.0765, -89.4014), spot('b', 43.0723, -89.4019), spot('c', 43.0774, -89.4303)];
  const allUnknown: LiveMap = Object.fromEntries(spots.map((s) => [s.id, emptyLive()]));

  it('an all-unknown database yields no undefined/NaN and drops no spots', () => {
    const r = filterAndRank(spots, allUnknown, { ...baseFilters, maxWalk: 60 }, CAMPUS_CENTER);
    expect(r).toHaveLength(3);
    for (const x of r) {
      expect(Number.isFinite(x.score)).toBe(true);
      expect(Number.isFinite(x.meters)).toBe(true);
      expect(Number.isFinite(x.walkMinutes)).toBe(true);
      expect(x.live).toBeDefined();
      expect(x.openState.state).toBe('unknown'); // hours are null
      for (const v of Object.values(x.parts)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('an entirely empty liveMap (no keys) does not crash', () => {
    // maxWalk 60 keeps all three spots in range; this tests missing live data, not distance
    const r = filterAndRank(spots, {}, { ...baseFilters, maxWalk: 60 }, CAMPUS_CENTER);
    expect(r).toHaveLength(3);
    expect(r.every((x) => Number.isFinite(x.score))).toBe(true);
    expect(r.every((x) => x.live.completeness === 0)).toBe(true);
  });

  it('unknown crowd/noise scores a neutral 0.5, not 0', () => {
    const [top] = filterAndRank(spots, allUnknown, baseFilters, CAMPUS_CENTER);
    expect(top.parts.crowd).toBe(0.5);
    expect(top.parts.noise).toBe(0.5);
  });

  it('known-empty ranks above unknown, but unknown keeps a positive score', () => {
    const live: LiveMap = {
      ...allUnknown,
      a: { ...emptyLive(), live: { crowd: 1, noise: 2, conf: 0.9, noiseConf: 0.9, lastReportMin: 1, reportCount: 3 } },
    };
    const r = filterAndRank(spots, live, baseFilters, CAMPUS_CENTER);
    const a = r.find((x) => x.spot.id === 'a')!;
    const b = r.find((x) => x.spot.id === 'b')!;
    expect(a.parts.crowd).toBe(1);
    expect(b.parts.crowd).toBe(0.5);
    expect(b.score).toBeGreaterThan(0);
  });

  it('weights sum to 1', () => {
    expect(WEIGHTS.dist + WEIGHTS.crowd + WEIGHTS.noise + WEIGHTS.amenity).toBeCloseTo(1, 10);
  });
});

describe('filterAndRank — filters', () => {
  const spots = [spot('near', 43.0749, -89.4041), spot('far', 43.12, -89.5)];

  it('drops spots beyond the max walk time', () => {
    const r = filterAndRank(spots, {}, { ...baseFilters, maxWalk: 10 }, CAMPUS_CENTER);
    expect(r.map((x) => x.spot.id)).toEqual(['near']);
  });

  it('"open now" keeps spots with unknown hours', () => {
    const r = filterAndRank([spot('unknown-hours', 43.0749, -89.4041)], {}, { ...baseFilters, openNow: true }, CAMPUS_CENTER);
    expect(r).toHaveLength(1);
    expect(r[0].openState.state).toBe('unknown');
  });
});

describe('tri-state amenity filters', () => {
  const s = [spot('yes', 43.0749, -89.4041), spot('no', 43.075, -89.4042), spot('dunno', 43.0751, -89.4043)];
  const live: LiveMap = {
    yes: { ...emptyLive(), amenities: { outlets: { state: 'confirmed', value: 'abundant', votes: 4, agreement: 1 } }, completeness: 1 },
    no: { ...emptyLive(), amenities: { outlets: { state: 'confirmed', value: 'none', votes: 4, agreement: 1 } }, completeness: 1 },
    dunno: emptyLive(),
  };

  it('0 (any): keeps everything', () => {
    const r = filterAndRank(s, live, { ...baseFilters, amenities: { outlets: 0 } }, CAMPUS_CENTER);
    expect(r).toHaveLength(3);
  });

  it('1 (required): drops explicit negatives, keeps unknowns', () => {
    const r = filterAndRank(s, live, { ...baseFilters, amenities: { outlets: 1 } }, CAMPUS_CENTER);
    expect(r.map((x) => x.spot.id).sort()).toEqual(['dunno', 'yes']);
  });

  it('2 (strict): confirmed-satisfying only', () => {
    const r = filterAndRank(s, live, { ...baseFilters, amenities: { outlets: 2 } }, CAMPUS_CENTER);
    expect(r.map((x) => x.spot.id)).toEqual(['yes']);
  });

  it('in required mode, unknowns score lower and rank after matches', () => {
    const r = filterAndRank(s, live, { ...baseFilters, amenities: { outlets: 1 } }, CAMPUS_CENTER);
    expect(r[0].spot.id).toBe('yes');
    expect(r.find((x) => x.spot.id === 'dunno')!.parts.amenity).toBe(0);
  });

  it('tentative values do not pass strict mode', () => {
    const tentative: LiveMap = { yes: { ...emptyLive(), amenities: { outlets: { state: 'tentative', value: 'abundant', votes: 1 } } } };
    const r = filterAndRank([s[0]], tentative, { ...baseFilters, amenities: { outlets: 2 } }, CAMPUS_CENTER);
    expect(r).toHaveLength(0);
  });

  it('conflicting verdicts are not treated as negatives', () => {
    const conflicting: LiveMap = {
      yes: {
        ...emptyLive(),
        amenities: { outlets: { state: 'conflicting', value: 'none', votes: 4, agreement: 0.5, breakdown: [] } },
      },
    };
    const r = filterAndRank([s[0]], conflicting, { ...baseFilters, amenities: { outlets: 1 } }, CAMPUS_CENTER);
    expect(r).toHaveLength(1);
  });
});

describe('satisfies — field semantics', () => {
  it('outlets: only moderate/abundant satisfy', () => {
    expect(satisfies('outlets', 'abundant')).toBe(true);
    expect(satisfies('outlets', 'moderate')).toBe(true);
    expect(satisfies('outlets', 'sparse')).toBe(false);
    expect(satisfies('outlets', 'none')).toBe(false);
  });

  it('needs_wiscard is inverted', () => {
    expect(satisfies('needs_wiscard', false)).toBe(true);
    expect(satisfies('needs_wiscard', true)).toBe(false);
  });
});

describe('reasonTags', () => {
  it('unknown fields render as unknown-toned tags with the field attached', () => {
    const r = filterAndRank([spot('x', 43.0749, -89.4041)], {}, { ...baseFilters, amenities: { outlets: 1 } }, CAMPUS_CENTER);
    const tags = reasonTags(r[0], { ...baseFilters, amenities: { outlets: 1 } });
    const outletTag = tags.find((t) => t.field === 'outlets')!;
    expect(outletTag.tone).toBe('unknown');
    expect(outletTag.text).toContain('unknown');
    expect(tags.some((t) => t.text.includes('Crowd unknown'))).toBe(true);
  });
});
