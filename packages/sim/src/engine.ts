/**
 * Sim engine: initial state, command application, and the one-day step.
 * Pure over a JSON-serializable SimState. No DOM, no three, no wall clock; randomness only from the seeded core PRNG.
 */
import { type Command, createRng, isInGrid, Material, nextFloat, nextInt, type WorldEdit } from '@bayvox/core';
import { checkAlignment, minRadiusFor } from './checks.ts';
import { DAYS_PER_YEAR, ESCALATION_DAILY, CONSTANTS as K, SUBSTEPS_PER_DAY } from './constants.ts';
import { defaultMethod, designOption, optionLocks, stationBoxOf, stationSize } from './design.ts';
import { driveFromPlan, driveSubstep } from './drive.ts';
import { EVENTS, type EventDef, type EventOption, eventById, eventTitle } from './events.ts';
import { capsuleBetween, carveCapsules, chainages, nearestChainage, pointAt, segmentIndexAt } from './geometry.ts';
import type { GroundQuery } from './ground.ts';
import { housingRiders, projectRiders } from './housing.ts';
import {
  advanceRate,
  carveShape,
  civilCentsPerM,
  contractProfile,
  effectiveMethod,
  hardCost,
  headingSpans,
  isTbm,
  isUnderground,
  PHASE_LABELS,
  phaseDays,
  projectFlags,
  segmentY,
  standardsFor,
  stationBuildDays,
  stationCostCents,
  systemsCostCents,
} from './model.ts';
import { POLISH_PRICE_LEVEL, type Profile, profileFor, profileReforms, reformById, unitFactor } from './reforms.ts';
import { pushSocialBurst } from './social.ts';
import {
  type DesignFlags,
  FEED_LENGTH,
  type FeedKind,
  type FrontState,
  type GameCommand,
  GEOLOGIES,
  type Geology,
  LEDGER_CATEGORIES,
  type LedgerCategory,
  METHODS,
  type Method,
  PAID_STEPS,
  type PaidLedger,
  type PhaseId,
  type ProjectState,
  SCHEMA_VERSION,
  type ScenarioDef,
  type SimState,
  SPEEDS,
  STATION_BOXES,
  STATION_TEMPLATES,
  type StationState,
  TUNNEL_OPTION_METHOD,
  TUNNEL_OPTIONS,
  type Waypoint,
} from './types.ts';

// Module-level aliases keep export getters of Vitest's module runner out of the hot loops.
const _nextFloat = nextFloat;
const _nextInt = nextInt;
const _profileFor = profileFor;
const _segmentIndexAt = segmentIndexAt;
const _advanceRate = advanceRate;
const _civilCentsPerM = civilCentsPerM;
const _carveCapsules = carveCapsules;
const round = Math.round;
const ESC_DAILY = ESCALATION_DAILY;
const YEAR = DAYS_PER_YEAR;
const BREAK_P = K.breakdownPerDay.value;
const BREAK_MIN = K.breakdownMinDays.value;
const BREAK_SPAN = K.breakdownSpanDays.value;
const ALL_EVENTS = EVENTS;

const MAX_PROJECTS = 32;
const MAX_WAYPOINTS = 512;
const MAX_STATIONS = 64;
const MAX_NOTICES = 20;
const DEFAULT_STATION_DEPTH_M = 18;
/** Share of a station box's width the carve capsule takes as its radius (8 m for the 20 m compact box). */
const STATION_CARVE_RADIUS_SHARE = 0.4;
/** A station box is excavated in slices of this half-length, so the world is edited a few times, not daily. */
const STATION_CARVE_STEP_M = 5;
const STATION_EXCAVATION_SHARE = K.stationExcavationShare.value;
/**
 * Political capital: a small monthly mandate plus milestones (doc 07 section 5: earned by delivering). Tuning,
 * round 2: The Portal starts with 40, enough for two or three reforms. Every finished phase pays 15, so each
 * gate (tender, launch, opening) arrives with something to spend before the money that reform would have
 * saved is committed. The first playtest had 8 per phase and the capital piled up unspent after the build.
 */
export const PC_PER_MONTH = 1;
export const PC_PHASE_DONE = 15;
export const PC_BREAKTHROUGH = 10;
export const PC_OPENING = 20;
const PC_RIDERS_PER_POINT = 10_000;
/**
 * The monthly mandate and the riders' goodwill stop adding up at this much unspent capital. The second playtest
 * reached 1,556 by 2072 with nothing left to buy; milestones (a finished phase, a breakthrough, an opening) still pay.
 */
export const PC_MONTHLY_CAP = 150;
const SUBSTEPS = SUBSTEPS_PER_DAY;
const MAX_GRADE = K.maxGradePct.value / 100;
const OFF_PLAN_FACTOR = K.driveOffPlanCostFactor.value;
const OFF_PLAN_PER_M = K.driveOffPlanCostPerM.value;
const TRAIL_STEP_M = K.trailStepM.value;
const FREE_DEVIATION_M = K.driveFreeDeviationM.value;
const COVER_M = K.driveCoverM.value;
/** Smallest cash call, and the grain it is rounded up to: ten million dollars. */
const CASH_CALL_GRAIN = 1_000_000_000;
const CASH_CALL_STANDING_YEARS = 3;
/** A station this close to the end of a heading's run is the box the heading breaks into. */
const RECEPTION_REACH_M = 150;
/** A heading repeats its off-plan or corridor banner at most once in this many game days. */
const NOTICE_GAP_DAYS = 30;
const CENTS_PER_PLN = 100 / K.plnPerUsdNominal.value;
// Riders of the Polish baseline, where the waterfall of the receipt starts.
const SOFT_FIXED_PL = K.softFixedReformed.value;
const CONTINGENCY_PL = K.contingencyReformed.value;
const SOFT_PL = (1 + SOFT_FIXED_PL) * (1 + CONTINGENCY_PL);
/** Largest single hand dig the sim will charge: a 100 m sphere. Anything bigger is a caller bug. */
const MAX_DIG_M3 = 5_000_000;

/** Machine names. Polish TBMs carry women's names (doc 06 section 2); Mom Chung and Big Alma bored the Central Subway. */
const TBM_NAMES = ['Anna', 'Krystyna', 'Maria', 'Katarzyna', 'Faustyna', 'Wyspiarka', 'Damroka', 'Karpatka', 'Mom Chung', 'Big Alma'];
const HEADING_LABEL: Record<Method, string> = {
  boredTwin: 'TBM',
  boredSingleLarge: 'TBM',
  cutAndCover: 'Cut-and-cover front',
  mined: 'Mined heading',
  atGrade: 'Track gang',
  viaduct: 'Viaduct crew',
};

export interface StepContext {
  /** Receives carve edits. Null in forecasts. */
  emit: ((e: WorldEdit) => void) | null;
  /** Forecast mode: no random draws, expected-value breakdowns, no events. */
  forecast: boolean;
  /** Runs the same alignment through the Poland profile. Injected to avoid an import cycle; null in forecasts. */
  benchmark: ((state: SimState, project: ProjectState) => { costCents: number; days: number }) | null;
  /** Material at a world position, for the geology at the face of a driven heading. Null: the plan's geology is used. */
  ground?: GroundQuery | null;
  /** Objective status after a day, for the objective feed items. Injected to avoid an import cycle; absent in forecasts. */
  evaluate?: ((state: SimState) => { id: string; title: string; status: 'pending' | 'done' | 'failed' }[]) | null;
}

// ---------------------------------------------------------------- initial state

function zeroLedger(): Record<LedgerCategory, number> {
  const r = {} as Record<LedgerCategory, number>;
  for (const cat of LEDGER_CATEGORIES) r[cat] = 0;
  return r;
}

