/**
 * Round 2 snapshot views that are pure functions of the state: clock, mission, next action, pits, stations,
 * headings and services. sim.ts adds what needs a forecast (receipt, scorecard, design prices, reform previews).
 */
import type { AlignmentEntity, LaunchPitEntity, StationEntity, WorldPos } from '@bayvox/core';
import { minRadiusFor } from './checks.ts';
import { CONSTANTS as K } from './constants.ts';
import { hasBox, stationBoxOf, stationSize } from './design.ts';
import { isRecovering, planPointAt } from './drive.ts';
import { freeDeviationM, isDrivable, offPlanFactor } from './engine.ts';
import { plannedConstructionDays, plannedHeadingDays, plannedStationDays } from './estimate.ts';
import { chainages, nearestChainage, planDistance, pointAt, segmentIndexAt, subPath } from './geometry.ts';
import {
  advanceRate,
  carveShape,
  effectiveMethod,
  GEOLOGY,
  headingSpans,
  isTbm,
  isUnderground,
  PHASE_LABELS,
  phaseDays,
  projectFlags,
} from './model.ts';
import { type Profile, profileFor, type ReformDef } from './reforms.ts';
import { serviceCycleS } from './trains.ts';
import {
  type AlignmentChecks,
  type ClockView,
  type DesignFlags,
  type FrontState,
  type GameCommand,
  type Method,
  type MissionStage,
  type MissionTarget,
  type NextAction,
  type ObjectiveDef,
  PHASES,
  type PhaseId,
  type ProjectState,
  type ScenarioDef,
  type ServiceView,
  type SimState,
  type StationState,
  type StationTemplate,
  type StationView,
  type TbmView,
} from './types.ts';

const MAX_GRADE_PCT = K.maxGradePct.value;
const CORRIDOR = K.driveCorridorM.value;
const DRIVE_DAYS_PER_SECOND = K.driveGameHoursPerSecond.value / 24;
const FACE_MPS = K.driveFaceMetresPerSecond.value;
const BUILD_SECONDS = K.buildTargetSeconds.value;
const LAPSE_SECONDS = K.lapseTargetSeconds.value;
const LAPSE_MIN = K.lapseMinDaysPerSecond.value;
/** Days per second once a line is open and nothing else is in hand: the pace of the old debug driver. */
const OPEN_DAYS_PER_SECOND = 2;
/** Shield and trailing gear: lining starts this far behind the face, the works track a little further back. */
const SHIELD_M = 12;
const WORKS_TRACK_LAG_M = 40;

// ---------------------------------------------------------------- headings

const HEADING_STYLE: Record<Method, 'ring' | 'arch' | 'box' | 'none'> = {
  boredTwin: 'ring',
  boredSingleLarge: 'ring',
  mined: 'arch',
  cutAndCover: 'box',
  atGrade: 'none',
  viaduct: 'none',
};

export function liningOf(method: Method): 'ring' | 'arch' | 'box' | 'none' {
  return HEADING_STYLE[method];
}

