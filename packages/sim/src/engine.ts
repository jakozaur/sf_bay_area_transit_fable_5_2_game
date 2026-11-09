/**
 * Sim engine: initial state, command application, and the one-day step.
 * Pure over a JSON-serializable SimState. No DOM, no three, no wall clock; randomness only from the seeded core PRNG.
 */
import { type Command, createRng, isInGrid, nextFloat, nextInt, type WorldEdit } from '@bayvox/core';
import { DAYS_PER_YEAR, ESCALATION_DAILY, CONSTANTS as K } from './constants.ts';
import { ridership } from './demand.ts';
import { EVENTS, type EventDef, type EventOption, eventById } from './events.ts';
import { carveCapsules, chainages, nearestChainage, segmentIndexAt } from './geometry.ts';
import {
  advanceRate,
  carveShape,
  civilCentsPerM,
  designFlags,
  effectiveMethod,
  hardCost,
  isTbm,
  phaseDays,
  projectFlags,
  stationBuildDays,
  stationCostCents,
  systemsCostCents,
} from './model.ts';
import { type Profile, profileFor, profileReforms, reformById } from './reforms.ts';
import {
  type FrontState,
  type GameCommand,
  GEOLOGIES,
  LEDGER_CATEGORIES,
  type LedgerCategory,
  METHODS,
  type Method,
  type PhaseId,
  type ProjectState,
  SCHEMA_VERSION,
  type ScenarioDef,
  type SimState,
  SPEEDS,
  STATION_TEMPLATES,
  type StationState,
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
const STATION_CARVE_HALF_LENGTH_M = 70;
const STATION_CARVE_RADIUS_M = 8;
/** Political capital: a small monthly mandate plus milestones (doc 07 section 5: earned by delivering). Tuning. */
const PC_PER_MONTH = 2;
const PC_PHASE_DONE = 3;
const PC_BREAKTHROUGH = 5;
const PC_OPENING = 20;
const PC_RIDERS_PER_POINT = 10_000;

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
  };
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
    case 'resolveEvent': {
      const eventId = num(c, 'eventId');
      return { t: 'resolveEvent', eventId, optionId: str(c, 'optionId') };
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
 * ("all money in the budget will be spent", doc 06 section 3.3) and forms a pool that event costs draw
 * on first; event costs paid before the pool existed are netted against later accruals.
 */
function hardSpend(state: SimState, project: ProjectState, p: Profile, category: LedgerCategory, baseCents: number): void {
  const base = round(baseCents);
  if (base <= 0) return;
  spend(state, project, category, base);
  const soft = round(base * p['soft.fixed']);
  spend(state, project, 'soft', soft);
  const contBase = round((base + soft) * p['soft.contingency']);
  if (contBase > 0) {
    const cont = round(contBase * state.escalation);
    const offset = Math.min(cont, project.contingencyCreditCents);
    project.contingencyCreditCents -= offset;
    const net = cont - offset;
    project.contingencyPoolCents += net;
    charge(state, project, 'contingency', net, round((net * (cont - contBase)) / cont));
  }
}

function eventSpend(state: SimState, project: ProjectState, baseCents: number): void {
  const base = round(baseCents);
  if (base <= 0) return;
  const cents = round(base * state.escalation);
  const fromPool = Math.min(cents, project.contingencyPoolCents);
  project.contingencyPoolCents -= fromPool;
  const rest = cents - fromPool;
  if (rest > 0) {
    project.contingencyCreditCents += rest;
    charge(state, project, 'events', rest, round((rest * (cents - base)) / cents));
  }
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

function refreshEstimate(project: ProjectState, p: Profile): void {
  project.hardEstimateCents = project.methods.length === 0 ? 0 : round(hardCost(project, p, projectFlags(project, p), false).totalCents);
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
  let i = 0;
  while (i < project.methods.length) {
    const method = effectiveMethod(project.methods[i], flags);
    let j = i;
    while (j + 1 < project.methods.length && effectiveMethod(project.methods[j + 1], flags) === method) j++;
    const n = fronts.length + 1;
    let name = `${HEADING_LABEL[method]} ${n}`;
    if (isTbm(method)) {
      name = `TBM ${TBM_NAMES[state.nextFrontName % TBM_NAMES.length]}`;
      state.nextFrontName++;
    }
    fronts.push({
      id: `${project.id}/f${n}`,
      name,
      method,
      fromM: project.cum[i],
      toM: project.cum[j + 1],
      chainageM: project.cum[i],
      downDays: 0,
    });
    i = j + 1;
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

function emitStationCarve(project: ProjectState, s: StationState, emit: (e: WorldEdit) => void): void {
  if (s.template !== 'undergroundStandard' && s.template !== 'undergroundDeepMined') return;
  const len = projectLengthM(project);
  const from = Math.max(0, s.chainageM - STATION_CARVE_HALF_LENGTH_M);
  const to = Math.min(len, s.chainageM + STATION_CARVE_HALF_LENGTH_M);
  const edits: WorldEdit[] = [];
  _carveCapsules(project.waypoints, project.cum, from, to, STATION_CARVE_RADIUS_M, 0, edits);
  for (const e of edits) emit(e);
}

/** Every carve edit implied by construction progress so far. Used after load to rebuild the voxels. */
export function replayCarves(state: SimState, emit: (e: WorldEdit) => void): void {
  for (const project of state.projects) {
    for (const front of project.fronts) emitFrontCarve(project, front, front.fromM, front.chainageM, emit);
    for (const s of project.stations) if (s.progress >= 1) emitStationCarve(project, s, emit);
  }
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
      if (cmd.methods) project.methods = [...cmd.methods];
      else if (project.methods.length !== segments) project.methods = new Array<Method>(segments).fill('boredTwin');
      project.waypoints = cmd.waypoints.map((w) => ({ ...w }));
      if (cmd.name) project.name = cmd.name;
      refreshGeometry(project);
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
      if (waypoints.length >= 2) {
        const neighbour = project.methods[Math.min(Math.max(0, index - 1), project.methods.length - 1)];
        project.methods.splice(Math.max(0, index - 1), 0, cmd.method ?? neighbour ?? 'boredTwin');
      }
      project.waypoints = waypoints;
      refreshGeometry(project);
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
      project.methods[cmd.segment] = cmd.method;
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
      project.stations.push({ id, name: cmd.name, template: cmd.template, chainageM, depthM, progress: 0 });
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
      project.status = 'active';
      project.approvedTick = state.tick;
      project.approvedEscalation = state.escalation;
      const head = state.scenario.start.headStart;
      project.phase = head ? head.phase : 'planning';
      project.phaseProgress = head ? head.progress : 0;
      refreshEstimate(project, profile);
      state.version++;
      return;
    }
    case 'advancePhase': {
      const project = findProject(state, cmd.projectId);
      if (!project) return reject(state, cmd, `no project "${cmd.projectId}"`);
      if (project.awaiting !== 'advancePhase') return reject(state, cmd, `project "${project.id}" is not waiting to go to tender`);
      project.awaiting = null;
      project.phase = 'procurement';
      project.phaseProgress = 0;
      project.frozen = designFlags(profile);
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
        project.ridersPerDay = ridership(project, state.scenario.feeders).ridersPerDay;
        if (ctx.benchmark) {
          const b = ctx.benchmark(state, project);
          project.polandCostCents = b.costCents;
          project.polandDays = b.days;
        }
      }
      state.version++;
      return;
    }
    case 'enactReform': {
      const def = reformById(cmd.id);
      if (!def) return reject(state, cmd, `no reform "${cmd.id}"`);
      if (state.reforms.includes(def.id)) return reject(state, cmd, `reform "${def.id}" is already enacted`);
      const missing = def.prereqs.filter((id) => !state.reforms.includes(id));
      if (missing.length > 0) return reject(state, cmd, `reform "${def.id}" needs ${missing.join(', ')} first`);
      if (state.politicalCapital < def.cost.pc)
        return reject(state, cmd, `reform "${def.id}" costs ${def.cost.pc} political capital, you have ${state.politicalCapital}`);
      if (def.cost.cents > 0 && state.cashCents < def.cost.cents)
        return reject(state, cmd, `reform "${def.id}" costs $${(def.cost.cents / 1e8).toFixed(0)}M, cash is short`);
      state.politicalCapital -= def.cost.pc;
      charge(state, null, 'reforms', def.cost.cents, 0);
      state.reforms.push(def.id);
      const next = _profileFor(state.reforms);
      for (const project of state.projects) if (project.status !== 'open') refreshEstimate(project, next);
      state.version++;
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
      resolveEvent(state, pending.uid, pending.projectId, pending.frontId, def, option, profile, false);
      return;
    }
  }
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
): void {
  const project = findProject(state, projectId);
  if (!project) throw new Error(`sim: event ${uid} points at missing project "${projectId}"`);
  state.politicalCapital -= option.pc;
  eventSpend(state, project, project.hardEstimateCents * option.hardShare);
  let delay = option.delayDays;
  if (def.id === 'lawsuit') delay = Math.min(delay, p['event.lawsuit.delayCapDays']);
  const front = frontId ? project.fronts.find((f) => f.id === frontId) : undefined;
  if (front) front.downDays += delay;
  else project.delayDays += delay;
  state.eventLog.push({ uid, defId: def.id, projectId, optionId: option.id, tick: state.tick, byDefault });
  state.version++;
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

function rollEvents(state: SimState, project: ProjectState, p: Profile, rng: Uint32Array): void {
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
  }
}

// ---------------------------------------------------------------- the daily step

function releaseFunding(state: SimState, phase: PhaseId): void {
  for (const f of state.scenario.start.funding) {
    if (f.release === phase && !state.fundingReleased.includes(f.id)) {
      state.cashCents += f.amountCents;
      state.fundingReleased.push(f.id);
    }
  }
}

function completePhase(state: SimState, project: ProjectState, phase: PhaseId): void {
  releaseFunding(state, phase);
  state.politicalCapital += PC_PHASE_DONE;
  state.version++;
  project.phaseProgress = 0;
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
}

/** Expected share of days a TBM is boring, used in forecasts instead of rolling breakdowns. */
export function expectedAvailability(p: Profile): number {
  const pBreak = BREAK_P * p['tbm.breakdown'];
  return 1 / (1 + pBreak * (BREAK_MIN + (BREAK_SPAN - 1) / 2));
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
    }
    builtM += front.chainageM - front.fromM;
  }
  const ctf = p['time.constructionFactor'];
  for (const s of project.stations) {
    if (s.progress >= 1) continue;
    const d = Math.min(1 - s.progress, 1 / stationBuildDays(s.template, flags, ctf));
    hardSpend(state, project, p, 'stations', stationCostCents(s, p, flags) * d);
    s.progress += d;
    if (s.progress >= 1 - 1e-9) {
      s.progress = 1;
      if (ctx.emit) emitStationCarve(project, s, ctx.emit);
    } else {
      allDone = false;
    }
  }
  const len = cum[cum.length - 1];
  let stationSum = 0;
  for (const s of project.stations) stationSum += s.progress;
  const stationShare = project.stations.length > 0 ? stationSum / project.stations.length : 1;
  project.phaseProgress = Math.min(len > 0 ? builtM / len : 1, stationShare);
  if (allDone) completePhase(state, project, 'construction');
}