export function initState(scenario: ScenarioDef, seed: number, opts: { costProfile?: string; events?: boolean } = {}): SimState {
  const costProfile = opts.costProfile ?? scenario.costProfile;
  const reforms: string[] = [];
  for (const id of [...profileReforms(costProfile), ...scenario.start.policies, ...scenario.start.tech]) {
    if (!reformById(id)) throw new Error(`sim: scenario "${scenario.id}" starts with unknown reform "${id}"`);
    if (!reforms.includes(id)) reforms.push(id);
  }
  let cash = scenario.start.budgetCents;
  const released: string[] = [];
  for (const f of scenario.start.funding) {
    if (f.release === 'start') {
      cash += f.amountCents;
      released.push(f.id);
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    scenario,
    seed,
    tick: 0,
    rng: Array.from(createRng(seed)),
    speed: 1,
    eventsEnabled: opts.events ?? true,
    costProfile,
    cashCents: cash,
    politicalCapital: scenario.start.politicalCapital,
    escalation: 1,
    reforms,
    projects: [],
    fundingReleased: released,
    pendingEvents: [],
    eventLog: [],
    nextEventUid: 1,
    nextFrontName: 0,
    ledger: { total: zeroLedger(), today: zeroLedger(), escalationCents: 0, monthly: [] },
    notices: [],
    version: 0,
    subTick: 0,
    feed: [],
    nextFeedSeq: 1,
    handDig: { volumeM3: 0, cents: 0 },
    objectiveStatus: {},
    missionCompleteTick: -1,
    cashShort: false,
    cashRaisedCents: 0,
    socialPosts: [],
    nextSocialId: 1,
    housing: [],
  };
}

/** Appends a feed item (banner and audio cue). Forecast runs stay silent. */
function feed(state: SimState, ctx: StepContext, kind: FeedKind, projectId: string | null, subjectId: string | null, text: string): void {
  if (ctx.forecast) return;
  state.feed.push({ seq: state.nextFeedSeq, tick: state.tick, kind, projectId, subjectId, text });
  state.nextFeedSeq++;
  if (state.feed.length > FEED_LENGTH) state.feed.shift();
}

function usd(cents: number): string {
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  return abs >= 1e11 ? `${sign}$${(abs / 1e11).toFixed(2)}B` : `${sign}$${(abs / 1e8).toFixed(0)}M`;
}

// ---------------------------------------------------------------- command parsing

function bad(c: Command, why: string): never {
  throw new Error(`sim: malformed command "${String(c.t)}": ${why}`);
}

function str(c: Command, field: string): string {
  const v = c[field];
  if (typeof v !== 'string' || v === '') bad(c, `${field} must be a non-empty string, got ${JSON.stringify(v)}`);
  return v;
}

function num(c: Command, field: string): number {
  const v = c[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(c, `${field} must be a finite number, got ${JSON.stringify(v)}`);
  return v;
}

function oneOf<T extends string | number>(c: Command, field: string, allowed: readonly T[]): T {
  const v = c[field];
  if (!allowed.includes(v as T)) bad(c, `${field} must be one of ${allowed.join(', ')}, got ${JSON.stringify(v)}`);
  return v as T;
}

function waypoint(c: Command, v: unknown, where: string): Waypoint {
  const w = v as Partial<Waypoint> | null;
  if (!w || typeof w !== 'object') bad(c, `${where} must be an object`);
  for (const axis of ['x', 'y', 'z'] as const) {
    if (typeof w[axis] !== 'number' || !Number.isFinite(w[axis]))
      bad(c, `${where}.${axis} must be a finite number, got ${JSON.stringify(w[axis])}`);
  }
  if (w.geology !== undefined && !GEOLOGIES.includes(w.geology)) bad(c, `${where}.geology "${String(w.geology)}" is not a geology class`);
  const out: Waypoint = { x: w.x as number, y: w.y as number, z: w.z as number };
  if (w.geology !== undefined) out.geology = w.geology;
  return out;
}

/** Validates the shape of a command and narrows it. Throws naming the offending field. */
export function parseCommand(c: Command): GameCommand {
  if (!c || typeof c !== 'object' || typeof c.t !== 'string') throw new Error(`sim: malformed command ${JSON.stringify(c)}: missing t`);
  switch (c.t) {
    case 'startScenario': {
      const out: GameCommand = { t: 'startScenario' };
      if (c.costProfile !== undefined) out.costProfile = str(c, 'costProfile');
      if (c.events !== undefined) {
        if (typeof c.events !== 'boolean') bad(c, 'events must be a boolean');
        out.events = c.events;
      }
      return out;
    }
    case 'setAlignment': {
      if (!Array.isArray(c.waypoints)) bad(c, 'waypoints must be an array');
      if (c.waypoints.length < 2 || c.waypoints.length > MAX_WAYPOINTS)
        bad(c, `waypoints must have 2 to ${MAX_WAYPOINTS} entries, got ${c.waypoints.length}`);
      const waypoints = c.waypoints.map((w, i) => waypoint(c, w, `waypoints[${i}]`));
      const out: GameCommand = { t: 'setAlignment', projectId: str(c, 'projectId'), waypoints };
      if (c.name !== undefined) out.name = str(c, 'name');
      if (c.methods !== undefined) {
        if (!Array.isArray(c.methods) || c.methods.length !== waypoints.length - 1)
          bad(c, `methods must have one entry per segment (${waypoints.length - 1})`);
        for (const m of c.methods) if (!METHODS.includes(m)) bad(c, `method "${String(m)}" is not a construction method`);
        out.methods = [...c.methods] as Method[];
      }
      return out;
    }
    case 'addWaypoint': {
      const out: GameCommand = { t: 'addWaypoint', projectId: str(c, 'projectId'), waypoint: waypoint(c, c.waypoint, 'waypoint') };
      if (c.index !== undefined) {
        const index = num(c, 'index');
        if (!Number.isInteger(index) || index < 0) bad(c, `index must be a non-negative integer, got ${index}`);
        out.index = index;
      }
      if (c.method !== undefined) out.method = oneOf(c, 'method', METHODS);
      return out;
    }
    case 'setMethod': {
      const segment = num(c, 'segment');
      if (!Number.isInteger(segment) || segment < 0) bad(c, `segment must be a non-negative integer, got ${segment}`);
      return { t: 'setMethod', projectId: str(c, 'projectId'), segment, method: oneOf(c, 'method', METHODS) };
    }
    case 'addStation': {
      const out: GameCommand = {
        t: 'addStation',
        projectId: str(c, 'projectId'),
        name: str(c, 'name'),
        template: oneOf(c, 'template', STATION_TEMPLATES),
      };
      if (c.stationId !== undefined) out.stationId = str(c, 'stationId');
      if (c.chainageM !== undefined) out.chainageM = num(c, 'chainageM');
      if (c.depthM !== undefined) out.depthM = num(c, 'depthM');
      if (c.at !== undefined) {
        const at = c.at as { x?: unknown; z?: unknown } | null;
        if (!at || typeof at.x !== 'number' || typeof at.z !== 'number' || !Number.isFinite(at.x) || !Number.isFinite(at.z))
          bad(c, 'at must be {x, z} finite numbers');
        out.at = { x: at.x, z: at.z };
      }
      if (out.chainageM === undefined && out.at === undefined) bad(c, 'one of chainageM or at is required');
      return out;
    }
    case 'removeStation':
      return { t: 'removeStation', projectId: str(c, 'projectId'), stationId: str(c, 'stationId') };
    case 'approveProject':
    case 'advancePhase':
    case 'launchTBM':
    case 'openLine':
      return { t: c.t, projectId: str(c, 'projectId') };
    case 'setSpeed':
      return { t: 'setSpeed', speed: oneOf(c, 'speed', SPEEDS) };
    case 'enactReform':
      return { t: 'enactReform', id: str(c, 'id') };
    case 'enactHousing':
      return { t: 'enactHousing', optionId: str(c, 'optionId') };
    case 'resolveEvent': {
      const eventId = num(c, 'eventId');
      return { t: 'resolveEvent', eventId, optionId: str(c, 'optionId') };
    }
    case 'useOfficialPlan':
      return { t: 'useOfficialPlan' };
    case 'removeProject':
      return { t: 'removeProject', projectId: str(c, 'projectId') };
    case 'setDesign': {
      const out: GameCommand = { t: 'setDesign', projectId: str(c, 'projectId') };
      if (c.tunnel !== undefined) out.tunnel = oneOf(c, 'tunnel', TUNNEL_OPTIONS);
      if (c.stationBox !== undefined) out.stationBox = oneOf(c, 'stationBox', STATION_BOXES);
      if (out.tunnel === undefined && out.stationBox === undefined) bad(c, 'one of tunnel or stationBox is required');
      return out;
    }
    case 'tbmControl': {
      const out: GameCommand = { t: 'tbmControl', headingId: str(c, 'headingId') };
      if (c.thrust !== undefined) out.thrust = num(c, 'thrust');
      if (c.steer !== undefined) out.steer = num(c, 'steer');
      if (c.pitch !== undefined) out.pitch = num(c, 'pitch');
      if (c.autopilot !== undefined) {
        if (typeof c.autopilot !== 'boolean') bad(c, 'autopilot must be a boolean');
        out.autopilot = c.autopilot;
      }
      return out;
    }
    case 'chargeDig': {
      const volumeM3 = num(c, 'volumeM3');
      if (volumeM3 < 0) bad(c, `volumeM3 must not be negative, got ${volumeM3}`);
      const out: GameCommand = { t: 'chargeDig', volumeM3 };
      if (c.projectId !== undefined) out.projectId = str(c, 'projectId');
      return out;
    }
    default:
      throw new Error(`sim: unknown command type "${c.t}"`);
  }
}

// ---------------------------------------------------------------- money

function charge(state: SimState, project: ProjectState | null, category: LedgerCategory, cents: number, escalationPart: number): void {
  if (cents === 0) return;
  state.cashCents -= cents;
  state.ledger.total[category] += cents;
  state.ledger.today[category] += cents;
  state.ledger.escalationCents += escalationPart;
  if (project) {
    project.spent[category] += cents;
    project.escalationCents += escalationPart;
  }
}

/** Spends an unescalated amount at today's price index. */
function spend(state: SimState, project: ProjectState, category: LedgerCategory, baseCents: number): void {
  const base = round(baseCents);
  const cents = round(base * state.escalation);
  charge(state, project, category, cents, cents - base);
}

/**
 * Hard cost with its soft-cost and contingency riders. The contingency is charged as it accrues
 * ("all money in the budget will be spent", doc 06 section 3.3). Event costs are charged on top of it
 * (eventSpend): a contingency that is always spent absorbs nothing.
 */
function hardSpend(
  state: SimState,
  project: ProjectState,
  p: Profile,
  category: 'civil' | 'stations' | 'systems',
  baseCents: number,
  track = true,
): void {
  const base = round(baseCents);
  if (base <= 0) return;
  if (track) addPaid(project.paid, p, category, base);
  spend(state, project, category, base);
  const soft = round(base * p['soft.fixed']);
  spend(state, project, 'soft', soft);
  const contBase = round((base + soft) * p['soft.contingency']);
  if (contBase > 0) {
    const cont = round(contBase * state.escalation);
    project.contingencyPoolCents += cont;
    charge(state, project, 'contingency', cont, cont - contBase);
  }
}

/** Re-prices a hard spend of `base` unescalated cents through the levers of the receipt at profile `p` and adds it to a paid ledger. */
export function addPaid(paid: PaidLedger, p: Profile, category: 'civil' | 'stations' | 'systems', base: number): void {
  const systems = category === 'systems' ? p['systems.factor'] : 1;
  const polish = base / (unitFactor(p) * systems);
  paid[category] += polish;
  const steps = paid.steps;
  let v = polish * SOFT_PL;
  steps[0] += v;
  v *= p['unit.procurement'];
  steps[1] += v;
  v *= p['unit.labour'];
  steps[2] += v;
  v *= p['unit.thirdParty'];
  steps[3] += v;
  v *= systems;
  steps[4] += v;
  v *= (1 + p['soft.fixed']) / (1 + SOFT_FIXED_PL);
  steps[5] += v;
  v *= (1 + p['soft.contingency']) / (1 + CONTINGENCY_PL);
  steps[6] += v;
  v *= p['unit.priceLevel'];
  steps[7] += v;
}

/**
 * The price of a card option, charged in full at today's prices. The first playtest found the old rule (draw on
 * the contingency pool first) made "Pay it. $15M" move the funds by nothing: under the status quo the pool is
 * spent whatever happens, so the card's two prices were not a choice.
 */
function eventSpend(state: SimState, project: ProjectState, baseCents: number): void {
  const base = round(baseCents);
  if (base <= 0) return;
  const cents = round(base * state.escalation);
  charge(state, project, 'events', cents, cents - base);
}

/**
 * Money a cash call raises: what the works still to do cost at today's prices and rules, plus the overdraft,
 * rounded up to ten million dollars. One call is meant to be enough; a second one means the estimate grew
 * after the first (a card, a delay, a dearer design).
 */
export function cashCallCents(state: SimState, project: ProjectState, p: Profile): number {
  const riders = (1 + p['soft.fixed']) * (1 + p['soft.contingency']);
  // What is built and paid so far, unescalated with its riders, is the last step of the paid ledger.
  const toDo = Math.max(0, project.hardEstimateCents * riders - project.paid.steps[PAID_STEPS.length - 1]);
  // Escalation over the years still to come: a quarter on top of today's index (tuning). And the standing
  // organisation for three more years, so that the year a "wait" costs is inside the money it raises: a call
  // that did not cover its own delay would come straight back.
  const standing = project.hardEstimateCents * p['soft.overheadPerYear'] * CASH_CALL_STANDING_YEARS;
  const remaining = (toDo * 1.25 + standing) * state.escalation;
  const need = Math.max(CASH_CALL_GRAIN, remaining - state.cashCents);
  return Math.ceil(need / CASH_CALL_GRAIN) * CASH_CALL_GRAIN;
}

// ---------------------------------------------------------------- projects

function newProject(id: string): ProjectState {
  return {
    id,
    name: id,
    waypoints: [],
    methods: [],
    cum: [0],
    stations: [],
    status: 'draft',
    phase: 'planning',
    phaseProgress: 0,
    awaiting: null,
    delayDays: 0,
    approvedTick: -1,
    approvedEscalation: 1,
    openedTick: -1,
    frozen: null,
    fronts: [],
    systemsProgress: 0,
    hardEstimateCents: 0,
    spent: zeroLedger(),
    escalationCents: 0,
    contingencyPoolCents: 0,
    contingencyCreditCents: 0,
    eventCounts: {},
    ridersPerDay: 0,
    polandCostCents: 0,
    polandDays: 0,
    tunnelChoice: null,
    stationBox: null,
    paid: { civil: 0, stations: 0, systems: 0, steps: [0, 0, 0, 0, 0, 0, 0, 0] },
    offPlanCents: 0,
    handDigCents: 0,
    handDigM3: 0,
    contract: null,
  };
}

export function projectLengthM(project: ProjectState): number {
  return project.cum[project.cum.length - 1];
}

export function projectSpentCents(project: ProjectState): number {
  let sum = 0;
  for (const cat of LEDGER_CATEGORIES) sum += project.spent[cat];
  return sum;
}

/** Refreshes the unescalated hard estimate of a project under the reforms of `p` (and the contract prices, once tendered). */
export function refreshEstimate(project: ProjectState, p: Profile): void {
  const own = contractProfile(project, p);
  project.hardEstimateCents =
    project.methods.length === 0 ? 0 : round(hardCost(project, own, projectFlags(project, own), false).totalCents);
}

/**
 * Why an edit that leaves an approved project with these waypoints and methods is refused, or null. A draft may
 * be anything while it is drawn; once approved the line must stay buildable. The second playtest clicked a stray
 * waypoint onto an approved line, and the hairpin went to tender, was bored and opened.
 */
function approvedEditProblem(
  project: ProjectState,
  waypoints: readonly Waypoint[],
  methods: readonly Method[],
  ctx: StepContext,
): string | null {
  if (project.status !== 'active' || ctx.forecast) return null;
  const checks = checkAlignment(waypoints, methods);
  return checks.ok ? null : `${project.name} is approved: a change must keep the line buildable. ${checks.problems[0]}`;
}

/** Street level over each station, as implied by its depth and the line under it: kept when the line is moved. */
function stationGrounds(project: ProjectState): number[] {
  if (project.methods.length === 0) return project.stations.map(() => 0);
  return project.stations.map((s) => pointAt(project.waypoints, project.cum, s.chainageM).y + s.depthM);
}

/** After the line moved: a station stays under the same street, so its platform depth follows the line. */
function followLine(project: ProjectState, grounds: readonly number[]): void {
  if (project.methods.length === 0) return;
  const byId = new Map<string, number>();
  project.stations.forEach((s, i) => {
    byId.set(s.id, grounds[i]);
  });
  refreshGeometry(project);
  for (const s of project.stations) {
    const ground = byId.get(s.id);
    if (ground === undefined) continue;
    const depth = ground - pointAt(project.waypoints, project.cum, s.chainageM).y;
    s.depthM = Math.min(100, Math.max(0, round(depth * 10) / 10));
  }
}

function refreshGeometry(project: ProjectState): void {
  project.cum = chainages(project.waypoints);
  const len = projectLengthM(project);
  for (const s of project.stations) s.chainageM = Math.min(len, Math.max(0, s.chainageM));
  project.stations.sort((a, b) => a.chainageM - b.chainageM || (a.id < b.id ? -1 : 1));
}

/** Why an alignment is not buildable, or null. */
function alignmentProblem(waypoints: readonly Waypoint[]): string | null {
  for (let i = 0; i < waypoints.length; i++) {
    const w = waypoints[i];
    if (!isInGrid(w.x, w.z)) return `waypoint ${i} (${w.x.toFixed(0)}, ${w.z.toFixed(0)}) is outside the world grid`;
    if (i > 0) {
      const a = waypoints[i - 1];
      const d2 = (w.x - a.x) ** 2 + (w.y - a.y) ** 2 + (w.z - a.z) ** 2;
      if (d2 < 1) return `waypoints ${i - 1} and ${i} are less than 1 m apart`;
    }
  }
  return null;
}

function makeFronts(state: SimState, project: ProjectState): void {
  const flags = project.frozen;
  if (!flags) throw new Error(`sim: project "${project.id}" has no frozen design at launch`);
  const fronts: FrontState[] = [];
  for (const span of headingSpans(project, flags)) {
    const n = fronts.length + 1;
    let name = `${HEADING_LABEL[span.method]} ${n}`;
    if (isTbm(span.method)) {
      name = `TBM ${TBM_NAMES[state.nextFrontName % TBM_NAMES.length]}`;
      state.nextFrontName++;
    }
    fronts.push({
      id: `${project.id}/f${n}`,
      name,
      method: span.method,
      fromM: span.fromM,
      toM: span.toM,
      chainageM: span.fromM,
      downDays: 0,
      downReason: null,
      boredM: 0,
      breakthroughTick: -1,
      drive: null,
    });
  }
  project.fronts = fronts;
}

function emitFrontCarve(project: ProjectState, front: FrontState, fromM: number, toM: number, emit: (e: WorldEdit) => void): void {
  const flags = project.frozen;
  if (!flags) return;
  const shape = carveShape(front.method, flags);
  if (shape.radiusM <= 0) return;
  const edits: WorldEdit[] = [];
  for (const lateral of shape.laterals) _carveCapsules(project.waypoints, project.cum, fromM, toM, shape.radiusM, lateral, edits);
  for (const e of edits) emit(e);
}

/** Carve radius and full half-length of a station's excavation, or null for templates that are not dug out. */
function stationCarve(s: StationState, flags: DesignFlags): { radiusM: number; halfM: number } | null {
  if (s.template !== 'undergroundStandard' && s.template !== 'undergroundDeepMined') return null;
  const size = stationSize(s.template, stationBoxOf(flags));
  return { radiusM: size.widthM * STATION_CARVE_RADIUS_SHARE, halfM: size.lengthM / 2 };
}

/** Carves the slices of a station box between two half-lengths, each side of the platform centre. */
function emitStationCarve(
  project: ProjectState,
  s: StationState,
  fromHalfM: number,
  toHalfM: number,
  radiusM: number,
  emit: (e: WorldEdit) => void,
): void {
  const len = projectLengthM(project);
  const edits: WorldEdit[] = [];
  const span = (a: number, b: number) => {
    const from = Math.max(0, a);
    const to = Math.min(len, b);
    if (to > from) _carveCapsules(project.waypoints, project.cum, from, to, radiusM, 0, edits);
  };
  if (fromHalfM <= 0) span(s.chainageM - toHalfM, s.chainageM + toHalfM);
  else {
    span(s.chainageM - toHalfM, s.chainageM - fromHalfM);
    span(s.chainageM + fromHalfM, s.chainageM + toHalfM);
  }
  for (const e of edits) emit(e);
}

/** Capsules of a driven heading between two axis points, one per tube. Lateral offsets are to the left of travel. */
function emitDrivenCarve(
  shape: { radiusM: number; laterals: number[] },
  a: { x: number; y: number; z: number; dirX: number; dirZ: number },
  b: { x: number; y: number; z: number; dirX: number; dirZ: number },
  emit: (e: WorldEdit) => void,
): void {
  if (shape.radiusM <= 0) return;
  for (const lateral of shape.laterals) {
    emit(
      capsuleBetween(
        { x: a.x + a.dirZ * lateral, y: a.y, z: a.z - a.dirX * lateral },
        { x: b.x + b.dirZ * lateral, y: b.y, z: b.z - b.dirX * lateral },
        shape.radiusM,
      ),
    );
  }
}

/** Every carve edit implied by construction progress so far. Used after load to rebuild the voxels. */
export function replayCarves(state: SimState, emit: (e: WorldEdit) => void): void {
  for (const project of state.projects) {
    const flags = project.frozen;
    for (const front of project.fronts) {
      const d = front.drive;
      if (!d || !flags) {
        emitFrontCarve(project, front, front.fromM, front.chainageM, emit);
        continue;
      }
      // A driven heading is replayed along its as-built axis; each chord is offset square to itself.
      const shape = carveShape(front.method, flags);
      const pts: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i + 2 < d.trail.length; i += 3) pts.push({ x: d.trail[i], y: d.trail[i + 1], z: d.trail[i + 2] });
      pts.push({ x: d.carveX, y: d.carveY, z: d.carveZ });
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const h = Math.sqrt(dx * dx + dz * dz);
        if (h <= 0) continue;
        const dir = { dirX: dx / h, dirZ: dz / h };
        emitDrivenCarve(shape, { ...a, ...dir }, { ...b, ...dir }, emit);
      }
    }
    if (!flags) continue;
    for (const s of project.stations) {
      const carve = stationCarve(s, flags);
      if (carve && s.carvedM > 0) emitStationCarve(project, s, 0, s.carvedM, carve.radiusM, emit);
    }
  }
}