export function tbmView(project: ProjectState, f: FrontState, p: Profile, flags: DesignFlags): TbmView {
  const done = f.chainageM >= f.toM;
  const d = f.drive;
  const seg = segmentIndexAt(project.cum, Math.min(f.chainageM, f.toM - 1e-9));
  // The ground class of the plan where the face is: what the heading is priced and paced on, driven or not.
  const geology = project.waypoints[seg].geology ?? 'softGround';
  const maxRate = advanceRate(f.method, geology, p, f.boredM);
  const shape = carveShape(f.method, flags);
  let stopReason: TbmView['stopReason'] = null;
  if (!done) {
    if (f.downDays > 0) stopReason = f.downReason === 'event' ? 'event' : 'breakdown';
    else if (project.delayDays > 0) stopReason = 'projectDelay';
    else if (d && !d.autopilot && d.thrust <= 0) stopReason = 'zeroThrust';
    // Held at the corridor edge while the shield re-steers in place. Once the cruise law bores it back, it runs.
    else if (d?.blocked && !isRecovering(d, minRadiusFor(f.method))) stopReason = 'corridor';
  }
  const running = !done && stopReason === null;
  const thrust = running ? (d && !d.autopilot ? d.thrust : 1) : 0;
  let position: WorldPos;
  let yaw: number;
  let pitch: number;
  let gradePct: number;
  if (d) {
    position = { x: d.x, y: d.y, z: d.z };
    yaw = Math.atan2(d.dirX, d.dirZ);
    pitch = Math.atan(d.grade);
    gradePct = d.grade * 100;
  } else {
    // Planned regime: the machine axis is the alignment segment it stands on.
    const at = planPointAt(project.waypoints, project.cum, Math.min(f.chainageM, f.toM));
    const a = project.waypoints[seg];
    const b = project.waypoints[seg + 1];
    position = pointAt(project.waypoints, project.cum, f.chainageM);
    yaw = Math.atan2(b.x - a.x, b.z - a.z);
    pitch = Math.atan(at.grade);
    gradePct = at.grade * 100;
  }
  const lateralM = d ? d.lateralM : 0;
  const verticalM = d ? d.verticalM : 0;
  // The tolerance widens through a bend (the plan is a polygon, the machine turns on a radius): the readout
  // says what it is here, so "costs extra" at 4.8 m and not at 6.1 m is explained by the number beside it.
  const freeM = freeDeviationM(project.waypoints, project.cum, d ? d.planM : f.chainageM, minRadiusFor(f.method));
  const surchargePct = d?.offPlan ? Math.round((offPlanFactor(d, freeM) - 1) * 100) : 0;
  return {
    id: f.id,
    name: f.name,
    method: f.method,
    position,
    yaw,
    pitch,
    radiusM: shape.radiusM,
    laterals: shape.laterals,
    status: done ? 'done' : running ? 'running' : 'stopped',
    thrust,
    chainageM: f.chainageM,
    fromM: f.fromM,
    toM: f.toM,
    progress: f.toM > f.fromM ? (f.chainageM - f.fromM) / (f.toM - f.fromM) : 1,
    rateMPerDay: running ? maxRate * thrust : 0,
    maxRateMPerDay: maxRate,
    driven: d !== null,
    autopilot: d ? d.autopilot : true,
    steer: d && !d.autopilot ? d.steer : 0,
    pitchInput: d && !d.autopilot ? d.pitch : 0,
    gradePct,
    deviation: {
      lateralM,
      verticalM,
      totalM: Math.sqrt(lateralM * lateralM + verticalM * verticalM),
      planChainageM: f.chainageM,
      limitM: CORRIDOR,
      offPlan: d ? d.offPlan : false,
      freeM,
      surchargePct,
    },
    geology,
    geologyLabel: GEOLOGY[geology].label,
    limits: { minRadiusM: minRadiusFor(f.method), maxGradePct: MAX_GRADE_PCT },
    boredM: f.boredM,
    stopReason,
    downDays: f.downDays,
    breakthroughTick: f.breakthroughTick,
    tunnelId: `${f.id}/tunnel`,
    pitId: `${f.id}/pit`,
  };
}

/** Metres of a finished or advancing tunnel that carry lining and track. */
export function tunnelProgress(project: ProjectState, f: FrontState, pathM: number): { linedM: number; trackM: number } {
  const done = f.chainageM >= f.toM;
  const linedM = done ? pathM : Math.max(0, Math.min(pathM, f.boredM - SHIELD_M));
  let trackM = Math.max(0, linedM - WORKS_TRACK_LAG_M);
  if (done) trackM = Math.max(trackM, pathM - WORKS_TRACK_LAG_M);
  if (project.status === 'open' || project.phase === 'fitOut') trackM = pathM;
  return { linedM, trackM: Math.max(0, Math.min(pathM, trackM)) };
}

