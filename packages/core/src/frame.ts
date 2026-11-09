/**
 * World frame (doc 04 sections 8 and 9.1).
 *
 * - CRS: UTM zone 10N on WGS84 (EPSG:32610). Flat world, flat sea.
 * - Grid metres: e = easting - GRID_ORIGIN_EASTING, n = northing - GRID_ORIGIN_NORTHING.
 *   The origin is the SW corner of the game grid and a multiple of 4,096 m in both axes.
 * - Game grid: 20 x 24 region tiles of 4,096 m = 81.92 km (E-W) x 98.304 km (N-S).
 *   Tile (tx, ty) covers e in [tx * 4096, (tx + 1) * 4096), n in [ty * 4096, (ty + 1) * 4096);
 *   tx counts east from the west edge, ty counts north from the south edge.
 * - World metres (render and voxel frame, right-handed, y up):
 *     x = e (east), y = NAVD88 height in metres, z = -n (south).
 *   Inside the grid x is in [0, 81920] and z is in [-98304, 0].
 * - Voxel coordinates are world metres divided by VOXEL_SIZE_M, floored (chunk.ts).
 *
 * The projection is the Krueger series for the transverse Mercator (Karney 2011, to order n^4),
 * implemented here without dependencies; error is far below 1 mm inside the zone.
 * packages/pipeline cross-checks it against proj4.
 * These functions use transcendental Math functions: never call them from state-affecting sim code.
 */

export const WORLD_CRS = 'EPSG:32610';

/** Region tile edge in metres. */
export const TILE_SIZE_M = 4096;
export const GRID_TILES_X = 20;
export const GRID_TILES_Y = 24;
/** Grid extent east-west in metres: 81,920. */
export const GRID_WIDTH_M = GRID_TILES_X * TILE_SIZE_M;
/** Grid extent north-south in metres: 98,304. */
export const GRID_HEIGHT_M = GRID_TILES_Y * TILE_SIZE_M;

/**
 * UTM 10N easting of the grid's SW corner: 130 * 4096.
 * Chosen as the game box SW corner (37.20 N, 122.60 W, doc 04 section 3) floored to 4,096 m.
 */
export const GRID_ORIGIN_EASTING = 532_480;
/** UTM 10N northing of the grid's SW corner: 1005 * 4096. */
export const GRID_ORIGIN_NORTHING = 4_116_480;

/** Game box in degrees (doc 04 section 3). The grid contains all four corners. */
export const GAME_BOX = { south: 37.2, north: 38.05, west: -122.6, east: -121.75 } as const;

/**
 * Height of the single water plane in NAVD88 metres. Mean sea level at San Francisco
 * (NOAA station 9414290) is +0.97 m NAVD88; rounded to the 1 m voxel grid.
 * Water occupies voxels with y < SEA_LEVEL_M.
 */
export const SEA_LEVEL_M = 1;

export interface LonLat {
  /** Degrees east (negative in the Bay Area). */
  lon: number;
  /** Degrees north. */
  lat: number;
}

export interface Utm {
  easting: number;
  northing: number;
}

/** Horizontal position in world metres: x east, z south, from the grid origin. */
export interface WorldXZ {
  x: number;
  z: number;
}

/** Position in world metres, float64. x east, y up (NAVD88), z south. */
export interface WorldPos {
  x: number;
  y: number;
  z: number;
}

export interface TileCoord {
  /** 0..19, west to east. */
  tx: number;
  /** 0..23, south to north. */
  ty: number;
}

// WGS84 ellipsoid and UTM zone 10 constants.
const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const FALSE_EASTING = 500000;
const LON0_DEG = -123;
const DEG = Math.PI / 180;

const N1 = F / (2 - F);
const N2 = N1 * N1;
const N3 = N2 * N1;
const N4 = N2 * N2;
/** Rectifying radius times k0. */
const K0A = (K0 * A * (1 + N2 / 4 + N4 / 64)) / (1 + N1);
const E_CONF = (2 * Math.sqrt(N1)) / (1 + N1);

const ALPHA = [
  N1 / 2 - (2 * N2) / 3 + (5 * N3) / 16 + (41 * N4) / 180,
  (13 * N2) / 48 - (3 * N3) / 5 + (557 * N4) / 1440,
  (61 * N3) / 240 - (103 * N4) / 140,
  (49561 * N4) / 161280,
] as const;
const BETA = [
  N1 / 2 - (2 * N2) / 3 + (37 * N3) / 96 - N4 / 360,
  N2 / 48 + N3 / 15 - (437 * N4) / 1440,
  (17 * N3) / 480 - (37 * N4) / 840,
  (4397 * N4) / 161280,
] as const;
const DELTA = [
  2 * N1 - (2 * N2) / 3 - 2 * N3 + (116 * N4) / 45,
  (7 * N2) / 3 - (8 * N3) / 5 - (227 * N4) / 45,
  (56 * N3) / 15 - (136 * N4) / 35,
  (4279 * N4) / 630,
] as const;