/**
 * As-built axis of a heading in the planned regime from the start of its run to chainage `toM`, as flat
 * x, y, z triplets: the start, every TRAIL_STEP_M and every vertex passed. Append-only as `toM` grows.
 */
export function plannedTrail(project: ProjectState, fromM: number, toM: number): number[] {
  const { waypoints, cum } = project;
  const out: number[] = [];
  const push = (s: number) => {
    const p = pointAt(waypoints, cum, s);
    out.push(p.x, p.y, p.z);
  };
  push(fromM);
  let vertex = _segmentIndexAt(cum, fromM) + 1;
  const steps = Math.floor((toM - fromM) / TRAIL_STEP_M + 1e-9);
  for (let k = 1; k <= steps; k++) {
    const s = fromM + k * TRAIL_STEP_M;
    while (vertex < cum.length - 1 && cum[vertex] < s - 1e-9) {
      if (cum[vertex] > fromM) out.push(waypoints[vertex].x, waypoints[vertex].y, waypoints[vertex].z);
      vertex++;
    }
    // A vertex that falls on a step is the step point itself.
    if (vertex < cum.length - 1 && cum[vertex] <= s + 1e-9) vertex++;
    push(s);
  }
  return out;
}

// ---------------------------------------------------------------- command application

function reject(state: SimState, cmd: GameCommand, reason: string): undefined {
  state.notices.push({ tick: state.tick, command: cmd.t, reason });
  if (state.notices.length > MAX_NOTICES) state.notices.shift();
}

