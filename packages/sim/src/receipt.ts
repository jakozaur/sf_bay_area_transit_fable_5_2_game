/**
 * The receipt and the scorecard (round 2, owner decision): your project against the status quo, the sponsor's
 * official figure (the ghost) and Poland, per route-km in nominal USD, with the gap split into design scope,
 * institutional levers, delay and the price-level gap. Every ratio is computed from the columns; nothing is a literal.
 *
 * Waterfall of one column:
 *   base      the Polish design (twin bores, compact boxes) at Polish prices, no delay, for the column's route.
 *             It does not depend on what the column builds, so columns on the same route start from the same figure
 *   price     x the price-level factor, applied first: what the Polish design costs at Bay Area prices. No reform
 *             moves it, and applied here the line is the same dollars whatever else is reformed
 *   design    the column's design against the Polish design, by component (tunnel, stations, systems)
 *   levers    x procurement x staffing x utilities, systems supply (systems only), x soft costs, x contingency,
 *             then the cash paid for reforms and machines
 *   delay     overhead, event overruns, off-plan driving and hand digging as booked; escalation is the remainder
 * Design and levers come from the project's paid ledger (ProjectState.paid): every hard spend is re-priced
 * lever by lever on the day it is made, at the profile in force that day. A reform enacted half way through
 * therefore only shrinks its line for the money spent after it, and the factors shown are spend-weighted.
 * The cumulative figures are rounded to cents, so base plus the lines is the column's cost exactly. A line under
 * a thousand dollars is float and rounding residue: it is shown as zero and its cents go to the next line.
 */
import type { MissionResult } from '@bayvox/core';
import { DAYS_PER_YEAR } from './constants.ts';
import { dateAtTick, isoToDays, monthYear } from './dates.ts';
import type { DesignRun, Forecast } from './forecast.ts';
import { designFlags, hardCost, type ProjectGeometry, polishGeometry } from './model.ts';
import { POLAND_PROFILE, type ProfileKey, profileFor, REFORMS } from './reforms.ts';
import {
  type GhostView,
  type PaidLedger,
  type PolandTarget,
  RECEIPT_COLUMNS,
  RECEIPT_GROUPS,
  RECEIPT_LINES,
  type Receipt,
  type ReceiptColumn,
  type ReceiptColumnId,
  type ReceiptGroup,
  type ReceiptLine,
  type ReceiptLineId,
  type ScenarioDef,
  type ScoreColumn,
  type Scorecard,
  type StarAxis,
} from './types.ts';

interface LineDef {
  group: ReceiptGroup;
  label: string;
  evidence: string;
}

