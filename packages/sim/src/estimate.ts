/**
 * Closed-form estimate at completion (round 2). The forecast in forecast.ts runs the engine day by day and is
 * the number of record; this file prices a design in a few arithmetic steps, so the draw tool can call it on
 * every pointer move and the design chooser and the reform screen can show what a change is worth.
 * It ignores event cards and the daily rounding of the engine, and lands within a few percent of the forecast
 * (asserted in sim.round2.test.ts). Queries only: nothing here touches sim state, so Math.pow is allowed.
 */

import { checkAlignment } from './checks.ts';
import { DAYS_PER_YEAR, CONSTANTS as K } from './constants.ts';
import { dateAtTick } from './dates.ts';
import { defaultMethod, optionLocks } from './design.ts';
import { expectedAvailability, projectSpentCents } from './engine.ts';
import { chainages, segmentIndexAt } from './geometry.ts';
import {
  advanceRate,
  designFlags,
  hardCost,
  headingSpans,
  isTbm,
  type ProjectGeometry,
  phaseDays,
  polishGeometry,
  projectFlags,
  standardsFor,
  stationBuildDays,
} from './model.ts';
import { POLAND_PROFILE, type Profile, profileFor } from './reforms.ts';
import {
  type AlignmentEstimate,
  type AlignmentEstimateRequest,
  type DesignFlags,
  type DesignOptionId,
  type Method,
  PHASES,
  type PhaseId,
  type ProjectState,
  type SimState,
  type StationBoxId,
  TUNNEL_OPTION_METHOD,
  TUNNEL_OPTIONS,
  type TunnelOptionId,
  type Waypoint,
} from './types.ts';

const ESCALATION = 1 + K.escalationPerYear.value;
const MAX_ESTIMATE_WAYPOINTS = 512;

/** Days the longest run of one effective method takes at its steady rate: the headings' share of construction. */
export function plannedHeadingDays(g: ProjectGeometry, p: Profile, flags: DesignFlags): number {
  let days = 0;
  for (const span of headingSpans(g, flags)) {
    const share = isTbm(span.method) ? expectedAvailability(p) : 1;
    let runDays = 0;
    let i = segmentIndexAt(g.cum, span.fromM);
    let s = span.fromM;
    while (s < span.toM - 1e-9 && i < g.methods.length) {
      const end = Math.min(span.toM, g.cum[i + 1]);
      const rate = advanceRate(span.method, g.waypoints[i].geology ?? 'softGround', p, Number.POSITIVE_INFINITY) * share;
      runDays += (end - s) / rate;
      s = end;
      i++;
    }
    days = Math.max(days, runDays);
  }
  return days;
}

/** Days the slowest station takes to build. */
export function plannedStationDays(g: ProjectGeometry, p: Profile, flags: DesignFlags): number {
  let days = 0;
  for (const s of g.stations) days = Math.max(days, stationBuildDays(s.template, flags, p['time.constructionFactor']));
  return days;
}

/** Planned length of the construction phase: the slower of the headings and the stations. */
export function plannedConstructionDays(g: ProjectGeometry, p: Profile, flags: DesignFlags): number {
  return Math.max(plannedHeadingDays(g, p, flags), plannedStationDays(g, p, flags));
}

/** Where a project stands when it is priced. */
export interface Standing {
  phase: PhaseId;
  /** 0..1 of the current phase. */
  phaseProgress: number;
  delayDays: number;
  spentCents: number;
  /** Price index today. */
  escalation: number;
}

export interface QuickEstimate {
  costCents: number;
  /** Days from today to opening. */
  days: number;
}

