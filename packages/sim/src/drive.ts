/**
 * Driven regime of a heading (docs/CONTRACTS.md decisions 1 and 4): pure geometry and control laws.
 * The engine owns money, carving and events; this file moves a DriveState by one sub-step.
 * Only + - * / and sqrt, so a replay gives the same pose on every engine.
 */
import { CONSTANTS as K, SUBSTEPS_PER_DAY } from './constants.ts';
import { segmentIndexAt } from './geometry.ts';
import type { DriveState, Geology, Waypoint } from './types.ts';

const sqrt = Math.sqrt;
const LOOKAHEAD = K.driveLookaheadM.value;
const V_RADIUS = K.driveVerticalRadiusM.value;
const CORRIDOR = K.driveCorridorM.value;
const FREE = K.driveFreeDeviationM.value;
const RESTEER = K.driveResteerFactor.value;
const SUBSTEPS = SUBSTEPS_PER_DAY;
const ALIGN_M = K.driveAlignM.value;
/** Half a circle: the most a shield held at the corridor edge can need to turn in place before a step points inwards. */
const HALF_TURN = 3.2;
/** A machine this far above its planned level is "above the plan" for the cover rule. */
const COVER_TOLERANCE_M = 0.5;
/** How far ahead of the last known plan chainage the nearest point is searched. A day of the fastest machine is far less. */
const SEARCH_AHEAD_M = 80;
/** The face counts as arrived this close to the end of the run even if it has not passed it. */
const ARRIVE_M = 2;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface PlanPoint {
  x: number;
  y: number;
  z: number;
  /** Unit plan direction at the point. */
  dirX: number;
  dirZ: number;
  /** Rise per horizontal metre of the plan there. */
  grade: number;
}

/** Point of the plan at chainage `s`; beyond the last vertex it continues straight on the last segment. */
export function planPointAt(wps: readonly Waypoint[], cum: readonly number[], s: number): PlanPoint {
  const i = segmentIndexAt(cum, Math.min(s, cum[cum.length - 1]));
  const a = wps[i];
  const b = wps[i + 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = cum[i + 1] - cum[i];
  const h = sqrt(dx * dx + dz * dz);
  const t = len > 0 ? Math.max(0, (s - cum[i]) / len) : 0;
  return {
    x: a.x + dx * t,
    y: a.y + dy * t,
    z: a.z + dz * t,
    dirX: h > 0 ? dx / h : 0,
    dirZ: h > 0 ? dz / h : 1,
    grade: h > 0 ? dy / h : 0,
  };
}

export interface PlanFix {
  /** Chainage of the nearest plan point, clamped to the run. */
  planM: number;
  lateralM: number;
  verticalM: number;
  totalM: number;
  /** The face is level with the end of the run or past it, or stands within ARRIVE_M of it. */
  arrived: boolean;
}

/**
 * Nearest point of the plan to (x, y, z) in plan view, searched from chainage `fromM` forwards so the fix
 * never jumps to another part of a line that doubles back. `endM` is the end of the heading's run.
 */
export function fixOnPlan(
  wps: readonly Waypoint[],
  cum: readonly number[],
  x: number,
  y: number,
  z: number,
  fromM: number,
  endM: number,
): PlanFix {
  const first = segmentIndexAt(cum, fromM);
  let last = segmentIndexAt(cum, Math.min(endM, fromM + SEARCH_AHEAD_M));
  // segmentIndexAt returns the later segment at a vertex; the run ends on the segment before `endM`.
  while (last > first && cum[last] >= endM - 1e-9) last--;
  let bestD2 = Number.POSITIVE_INFINITY;
  let bestS = fromM;
  let bestI = first;
  let bestT = 0;
  for (let i = first; i <= last; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const h2 = dx * dx + dz * dz;
    const raw = h2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / h2 : 0;
    const t = clamp(raw, 0, 1);
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestS = cum[i] + (cum[i + 1] - cum[i]) * t;
      bestI = i;
      bestT = t;
    }
  }
  const a = wps[bestI];
  const b = wps[bestI + 1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const h = sqrt(dx * dx + dz * dz);
  const ux = h > 0 ? dx / h : 0;
  const uz = h > 0 ? dz / h : 1;
  const px = a.x + dx * bestT;
  const pz = a.z + dz * bestT;
  const py = a.y + (b.y - a.y) * bestT;
  // Right of travel is (-dirZ, dirX): facing +z (south, yaw 0), right is -x (west).
  const lateralM = -(x - px) * uz + (z - pz) * ux;
  const verticalM = y - py;
  const planM = clamp(Math.max(bestS, fromM), fromM, endM);
  const end = planPointAt(wps, cum, endM);
  const ex = x - end.x;
  const ey = y - end.y;
  const ez = z - end.z;
  // The nearest plan point is the end of the run itself: the face is level with it or past it.
  const arrived = planM >= endM - 1e-9;
  return {
    planM,
    lateralM,
    verticalM,
    totalM: sqrt(lateralM * lateralM + verticalM * verticalM),
    arrived: arrived || ex * ex + ey * ey + ez * ez <= ARRIVE_M * ARRIVE_M,
  };
}

/** A fresh DriveState on the plan at chainage `s`, running straight at full thrust. */
export function driveFromPlan(
  wps: readonly Waypoint[],
  cum: readonly number[],
  s: number,
  geology: Geology,
  trail: number[],
  trailM: number,
): DriveState {
  const p = planPointAt(wps, cum, s);
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    dirX: p.dirX,
    dirZ: p.dirZ,
    grade: p.grade,
    autopilot: false,
    thrust: 1,
    steer: 0,
    pitch: 0,
    planM: s,
    lateralM: 0,
    verticalM: 0,
    geology,
    carveX: p.x,
    carveY: p.y,
    carveZ: p.z,
    carveDirX: p.dirX,
    carveDirZ: p.dirZ,
    trail,
    trailM,
    pendingCents: 0,
    pendingOffPlanCents: 0,
    offPlan: false,
    offPlanNoticeTick: -1_000_000,
    corridorNoticeTick: -1_000_000,
    blocked: false,
    blockedFor: 0,
  };
}