export const RECEIPT_LINE_DEFS: Record<ReceiptLineId, LineDef> = {
  designTunnel: {
    group: 'designScope',
    label: 'Tunnel cross-section and method',
    evidence: 'doc 11 section 6.2 (three-track mined section 190 m2 and a 22 m by 18 m box, against two 34 m2 tubes)',
  },
  designStations: {
    group: 'designScope',
    label: 'Station size and finish',
    evidence: 'doc 06 sections 3.3 and 7.5 (station right-sizing and catalogue lever 1.6; mainline terminal scope)',
  },
  designSystems: {
    group: 'designScope',
    label: 'Track count',
    evidence: 'doc 11 section 6.3 (three-track systems add-on for The Portal)',
  },
  procurement: {
    group: 'institutional',
    label: 'Procurement and risk pricing',
    evidence: 'doc 06 section 7.5 (TCP 1.85 in New York, scaled to 1.5)',
  },
  staffing: {
    group: 'institutional',
    label: 'Site staffing and work hours',
    evidence: 'doc 07 section 4 (1.3; TCP 1.5 in New York, discounted)',
  },
  utilities: {
    group: 'institutional',
    label: 'Utilities and third parties',
    evidence: 'doc 07 section 4 (1.2; TCP agency factor about 20 percent)',
  },
  systemsSupply: {
    group: 'institutional',
    label: 'Bespoke systems and Buy America',
    evidence: 'doc 06 section 7.5 and doc 07 section 4 (1.15 each, on track, power and signalling only)',
  },
  softCosts: {
    group: 'institutional',
    label: 'Consultants and project management',
    evidence: 'doc 06 sections 7.1 and 7.5 (soft costs 30 percent of hard against 7 to 10)',
  },
  contingency: {
    group: 'institutional',
    label: 'Contingency, always spent',
    evidence: 'doc 06 section 3.3 ("all money in the budget will be spent"; 30 to 40 percent held)',
  },
  reformCash: {
    group: 'institutional',
    label: 'Reforms and machines bought with cash',
    evidence: 'your own purchases in the reform tree: surveys, plant and machines are paid by the project they are bought for',
  },
  escalation: {
    group: 'delay',
    label: 'Escalation over the schedule',
    evidence:
      'doc 07 section 4 (4 percent a year). Computed as the remainder, so it also carries money spent at the prices in force before a reform was enacted',
  },
  overhead: {
    group: 'delay',
    label: 'Standing organisation',
    evidence: 'doc 06 section 7.5 (2 percent of hard cost a year under the status quo; assumption there)',
  },
  events: {
    group: 'delay',
    label: 'Lawsuits, surprises and change orders',
    evidence: 'doc 07 section 6 (event cards; what the contingency did not absorb)',
  },
  offPlan: {
    group: 'delay',
    label: 'Driving off the planned alignment',
    evidence: 'game rule: metres bored beyond the free tolerance cost 25 percent more; tuning, no source',
  },
  handDig: {
    group: 'delay',
    label: 'Digging by hand',
    evidence: 'doc 11 section 5.3 (cut-and-cover rate per m3, reused for the dig brush; the reuse is an assumption)',
  },
  priceLevel: {
    group: 'priceLevel',
    label: 'Bay Area wages and prices',
    evidence: 'doc 11 sections 4.2 and 5.1 (3.71 PLN/USD market rate over 2.3 construction PPP: 1.61). Not a lever: no reform removes it',
  },
};

export const RECEIPT_GROUP_LABELS: Record<ReceiptGroup, string> = {
  designScope: 'Design scope',
  institutional: 'Institutional levers',
  delay: 'Delay and escalation',
  priceLevel: 'Price level',
};

/** Receipt lines a profile key feeds. */
function linesOfKey(key: ProfileKey): ReceiptLineId[] {
  if (key === 'design.threeTrack') return ['designTunnel', 'designStations', 'designSystems'];
  if (key === 'design.deepBox' || key === 'design.twinBoreDefault' || key === 'tbm.geologyRelief') return ['designTunnel'];
  // The small bore is a smaller tunnel and a faster machine.
  if (key === 'tbm.smallBore') return ['designTunnel', 'escalation', 'overhead'];
  if (key.startsWith('design.')) return ['designStations'];
  if (key === 'unit.procurement') return ['procurement'];
  if (key === 'unit.labour') return ['staffing'];
  if (key === 'unit.thirdParty') return ['utilities'];
  if (key === 'unit.priceLevel') return ['priceLevel'];
  if (key === 'systems.factor') return ['systemsSupply'];
  if (key === 'soft.fixed') return ['softCosts'];
  if (key === 'soft.contingency') return ['contingency'];
  if (key === 'soft.overheadPerYear') return ['overhead'];
  if (key.startsWith('event.')) return ['events'];
  // time.* and the machine rates: a shorter schedule escalates less and feeds the standing organisation for fewer years.
  return ['escalation', 'overhead'];
}

const REFORM_LINES = new Map<string, ReceiptLineId[]>(
  REFORMS.map((r) => {
    const set = new Set<ReceiptLineId>();
    for (const e of r.effects) for (const id of linesOfKey(e.key)) set.add(id);
    return [r.id, RECEIPT_LINES.filter((id) => set.has(id))];
  }),
);

/** Receipt lines a reform shrinks or removes, in receipt order. */
export function reformReceiptLines(reformId: string): ReceiptLineId[] {
  return REFORM_LINES.get(reformId) ?? [];
}