/** Heading runs a project will be built in: one per run of segments with the same effective method. */
export function headingRuns(project: ProjectState, flags: DesignFlags): { id: string; method: Method; fromM: number }[] {
  if (project.fronts.length > 0) return project.fronts.map((f) => ({ id: f.id, method: f.method, fromM: f.fromM }));
  return headingSpans(project, flags).map((span, i) => ({ id: `${project.id}/f${i + 1}`, method: span.method, fromM: span.fromM }));
}

/**
 * What the launch gate starts, in the words of the button: a boring machine, a mined heading, or surface works.
 * The first playtest had "Launch the TBM" on a mined cavern and on a track gang.
 */
export function launchLabel(project: ProjectState, flags: DesignFlags): { label: string; verb: string; what: string } {
  const runs = headingRuns(project, flags);
  if (runs.some((r) => isTbm(r.method))) return { label: 'Launch the TBM', verb: 'Launch', what: 'the machine' };
  if (runs.some((r) => r.method === 'mined')) return { label: 'Start mining', verb: 'Start', what: 'the mined heading' };
  return { label: 'Start construction', verb: 'Start', what: 'the works' };
}

/** Launch pits of the underground headings of an approved project. Surface headings need none. */
export function pitViews(project: ProjectState, flags: DesignFlags): LaunchPitEntity[] {
  if (project.status === 'draft') return [];
  const state: LaunchPitEntity['state'] = project.fronts.length > 0 ? 'launched' : project.awaiting === 'launchTBM' ? 'ready' : 'planned';
  const lengthM = K.launchPitLengthM.value;
  const out: LaunchPitEntity[] = [];
  for (const run of headingRuns(project, flags)) {
    if (!isUnderground(run.method)) continue;
    const shape = carveShape(run.method, flags);
    const at = planPointAt(project.waypoints, project.cum, run.fromM);
    let span = 0;
    for (const l of shape.laterals) span = Math.max(span, Math.abs(l));
    out.push({
      id: `${run.id}/pit`,
      tbmId: run.id,
      // The face starts at the head of the run; the pit lies behind it, under the shield and the gantries.
      position: { x: at.x - (at.dirX * lengthM) / 2, y: at.y - shape.radiusM, z: at.z - (at.dirZ * lengthM) / 2 },
      yaw: Math.atan2(at.dirX, at.dirZ),
      lengthM,
      widthM: 2 * (span + shape.radiusM) + 2,
      state,
    });
  }
  return out;
}

// ---------------------------------------------------------------- stations

const STYLE: Record<StationState['template'], StationEntity['style']> = {
  undergroundStandard: 'compactBox',
  undergroundDeepMined: 'minedCavern',
  terminalFitOut: 'terminal',
  inBore: 'inBore',
  surface: 'surface',
  elevated: 'elevated',
};

export function stationView(project: ProjectState, s: StationState, flags: DesignFlags): StationView {
  const box = stationBoxOf(flags);
  const size = stationSize(s.template, box);
  const at = planPointAt(project.waypoints, project.cum, s.chainageM);
  const open = project.status === 'open';
  const fitOut = open || project.awaiting === 'openLine' ? 1 : project.phase === 'fitOut' ? project.systemsProgress : 0;
  return {
    id: s.id,
    name: s.name,
    template: s.template,
    box: hasBox(s.template) ? box : null,
    chainageM: s.chainageM,
    depthM: s.depthM,
    position: { x: at.x, y: at.y, z: at.z },
    yaw: Math.atan2(at.dirX, at.dirZ),
    style: hasBox(s.template) ? box : STYLE[s.template],
    lengthM: size.lengthM,
    widthM: size.widthM,
    heightM: size.heightM,
    progress: s.progress,
    fitOut,
    open,
  };
}

export function alignmentView(project: ProjectState, checks: AlignmentChecks, rev: number): AlignmentEntity {
  const state =
    project.status === 'open' ? 'open' : project.status === 'draft' ? 'draft' : project.fronts.length > 0 ? 'building' : 'approved';
  return {
    id: `${project.id}/alignment`,
    points: project.waypoints.map((w) => ({ x: w.x, y: w.y, z: w.z })),
    rev,
    state,
    segmentIssues: checks.segmentIssues,
    vertexIssues: checks.vertexIssues,
  };
}

