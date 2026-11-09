/**
 * Terrain assets: binary layouts, browser-side decoders, column classes and the procedural
 * geology column model. Written by packages/pipeline (terrain stage), read by packages/world.
 * Zero dependencies: the caller injects the zlib inflate (fflate `unzlibSync`, or
 * `DecompressionStream('deflate')` through parseTerrainHeader + decodeTerrainPayload).
 *
 * FILES (paths relative to data/, listed in data/manifest.terrain.json):
 *   far/terrain.<hash>.bin                 kind 'far': the whole game grid at 64 m cells, 1,280 x 1,536
 *   sites/<siteId>/dem_<tx>_<ty>.<hash>.bin  kind 'dem': one 2,048 m site tile at 8 m node spacing, 257 x 257
 *
 * LAYOUT (both kinds, little-endian):
 *   0   u8[4]  magic: "BVFR" (far) or "BVDM" (dem)
 *   4   u16    format version (TERRAIN_FORMAT_VERSION)
 *   6   u16    header bytes (32)
 *   8   u16    cols (west to east)
 *   10  u16    rows (south to north)
 *   12  u16    cell size in metres (64 or 8)
 *   14  u16    height units per metre (10: heights are Int16 in 0.1 m, NAVD88)
 *   16  i32    originX: world x in metres of the west edge (far) or of node column 0 (dem)
 *   20  i32    originN: grid north in metres (n = -z) of the south edge (far) or of node row 0 (dem)
 *   24  u32    raw bytes: inflated payload length, cols * rows * 3
 *   28  u32    payload bytes: length of the zlib stream; the file is exactly 32 + payload bytes
 *   32  zlib stream (RFC 1950, what DecompressionStream('deflate') and fflate unzlibSync read)
 *
 * INFLATED PAYLOAD, n = cols * rows, sample index = col + row * cols, row 0 is the SOUTH row:
 *   [0, n)    low bytes of the height residuals
 *   [n, 2n)   high bytes of the height residuals
 *   [2n, 3n)  column class bytes
 * Height residual: height minus prediction, wrapped to a signed 16-bit value s, stored zigzag as
 * (s << 1) ^ (s >> 15). Prediction for sample (col, row), with W, S, SW the west, south and
 * south-west neighbours: col 0 predicts S (0 on row 0); row 0 predicts W; otherwise W + S - SW.
 *
 * REGISTRATION:
 *   far: cell (col, row) covers x in [originX + col * cell, +cell), n in [originN + row * cell, +cell).
 *        Its height is the mean over the cell (bathymetry included, negative below datum).
 *   dem: node (col, row) sits at x = originX + col * cell, n = originN + row * cell. A tile carries
 *        257 nodes per axis, so both edges are present and equal the neighbouring tile's edge nodes:
 *        bilinear interpolation never needs a second tile.
 *
 * COLUMN CLASS BYTE: bits 0..2 = ColumnUnit, bits 3..7 = rockhead level (depth to rock below the
 * surface in ROCKHEAD_STEP_M steps, 0..124 m). Unit WATER is set exactly when the stored height is
 * below SEA_LEVEL_M, so `columnUnit(c) === ColumnUnit.WATER` is the land/water test.
 */
import { GRID_ORIGIN_EASTING, GRID_ORIGIN_NORTHING, SEA_LEVEL_M } from '../frame.ts';
import { Material, type MaterialId } from '../materials.ts';

export const TERRAIN_FORMAT_VERSION = 1;
export const TERRAIN_HEADER_BYTES = 32;
/** Stored heights are Int16 in units of 1 / HEIGHT_UNITS_PER_M metres. */
export const HEIGHT_UNITS_PER_M = 10;
/** Node spacing of site DEM tiles in metres. */
export const DEM_CELL_M = 8;
/** Nodes per axis in a site DEM tile: 2,048 / 8 + 1. */
export const DEM_TILE_NODES = 257;

