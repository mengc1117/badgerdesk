import { describe, expect, it } from 'vitest';
import { isOpenNow, localNow, todayHoursText } from '@/lib/hours';
import type { Hours } from '@/lib/types';

const week = (per: { open: string; close: string; restricted?: boolean }[][]): Hours => ({ tz: 'America/Chicago', week: per });

/** Sunday = 0. Open 9:00–17:00 every day. */
const NINE_TO_FIVE = week(Array.from({ length: 7 }, () => [{ open: '09:00', close: '17:00' }]));

/** 20:00 to 02:00 next day — overnight. */
const OVERNIGHT = week(Array.from({ length: 7 }, () => [{ open: '20:00', close: '02:00' }]));

/** College-Library-style 24/5: weekday 00:00–07:00 restricted, 07:00–24:00 open. */
const COLLEGE = week([
  [{ open: '10:00', close: '24:00' }],
  ...Array.from({ length: 4 }, () => [
    { open: '00:00', close: '07:00', restricted: true },
    { open: '07:00', close: '24:00' },
  ]),
  [
    { open: '00:00', close: '07:00', restricted: true },
    { open: '07:00', close: '20:00' },
  ],
  [{ open: '09:00', close: '20:00' }],
]);

/** Build a Date from a UTC instant. CDT = UTC-5, CST = UTC-6. */
const chicago = (iso: string) => new Date(iso);

describe('isOpenNow', () => {
  it('null hours → unknown, never closed', () => {
    expect(isOpenNow(null)).toEqual({ state: 'unknown' });
  });

  it('malformed week structure → unknown, no crash', () => {
    expect(isOpenNow({ tz: 'America/Chicago', week: [] } as unknown as Hours)).toEqual({ state: 'unknown' });
  });

  it('inside an interval → open with closing time', () => {
    // 2026-08-12 is a Wednesday; 15:00 CDT = 20:00 UTC
    const r = isOpenNow(NINE_TO_FIVE, chicago('2026-08-12T20:00:00Z'));
    expect(r).toEqual({ state: 'open', until: '17:00', restricted: false });
  });

  it('outside intervals → closed with the next opening', () => {
    // 2026-08-12 07:00 CDT = 12:00 UTC
    const r = isOpenNow(NINE_TO_FIVE, chicago('2026-08-12T12:00:00Z'));
    expect(r.state).toBe('closed');
    if (r.state === 'closed') expect(r.next).toBe('today 09:00');
  });

  it('2 am query inside an overnight interval → open', () => {
    // 2026-08-13 01:00 CDT = 06:00 UTC, inside the interval that started 8/12 20:00
    const r = isOpenNow(OVERNIGHT, chicago('2026-08-13T06:00:00Z'));
    expect(r.state).toBe('open');
    if (r.state === 'open') expect(r.until).toBe('02:00');
  });

  it('closed right after an overnight interval ends', () => {
    // 2026-08-13 03:00 CDT = 08:00 UTC
    expect(isOpenNow(OVERNIGHT, chicago('2026-08-13T08:00:00Z')).state).toBe('closed');
  });

  it('restricted window is flagged', () => {
    // Wednesday 02:00 CDT = 07:00 UTC
    const r = isOpenNow(COLLEGE, chicago('2026-08-12T07:00:00Z'));
    expect(r).toEqual({ state: 'open', until: '07:00', restricted: true });
  });

  it('not restricted once past the restricted window', () => {
    // Wednesday 09:00 CDT = 14:00 UTC
    const r = isOpenNow(COLLEGE, chicago('2026-08-12T14:00:00Z'));
    expect(r).toEqual({ state: 'open', until: '24:00', restricted: false });
  });

  it('empty day → finds the next open day', () => {
    const weekdayOnly = week([[], ...Array.from({ length: 5 }, () => [{ open: '09:00', close: '17:00' }]), []]);
    // 2026-08-15 is a Saturday; 12:00 CDT = 17:00 UTC
    const r = isOpenNow(weekdayOnly, chicago('2026-08-15T17:00:00Z'));
    expect(r.state).toBe('closed');
    if (r.state === 'closed') expect(r.next).toBe('Mon 09:00');
  });

  it('never-open week → next is null, no infinite loop', () => {
    const never = week(Array.from({ length: 7 }, () => []));
    expect(isOpenNow(never, chicago('2026-08-12T14:00:00Z'))).toEqual({ state: 'closed', next: null });
  });
});

describe('DST transitions', () => {
  it('spring-forward day resolves local time correctly', () => {
    // 2026-03-08 DST starts. 08:00 CDT = 13:00 UTC
    expect(isOpenNow(NINE_TO_FIVE, chicago('2026-03-08T13:00:00Z')).state).toBe('closed'); // 08:00 < 09:00
    // 10:00 CDT = 15:00 UTC
    expect(isOpenNow(NINE_TO_FIVE, chicago('2026-03-08T15:00:00Z')).state).toBe('open');
  });

  it('fall-back day resolves with the -6 offset', () => {
    // 2026-11-01 DST ends. 10:00 CST = 16:00 UTC
    expect(isOpenNow(NINE_TO_FIVE, chicago('2026-11-01T16:00:00Z')).state).toBe('open');
    // 08:00 CST = 14:00 UTC
    expect(isOpenNow(NINE_TO_FIVE, chicago('2026-11-01T14:00:00Z')).state).toBe('closed');
  });

  it('localNow returns local wall-clock time on transition days', () => {
    // 2026-11-01 16:00 UTC → 10:00 in Chicago, Sunday
    expect(localNow(chicago('2026-11-01T16:00:00Z'))).toEqual({ dow: 0, minutes: 10 * 60 });
    // 2026-03-08 15:00 UTC → 10:00 in Chicago, Sunday
    expect(localNow(chicago('2026-03-08T15:00:00Z'))).toEqual({ dow: 0, minutes: 10 * 60 });
  });

  it('midnight hour normalizes to 0, not 24', () => {
    // 2026-08-12 00:30 CDT = 05:30 UTC
    expect(localNow(chicago('2026-08-12T05:30:00Z'))).toEqual({ dow: 3, minutes: 30 });
  });
});

describe('todayHoursText', () => {
  it('null hours → "Hours unknown"', () => {
    expect(todayHoursText(null)).toBe('Hours unknown');
  });

  it('empty day → "Closed today"', () => {
    const never = week(Array.from({ length: 7 }, () => []));
    expect(todayHoursText(never, chicago('2026-08-12T14:00:00Z'))).toBe('Closed today');
  });

  it('restricted intervals carry the Wiscard note', () => {
    expect(todayHoursText(COLLEGE, chicago('2026-08-12T14:00:00Z'))).toBe('00:00–07:00 (Wiscard req.), 07:00–24:00');
  });
});