// ---------------------------------------------------------------- services

/** Track centreline as built: driven headings contribute their own axis, the rest the planned alignment. */
export function builtAxis(project: ProjectState): WorldPos[] {
  const out: WorldPos[] = [];
  const push = (p: WorldPos) => {
    const last = out[out.length - 1];
    if (!last || (last.x - p.x) ** 2 + (last.y - p.y) ** 2 + (last.z - p.z) ** 2 > 1e-6) out.push({ x: p.x, y: p.y, z: p.z });
  };
  if (project.fronts.length === 0) {
    for (const w of project.waypoints) push(w);
    return out;
  }
  for (const f of project.fronts) {
    const d = f.drive;
    if (d) for (let i = 0; i + 2 < d.trail.length; i += 3) push({ x: d.trail[i], y: d.trail[i + 1], z: d.trail[i + 2] });
    else for (const p of subPath(project.waypoints, project.cum, f.fromM, f.toM)) push(p);
  }
  return out;
}

/** The shuttle service of an open line, or null when it has fewer than two stations. */
export function serviceView(project: ProjectState): ServiceView | null {
  if (project.status !== 'open' || project.stations.length < 2) return null;
  const axis = builtAxis(project);
  if (axis.length < 2) return null;
  const cum = chainages(axis);
  const raw = project.stations
    .map((s) => {
      const at = pointAt(project.waypoints, project.cum, s.chainageM);
      return { stationId: s.id, name: s.name, chainageM: nearestChainage(axis, cum, at.x, at.z).chainageM };
    })
    .sort((a, b) => a.chainageM - b.chainageM);
  const first = raw[0].chainageM;
  const last = raw[raw.length - 1].chainageM;
  if (!(last - first > 1)) return null;
  const path = subPath(axis, cum, first, last);
  const lengthM = last - first;
  const cruiseMps = K.trainCruiseMps.value;
  const dwellS = K.trainDwellS.value;
  return {
    id: `${project.id}/service`,
    projectId: project.id,
    name: project.name,
    path,
    lengthM,
    stops: raw.map((s) => ({ ...s, chainageM: s.chainageM - first })),
    trains: Math.max(1, Math.min(8, Math.ceil(lengthM / K.trainSpacingM.value))),
    cycleS: serviceCycleS(lengthM, raw.length, cruiseMps, dwellS),
    cruiseMps,
    dwellS,
    cars: K.trainCars.value,
    carLengthM: K.trainCarLengthM.value,
    ridersPerDay: project.ridersPerDay,
  };
}

// ---------------------------------------------------------------- clock

/**
 * Real-time pace of a driven heading: the contract's game hours per second, sped up for slow headings.
 * The start-up metres of a machine are slow in game days, not on screen: the pace is set from the rate the
 * machine has in soft ground where it stands, so the face moves at FACE_MPS from the first ring on and only
 * the ground (mud slower, rock faster) changes what the driver sees.
 */
function driveDaysPerSecond(method: Method, p: Profile, boredM: number): number {
  const nominal = advanceRate(method, 'softGround', p, boredM);
  return Math.max(DRIVE_DAYS_PER_SECOND, FACE_MPS / nominal);
}