export interface ColumnInput {
  id: ReceiptColumnId;
  label: string;
  basis: string;
  kind: ReceiptColumn['kind'];
  geometry: ProjectGeometry;
  /** The column's hard spend re-priced lever by lever (ProjectState.paid at opening, actual or forecast). */
  paid: PaidLedger;
  /** All-in cost, cents. */
  totalCents: number;
  /** Booked amounts inside the total. */
  reformCents: number;
  overheadCents: number;
  eventsCents: number;
  offPlanCents: number;
  handDigCents: number;
  /** Tick the column's clock started and the days it took (or will take) to open. */
  tick0: number;
  days: number;
}

interface Waterfall {
  baseCents: number;
  /** Dollars each line adds, by line id, rounded to cents; with baseCents they sum to the column's cost exactly. */
  cents: Record<ReceiptLineId, number>;
  /** Cumulative cost before each line in the order the waterfall is computed, for the line factors. */
  before: Record<ReceiptLineId, number>;
}

/** The order the waterfall is computed in: the price level first, then RECEIPT_LINES. */
const WATERFALL_ORDER: readonly ReceiptLineId[] = ['priceLevel', ...RECEIPT_LINES.filter((id) => id !== 'priceLevel')];
/** A line smaller than this is residue of float arithmetic and daily rounding, not money: a thousand dollars. */
const DUST_CENTS = 100_000;

function waterfall(c: ColumnInput): Waterfall {
  const pl = profileFor(POLAND_PROFILE);
  const softPl = (1 + pl['soft.fixed']) * (1 + pl['soft.contingency']);
  const h0 = hardCost(polishGeometry(c.geometry), pl, designFlags(pl), true);
  const paid = c.paid;
  const base = h0.totalCents * softPl;
  // Spend-weighted price level of the column: 1 for Poland, the Bay Area factor for everything built here.
  const price = paid.steps[6] > 0 && paid.steps[7] > 0 ? paid.steps[7] / paid.steps[6] : 1;
  const after = {} as Record<ReceiptLineId, number>;
  after.priceLevel = base * price;
  // Design: what was built against the Polish design, both at Polish prices, by component.
  let v = base + (paid.civil - h0.civilCents) * softPl;
  after.designTunnel = v * price;
  v += (paid.stations - h0.stationsCents) * softPl;
  after.designStations = v * price;
  // paid.steps[0] is the whole hard spend at Polish prices with the Polish rider: the end of the design lines.
  after.designSystems = paid.steps[0] * price;
  // Levers, each at the profile in force when the money was spent. The last is the unescalated spend itself.
  after.procurement = paid.steps[1] * price;
  after.staffing = paid.steps[2] * price;
  after.utilities = paid.steps[3] * price;
  after.systemsSupply = paid.steps[4] * price;
  after.softCosts = paid.steps[5] * price;
  after.contingency = paid.steps[7];
  after.reformCash = paid.steps[7] + c.reformCents;
  // The booked delay lines are exact cents, counted back from the total; escalation is what is left between.
  after.handDig = c.totalCents;
  after.offPlan = after.handDig - c.handDigCents;
  after.events = after.offPlan - c.offPlanCents;
  after.overhead = after.events - c.eventsCents;
  after.escalation = after.overhead - c.overheadCents;
  const baseCents = Math.round(base);
  const cents = {} as Record<ReceiptLineId, number>;
  const before = {} as Record<ReceiptLineId, number>;
  let prev = baseCents;
  for (let i = 0; i < WATERFALL_ORDER.length; i++) {
    const id = WATERFALL_ORDER[i];
    const last = i === WATERFALL_ORDER.length - 1;
    // The cash paid for reforms is a booked amount: the line is that amount to the cent, on top of what came before.
    let now = last ? c.totalCents : id === 'reformCash' ? prev + c.reformCents : Math.round(after[id]);
    // Residue is carried to the next line; escalation, a remainder by definition, takes what is left. The delay
    // lines after it are booked amounts, exact to the cent, and are never touched.
    if (!last && id !== 'reformCash' && RECEIPT_LINE_DEFS[id].group !== 'delay' && Math.abs(now - prev) < DUST_CENTS) now = prev;
    before[id] = prev;
    cents[id] = now - prev;
    prev = now;
  }
  return { baseCents, cents, before };
}

function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 1;
}