export type TerrainRasterKind = 'far' | 'dem';

const MAGIC: Record<TerrainRasterKind, readonly [number, number, number, number]> = {
  far: [0x42, 0x56, 0x46, 0x52],
  dem: [0x42, 0x56, 0x44, 0x4d],
};

export interface TerrainHeader {
  kind: TerrainRasterKind;
  cols: number;
  rows: number;
  cellM: number;
  /** World x in metres of the west edge (far) or node column 0 (dem). */
  originX: number;
  /** Grid north in metres (n = -z) of the south edge (far) or node row 0 (dem). */
  originN: number;
  rawBytes: number;
  payloadBytes: number;
}

export interface TerrainRaster {
  kind: TerrainRasterKind;
  cols: number;
  rows: number;
  cellM: number;
  originX: number;
  originN: number;
  /** NAVD88 height in 0.1 m, index col + row * cols, row 0 south. */
  heights: Int16Array;
  /** Column class bytes, same indexing. */
  classes: Uint8Array;
}

function checkDims(where: string, r: { kind: TerrainRasterKind; cols: number; rows: number; cellM: number }): void {
  const minDim = r.kind === 'dem' ? 2 : 1;
  for (const [name, v, lo] of [
    ['cols', r.cols, minDim],
    ['rows', r.rows, minDim],
    ['cellM', r.cellM, 1],
  ] as const) {
    if (!Number.isInteger(v) || v < lo || v > 0xffff) throw new RangeError(`${where}: ${name} out of range: ${v}`);
  }
}

/** Height prediction from already-coded neighbours (see the layout comment). i = col + row * cols. */
function predict(heights: Int16Array, cols: number, col: number, row: number, i: number): number {
  if (col === 0) return row === 0 ? 0 : heights[i - cols];
  if (row === 0) return heights[i - 1];
  return heights[i - 1] + heights[i - cols] - heights[i - cols - 1];
}

/** Encode a raster. `deflate` must return a zlib (RFC 1950) stream of its input. */
export function encodeTerrainRaster(r: TerrainRaster, deflate: (raw: Uint8Array) => Uint8Array): Uint8Array {
  checkDims('encodeTerrainRaster', r);
  const n = r.cols * r.rows;
  if (r.heights.length !== n || r.classes.length !== n) {
    throw new RangeError(`encodeTerrainRaster: expected ${n} samples, got ${r.heights.length} heights and ${r.classes.length} classes`);
  }
  if (!Number.isInteger(r.originX) || !Number.isInteger(r.originN)) {
    throw new RangeError(`encodeTerrainRaster: origin must be whole metres: (${r.originX}, ${r.originN})`);
  }
  const raw = new Uint8Array(n * 3);
  const heights = r.heights;
  const cols = r.cols;
  for (let row = 0, i = 0; row < r.rows; row++) {
    for (let col = 0; col < cols; col++, i++) {
      const signed = ((heights[i] - predict(heights, cols, col, row, i)) << 16) >> 16;
      const zigzag = ((signed << 1) ^ (signed >> 15)) & 0xffff;
      raw[i] = zigzag & 0xff;
      raw[n + i] = zigzag >> 8;
    }
  }
  raw.set(r.classes, 2 * n);
  const payload = deflate(raw);
  const file = new Uint8Array(TERRAIN_HEADER_BYTES + payload.length);
  const dv = new DataView(file.buffer);
  file.set(MAGIC[r.kind], 0);
  dv.setUint16(4, TERRAIN_FORMAT_VERSION, true);
  dv.setUint16(6, TERRAIN_HEADER_BYTES, true);
  dv.setUint16(8, r.cols, true);
  dv.setUint16(10, r.rows, true);
  dv.setUint16(12, r.cellM, true);
  dv.setUint16(14, HEIGHT_UNITS_PER_M, true);
  dv.setInt32(16, r.originX, true);
  dv.setInt32(20, r.originN, true);
  dv.setUint32(24, raw.length, true);
  dv.setUint32(28, payload.length, true);
  file.set(payload, TERRAIN_HEADER_BYTES);
  return file;
}