export function clockView(state: SimState, p: Profile): ClockView {
  let hold: ClockView['hold'] = null;
  if (state.pendingEvents.length > 0) hold = 'event';
  let drive = Number.POSITIVE_INFINITY;
  let build = 0;
  let lapse = 0;
  let open = false;
  for (const project of state.projects) {
    if (project.status === 'open') open = true;
    if (project.status !== 'active') continue;
    if (project.awaiting) {
      if (hold === null) hold = 'gate';
      continue;
    }
    const flags = projectFlags(project, p);
    if (project.phase !== 'construction') {
      lapse = Math.max(lapse, phaseDays(project.phase, p, project.cum[project.cum.length - 1]) / LAPSE_SECONDS);
      continue;
    }
    let running = false;
    let driven = false;
    if (project.delayDays === 0) {
      for (const f of project.fronts) {
        if (f.chainageM >= f.toM || f.downDays > 0) continue;
        running = true;
        if (f.drive) {
          driven = true;
          drive = Math.min(drive, driveDaysPerSecond(f.method, p, f.boredM));
        }
      }
    }
    if (driven) continue;
    if (running) build = Math.max(build, DRIVE_DAYS_PER_SECOND, plannedHeadingDays(project, p, flags) / BUILD_SECONDS);
    // Standstill, or only the station boxes are left: nothing to watch, so it runs as a time-lapse.
    else
      lapse = Math.max(
        lapse,
        plannedConstructionDays(project, p, flags) / LAPSE_SECONDS,
        plannedStationDays(project, p, flags) / LAPSE_SECONDS,
      );
  }
  let mode: ClockView['mode'] = 'idle';
  // Nothing in hand: the calendar stands while the player draws. Once a line is open it ticks on slowly.
  let daysPerSecond = open ? OPEN_DAYS_PER_SECOND : 0;
  if (Number.isFinite(drive)) {
    mode = 'drive';
    daysPerSecond = drive;
  } else if (build > 0) {
    mode = 'build';
    daysPerSecond = build;
  } else if (lapse > 0) {
    mode = 'lapse';
    daysPerSecond = Math.max(LAPSE_MIN, lapse);
  }
  return { mode, daysPerSecond, subTick: state.subTick, hold };
}

// ---------------------------------------------------------------- mission and next action

export function missionProject(state: SimState): ProjectState | null {
  const planId = planProjectId(state);
  return state.projects.find((p) => p.id === planId) ?? state.projects[0] ?? null;
}

export function planProjectId(state: SimState): string {
  return state.scenario.reference?.projectId ?? 'line';
}

export function missionStage(project: ProjectState | null): MissionStage {
  if (!project || project.status === 'draft') return 'plan';
  if (project.status === 'open') return 'done';
  // At the launch gate the approvals are behind the player: the stepper shows the build.
  if (project.phase === 'construction' || project.awaiting === 'launchTBM') return 'build';
  if (project.phase === 'fitOut') return 'open';
  return 'approvals';
}

type ConnectDef = Extract<ObjectiveDef, { kind: 'connect' }>;

function requiredConnects(state: SimState): ConnectDef[] {
  return state.scenario.objectives.filter((o): o is ConnectDef => o.kind === 'connect' && o.stretch !== true);
}

/** First end point of a required connect objective that has no station of `project` within reach, or null. */
function missingStationEnd(state: SimState, project: ProjectState): { name: string; radiusM: number } | null {
  for (const o of requiredConnects(state)) {
    for (const end of [o.a, o.b]) {
      let near = false;
      for (const s of project.stations) {
        const at = pointAt(project.waypoints, project.cum, s.chainageM);
        if (planDistance(at.x, at.z, end.x, end.z) <= o.radiusM) near = true;
      }
      if (!near) return { name: end.name, radiusM: o.radiusM };
    }
  }
  return null;
}

function action(
  kind: NextAction['kind'],
  projectId: string | null,
  objective: string,
  hint: string,
  focus: NextAction['focus'],
  command: GameCommand | null = null,
): NextAction {
  return { kind, projectId, objective, hint, command, focus };
}

const PHASE_GOAL = {
  planning: 'through environmental review',
  permitting: 'through permits and the funding agreement',
  procurement: 'through procurement',
  utilities: 'through utility relocation',
  construction: 'built',
  fitOut: 'fitted out and tested',
} as const;

