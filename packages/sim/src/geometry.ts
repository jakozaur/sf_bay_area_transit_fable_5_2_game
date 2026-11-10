/** Alignment polyline helpers and carve-edit generation. Only + - * / and sqrt, so results are engine-independent. */
import { VOXEL_SIZE_M, type WorldEdit } from '@bayvox/core';
import type { Waypoint } from './types.ts';

const VOXEL = VOXEL_SIZE_M;
const sqrt = Math.sqrt;
const floor = Math.floor;

/** Cumulative 3D chainage at each waypoint; [0] is 0. */
export function chainages(wps: readonly Waypoint[]): number[] {
  const cum = [0];
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1];
    const b = wps[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    cum.push(cum[i - 1] + sqrt(dx * dx + dy * dy + dz * dz));
  }
  return cum;
}

/** Index of the segment containing chainage `s` (the later segment at an interior vertex). */
export function segmentIndexAt(cum: readonly number[], s: number): number {
  const last = cum.length - 2;
  for (let i = last; i > 0; i--) if (s >= cum[i]) return i;
  return 0;
}

export function pointAt(wps: readonly Waypoint[], cum: readonly number[], s: number): { x: number; y: number; z: number } {
  const i = segmentIndexAt(cum, s);
  const a = wps[i];
  const b = wps[i + 1];
  const len = cum[i + 1] - cum[i];
  const t = len > 0 ? Math.min(1, Math.max(0, (s - cum[i]) / len)) : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function unitDir(a: Waypoint, b: Waypoint): { x: number; z: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const h = sqrt(dx * dx + dz * dz);
  return h > 0 ? { x: dx / h, z: dz / h } : { x: 1, z: 0 };
}

/**
 * Point on the alignment at chainage `s`, shifted `lateral` metres to the left of the direction of travel
 * (horizontal). At an interior vertex the shift uses the bisector of the two segments, so the result
 * is a function of `s` alone and consecutive capsules share their end points exactly.
 */
export function offsetPointAt(
  wps: readonly Waypoint[],
  cum: readonly number[],
  s: number,
  lateral: number,
): { x: number; y: number; z: number } {
  const p = pointAt(wps, cum, s);
  if (lateral === 0) return p;
  const i = segmentIndexAt(cum, s);
  let d = unitDir(wps[i], wps[i + 1]);
  if (i > 0 && s === cum[i]) {
    const prev = unitDir(wps[i - 1], wps[i]);
    const bx = prev.x + d.x;
    const bz = prev.z + d.z;
    const h = sqrt(bx * bx + bz * bz);
    if (h > 1e-9) d = { x: bx / h, z: bz / h };
  }
  return { x: p.x + d.z * lateral, y: p.y, z: p.z - d.x * lateral };
}

/** Chainage of the alignment point nearest to (x, z) in plan, and the plan distance to it. */
export function nearestChainage(
  wps: readonly Waypoint[],
  cum: readonly number[],
  x: number,
  z: number,
): { chainageM: number; distanceM: number } {
  let best = 0;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < wps.length; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const h2 = dx * dx + dz * dz;
    const t = h2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / h2)) : 0;
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = cum[i] + (cum[i + 1] - cum[i]) * t;
    }
  }
  return { chainageM: best, distanceM: sqrt(bestD2) };
}

function voxel(p: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return { x: floor(p.x / VOXEL), y: floor(p.y / VOXEL), z: floor(p.z / VOXEL) };
}

/** One carve capsule between two world points in metres. */
export function capsuleBetween(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, radiusM: number): WorldEdit {
  return { t: 'carveCapsule', a: voxel(a), b: voxel(b), radius: radiusM / VOXEL };
}

/** Points of the alignment from chainage `fromM` to `toM`: both ends and every vertex in between. */
export function subPath(
  wps: readonly Waypoint[],
  cum: readonly number[],
  fromM: number,
  toM: number,
): { x: number; y: number; z: number }[] {
  const out = [pointAt(wps, cum, fromM)];
  if (!(toM > fromM)) return out;
  for (let i = segmentIndexAt(cum, fromM) + 1; i < cum.length - 1 && cum[i] < toM; i++) {
    if (cum[i] > fromM) out.push({ x: wps[i].x, y: wps[i].y, z: wps[i].z });
  }
  out.push(pointAt(wps, cum, toM));
  return out;
}

/**
 * Capsule edits that carve the alignment between two chainages, split at every vertex in between.
 * The chain is gap free: each capsule starts on the voxel where the previous one ended.
 */
export function carveCapsules(
  wps: readonly Waypoint[],
  cum: readonly number[],
  fromM: number,
  toM: number,
  radiusM: number,
  lateralM: number,
  out: WorldEdit[],
): void {
  if (!(toM > fromM)) return;
  let s0 = fromM;
  for (let i = segmentIndexAt(cum, fromM) + 1; i < cum.length - 1 && cum[i] < toM; i++) {
    if (cum[i] <= s0) continue;
    out.push({
      t: 'carveCapsule',
      a: voxel(offsetPointAt(wps, cum, s0, lateralM)),
      b: voxel(offsetPointAt(wps, cum, cum[i], lateralM)),
      radius: radiusM / VOXEL,
    });
    s0 = cum[i];
  }
  out.push({
    t: 'carveCapsule',
    a: voxel(offsetPointAt(wps, cum, s0, lateralM)),
    b: voxel(offsetPointAt(wps, cum, toM, lateralM)),
    radius: radiusM / VOXEL,
  });
}

export function planDistance(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return sqrt(dx * dx + dz * dz);
}
