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