/** Parse and validate the 32-byte header. Throws on any mismatch; never guesses. */
export function parseTerrainHeader(file: Uint8Array): TerrainHeader {
  if (file.length < TERRAIN_HEADER_BYTES) throw new RangeError(`parseTerrainHeader: file too short: ${file.length} bytes`);
  let kind: TerrainRasterKind | undefined;
  for (const k of ['far', 'dem'] as const) {
    const m = MAGIC[k];
    if (file[0] === m[0] && file[1] === m[1] && file[2] === m[2] && file[3] === m[3]) kind = k;
  }
  if (kind === undefined) {
    throw new RangeError(`parseTerrainHeader: bad magic: ${Array.from(file.subarray(0, 4)).join(',')}`);
  }
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const version = dv.getUint16(4, true);
  if (version !== TERRAIN_FORMAT_VERSION) throw new RangeError(`parseTerrainHeader: unsupported format version ${version}`);
  const headerBytes = dv.getUint16(6, true);
  if (headerBytes !== TERRAIN_HEADER_BYTES) throw new RangeError(`parseTerrainHeader: unexpected header size ${headerBytes}`);
  const units = dv.getUint16(14, true);
  if (units !== HEIGHT_UNITS_PER_M) throw new RangeError(`parseTerrainHeader: unexpected height units per metre ${units}`);
  const header: TerrainHeader = {
    kind,
    cols: dv.getUint16(8, true),
    rows: dv.getUint16(10, true),
    cellM: dv.getUint16(12, true),
    originX: dv.getInt32(16, true),
    originN: dv.getInt32(20, true),
    rawBytes: dv.getUint32(24, true),
    payloadBytes: dv.getUint32(28, true),
  };
  checkDims('parseTerrainHeader', header);
  if (header.rawBytes !== header.cols * header.rows * 3) {
    throw new RangeError(`parseTerrainHeader: raw bytes ${header.rawBytes} do not match ${header.cols} x ${header.rows} x 3`);
  }
  if (file.length !== TERRAIN_HEADER_BYTES + header.payloadBytes) {
    throw new RangeError(`parseTerrainHeader: file is ${file.length} bytes, header says ${TERRAIN_HEADER_BYTES + header.payloadBytes}`);
  }
  return header;
}

/** The zlib stream of a terrain file (a view, not a copy). */
export function terrainPayload(file: Uint8Array): Uint8Array {
  return file.subarray(TERRAIN_HEADER_BYTES);
}

/** Rebuild the raster from a parsed header and the inflated payload. */
export function decodeTerrainPayload(header: TerrainHeader, raw: Uint8Array): TerrainRaster {
  if (raw.length !== header.rawBytes) {
    throw new RangeError(`decodeTerrainPayload: inflated ${raw.length} bytes, header says ${header.rawBytes}`);
  }
  const { cols, rows } = header;
  const n = cols * rows;
  const heights = new Int16Array(n);
  for (let row = 0, i = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++, i++) {
      const zigzag = raw[i] | (raw[n + i] << 8);
      // Int16Array storage wraps the sum back to 16 bits.
      heights[i] = predict(heights, cols, col, row, i) + ((zigzag >>> 1) ^ -(zigzag & 1));
    }
  }
  return {
    kind: header.kind,
    cols,
    rows,
    cellM: header.cellM,
    originX: header.originX,
    originN: header.originN,
    heights,
    classes: raw.slice(2 * n, 3 * n),
  };
}

/**
 * Decode a terrain file. `inflate` receives the zlib stream and the expected inflated size and
 * returns the inflated bytes (for example `(z, n) => unzlibSync(z, { out: new Uint8Array(n) })`).
 */