function column(c: ColumnInput, w: Waterfall, start: string): ReceiptColumn {
  const lengthKm = c.geometry.cum[c.geometry.cum.length - 1] / 1000;
  return {
    id: c.id,
    label: c.label,
    basis: c.basis,
    kind: c.kind,
    lengthKm,
    baseCents: w.baseCents,
    costCents: c.totalCents,
    costPerKmCents: lengthKm > 0 ? Math.round(c.totalCents / lengthKm) : 0,
    openDate: dateAtTick(start, c.tick0 + Math.round(c.days)),
    yearsToOpen: c.days / DAYS_PER_YEAR,
  };
}

export interface GhostInput {
  label: string;
  costCents: number;
  openDate: string;
  lengthKm: number;
  source: string;
  /** What Poland would pay per route-km for the sponsor's own route and stations; absent: the Poland column is used. */
  polandPerKmCents?: number;
}

/** The sponsor figure of a scenario, or null for a line nobody has officially priced. */
export function ghostOf(scenario: ScenarioDef, referenceLengthKm: number): GhostInput | null {
  const r = scenario.reference;
  if (!r || r.officialCostCents === undefined) return null;
  return {
    label: r.ghostLabel ?? r.title,
    costCents: r.officialCostCents,
    openDate: r.officialOpenDate ?? '',
    lengthKm: r.officialLengthKm ?? referenceLengthKm,
    source: r.source,
  };
}

export function buildReceipt(
  projectId: string,
  final: boolean,
  inputs: Record<ReceiptColumnId, ColumnInput>,
  ghost: GhostInput | null,
  enacted: ReadonlySet<string>,
  start: string,
): Receipt {
  const falls = {} as Record<ReceiptColumnId, Waterfall>;
  const columns = {} as Record<ReceiptColumnId, ReceiptColumn>;
  for (const id of RECEIPT_COLUMNS) {
    falls[id] = waterfall(inputs[id]);
    columns[id] = column(inputs[id], falls[id], start);
  }
  const lines: ReceiptLine[] = RECEIPT_LINES.map((id) => {
    const def = RECEIPT_LINE_DEFS[id];
    const factor = {} as Record<ReceiptColumnId, number>;
    const cents = {} as Record<ReceiptColumnId, number>;
    for (const col of RECEIPT_COLUMNS) {
      const before = falls[col].before[id];
      cents[col] = falls[col].cents[id];
      factor[col] = before > 0 && cents[col] !== 0 ? (before + cents[col]) / before : 1;
    }
    const reforms = REFORMS.filter((r) => reformReceiptLines(r.id).includes(id)).map((r) => ({
      id: r.id,
      title: r.title,
      enacted: enacted.has(r.id),
    }));
    // Reduced: a reform against the line is enacted and the player's factor is below the status quo's. A reform
    // bought after the contracts were let is enacted and changes nothing: the line is still paid in full.
    const lowered = def.group === 'delay' || factor.yours < factor.statusQuo - 1e-3;
    const status: ReceiptLine['status'] = cents.yours === 0 ? 'removed' : reforms.some((r) => r.enacted) && lowered ? 'reduced' : 'paid';
    return { id, group: def.group, label: def.label, factor, cents, reforms, status, evidence: def.evidence };
  });
  const groups = RECEIPT_GROUPS.map((id) => {
    const factor = {} as Record<ReceiptColumnId, number>;
    const cents = {} as Record<ReceiptColumnId, number>;
    for (const col of RECEIPT_COLUMNS) {
      factor[col] = 1;
      cents[col] = 0;
      for (const line of lines) {
        if (line.group !== id) continue;
        factor[col] *= line.factor[col];
        cents[col] += line.cents[col];
      }
    }
    return { id, label: RECEIPT_GROUP_LABELS[id], factor, cents };
  });
  let ghostView: GhostView | null = null;
  if (ghost) {
    ghostView = {
      label: ghost.label,
      costCents: ghost.costCents,
      costPerKmCents: ghost.lengthKm > 0 ? Math.round(ghost.costCents / ghost.lengthKm) : 0,
      openDate: ghost.openDate,
      lengthKm: ghost.lengthKm,
      source: ghost.source,
      unexplainedShare: 0,
    };
    // Per route-km, so a sponsor figure for a longer corridor (Dumbarton) is compared like with like.
    if (ghostView.costPerKmCents > 0)
      ghostView.unexplainedShare = (ghostView.costPerKmCents - columns.statusQuo.costPerKmCents) / ghostView.costPerKmCents;
    // The sponsor's figure is for the sponsor's route: its ratio is against Poland on that route, not on the
    // player's. The second playtest read "official plan: 11.8 times" on a hand-drawn line and 18.7 on the official one.
    ghostView.polandPerKmCents =
      ghost.polandPerKmCents !== undefined && ghost.polandPerKmCents > 0 ? ghost.polandPerKmCents : columns.poland.costPerKmCents;
  }
  const perKm = (id: ReceiptColumnId) => columns[id].costPerKmCents;
  return {
    projectId,
    final,
    columns,
    ghost: ghostView,
    lines,
    groups,
    ratios: {
      yoursToPoland: ratio(perKm('yours'), perKm('poland')),
      statusQuoToPoland: ratio(perKm('statusQuo'), perKm('poland')),
      ghostToPoland: ghostView ? ratio(ghostView.costPerKmCents, ghostView.polandPerKmCents ?? perKm('poland')) : null,
      yoursToStatusQuo: ratio(perKm('yours'), perKm('statusQuo')),
    },
  };
}