/** What the player must do next on a project. `cheaper` is the best unlocked design saving, if any, for the approval hint. */
export function projectNextAction(
  state: SimState,
  project: ProjectState,
  checks: AlignmentChecks,
  cheaper: { label: string; savingCents: number } | null,
  canAffordReform: boolean,
  flags: DesignFlags,
): NextAction {
  const id = project.id;
  const name = project.name;
  const pc = state.politicalCapital;
  if (project.status === 'open')
    return action(
      'viewScorecard',
      id,
      `${name} is open`,
      'Read the scorecard and the receipt: what you paid, what the plan said, what Poland pays.',
      'receipt',
    );
  if (project.status === 'draft') {
    if (!checks.ok) return action('fixAlignment', id, `Fix the alignment of ${name}`, checks.problems[0], 'plan');
    const missing = missingStationEnd(state, project);
    if (missing)
      return action(
        'addStation',
        id,
        `Put a station at ${missing.name}`,
        `Add a station inside the ring at ${missing.name} (within ${missing.radiusM} m).`,
        'station',
      );
    if (project.stations.length < 2)
      return action('addStation', id, `Give ${name} two stations`, 'A line needs a station at each end.', 'station');
    const tip = cheaper
      ? ` A cheaper design is unlocked: ${cheaper.label} saves $${(cheaper.savingCents / 1e8).toFixed(0)}M.`
      : canAffordReform
        ? ` You have ${pc} political capital: reforms change the price before you commit.`
        : '';
    return action(
      'approveProject',
      id,
      `Approve ${name}`,
      `Approve the plan to start the clock. The design can change until tender.${tip}`,
      'project',
      {
        t: 'approveProject',
        projectId: id,
      },
    );
  }
  if (state.pendingEvents.some((e) => e.projectId === id))
    return action(
      'resolveEvent',
      id,
      `${name}: a decision is waiting`,
      'Pick an option on the card. Time stands still until you do.',
      'event',
    );
  if (project.awaiting === 'advancePhase') {
    // An older save, or a line made unbuildable by a rule that changed: it is fixed before it is tendered.
    if (!checks.ok) return action('fixAlignment', id, `Fix the alignment of ${name}`, checks.problems[0], 'plan');
    return action(
      'advancePhase',
      id,
      `Send ${name} to tender`,
      canAffordReform
        ? `Tender fixes the design and the contract prices. You have ${pc} political capital: spend it first.`
        : 'Tender fixes the design and the contract prices: procurement, staffing and utilities.',
      'project',
      { t: 'advancePhase', projectId: id },
    );
  }
  if (project.awaiting === 'launchTBM') {
    const launch = launchLabel(project, flags);
    const spend = canAffordReform ? ` ${pc} political capital in hand.` : '';
    return action(
      'launchTBM',
      id,
      `${launch.verb} ${launch.what} of ${name}`,
      launch.label === 'Launch the TBM'
        ? `The launch pit is ready. Launch, then drive the TBM or leave it on autopilot.${spend}`
        : `The site is ready.${spend}`,
      'project',
      { t: 'launchTBM', projectId: id },
    );
  }
  if (project.awaiting === 'openLine')
    return action('openLine', id, `Open ${name}`, 'Testing is done. Open the line.', 'project', { t: 'openLine', projectId: id });
  if (project.phase === 'construction') {
    const live = project.fronts.filter((f) => f.chainageM < f.toM);
    const machine = live.find((f) => isDrivable(f.method));
    if (machine) {
      const d = machine.drive;
      const verb = isTbm(machine.method) ? 'Bore' : 'Mine';
      if (machine.downDays > 0)
        return action('wait', id, `${verb} ${name}`, `${machine.name} is stopped for ${machine.downDays} more days.`, 'speed');
      if (d && !d.autopilot && d.thrust <= 0)
        return action('drive', id, `${verb} ${name}`, `${machine.name} is holding. W for thrust, or Space for autopilot.`, 'drive');
      if (d && !d.autopilot)
        return action(
          'drive',
          id,
          `${verb} ${name}`,
          `You are driving ${machine.name}. A and D steer, R and F pitch, Space hands it back to the autopilot.`,
          'drive',
        );
      return action(
        'drive',
        id,
        `${verb} ${name}`,
        `${machine.name} is on autopilot. Take the controls, or speed time up: 9 is 10x, 0 is 100x.`,
        'drive',
      );
    }
    if (live.length > 0)
      return action('wait', id, `Build ${name}`, `${live[0].name} is at work. Speed time up: 9 is 10x, 0 is 100x.`, 'speed');
    return action('wait', id, `Build ${name}`, 'The tunnels are through. The station boxes are being finished.', 'speed');
  }
  const goal = PHASE_GOAL[project.phase];
  const hint = canAffordReform
    ? `${PHASE_LABELS[project.phase]} runs as a time-lapse. ${pc} political capital buys a reform now.`
    : `${PHASE_LABELS[project.phase]} runs as a time-lapse.`;
  return action('wait', id, `Get ${name} ${goal}`, hint, canAffordReform ? 'reforms' : 'speed');
}