function findProject(state: SimState, id: string): ProjectState | undefined {
  return state.projects.find((p) => p.id === id);
}

function designLocked(project: ProjectState): string | null {
  if (project.status === 'open') return `project "${project.id}" is open`;
  if (project.frozen) return `project "${project.id}" went to tender; its design is frozen`;
  return null;
}

/**
 * Applies one command. Rule violations (not enough political capital, wrong phase) leave the state
 * untouched and add a notice; malformed commands were already rejected by parseCommand.
 */
export function applyCommand(state: SimState, cmd: GameCommand, ctx: StepContext): undefined {
  const profile = _profileFor(state.reforms);
  switch (cmd.t) {
    case 'startScenario': {
      const fresh = initState(state.scenario, state.seed, {
        costProfile: cmd.costProfile ?? state.costProfile,
        events: cmd.events ?? state.eventsEnabled,
      });
      // A restart never reuses a feed seq, so a consumer that remembers the last one it handled stays correct.
      fresh.nextFeedSeq = state.nextFeedSeq;
      // Same key set as the old state, so assigning replaces everything.
      Object.assign(state, fresh);
      return;
    }
    case 'setSpeed':
      state.speed = cmd.speed;
      return;
    case 'setAlignment': {
      let project = findProject(state, cmd.projectId);
      if (project) {
        const locked = designLocked(project);
        if (locked) return reject(state, cmd, locked);
      } else if (state.projects.length >= MAX_PROJECTS) {
        return reject(state, cmd, `at most ${MAX_PROJECTS} projects`);
      }
      const problem = alignmentProblem(cmd.waypoints);
      if (problem) return reject(state, cmd, problem);
      if (!project) {
        project = newProject(cmd.projectId);
        state.projects.push(project);
      }
      const segments = cmd.waypoints.length - 1;
      let methods = project.methods;
      if (cmd.methods) methods = [...cmd.methods];
      else if (project.methods.length !== segments) {
        // A redrawn line keeps its method when it has one; otherwise it gets the chosen or the standard design.
        const first = project.methods[0];
        const uniform = first !== undefined && project.methods.every((m) => m === first);
        const fill = uniform ? first : project.tunnelChoice ? TUNNEL_OPTION_METHOD[project.tunnelChoice] : defaultMethod(profile);
        methods = new Array<Method>(segments).fill(fill);
      }
      const refused = approvedEditProblem(project, cmd.waypoints, methods, ctx);
      if (refused) return reject(state, cmd, refused);
      const grounds = stationGrounds(project);
      if (cmd.methods) project.tunnelChoice = null;
      project.methods = methods;
      project.waypoints = cmd.waypoints.map((w) => ({ ...w }));
      if (cmd.name) project.name = cmd.name;
      followLine(project, grounds);
      refreshEstimate(project, profile);
      state.version++;
      return;
    }
    case 'addWaypoint': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      const locked = designLocked(project);
      if (locked) return reject(state, cmd, locked);
      const index = cmd.index ?? project.waypoints.length;
      if (index > project.waypoints.length)
        return reject(state, cmd, `index ${index} is past the end (${project.waypoints.length} waypoints)`);
      if (project.waypoints.length >= MAX_WAYPOINTS) return reject(state, cmd, `at most ${MAX_WAYPOINTS} waypoints`);
      const waypoints = project.waypoints.slice();
      waypoints.splice(index, 0, { ...cmd.waypoint });
      const problem = alignmentProblem(waypoints);
      if (problem) return reject(state, cmd, problem);
      const methods = project.methods.slice();
      let clearsChoice = false;
      if (waypoints.length >= 2) {
        const neighbour = project.methods[Math.min(Math.max(0, index - 1), project.methods.length - 1)];
        methods.splice(Math.max(0, index - 1), 0, cmd.method ?? neighbour ?? defaultMethod(profile));
        clearsChoice = cmd.method !== undefined && cmd.method !== neighbour;
      }
      const refused = approvedEditProblem(project, waypoints, methods, ctx);
      if (refused) return reject(state, cmd, refused);
      const grounds = stationGrounds(project);
      project.methods = methods;
      if (clearsChoice) project.tunnelChoice = null;
      project.waypoints = waypoints;
      followLine(project, grounds);
      refreshEstimate(project, profile);
      state.version++;
      return;
    }
    case 'setMethod': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      const locked = designLocked(project);
      if (locked) return reject(state, cmd, locked);
      if (cmd.segment >= project.methods.length)
        return reject(state, cmd, `segment ${cmd.segment} does not exist (${project.methods.length} segments)`);
      const methods = project.methods.slice();
      methods[cmd.segment] = cmd.method;
      const refused = approvedEditProblem(project, project.waypoints, methods, ctx);
      if (refused) return reject(state, cmd, refused);
      project.methods = methods;
      project.tunnelChoice = null;
      refreshEstimate(project, profile);
      state.version++;
      return;
    }
    case 'addStation': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      const locked = designLocked(project);
      if (locked) return reject(state, cmd, locked);
      if (project.methods.length === 0) return reject(state, cmd, `project "${project.id}" has no alignment yet`);
      if (project.stations.length >= MAX_STATIONS) return reject(state, cmd, `at most ${MAX_STATIONS} stations per project`);
      const id = cmd.stationId ?? `${project.id}/s${project.stations.length + 1}`;
      if (project.stations.some((s) => s.id === id)) return reject(state, cmd, `station id "${id}" already exists`);
      const len = projectLengthM(project);
      let chainageM = cmd.chainageM;
      if (chainageM === undefined && cmd.at) chainageM = nearestChainage(project.waypoints, project.cum, cmd.at.x, cmd.at.z).chainageM;
      if (chainageM === undefined || chainageM < 0 || chainageM > len)
        return reject(state, cmd, `chainage ${chainageM} is outside the alignment (0 to ${len.toFixed(0)} m)`);
      const depthM = cmd.depthM ?? DEFAULT_STATION_DEPTH_M;
      if (depthM < 0 || depthM > 100) return reject(state, cmd, `station depth ${depthM} m is outside 0 to 100`);
      project.stations.push({ id, name: cmd.name, template: cmd.template, chainageM, depthM, progress: 0, carvedM: 0 });
      refreshGeometry(project);
      refreshEstimate(project, profile);
      state.version++;
      return;
    }
    case 'removeStation': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      const locked = designLocked(project);
      if (locked) return reject(state, cmd, locked);
      const at = project.stations.findIndex((s) => s.id === cmd.stationId);
      if (at < 0) return reject(state, cmd, `no station "${cmd.stationId}"`);
      project.stations.splice(at, 1);
      refreshEstimate(project, profile);
      state.version++;
      return;
    }
    case 'approveProject': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      if (project.status !== 'draft') return reject(state, cmd, `project "${project.id}" is already ${project.status}`);
      if (project.methods.length === 0) return reject(state, cmd, `project "${project.id}" has no alignment`);
      if (!ctx.forecast) {
        const checks = checkAlignment(project.waypoints, project.methods);
        if (!checks.ok) return reject(state, cmd, `the alignment of "${project.id}" is not buildable: ${checks.problems[0]}`);
      }
      project.status = 'active';
      project.approvedTick = state.tick;
      project.approvedEscalation = state.escalation;
      const head = state.scenario.start.headStart;
      project.phase = head ? head.phase : 'planning';
      project.phaseProgress = head ? head.progress : 0;
      refreshEstimate(project, profile);
      state.version++;
      feed(state, ctx, 'projectApproved', project.id, null, `${project.name} is approved. The clock is running.`);
      return;
    }
    case 'advancePhase': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      if (project.awaiting !== 'advancePhase') return reject(state, cmd, `project "${project.id}" is not waiting to go to tender`);
      if (!ctx.forecast) {
        const checks = checkAlignment(project.waypoints, project.methods);
        if (!checks.ok) return reject(state, cmd, `${project.name} cannot go to tender: the line is not buildable. ${checks.problems[0]}`);
      }
      project.awaiting = null;
      project.phase = 'procurement';
      project.phaseProgress = 0;
      project.frozen = standardsFor(project, profile);
      // The contracts are let under the rules of today: what is reformed later no longer changes their prices.
      project.contract = {
        procurement: profile['unit.procurement'],
        labour: profile['unit.labour'],
        thirdParty: profile['unit.thirdParty'],
      };
      refreshEstimate(project, profile);
      state.version++;
      return;
    }
    case 'launchTBM': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      if (project.awaiting !== 'launchTBM') return reject(state, cmd, `project "${project.id}" is not ready to launch`);
      project.awaiting = null;
      project.phase = 'construction';
      project.phaseProgress = 0;
      makeFronts(state, project);
      state.version++;
      for (const front of project.fronts) {
        if (isDrivable(front.method))
          feed(
            state,
            ctx,
            'tbmLaunched',
            project.id,
            front.id,
            isTbm(front.method) ? `${front.name} is launched` : `${front.name} has started`,
          );
      }
      return;
    }
    case 'openLine': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      if (project.awaiting !== 'openLine') return reject(state, cmd, `project "${project.id}" is not ready to open`);
      project.awaiting = null;
      project.status = 'open';
      project.openedTick = state.tick;
      project.phaseProgress = 1;
      state.politicalCapital += PC_OPENING;
      if (!ctx.forecast) {
        project.ridersPerDay = projectRiders(state, project).ridersPerDay;
        if (ctx.benchmark) {
          const b = ctx.benchmark(state, project);
          project.polandCostCents = b.costCents;
          project.polandDays = b.days;
        }
      }
      state.version++;
      feed(
        state,
        ctx,
        'lineOpened',
        project.id,
        null,
        `${project.name} is open: ${project.ridersPerDay.toLocaleString('en-US')} riders a day, ${usd(projectSpentCents(project))} spent`,
      );
      return;
    }
    case 'enactReform': {
      const def = reformById(cmd.id);
      if (!def) return reject(state, cmd, `no reform "${cmd.id}"`);
      if (def.id === POLISH_PRICE_LEVEL.id) return reject(state, cmd, 'No reform changes the price level of the Bay Area');
      // A second click on the same button before the snapshot caught up: the reform is enacted, nothing to say.
      if (state.reforms.includes(def.id)) return;
      const missing = def.prereqs.filter((id) => !state.reforms.includes(id)).map((id) => `"${reformById(id)?.title ?? id}"`);
      if (missing.length > 0) return reject(state, cmd, `"${def.title}" needs ${missing.join(' and ')} first`);
      if (state.politicalCapital < def.cost.pc)
        return reject(state, cmd, `"${def.title}" costs ${def.cost.pc} political capital, you have ${state.politicalCapital}`);
      if (def.cost.cents > 0 && state.cashCents < def.cost.cents)
        return reject(state, cmd, `"${def.title}" costs $${(def.cost.cents / 1e8).toFixed(0)}M, cash is short`);
      state.politicalCapital -= def.cost.pc;
      if (def.cost.pc > 0 && !ctx.forecast)
        pushSocialBurst(state, {
          cause: `reform:${def.id}`,
          group: def.id === 'specustawa' ? 'specustawa' : def.id === 'smallBoreLoop' ? 'smallBore' : def.branch,
          what: def.title,
          cents: def.cost.cents,
        });
      // What a reform costs in cash is paid by the project it is bought for, so it is inside "all-in".
      const planId = state.scenario.reference?.projectId ?? 'line';
      const payer = state.projects.find((x) => x.id === planId && x.status !== 'open') ?? state.projects.find((x) => x.status !== 'open');
      charge(state, payer ?? null, 'reforms', def.cost.cents, 0);
      state.reforms.push(def.id);
      const next = _profileFor(state.reforms);
      for (const project of state.projects) if (project.status !== 'open') refreshEstimate(project, next);
      state.version++;
      feed(state, ctx, 'reformEnacted', null, def.id, `Reform enacted: ${def.title}`);
      return;
    }
    case 'enactHousing': {
      const def = (state.scenario.housing ?? []).find((o) => o.id === cmd.optionId);
      if (!def) return reject(state, cmd, `this mission has no housing option "${cmd.optionId}"`);
      const enacted = state.housing ?? [];
      // A second click before the snapshot caught up: it is enacted, nothing to say.
      if (enacted.includes(def.id)) return;
      if (state.politicalCapital < def.capitalCost)
        return reject(state, cmd, `"${def.title}" costs ${def.capitalCost} political capital, you have ${state.politicalCapital}`);
      state.politicalCapital -= def.capitalCost;
      if (def.capitalCost > 0 && !ctx.forecast) pushSocialBurst(state, { cause: `housing:${def.id}`, group: 'housing', what: def.title });
      enacted.push(def.id);
      state.housing = enacted;
      // A line already in service gains the riders at once; one that is not yet open is counted when it opens.
      if (!ctx.forecast)
        for (const project of state.projects)
          if (project.status === 'open') project.ridersPerDay = projectRiders(state, project).ridersPerDay;
      state.version++;
      feed(
        state,
        ctx,
        'reformEnacted',
        null,
        def.id,
        `Housing enacted: ${def.title}, ${housingRiders(def).toLocaleString('en-US')} more riders a day`,
      );
      return;
    }
    case 'resolveEvent': {
      const at = state.pendingEvents.findIndex((e) => e.uid === cmd.eventId);
      if (at < 0) return reject(state, cmd, `no pending event ${cmd.eventId}`);
      const pending = state.pendingEvents[at];
      const def = eventById(pending.defId);
      const option = def?.options.find((o) => o.id === cmd.optionId);
      if (!def || !option) return reject(state, cmd, `event ${cmd.eventId} has no option "${cmd.optionId}"`);
      if (state.politicalCapital < option.pc)
        return reject(state, cmd, `option "${option.id}" costs ${option.pc} political capital, you have ${state.politicalCapital}`);
      state.pendingEvents.splice(at, 1);
      resolveEvent(state, pending.uid, pending.projectId, pending.frontId, def, option, profile, false, ctx);
      return;
    }
    case 'useOfficialPlan': {
      const ref = state.scenario.reference;
      if (!ref) return reject(state, cmd, `scenario "${state.scenario.id}" has no official plan`);
      const existing = findProject(state, ref.projectId);
      if (existing) {
        const locked = designLocked(existing);
        if (locked) return reject(state, cmd, locked);
        // The official plan replaces what was drawn: its stations and design choices go.
        existing.stations = [];
        existing.tunnelChoice = null;
        existing.stationBox = null;
      } else if (state.projects.length >= MAX_PROJECTS) {
        return reject(state, cmd, `at most ${MAX_PROJECTS} projects`);
      }
      for (const c of ref.commands) applyCommand(state, c, ctx);
      return;
    }
    case 'removeProject': {
      const at = state.projects.findIndex((p) => p.id === cmd.projectId);
      if (at < 0) return reject(state, cmd, `no project "${cmd.projectId}"`);
      if (state.projects[at].status !== 'draft')
        return reject(state, cmd, `project "${cmd.projectId}" is ${state.projects[at].status}; only a draft can be removed`);
      state.projects.splice(at, 1);
      state.version++;
      return;
    }
    case 'setDesign': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      const locked = designLocked(project);
      if (locked) return reject(state, cmd, locked);
      // Both picks are checked before either is applied.
      for (const id of [cmd.tunnel, cmd.stationBox]) {
        if (id === undefined) continue;
        const locks = optionLocks(id, profile);
        if (locks.length > 0) {
          const titles = locks.map((r) => `"${reformById(r)?.title ?? r}"`).join(' and ');
          return reject(state, cmd, `"${designOption(id).label}" is not allowed by the standards in force; enact ${titles} first`);
        }
      }
      if (cmd.tunnel !== undefined) {
        const method = TUNNEL_OPTION_METHOD[cmd.tunnel];
        const methods = project.methods.map((m) => (isUnderground(m) ? method : m));
        const refused = approvedEditProblem(project, project.waypoints, methods, ctx);
        if (refused) return reject(state, cmd, refused);
        project.methods = methods;
        project.tunnelChoice = cmd.tunnel;
      }
      if (cmd.stationBox !== undefined) project.stationBox = cmd.stationBox;
      refreshEstimate(project, profile);
      state.version++;
      return;
    }
    case 'tbmControl': {
      let project: ProjectState | undefined;
      let front: FrontState | undefined;
      for (const pr of state.projects) {
        const f = pr.fronts.find((x) => x.id === cmd.headingId);
        if (f) {
          project = pr;
          front = f;
          break;
        }
      }
      if (!project || !front) return reject(state, cmd, `no heading "${cmd.headingId}"`);
      if (project.status !== 'active' || project.phase !== 'construction')
        return reject(state, cmd, `project "${project.id}" is not under construction`);
      if (front.chainageM >= front.toM) return reject(state, cmd, `${front.name} has already broken through`);
      if (!isDrivable(front.method)) return reject(state, cmd, `${front.name} is not a machine that can be driven`);
      if (cmd.thrust !== undefined && (cmd.thrust < 0 || cmd.thrust > 1))
        return reject(state, cmd, `thrust ${cmd.thrust} is outside 0 to 1`);
      if (cmd.steer !== undefined && (cmd.steer < -1 || cmd.steer > 1)) return reject(state, cmd, `steer ${cmd.steer} is outside -1 to 1`);
      if (cmd.pitch !== undefined && (cmd.pitch < -1 || cmd.pitch > 1)) return reject(state, cmd, `pitch ${cmd.pitch} is outside -1 to 1`);
      if (!front.drive) {
        // Planned regime: the cruise along the alignment needs no controls.
        if (cmd.autopilot === true && cmd.thrust === undefined && cmd.steer === undefined && cmd.pitch === undefined) return;
        if (cmd.autopilot !== false) return reject(state, cmd, `${front.name} is on autopilot; send autopilot false to take the controls`);
        const seg = _segmentIndexAt(project.cum, front.chainageM);
        const floorM = front.fromM + Math.floor((front.chainageM - front.fromM) / TRAIL_STEP_M + 1e-9) * TRAIL_STEP_M;
        const trail = plannedTrail(project, front.fromM, floorM);
        const at = pointAt(project.waypoints, project.cum, front.chainageM);
        if (front.chainageM - floorM > 1e-6) trail.push(at.x, at.y, at.z);
        front.drive = driveFromPlan(
          project.waypoints,
          project.cum,
          front.chainageM,
          project.waypoints[seg].geology ?? 'softGround',
          trail,
          front.boredM,
        );
        state.version++;
      }
      const d = front.drive;
      if (cmd.autopilot !== undefined) d.autopilot = cmd.autopilot;
      if (cmd.thrust !== undefined) d.thrust = cmd.thrust;
      if (cmd.steer !== undefined) d.steer = cmd.steer;
      if (cmd.pitch !== undefined) d.pitch = cmd.pitch;
      return;
    }
    case 'chargeDig': {
      if (cmd.volumeM3 > MAX_DIG_M3) return reject(state, cmd, `a dig of ${cmd.volumeM3.toFixed(0)} m3 is more than one brush can move`);
      const project = cmd.projectId === undefined ? null : findProject(state, cmd.projectId);
      if (project === undefined) return reject(state, cmd, `no project "${cmd.projectId}"`);
      const base = round(cmd.volumeM3 * handDigCentsPerM3(profile));
      const cents = round(base * state.escalation);
      // Booked as civil works: hand digging is excavation. No soft-cost or contingency riders.
      charge(state, project, 'civil', cents, cents - base);
      state.handDig.volumeM3 += cmd.volumeM3;
      state.handDig.cents += cents;
      if (project) {
        project.handDigCents += cents;
        project.handDigM3 += cmd.volumeM3;
        state.version++;
      }
      return;
    }
  }
}

