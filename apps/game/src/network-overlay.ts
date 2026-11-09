/**
 * Region-wide vector overlays: the existing rail network coloured by system, motorways with the Bay
 * crossings, and place markers. Everything is draped on the far raster (a few metres above the 64 m cell)
 * and drawn through terrain: at Bay scale these are map symbols, not geometry.
 */
import { type FarVectors, type RailNetwork, SEA_LEVEL_M, type TerrainRaster, terrainHeightM, type WorldPos } from '@bayvox/core';
import type { OverlayLayer } from '@bayvox/render';

/** Display groups of rail tracks, in drawing order (later groups draw on top). */
const RAIL_GROUPS = [
  { id: 'other', color: 0x8d8d8d, widthPx: 1.5 },
  { id: 'intercity', color: 0x3f51b5, widthPx: 2 },
  { id: 'SMART', color: 0x43a047, widthPx: 2.5 },
  { id: 'VTA', color: 0x00a79d, widthPx: 2.5 },
  { id: 'Muni', color: 0xffb300, widthPx: 2.5 },
  { id: 'BART', color: 0x1f8fff, widthPx: 3 },
  { id: 'Caltrain', color: 0xe53935, widthPx: 3 },
] as const;
type RailGroup = (typeof RAIL_GROUPS)[number]['id'];

/** Which group a track is drawn in, from its `systems` column (sorted names joined by ";"). */
export function railGroup(systems: string): RailGroup {
  const set = systems.split(';');
  for (const id of ['Caltrain', 'BART', 'Muni', 'VTA', 'SMART'] as const) if (set.includes(id)) return id;
  return systems === '' || systems === 'other' ? 'other' : 'intercity';
}

const LINE_LIFT_M = 6;
/** Tracks tagged as tunnels are drawn this far below the surface (the data has no real depth). */
const TUNNEL_DEPTH_M = 18;
const HIGHWAY_ID = 'net.highways';
const PLACE_PREFIX = 'net.place.';
/** Cities below this population get no marker. */
const PLACE_MIN_POPULATION = 50_000;
/** Motorway lines and city markers are map symbols for the regional view: hidden when closer than this. */
const REGIONAL_MIN_DISTANCE_M = 9_000;

/**
 * Douglas-Peucker simplification of a polyline given as flat x, z pairs: drops vertices closer than
 * `toleranceM` to the line through their kept neighbours. End points are always kept.
 */