function advanceFront(
  state: SimState,
  project: ProjectState,
  front: FrontState,
  p: Profile,
  ctx: StepContext,
  rng: Uint32Array | null,
): void {
  if (front.downDays > 0) {
    front.downDays--;
    return;
  }
  const flags = project.frozen;
  if (!flags) return;
  const tbm = isTbm(front.method);
  if (tbm && rng && _nextFloat(rng) < BREAK_P * p['tbm.breakdown']) {
    front.downDays = BREAK_MIN + _nextInt(rng, BREAK_SPAN);
    return;
  }
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
    cost += (end - s) * _civilCentsPerM(front.method, waypoints[seg].geology ?? 'softGround', p, flags);
    s = end;
    seg++;
  }
  hardSpend(state, project, p, 'civil', cost);
  if (ctx.emit) emitFrontCarve(project, front, from, to, ctx.emit);
  front.chainageM = to;
}

function stepProject(state: SimState, project: ProjectState, p: Profile, ctx: StepContext, rng: Uint32Array | null): void {
  spend(state, project, 'overhead', (project.hardEstimateCents * p['soft.overheadPerYear']) / YEAR);
  if (project.delayDays > 0) {
    project.delayDays--;
    return;
  }
  if (rng && state.eventsEnabled) rollEvents(state, project, p, rng);
  if (project.awaiting) return;
  const phase = project.phase;
  if (phase === 'construction') {
    stepConstruction(state, project, p, ctx, rng);
    return;
  }
  const d = Math.min(1 - project.phaseProgress, 1 / phaseDays(phase, p));
  if (phase === 'fitOut') {
    const flags = project.frozen;
    if (flags) {
      const ds = Math.min(1 - project.systemsProgress, d);
      hardSpend(state, project, p, 'systems', systemsCostCents(project, p, flags) * ds);
      project.systemsProgress += ds;
    }
  }
  project.phaseProgress += d;
  if (project.phaseProgress >= 1 - 1e-9) completePhase(state, project, phase);
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
    resolveEvent(state, pending.uid, pending.projectId, pending.frontId, def, option, p, true);
  }

  let spentToday = 0;
  for (const cat of LEDGER_CATEGORIES) spentToday += today[cat];
  const month = Math.floor(state.tick / 30);
  const monthly = state.ledger.monthly;
  while (monthly.length <= month) monthly.push(0);
  monthly[month] += spentToday;

  state.tick++;
  if (state.tick % 30 === 0) state.politicalCapital += PC_PER_MONTH + Math.floor(riders / PC_RIDERS_PER_POINT);
  state.escalation *= ESC_DAILY;
  if (rng) state.rng = Array.from(rng);
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