export function decodeTerrainRaster(file: Uint8Array, inflate: (zlib: Uint8Array, rawBytes: number) => Uint8Array): TerrainRaster {
  const header = parseTerrainHeader(file);
  return decodeTerrainPayload(header, inflate(terrainPayload(file), header.rawBytes));
}

function outside(fn: string, r: TerrainRaster, x: number, z: number): RangeError {
  return new RangeError(`${fn}: (x ${x}, z ${z}) is outside the ${r.kind} raster at origin (${r.originX}, n ${r.originN})`);
}

/**
 * Surface height in NAVD88 metres at a world position (x east, z south).
 * far: the value of the containing 64 m cell. dem: bilinear between the four surrounding nodes.
 * Throws if the position is outside the raster.
 */
export function terrainHeightM(r: TerrainRaster, x: number, z: number): number {
  const fx = (x - r.originX) / r.cellM;
  const fn = (0 - z - r.originN) / r.cellM;
  const { cols, rows, heights } = r;
  if (r.kind === 'far') {
    const col = Math.floor(fx);
    const row = Math.floor(fn);
    if (!(col >= 0 && col < cols && row >= 0 && row < rows)) throw outside('terrainHeightM', r, x, z);
    return heights[col + row * cols] / HEIGHT_UNITS_PER_M;
  }
  if (!(fx >= 0 && fx <= cols - 1 && fn >= 0 && fn <= rows - 1)) throw outside('terrainHeightM', r, x, z);
  const c0 = Math.min(Math.floor(fx), cols - 2);
  const r0 = Math.min(Math.floor(fn), rows - 2);
  const u = fx - c0;
  const v = fn - r0;
  const i = c0 + r0 * cols;
  const south = heights[i] * (1 - u) + heights[i + 1] * u;
  const north = heights[i + cols] * (1 - u) + heights[i + cols + 1] * u;
  return (south * (1 - v) + north * v) / HEIGHT_UNITS_PER_M;
}

/** Column class byte at a world position: the containing cell (far) or the nearest node (dem). */
export function terrainClassAt(r: TerrainRaster, x: number, z: number): number {
  const fx = (x - r.originX) / r.cellM;
  const fn = (0 - z - r.originN) / r.cellM;
  const col = r.kind === 'far' ? Math.floor(fx) : Math.round(fx);
  const row = r.kind === 'far' ? Math.floor(fn) : Math.round(fn);
  if (!(col >= 0 && col < r.cols && row >= 0 && row < r.rows)) throw outside('terrainClassAt', r, x, z);
  return r.classes[col + row * r.cols];
}

/**
 * Surface unit of a map column: which strata sequence materialAt lays under it. Values are frozen
 * (baked into terrain files). Derived by the pipeline from elevation, slope and distances only;
 * mapped geology polygons (doc 02 section 5) are not used yet.
 */
export const ColumnUnit = {
  /** Upland: Franciscan rock from the surface down. */
  ROCK: 0,
  /** Open water (surface height below SEA_LEVEL_M): Bay Mud on the bed. */
  WATER: 1,
  /** Made land (low flat ground near water): fill over Bay Mud over alluvium. */
  FILL_OVER_ALLUVIUM: 2,
  /** Made land on the San Francisco side: fill over Bay Mud over Colma sand. */
  FILL_OVER_SAND: 3,
  /** Alluvial plain: alluvium over stiff clay. */
  ALLUVIUM: 4,
  /** San Francisco lowland: dune and Colma sand over stiff clay. */
  SAND: 5,
} as const;

export type ColumnUnitId = (typeof ColumnUnit)[keyof typeof ColumnUnit];

/** Metres of rockhead depth per rockhead level. */
export const ROCKHEAD_STEP_M = 4;
export const ROCKHEAD_MAX_LEVEL = 31;
/** Deepest encodable rockhead: 124 m below the surface. Deeper rock is clamped to this. */
export const ROCKHEAD_MAX_M = ROCKHEAD_STEP_M * ROCKHEAD_MAX_LEVEL;

