/** Course-local "study day" helpers. Day boundary defaults to 04:00 local, matching the FSRS optimizer convention. */

export interface DayConfig { timezone: string; dayStartHour: number }

/** Returns "YYYY-MM-DD" of the study day containing `at` under the config. */
export function studyDay(at: number, cfg: DayConfig): string {
  const shifted = new Date(at - cfg.dayStartHour * 3_600_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(shifted);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Epoch ms of the start of the study day containing `at`. */
export function studyDayStart(at: number, cfg: DayConfig): number {
  const day = studyDay(at, cfg);
  // Find local midnight of that date in the timezone, then add dayStartHour.
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, cfg.dayStartHour);
  const offsetMin = tzOffsetMinutes(guess, cfg.timezone);
  return guess - offsetMin * 60_000;
}

export function tzOffsetMinutes(at: number, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return (asUtc - at) / 60_000;
}

export const DAY_MS = 86_400_000;

export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY_MS);
}