/** End points of the connect objectives, for the markers on the map: where they are and whether a station of the mission project serves them. */
export function missionTargets(state: SimState, project: ProjectState | null): MissionTarget[] {
  const out: MissionTarget[] = [];
  for (const o of state.scenario.objectives) {
    if (o.kind !== 'connect') continue;
    for (const end of [o.a, o.b]) {
      if (out.some((t) => t.x === end.x && t.z === end.z)) continue;
      let served = false;
      if (project && project.methods.length > 0) {
        for (const s of project.stations) {
          const at = pointAt(project.waypoints, project.cum, s.chainageM);
          if (planDistance(at.x, at.z, end.x, end.z) <= o.radiusM) served = true;
        }
      }
      const target: MissionTarget = { name: end.name, x: end.x, z: end.z, radiusM: o.radiusM, stretch: o.stretch === true, served };
      // The station the official plan puts in this ring, if any: the nearest one.
      let best = o.radiusM;
      for (const s of referenceStations(state.scenario)) {
        const d = planDistance(s.x, s.z, end.x, end.z);
        if (d <= best) {
          best = d;
          target.template = s.template;
          target.templateNote = STATION_TEMPLATE_NOTES[s.template];
        }
      }
      out.push(target);
    }
  }
  return out;
}

export const STATION_TEMPLATE_LABELS: Record<StationTemplate, string> = {
  undergroundStandard: 'Underground box',
  undergroundDeepMined: 'Deep mined cavern',
  terminalFitOut: 'Terminal fit-out',
  inBore: 'Platforms in the bore',
  surface: 'Surface',
  elevated: 'Elevated',
};

/** What each station type is and where it fits, one line. */
export const STATION_TEMPLATE_NOTES: Record<StationTemplate, string> = {
  undergroundStandard: 'A new cut-and-cover box under the street. The standard metro station.',
  undergroundDeepMined: 'A cavern mined from below, for where the street cannot be opened. Half again the price of a box.',
  terminalFitOut: 'Platforms, track and systems in a station box that already stands, like the trainbox under the Transit Center.',
  inBore: 'Platforms inside a 16 m single bore. Needs the big tube.',
  surface: 'Platforms at street level. Cheap, and only where the line is on the surface.',
  elevated: 'Platforms on a viaduct.',
};

const referenceStationCache = new WeakMap<ScenarioDef, { x: number; z: number; template: StationTemplate }[]>();

/** Where the official plan of a scenario puts its stations, from its reference commands. */
export function referenceStations(scenario: ScenarioDef): { x: number; z: number; template: StationTemplate }[] {
  const hit = referenceStationCache.get(scenario);
  if (hit) return hit;
  const out: { x: number; z: number; template: StationTemplate }[] = [];
  let wps: { x: number; y: number; z: number }[] = [];
  for (const c of scenario.reference?.commands ?? []) {
    if (c.t === 'setAlignment') wps = c.waypoints;
    else if (c.t === 'addStation') {
      if (c.at) out.push({ x: c.at.x, z: c.at.z, template: c.template });
      else if (c.chainageM !== undefined && wps.length >= 2) {
        const cum = chainages(wps);
        const at = pointAt(wps, cum, Math.min(c.chainageM, cum[cum.length - 1]));
        out.push({ x: at.x, z: at.z, template: c.template });
      }
    }
  }
  referenceStationCache.set(scenario, out);
  return out;
}

