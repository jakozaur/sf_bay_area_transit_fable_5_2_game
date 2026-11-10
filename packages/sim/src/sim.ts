/** Public sim object: createSim, loadSim, snapshot, save. */
import {
  type Command,
  type EditLogRef,
  type SaveFile,
  type Sim,
  stableHashString,
  type TunnelEntity,
  type WorldEdit,
  type WorldPos,
} from '@bayvox/core';
import { checkAlignment } from './checks.ts';
import { CONSTANTS, SUBSTEPS_PER_DAY } from './constants.ts';
import { dateAtTick } from './dates.ts';
import { DESIGN_OPTIONS, lockTitles, optionLocks, reformSelects, reformUnlocks, stationBoxOf, stationSize, tunnelOf } from './design.ts';
import {
  addPaid,
  advanceDay,
  advanceSubstep,
  applyCommand,
  cashCallCents,
  handDigCentsPerM3,
  hasDrivenHeading,
  initState,
  parseCommand,
  plannedTrail,
  projectLengthM,
  projectSpentCents,
  replayCarves,
  type StepContext,
} from './engine.ts';
import {
  estimateAlignment,
  plannedConstructionDays,
  plannedHeadingDays,
  plannedStationDays,
  quickOption,
  quickProject,
  stationAdds,
} from './estimate.ts';
import { EVENTS, eventById, eventTitle } from './events.ts';
import {
  comparison,
  type DesignRun,
  designRun,
  type Forecast,
  forecastProject,
  forecastWhatIf,
  polandBenchmark,
  polandRun,
  polishRedrawCommands,
  runDesign,
} from './forecast.ts';
import { pointAt } from './geometry.ts';
import type { GroundQuery } from './ground.ts';
import { housingViews, projectRiders } from './housing.ts';
import { carveShape, contractProfile, effectiveMethod, isUnderground, PHASE_LABELS, phaseDays, projectFlags } from './model.ts';
import {
  buildReceipt,
  buildScorecard,
  emptyReceipt,
  ghostOf,
  missionResult,
  reformReceiptLines,
  runColumn,
  yoursColumn,
} from './receipt.ts';
import { migrateReformIds, POLAND_PROFILE, type Profile, profileFor, profileReforms, REFORMS } from './reforms.ts';
import { evaluateObjectives, validateScenario } from './scenario.ts';
import {
  type AlignmentEstimate,
  type AlignmentEstimateRequest,
  type ClockView,
  type DesignOptionView,
  type DesignView,
  type EventView,
  FEED_LENGTH,
  type FrontState,
  type GameCommand,
  type GameSnapshot,
  type HeadlineView,
  LEDGER_CATEGORIES,
  type MissionView,
  type NextAction,
  PHASES,
  type PhaseId,
  type PhaseView,
  type ProjectState,
  type ProjectView,
  type Receipt,
  type ReformPreview,
  type ReformView,
  SCHEMA_VERSION,
  type ScenarioDef,
  type Scorecard,
  type ServiceView,
  type SimQueries,
  type SimState,
  STATION_BOXES,
  STATION_TEMPLATES,
  type StationOptionView,
  TUNNEL_OPTION_METHOD,
  TUNNEL_OPTIONS,
  type TunnelOptionId,
} from './types.ts';
import {
  alignmentView,
  clockView,
  gameNextAction,
  launchLabel,
  liningOf,
  missionProject,
  missionStage,
  missionTargets,
  pitViews,
  planProjectId,
  projectNextAction,
  reformNotes,
  STATION_TEMPLATE_LABELS,
  STATION_TEMPLATE_NOTES,
  serviceView,
  stationView,
  tbmView,
  tunnelProgress,
} from './views.ts';

/** Anything that accepts world edits: a WorldStore, or a plain collector in tests. */
export interface WorldSink {
  applyEdit(e: WorldEdit): unknown;
}

export interface SimOptions {
  /** Overrides the scenario's cost profile (bayAreaStatusQuo or polishBaseline). */
  costProfile?: string;
  /** False turns event cards off. TBM breakdowns still roll. */
  events?: boolean;
  /**
   * Material at a world position in metres (the app passes WorldPort.voxelAt). A driven heading reads the
   * ground at its face from it; without it the geology of the planned alignment is used. Must be a pure
   * function of the world, or replays diverge.
   */
  ground?: GroundQuery;
}

/** What a save records besides the sim state. */
export interface SaveOptions {
  worldDataVersion?: string;
  /** Reference to the manual edit log the app stored next to the save (core EditLogRef). */
  editLog?: EditLogRef;
}

const RING_M = CONSTANTS.ringLengthM.value;
const TRAIL_STEP_M = CONSTANTS.trailStepM.value;

/** The player gate that closes each phase, if any, with its button text. */
const PHASE_GATES: Partial<Record<PhaseId, { command: 'advancePhase' | 'launchTBM' | 'openLine'; label: string }>> = {
  permitting: { command: 'advancePhase', label: 'Go to tender' },
  utilities: { command: 'launchTBM', label: 'Launch the TBM' },
  fitOut: { command: 'openLine', label: 'Open the line' },
};

