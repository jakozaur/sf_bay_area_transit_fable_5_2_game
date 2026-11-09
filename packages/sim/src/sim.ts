/** Public sim object: createSim, loadSim, snapshot, save. */
import { type Command, type SaveFile, type Sim, stableHashString, type WorldEdit } from '@bayvox/core';
import { dateAtTick } from './dates.ts';
import { ridership } from './demand.ts';
import {
  advanceDay,
  applyCommand,
  expectedAvailability,
  initState,
  parseCommand,
  projectLengthM,
  projectSpentCents,
  replayCarves,
  type StepContext,
} from './engine.ts';
import { EVENTS, eventById } from './events.ts';
import { comparison, type Forecast, forecastProject, polandBenchmark } from './forecast.ts';
import { pointAt, segmentIndexAt } from './geometry.ts';
import { advanceRate, effectiveMethod, isTbm, phaseDays, projectFlags, stationBuildDays } from './model.ts';
import { type Profile, profileFor, REFORMS } from './reforms.ts';
import { evaluateObjectives, validateScenario } from './scenario.ts';
import {
  type EventView,
  type GameSnapshot,
  LEDGER_CATEGORIES,
  PHASES,
  type PhaseId,
  type ProjectState,
  type ProjectView,
  type ReformView,
  SCHEMA_VERSION,
  type ScenarioDef,
  type SimState,
  type TbmView,
} from './types.ts';

/** Anything that accepts world edits: a WorldStore, or a plain collector in tests. */
export interface WorldSink {
  applyEdit(e: WorldEdit): unknown;
}

export interface SimOptions {
  /** Overrides the scenario's cost profile (bayAreaStatusQuo or polishBaseline). */
  costProfile?: string;
  /** False turns event cards off. TBM breakdowns still roll. */
  events?: boolean;
}

export interface GameSim extends Sim {
  /** Applies the commands, then advances exactly one game day. */
  step(commands?: readonly Command[]): void;
  /** Applies commands without advancing time (the game is paused, or the caller batches input). */
  dispatch(commands: readonly Command[]): void;
  /** Headless fast-forward. `each` may return commands for the next tick; return false to stop early. */
  run(ticks: number, each?: (sim: GameSim) => readonly Command[] | false | undefined): void;
  snapshot(): GameSnapshot;
  serialize(): SimState;
  hash(): string;
  /** Save container v1 (doc 10 section 3.5). */
  save(worldDataVersion?: string): SaveFile;
  /** Live state, read-only by convention. For tests and tools; UI code reads snapshot(). */
  readonly state: SimState;
}

/** JSON with object keys sorted, so the hash does not depend on property creation order. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const parts: string[] = [];
  for (const k of keys) if (o[k] !== undefined) parts.push(`${JSON.stringify(k)}:${canonical(o[k])}`);
  return `{${parts.join(',')}}`;
}

export function hashState(state: SimState): string {
  return stableHashString(canonical(state));
}

interface ProjectCache {
  version: number;
  tick: number;
  eac: Forecast;
  poland: { costCents: number; days: number };
  riders: number;
}

/** How stale a cached forecast may get while nothing forecast-relevant changes. */
const FORECAST_REFRESH_TICKS = 30;

function plannedConstructionDays(project: ProjectState, p: Profile): number {
  const flags = projectFlags(project, p);
  let days = 0;
  for (const s of project.stations) days = Math.max(days, stationBuildDays(s.template, flags, p['time.constructionFactor']));
  // Longest run of one effective method at its steady rate.
  let i = 0;
  while (i < project.methods.length) {
    const m = effectiveMethod(project.methods[i], flags);
    let runDays = 0;
    let j = i;
    while (j < project.methods.length && effectiveMethod(project.methods[j], flags) === m) {
      const len = project.cum[j + 1] - project.cum[j];
      const rate =
        advanceRate(m, project.waypoints[j].geology ?? 'softGround', p, Number.POSITIVE_INFINITY) *
        (isTbm(m) ? expectedAvailability(p) : 1);
      runDays += len / rate;
      j++;
    }
    days = Math.max(days, runDays);
    i = j;
  }
  return days;
}