/** Headings a player can possess: machines that bore or mine a tube. Cut-and-cover fronts and track gangs are not driven. */
export function isDrivable(m: Method): boolean {
  return m === 'boredTwin' || m === 'boredSingleLarge' || m === 'mined';
}

/** Price of the free dig brush at today's unit factors, unescalated cents per cubic metre. */
export function handDigCentsPerM3(p: Profile): number {
  return K.handDigPlnPerM3.value * CENTS_PER_PLN * unitFactor(p);
}

// ---------------------------------------------------------------- events

function resolveEvent(
  state: SimState,
  uid: number,
  projectId: string,
  frontId: string | null,
  def: EventDef,
  option: EventOption,
  p: Profile,
  byDefault: boolean,
  ctx: StepContext,
): void {
  const project = findProject(state, projectId);
  if (!project) throw new Error(`sim: event ${uid} points at missing project "${projectId}"`);
  state.politicalCapital -= option.pc;
  if (option.pc > 0 && !ctx.forecast)
    pushSocialBurst(state, {
      cause: `event:${def.id}:${option.id}`,
      group: def.id === 'lawsuit' ? 'eventSettle' : 'eventFunding',
      what: option.label.replace(/\.$/, ''),
    });
  eventSpend(state, project, project.hardEstimateCents * option.hardShare);
  if (def.id === 'cashCall') {
    const raised = cashCallCents(state, project, p);
    state.cashCents += raised;
    state.cashRaisedCents = (state.cashRaisedCents ?? 0) + raised;
    const fee = round(raised * (option.feeShare ?? 0));
    // The fee is in today's dollars already.
    if (fee > 0) charge(state, project, 'events', fee, 0);
    feed(state, ctx, 'fundingReleased', projectId, def.id, `${usd(raised)} raised${fee > 0 ? `, ${usd(fee)} in fees` : ''}`);
  }
  let delay = option.delayDays;
  if (def.id === 'lawsuit') delay = Math.min(delay, p['event.lawsuit.delayCapDays']);
  const front = frontId ? project.fronts.find((f) => f.id === frontId) : undefined;
  if (front) {
    front.downDays += delay;
    if (delay > 0) {
      front.downReason = 'event';
      feed(state, ctx, 'tbmStopped', projectId, front.id, `${front.name} stands for ${delay} days`);
    }
  } else project.delayDays += delay;
  state.eventLog.push({ uid, defId: def.id, projectId, optionId: option.id, tick: state.tick, byDefault });
  state.version++;
  feed(state, ctx, 'eventResolved', projectId, def.id, `${eventTitle(def, project.eventCounts[def.id] ?? 1)}: ${option.label}`);
}

