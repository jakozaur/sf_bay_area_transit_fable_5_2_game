import { lonLatToWorld, type ProjectRecord } from '@bayvox/core';
import type { Geology, Waypoint } from '@bayvox/sim';

/** Rounds to the centimetre so world coordinates in scenario data do not carry trig rounding noise. */
function cm(v: number): number {
  return Math.round(v * 100) / 100;
}

/** World x, z (metres) of a WGS84 point, through the core UTM 10N frame. */
export function xz(lat: number, lon: number): { x: number; z: number } {
  const w = lonLatToWorld(lon, lat);
  return { x: cm(w.x), z: cm(w.z) };
}

/** Alignment vertex at a WGS84 point with track elevation `y` (world metres, negative is below datum). */
export function at(lat: number, lon: number, y: number, geology: Geology = 'softGround'): Waypoint {
  return { ...xz(lat, lon), y, geology };
}

/** Alignment vertex at a world position (metres, core frame: x east, z south) with track elevation `y`. */
export function wp(x: number, z: number, y: number, geology: Geology = 'softGround'): Waypoint {
  return { x: cm(x), y, z: cm(z), geology };
}

/** Plan position in world metres, for stations and objective anchors read off the baked data. */
export function world(x: number, z: number): { x: number; z: number } {
  return { x: cm(x), z: cm(z) };
}

/**
 * Vertices of a curve of radius `radiusM` that replaces the corner at `corner` on the way from `from` to `to`:
 * the tangent polygon of the arc, split into `n` equal chords. The sim reads a polyline as a tangent polygon
 * (checkAlignment), so these vertices check out at `radiusM` as long as the neighbouring waypoints are at
 * least one chord away. Track elevation runs linearly from `yIn` to `yOut` across the curve.
 */
export function curve(
  from: { x: number; z: number },
  corner: { x: number; z: number },
  to: { x: number; z: number },
  radiusM: number,
  n: number,
  yIn: number,
  yOut: number,
  geology: Geology = 'softGround',
): Waypoint[] {
  const unit = (ax: number, az: number) => {
    const h = Math.hypot(ax, az);
    if (!(h > 0)) throw new Error('scenarios curve: two of the three points coincide');
    return { x: ax / h, z: az / h };
  };
  const a = unit(corner.x - from.x, corner.z - from.z);
  const b = unit(to.x - corner.x, to.z - corner.z);
  const cross = a.x * b.z - a.z * b.x;
  const theta = Math.atan2(Math.abs(cross), a.x * b.x + a.z * b.z);
  if (!(theta > 1e-3) || !(n >= 1)) throw new Error(`scenarios curve: nothing to round at (${corner.x}, ${corner.z})`);
  const tangent = radiusM * Math.tan(theta / 2);
  const side = cross > 0 ? 1 : -1;
  // Centre of the arc: square to the incoming direction at the first tangent point, on the inside of the turn.
  const t1 = { x: corner.x - a.x * tangent, z: corner.z - a.z * tangent };
  const centre = { x: t1.x - a.z * side * radiusM, z: t1.z + a.x * side * radiusM };
  const reach = radiusM / Math.cos(theta / (2 * n));
  const out: Waypoint[] = [];
  for (let i = 0; i < n; i++) {
    const phi = ((i + 0.5) * theta * side) / n;
    // The spoke from the centre to the first tangent point, turned by phi.
    const sx = t1.x - centre.x;
    const sz = t1.z - centre.z;
    const rx = (sx * Math.cos(phi) - sz * Math.sin(phi)) * (reach / radiusM);
    const rz = (sx * Math.sin(phi) + sz * Math.cos(phi)) * (reach / radiusM);
    const y = n === 1 ? (yIn + yOut) / 2 : yIn + ((yOut - yIn) * i) / (n - 1);
    out.push(wp(centre.x + rx, centre.z + rz, Math.round(y * 10) / 10, geology));
  }
  return out;
}

export function usd(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Camera looking at a WGS84 point from the south at the given height. */
export function cameraOver(
  lat: number,
  lon: number,
  heightM: number,
): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } {
  const t = xz(lat, lon);
  return { position: { x: t.x, y: heightM, z: t.z + heightM }, target: { x: t.x, y: 0, z: t.z } };
}

export const EXISTING_CALTRAIN: ProjectRecord = { id: 'caltrain', kind: 'existingRail', name: 'Caltrain', feeder: 'caltrain' };
export const EXISTING_BART: ProjectRecord = { id: 'bart', kind: 'existingRail', name: 'BART', feeder: 'bart' };
