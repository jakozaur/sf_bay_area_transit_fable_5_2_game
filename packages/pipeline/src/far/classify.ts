/**
 * Column classification for the geology model (doc 02 section 7.2, without mapped geology):
 * every far-raster column gets a ColumnUnit and a rockhead depth from elevation, slope, and the
 * distances to steep upland (stand-in for mapped bedrock) and to water (stand-in for the 1850s
 * shoreline). Site DEM nodes inherit unit and rockhead from this field so tiers agree.
 * Deterministic: no noise, no randomness.
 */
import {
  ColumnUnit,
  HEIGHT_UNITS_PER_M,
  packColumnClass,
  ROCKHEAD_MAX_LEVEL,
  ROCKHEAD_MAX_M,
  ROCKHEAD_STEP_M,
  SEA_LEVEL_M,
  worldToLonLat,
} from '@bayvox/core';

export const CLASSIFY_PARAMS = {
  /** A land cell is rock outcrop when its slope is at least this (rise over run) ... */
  rockMinSlope: 0.06,
  /** ... and it stands at least this high (NAVD88 m); keeps levees and landfill mounds out. */
  rockMinHeightM: 20,
  /** Rockhead depth gained per metre of distance from the nearest rock cell (doc 02: k about 0.08). */
  rockheadPerM: 0.08,
  /** Made land: at most this far above sea level ... */
  fillMaxAboveSeaM: 5,
  /** ... flatter than this ... */
  fillMaxSlope: 0.03,
  /** ... and within this distance of water. */
  fillMaxWaterDistM: 1500,
  /** San Francisco peninsula: lowland here is dune and Colma sand rather than alluvium. */
  sandProvince: { west: -122.52, east: -122.35, south: 37.7, north: 37.84 },
} as const;

const SEA_UNITS = SEA_LEVEL_M * HEIGHT_UNITS_PER_M;

/**
 * Exact Euclidean distance, in cells, from every cell to the nearest cell where mask is non-zero
 * (Felzenszwalb and Huttenlocher lower-envelope transform). Throws if the mask is empty.
 */
export function distanceTransform(mask: Uint8Array, cols: number, rows: number): Float32Array {
  if (mask.length !== cols * rows) throw new RangeError(`distanceTransform: mask has ${mask.length} cells, expected ${cols * rows}`);
  const INF = 1e12;
  const sq = new Float64Array(cols * rows);
  let any = false;
  for (let i = 0; i < sq.length; i++) {
    if (mask[i] !== 0) any = true;
    else sq[i] = INF;
  }
  if (!any) throw new RangeError('distanceTransform: mask has no set cell');
  const n = Math.max(cols, rows);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len: number): void => {
    let k = 0;
    v[0] = 0;
    z[0] = Number.NEGATIVE_INFINITY;
    z[1] = Number.POSITIVE_INFINITY;
    for (let q = 1; q < len; q++) {
      let s = 0;
      for (;;) {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s > z[k]) break;
        k--;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Number.POSITIVE_INFINITY;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d[q] = (q - p) * (q - p) + f[p];
    }
  };
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) f[row] = sq[col + row * cols];
    pass(rows);
    for (let row = 0; row < rows; row++) sq[col + row * cols] = d[row];
  }
  for (let row = 0; row < rows; row++) {
    const base = row * cols;
    for (let col = 0; col < cols; col++) f[col] = sq[base + col];
    pass(cols);
    for (let col = 0; col < cols; col++) sq[base + col] = d[col];
  }
  const out = new Float32Array(cols * rows);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(sq[i]);
  return out;
}

/** Per-column geology inputs on the far grid (origin at the grid's SW corner, row 0 south). */
export interface ColumnField {
  cols: number;
  rows: number;
  cellM: number;
  /** ColumnUnit per cell. */
  units: Uint8Array;
  /** Rockhead depth below the surface in metres, 0 on rock cells, capped at ROCKHEAD_MAX_M. */
  rockheadM: Float32Array;
  /** 1 where the cell lies in the sand province. */
  sandy: Uint8Array;
}

/** 1 for every cell whose centre lies in the sand province lon/lat box. */
export function sandProvinceMask(cols: number, rows: number, cellM: number): Uint8Array {
  const box = CLASSIFY_PARAMS.sandProvince;
  const out = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ll = worldToLonLat((col + 0.5) * cellM, 0 - (row + 0.5) * cellM);
      if (ll.lon >= box.west && ll.lon < box.east && ll.lat >= box.south && ll.lat < box.north) out[col + row * cols] = 1;
    }
  }
  return out;
}

/**
 * Classify every column of a cell raster (heights in 0.1 m, row 0 south).
 * Slope is the central-difference gradient of the height clamped to sea level, so bathymetry next
 * to the shore does not read as a cliff.
 */