/** WGS84 lon/lat in degrees to UTM zone 10N metres. Throws on input outside the zone's usable range. */
export function lonLatToUtm10(lon: number, lat: number): Utm {
  if (!(lat > -80 && lat < 84) || !(lon > LON0_DEG - 12 && lon < LON0_DEG + 12)) {
    throw new RangeError(`lonLatToUtm10: outside UTM zone 10N usable range: lon ${lon}, lat ${lat}`);
  }
  const phi = lat * DEG;
  const lam = (lon - LON0_DEG) * DEG;
  const s = Math.sin(phi);
  const t = Math.sinh(Math.atanh(s) - E_CONF * Math.atanh(E_CONF * s));
  const xi0 = Math.atan2(t, Math.cos(lam));
  const eta0 = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let xi = xi0;
  let eta = eta0;
  for (let j = 1; j <= 4; j++) {
    const a = ALPHA[j - 1] as number;
    xi += a * Math.sin(2 * j * xi0) * Math.cosh(2 * j * eta0);
    eta += a * Math.cos(2 * j * xi0) * Math.sinh(2 * j * eta0);
  }
  return { easting: FALSE_EASTING + K0A * eta, northing: K0A * xi };
}

/** UTM zone 10N metres (northern hemisphere) to WGS84 lon/lat in degrees. */
export function utm10ToLonLat(easting: number, northing: number): LonLat {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
    throw new RangeError(`utm10ToLonLat: non-finite input: easting ${easting}, northing ${northing}`);
  }
  const xi = northing / K0A;
  const eta = (easting - FALSE_EASTING) / K0A;
  let xi0 = xi;
  let eta0 = eta;
  for (let j = 1; j <= 4; j++) {
    const b = BETA[j - 1] as number;
    xi0 -= b * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    eta0 -= b * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xi0) / Math.cosh(eta0));
  let phi = chi;
  for (let j = 1; j <= 4; j++) phi += (DELTA[j - 1] as number) * Math.sin(2 * j * chi);
  const lam = Math.atan2(Math.sinh(eta0), Math.cos(xi0));
  return { lon: LON0_DEG + lam / DEG, lat: phi / DEG };
}

/** UTM 10N to world metres (x east, z south). */
export function utm10ToWorld(easting: number, northing: number): WorldXZ {
  return { x: easting - GRID_ORIGIN_EASTING, z: GRID_ORIGIN_NORTHING - northing };
}

/** World metres to UTM 10N. */
export function worldToUtm10(x: number, z: number): Utm {
  return { easting: x + GRID_ORIGIN_EASTING, northing: GRID_ORIGIN_NORTHING - z };
}

/** WGS84 degrees to world metres (x east, z south). Does not check grid bounds; see isInGrid. */
export function lonLatToWorld(lon: number, lat: number): WorldXZ {
  const u = lonLatToUtm10(lon, lat);
  return utm10ToWorld(u.easting, u.northing);
}

/** World metres to WGS84 degrees. */
export function worldToLonLat(x: number, z: number): LonLat {
  return utm10ToLonLat(x + GRID_ORIGIN_EASTING, GRID_ORIGIN_NORTHING - z);
}

/** True if the world position lies inside the 20 x 24 tile game grid. */
export function isInGrid(x: number, z: number): boolean {
  return x >= 0 && x < GRID_WIDTH_M && z <= 0 && z > -GRID_HEIGHT_M;
}

/** Region tile containing a world position. Throws if the position is outside the grid. */
export function worldToTile(x: number, z: number): TileCoord {
  if (!isInGrid(x, z)) throw new RangeError(`worldToTile: position outside the game grid: x ${x}, z ${z}`);
  return { tx: Math.floor(x / TILE_SIZE_M), ty: Math.floor((0 - z) / TILE_SIZE_M) };
}

/**
 * World-metre bounds of a region tile: x in [minX, maxX), z in (minZ, maxZ].
 * The tile's SW corner is (minX, maxZ) because z points south.
 */
export function tileBounds(tx: number, ty: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || tx >= GRID_TILES_X || ty < 0 || ty >= GRID_TILES_Y) {
    throw new RangeError(`tileBounds: tile out of range: (${tx}, ${ty})`);
  }
  return {
    minX: tx * TILE_SIZE_M,
    maxX: (tx + 1) * TILE_SIZE_M,
    minZ: -(ty + 1) * TILE_SIZE_M,
    maxZ: 0 - ty * TILE_SIZE_M,
  };
}
