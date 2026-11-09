/**
 * ColumnSource: the pluggable terrain input of ChunkWorldStore. One call describes one vertical
 * column of the world at a world-metre (x, z); the store turns columns into voxels lazily.
 * All heights are metres in the world frame (y up, NAVD88).
 */

/** Filled in by ColumnSource.sampleColumn. The store reuses one instance, so sources must set every field. */
export interface ColumnSample {
  /** Height of the ground top. Number.NEGATIVE_INFINITY means the column has no ground at all. */
  surfaceM: number;
  /** Material of the topmost ground voxel. 0 (AIR) means no cap: the subsurface function decides. */
  surfaceMaterial: number;
  /**
   * Geology class byte of the column, passed to the subsurface function: ColumnUnit in bits 0..2,
   * rockhead level in bits 3..7 (packColumnClass in core assets/terrain.ts). 0 is rock from the surface down.
   */
  columnClass: number;
  /** Building material, 0 (AIR) for no building. The building occupies [buildingBaseM, buildingTopM) above the ground. */
  buildingMaterial: number;
  buildingBaseM: number;
  buildingTopM: number;
  /** Water fills the column above the ground up to this height. Number.NEGATIVE_INFINITY means no water. */
  waterLevelM: number;
}

/** Horizontal extent a source can answer for, world metres, half-open [min, max). */
export interface ColumnBounds {
  minXM: number;
  minZM: number;
  maxXM: number;
  maxZM: number;
}

export interface ColumnSource {
  /**
   * Extent with real data. Absent means unbounded. Outside it sampleColumn must still answer
   * (an empty column: no ground, no water); ChunkWorldStore.ensureLoaded rejects boxes that leave it.
   */
  readonly bounds?: ColumnBounds;
  /** Describes the column at a world-metre position (the store passes voxel centres). Must be deterministic. */
  sampleColumn(xM: number, zM: number, out: ColumnSample): void;
}

/**
 * Material of a ground voxel. Same signature as materialAt in core assets/terrain.ts, which is the
 * default: the column's ground top height in metres, the depth in metres of the voxel's top face
 * below it (0 for the topmost ground voxel) and the column class byte.
 * Must be deterministic and return an integer material id.
 */
export type SubsurfaceMaterialFn = (surfaceHeightM: number, depthBelowSurfaceM: number, columnClass: number) => number;

export function createColumnSample(): ColumnSample {
  return {
    surfaceM: Number.NEGATIVE_INFINITY,
    surfaceMaterial: 0,
    columnClass: 0,
    buildingMaterial: 0,
    buildingBaseM: 0,
    buildingTopM: 0,
    waterLevelM: Number.NEGATIVE_INFINITY,
  };
}

/** Sets `out` to an empty column: no ground, no building, no water. */
export function clearColumnSample(out: ColumnSample): void {
  out.surfaceM = Number.NEGATIVE_INFINITY;
  out.surfaceMaterial = 0;
  out.columnClass = 0;
  out.buildingMaterial = 0;
  out.buildingBaseM = 0;
  out.buildingTopM = 0;
  out.waterLevelM = Number.NEGATIVE_INFINITY;
}