/** Annual hazard of a card for a project under a profile, or 0 when it cannot be drawn. Exposed for tests and tooltips. */
export function eventHazardPerYear(def: EventDef, project: ProjectState, p: Profile): number {
  if (project.status !== 'active' || !def.phases.includes(project.phase)) return 0;
  if ((project.eventCounts[def.id] ?? 0) >= def.maxPerProject) return 0;
  if (def.needsMethod) {
    const flags = projectFlags(project, p);
    const needs = def.needsMethod;
    if (!project.methods.some((m) => needs.includes(effectiveMethod(m, flags)))) return 0;
  }
  return def.annualRate * p[`event.${def.id}.rate`];
}

function rollEvents(state: SimState, project: ProjectState, p: Profile, rng: Uint32Array, ctx: StepContext): void {
  for (const def of ALL_EVENTS) {
    const hazard = eventHazardPerYear(def, project, p);
    if (hazard <= 0) continue;
    let frontId: string | null = null;
    if (def.targetsFront) {
      const front = project.fronts.find((f) => isTbm(f.method) && f.chainageM < f.toM);
      if (!front) continue;
      frontId = front.id;
    }
    if (_nextFloat(rng) >= hazard / YEAR) continue;
    project.eventCounts[def.id] = (project.eventCounts[def.id] ?? 0) + 1;
    state.pendingEvents.push({
      uid: state.nextEventUid,
      defId: def.id,
      projectId: project.id,
      frontId,
      raisedTick: state.tick,
      deadlineTick: state.tick + def.deadlineDays,
    });
    state.nextEventUid++;
    state.version++;
    feed(state, ctx, 'eventRaised', project.id, def.id, eventTitle(def, project.eventCounts[def.id]));
  }
}

/** The books are in the red and nobody has been asked for money yet: raise the cash call on the project that is spending. */
function raiseCashCall(state: SimState, ctx: StepContext): void {
  if (state.pendingEvents.some((e) => e.defId === 'cashCall')) return;
  const planId = state.scenario.reference?.projectId ?? 'line';
  const project = state.projects.find((x) => x.id === planId && x.status === 'active') ?? state.projects.find((x) => x.status === 'active');
  const def = eventById('cashCall');
  if (!project || !def) return;
  project.eventCounts[def.id] = (project.eventCounts[def.id] ?? 0) + 1;
  state.pendingEvents.push({
    uid: state.nextEventUid,
    defId: def.id,
    projectId: project.id,
    frontId: null,
    raisedTick: state.tick,
    deadlineTick: state.tick + def.deadlineDays,
  });
  state.nextEventUid++;
  state.version++;
  feed(state, ctx, 'eventRaised', project.id, def.id, def.title);
}

// ---------------------------------------------------------------- the daily step

function releaseFunding(state: SimState, phase: PhaseId, ctx: StepContext): void {
  for (const f of state.scenario.start.funding) {
    if (f.release === phase && !state.fundingReleased.includes(f.id)) {
      state.cashCents += f.amountCents;
      state.fundingReleased.push(f.id);
      feed(state, ctx, 'fundingReleased', null, f.id, `${f.name}: ${usd(f.amountCents)} released`);
    }
  }
}

const GATE_TEXT = {
  advancePhase: 'ready to go to tender',
  launchTBM: 'ready to launch',
  openLine: 'ready to open',
} as const;

function completePhase(state: SimState, project: ProjectState, phase: PhaseId, ctx: StepContext): void {
  releaseFunding(state, phase, ctx);
  state.politicalCapital += PC_PHASE_DONE;
  state.version++;
  project.phaseProgress = 0;
  feed(state, ctx, 'phaseDone', project.id, phase, `${project.name}: ${PHASE_LABELS[phase].toLowerCase()} done`);
  switch (phase) {
    case 'planning':
      project.phase = 'permitting';
      break;
    case 'permitting':
      project.phaseProgress = 1;
      project.awaiting = 'advancePhase';
      break;
    case 'procurement':
      project.phase = 'utilities';
      break;
    case 'utilities':
      project.phaseProgress = 1;
      project.awaiting = 'launchTBM';
      break;
    case 'construction':
      state.politicalCapital += PC_BREAKTHROUGH;
      project.phase = 'fitOut';
      break;
    case 'fitOut':
      project.phaseProgress = 1;
      project.awaiting = 'openLine';
      break;
  }
  if (project.awaiting) feed(state, ctx, 'gateReady', project.id, project.awaiting, `${project.name} is ${GATE_TEXT[project.awaiting]}`);
}

/** Expected share of days a TBM is boring, used in forecasts instead of rolling breakdowns. */
export function expectedAvailability(p: Profile): number {
  const pBreak = BREAK_P * p['tbm.breakdown'];
  return 1 / (1 + pBreak * (BREAK_MIN + (BREAK_SPAN - 1) / 2));
}

/** The heading reached the end of its run. Machines that bore or mine get a breakthrough banner, exactly once. */
function breakThrough(state: SimState, project: ProjectState, front: FrontState, ctx: StepContext): void {
  if (front.breakthroughTick >= 0) return;
  front.breakthroughTick = state.tick;
  state.version++;
  // The reception box is open when the machine arrives, even if its station is behind schedule.
  const flags = project.frozen;
  if (flags) {
    for (const s of project.stations) {
      if (Math.abs(s.chainageM - front.toM) > RECEPTION_REACH_M) continue;
      const carve = stationCarve(s, flags);
      if (!carve || s.carvedM >= carve.halfM) continue;
      if (ctx.emit) emitStationCarve(project, s, s.carvedM, carve.halfM, carve.radiusM, ctx.emit);
      s.carvedM = carve.halfM;
    }
  }
  if (!isDrivable(front.method)) return;
  let where = 'the reception shaft';
  let best = RECEPTION_REACH_M;
  for (const s of project.stations) {
    const d = Math.abs(s.chainageM - front.toM);
    if (d <= best) {
      best = d;
      where = s.name;
    }
  }
  feed(state, ctx, 'breakthrough', project.id, front.id, `Breakthrough at ${where}: ${front.name} is through`);
}