export interface GameSim extends Sim, SimQueries {
  /** Applies the commands, then advances exactly one game day: SUBSTEPS_PER_DAY sub-steps. */
  step(commands?: readonly Command[]): void;
  /**
   * Applies the commands, then advances one sub-step (1 / SUBSTEPS_PER_DAY of a game day). Headings in the
   * driven regime integrate their pose here; everything else runs once, when the sub-step closes a day.
   * State after N sub-steps depends only on the seed and on which commands arrived before which sub-step.
   */
  substep(commands?: readonly Command[]): void;
  /** Applies commands without advancing time (the game is paused, or the caller batches input). */
  dispatch(commands: readonly Command[]): void;
  /** Headless fast-forward. `each` may return commands for the next tick; return false to stop early. */
  run(ticks: number, each?: (sim: GameSim) => readonly Command[] | false | undefined): void;
  snapshot(): GameSnapshot;
  /** The clock of snapshot().clock without building a snapshot: cheap enough to read after every step of a frame. */
  clock(): ClockView;
  serialize(): SimState;
  hash(): string;
  /** Save container v1 (doc 10 section 3.5). A string argument is the world data version, as before round 2. */
  save(opts?: string | SaveOptions): SaveFile;
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
  poland: DesignRun;
  statusQuo: DesignRun;
  /** Tick the status-quo column's clock starts. */
  statusQuoTick0: number;
  statusQuoBasis: string;
  riders: number;
  receipt: Receipt;
  scorecard: Scorecard;
  design: DesignView;
  stationOptions: StationOptionView[];
  /** The design tags came from forecast runs (time stood when this was built). */
  exact: boolean;
}

interface TunnelCache {
  /** Trail numbers already turned into points. */
  taken: number;
  /** TRAIL_STEP_M steps covered, planned regime only. */
  steps: number;
  driven: boolean;
  done: boolean;
  path: WorldPos[];
  rev: number;
}

/** How stale a cached forecast may get while nothing forecast-relevant changes. */
const FORECAST_REFRESH_TICKS = 30;