/** Closed-form estimate at completion of a design from where it stands. */
export function quickEstimate(g: ProjectGeometry, p: Profile, flags: DesignFlags, at: Standing): QuickEstimate {
  if (g.methods.length === 0) return { costCents: at.spentCents, days: 0 };
  const index = PHASES.indexOf(at.phase);
  let pre = at.delayDays;
  for (const id of ['planning', 'permitting', 'procurement', 'utilities'] as const) {
    const i = PHASES.indexOf(id);
    if (i > index) pre += phaseDays(id, p);
    else if (i === index) pre += phaseDays(id, p) * (1 - at.phaseProgress);
  }
  const buildShare = at.phase === 'construction' ? 1 - at.phaseProgress : at.phase === 'fitOut' ? 0 : 1;
  const fitShare = at.phase === 'fitOut' ? 1 - at.phaseProgress : 1;
  const build = plannedConstructionDays(g, p, flags) * buildShare;
  const fit = phaseDays('fitOut', p) * fitShare;
  const days = pre + build + fit;
  const index0 = at.escalation;
  const esc = (t: number) => index0 * ESCALATION ** (t / DAYS_PER_YEAR);
  const hard = hardCost(g, p, flags, false);
  const riders = (1 + p['soft.fixed']) * (1 + p['soft.contingency']);
  const construction = (hard.civilCents + hard.stationsCents) * buildShare * riders * esc(pre + build / 2);
  const systems = hard.systemsCents * fitShare * riders * esc(pre + build + fit / 2);
  const overhead = hard.totalCents * p['soft.overheadPerYear'] * (days / DAYS_PER_YEAR) * esc(days / 2);
  return { costCents: Math.round(at.spentCents + construction + systems + overhead), days };
}

/** Where a draft starts: the scenario's head start, or the first day of planning. */
export function draftStanding(state: SimState): Standing {
  const head = state.scenario.start.headStart;
  return {
    phase: head ? head.phase : 'planning',
    phaseProgress: head ? head.progress : 0,
    delayDays: 0,
    spentCents: 0,
    escalation: state.escalation,
  };
}

export function standingOf(state: SimState, project: ProjectState): Standing {
  if (project.status === 'draft') return { ...draftStanding(state), spentCents: projectSpentCents(project) };
  return {
    phase: project.phase,
    phaseProgress: project.awaiting ? 1 : project.phaseProgress,
    delayDays: project.delayDays,
    spentCents: projectSpentCents(project),
    escalation: state.escalation,
  };
}

/** Closed-form estimate of an existing project under a set of reforms (the reform screen's "before you buy"). */
export function quickProject(state: SimState, project: ProjectState, reforms: readonly string[]): QuickEstimate {
  if (project.status === 'open') return { costCents: projectSpentCents(project), days: 0 };
  const p = profileFor(reforms);
  return quickEstimate(project, p, projectFlags(project, p), standingOf(state, project));
}

/**
 * Closed-form estimate of a project with one design option swapped in. A locked option is priced under the
 * reforms that unlock it, because that is the only way the player can get it.
 */
export function quickOption(state: SimState, project: ProjectState, option: DesignOptionId): QuickEstimate {
  const base = profileFor(state.reforms);
  const locks = optionLocks(option, base).filter((id) => !state.reforms.includes(id));
  const p = locks.length > 0 ? profileFor([...state.reforms, ...locks]) : base;
  const isTunnel = (TUNNEL_OPTIONS as readonly string[]).includes(option);
  const variant = {
    waypoints: project.waypoints,
    cum: project.cum,
    stations: project.stations,
    methods: isTunnel ? swapTunnel(project.methods, option as TunnelOptionId) : project.methods,
    frozen: project.frozen,
    tunnelChoice: isTunnel ? (option as TunnelOptionId) : project.tunnelChoice,
    stationBox: isTunnel ? project.stationBox : (option as StationBoxId),
  };
  // A compact box chosen where the profile still mandates the mezzanine cannot happen: the lock reform is in `p`.
  return quickEstimate(variant, p, projectFlags(variant, p), standingOf(state, project));
}