export interface DriveLimits {
  minRadiusM: number;
  /** Rise per horizontal metre. */
  maxGrade: number;
}

/** Steer and pitch the cruise law would apply now: pure pursuit of the plan point LOOKAHEAD metres ahead. */
export function cruiseControls(
  d: DriveState,
  wps: readonly Waypoint[],
  cum: readonly number[],
  limits: DriveLimits,
): { steer: number; pitch: number } {
  const t = planPointAt(wps, cum, d.planM + LOOKAHEAD);
  const vx = t.x - d.x;
  const vz = t.z - d.z;
  const forward = vx * d.dirX + vz * d.dirZ;
  const right = -vx * d.dirZ + vz * d.dirX;
  const dist2 = forward * forward + right * right;
  let steer: number;
  if (forward <= 0) steer = right >= 0 ? 1 : -1;
  else steer = dist2 > 0 ? clamp(((2 * right) / dist2) * limits.minRadiusM, -1, 1) : 0;
  const wanted = clamp((t.y - d.y) / Math.max(1, sqrt(dist2)), -limits.maxGrade, limits.maxGrade);
  return { steer, pitch: clamp((wanted - d.grade) * 100, -1, 1) };
}

/**
 * Controls of a hand-driven machine with a lever at rest: the heading eases parallel to the plan and the
 * grade to the plan's grade, over about ALIGN_M metres. It holds the offset the driver has steered to; it
 * does not return to the line (that is the cruise law). Without it a released key leaves a yaw error behind
 * and the machine walks off by itself. The heading is matched to the plan LOOKAHEAD metres ahead, so the turn
 * into a bend starts before the vertex and a hands-off machine comes out of the bend about where it went in.
 */
export function holdControls(
  d: DriveState,
  wps: readonly Waypoint[],
  cum: readonly number[],
  limits: DriveLimits,
): { steer: number; pitch: number } {
  const ahead = planPointAt(wps, cum, d.planM + LOOKAHEAD);
  // sin and cos of (plan yaw - machine yaw).
  const sin = ahead.dirX * d.dirZ - ahead.dirZ * d.dirX;
  const cos = ahead.dirX * d.dirX + ahead.dirZ * d.dirZ;
  // A right turn (steer +1) lowers the yaw, so a positive error needs a left turn.
  const steer = cos < 0 ? (sin >= 0 ? -1 : 1) : clamp((-sin * limits.minRadiusM) / ALIGN_M, -1, 1);
  return { steer, pitch: clamp((planPointAt(wps, cum, d.planM).grade - d.grade) * 100, -1, 1) };
}

/** Turns the heading by `arc` metres of travel at `steer` and `pitch`. An exact rotation built from a rational half-angle. */
function turn(d: DriveState, steer: number, pitch: number, arc: number, limits: DriveLimits, maxUp: number = limits.maxGrade): void {
  // Right turn (steer +1) lowers the yaw.
  const half = (-steer * arc) / limits.minRadiusM / 2;
  const c = (1 - half * half) / (1 + half * half);
  const s = (2 * half) / (1 + half * half);
  const nx = d.dirX * c + d.dirZ * s;
  const nz = d.dirZ * c - d.dirX * s;
  const n = sqrt(nx * nx + nz * nz);
  d.dirX = nx / n;
  d.dirZ = nz / n;
  d.grade = clamp(d.grade + (pitch * arc) / V_RADIUS, -limits.maxGrade, maxUp);
}