export function classifyColumns(heights: Int16Array, cols: number, rows: number, cellM: number, sandy: Uint8Array): ColumnField {
  const n = cols * rows;
  if (heights.length !== n || sandy.length !== n) throw new RangeError(`classifyColumns: expected ${n} cells`);
  const P = CLASSIFY_PARAMS;
  const water = new Uint8Array(n);
  const rock = new Uint8Array(n);
  const slope = new Float32Array(n);
  const clamped = (i: number): number => Math.max(heights[i], SEA_UNITS) / HEIGHT_UNITS_PER_M;
  for (let row = 0; row < rows; row++) {
    const rs = Math.max(row - 1, 0);
    const rn = Math.min(row + 1, rows - 1);
    for (let col = 0; col < cols; col++) {
      const i = col + row * cols;
      if (heights[i] < SEA_UNITS) {
        water[i] = 1;
        continue;
      }
      const cw = Math.max(col - 1, 0);
      const ce = Math.min(col + 1, cols - 1);
      const gx = ce > cw ? (clamped(ce + row * cols) - clamped(cw + row * cols)) / ((ce - cw) * cellM) : 0;
      const gn = rn > rs ? (clamped(col + rn * cols) - clamped(col + rs * cols)) / ((rn - rs) * cellM) : 0;
      slope[i] = Math.hypot(gx, gn);
      if (slope[i] >= P.rockMinSlope && heights[i] >= P.rockMinHeightM * HEIGHT_UNITS_PER_M) rock[i] = 1;
    }
  }
  const dRock = distanceTransform(rock, cols, rows);
  const dWater = distanceTransform(water, cols, rows);
  const units = new Uint8Array(n);
  const rockheadM = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rockheadM[i] = Math.min(ROCKHEAD_MAX_M, P.rockheadPerM * dRock[i] * cellM);
    if (rock[i] === 1) units[i] = ColumnUnit.ROCK;
    else if (water[i] === 1) units[i] = ColumnUnit.WATER;
    else if (
      heights[i] <= (SEA_LEVEL_M + P.fillMaxAboveSeaM) * HEIGHT_UNITS_PER_M &&
      slope[i] < P.fillMaxSlope &&
      dWater[i] * cellM <= P.fillMaxWaterDistM
    ) {
      units[i] = sandy[i] === 1 ? ColumnUnit.FILL_OVER_SAND : ColumnUnit.FILL_OVER_ALLUVIUM;
    } else units[i] = sandy[i] === 1 ? ColumnUnit.SAND : ColumnUnit.ALLUVIUM;
  }
  return { cols, rows, cellM, units, rockheadM, sandy };
}

function rockheadLevel(unit: number, rockheadM: number): number {
  if (unit === ColumnUnit.ROCK) return 0;
  // Non-rock columns always keep at least one step of cover over rock.
  return Math.min(ROCKHEAD_MAX_LEVEL, Math.max(1, Math.round(rockheadM / ROCKHEAD_STEP_M)));
}

/** Packed class bytes for the field's own cells. */
export function fieldClasses(field: ColumnField): Uint8Array {
  const out = new Uint8Array(field.units.length);
  for (let i = 0; i < out.length; i++) out[i] = packColumnClass(field.units[i], rockheadLevel(field.units[i], field.rockheadM[i]));
  return out;
}

/**
 * Packed class bytes for a node raster inside the field's extent (heights in 0.1 m, row 0 south).
 * WATER is decided by the node's own height; the land unit comes from the containing field cell
 * (made land where that cell is water); rockhead is bilinear between field cell centres.
 */
export function classifyNodes(
  field: ColumnField,
  heights: Int16Array,
  grid: { originE: number; originN: number; cols: number; rows: number; cellM: number },
): Uint8Array {
  const { cols, rows } = grid;
  if (heights.length !== cols * rows) throw new RangeError(`classifyNodes: expected ${cols * rows} nodes, got ${heights.length}`);
  const fc = field.cols;
  const fr = field.rows;
  const out = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    const n = grid.originN + row * grid.cellM;
    for (let col = 0; col < cols; col++) {
      const e = grid.originE + col * grid.cellM;
      if (!(e >= 0 && e <= fc * field.cellM && n >= 0 && n <= fr * field.cellM)) {
        throw new RangeError(`classifyNodes: node at grid (${e}, ${n}) is outside the column field`);
      }
      const cc = Math.min(Math.floor(e / field.cellM), fc - 1);
      const cr = Math.min(Math.floor(n / field.cellM), fr - 1);
      const cell = cc + cr * fc;
      const u = Math.min(Math.max(e / field.cellM - 0.5, 0), fc - 1);
      const v = Math.min(Math.max(n / field.cellM - 0.5, 0), fr - 1);
      const c0 = Math.min(Math.floor(u), fc - 2);
      const r0 = Math.min(Math.floor(v), fr - 2);
      const fu = u - c0;
      const fv = v - r0;
      const k = c0 + r0 * fc;
      const rh = field.rockheadM;
      const rockhead = (rh[k] * (1 - fu) + rh[k + 1] * fu) * (1 - fv) + (rh[k + fc] * (1 - fu) + rh[k + fc + 1] * fu) * fv;
      const i = col + row * cols;
      let unit: number;
      if (heights[i] < SEA_UNITS) unit = ColumnUnit.WATER;
      else if (field.units[cell] === ColumnUnit.WATER)
        unit = field.sandy[cell] === 1 ? ColumnUnit.FILL_OVER_SAND : ColumnUnit.FILL_OVER_ALLUVIUM;
      else unit = field.units[cell];
      out[i] = packColumnClass(unit, rockheadLevel(unit, rockhead));
    }
  }
  return out;
}
