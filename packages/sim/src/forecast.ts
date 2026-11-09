/**
 * Forecasts and the live Bay Area vs Poland comparison.
 *
 * Both are computed by running the real engine forward on a copy of the state in forecast mode
 * (no events, expected-value breakdowns, player gates passed immediately), so an estimate and the
 * eventual outcome come from the same code. "What Poland would have paid" is the same alignment run
 * from the project's approval date under POLAND_PROFILE.
 */
import { DAYS_PER_YEAR } from './constants.ts';
import { dateAtTick } from './dates.ts';
import { advanceDay, applyCommand, autopilotCommands, projectLengthM, projectSpentCents, type StepContext } from './engine.ts';
import { designFlags, hardCost, projectFlags } from './model.ts';
import { POLAND_PROFILE, type Profile, profileFor } from './reforms.ts';
import { type ComparisonView, type FactorView, LEDGER_CATEGORIES, type LedgerCategory, type ProjectState, type SimState } from './types.ts';

const FORECAST: StepContext = { emit: null, forecast: true, benchmark: null };
const MAX_FORECAST_DAYS = DAYS_PER_YEAR * 80;
const _advanceDay = advanceDay;
const _applyCommand = applyCommand;
const _autopilot = autopilotCommands;

function zeroLedger(): Record<LedgerCategory, number> {
  const r = {} as Record<LedgerCategory, number>;
  for (const cat of LEDGER_CATEGORIES) r[cat] = 0;
  return r;
}

/** A private copy of the state holding only the given projects. The scenario object is shared, never mutated. */
function shell(state: SimState, projects: ProjectState[], reforms: readonly string[], tick: number, escalation: number): SimState {
  return {
    ...state,
    tick,
    escalation,
    reforms: [...reforms],
    projects,
    eventsEnabled: false,
    fundingReleased: [...state.fundingReleased],
    pendingEvents: [],
    eventLog: [],
    notices: [],
    ledger: { total: zeroLedger(), today: zeroLedger(), escalationCents: 0, monthly: [] },
  };
}

export interface Forecast {
  costCents: number;
  openTick: number;
}

function runToOpen(sim: SimState, projectId: string): Forecast {
  for (let day = 0; day <= MAX_FORECAST_DAYS; day++) {
    for (const cmd of _autopilot(sim)) _applyCommand(sim, cmd, FORECAST);
    const project = sim.projects[0];
    if (project.status === 'open') return { costCents: projectSpentCents(project), openTick: project.openedTick };
    _advanceDay(sim, FORECAST);
  }
  throw new Error(`sim: forecast of project "${projectId}" did not open within ${MAX_FORECAST_DAYS} days`);
}

/** Estimate at completion and opening tick of a project, continuing from the current state under the current reforms. */
export function forecastProject(state: SimState, project: ProjectState): Forecast {
  if (project.status === 'open') return { costCents: projectSpentCents(project), openTick: project.openedTick };
  const copy = JSON.parse(JSON.stringify(project)) as ProjectState;
  return runToOpen(shell(state, [copy], state.reforms, state.tick, state.escalation), project.id);
}

/** The same alignment, stations and start date under any set of reforms, from a blank project. */
export function forecastDesign(state: SimState, project: ProjectState, reforms: readonly string[]): { costCents: number; days: number } {
  const tick0 = project.approvedTick >= 0 ? project.approvedTick : state.tick;
  const esc0 = project.approvedTick >= 0 ? project.approvedEscalation : state.escalation;
  const sim = shell(state, [], reforms, tick0, esc0);
  _applyCommand(
    sim,
    { t: 'setAlignment', projectId: project.id, name: project.name, waypoints: project.waypoints, methods: project.methods },
    FORECAST,
  );
  for (const s of project.stations) {
    _applyCommand(
      sim,
      {
        t: 'addStation',
        projectId: project.id,
        stationId: s.id,
        name: s.name,
        template: s.template,
        chainageM: s.chainageM,
        depthM: s.depthM,
      },
      FORECAST,
    );
  }
  if (sim.projects.length !== 1)
    throw new Error(`sim: benchmark could not rebuild project "${project.id}": ${sim.notices.map((n) => n.reason).join('; ')}`);
  const f = runToOpen(sim, project.id);
  return { costCents: f.costCents, days: f.openTick - tick0 };
}

/** What Poland would have paid and how long it would have taken. */
export function polandBenchmark(state: SimState, project: ProjectState): { costCents: number; days: number } {
  if (project.status === 'open' && project.polandCostCents > 0) return { costCents: project.polandCostCents, days: project.polandDays };
  return forecastDesign(state, project, POLAND_PROFILE);
}

function softMultiplier(p: Profile): number {
  return (1 + p['soft.fixed']) * (1 + p['soft.contingency']);
}

function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 1;
}