export interface DriveStep {
  /** Metres bored this sub-step. */
  advancedM: number;
  arrived: boolean;
  /** The cover rule overrode the pitch this sub-step. */
  dived: boolean;
}

/**
 * True while a machine is being bored back into its corridor by the cruise law. That happens when re-steering
 * in place has turned the shield through half a circle (`blockedFor` counts the metres of arc) and no step
 * points inwards yet: geometry alone can then not free it, so it bores.
 */
export function isRecovering(d: DriveState, minRadiusM: number): boolean {
  return (d.blockedFor ?? 0) >= HALF_TURN * minRadiusM;
}

/**
 * One sub-step of a driven heading at `maxRateMPerDay` (the rate at thrust 1 in the ground at the face).
 * `freeM` is the deviation that carries no surcharge here (the engine widens it at the corners of the plan).
 * `thinCover` says the ground over the crown is thinner than the cover rule allows.
 * Mutates the pose, the controls in force under autopilot, and the deviation fields.
 *
 * Corridor: a move that would take the face further out than the corridor allows is not made. The shield
 * re-steers towards the plan in place instead, which frees it in seconds. If half a circle of that has not
 * (the first playtest found such a pose, 30 m above the plan), the cruise law bores it back whatever the
 * corridor check says, until it is inside again. Pure pursuit of a point that moves along the plan always
 * closes in, so no pose is a dead end.
 *
 * Cover: a machine above its planned level with thin cover cannot climb and is pitched down. On or below
 * the plan the rule does not apply: the plan itself decides how shallow a launch or a reception is.
 */
export function driveSubstep(
  d: DriveState,
  wps: readonly Waypoint[],
  cum: readonly number[],
  endM: number,
  maxRateMPerDay: number,
  limits: DriveLimits,
  freeM: number = FREE,
  thinCover = false,
): DriveStep {
  let steer = clamp(d.steer, -1, 1);
  let pitch = clamp(d.pitch, -1, 1);
  let thrust = clamp(d.thrust, 0, 1);
  const recovering = isRecovering(d, limits.minRadiusM);
  if (d.autopilot || recovering) {
    const c = cruiseControls(d, wps, cum, limits);
    steer = c.steer;
    pitch = c.pitch;
    if (d.autopilot) thrust = 1;
  } else if (steer === 0 || pitch === 0) {
    const hold = holdControls(d, wps, cum, limits);
    if (steer === 0) steer = hold.steer;
    if (pitch === 0) pitch = hold.pitch;
  }
  const dive = thinCover && d.verticalM > COVER_TOLERANCE_M;
  if (dive) pitch = -1;
  const full = maxRateMPerDay / SUBSTEPS;
  const ds = full * thrust;
  if (ds <= 0) {
    if (!recovering) d.blocked = false;
    return { advancedM: 0, arrived: false, dived: false };
  }
  const before = { dirX: d.dirX, dirZ: d.dirZ, grade: d.grade };
  turn(d, steer, pitch, ds, limits, dive ? Math.min(0, limits.maxGrade) : limits.maxGrade);
  const h = ds / sqrt(1 + d.grade * d.grade);
  const nx = d.x + d.dirX * h;
  const ny = d.y + d.grade * h;
  const nz = d.z + d.dirZ * h;
  const fix = fixOnPlan(wps, cum, nx, ny, nz, d.planM, endM);
  const now = sqrt(d.lateralM * d.lateralM + d.verticalM * d.verticalM);
  if (!recovering && fix.totalM > CORRIDOR && fix.totalM > now) {
    // Held at the corridor edge: undo the player's turn and re-steer towards the plan without advancing.
    d.dirX = before.dirX;
    d.dirZ = before.dirZ;
    d.grade = before.grade;
    const c = cruiseControls(d, wps, cum, limits);
    turn(d, c.steer, c.pitch, full * RESTEER, limits);
    d.blocked = true;
    d.blockedFor = (d.blockedFor ?? 0) + full * RESTEER;
    return { advancedM: 0, arrived: false, dived: false };
  }
  d.x = nx;
  d.y = ny;
  d.z = nz;
  d.planM = fix.planM;
  d.lateralM = fix.lateralM;
  d.verticalM = fix.verticalM;
  // Back inside: the driver has the controls again. Outside, the cruise law keeps them until it is.
  if (fix.totalM <= CORRIDOR || fix.arrived) {
    d.blocked = false;
    d.blockedFor = 0;
  }
  // Hysteresis, so the off-plan flag does not flicker at the tolerance.
  if (fix.totalM > freeM) d.offPlan = true;
  else if (fix.totalM < freeM * 0.8) d.offPlan = false;
  return { advancedM: ds, arrived: fix.arrived, dived: dive };
}
