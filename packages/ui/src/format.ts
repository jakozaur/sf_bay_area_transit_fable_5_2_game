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

/** Nov 2026, or `none` for the empty string: a sponsor figure that never had a date (the Dumbarton corridor study). */
export function dateMonthOr(iso: string, none: string): string {
  return iso === '' ? none : dateMonth(iso);
}

/** A receipt cell: a change of money, or a plain 0 where the line adds nothing in that column. */
export function moneyCell(cents: number): string {
  return Math.round(finite(cents, 'moneyCell') / 100) === 0 ? '0' : moneyDelta(cents);
}

const EFFECT_LABEL: Readonly<Record<string, string>> = {
  'unit.procurement': 'Procurement and risk pricing',
  'unit.labour': 'Site staffing and work hours',
  'unit.thirdParty': 'Utilities and third parties',
  'unit.priceLevel': 'Price level',
  'systems.factor': 'Track, power and signalling prices',
  'soft.fixed': 'Consultants and project management',
  'soft.overheadPerYear': 'Standing organisation per year',
  'soft.contingency': 'Contingency',
  'time.planning': 'Environmental review',
  'time.permitting': 'Permits and funding agreement',
  'time.procurement': 'Procurement time',
  'time.utilities': 'Utility relocation time',
  'time.fitOut': 'Fit-out time',
  'time.constructionFactor': 'Station and surface works time',
  'tbm.rate': 'Machine advance',
  'tbm.breakdown': 'Machine stoppages',
  'event.lawsuit.rate': 'Lawsuits',
  'event.utilitySurprise.rate': 'Utility surprises',
  'event.tbmStuck.rate': 'Stuck machines',
  'event.changeOrder.rate': 'Change orders',
  'event.fundingGap.rate': 'Funding reviews',
  'event.contractorBankruptcy.rate': 'Contractor bankruptcies',
};
const MANDATE_LABEL: Readonly<Record<string, string>> = {
  'design.threeTrack': 'The third track is no longer required',
  'design.deepBox': 'Cut-and-cover boxes go one level down instead of two',
  'design.oversizeStations': 'Full-length mezzanines are no longer required',
  'design.bespoke': 'Stations come from a catalogue',
  'design.terminalOversize': 'The terminal is fitted out for the trains it will see',
  'design.twinBoreDefault': 'Caverns and giant bores nobody chose are redrawn as twin bores',
};

/**
 * What one effect of a reform does, in words: "Machine advance x1.60", "Lawsuits 20% less often",
 * "Environmental review 50% shorter". The cost and date preview says what that is worth on this project; this
 * line says what the reform changes when the preview is zero (a machine reform on a line with no machine).
 */
export function effectText(e: { key: string; op: 'mul' | 'add' | 'set'; value: number }): string {
  const mandate = MANDATE_LABEL[e.key];
  if (mandate !== undefined) return mandate;
  if (e.key === 'event.lawsuit.delayCapDays') return `A lawsuit can stop the project for at most ${Math.round(e.value)} days`;
  if (e.key === 'tbm.geologyRelief') return `Bad ground costs ${Math.round(e.value * 100)}% less of its penalty`;
  const label = EFFECT_LABEL[e.key];
  if (label === undefined) throw new Error(`ui format: no label for reform effect "${e.key}"`);
  if (e.op === 'mul') {
    if (e.key.startsWith('event.'))
      return e.value === 0 ? `${label} no longer happen` : `${label} ${Math.round((1 - e.value) * 100)}% less often`;
    if (e.key === 'tbm.breakdown') return `${label} ${Math.round((1 - e.value) * 100)}% less often`;
    if (e.key === 'tbm.rate') return `${label} x${e.value.toFixed(2)}`;
    if (e.key.startsWith('time.')) return `${label} ${Math.round((1 - e.value) * 100)}% shorter`;
    return `${label} ${Math.round((1 - e.value) * 100)}% cheaper`;
  }
  if (e.op === 'add') return `${label} ${e.value < 0 ? 'down' : 'up'} ${Math.round(Math.abs(e.value) * 100)} points`;
  return `${label} set to ${e.value}`;
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