function stepConstruction(state: SimState, project: ProjectState, p: Profile, ctx: StepContext, rng: Uint32Array | null): void {
  const flags = project.frozen;
  if (!flags) throw new Error(`sim: project "${project.id}" reached construction without a frozen design`);
  const cum = project.cum;
  let allDone = true;
  let builtM = 0;
  for (const front of project.fronts) {
    if (front.chainageM < front.toM) {
      advanceFront(state, project, front, p, ctx, rng);
      if (front.chainageM < front.toM) allDone = false;
    } else flushDriveCost(state, project, front, p);
    builtM += front.chainageM - front.fromM;
  }
  const ctf = p['time.constructionFactor'];
  for (const s of project.stations) {
    if (s.progress >= 1) continue;
    const d = Math.min(1 - s.progress, 1 / stationBuildDays(s.template, flags, ctf));
    hardSpend(state, project, p, 'stations', stationCostCents(s, p, flags) * d);
    s.progress += d;
    if (s.progress >= 1 - 1e-9) s.progress = 1;
    else allDone = false;
    // The box is dug out early in the build, so a machine that arrives finds it open.
    const carve = stationCarve(s, flags);
    if (carve) {
      const share = Math.min(1, s.progress / STATION_EXCAVATION_SHARE);
      const target = share >= 1 ? carve.halfM : Math.floor((carve.halfM * share) / STATION_CARVE_STEP_M) * STATION_CARVE_STEP_M;
      if (target > s.carvedM) {
        if (ctx.emit) emitStationCarve(project, s, s.carvedM, target, carve.radiusM, ctx.emit);
        s.carvedM = target;
      }
    }
    if (s.progress >= 1) feed(state, ctx, 'stationDone', project.id, s.id, `${s.name}: structure complete`);
  }
  const len = cum[cum.length - 1];
  let stationSum = 0;
  for (const s of project.stations) stationSum += s.progress;
  const stationShare = project.stations.length > 0 ? stationSum / project.stations.length : 1;
  project.phaseProgress = Math.min(len > 0 ? builtM / len : 1, stationShare);
  if (allDone) completePhase(state, project, 'construction', ctx);
}

/** Books the civil cost a driven heading accrued in its sub-steps since the last day boundary. */
function flushDriveCost(state: SimState, project: ProjectState, front: FrontState, p: Profile): void {
  const d = front.drive;
  if (!d || d.pendingCents <= 0) return;
  hardSpend(state, project, p, 'civil', d.pendingCents - d.pendingOffPlanCents);
  if (d.pendingOffPlanCents > 0) {
    // The surcharge buys nothing a receipt lever explains, so it stays out of the paid ledger.
    hardSpend(state, project, p, 'civil', d.pendingOffPlanCents, false);
    // The surcharge with its riders at today's prices, for the off-plan line of the receipt.
    const riders = (1 + p['soft.fixed']) * (1 + p['soft.contingency']);
    project.offPlanCents += round(d.pendingOffPlanCents * riders * state.escalation);
  }
  d.pendingCents = 0;
  d.pendingOffPlanCents = 0;
}

function advanceFront(
  state: SimState,
  project: ProjectState,
  front: FrontState,
  p: Profile,
  ctx: StepContext,
  rng: Uint32Array | null,
): void {
  // In a forecast a driven heading simply continues along the plan from where it stands.
  const driven = front.drive !== null && !ctx.forecast;
  // What the sub-steps of the day accrued is booked first, also in a forecast taken in the middle of a day.
  flushDriveCost(state, project, front, p);
  if (front.downDays > 0) {
    front.downDays--;
    if (front.downDays === 0) {
      front.downReason = null;
      feed(state, ctx, 'tbmResumed', project.id, front.id, `${front.name} is boring again`);
    }
    return;
  }
  const flags = project.frozen;
  if (!flags) return;
  const tbm = isTbm(front.method);
  if (tbm && rng && _nextFloat(rng) < BREAK_P * p['tbm.breakdown']) {
    front.downDays = BREAK_MIN + _nextInt(rng, BREAK_SPAN);
    front.downReason = 'breakdown';
    feed(state, ctx, 'tbmStopped', project.id, front.id, `${front.name} is down for ${front.downDays} days: cutterhead maintenance`);
    return;
  }
  if (driven) return;
  const { waypoints, cum } = project;
  let seg = _segmentIndexAt(cum, front.chainageM);
  let rate = _advanceRate(front.method, waypoints[seg].geology ?? 'softGround', p, front.chainageM - front.fromM);
  if (tbm && !rng) rate *= expectedAvailability(p);
  const from = front.chainageM;
  const to = Math.min(front.toM, from + rate);
  let cost = 0;
  let s = from;
  while (s < to) {
    const end = Math.min(to, cum[seg + 1]);
    cost += (end - s) * _civilCentsPerM(front.method, waypoints[seg].geology ?? 'softGround', p, flags, segmentY(waypoints, seg));
    s = end;
    seg++;
  }
  hardSpend(state, project, p, 'civil', cost);
  if (ctx.emit) emitFrontCarve(project, front, from, to, ctx.emit);
  front.chainageM = to;
  front.boredM = to - front.fromM;
  if (to >= front.toM) breakThrough(state, project, front, ctx);
}

function planGeology(project: ProjectState, chainageM: number): Geology {
  return (
    project.waypoints[_segmentIndexAt(project.cum, Math.min(chainageM, project.cum[project.cum.length - 1] - 1e-9))].geology ?? 'softGround'
  );
}

/** One sub-step of a driven heading: pose, cost accrual, carving, the as-built trail, and breakthrough. */
function driveFront(state: SimState, project: ProjectState, front: FrontState, p: Profile, ctx: StepContext): void {
  const d = front.drive;
  const flags = project.frozen;
  if (!d || !flags) return;
  const { waypoints, cum } = project;
  const limits = { minRadiusM: minRadiusFor(front.method), maxGrade: MAX_GRADE };
  const rate = _advanceRate(front.method, d.geology, p, front.boredM);
  const wasOffPlan = d.offPlan;
  const wasBlocked = d.blocked;
  const shape = carveShape(front.method, flags);
  // Cover over the crown, read from the world. Without a ground query (headless runs) the rule is off.
  let thin = false;
  if (ctx.ground && d.verticalM > 0) {
    const above = ctx.ground(d.x, d.y + shape.radiusM + COVER_M, d.z);
    thin = above === Material.AIR || above === Material.WATER;
  }
  const freeM = freeDeviationM(waypoints, cum, d.planM, limits.minRadiusM);
  const step = driveSubstep(d, waypoints, cum, front.toM, rate, limits, freeM, thin);
  if (d.blocked && !wasBlocked && state.tick - d.corridorNoticeTick >= NOTICE_GAP_DAYS) {
    d.corridorNoticeTick = state.tick;
    feed(state, ctx, 'tbmStopped', project.id, front.id, `${front.name} is at the edge of its corridor and re-steers towards the plan`);
  }
  if (step.dived && state.tick - (d.coverNoticeTick ?? -1_000_000) >= NOTICE_GAP_DAYS) {
    d.coverNoticeTick = state.tick;
    feed(state, ctx, 'tbmOffPlan', project.id, front.id, `${front.name} is too close to the surface: the shield dives back under cover`);
  }
  if (step.advancedM <= 0) return;
  front.boredM += step.advancedM;
  const paidTo = front.chainageM;
  if (step.arrived) front.chainageM = front.toM;
  else if (d.planM > front.chainageM) front.chainageM = Math.min(front.toM, d.planM);
  // Priced like the plan: by the metres of plan the face has passed, at the ground class and the depth of the
  // segment it is level with. The project buys the planned tunnel: a driven heading and the autopilot pay the
  // same for the same line (a hand that cuts a corner does not get the tunnel cheaper than Poland does), and
  // only the distance from the plan costs extra.
  const planSeg = _segmentIndexAt(cum, Math.min(paidTo, cum[cum.length - 1] - 1e-9));
  const base = (front.chainageM - paidTo) * _civilCentsPerM(front.method, d.geology, p, flags, segmentY(waypoints, planSeg));
  const surcharge = d.offPlan ? base * (offPlanFactor(d, freeM) - 1) : 0;
  d.pendingCents += base + surcharge;
  d.pendingOffPlanCents += surcharge;
  if (d.offPlan && !wasOffPlan && state.tick - d.offPlanNoticeTick >= NOTICE_GAP_DAYS) {
    d.offPlanNoticeTick = state.tick;
    feed(state, ctx, 'tbmOffPlan', project.id, front.id, `${front.name} is off the plan: each metre costs more.`);
  }

  const dx = d.x - d.carveX;
  const dy = d.y - d.carveY;
  const dz = d.z - d.carveZ;
  if (step.arrived || dx * dx + dy * dy + dz * dz >= 1) {
    const from = { x: d.carveX, y: d.carveY, z: d.carveZ, dirX: d.carveDirX, dirZ: d.carveDirZ };
    const to = { x: d.x, y: d.y, z: d.z, dirX: d.dirX, dirZ: d.dirZ };
    if (ctx.emit) emitDrivenCarve(shape, from, to, ctx.emit);
    d.carveX = d.x;
    d.carveY = d.y;
    d.carveZ = d.z;
    d.carveDirX = d.dirX;
    d.carveDirZ = d.dirZ;
    // The ground class is the plan's: the ground investigation the estimate was priced on. Reading the voxels at
    // the face instead made the same project $478M cheaper when a player took the controls (second playtest).
    d.geology = planGeology(project, d.planM);
    if (step.arrived || front.boredM - d.trailM >= TRAIL_STEP_M) {
      d.trail.push(d.x, d.y, d.z);
      d.trailM = front.boredM;
    }
  }
  if (!step.arrived) return;
  // Join the reception point of the plan, so the tunnel is open end to end wherever the face came in.
  const end = pointAt(waypoints, cum, front.toM);
  const ex = end.x - d.x;
  const ey = end.y - d.y;
  const ez = end.z - d.z;
  if (ex * ex + ey * ey + ez * ez > 0.25) {
    if (ctx.emit) {
      const from = { x: d.x, y: d.y, z: d.z, dirX: d.dirX, dirZ: d.dirZ };
      emitDrivenCarve(shape, from, { ...end, dirX: d.dirX, dirZ: d.dirZ }, ctx.emit);
    }
    d.trail.push(end.x, end.y, end.z);
    d.x = end.x;
    d.y = end.y;
    d.z = end.z;
    d.carveX = end.x;
    d.carveY = end.y;
    d.carveZ = end.z;
  }
  d.lateralM = 0;
  d.verticalM = 0;
  d.offPlan = false;
  front.chainageM = front.toM;
  breakThrough(state, project, front, ctx);
}