export function simplifyLine(pts: Float64Array, toleranceM: number): Float64Array {
  const n = pts.length / 2;
  if (n <= 2 || !(toleranceM > 0)) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  const tol2 = toleranceM * toleranceM;
  while (stack.length > 0) {
    const last = stack.pop() as number;
    const first = stack.pop() as number;
    const ax = pts[first * 2] as number;
    const az = pts[first * 2 + 1] as number;
    const dx = (pts[last * 2] as number) - ax;
    const dz = (pts[last * 2 + 1] as number) - az;
    const len2 = dx * dx + dz * dz;
    let worst = -1;
    let worstD2 = tol2;
    for (let i = first + 1; i < last; i++) {
      const px = (pts[i * 2] as number) - ax;
      const pz = (pts[i * 2 + 1] as number) - az;
      const t = len2 > 0 ? Math.min(1, Math.max(0, (px * dx + pz * dz) / len2)) : 0;
      const ex = px - t * dx;
      const ez = pz - t * dz;
      const d2 = ex * ex + ez * ez;
      if (d2 > worstD2) {
        worstD2 = d2;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push(first, worst, worst, last);
    }
  }
  let kept = 0;
  for (let i = 0; i < n; i++) kept += keep[i] as number;
  const out = new Float64Array(kept * 2);
  for (let i = 0, o = 0; i < n; i++) {
    if (keep[i] === 0) continue;
    out[o++] = pts[i * 2] as number;
    out[o++] = pts[i * 2 + 1] as number;
  }
  return out;
}

export interface NetworkOverlay {
  railSegments: number;
  highwaySegments: number;
  places: number;
  /** Shows or hides the regional symbols for the current zoom. */
  onZoom(overlay: OverlayLayer, cameraDistanceM: number): void;
}

/**
 * `far` is the raster the lines are draped on. `simplifyM` is the line simplification tolerance in metres:
 * tracks are surveyed to 0.25 m, far more than a map symbol needs.
 */
export function addNetworkOverlay(
  overlay: OverlayLayer,
  far: TerrainRaster,
  rail: RailNetwork,
  vectors: FarVectors,
  simplifyM: number,
): NetworkOverlay {
  const x1 = far.originX + far.cols * far.cellM;
  const z0 = 0 - (far.originN + far.rows * far.cellM);
  /** Drape height: the far cell's land height, or sea level over water and outside the grid. */
  const lift = (x: number, z: number): number => {
    if (!(x >= far.originX && x < x1 && z > z0 && z <= 0 - far.originN)) return SEA_LEVEL_M + LINE_LIFT_M;
    return Math.max(SEA_LEVEL_M, terrainHeightM(far, x, z)) + LINE_LIFT_M;
  };
  const pushLine = (out: number[], line: Float64Array, offsetM = 0): void => {
    const pts = simplifyLine(line, simplifyM);
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i] as number;
      const az = pts[i + 1] as number;
      const bx = pts[i + 2] as number;
      const bz = pts[i + 3] as number;
      out.push(ax, lift(ax, az) + offsetM, az, bx, lift(bx, bz) + offsetM, bz);
    }
  };

  const highways: number[] = [];
  for (const h of vectors.highways) for (const part of h.parts) pushLine(highways, part);
  if (highways.length > 0) overlay.setLineSegments(HIGHWAY_ID, highways, { color: 0xfff3d6, widthPx: 1.2, xray: true, opacity: 0.75 });

  // Running lines only: yards, sidings and spurs carry a service tag.
  const byGroup = new Map<RailGroup, number[]>();
  for (const t of rail.tracks) {
    if (t.service !== '') continue;
    const group = railGroup(t.systems);
    let out = byGroup.get(group);
    if (out === undefined) {
      out = [];
      byGroup.set(group, out);
    }
    for (const part of t.parts) pushLine(out, part, t.tunnel !== 0 ? -LINE_LIFT_M - TUNNEL_DEPTH_M : 0);
  }
  let railSegments = 0;
  for (const g of RAIL_GROUPS) {
    const segments = byGroup.get(g.id);
    if (segments === undefined) continue;
    railSegments += segments.length / 6;
    overlay.setLineSegments(`net.rail.${g.id}`, segments, { color: g.color, widthPx: g.widthPx, xray: true });
  }

  const placeIds: string[] = [];
  for (const [i, p] of vectors.places.entries()) {
    const settlement = p.kind === 'city' || p.kind === 'town';
    if (settlement && p.population < PLACE_MIN_POPULATION) continue;
    const pt = p.parts[0];
    if (pt === undefined) throw new Error(`network overlay: place "${p.name}" has no position`);
    const x = pt[0] as number;
    const z = pt[1] as number;
    const position: WorldPos = { x, y: lift(x, z) - LINE_LIFT_M, z };
    const id = `${PLACE_PREFIX}${i}`;
    overlay.setMarker(id, position, { color: settlement ? 0xfafafa : 0xab47bc, sizeM: 40, minPx: settlement ? 22 : 18, xray: true });
    placeIds.push(id);
  }

  let regionalShown = true;
  return {
    railSegments,
    highwaySegments: highways.length / 6,
    places: placeIds.length,
    onZoom(o, cameraDistanceM) {
      const show = cameraDistanceM >= REGIONAL_MIN_DISTANCE_M;
      if (show === regionalShown) return;
      regionalShown = show;
      if (highways.length > 0) o.setVisible(HIGHWAY_ID, show);
      for (const id of placeIds) o.setVisible(id, show);
    },
  };
}