/**
 * The receipt: cost = Polish base x design x unit prices x soft-and-contingency x delay.
 * The first three factors are closed form from the design and the profile; delay is the residual
 * (escalation, standing overhead, event overruns), so the product is exact.
 */
export function comparison(
  state: SimState,
  project: ProjectState,
  eac: Forecast,
  poland: { costCents: number; days: number },
  ridersPerDay: number,
): ComparisonView {
  const cur = profileFor(state.reforms);
  const pl = profileFor(POLAND_PROFILE);
  const lengthKm = projectLengthM(project) / 1000;
  const tick0 = project.approvedTick >= 0 ? project.approvedTick : state.tick;
  const start = state.scenario.start.date;
  const years = (eac.openTick - tick0) / DAYS_PER_YEAR;
  const polandYears = poland.days / DAYS_PER_YEAR;

  const flagsCur = projectFlags(project, cur);
  const hPolishDesign = hardCost(project, pl, designFlags(pl), true);
  const hActualPolishPrices = hardCost(project, cur, flagsCur, true);
  const hCurrent = hardCost(project, cur, flagsCur, false);
  const softCur = softMultiplier(cur);
  const softPl = softMultiplier(pl);
  const base = hPolishDesign.totalCents * softPl;
  const fDesign = ratio(hActualPolishPrices.totalCents, hPolishDesign.totalCents);
  const fUnit = ratio(hCurrent.totalCents, hActualPolishPrices.totalCents);
  const fSoft = softCur / softPl;
  const fDelay = ratio(eac.costCents, hCurrent.totalCents * softCur);
  const polandDelay = ratio(poland.costCents, base);

  const afterDesign = base * fDesign;
  const afterUnit = afterDesign * fUnit;
  const afterSoft = afterUnit * fSoft;
  const factors: FactorView[] = [
    {
      id: 'design',
      label: 'Design and scope',
      value: fDesign,
      polandValue: 1,
      contributionCents: Math.round(afterDesign - base),
      parts: [
        {
          id: 'tunnels',
          label: 'Tunnel and guideway cross-section',
          value: ratio(hActualPolishPrices.civilCents, hPolishDesign.civilCents),
        },
        { id: 'stations', label: 'Station size and finish', value: ratio(hActualPolishPrices.stationsCents, hPolishDesign.stationsCents) },
        { id: 'systems', label: 'Track count', value: ratio(hActualPolishPrices.systemsCents, hPolishDesign.systemsCents) },
      ],
    },
    {
      id: 'unitPrices',
      label: 'Unit prices',
      value: fUnit,
      polandValue: 1,
      contributionCents: Math.round(afterUnit - afterDesign),
      parts: [
        { id: 'procurement', label: 'Procurement and risk pricing', value: cur['unit.procurement'] },
        { id: 'labour', label: 'Labour rules and staffing', value: cur['unit.labour'] },
        { id: 'thirdParty', label: 'Utilities and third parties', value: cur['unit.thirdParty'] },
        { id: 'priceLevel', label: 'Closed market and price level', value: cur['unit.priceLevel'] },
        { id: 'systems', label: 'Bespoke systems (systems only)', value: cur['systems.factor'] },
      ],
    },
    {
      id: 'softContingency',
      label: 'Soft costs and contingency',
      value: fSoft,
      polandValue: 1,
      contributionCents: Math.round(afterSoft - afterUnit),
      parts: [
        { id: 'soft', label: 'Consultants and project management', value: (1 + cur['soft.fixed']) / (1 + pl['soft.fixed']) },
        { id: 'contingency', label: 'Contingency, always spent', value: (1 + cur['soft.contingency']) / (1 + pl['soft.contingency']) },
      ],
    },
    {
      id: 'delay',
      label: 'Delay: escalation, standing overhead, event overruns',
      value: fDelay,
      polandValue: polandDelay,
      contributionCents: Math.round(eac.costCents - afterSoft),
      parts: [{ id: 'years', label: 'Years from approval to opening, against Poland', value: ratio(years, polandYears) }],
    },
  ];

  return {
    lengthKm,
    costCents: eac.costCents,
    costPerKmCents: lengthKm > 0 ? Math.round(eac.costCents / lengthKm) : 0,
    openDate: dateAtTick(start, eac.openTick),
    yearsToOpen: years,
    ridersPerDay,
    costPerRiderCents: ridersPerDay > 0 ? Math.round(eac.costCents / ridersPerDay) : 0,
    poland: {
      costCents: poland.costCents,
      costPerKmCents: lengthKm > 0 ? Math.round(poland.costCents / lengthKm) : 0,
      openDate: dateAtTick(start, tick0 + poland.days),
      yearsToOpen: polandYears,
      costPerRiderCents: ridersPerDay > 0 ? Math.round(poland.costCents / ridersPerDay) : 0,
    },
    ratio: ratio(eac.costCents, poland.costCents),
    baseCents: Math.round(base),
    factors,
  };
}
