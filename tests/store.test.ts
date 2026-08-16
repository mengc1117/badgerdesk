/** Demo seeding is disabled via vitest.config.mts env, so these run against an empty store. */
import { beforeEach, describe, expect, it } from 'vitest';
import { addAmenityVote, addReport, getLive, getSpots } from '@/lib/store';
import { AMENITY_FIELDS } from '@/lib/types';

const uuid = () => crypto.randomUUID();

beforeEach(() => {
  // Fresh store per test
  (globalThis as { __badgerdeskDb?: unknown }).__badgerdeskDb = {
    reports: [],
    amenityVotes: new Map(),
    hourly: [],
    nextId: 1,
    demoSeededAt: 0,
  };
});

describe('cold start', () => {
  it('empty store renders all 39 spots with no undefined/NaN', async () => {
    const live = await getLive();
    const spots = getSpots();
    expect(Object.keys(live)).toHaveLength(spots.length);

    for (const s of spots) {
      const e = live[s.id];
      expect(e).toBeDefined();
      expect(e.live.crowd).toBeNull();
      expect(e.live.noise).toBeNull();
      expect(e.live.conf).toBe(0);
      expect(e.completeness).toBe(0);
      expect(Number.isNaN(e.completeness)).toBe(false);
      for (const f of AMENITY_FIELDS) expect(e.amenities[f]).toEqual({ state: 'unknown' });
    }
  });
});

describe('amenity vote upsert', () => {
  it('re-voting from the same device overwrites, never accumulates', async () => {
    const dev = uuid();
    await addAmenityVote('college-3n', dev, 'outlets', 'sparse');
    await addAmenityVote('college-3n', dev, 'outlets', 'abundant');
    await addAmenityVote('college-3n', dev, 'outlets', 'moderate');

    const v = (await getLive())['college-3n'].amenities.outlets!;
    expect(v.state).toBe('tentative');
    if (v.state === 'tentative') {
      expect(v.votes).toBe(1);
      expect(v.value).toBe('moderate');
    }
  });

  it('three agreeing devices → confirmed', async () => {
    for (let i = 0; i < 3; i++) await addAmenityVote('college-3n', uuid(), 'outlets', 'abundant');
    const v = (await getLive())['college-3n'].amenities.outlets!;
    expect(v.state).toBe('confirmed');
    expect((await getLive())['college-3n'].completeness).toBe(1);
  });

  it('four votes at 2 vs 2 → conflicting', async () => {
    await addAmenityVote('memorial-cages', uuid(), 'group_rooms', true);
    await addAmenityVote('memorial-cages', uuid(), 'group_rooms', true);
    await addAmenityVote('memorial-cages', uuid(), 'group_rooms', false);
    await addAmenityVote('memorial-cages', uuid(), 'group_rooms', false);
    expect((await getLive())['memorial-cages'].amenities.group_rooms!.state).toBe('conflicting');
  });

  it('noise_base is excluded from completeness but feeds the noise prior', async () => {
    const dev = uuid();
    await addAmenityVote('law-lib', dev, 'noise_base', 4);
    const e = (await getLive())['law-lib'];
    expect(e.completeness).toBe(0);
    expect(e.amenities.noise_base!.state).toBe('tentative');
    // With a prior, noise is no longer null
    expect(e.live.noise).toBeCloseTo(4, 1);
    // Crowd still has nothing to go on
    expect(e.live.crowd).toBeNull();
  });
});

describe('reports and rate limiting', () => {
  it('a report returns the updated aggregate and the next question', async () => {
    const res = await addReport('ebling', uuid(), { crowd: 4 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      // With no prior, estimate blends toward 3.0: (1×4 + 1.5×3) / 2.5 = 3.4
      expect(res.live.live.crowd).toBeCloseTo(3.4, 2);
      expect(res.live.live.conf).toBeGreaterThan(0);
      // Most-filtered field is asked first
      expect(res.nextQuestion).toBe('outlets');
    }
  });

  it('a noise-only report leaves crowd unknown', async () => {
    const res = await addReport('ebling', uuid(), { noise: 2 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Same blend: (1×2 + 1.5×3) / 2.5 = 2.6
      expect(res.live.live.noise).toBeCloseTo(2.6, 2);
      expect(res.live.live.crowd).toBeNull();
    }
  });

  it('same device + spot within 30 min is rate-limited', async () => {
    const dev = uuid();
    expect((await addReport('ebling', dev, { crowd: 3 })).ok).toBe(true);
    const second = await addReport('ebling', dev, { crowd: 5 });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.retryAfterSec).toBeGreaterThan(0);
  });

  it('same device can immediately report a different spot', async () => {
    const dev = uuid();
    expect((await addReport('ebling', dev, { crowd: 3 })).ok).toBe(true);
    expect((await addReport('law-lib', dev, { crowd: 3 })).ok).toBe(true);
  });

  it('concurrent reports aggregate without races', async () => {
    const devs = [uuid(), uuid(), uuid()];
    await Promise.all(devs.map((d) => addReport('math-lib', d, { crowd: 5 })));
    const e = (await getLive())['math-lib'];
    expect(e.live.reportCount).toBe(3);
    expect(e.live.crowd).toBeGreaterThan(4);
    expect(Number.isFinite(e.live.crowd!)).toBe(true);
  });

  it('daily cap of 40 operations', async () => {
    const dev = uuid();
    const spots = getSpots();
    let blocked = 0;
    for (let i = 0; i < 45; i++) {
      const r = await addReport(spots[i % spots.length].id, dev, { crowd: 3 });
      if (!r.ok) blocked++;
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it('already-answered questions are not asked again', async () => {
    const dev = uuid();
    await addAmenityVote('ebling', dev, 'outlets', 'abundant');
    const res = await addReport('ebling', dev, { crowd: 2 });
    if (res.ok) expect(res.nextQuestion).not.toBe('outlets');
  });
});
