/**
 * GroundQuery: what the ground is at any point of the game grid, without voxels. Backed by the whole-grid
 * far raster (64 m cells: mean surface height and geology class) and the procedural geology column
 * (core materialAt), and refined by a detail ColumnSource where one covers the point (the loaded site).
 * This is what makes a tunnel outside every voxel site a workable vector-only project: the sim reads the
 * ground class along it here, and tools pick the terrain here when the camera is at regional zoom.
 *
 * The answers match the voxel world where there is one: materialAt(x, y, z) of a point inside the detail
 * source is the material ChunkWorldStore generates for that voxel before any edit, buildings left out.
 */
import {
  ColumnUnit,
  materialAt as coreMaterialAt,
  Material,
  SEA_LEVEL_M,
  type TerrainRaster,
  VOXEL_SIZE_M,
  type WorldPos,
} from '@bayvox/core';
import { type ColumnSample, type ColumnSource, createColumnSample, type SubsurfaceMaterialFn } from './column-source.ts';
import type { Box2 } from './site-data.ts';

const UNIT_WATER = ColumnUnit.WATER;
const AIR = Material.AIR;
const WATER = Material.WATER;

/** One column of ground. All heights are world metres (y up, NAVD88). */
export interface GroundColumn {
  /** Top of the solid ground: the street on land, the bed under water. */
  surfaceM: number;
  /** Water surface over the column, Number.NEGATIVE_INFINITY on dry land. */
  waterLevelM: number;
  /** Depth of water over the bed, 0 on dry land. */
  waterDepthM: number;
  /** Geology class byte (core packColumnClass): the strata sequence under the column. */
  columnClass: number;
  /** Material of the topmost ground voxel where the site paints one (road, grass, pavement), else 0. */
  surfaceMaterial: number;
  /** 'site': from the detail source (1 m columns over an 8 m DEM). 'far': from the 64 m raster. */
  detail: 'site' | 'far';
}

export interface GroundHit {
  /** Where the ray meets the ground or the water surface. */
  point: WorldPos;
  /** True when the ray stopped on water. */
  water: boolean;
  distanceM: number;
  column: GroundColumn;
}

export interface GroundQuery {
  /** Plan extent the query answers for: the far raster, world metres. Use `contains` for the exact edge rule. */
  readonly bounds: Box2;
  contains(x: number, z: number): boolean;
  /** The column at a plan position. Fills and returns `out` when given. Throws outside `bounds`. */
  column(x: number, z: number, out?: GroundColumn): GroundColumn;
  /** Top of the solid ground. */
  surfaceM(x: number, z: number): number;
  /** What a camera sees from above: the water surface over water, else the ground. */
  topM(x: number, z: number): number;
  waterDepthM(x: number, z: number): number;
  /** Material id at a point: AIR above the ground, WATER in the water column, else the stratum (or the surface paint). */
  materialAt(x: number, y: number, z: number): number;
  /** Material of the solid ground `depthM` metres below its top (0: the topmost voxel). */
  materialAtDepth(x: number, z: number, depthM: number): number;
  /**
   * First point where a ray meets the ground or the water surface, or null if it does not within
   * `maxDistanceM` or inside `bounds`. Buildings are not hit. `direction` need not be normalized.
   */
  raycast(origin: WorldPos, direction: WorldPos, maxDistanceM: number): GroundHit | null;
}

export interface GroundQueryOptions {
  /**
   * Finer source used where its bounds cover the point; called on every query, so it may follow the
   * loaded site. Leave it out for answers that do not depend on what is loaded.
   */
  detail?: () => ColumnSource | undefined;
  /** Geology column. Default: core materialAt. */
  materialAt?: SubsurfaceMaterialFn;
  /** Voxel size the material layers are quantized to, as in ChunkWorldStore. Default VOXEL_SIZE_M. */
  voxelSizeM?: number;
}

/** Longest ray step outside and inside the detail source, metres: half a far cell, half a DEM node spacing. */
const FAR_STEP_M = 32;
const SITE_STEP_M = 4;
const MIN_STEP_M = 1;
const BISECTIONS = 20;

export function createGroundColumn(): GroundColumn {
  return { surfaceM: 0, waterLevelM: Number.NEGATIVE_INFINITY, waterDepthM: 0, columnClass: 0, surfaceMaterial: 0, detail: 'far' };
}

