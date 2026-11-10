/** Text formatting for the UI: money (integer cents in), dates, durations, ratios. Pure functions, no locale lookups. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function finite(n: number, what: string): number {
  if (!Number.isFinite(n)) throw new Error(`ui format: ${what} is not a finite number (${n})`);
  return n;
}

/** Three significant digits, trailing zeros kept for a steady width: 5.18, 18.3, 183. */
function threeDigits(n: number): string {
  if (n >= 99.95) return n.toFixed(0);
  if (n >= 9.995) return n.toFixed(1);
  return n.toFixed(2);
}

/** Compact dollars from integer cents: $5.18B, $183M, $950K, $1,250, $0. Negative amounts carry a leading minus. */
export function money(cents: number): string {
  const dollars = Math.abs(finite(cents, 'money')) / 100;
  const sign = cents < 0 && dollars >= 0.5 ? '-' : '';
  if (dollars >= 999.5e9) return `${sign}$${(dollars / 1e12).toFixed(2)}T`;
  if (dollars >= 999.5e6) return `${sign}$${threeDigits(dollars / 1e9)}B`;
  if (dollars >= 999.5e3) return `${sign}$${threeDigits(dollars / 1e6)}M`;
  if (dollars >= 9999.5) return `${sign}$${threeDigits(dollars / 1e3)}K`;
  return `${sign}$${Math.round(dollars).toLocaleString('en-US')}`;
}

/** Cost per route-km: $183M/km. */
export function moneyPerKm(centsPerKm: number): string {
  return `${money(centsPerKm)}/km`;
}

/** A change of money with an explicit sign: +$120M, -$1.20B, and "no change" for zero. */
export function moneyDelta(cents: number): string {
  if (Math.round(finite(cents, 'moneyDelta') / 100) === 0) return 'no change';
  return cents > 0 ? `+${money(cents)}` : money(cents);
}

/** A model ratio: 12.6x, 3.1x, 0.94x. Never a literal: callers pass what the model computed. */
export function ratio(r: number): string {
  finite(r, 'ratio');
  return `${r >= 99.95 ? r.toFixed(0) : r >= 9.995 ? r.toFixed(1) : r.toFixed(2)}x`;
}

/** Percent from a 0..1 share: 42%. */
export function percent(share: number): string {
  return `${Math.round(finite(share, 'percent') * 100)}%`;
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match === null) throw new Error(`ui format: not an ISO date: "${iso}"`);
  const m = Number(match[2]);
  if (m < 1 || m > 12) throw new Error(`ui format: not an ISO date: "${iso}"`);
  return { y: Number(match[1]), m, d: Number(match[3]) };
}

/** 9 Nov 2026. */
export function dateLong(iso: string): string {
  const { y, m, d } = parseIso(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Nov 2026. */
export function dateMonth(iso: string): string {
  const { y, m } = parseIso(iso);
  return `${MONTHS[m - 1]} ${y}`;
}

/** A span of game days: 12 days, 7 months, 3.4 years. */
export function duration(days: number): string {
  const d = Math.abs(finite(days, 'duration'));
  if (d < 60) {
    const n = Math.round(d);
    return `${n} ${n === 1 ? 'day' : 'days'}`;
  }
  if (d < 365 * 2) return `${Math.round(d / 30.44)} months`;
  return `${(d / 365.25).toFixed(1)} years`;
}

/** A change of schedule: "7 months sooner", "1.2 years later", "no change". */
export function durationDelta(days: number): string {
  if (Math.round(finite(days, 'durationDelta')) === 0) return 'no change';
  return `${duration(days)} ${days < 0 ? 'sooner' : 'later'}`;
}

/** Years with one decimal: 9.4 years. */
export function years(y: number): string {
  return `${finite(y, 'years').toFixed(1)} years`;
}

/** Metres as a length: 840 m, 2.09 km. */
export function length(m: number): string {
  finite(m, 'length');
  return Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/** Whole number with thousands separators: 41,200. */
export function count(n: number): string {
  return Math.round(finite(n, 'count')).toLocaleString('en-US');
}

/** Political capital: 40 PC. */
export function capital(pc: number): string {
  return `${Math.round(finite(pc, 'capital'))} PC`;
}