function buildSim(state: SimState, world: WorldSink | null): GameSim {
  const emit = world ? (e: WorldEdit) => void world.applyEdit(e) : null;
  const ctx: StepContext = { emit, forecast: false, benchmark: polandBenchmark };
  const cache = new Map<string, ProjectCache>();

  function forecasts(project: ProjectState): ProjectCache {
    const hit = cache.get(project.id);
    if (hit && hit.version === state.version && (project.status === 'open' || state.tick - hit.tick < FORECAST_REFRESH_TICKS)) return hit;
    const fresh: ProjectCache = {
      version: state.version,
      tick: state.tick,
      eac: forecastProject(state, project),
      poland: polandBenchmark(state, project),
      riders: project.status === 'open' ? project.ridersPerDay : ridership(project, state.scenario.feeders).ridersPerDay,
    };
    cache.set(project.id, fresh);
    return fresh;
  }

  function projectView(project: ProjectState, p: Profile): ProjectView {
    const flags = projectFlags(project, p);
    const phaseIndex = PHASES.indexOf(project.phase);
    const phases = PHASES.map((id: PhaseId, i) => {
      const done = project.status === 'open' || (project.status === 'active' && i < phaseIndex);
      const current = project.status === 'active' && i === phaseIndex;
      return {
        id,
        state: done ? ('done' as const) : current ? ('current' as const) : ('todo' as const),
        progress: done ? 1 : current ? project.phaseProgress : 0,
        plannedDays: Math.round(id === 'construction' ? plannedConstructionDays(project, p) : phaseDays(id, p)),
      };
    });
    const tbms: TbmView[] = project.fronts.map((f) => {
      const done = f.chainageM >= f.toM;
      const seg = segmentIndexAt(project.cum, f.chainageM);
      const rate = advanceRate(f.method, project.waypoints[seg].geology ?? 'softGround', p, f.chainageM - f.fromM);
      const stopped = f.downDays > 0 || project.delayDays > 0;
      return {
        id: f.id,
        name: f.name,
        method: f.method,
        position: pointAt(project.waypoints, project.cum, f.chainageM),
        chainageM: f.chainageM,
        fromM: f.fromM,
        toM: f.toM,
        progress: f.toM > f.fromM ? (f.chainageM - f.fromM) / (f.toM - f.fromM) : 1,
        status: done ? 'done' : stopped ? 'stopped' : 'running',
        rateMPerDay: done || stopped ? 0 : rate,
      };
    });
    const fc = project.methods.length > 0 ? forecasts(project) : null;
    const empty: Forecast = { costCents: 0, openTick: state.tick };
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      phase: project.phase,
      phaseProgress: project.phaseProgress,
      awaiting: project.awaiting,
      delayDays: project.delayDays,
      lengthM: projectLengthM(project),
      designFrozen: project.frozen !== null,
      phases,
      segments: project.methods.map((method, index) => ({
        index,
        fromM: project.cum[index],
        toM: project.cum[index + 1],
        method,
        effectiveMethod: effectiveMethod(method, flags),
        geology: project.waypoints[index].geology ?? 'softGround',
      })),
      stations: project.stations.map((s) => ({
        id: s.id,
        name: s.name,
        template: s.template,
        chainageM: s.chainageM,
        position: pointAt(project.waypoints, project.cum, s.chainageM),
        progress: s.progress,
      })),
      tbms,
      waypoints: project.waypoints.map((w) => ({ ...w })),
      spentCents: projectSpentCents(project),
      spentByCategory: { ...project.spent },
      escalationCents: project.escalationCents,
      comparison: comparison(state, project, fc ? fc.eac : empty, fc ? fc.poland : { costCents: 0, days: 0 }, fc ? fc.riders : 0),
    };
  }

  function snapshot(): GameSnapshot {
    const p = profileFor(state.reforms);
    const enacted = new Set(state.reforms);
    const reforms: ReformView[] = REFORMS.map((r) => ({
      id: r.id,
      branch: r.branch,
      title: r.title,
      description: r.description,
      evidence: r.evidence,
      cost: { ...r.cost },
      prereqs: [...r.prereqs],
      effects: r.effects.map((e) => ({ ...e })),
      beyondPoland: r.beyondPoland,
      status: enacted.has(r.id) ? 'enacted' : r.prereqs.every((id) => enacted.has(id)) ? 'available' : 'locked',
    }));
    const events: EventView[] = state.pendingEvents.map((pe) => {
      const def = eventById(pe.defId);
      if (!def) throw new Error(`sim: pending event ${pe.uid} has unknown card "${pe.defId}"`);
      const project = state.projects.find((pr) => pr.id === pe.projectId);
      const hard = project ? project.hardEstimateCents : 0;
      return {
        uid: pe.uid,
        id: def.id,
        title: def.title,
        description: def.description,
        evidence: def.evidence,
        projectId: pe.projectId,
        deadlineTick: pe.deadlineTick,
        defaultOption: def.defaultOption,
        options: def.options.map((o) => ({
          id: o.id,
          label: o.label,
          costCents: Math.round(hard * o.hardShare * state.escalation),
          delayDays: def.id === 'lawsuit' ? Math.min(o.delayDays, p['event.lawsuit.delayCapDays']) : o.delayDays,
          pc: o.pc,
        })),
      };
    });
    let totalSpent = 0;
    for (const cat of LEDGER_CATEGORIES) totalSpent += state.ledger.total[cat];
    let riders = 0;
    for (const pr of state.projects) if (pr.status === 'open') riders += pr.ridersPerDay;
    return {
      tick: state.tick,
      date: dateAtTick(state.scenario.start.date, state.tick),
      budgetCents: state.cashCents,
      scenarioId: state.scenario.id,
      seed: state.seed,
      costProfile: state.costProfile,
      speed: state.speed,
      ticksPerFrame: state.speed,
      moneyCents: state.cashCents,
      politicalCapital: state.politicalCapital,
      projects: state.projects.map((pr) => projectView(pr, p)),
      ledger: {
        totalSpentCents: totalSpent,
        byCategory: { ...state.ledger.total },
        today: { ...state.ledger.today },
        escalationCents: state.ledger.escalationCents,
        monthly: [...state.ledger.monthly],
        funding: state.scenario.start.funding.map((f) => ({
          id: f.id,
          name: f.name,
          amountCents: f.amountCents,
          release: f.release,
          released: state.fundingReleased.includes(f.id),
        })),
      },
      reforms,
      events,
      objectives: evaluateObjectives(state),
      ridersPerDay: riders,
      notices: state.notices.map((n) => ({ ...n })),
    };
  }

  const sim: GameSim = {
    state,
    dispatch(commands) {
      // Validate the whole batch before touching state, so a malformed command cannot leave it half applied.
      const parsed = commands.map(parseCommand);
      for (const cmd of parsed) applyCommand(state, cmd, ctx);
    },
    step(commands) {
      if (commands && commands.length > 0) sim.dispatch(commands);
      advanceDay(state, ctx);
    },
    run(ticks, each) {
      if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError(`sim.run: ticks must be a non-negative integer, got ${ticks}`);
      for (let i = 0; i < ticks; i++) {
        const commands = each ? each(sim) : undefined;
        if (commands === false) return;
        sim.step(commands);
      }
    },
    snapshot,
    serialize() {
      return JSON.parse(JSON.stringify(state)) as SimState;
    },
    hash() {
      return hashState(state);
    },
    save(worldDataVersion = 'unversioned') {
      return {
        format: 'bayvox-save',
        schemaVersion: SCHEMA_VERSION,
        worldDataVersion,
        scenarioId: state.scenario.id,
        seed: state.seed,
        tick: state.tick,
        sim: sim.serialize(),
        edits: [],
        stateHash: sim.hash(),
      };
    },
  };
  return sim;
}

