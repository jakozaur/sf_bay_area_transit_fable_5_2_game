/**
 * Geometry checks of an alignment (round 2). Pure and cheap: the draw tool calls checkAlignment on every pointer move.
 *
 * Curve rule: a polyline is read as the tangent polygon of the built curve. At an interior vertex with plan
 * deflection theta between segments of plan length a and b, the largest arc that fits uses half of the shorter
 * segment as its tangent length, so R = min(a, b) / 2 / tan(theta / 2). A 90 degree corner between two 280 m
 * blocks is an R 140 m curve; drawing the same turn with three or four vertices gives each a small deflection and
 * the radius of the arc they trace. tan(theta / 2) is |cross| / (|a||b| + dot), so only sqrt is needed.
 */
import { isInGrid } from '@bayvox/core';
import { CONSTANTS as K } from './constants.ts';
import type { AlignmentChecks, Method, Waypoint } from './types.ts';

const MAX_GRADE_PCT = K.maxGradePct.value;
const R_TWIN = K.minRadiusTwinBoreM.value;
const R_LARGE = K.minRadiusLargeBoreM.value;
/** A segment shorter than this in plan cannot hold a curve or a machine length. */
export const MIN_SEGMENT_M = 20;
/** Deflections below this (tan of half the angle, about 0.3 degrees) count as straight. */
const STRAIGHT_TAN = 0.0025;

/** Tightest curve a heading of this method can bore or lay. */
export function minRadiusFor(method: Method): number {
  return method === 'boredSingleLarge' ? R_LARGE : R_TWIN;
}

/** Plan radius of the curve a vertex stands for, or null when the line runs straight through it. */
export function vertexRadiusM(a: Waypoint, v: Waypoint, b: Waypoint): number | null {
  const ax = v.x - a.x;
  const az = v.z - a.z;
  const bx = b.x - v.x;
  const bz = b.z - v.z;
  const la = Math.sqrt(ax * ax + az * az);
  const lb = Math.sqrt(bx * bx + bz * bz);
  if (la <= 0 || lb <= 0) return 0;
  const cross = Math.abs(ax * bz - az * bx);
  const denom = la * lb + (ax * bx + az * bz);
  // A reversal: no arc fits.
  if (denom <= 1e-9 * la * lb) return 0;
  const tanHalf = cross / denom;
  if (tanHalf < STRAIGHT_TAN) return null;
  return Math.min(la, lb) / 2 / tanHalf;
}

/**
 * Geometry checks of an alignment against the limits of its methods (CONSTANTS.minRadius*, maxGradePct).
 * `methods` has one entry per segment (default boredTwin). Depth below ground is not checked here: the sim does
 * not know the ground; the draw tool adds 'depth' issues from WorldPort.groundAt.
 */
export function checkAlignment(waypoints: readonly Waypoint[], methods?: readonly Method[]): AlignmentChecks {
  const n = waypoints.length;
  const segments = Math.max(0, n - 1);
  if (methods && methods.length !== segments)
    throw new Error(`sim checkAlignment: ${methods.length} methods for ${segments} segments; one per segment is required`);
  const segmentIssues = new Array<AlignmentChecks['segmentIssues'][number]>(segments).fill(null);
  const vertexIssues = new Array<AlignmentChecks['vertexIssues'][number]>(n).fill(null);
  const problems: string[] = [];
  let lengthM = 0;
  let maxGradePct = 0;
  let minRadiusM: number | null = null;
  let radiusLimit = R_TWIN;
  const methodAt = (i: number): Method => methods?.[i] ?? 'boredTwin';

  for (let i = 0; i < n; i++) {
    const w = waypoints[i];
    if (!isInGrid(w.x, w.z)) {
      vertexIssues[i] = 'bounds';
      problems.push(`Waypoint ${i + 1} is outside the map`);
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const plan = Math.sqrt(dx * dx + dz * dz);
    lengthM += Math.sqrt(dx * dx + dy * dy + dz * dz);
    radiusLimit = Math.max(radiusLimit, minRadiusFor(methodAt(i)));
    if (plan < MIN_SEGMENT_M) {
      segmentIssues[i] = 'short';
      problems.push(`Segment ${i + 1} is ${plan.toFixed(0)} m long, minimum ${MIN_SEGMENT_M} m`);
      continue;
    }
    const grade = (Math.abs(dy) / plan) * 100;
    if (grade > maxGradePct) maxGradePct = grade;
    if (grade > MAX_GRADE_PCT + 1e-9) {
      segmentIssues[i] = 'grade';
      problems.push(`Segment ${i + 1} climbs ${grade.toFixed(1)} percent, maximum ${MAX_GRADE_PCT} percent`);
    }
  }
  for (let i = 1; i + 1 < n; i++) {
    const r = vertexRadiusM(waypoints[i - 1], waypoints[i], waypoints[i + 1]);
    if (r === null) continue;
    if (minRadiusM === null || r < minRadiusM) minRadiusM = r;
    const limit = Math.max(minRadiusFor(methodAt(i - 1)), minRadiusFor(methodAt(i)));
    if (r < limit - 1e-6 && vertexIssues[i] === null) {
      vertexIssues[i] = 'radius';
      problems.push(`Curve at waypoint ${i + 1}: R ${r.toFixed(0)} m, minimum ${limit} m`);
    }
  }
  return {
    lengthM,
    minRadiusM,
    maxGradePct,
    limits: { minRadiusM: radiusLimit, maxGradePct: MAX_GRADE_PCT },
    segmentIssues,
    vertexIssues,
    problems,
    ok: problems.length === 0,
  };
}
