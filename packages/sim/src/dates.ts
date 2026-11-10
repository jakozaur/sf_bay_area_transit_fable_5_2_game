/** Proleptic Gregorian date arithmetic on integers (Howard Hinnant's civil-days algorithms). No Date object. */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Days since 1970-01-01 for an ISO date. Throws on anything that is not a real YYYY-MM-DD date. */
export function isoToDays(iso: string): number {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`sim: "${iso}" is not an ISO date (YYYY-MM-DD)`);
  const y0 = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const leap = (y0 % 4 === 0 && y0 % 100 !== 0) || y0 % 400 === 0;
  const dim = mo === 2 && leap ? 29 : DAYS_IN_MONTH[mo - 1];
  if (mo < 1 || mo > 12 || d < 1 || d > dim) throw new Error(`sim: "${iso}" is not a calendar date`);
  const y = mo <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function daysToIso(days: number): string {
  const zd = Math.floor(days) + 719468;
  const era = Math.floor(zd / 146097);
  const doe = zd - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mo = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (mo <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** ISO date `ticks` game days after `startIso`. */
export function dateAtTick(startIso: string, ticks: number): string {
  return daysToIso(isoToDays(startIso) + ticks);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Feb 2036" for an ISO date: how dates read in banners, hints and the scorecard. */
export function monthYear(iso: string): string {
  // Validates the date as a side effect.
  isoToDays(iso);
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** "31 Mar 2036" for an ISO date: a day the player reads (objectives, feed lines). */
export function dayMonthYear(iso: string): string {
  isoToDays(iso);
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}
