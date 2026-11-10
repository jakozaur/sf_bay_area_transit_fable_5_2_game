/**
 * A quick cost-benefit comparison of the missions, for the mission picker. Every cost, length and rider figure
 * is read off the sim: the scenario's reference plan is drawn in a headless sim (seed 1, event cards off) and
 * the numbers are those of its receipt and scorecard. Nothing here is typed in except the three benefit
 * ASSUMPTIONS below, which are round numbers for a back-of-envelope ratio and are UNVERIFIED.
 */
import { createSim, type ScenarioDef } from '@bayvox/sim';

/** ASSUMPTION: service days a year that carry the weekday ridership. */
export const BENEFIT_DAYS_PER_YEAR = 300;
/** ASSUMPTION: benefit of one trip in dollars (time saved and car costs avoided). Not sourced. */
export const BENEFIT_USD_PER_TRIP = 12;
/** ASSUMPTION: present value of one dollar a year for 30 years at 4 percent (the annuity factor, 17.29). */
export const BENEFIT_PRESENT_VALUE_YEARS = 17.29;

export interface CostBenefitRow {
  scenarioId: string;
  name: string;
  /** Route length of the reference plan. */
  lengthKm: number;
  /** The reference plan as the Polish design at Polish prices (the receipt's Poland column). */
  polandCostCents: number;
  /**
   * The sponsor's figure where one exists, scaled to this route by its own cost per km; otherwise the model's
   * status-quo run of the reference plan. `officialIsModel` says which.
   */
  officialCostCents: number;
  /** True when no sponsor figure exists and `officialCostCents` is the model under the rules of the start year. */
  officialIsModel: boolean;
  /** Riders a day of the reference plan from the demand model (approximate zone data, see sim demand.ts). */
  dailyRiders: number;
  /** Polish cost in dollars per daily rider. 0 without riders. */
  polandCostPerRiderUsd: number;
  /** Present value of the benefits (the three assumptions above) over the Polish cost. */
  benefitCostRatio: number;
  /** The same benefits over `officialCostCents`. */
  officialBenefitCostRatio: number;
}

function row(s: ScenarioDef): CostBenefitRow {
  const sim = createSim(s, 1, null, { events: false });
  sim.dispatch([{ t: 'useOfficialPlan' }]);
  const snap = sim.snapshot();
  const project = snap.projects.find((p) => p.id === s.reference?.projectId);
  if (!project)
    throw new Error(
      `scenarios costBenefit: the reference plan of "${s.id}" could not be drawn: ${snap.notices.map((n) => n.reason).join('; ')}`,
    );
  const r = project.receipt;
  const lengthKm = r.columns.yours.lengthKm;
  const polandCostCents = r.columns.poland.costCents;
  const officialCostCents = r.ghost ? Math.round(r.ghost.costPerKmCents * lengthKm) : r.columns.statusQuo.costCents;
  const dailyRiders = project.scorecard.ridersPerDay;
  const benefitCents = dailyRiders * BENEFIT_DAYS_PER_YEAR * BENEFIT_USD_PER_TRIP * 100 * BENEFIT_PRESENT_VALUE_YEARS;
  return {
    scenarioId: s.id,
    name: s.title,
    lengthKm,
    polandCostCents,
    officialCostCents,
    officialIsModel: r.ghost === null,
    dailyRiders,
    polandCostPerRiderUsd: dailyRiders > 0 ? Math.round(polandCostCents / dailyRiders / 100) : 0,
    benefitCostRatio: polandCostCents > 0 ? benefitCents / polandCostCents : 0,
    officialBenefitCostRatio: officialCostCents > 0 ? benefitCents / officialCostCents : 0,
  };
}

const cache = new WeakMap<readonly ScenarioDef[], readonly CostBenefitRow[]>();

/** One row per scenario with a reference plan (free build has none), in list order. Computed once per list. */
export function costBenefitOf(scenarios: readonly ScenarioDef[]): readonly CostBenefitRow[] {
  const hit = cache.get(scenarios);
  if (hit) return hit;
  const rows = scenarios.filter((s) => s.reference !== undefined).map(row);
  cache.set(scenarios, rows);
  return rows;
}