/** Civil cost factor of a metre bored off the plan: OFF_PLAN_FACTOR just outside the free tolerance, growing with the distance. */
export function offPlanFactor(d: { lateralM: number; verticalM: number }, freeM: number): number {
  const total = Math.sqrt(d.lateralM * d.lateralM + d.verticalM * d.verticalM);
  return OFF_PLAN_FACTOR + OFF_PLAN_PER_M * Math.max(0, total - freeM);
}

/**
 * Deviation from the plan that carries no surcharge at plan chainage `s`. The plan is a polyline but a machine
 * turns on a radius, so near a vertex the tolerance widens by the distance between the corner and the curve
 * that replaces it (at most a curve of twice the minimum radius), tapering to nothing one tangent length away.
 */
export function freeDeviationM(wps: readonly Waypoint[], cum: readonly number[], s: number, minRadiusM: number): number {
  const seg = _segmentIndexAt(cum, Math.min(s, cum[cum.length - 1] - 1e-9));
  let bulge = 0;
  for (const v of [seg, seg + 1]) {
    if (v <= 0 || v >= wps.length - 1) continue;
    const a = wps[v - 1];
    const m = wps[v];
    const b = wps[v + 1];
    const ax = m.x - a.x;
    const az = m.z - a.z;
    const bx = b.x - m.x;
    const bz = b.z - m.z;
    const la = Math.sqrt(ax * ax + az * az);
    const lb = Math.sqrt(bx * bx + bz * bz);
    const denom = la * lb + (ax * bx + az * bz);
    if (!(la > 0 && lb > 0 && denom > 0)) continue;
    const tanHalf = Math.abs(ax * bz - az * bx) / denom;
    if (tanHalf <= 0) continue;
    const radius = Math.min(Math.min(la, lb) / 2 / tanHalf, 2 * minRadiusM);
    const tangent = radius * tanHalf;
    const away = Math.abs(s - cum[v]);
    if (away >= tangent) continue;
    const outside = radius * (Math.sqrt(1 + tanHalf * tanHalf) - 1);
    bulge = Math.max(bulge, outside * (1 - away / tangent));
  }
  return FREE_DEVIATION_M + bulge;
}

/** True when a heading integrates in sub-steps right now, so a day cannot be advanced in one go. */
export function hasDrivenHeading(state: SimState): boolean {
  for (const project of state.projects) {
    if (project.status !== 'active' || project.phase !== 'construction') continue;
    for (const front of project.fronts) if (front.drive && front.chainageM < front.toM) return true;
  }
  return false;
}

/**
 * Advances time by one sub-step, 1 / SUBSTEPS_PER_DAY of a game day. Driven headings integrate here;
 * everything else runs in advanceDay when the sub-step closes a day.
 */
export function advanceSubstep(state: SimState, ctx: StepContext): void {
  if (!ctx.forecast) {
    let p: Profile | null = null;
    for (const project of state.projects) {
      if (project.status !== 'active' || project.phase !== 'construction' || project.awaiting || project.delayDays > 0) continue;
      for (const front of project.fronts) {
        if (!front.drive || front.chainageM >= front.toM || front.downDays > 0) continue;
        if (!p) p = _profileFor(state.reforms);
        driveFront(state, project, front, contractProfile(project, p), ctx);
      }
    }
  }
  state.subTick++;
  if (state.subTick >= SUBSTEPS) {
    state.subTick = 0;
    advanceDay(state, ctx);
  }
}

function stepProject(state: SimState, project: ProjectState, profile: Profile, ctx: StepContext, rng: Uint32Array | null): void {
  // What the project buys is priced at its contracts once it has been tendered.
  const p = contractProfile(project, profile);
  spend(state, project, 'overhead', (project.hardEstimateCents * p['soft.overheadPerYear']) / YEAR);
  if (project.delayDays > 0) {
    project.delayDays--;
    return;
  }
  if (rng && state.eventsEnabled) rollEvents(state, project, p, rng, ctx);
  if (project.awaiting) return;
  const phase = project.phase;
  if (phase === 'construction') {
    stepConstruction(state, project, p, ctx, rng);
    return;
  }
  const d = Math.min(1 - project.phaseProgress, 1 / phaseDays(phase, p, projectLengthM(project)));
  if (phase === 'fitOut') {
    const flags = project.frozen;
    if (flags) {
      const ds = Math.min(1 - project.systemsProgress, d);
      hardSpend(state, project, p, 'systems', systemsCostCents(project, p, flags) * ds);
      project.systemsProgress += ds;
    }
  }
  project.phaseProgress += d;
  if (project.phaseProgress >= 1 - 1e-9) completePhase(state, project, phase, ctx);
}

/** The line is open and every required connect objective is met; in free build, the first line to open. */
function missionDone(state: SimState, statuses: readonly { id: string; status: string }[]): boolean {
  const required = state.scenario.objectives.filter((o) => o.kind === 'connect' && o.stretch !== true);
  if (required.length === 0) return state.projects.some((p) => p.status === 'open');
  return required.every((o) => statuses.find((s) => s.id === o.id)?.status === 'done');
}

/** Advances the world by exactly one game day. */
export function advanceDay(state: SimState, ctx: StepContext): void {
  const today = state.ledger.today;
  for (const cat of LEDGER_CATEGORIES) today[cat] = 0;
  const p = _profileFor(state.reforms);
  const rng = ctx.forecast ? null : Uint32Array.from(state.rng);

  let riders = 0;
  for (const project of state.projects) {
    if (project.status === 'active') stepProject(state, project, p, ctx, rng);
    else if (project.status === 'open') riders += project.ridersPerDay;
  }

  // Undecided cards resolve themselves with their default option.
  for (let i = 0; i < state.pendingEvents.length; ) {
    const pending = state.pendingEvents[i];
    if (state.tick < pending.deadlineTick) {
      i++;
      continue;
    }
    state.pendingEvents.splice(i, 1);
    const def = eventById(pending.defId);
    const option = def?.options.find((o) => o.id === def.defaultOption);
    if (!def || !option) throw new Error(`sim: pending event ${pending.uid} has unknown card "${pending.defId}" or no default option`);
    resolveEvent(state, pending.uid, pending.projectId, pending.frontId, def, option, p, true, ctx);
  }

  let spentToday = 0;
  for (const cat of LEDGER_CATEGORIES) spentToday += today[cat];
  const month = Math.floor(state.tick / 30);
  const monthly = state.ledger.monthly;
  while (monthly.length <= month) monthly.push(0);
  monthly[month] += spentToday;

  state.tick++;
  if (state.tick % 30 === 0 && state.politicalCapital < PC_MONTHLY_CAP) {
    state.politicalCapital = Math.min(PC_MONTHLY_CAP, state.politicalCapital + PC_PER_MONTH + Math.floor(riders / PC_RIDERS_PER_POINT));
  }
  state.escalation *= ESC_DAILY;
  if (rng) state.rng = Array.from(rng);

  if (ctx.forecast) return;
  if (state.cashCents < 0 && !state.cashShort) {
    state.cashShort = true;
    feed(state, ctx, 'cashShort', null, null, 'The money has run out');
  } else if (state.cashCents >= 0) state.cashShort = false;
  // An empty account stops the work: the card holds the clock until the player has found the money.
  if (state.cashCents < 0 && state.eventsEnabled) raiseCashCall(state, ctx);
  if (ctx.evaluate) {
    const statuses = ctx.evaluate(state);
    for (const o of statuses) {
      const was = state.objectiveStatus[o.id] ?? 'pending';
      if (o.status !== was && o.status !== 'pending')
        feed(
          state,
          ctx,
          o.status === 'done' ? 'objectiveDone' : 'objectiveFailed',
          null,
          o.id,
          `${o.status === 'done' ? 'Objective met' : 'Objective failed'}: ${o.title}`,
        );
      state.objectiveStatus[o.id] = o.status;
    }
    if (state.missionCompleteTick < 0 && missionDone(state, statuses)) {
      state.missionCompleteTick = state.tick;
      feed(state, ctx, 'missionComplete', null, null, `${state.scenario.title}: mission complete`);
    }
  }
}

/** Commands that move every project past its player gates. Used by forecasts, tests and headless runs. */
export function autopilotCommands(
  view: { projects: readonly { id: string; status: string; awaiting: string | null }[] },
  approveDrafts = true,
): GameCommand[] {
  const out: GameCommand[] = [];
  for (const project of view.projects) {
    if (project.status === 'draft') {
      if (approveDrafts) out.push({ t: 'approveProject', projectId: project.id });
    } else if (project.awaiting === 'advancePhase' || project.awaiting === 'launchTBM' || project.awaiting === 'openLine') {
      out.push({ t: project.awaiting, projectId: project.id });
    }
  }
  return out;
}
