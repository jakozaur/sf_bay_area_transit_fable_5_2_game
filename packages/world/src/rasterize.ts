/**
 * Column grids and a pure-TS scanline polygon rasterizer (building footprints to a column grid).
 * No pipeline or DOM dependency: inputs are plain arrays in world metres.
 */

/**
 * A regular horizontal grid of columns in the world frame (x east, z south).
 * Cell (ix, iz) covers [originXM + ix * cellSizeM, +cellSizeM) x [originZM + iz * cellSizeM, +cellSizeM).
 * Data arrays are row-major with rows along z: index = ix + iz * width. Row 0 is the minimum z,
 * which is the NORTH edge because z points south.
 */
export interface GridSpec {
  originXM: number;
  originZM: number;
  cellSizeM: number;
  /** Cells along x. */
  width: number;
  /** Cells along z. */
  depth: number;
}

export function assertGridSpec(grid: GridSpec, what: string): void {
  if (!Number.isFinite(grid.originXM) || !Number.isFinite(grid.originZM)) {
    throw new RangeError(`${what}: grid origin must be finite, got (${grid.originXM}, ${grid.originZM})`);
  }
  if (!(grid.cellSizeM > 0) || !Number.isFinite(grid.cellSizeM)) {
    throw new RangeError(`${what}: grid cellSizeM must be finite and > 0, got ${grid.cellSizeM}`);
  }
  if (!Number.isInteger(grid.width) || !Number.isInteger(grid.depth) || grid.width < 1 || grid.depth < 1) {
    throw new RangeError(`${what}: grid width and depth must be positive integers, got ${grid.width} x ${grid.depth}`);
  }
}

/** A polygon ring as flat x, z pairs in world metres. Closed implicitly; either winding. */
export type Ring = ArrayLike<number>;

/**
 * Scanline rasterization of a polygon with holes (even-odd rule over all rings).
 * A cell is covered when its centre is inside. Edges are half-open, so two polygons sharing an
 * edge never both cover a cell and never leave a gap. Calls `span(iz, ix0, ix1)` for every
 * maximal run of covered cells in a row, ix1 exclusive, clipped to the grid.
 */
export function rasterizePolygon(grid: GridSpec, rings: readonly Ring[], span: (iz: number, ix0: number, ix1: number) => void): void {
  assertGridSpec(grid, 'rasterizePolygon');
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let edges = 0;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r] as Ring;
    if (ring.length % 2 !== 0 || ring.length < 6) {
      throw new RangeError(`rasterizePolygon: ring ${r} needs at least 3 x,z pairs, got ${ring.length} numbers`);
    }
    for (let i = 0; i < ring.length; i += 2) {
      const x = ring[i] as number;
      const z = ring[i + 1] as number;
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        throw new RangeError(`rasterizePolygon: ring ${r} vertex ${i / 2} is not finite: (${x}, ${z})`);
      }
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    edges += ring.length / 2;
  }
  if (edges === 0) return;

  const { originXM, originZM, cellSizeM, width, depth } = grid;
  // Rows whose centre z lies in [minZ, maxZ).
  const izFirst = Math.max(0, Math.ceil((minZ - originZM) / cellSizeM - 0.5));
  const izLast = Math.min(depth - 1, Math.ceil((maxZ - originZM) / cellSizeM - 0.5) - 1);
  const crossings = new Float64Array(edges);

  for (let iz = izFirst; iz <= izLast; iz++) {
    const zc = originZM + (iz + 0.5) * cellSizeM;
    let n = 0;
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r] as Ring;
      const len = ring.length;
      let x0 = ring[len - 2] as number;
      let z0 = ring[len - 1] as number;
      for (let i = 0; i < len; i += 2) {
        const x1 = ring[i] as number;
        const z1 = ring[i + 1] as number;
        // Half-open in z: an edge counts when exactly one endpoint is at or above the scanline.
        if (z0 <= zc !== z1 <= zc) crossings[n++] = x0 + ((zc - z0) * (x1 - x0)) / (z1 - z0);
        x0 = x1;
        z0 = z1;
      }
    }
    if (n === 0) continue;
    const xs = crossings.subarray(0, n).sort();
    let runStart = -1;
    let runEnd = -1;
    for (let k = 0; k + 1 < n; k += 2) {
      // Cells whose centre x lies in [xs[k], xs[k + 1]).
      const ix0 = Math.max(0, Math.ceil(((xs[k] as number) - originXM) / cellSizeM - 0.5));
      const ix1 = Math.min(width, Math.ceil(((xs[k + 1] as number) - originXM) / cellSizeM - 0.5));
      if (ix0 >= ix1) continue;
      if (ix0 === runEnd) {
        runEnd = ix1; // touching spans (a shared vertex) merge into one run
      } else {
        if (runEnd > runStart) span(iz, runStart, runEnd);
        runStart = ix0;
        runEnd = ix1;
      }
    }
    if (runEnd > runStart) span(iz, runStart, runEnd);
  }
}

export interface BuildingFootprint {
  /** Outer ring first, then holes. Flat x, z pairs in world metres. */
  rings: readonly Ring[];
  /** Height above the ground in metres, > 0. */
  heightM: number;
  /** Building class written to the class grid, 1 to 255. SiteColumnSource maps it to a material. */
  cls: number;
}

export interface BuildingGrid {
  grid: GridSpec;
  /** Building height above ground per cell in units of heightScaleM. 0 = no building. */
  height: Uint16Array;
  heightScaleM: number;
  /** Building class per cell. 0 = no building. */
  cls: Uint8Array;
}

/**
 * Rasterizes building footprints into a height/class column grid. Where footprints overlap the
 * taller one wins (ties: the earlier one). Heights are rounded to heightScaleM (default 1 m)
 * with a minimum of one unit; a height that does not fit in 16 bits throws.
 */
export function rasterizeBuildings(grid: GridSpec, buildings: readonly BuildingFootprint[], heightScaleM = 1): BuildingGrid {
  assertGridSpec(grid, 'rasterizeBuildings');
  if (!(heightScaleM > 0) || !Number.isFinite(heightScaleM)) {
    throw new RangeError(`rasterizeBuildings: heightScaleM must be finite and > 0, got ${heightScaleM}`);
  }
  const height = new Uint16Array(grid.width * grid.depth);
  const cls = new Uint8Array(grid.width * grid.depth);
  const width = grid.width;
  for (let b = 0; b < buildings.length; b++) {
    const building = buildings[b] as BuildingFootprint;
    if (!(building.heightM > 0) || !Number.isFinite(building.heightM)) {
      throw new RangeError(`rasterizeBuildings: building ${b} heightM must be finite and > 0, got ${building.heightM}`);
    }
    if (!Number.isInteger(building.cls) || building.cls < 1 || building.cls > 255) {
      throw new RangeError(`rasterizeBuildings: building ${b} cls must be an integer in [1, 255], got ${building.cls}`);
    }
    const units = Math.max(1, Math.round(building.heightM / heightScaleM));
    if (units > 0xffff) {
      throw new RangeError(
        `rasterizeBuildings: building ${b} height ${building.heightM} m overflows 16 bits at ${heightScaleM} m per unit`,
      );
    }
    const c = building.cls;
    rasterizePolygon(grid, building.rings, (iz, ix0, ix1) => {
      const row = iz * width;
      for (let ix = ix0; ix < ix1; ix++) {
        if (units > (height[row + ix] as number)) {
          height[row + ix] = units;
          cls[row + ix] = c;
        }
      }
    });
  }
  return { grid, height, heightScaleM, cls };
}