function swapTunnel(methods: readonly Method[], option: TunnelOptionId): Method[] {
  const m = TUNNEL_OPTION_METHOD[option];
  return methods.map((x) => (x === 'atGrade' || x === 'viaduct' ? x : m));
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** SimQueries.estimateAlignment over a state. Pure; see SimQueries for the contract and the time budget. */
export function estimateAlignment(state: SimState, req: AlignmentEstimateRequest): AlignmentEstimate {
  if (!req || !Array.isArray(req.waypoints)) throw new Error('sim estimateAlignment: waypoints must be an array');
  const n = req.waypoints.length;
  if (n < 2 || n > MAX_ESTIMATE_WAYPOINTS)
    throw new Error(`sim estimateAlignment: needs 2 to ${MAX_ESTIMATE_WAYPOINTS} waypoints, got ${n}`);
  for (let i = 0; i < n; i++) {
    const w = req.waypoints[i];
    if (!w || !finite(w.x) || !finite(w.y) || !finite(w.z))
      throw new Error(`sim estimateAlignment: waypoints[${i}] must have finite x, y and z, got ${JSON.stringify(w)}`);
  }
  if (req.methods && req.methods.length !== n - 1)
    throw new Error(`sim estimateAlignment: ${req.methods.length} methods for ${n - 1} segments; one per segment is required`);
  if (req.tunnel !== undefined && !TUNNEL_OPTIONS.includes(req.tunnel))
    throw new Error(`sim estimateAlignment: unknown tunnel option "${String(req.tunnel)}"`);
  // A project id that does not exist yet is a line being drawn for the first time.
  const project = req.projectId === undefined ? undefined : state.projects.find((x) => x.id === req.projectId);
  const p = profileFor(state.reforms);
  const waypoints: Waypoint[] = req.waypoints;
  const tunnel = req.tunnel ?? project?.tunnelChoice ?? null;
  let methods: Method[];
  if (req.methods) methods = [...req.methods];
  else if (tunnel) methods = new Array<Method>(n - 1).fill(TUNNEL_OPTION_METHOD[tunnel]);
  else if (project && project.methods.length === n - 1) methods = project.methods;
  else {
    // A redrawn line keeps its method when it has a single one.
    const first = project?.methods[0];
    const uniform = first !== undefined && project?.methods.every((m) => m === first) === true;
    methods = new Array<Method>(n - 1).fill(uniform ? first : defaultMethod(p));
  }
  const cum = chainages(waypoints);
  const lengthM = cum[cum.length - 1];
  const geometry: ProjectGeometry = { waypoints, methods, cum, stations: project ? project.stations : [] };
  const design = { tunnelChoice: tunnel, stationBox: req.stationBox ?? project?.stationBox ?? null };
  const flags = project?.frozen ?? standardsFor(design, p);
  // A compact box is priced as compact even while the mandate stands: the price tag is what the option would cost.
  if (!project?.frozen && req.stationBox === 'compactBox') flags.oversizeStations = false;
  const standing = project ? standingOf(state, project) : draftStanding(state);
  const yours = quickEstimate(geometry, p, flags, standing);
  const pl = profileFor(POLAND_PROFILE);
  const poland = quickEstimate(polishGeometry(geometry), pl, designFlags(pl), draftStanding(state));
  const lengthKm = lengthM / 1000;
  const perKm = (cents: number) => (lengthKm > 0 ? Math.round(cents / lengthKm) : 0);
  return {
    checks: checkAlignment(waypoints, methods),
    lengthKm,
    costCents: yours.costCents,
    costPerKmCents: perKm(yours.costCents),
    polandCostCents: poland.costCents,
    polandCostPerKmCents: perKm(poland.costCents),
    ratioToPoland: poland.costCents > 0 ? yours.costCents / poland.costCents : 1,
    daysToOpen: Math.round(yours.days),
    openDate: dateAtTick(state.scenario.start.date, state.tick + Math.round(yours.days)),
  };
}