/** Reforms in force on day one of the scenario: the status quo the receipt compares against. */
function startReforms(state: SimState): string[] {
  const out: string[] = [];
  for (const id of [...profileReforms(state.costProfile), ...state.scenario.start.policies, ...state.scenario.start.tech]) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function buildSim(state: SimState, world: WorldSink | null, ground: GroundQuery | null, loaded: boolean): GameSim {
  const emit = world ? (e: WorldEdit) => void world.applyEdit(e) : null;
  const ctx: StepContext = {
    emit,
    forecast: false,
    benchmark: polandBenchmark,
    ground,
    evaluate: (st) => evaluateObjectives(st).map((o) => ({ id: o.id, title: o.title, status: o.status })),
  };
  const cache = new Map<string, ProjectCache>();
  const tunnels = new Map<string, TunnelCache>();
  const services = new Map<string, ServiceView>();
  let referenceRun: { run: DesignRun; polandPerKmCents: number } | null = null;
  let previews: { key: string; byId: Map<string, ReformPreview> } | null = null;
  // Tunnel paths are append-only within one life of the sim; a load or a restart starts a new revision.
  let rev = loaded ? 1_000_000 + state.tick : 1;

  function resetCaches(): void {
    cache.clear();
    tunnels.clear();
    services.clear();
    referenceRun = null;
    previews = null;
    clockMemo = null;
    rev++;
  }

  /** The scenario's reference plan under the rules of day one, run once. */
  function reference(): { run: DesignRun; polandPerKmCents: number } | null {
    const ref = state.scenario.reference;
    if (!ref) return null;
    if (!referenceRun) {
      const run = runDesign(state, ref.commands, ref.projectId, startReforms(state), 0, 1);
      // What Poland would pay for the sponsor's own route: the yardstick of the sponsor's figure, whatever the player draws.
      const poland = runDesign(state, polishRedrawCommands(run.project), ref.projectId, POLAND_PROFILE, 0, 1);
      const lengthKm = projectLengthM(run.project) / 1000;
      referenceRun = {
        run,
        polandPerKmCents: lengthKm > 0 ? Math.round(poland.costCents / lengthKm) : 0,
      };
    }
    return referenceRun;
  }

  /** True when a project stands on the route and station sites of the scenario's reference plan. */
  function onReferenceRoute(project: ProjectState, ref: ProjectState): boolean {
    if (project.waypoints.length !== ref.waypoints.length || project.stations.length !== ref.stations.length) return false;
    for (let i = 0; i < ref.waypoints.length; i++) {
      const a = project.waypoints[i];
      const b = ref.waypoints[i];
      if (Math.abs(a.x - b.x) > 0.01 || Math.abs(a.y - b.y) > 0.01 || Math.abs(a.z - b.z) > 0.01) return false;
    }
    for (let i = 0; i < ref.stations.length; i++) {
      const a = project.stations[i];
      const b = ref.stations[i];
      if (a.template !== b.template || Math.abs(a.chainageM - b.chainageM) > 1) return false;
    }
    return true;
  }

  /**
   * Time stands where price tags are read: at a gate (its card lists what the capital in hand buys) and under the
   * pause a reading panel sets (the reform screen, the design chooser). There the tags are forecast runs. Not
   * under an event card: it covers the screen, and a few dozen forecasts per card would be work nobody sees.
   */
  function timeStands(p: Profile): boolean {
    return state.speed === 0 || clockNow(p).hold === 'gate';
  }

  /** The clock of this instant, computed once however many views of one snapshot ask for it. */
  let clockMemo: { key: string; clock: ClockView } | null = null;
  function clockNow(p: Profile): ClockView {
    const key = `${state.version}|${state.tick}|${state.subTick}|${state.pendingEvents.length}|${state.reforms.length}`;
    if (clockMemo === null || clockMemo.key !== key) clockMemo = { key, clock: clockView(state, p) };
    return clockMemo.clock;
  }

  function designView(project: ProjectState, p: Profile, eac: Forecast, exact: boolean): DesignView {
    const flags = projectFlags(project, p);
    const tunnel = tunnelOf(project, flags);
    const box = stationBoxOf(flags);
    const lengthKm = projectLengthM(project) / 1000;
    const daysNow = eac.openTick - state.tick;
    const current = quickProject(state, project, state.reforms);
    const stationDays = Math.round(plannedStationDays(project, p, flags));
    const hasBoxStation = project.stations.some((s) => s.template === 'undergroundStandard');
    const options: DesignOptionView[] = [];
    for (const id of [...TUNNEL_OPTIONS, ...STATION_BOXES]) {
      const def = DESIGN_OPTIONS.find((o) => o.id === id);
      if (!def) throw new Error(`sim: design option "${id}" has no definition`);
      const selected = def.group === 'tunnel' ? tunnel === id : box === id;
      const locks = optionLocks(id, p);
      let costCents = eac.costCents;
      let deltaDays = 0;
      if (!selected && project.status !== 'open') {
        if (exact && project.frozen === null) {
          // Time stands and the player is reading the tags: each is the forecast of the project with that pick
          // made, under the reforms that unlock it. Choosing the option lands on the tag to the cent.
          const reforms = locks.length > 0 ? [...state.reforms, ...locks.filter((x) => !state.reforms.includes(x))] : state.reforms;
          const pick = def.group === 'tunnel' ? { tunnel: id as TunnelOptionId } : { stationBox: id as (typeof STATION_BOXES)[number] };
          const f = forecastWhatIf(state, project, reforms, [{ t: 'setDesign', projectId: project.id, ...pick }]);
          costCents = f.costCents;
          deltaDays = f.openTick - eac.openTick;
        } else {
          // The closed-form estimates give the ratio between two designs; the price tag is that ratio on the forecast
          // of record, so the tag of the current design is the number in the headline and on the receipt.
          const q = quickOption(state, project, id);
          costCents = current.costCents > 0 ? Math.round((eac.costCents * q.costCents) / current.costCents) : eac.costCents;
          deltaDays = Math.round(q.days - current.days);
        }
      }
      const deltaCents = costCents - eac.costCents;
      let headingDays: number | undefined;
      if (def.group === 'tunnel') {
        const method = TUNNEL_OPTION_METHOD[id as TunnelOptionId];
        const lockProfile = locks.length > 0 ? profileFor([...state.reforms, ...locks]) : p;
        const variant = {
          ...project,
          methods: project.methods.map((m) => (isUnderground(m) ? method : m)),
          tunnelChoice: id as TunnelOptionId,
        };
        headingDays = Math.round(plannedHeadingDays(variant, lockProfile, project.frozen ?? projectFlags(variant, lockProfile)));
      }
      options.push({
        group: def.group,
        id,
        label: def.label,
        description: def.description,
        practice: def.practice,
        selected,
        lockedBy: lockTitles(locks),
        costCents,
        costPerKmCents: lengthKm > 0 ? Math.round(costCents / lengthKm) : 0,
        deltaCents,
        daysToOpen: daysNow + deltaDays,
        deltaDays,
        evidence: def.evidence,
        ...(headingDays === undefined ? { applies: hasBoxStation } : { headingDays, stationDays }),
      });
    }
    return { tunnel, stationBox: box, frozen: project.frozen !== null || project.status === 'open', options };
  }

  function forecasts(project: ProjectState, p: Profile): ProjectCache {
    const hit = cache.get(project.id);
    const exact = project.status !== 'open' && project.frozen === null && timeStands(p);
    if (
      hit &&
      hit.version === state.version &&
      (project.status === 'open' ||
        (state.tick - hit.tick < FORECAST_REFRESH_TICKS && (hit.exact || !exact) && (!exact || hit.tick === state.tick)))
    )
      return hit;
    const eac = forecastProject(state, project);
    const start = state.scenario.start.date;
    const year = start.slice(0, 4);
    // Counterfactual runs of an open line never change: keep them.
    const keep = hit && project.status === 'open' && hit.poland.project.status === 'open' ? hit : null;
    const poland = keep ? keep.poland : polandRun(state, project);
    const ref = reference();
    const sqReforms = startReforms(state);
    let statusQuo: DesignRun;
    let statusQuoTick0 = 0;
    let statusQuoBasis: string;
    // The official plan is the status quo only on its own route. On a line the player drew, a column for another
    // route would put two lengths side by side in dollars (second playtest): there it is the player's route under
    // the rules of day one.
    const isMission = ref !== null && state.scenario.reference?.projectId === project.id;
    if (ref && isMission && onReferenceRoute(project, ref.run.project)) {
      statusQuo = ref.run;
      statusQuoBasis = `${state.scenario.reference?.title ?? 'The official plan'}, under the rules of ${year}`;
    } else {
      statusQuo = keep ? keep.statusQuo : designRun(state, project, sqReforms);
      statusQuoTick0 = project.approvedTick >= 0 ? project.approvedTick : state.tick;
      statusQuoBasis = `Your route and methods under the rules of ${year}`;
    }
    const tick0 = project.approvedTick >= 0 ? project.approvedTick : state.tick;
    const final = project.status === 'open';
    const flags = projectFlags(project, p);
    const tunnel = tunnelOf(project, flags);
    const tunnelLabel = tunnel === 'mixed' ? 'Mixed methods' : (DESIGN_OPTIONS.find((o) => o.id === tunnel)?.label ?? tunnel);
    // Every reform in force, the ones of day one included: the same count the reform screen shows.
    const inForce = state.reforms.length;
    const underground = project.methods.some((m) => isUnderground(m));
    const ghostInput = ref && isMission ? ghostOf(state.scenario, projectLengthM(ref.run.project) / 1000) : null;
    if (ghostInput && ref) ghostInput.polandPerKmCents = ref.polandPerKmCents;
    const receipt = buildReceipt(
      project.id,
      final,
      {
        yours: yoursColumn(
          `${tunnelLabel}, ${inForce} ${inForce === 1 ? 'reform' : 'reforms'} in force`,
          final,
          project,
          eac,
          { offPlanCents: project.offPlanCents, handDigCents: project.handDigCents },
          tick0,
        ),
        statusQuo: runColumn('statusQuo', statusQuoBasis, statusQuo, statusQuoTick0),
        poland: runColumn(
          'poland',
          underground
            ? 'This route and these stations as the Polish design (twin 6.6 m bores, compact boxes) at Polish prices and under Polish rules'
            : 'This route and these stations built in Poland: the same surface line at Polish prices and under Polish rules',
          poland,
          tick0,
        ),
      },
      ghostInput,
      new Set(state.reforms),
      start,
    );
    const live = projectRiders(state, project);
    const riders = final ? project.ridersPerDay : live.ridersPerDay;
    const scorecard = buildScorecard({
      receipt,
      ridersPerDay: riders,
      start,
      polandSource:
        'The model: this route as the Polish design at Polish prices, calibrated on the Warsaw metro extensions and the Lodz rail tunnel',
    });
    if ((state.scenario.housing?.length ?? 0) > 0) scorecard.housing = live.housing;
    const fresh: ProjectCache = {
      version: state.version,
      tick: state.tick,
      eac,
      poland,
      statusQuo,
      statusQuoTick0,
      statusQuoBasis,
      riders,
      receipt,
      scorecard,
      design: designView(project, p, eac, exact),
      stationOptions: stationOptions(project, eac, poland),
      exact,
    };
    cache.set(project.id, fresh);
    return fresh;
  }

  /** Price tags of the station types, anchored on the forecasts of record like the design tags. */
  function stationOptions(project: ProjectState, eac: Forecast, poland: DesignRun): StationOptionView[] {
    if (project.frozen !== null || project.status === 'open') return [];
    const quick = quickProject(state, project, state.reforms);
    const quickPl = estimateAlignment(state, { projectId: project.id, waypoints: project.waypoints, methods: project.methods });
    const scale = quick.costCents > 0 ? eac.costCents / quick.costCents : 1;
    const polandScale = quickPl.polandCostCents > 0 ? poland.costCents / quickPl.polandCostCents : 1;
    return STATION_TEMPLATES.map((template) => ({
      template,
      label: STATION_TEMPLATE_LABELS[template],
      note: STATION_TEMPLATE_NOTES[template],
      ...stationAdds(state, project, template, scale, polandScale),
    }));
  }

  /** As-built axis of a heading as points. The array is extended in place while the heading advances. */
  function tunnelPath(project: ProjectState, f: FrontState): TunnelCache {
    const done = f.chainageM >= f.toM;
    const d = f.drive;
    let c = tunnels.get(f.id);
    if (!c) {
      c = { taken: 0, steps: -1, driven: false, done: false, path: [], rev };
      tunnels.set(f.id, c);
    }
    const take = (flat: readonly number[]) => {
      if (!c) return;
      for (let i = c.taken; i + 2 < flat.length; i += 3) c.path.push({ x: flat[i], y: flat[i + 1], z: flat[i + 2] });
      c.taken = flat.length;
    };
    if (d) {
      // A heading taken over mid-run continues the planned trail it already has, point for point.
      c.driven = true;
      take(d.trail);
    } else {
      const steps = Math.floor((f.chainageM - f.fromM) / TRAIL_STEP_M + 1e-9);
      if (steps !== c.steps) {
        c.steps = steps;
        take(plannedTrail(project, f.fromM, f.chainageM));
      }
      if (done && !c.done) {
        const end = pointAt(project.waypoints, project.cum, f.toM);
        const last = c.path[c.path.length - 1];
        if (!last || (last.x - end.x) ** 2 + (last.y - end.y) ** 2 + (last.z - end.z) ** 2 > 1e-6) c.path.push(end);
      }
    }
    c.done = done;
    return c;
  }

  function pathLength(path: readonly WorldPos[]): number {
    let sum = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      sum += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
    }
    return sum;
  }

  function projectView(project: ProjectState, p: Profile, canAffordReform: boolean): ProjectView {
    const flags = projectFlags(project, p);
    const phaseIndex = PHASES.indexOf(project.phase);
    // A draft starts where the scenario's head start puts it: what is behind the real project is shown as done.
    const head = project.status === 'draft' ? state.scenario.start.headStart : undefined;
    const headIndex = head ? PHASES.indexOf(head.phase) : -1;
    const phases: PhaseView[] = PHASES.map((id: PhaseId, i) => {
      const done = project.status === 'open' || (project.status === 'active' && i < phaseIndex) || i < headIndex;
      const current = project.status === 'active' && i === phaseIndex;
      const progress = done ? 1 : current ? project.phaseProgress : head && i === headIndex ? head.progress : 0;
      const plannedDays = Math.round(
        id === 'construction' ? plannedConstructionDays(project, p, flags) : phaseDays(id, p, projectLengthM(project)),
      );
      const fixed = PHASE_GATES[id];
      const gate =
        fixed && id === 'utilities' && project.methods.length > 0 ? { ...fixed, label: launchLabel(project, flags).label } : fixed;
      return {
        id,
        label: PHASE_LABELS[id],
        state: done ? ('done' as const) : current ? ('current' as const) : ('todo' as const),
        progress,
        plannedDays,
        daysLeft: Math.round(plannedDays * (1 - progress)) + (current ? project.delayDays : 0),
        gate: gate ? { ...gate, ready: current && project.awaiting === gate.command } : null,
      };
    });
    const tbms = project.fronts.map((f) => tbmView(project, f, p, flags));
    const tunnelViews: TunnelEntity[] = [];
    for (const f of project.fronts) {
      if (f.boredM <= 0) continue;
      const c = tunnelPath(project, f);
      if (c.path.length < 2) continue;
      const shape = carveShape(f.method, flags);
      const pathM = pathLength(c.path);
      tunnelViews.push({
        id: `${f.id}/tunnel`,
        path: c.path,
        rev: c.rev,
        lining: liningOf(f.method),
        radiusM: shape.radiusM,
        laterals: shape.laterals,
        ringSpacingM: RING_M,
        ...tunnelProgress(project, f, pathM),
      });
    }
    const hasLine = project.methods.length > 0;
    const checks = checkAlignment(project.waypoints, hasLine ? project.methods : undefined);
    const date = dateAtTick(state.scenario.start.date, state.tick);
    const fc = hasLine ? forecasts(project, p) : null;
    const empty: Forecast = { costCents: 0, openTick: state.tick, spent: { ...project.spent }, paid: project.paid };
    const design: DesignView = fc
      ? fc.design
      : { tunnel: 'mixed', stationBox: stationBoxOf(flags), frozen: project.frozen !== null, options: [] };
    // The best design the player may pick right now that is cheaper than the current one.
    let cheaper: { label: string; savingCents: number } | null = null;
    if (!design.frozen) {
      for (const o of design.options) {
        if (o.selected || o.lockedBy.length > 0 || o.deltaCents >= -1e8) continue;
        if (!cheaper || -o.deltaCents > cheaper.savingCents) cheaper = { label: o.label, savingCents: -o.deltaCents };
      }
    }
    const receipt = fc ? fc.receipt : emptyReceipt(project.id, date);
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
      stations: hasLine ? project.stations.map((s) => stationView(project, s, flags)) : [],
      tbms,
      waypoints: project.waypoints.map((w) => ({ ...w })),
      spentCents: projectSpentCents(project),
      spentByCategory: { ...project.spent },
      escalationCents: project.escalationCents,
      comparison: comparison(state, project, fc ? fc.eac : empty, fc ? fc.poland : { costCents: 0, days: 0 }, fc ? fc.riders : 0),
      nextAction: projectNextAction(state, project, checks, cheaper, canAffordReform, flags),
      design,
      checks,
      alignment: alignmentView(project, checks, state.version),
      tunnels: tunnelViews,
      pits: hasLine ? pitViews(project, flags) : [],
      receipt,
      stationOptions: fc ? fc.stationOptions : [],
      scorecard: fc
        ? fc.scorecard
        : buildScorecard({
            receipt,
            ridersPerDay: 0,
            start: state.scenario.start.date,
            polandSource: 'no alignment yet',
          }),
    };
  }

  /** What each reform not yet enacted would change for the mission project, from the closed-form estimate. */
  function reformPreviews(project: ProjectState | null, view: ProjectView | undefined, p: Profile): Map<string, ReformPreview> {
    // With time standing (the reform screen pauses the game) each preview is a forecast run: what enacting does, to the cent.
    const exact = project !== null && project.status !== 'open' && timeStands(p);
    const key = `${state.version}/${exact ? `x${state.tick}` : Math.floor(state.tick / FORECAST_REFRESH_TICKS)}/${project?.id ?? ''}`;
    if (previews && previews.key === key) return previews.byId;
    const byId = new Map<string, ReformPreview>();
    if (project && view && project.status !== 'open' && project.methods.length > 0) {
      const before = quickProject(state, project, state.reforms);
      const lengthKm = view.lengthM / 1000;
      const polandPerKm = view.receipt.columns.poland.costPerKmCents;
      const yours = view.receipt.columns.yours.costCents;
      const own = contractProfile(project, p);
      const flags = projectFlags(project, own);
      const now = exact ? forecastProject(state, project) : null;
      for (const r of REFORMS) {
        if (state.reforms.includes(r.id)) continue;
        // The reform that allows the twin bore also picks it while the design is open: the preview is of both.
        const picks = project.frozen === null && project.methods.some(isUnderground) ? reformSelects(r.id) : null;
        let costDeltaCents: number;
        let daysDelta: number;
        if (now) {
          const pick: GameCommand[] = picks ? [{ t: 'setDesign', projectId: project.id, tunnel: picks }] : [];
          const after = forecastWhatIf(state, project, [...state.reforms, r.id], pick);
          costDeltaCents = after.costCents - now.costCents;
          daysDelta = after.openTick - now.openTick;
        } else {
          // quickOption prices a design option under the reforms that unlock it: here, this reform.
          const after = picks ? quickOption(state, project, picks) : quickProject(state, project, [...state.reforms, r.id]);
          // The closed form gives the ratio; applied to the forecast of record it lands close to what enacting does.
          costDeltaCents = before.costCents > 0 ? Math.round((yours * (after.costCents - before.costCents)) / before.costCents) : 0;
          daysDelta = Math.round(after.days - before.days);
        }
        const perKm = lengthKm > 0 ? Math.round(((now ? now.costCents : yours) + costDeltaCents) / lengthKm) : 0;
        byId.set(r.id, {
          projectId: project.id,
          costDeltaCents,
          daysDelta,
          costPerKmAfterCents: perKm,
          ratioToPolandAfter: polandPerKm > 0 ? perKm / polandPerKm : 1,
          notes: reformNotes(state, project, r, own, flags),
          exact: now !== null,
        });
      }
    }
    previews = { key, byId };
    return byId;
  }

  function snapshot(): GameSnapshot {
    const p = profileFor(state.reforms);
    const enacted = new Set(state.reforms);
    const reformStatus = REFORMS.map((r) => {
      // No reform has a prerequisite: one that is not enacted is available, and only its price can stand in the way.
      const status: ReformView['status'] = enacted.has(r.id) ? 'enacted' : 'available';
      const blockedReason =
        status === 'available' && state.politicalCapital < r.cost.pc
          ? `Costs ${r.cost.pc} political capital, you have ${state.politicalCapital}`
          : null;
      return { r, status, blockedReason, affordable: status === 'available' && blockedReason === null };
    });
    const canAffordReform = reformStatus.some((x) => x.affordable);
    const projects = state.projects.map((pr) => projectView(pr, p, canAffordReform));
    const mission = missionProject(state);
    const missionView = mission ? projects.find((v) => v.id === mission.id) : undefined;
    const preview = reformPreviews(mission, missionView, p);
    const reforms: ReformView[] = reformStatus.map(({ r, status, blockedReason, affordable }) => ({
      id: r.id,
      branch: r.branch,
      title: r.title,
      description: r.description,
      evidence: r.evidence,
      cost: { ...r.cost },
      prereqs: [...r.prereqs],
      effects: r.effects.map((e) => ({ ...e })),
      beyondPoland: r.beyondPoland,
      status,
      affordable,
      blockedReason,
      preview: status === 'enacted' ? null : (preview.get(r.id) ?? null),
      receiptLines: reformReceiptLines(r.id),
      unlocks: reformUnlocks(r.id),
    }));
    const events: EventView[] = state.pendingEvents.map((pe) => {
      const def = eventById(pe.defId);
      if (!def) throw new Error(`sim: pending event ${pe.uid} has unknown card "${pe.defId}"`);
      const project = state.projects.find((pr) => pr.id === pe.projectId);
      const hard = project ? project.hardEstimateCents : 0;
      // A cash call raises what the project still needs; the card says how much and what each way of raising it costs.
      const raised = def.id === 'cashCall' && project ? cashCallCents(state, project, p) : 0;
      return {
        uid: pe.uid,
        id: def.id,
        title: eventTitle(def, project?.eventCounts[def.id] ?? 1),
        description:
          raised > 0 ? `${def.description} The project is short by about $${(raised / 1e11).toFixed(2)} billion.` : def.description,
        evidence: def.evidence,
        projectId: pe.projectId,
        deadlineTick: pe.deadlineTick,
        defaultOption: def.defaultOption,
        options: def.options.map((o) => ({
          id: o.id,
          label: o.label,
          // Rounded the way the engine charges it, so the card and the ledger agree to the cent.
          costCents: Math.round(Math.round(hard * o.hardShare) * state.escalation) + Math.round(raised * (o.feeShare ?? 0)),
          ...(raised > 0 ? { gainCents: raised } : {}),
          delayDays: def.id === 'lawsuit' ? Math.min(o.delayDays, p['event.lawsuit.delayCapDays']) : o.delayDays,
          pc: o.pc,
          affordable: state.politicalCapital >= o.pc,
        })),
      };
    });
    let totalSpent = 0;
    for (const cat of LEDGER_CATEGORIES) totalSpent += state.ledger.total[cat];
    let riders = 0;
    for (const pr of state.projects) if (pr.status === 'open') riders += pr.ridersPerDay;
    // The running HUD number: the mission project's cost per route-km against Poland's, from its receipt.
    const headline: HeadlineView | null =
      missionView && missionView.lengthM > 0
        ? {
            projectId: missionView.id,
            yoursPerKmCents: missionView.receipt.columns.yours.costPerKmCents,
            polandPerKmCents: missionView.receipt.columns.poland.costPerKmCents,
            ratio: missionView.receipt.ratios.yoursToPoland,
            final: missionView.status === 'open',
          }
        : null;
    const complete = state.missionCompleteTick >= 0;
    const missionOut: MissionView = {
      id: state.scenario.id,
      title: state.scenario.title,
      freeBuild: state.scenario.sandbox === true,
      stage: missionStage(mission),
      projectId: mission ? mission.id : null,
      planProjectId: planProjectId(state),
      complete,
      result: complete && missionView ? missionResult(missionView.scorecard) : null,
      targets: missionTargets(state, mission),
    };
    const serviceViews: ServiceView[] = [];
    for (const pr of state.projects) {
      if (pr.status !== 'open') continue;
      let sv = services.get(pr.id);
      if (!sv) {
        const made = serviceView(pr);
        if (!made) continue;
        sv = made;
        services.set(pr.id, sv);
      }
      serviceViews.push(sv);
    }
    const nextAction: NextAction = gameNextAction(state, mission, missionView ? missionView.nextAction : null);
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
      projects,
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
        raisedCents: state.cashRaisedCents ?? 0,
      },
      reforms,
      events,
      objectives: evaluateObjectives(state),
      ridersPerDay: riders,
      notices: state.notices.map((n) => ({ ...n })),
      headline,
      clock: clockNow(p),
      mission: missionOut,
      nextAction:
        state.pendingEvents.length > 0 && missionView
          ? {
              ...nextAction,
              kind: 'resolveEvent',
              focus: 'event',
              command: null,
              hint: 'Pick an option on the card.',
            }
          : nextAction,
      services: serviceViews,
      feed: state.feed.slice(-FEED_LENGTH).map((f) => ({ ...f })),
      handDig: {
        volumeM3: state.handDig.volumeM3,
        cents: state.handDig.cents,
        centsPerM3: Math.round(handDigCentsPerM3(p) * state.escalation),
      },
      socialPosts: (state.socialPosts ?? []).map((post) => ({ ...post })),
      housing: housingViews(state),
    };
  }

  const sim: GameSim = {
    state,
    dispatch(commands) {
      // Validate the whole batch before touching state, so a malformed command cannot leave it half applied.
      const parsed = commands.map(parseCommand);
      for (const cmd of parsed) {
        applyCommand(state, cmd, ctx);
        if (cmd.t === 'startScenario') resetCaches();
      }
    },
    step(commands) {
      if (commands && commands.length > 0) sim.dispatch(commands);
      // A day is SUBSTEPS_PER_DAY sub-steps. With no driven heading and no open sub-step they are all empty, so the day is advanced in one go.
      if (state.subTick === 0 && !hasDrivenHeading(state)) advanceDay(state, ctx);
      else for (let i = 0; i < SUBSTEPS_PER_DAY; i++) advanceSubstep(state, ctx);
    },
    substep(commands) {
      if (commands && commands.length > 0) sim.dispatch(commands);
      advanceSubstep(state, ctx);
    },
    estimateAlignment(req: AlignmentEstimateRequest): AlignmentEstimate {
      const est = estimateAlignment(state, req);
      // A line that is already a project has a forecast of record (the headline, the receipt). The closed form is
      // anchored on it, so the plan tool, the headline and the receipt show one number for the same line, and a
      // drag moves that number by what the closed form says the change is worth.
      const project = req.projectId === undefined ? undefined : state.projects.find((x) => x.id === req.projectId);
      if (!project || project.methods.length === 0 || project.status === 'open') return est;
      const fc = forecasts(project, profileFor(state.reforms));
      const base = estimateAlignment(state, { projectId: project.id, waypoints: project.waypoints, methods: project.methods });
      if (!(base.costCents > 0) || !(base.polandCostCents > 0) || !(est.lengthKm > 0)) return est;
      const costCents = Math.round((est.costCents * fc.eac.costCents) / base.costCents);
      const polandCostCents = Math.round((est.polandCostCents * fc.poland.costCents) / base.polandCostCents);
      const daysToOpen = Math.max(0, Math.round(est.daysToOpen + (fc.eac.openTick - state.tick) - base.daysToOpen));
      return {
        ...est,
        costCents,
        costPerKmCents: Math.round(costCents / est.lengthKm),
        polandCostCents,
        polandCostPerKmCents: Math.round(polandCostCents / est.lengthKm),
        ratioToPoland: polandCostCents > 0 ? costCents / polandCostCents : 1,
        daysToOpen,
        openDate: dateAtTick(state.scenario.start.date, state.tick + daysToOpen),
      };
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
    clock() {
      return clockView(state, profileFor(state.reforms));
    },
    serialize() {
      return JSON.parse(JSON.stringify(state)) as SimState;
    },
    hash() {
      return hashState(state);
    },
    save(opts = {}) {
      const o: SaveOptions = typeof opts === 'string' ? { worldDataVersion: opts } : opts;
      const file: SaveFile = {
        format: 'bayvox-save',
        schemaVersion: SCHEMA_VERSION,
        worldDataVersion: o.worldDataVersion ?? 'unversioned',
        scenarioId: state.scenario.id,
        seed: state.seed,
        tick: state.tick,
        sim: sim.serialize(),
        edits: [],
        stateHash: sim.hash(),
      };
      if (o.editLog) file.editLog = { ...o.editLog };
      return file;
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
  return buildSim(initState(own, seed, opts), world, opts.ground ?? null, false);
}

/**
 * Version 1 (round 1) to version 2: adds sub-steps, the driven-regime fields of headings, design choices,
 * the feed and the hand-dig totals with the values a round 1 game had implicitly.
 */
function migrateV1(save: SaveFile): SaveFile {
  const old = JSON.parse(JSON.stringify(save.sim)) as SimState;
  // The recorded hash covers the version 1 state, so it is checked before anything is added.
  const hash = hashState(old);
  if (hash !== save.stateHash) throw new Error(`sim: save is corrupt: state hash ${hash} does not match recorded ${save.stateHash}`);
  old.schemaVersion = 2;
  old.subTick = 0;
  old.feed = [];
  old.nextFeedSeq = 1;
  old.handDig = { volumeM3: 0, cents: 0 };
  old.objectiveStatus = {};
  old.missionCompleteTick = -1;
  old.cashShort = old.cashCents < 0;
  for (const project of old.projects) {
    project.tunnelChoice = null;
    project.stationBox = null;
    project.offPlanCents = 0;
    project.handDigCents = 0;
    project.handDigM3 = 0;
    // Round 1 kept no paid ledger: rebuild it from the books at today's profile and the mean price index since approval.
    project.paid = { civil: 0, stations: 0, systems: 0, steps: [0, 0, 0, 0, 0, 0, 0, 0] };
    const index = (old.escalation + (project.approvedTick >= 0 ? project.approvedEscalation : old.escalation)) / 2;
    for (const cat of ['civil', 'stations', 'systems'] as const) {
      // The reform ids of a version 1 save are renamed by the next migration; the profile is read through the same table.
      if (project.spent[cat] > 0) addPaid(project.paid, profileFor(migrateReformIds(old.reforms)), cat, project.spent[cat] / index);
    }
    for (const s of project.stations) {
      // Round 1 carved a box in one go when its structure was complete.
      const dug = s.progress >= 1 && project.frozen && (s.template === 'undergroundStandard' || s.template === 'undergroundDeepMined');
      s.carvedM = dug && project.frozen ? stationSize(s.template, stationBoxOf(project.frozen)).lengthM / 2 : 0;
    }
    for (const f of project.fronts) {
      f.downReason = f.downDays > 0 ? 'breakdown' : null;
      f.boredM = f.chainageM - f.fromM;
      f.breakthroughTick = f.chainageM >= f.toM ? old.tick : -1;
      f.drive = null;
    }
  }
  return { ...save, schemaVersion: 2, sim: old, stateHash: hashState(old) };
}

/**
 * Version 2 to version 3: the 32 reforms of M2 became 12 (reforms.ts REFORM_MIGRATION). The enacted reforms and
 * the start reforms of the scenario inside the state are renamed to the ones that absorbed them. An id nobody
 * absorbed fails the load. Money and capital already spent stay spent.
 */
function migrateV2(save: SaveFile): SaveFile {
  const old = JSON.parse(JSON.stringify(save.sim)) as SimState;
  const hash = hashState(old);
  if (hash !== save.stateHash) throw new Error(`sim: save is corrupt: state hash ${hash} does not match recorded ${save.stateHash}`);
  old.schemaVersion = 3;
  old.reforms = migrateReformIds(old.reforms);
  old.scenario.start.policies = migrateReformIds(old.scenario.start.policies);
  old.scenario.start.tech = migrateReformIds(old.scenario.start.tech);
  return { ...save, schemaVersion: 3, sim: old, stateHash: hashState(old) };
}

/** Save migrations by source schemaVersion. */
const MIGRATIONS: Record<number, (save: SaveFile) => SaveFile> = { 1: migrateV1, 2: migrateV2 };

/**
 * Restores a sim from a save and replays the carve edits of all construction so far into `world`.
 * Fails loudly on an unknown version or a state that does not match its hash; there is no best-effort load.
 * `opts.ground` is the same ground query createSim takes; cost profile and events come from the save.
 */
export function loadSim(save: SaveFile, world: WorldSink | null = null, opts: Pick<SimOptions, 'ground'> = {}): GameSim {
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
  const sim = buildSim(state, world, opts.ground ?? null, true);
  if (world) replayCarves(state, (e) => void world.applyEdit(e));
  return sim;
}

/** Card definitions, for a UI codex. */
export const EVENT_CARDS = EVENTS;