/** A receipt of zeros for a project without an alignment. */
export function emptyReceipt(projectId: string, date: string): Receipt {
  const col = (id: ReceiptColumnId): ReceiptColumn => ({
    id,
    label: COLUMN_LABELS[id],
    basis: 'No alignment yet',
    kind: 'model',
    lengthKm: 0,
    baseCents: 0,
    costCents: 0,
    costPerKmCents: 0,
    openDate: date,
    yearsToOpen: 0,
  });
  const zero = () => ({ yours: 0, statusQuo: 0, poland: 0 });
  const one = () => ({ yours: 1, statusQuo: 1, poland: 1 });
  return {
    projectId,
    final: false,
    columns: { yours: col('yours'), statusQuo: col('statusQuo'), poland: col('poland') },
    ghost: null,
    lines: RECEIPT_LINES.map((id) => ({
      id,
      group: RECEIPT_LINE_DEFS[id].group,
      label: RECEIPT_LINE_DEFS[id].label,
      factor: one(),
      cents: zero(),
      reforms: [],
      status: 'removed' as const,
      evidence: RECEIPT_LINE_DEFS[id].evidence,
    })),
    groups: RECEIPT_GROUPS.map((id) => ({ id, label: RECEIPT_GROUP_LABELS[id], factor: one(), cents: zero() })),
    ratios: { yoursToPoland: 1, statusQuoToPoland: 1, ghostToPoland: null, yoursToStatusQuo: 1 },
  };
}

export const COLUMN_LABELS: Record<ReceiptColumnId, string> = { yours: 'Your project', statusQuo: 'Status quo', poland: 'Poland' };

/** Column input of a counterfactual run. */
export function runColumn(id: ReceiptColumnId, basis: string, run: DesignRun, tick0: number): ColumnInput {
  return {
    id,
    label: COLUMN_LABELS[id],
    basis,
    kind: 'model',
    geometry: run.project,
    paid: run.project.paid,
    totalCents: run.costCents,
    reformCents: run.spent.reforms,
    overheadCents: run.spent.overhead,
    eventsCents: run.spent.events,
    offPlanCents: 0,
    handDigCents: 0,
    tick0,
    days: run.days,
  };
}

/** Column input of the player's project from its forecast (or its books once open). */
export function yoursColumn(
  basis: string,
  final: boolean,
  geometry: ProjectGeometry,
  eac: Forecast,
  booked: { offPlanCents: number; handDigCents: number },
  tick0: number,
): ColumnInput {
  return {
    id: 'yours',
    label: COLUMN_LABELS.yours,
    basis,
    kind: final ? 'actual' : 'forecast',
    geometry,
    paid: eac.paid,
    totalCents: eac.costCents,
    reformCents: eac.spent.reforms,
    overheadCents: eac.spent.overhead,
    eventsCents: eac.spent.events,
    offPlanCents: booked.offPlanCents,
    handDigCents: booked.handDigCents,
    tick0,
    days: eac.openTick - tick0,
  };
}