export function packColumnClass(unit: number, rockheadLevel: number): number {
  if (!Number.isInteger(unit) || unit < 0 || unit > ColumnUnit.SAND) throw new RangeError(`packColumnClass: unknown unit ${unit}`);
  if (!Number.isInteger(rockheadLevel) || rockheadLevel < 0 || rockheadLevel > ROCKHEAD_MAX_LEVEL) {
    throw new RangeError(`packColumnClass: rockhead level out of range: ${rockheadLevel}`);
  }
  return unit | (rockheadLevel << 3);
}

export function columnUnit(columnClass: number): number {
  return columnClass & 7;
}

/** Depth of rockhead below the surface in metres (0 for ROCK columns). */
export function columnRockheadM(columnClass: number): number {
  return (columnClass >> 3) * ROCKHEAD_STEP_M;
}

export function isWaterColumn(columnClass: number): boolean {
  return (columnClass & 7) === ColumnUnit.WATER;
}

// Module-level aliases: cross-module export reads are getter calls under Vitest's module runner.
const SEA = SEA_LEVEL_M;
const M_FILL = Material.FILL;
const M_BAY_MUD = Material.BAY_MUD;
const M_SAND = Material.SAND;
const M_ALLUVIUM = Material.ALLUVIUM;
const M_STIFF_CLAY = Material.STIFF_CLAY;
const M_ROCK = Material.ROCK;
const U_ROCK = ColumnUnit.ROCK;
const U_WATER = ColumnUnit.WATER;
const U_FILL_A = ColumnUnit.FILL_OVER_ALLUVIUM;
const U_FILL_S = ColumnUnit.FILL_OVER_SAND;
const U_SAND = ColumnUnit.SAND;
const U_MAX = ColumnUnit.SAND;

/** Fill thickness limits and the depth below sea level that fill reaches, metres. */
export const FILL_MIN_M = 3;
export const FILL_MAX_M = 10;
export const FILL_BELOW_SEA_M = 3;
/** Bay Mud thickness cap, metres (doc 02 section 7.2 rule 3). */
export const BAY_MUD_MAX_M = 35;
/** Bay Mud thickness as a fraction of rockhead depth: under made land, and under open water. */
export const BAY_MUD_FRACTION_LAND = 0.3;
export const BAY_MUD_FRACTION_WATER = 0.5;
/** Thickness limits of the surface sand in SAND columns, metres (doc 02 section 7.2 rule 4). */
export const SAND_MIN_M = 10;
export const SAND_MAX_M = 25;

/**
 * Procedural geology (doc 02 section 7.2, simplified): the material of the solid ground at
 * `depthBelowSurface` metres under a column whose top solid surface is at `surfaceHeight`
 * (NAVD88 metres; the bed for water columns) and whose class byte is `columnClass`.
 * depthBelowSurface is the depth of the voxel's top face: 0 for the top solid voxel.
 * Pure and deterministic: arithmetic and comparisons only, safe to call from sim code.
 * Never returns AIR or WATER; the caller places water above the bed up to SEA_LEVEL_M.
 *
 * Sequence, top down, cut off by ROCK at the column's rockhead depth R:
 *   ROCK unit:            ROCK
 *   FILL_OVER_* units:    FILL to 3 m below sea level (3..10 m thick), BAY_MUD min(35, 0.3 R),
 *                         then the upper third of what is left as ALLUVIUM or SAND, STIFF_CLAY below
 *   WATER unit:           BAY_MUD min(35, 0.5 R), upper third ALLUVIUM, STIFF_CLAY below
 *   ALLUVIUM unit:        upper third ALLUVIUM, STIFF_CLAY below
 *   SAND unit:            SAND for a third of R clamped to 10..25 m, STIFF_CLAY below
 */
