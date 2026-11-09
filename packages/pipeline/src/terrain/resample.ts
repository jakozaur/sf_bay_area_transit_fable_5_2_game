/** Resampling from Web Mercator terrarium mosaics to the UTM 10N world frame of packages/core. */
import { HEIGHT_UNITS_PER_M, worldToLonLat } from '@bayvox/core';
import { lonLatToPixel, type PixelXY } from './terrarium.ts';

/** Anything that returns an elevation in metres for global pixel coordinates at its zoom. */
export interface ElevationSource {
  readonly z: number;
  sample(px: number, py: number): number;
}

/** Grid metres (east, north from the grid origin) to global pixel coordinates at zoom z. */
export function gridToPixel(east: number, north: number, z: number): PixelXY {
  const ll = worldToLonLat(east, 0 - north);
  return lonLatToPixel(ll.lon, ll.lat, z);
}

/**
 * Global pixel bounds of a grid-metre rectangle. The rectangle's edges are slightly curved in
 * Web Mercator, so each edge is walked in 64 steps rather than taking the corners only.
 */
export function gridRectPixelBounds(
  z: number,
  rect: { minE: number; minN: number; maxE: number; maxN: number },
): { minPx: number; minPy: number; maxPx: number; maxPy: number } {
  const steps = 64;
  let minPx = Number.POSITIVE_INFINITY;
  let minPy = Number.POSITIVE_INFINITY;
  let maxPx = Number.NEGATIVE_INFINITY;
  let maxPy = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= steps; i++) {
    const e = rect.minE + ((rect.maxE - rect.minE) * i) / steps;
    const n = rect.minN + ((rect.maxN - rect.minN) * i) / steps;
    for (const p of [
      gridToPixel(e, rect.minN, z),
      gridToPixel(e, rect.maxN, z),
      gridToPixel(rect.minE, n, z),
      gridToPixel(rect.maxE, n, z),
    ]) {
      minPx = Math.min(minPx, p.px);
      minPy = Math.min(minPy, p.py);
      maxPx = Math.max(maxPx, p.px);
      maxPy = Math.max(maxPy, p.py);
    }
  }
  return { minPx, minPy, maxPx, maxPy };
}

/** Elevation in metres at a grid-metre position, bilinear in the source. */
export function sampleGrid(src: ElevationSource, east: number, north: number): number {
  const p = gridToPixel(east, north, src.z);
  return src.sample(p.px, p.py);
}

/** Metres to the stored Int16 unit (0.1 m). Throws instead of clamping when out of range. */
export function quantizeHeight(metres: number, where: string): number {
  const q = Math.round(metres * HEIGHT_UNITS_PER_M);
  if (!(q >= -32768 && q <= 32767)) throw new RangeError(`terrain: height ${metres} m at ${where} does not fit Int16 at 0.1 m`);
  return q;
}

/**
 * Cell-mean raster: cols x rows cells of `cellM` metres starting at the SW corner (originE, originN),
 * row 0 south. Each cell is the mean of sub x sub bilinear samples on a regular sub-lattice, which
 * box-filters sources finer than the cell. Heights are Int16 in 0.1 m.
 */
export function resampleCells(
  src: ElevationSource,
  grid: { originE: number; originN: number; cols: number; rows: number; cellM: number },
  sub: number,
): Int16Array {
  const { originE, originN, cols, rows, cellM } = grid;
  const out = new Int16Array(cols * rows);
  const step = cellM / sub;
  const inv = 1 / (sub * sub);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sum = 0;
      for (let sj = 0; sj < sub; sj++) {
        const n = originN + row * cellM + (sj + 0.5) * step;
        for (let si = 0; si < sub; si++) sum += sampleGrid(src, originE + col * cellM + (si + 0.5) * step, n);
      }
      out[col + row * cols] = quantizeHeight(sum * inv, `cell (${col}, ${row})`);
    }
  }
  return out;
}

/**
 * Node raster: cols x rows point samples spaced `cellM` metres starting at node (originE, originN),
 * row 0 south. Heights are Int16 in 0.1 m.
 */
export function resampleNodes(
  src: ElevationSource,
  grid: { originE: number; originN: number; cols: number; rows: number; cellM: number },
): Int16Array {
  const { originE, originN, cols, rows, cellM } = grid;
  const out = new Int16Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    const n = originN + row * cellM;
    for (let col = 0; col < cols; col++) {
      out[col + row * cols] = quantizeHeight(sampleGrid(src, originE + col * cellM, n), `node (${col}, ${row})`);
    }
  }
  return out;
}