/** Creates a sim at tick 0 of a scenario. Throws listing every problem if the scenario is invalid. */
export function createSim(scenario: ScenarioDef, seed: number, world: WorldSink | null = null, opts: SimOptions = {}): GameSim {
  const problems = validateScenario(scenario);
  if (problems.length > 0) throw new Error(`sim: invalid scenario: ${problems.join('; ')}`);
  // The scenario lives inside the state, so it must be a plain JSON copy the caller cannot mutate.
  const own = JSON.parse(JSON.stringify(scenario)) as ScenarioDef;
  return buildSim(initState(own, seed, opts), world);
}

/** Save migrations by source schemaVersion. Empty while version 1 is the only one. */
const MIGRATIONS: Record<number, (save: SaveFile) => SaveFile> = {};

/**
 * Restores a sim from a save and replays the carve edits of all construction so far into `world`.
 * Fails loudly on an unknown version or a state that does not match its hash; there is no best-effort load.
 */
export function loadSim(save: SaveFile, world: WorldSink | null = null): GameSim {
  if (save?.format !== 'bayvox-save') throw new Error(`sim: not a bayvox save (format ${JSON.stringify(save?.format)})`);
  let current = save;
  while (current.schemaVersion !== SCHEMA_VERSION) {
    const migrate = MIGRATIONS[current.schemaVersion];
    if (!migrate)
      throw new Error(`sim: cannot load save schemaVersion ${current.schemaVersion}; this build reads version ${SCHEMA_VERSION}`);
    current = migrate(current);
  }
  const state = JSON.parse(JSON.stringify(current.sim)) as SimState;
  if (state.schemaVersion !== SCHEMA_VERSION)
    throw new Error(`sim: save container is version ${SCHEMA_VERSION} but its sim state is version ${state.schemaVersion}`);
  const hash = hashState(state);
  if (hash !== current.stateHash) throw new Error(`sim: save is corrupt: state hash ${hash} does not match recorded ${current.stateHash}`);
  const sim = buildSim(state, world);
  if (world) replayCarves(state, (e) => void world.applyEdit(e));
  return sim;
}

/** Card definitions, for a UI codex. */
export const EVENT_CARDS = EVENTS;
