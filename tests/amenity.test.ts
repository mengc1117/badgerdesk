import { describe, expect, it } from 'vitest';
import { resolveAmenity, isKnown } from '@/lib/amenity';

describe('resolveAmenity — verdict state machine', () => {
  it('0 votes → unknown', () => {
    expect(resolveAmenity([])).toEqual({ state: 'unknown' });
  });

  it('1 vote → tentative', () => {
    expect(resolveAmenity([true])).toEqual({ state: 'tentative', value: true, votes: 1 });
  });

  it('exactly 2 agreeing votes → still tentative', () => {
    expect(resolveAmenity([true, true])).toEqual({ state: 'tentative', value: true, votes: 2 });
  });

  it('exactly 3 agreeing votes → confirmed', () => {
    const v = resolveAmenity([true, true, true]);
    expect(v.state).toBe('confirmed');
    if (v.state === 'confirmed') {
      expect(v.votes).toBe(3);
      expect(v.agreement).toBe(1);
    }
  });

  it('3 votes at 2 vs 1 → agreement exactly 2/3 → confirmed', () => {
    const v = resolveAmenity([true, true, false]);
    expect(v.state).toBe('confirmed');
    if (v.state === 'confirmed') {
      expect(v.value).toBe(true);
      expect(v.agreement).toBeCloseTo(2 / 3, 10);
    }
  });

  it('4 votes at 2 vs 2 → conflicting with a breakdown', () => {
    const v = resolveAmenity([true, true, false, false]);
    expect(v.state).toBe('conflicting');
    if (v.state === 'conflicting') {
      expect(v.votes).toBe(4);
      expect(v.agreement).toBe(0.5);
      expect(v.breakdown).toEqual([
        ['true', 2],
        ['false', 2],
      ]);
    }
  });

  it('4 votes at 3 vs 1 → confirmed', () => {
    expect(resolveAmenity([true, true, true, false]).state).toBe('confirmed');
  });

  it('5 votes at 2-2-1 → conflicting (majority below 2/3)', () => {
    const v = resolveAmenity(['none', 'none', 'sparse', 'sparse', 'abundant']);
    expect(v.state).toBe('conflicting');
  });

  it('multi-value fields use the same thresholds', () => {
    const v = resolveAmenity(['abundant', 'abundant', 'abundant', 'moderate']);
    expect(v.state).toBe('confirmed');
    if (v.state === 'confirmed') expect(v.value).toBe('abundant');
  });

  it('isKnown treats only unknown as unknown', () => {
    expect(isKnown({ state: 'unknown' })).toBe(false);
    expect(isKnown(undefined)).toBe(false);
    expect(isKnown({ state: 'tentative', value: true, votes: 1 })).toBe(true);
    expect(isKnown({ state: 'conflicting', value: true, votes: 4, agreement: 0.5, breakdown: [] })).toBe(true);
  });
});