export function materialAt(surfaceHeight: number, depthBelowSurface: number, columnClass: number): MaterialId {
  if (!(depthBelowSurface >= 0)) throw new RangeError(`materialAt: depthBelowSurface must be >= 0, got ${depthBelowSurface}`);
  const unit = columnClass & 7;
  if (unit > U_MAX || !(columnClass >= 0 && columnClass <= 255)) throw new RangeError(`materialAt: invalid column class ${columnClass}`);
  if (unit === U_ROCK) return M_ROCK;
  const rock = (columnClass >> 3) * ROCKHEAD_STEP_M;
  if (depthBelowSurface >= rock) return M_ROCK;
  let top = 0;
  if (unit === U_FILL_A || unit === U_FILL_S) {
    const fill = Math.min(FILL_MAX_M, Math.max(FILL_MIN_M, surfaceHeight - SEA + FILL_BELOW_SEA_M));
    if (depthBelowSurface < fill) return M_FILL;
    top = fill + Math.min(BAY_MUD_MAX_M, BAY_MUD_FRACTION_LAND * rock);
    if (depthBelowSurface < top) return M_BAY_MUD;
  } else if (unit === U_WATER) {
    top = Math.min(BAY_MUD_MAX_M, BAY_MUD_FRACTION_WATER * rock);
    if (depthBelowSurface < top) return M_BAY_MUD;
  }
  let upper = (rock - top) / 3;
  if (unit === U_SAND) upper = Math.min(SAND_MAX_M, Math.max(SAND_MIN_M, upper));
  if (depthBelowSurface < top + upper) return unit === U_SAND || unit === U_FILL_S ? M_SAND : M_ALLUVIUM;
  return M_STIFF_CLAY;
}

/** One served terrain file in the manifest fragment. */
export interface TerrainFileRef {
  /** Path relative to data/. */
  file: string;
  bytes: number;
  /** Lower-case hex sha256 of the file as served. */
  sha256: string;
}

export interface TerrainDemTileRef extends TerrainFileRef {
  /** Site-tile grid index (2,048 m tiles): tx east and ty north from the grid origin. */
  tx: number;
  ty: number;
}

export interface TerrainSiteEntry {
  id: string;
  title: string;
  /** World metres: [minX, minZ, maxX, maxZ]. */
  bbox: [number, number, number, number];
  /** Site-tile range: tiles tx0 .. tx0 + nx - 1, ty0 .. ty0 + ny - 1. */
  tileBox: { tx0: number; ty0: number; nx: number; ny: number };
  dem: { cellM: number; nodes: number; tiles: TerrainDemTileRef[] };
}

/** data/manifest.terrain.json: the terrain stage's part of the world manifest. */
export interface TerrainManifestFragment {
  format: 'bayvox-terrain';
  formatVersion: number;
  frame: {
    crs: 'EPSG:32610';
    originEasting: number;
    originNorthing: number;
    tileSizeM: number;
    tilesX: number;
    tilesY: number;
    seaLevelM: number;
  };
  heightUnitsPerM: number;
  far: TerrainFileRef & {
    cellM: number;
    cols: number;
    rows: number;
    rawBytes: number;
    minHeightM: number;
    maxHeightM: number;
    waterFraction: number;
  };
  sites: TerrainSiteEntry[];
  sources: { name: string; license: string; attribution: string; sha256: string }[];
  /** Sanity values measured from the written files by the pipeline run, metres. */
  checks: Record<string, number>;
}

/** Throws unless the fragment's frame block equals the constants compiled into the app. */
export function assertTerrainFrame(frame: TerrainManifestFragment['frame']): void {
  if (frame.originEasting !== GRID_ORIGIN_EASTING || frame.originNorthing !== GRID_ORIGIN_NORTHING || frame.seaLevelM !== SEA) {
    throw new RangeError(
      `assertTerrainFrame: terrain data was built for origin (${frame.originEasting}, ${frame.originNorthing}) and sea level ${frame.seaLevelM}, app expects (${GRID_ORIGIN_EASTING}, ${GRID_ORIGIN_NORTHING}) and ${SEA}`,
    );
  }
}