export function createGroundQuery(far: TerrainRaster, options: GroundQueryOptions = {}): GroundQuery {
  if (far.kind !== 'far') throw new RangeError(`createGroundQuery: need the 'far' raster, got '${far.kind}'`);
  const geology = options.materialAt ?? coreMaterialAt;
  const s = options.voxelSizeM ?? VOXEL_SIZE_M;
  if (!(s > 0) || !Number.isFinite(s)) throw new RangeError(`createGroundQuery: voxelSizeM must be finite and > 0, got ${s}`);
  const { cols, rows, cellM, originX, originN, heights, classes } = far;
  const bounds: Box2 = { minX: originX, maxX: originX + cols * cellM, minZ: 0 - (originN + rows * cellM), maxZ: 0 - originN };
  const sample: ColumnSample = createColumnSample();
  const scratch = createGroundColumn();
  const SEA = SEA_LEVEL_M;

  function column(x: number, z: number, out: GroundColumn = createGroundColumn()): GroundColumn {
    const site = options.detail?.();
    const sb = site?.bounds;
    if (site !== undefined && (sb === undefined || (x >= sb.minXM && x < sb.maxXM && z >= sb.minZM && z < sb.maxZM))) {
      site.sampleColumn(x, z, sample);
      if (sample.surfaceM !== Number.NEGATIVE_INFINITY) {
        out.surfaceM = sample.surfaceM;
        out.waterLevelM = sample.waterLevelM > sample.surfaceM ? sample.waterLevelM : Number.NEGATIVE_INFINITY;
        out.waterDepthM = Math.max(0, sample.waterLevelM - sample.surfaceM);
        out.columnClass = sample.columnClass;
        out.surfaceMaterial = sample.surfaceMaterial;
        out.detail = 'site';
        return out;
      }
    }
    const col = Math.floor((x - originX) / cellM);
    const row = Math.floor((0 - z - originN) / cellM);
    if (!(col >= 0 && col < cols && row >= 0 && row < rows)) {
      throw new RangeError(
        `GroundQuery: (x ${x}, z ${z}) is outside the game grid x [${bounds.minX}, ${bounds.maxX}) z [${bounds.minZ}, ${bounds.maxZ})`,
      );
    }
    const i = col + row * cols;
    const surfaceM = (heights[i] as number) / 10;
    const cls = classes[i] as number;
    const wet = (cls & 7) === UNIT_WATER;
    out.surfaceM = surfaceM;
    out.waterLevelM = wet ? SEA : Number.NEGATIVE_INFINITY;
    out.waterDepthM = wet ? Math.max(0, SEA - surfaceM) : 0;
    out.columnClass = cls;
    out.surfaceMaterial = 0;
    out.detail = 'far';
    return out;
  }

  function contains(x: number, z: number): boolean {
    return x >= bounds.minX && x < bounds.maxX && z > bounds.minZ && z <= bounds.maxZ;
  }

  function topOf(c: GroundColumn): number {
    return Math.max(c.waterLevelM, c.surfaceM);
  }

  /** Material of ground layer `layer` (voxel index along y) of a column with `ground` layers. */
  function solid(c: GroundColumn, ground: number, layer: number): number {
    if (c.surfaceMaterial !== 0 && layer === ground - 1) return c.surfaceMaterial;
    return geology(c.surfaceM, (ground - 1 - layer) * s, c.columnClass);
  }

  return {
    bounds,
    contains,
    column,
    surfaceM: (x, z) => column(x, z, scratch).surfaceM,
    topM: (x, z) => topOf(column(x, z, scratch)),
    waterDepthM: (x, z) => column(x, z, scratch).waterDepthM,
    materialAt(x, y, z) {
      if (!Number.isFinite(y)) throw new RangeError(`GroundQuery.materialAt: y is not finite: ${y}`);
      const c = column(x, z, scratch);
      const ground = Math.round(c.surfaceM / s);
      const layer = Math.floor(y / s);
      if (layer >= ground) return layer < Math.round(c.waterLevelM / s) ? WATER : AIR;
      return solid(c, ground, layer);
    },
    materialAtDepth(x, z, depthM) {
      if (!(depthM >= 0) || !Number.isFinite(depthM))
        throw new RangeError(`GroundQuery.materialAtDepth: depthM must be finite and >= 0, got ${depthM}`);
      const c = column(x, z, scratch);
      const ground = Math.round(c.surfaceM / s);
      return solid(c, ground, ground - 1 - Math.floor(depthM / s));
    },
    raycast(origin, direction, maxDistanceM) {
      const len = Math.hypot(direction.x, direction.y, direction.z);
      if (!(len > 0) || !Number.isFinite(len) || !Number.isFinite(origin.x + origin.y + origin.z)) {
        throw new RangeError(
          `GroundQuery.raycast: bad ray from (${origin.x}, ${origin.y}, ${origin.z}) along (${direction.x}, ${direction.y}, ${direction.z})`,
        );
      }
      if (!(maxDistanceM > 0)) throw new RangeError(`GroundQuery.raycast: maxDistanceM must be > 0, got ${maxDistanceM}`);
      const dx = direction.x / len;
      const dy = direction.y / len;
      const dz = direction.z / len;
      // Height of the ray above the visible top at distance t; +Infinity outside the grid.
      const above = (t: number): number => {
        const x = origin.x + dx * t;
        const z = origin.z + dz * t;
        if (!contains(x, z)) return Number.POSITIVE_INFINITY;
        return origin.y + dy * t - topOf(column(x, z, scratch));
      };
      let t0 = 0;
      let h0 = above(0);
      // Starting under the surface: the ray is already in the ground.
      if (h0 <= 0) return null;
      while (t0 < maxDistanceM) {
        const cap = scratch.detail === 'site' && h0 !== Number.POSITIVE_INFINITY ? SITE_STEP_M : FAR_STEP_M;
        const t1 = Math.min(maxDistanceM, t0 + Math.max(MIN_STEP_M, Math.min(cap, h0 * 0.5)));
        const h1 = above(t1);
        if (h1 <= 0) {
          let lo = t0;
          let hi = t1;
          for (let i = 0; i < BISECTIONS; i++) {
            const mid = (lo + hi) / 2;
            if (above(mid) <= 0) hi = mid;
            else lo = mid;
          }
          const x = origin.x + dx * hi;
          const z = origin.z + dz * hi;
          const c = column(x, z);
          return { point: { x, y: topOf(c), z }, water: c.waterLevelM > c.surfaceM, distanceM: hi, column: c };
        }
        if (t1 >= maxDistanceM) break;
        t0 = t1;
        h0 = h1;
      }
      return null;
    },
  };
}