// ---------------------------------------------------------------- scorecard

/** Stars by where a figure sits between Poland (0) and the ghost (1): 3 up to a quarter of the way, 2 up to 0.6, 1 below the ghost. */
const THREE_STARS = 0.25;
const TWO_STARS = 0.6;

function starsAt(position: number): number {
  if (position <= THREE_STARS) return 3;
  if (position <= TWO_STARS) return 2;
  if (position < 1) return 1;
  return 0;
}

function money(cents: number): string {
  return Math.abs(cents) >= 1e11 ? `$${(cents / 1e11).toFixed(2)}B` : `$${(cents / 1e8).toFixed(0)}M`;
}

export interface ScoreInput {
  receipt: Receipt;
  ridersPerDay: number;
  /** Riders the reference plan would carry, or 0 when the scenario has none. */
  referenceRiders: number;
  /** Scenario start, for years-to-open of the ghost. */
  start: string;
  polandSource: string;
}

export function buildScorecard(i: ScoreInput): Scorecard {
  const r = i.receipt;
  const y = r.columns.yours;
  const q = r.columns.statusQuo;
  const pl = r.columns.poland;
  const yours: ScoreColumn = {
    label: y.label,
    kind: 'yours',
    costCents: y.costCents,
    costPerKmCents: y.costPerKmCents,
    lengthKm: y.lengthKm,
    openDate: y.openDate,
    yearsToOpen: y.yearsToOpen,
    source: r.final ? 'your books on opening day' : 'forecast at completion',
  };
  const ghost: ScoreColumn = r.ghost
    ? {
        label: r.ghost.label,
        kind: 'sponsor',
        costCents: r.ghost.costCents,
        costPerKmCents: r.ghost.costPerKmCents,
        lengthKm: r.ghost.lengthKm,
        // A sponsor figure without a date (Dumbarton) has none here either: '' and 0, and the date axis is scored on the model.
        openDate: r.ghost.openDate,
        yearsToOpen: r.ghost.openDate ? (isoToDays(r.ghost.openDate) - isoToDays(i.start)) / DAYS_PER_YEAR : 0,
        source: r.ghost.source,
      }
    : {
        label: 'Status quo (model)',
        kind: 'model',
        costCents: q.costCents,
        costPerKmCents: q.costPerKmCents,
        lengthKm: q.lengthKm,
        openDate: q.openDate,
        yearsToOpen: q.yearsToOpen,
        source: `No official figure exists. This is the model under the rules of the starting year: ${q.basis}`,
      };
  const poland: ScoreColumn = {
    label: 'Poland',
    kind: 'poland',
    costCents: pl.costCents,
    costPerKmCents: pl.costPerKmCents,
    lengthKm: pl.lengthKm,
    openDate: pl.openDate,
    yearsToOpen: pl.yearsToOpen,
    source: i.polandSource,
  };

  // Cost: position on a log scale between Poland's cost per km and the ghost's.
  const rYours = ratio(yours.costPerKmCents, poland.costPerKmCents);
  // The sponsor figure is measured against Poland on the sponsor's route (GhostView.polandPerKmCents).
  const rGhost = r.ratios.ghostToPoland ?? ratio(ghost.costPerKmCents, poland.costPerKmCents);
  let costStars: number;
  if (yours.costPerKmCents <= 0) costStars = 0;
  else if (rGhost > 1.05) costStars = starsAt(rYours <= 1 ? 0 : Math.log(rYours) / Math.log(rGhost));
  else costStars = rYours <= 1.05 ? 3 : rYours <= 1.5 ? 2 : rYours <= 2 ? 1 : 0;
  const costReason = `${money(yours.costPerKmCents)} per km: ${rYours.toFixed(1)}x Poland, where ${ghost.label} is ${rGhost.toFixed(1)}x`;

  // Date: position between Poland's years to open and the ghost's; without a sponsor date, the model's status quo.
  const dated = ghost.openDate !== '';
  const slowYears = dated ? ghost.yearsToOpen : q.yearsToOpen;
  const span = slowYears - poland.yearsToOpen;
  let dateStars: number;
  if (span > 0.25) dateStars = starsAt((yours.yearsToOpen - poland.yearsToOpen) / span);
  else dateStars = yours.yearsToOpen <= poland.yearsToOpen + 0.5 ? 3 : yours.yearsToOpen <= poland.yearsToOpen + 1.5 ? 2 : 1;
  const dateReason = `${r.final ? 'Opened' : 'Opens'} ${monthYear(yours.openDate)}, ${yours.yearsToOpen.toFixed(1)} years: Poland ${poland.yearsToOpen.toFixed(1)}, ${dated ? ghost.label : 'the status quo'} ${slowYears.toFixed(1)}`;

  // Riders: against the reference plan when there is one, else per route-km.
  let riderStars: number;
  let riderReason: string;
  if (i.referenceRiders > 0) {
    const share = i.ridersPerDay / i.referenceRiders;
    riderStars = share >= 0.9 ? 3 : share >= 0.6 ? 2 : share >= 0.3 ? 1 : 0;
    riderReason = `${i.ridersPerDay.toLocaleString('en-US')} riders a day, ${Math.round(share * 100)} percent of the reference plan`;
  } else {
    const perKm = yours.lengthKm > 0 ? i.ridersPerDay / yours.lengthKm : 0;
    riderStars = perKm >= 3000 ? 3 : perKm >= 1500 ? 2 : perKm > 0 ? 1 : 0;
    riderReason = `${i.ridersPerDay.toLocaleString('en-US')} riders a day, ${Math.round(perKm).toLocaleString('en-US')} per route-km`;
  }
  const axes: { id: StarAxis; stars: number; reason: string }[] = [
    { id: 'cost', stars: costStars, reason: costReason },
    { id: 'date', stars: dateStars, reason: dateReason },
    { id: 'riders', stars: riderStars, reason: riderReason },
  ];
  const stars = Math.min(costStars, dateStars, riderStars);
  const AXIS_NAME: Record<StarAxis, string> = { cost: 'cost', date: 'opening date', riders: 'riders' };
  const weakest = axes.filter((a) => a.stars === stars).map((a) => AXIS_NAME[a.id]);
  const starsReason = stars === 3 ? 'Three stars on every axis.' : `Rating is your weakest axis: ${weakest.join(' and ')}.`;
  const tense = r.final ? 'You paid' : 'You are on course to pay';
  const verdict = `${tense} ${money(yours.costCents)}: ${rYours.toFixed(1)}x Poland per km. ${ghost.label}: ${rGhost.toFixed(1)}x.`;
  return {
    projectId: r.projectId,
    final: r.final,
    yours,
    ghost,
    poland,
    ridersPerDay: i.ridersPerDay,
    costPerRiderCents: i.ridersPerDay > 0 ? Math.round(yours.costCents / i.ridersPerDay) : 0,
    stars,
    starsReason,
    axes,
    verdict,
    polandTarget: polandTargetOf(yours, poland),
  };
}

/** The limit of the win target: twice Poland on cost and on time. */
export const POLAND_TARGET_LIMIT = 2;

/** Your column against the Poland column. Without a Polish figure a ratio is 0 and the target is not met. */
export function polandTargetOf(yours: ScoreColumn, poland: ScoreColumn): PolandTarget {
  const costRatio = poland.costCents > 0 ? yours.costCents / poland.costCents : 0;
  const timeRatio = poland.yearsToOpen > 0 ? yours.yearsToOpen / poland.yearsToOpen : 0;
  const met = costRatio > 0 && timeRatio > 0 && costRatio <= POLAND_TARGET_LIMIT && timeRatio <= POLAND_TARGET_LIMIT;
  return { costRatio, timeRatio, limit: POLAND_TARGET_LIMIT, met };
}

export function missionResult(card: Scorecard): MissionResult {
  return {
    stars: card.stars,
    costCents: card.yours.costCents,
    costPerKmCents: card.yours.costPerKmCents,
    openDate: card.yours.openDate,
    ratioToPoland: ratio(card.yours.costPerKmCents, card.poland.costPerKmCents),
  };
}
