/** Opening-hours logic. null hours = unknown (never "closed"); handles overnight spans and DST via Intl in America/Chicago. */
import type { Hours, OpenState } from './types';

export const TZ = 'America/Chicago';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday and minutes-into-day for `now` in America/Chicago. */
export function localNow(now: Date = new Date()): { dow: number; minutes: number } {
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dow = DOW[get('weekday')] ?? 0;
  // en-US with hour12:false reports midnight as "24"; normalize to 0
  const h = Number(get('hour')) % 24;
  const m = Number(get('minute'));
  return { dow, minutes: h * 60 + m };
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

const toHHMM = (min: number): string => {
  // End-of-day renders as 24:00, not 00:00
  if (min === 1440) return '24:00';
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isOpenNow(hours: Hours | null, now: Date = new Date()): OpenState {
  if (!hours || !Array.isArray(hours.week) || hours.week.length !== 7) return { state: 'unknown' };

  const { dow, minutes } = localNow(now);

  // Today's intervals
  for (const iv of hours.week[dow] ?? []) {
    const open = toMin(iv.open);
    let close = toMin(iv.close);
    if (close <= open) close += 1440; // overnight
    if (minutes >= open && minutes < close) {
      return { state: 'open', until: toHHMM(close), restricted: !!iv.restricted };
    }
  }

  // Overnight interval carried over from yesterday
  const prev = (dow + 6) % 7;
  for (const iv of hours.week[prev] ?? []) {
    const open = toMin(iv.open);
    let close = toMin(iv.close);
    if (close <= open) close += 1440;
    else continue;
    if (minutes + 1440 >= open && minutes + 1440 < close) {
      return { state: 'open', until: toHHMM(close), restricted: !!iv.restricted };
    }
  }

  // Next opening within the coming week
  for (let i = 0; i < 8; i++) {
    const d = (dow + i) % 7;
    for (const iv of hours.week[d] ?? []) {
      const open = toMin(iv.open);
      if (i === 0 && open <= minutes) continue;
      return { state: 'closed', next: i === 0 ? `today ${iv.open}` : `${DOW_LABEL[d]} ${iv.open}` };
    }
  }

  return { state: 'closed', next: null };
}

/** Detail panel: today's intervals as text. */
export function todayHoursText(hours: Hours | null, now: Date = new Date()): string {
  if (!hours) return 'Hours unknown';
  const { dow } = localNow(now);
  const ivs = hours.week[dow] ?? [];
  if (ivs.length === 0) return 'Closed today';
  return ivs.map((iv) => `${iv.open}–${iv.close}${iv.restricted ? ' (Wiscard req.)' : ''}`).join(', ');
}