// ---------------------------------------------------------------- what a reform does not change, and why

const CONTRACT_KEYS: ReadonlySet<string> = new Set(['unit.procurement', 'unit.labour', 'unit.thirdParty']);
const TIME_PHASE: Readonly<Record<string, PhaseId>> = {
  'time.planning': 'planning',
  'time.permitting': 'permitting',
  'time.procurement': 'procurement',
  'time.utilities': 'utilities',
};

function months(days: number): string {
  const m = Math.round(days / K.daysPerMonth.value);
  return `${m} ${m === 1 ? 'month' : 'months'}`;
}

/**
 * Sentences that explain a reform's preview on a project where the numbers alone would mislead: the contracts
 * are let, the phase it shortens is over, the stations set the opening date, event cards are not in the estimate.
 */
export function reformNotes(state: SimState, project: ProjectState, r: ReformDef, p: Profile, flags: DesignFlags): string[] {
  const notes: string[] = [];
  const keys = r.effects.map((e) => e.key as string);
  const name = project.name;
  if (project.contract && keys.some((k) => CONTRACT_KEYS.has(k)))
    notes.push(`The contracts of ${name} were let at tender: its procurement, staffing and utility prices no longer change.`);
  if (project.frozen && keys.some((k) => k.startsWith('design.')))
    notes.push(`The design of ${name} went to tender and is built as tendered.`);
  if (project.status === 'active') {
    const at = PHASES.indexOf(project.phase);
    for (const k of keys) {
      const phase = TIME_PHASE[k];
      if (phase === undefined) continue;
      const i = PHASES.indexOf(phase);
      if (i < at || (i === at && project.awaiting !== null))
        notes.push(`${PHASE_LABELS[phase]} is behind ${name}: the time this saves is already spent.`);
    }
  }
  if (keys.some((k) => k === 'tbm.rate' || k === 'tbm.breakdown' || k === 'tbm.geologyRelief')) {
    const bores =
      project.fronts.length > 0
        ? project.fronts.some((f) => isTbm(f.method))
        : project.methods.some((m) => isTbm(effectiveMethod(m, flags)));
    if (!bores) notes.push(`${name} has no boring machine: there is nothing for this to speed up.`);
    else if (project.phase !== 'fitOut' && keys.some((k) => k !== 'tbm.geologyRelief' && k.startsWith('tbm.'))) {
      // A faster machine opens the line sooner only if the machine is what the line waits for.
      const after = profileFor([...state.reforms, r.id]);
      const now = plannedHeadingDays(project, p, flags, isTbm);
      const then = plannedHeadingDays(project, after, flags, isTbm);
      const stations = plannedStationDays(project, p, flags);
      const others = plannedHeadingDays(project, p, flags, (m) => !isTbm(m));
      if (then < now && Math.max(stations, others) >= then) {
        const critical = stations >= others ? `The station boxes take ${months(stations)}` : `The other headings take ${months(others)}`;
        notes.push(`Boring takes ${months(now)}, ${months(then)} with this. ${critical} and set the opening date.`);
      }
    }
  }
  if (keys.some((k) => k.startsWith('event.') && k.endsWith('.rate')))
    notes.push('Event cards are priced when they are drawn, not before: fewer cards is a saving the estimate does not show.');
  return notes;
}

/** The most urgent thing to do in the whole game. */
export function gameNextAction(state: SimState, mission: ProjectState | null, missionAction: NextAction | null): NextAction {
  if (!mission || !missionAction) {
    const goal = requiredConnects(state)[0]?.title ?? state.scenario.objectives[0]?.title ?? state.scenario.title;
    const hint = state.scenario.reference
      ? 'Use the official alignment, or draw your own: click the map to add waypoints.'
      : 'Draw an alignment: click the map to add waypoints.';
    return action('drawAlignment', null, goal, hint, 'plan');
  }
  return missionAction;
}
