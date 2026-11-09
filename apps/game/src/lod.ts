/**
 * Column LOD tiers (doc 04 section 9.1) built into the renderer:
 *   far   the whole-grid 64 m raster, always there;
 *   city  the loaded site at `cityCellM` (4 m by default) with building massing and street paint.
 * Voxel chunks replace the city tier inside the near field (a hole in the columns); beyond CITY_MAX_DISTANCE_M
 * the site is drawn from the far raster alone.
 */
import { SEA_LEVEL_M, type TerrainRaster } from '@bayvox/core';
import { type ColumnSlabMesh, createMesherScratch, meshColumnPatch } from '@bayvox/mesher';
import type { ColumnBatchPart, VoxelRenderer } from '@bayvox/render';
import {
  type ColumnFieldSpec,
  type ColumnSource,
  coarsenFarRaster,
  createColumnPatch,
  createColumnSample,
  farFieldSpec,
  farPatchCounts,
  PATCH_CELLS,
  sampleFarPatch,
  sampleSourcePatch,
} from '@bayvox/world';
import type { LodTiers, Rect } from './game-world.ts';

/** Vertical step of the far tier, metres, at its native 64 m cells; coarser rasters step proportionally. */
export const FAR_STEP_M = 4;
const FAR_STEP_CELLS = 16;
/** Patches per batch edge: one draw call per 8 x 8 patches. */
const BATCH_PATCHES = 8;
/** Camera to focus distance beyond which the site is drawn from the far raster (no city tier, no voxels). */
export const CITY_MAX_DISTANCE_M = 30_000;
/** Camera to focus distance beyond which the far tier is drawn from its coarse copy: a fine cell is under a pixel there. */
export const FAR_FINE_MAX_DISTANCE_M = 60_000;

export interface LodOptions {
  far: TerrainRaster;
  /** City tier input: a column source sampled at `cityCellM`, and the plan rectangle it covers. */
  city: { source: ColumnSource; bounds: Rect; cellM: number };
}

export interface LodBuild extends LodTiers {
  farQuads: number;
  cityQuads: number;
  batches: number;
}

function intersect(a: Rect | null, b: Rect | null): Rect | null {
  if (a === null || b === null) return null;
  const r: Rect = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] > r[0] && r[3] > r[1] ? r : null;
}

function quadsOf(meshes: readonly ColumnSlabMesh[]): number {
  let n = 0;
  for (const m of meshes) n += m.mesh.quads.length / 2;
  return n;
}

export function buildLod(renderer: VoxelRenderer, opts: LodOptions): LodBuild {
  const scratch = createMesherScratch();
  const patch = createColumnPatch();
  const input = { key: 0, size: PATCH_CELLS, heights: patch.heights, classes: patch.classes };
  let batches = 0;
  let farQuads = 0;
  const { far, city } = opts;
  const [cMinX, cMinZ, cMaxX, cMaxZ] = city.bounds;

  /**
   * One far tier from one raster. With `splitSite`, the patches under the city tier go into a batch of their
   * own (returned as `site`) so they can be shown only when the city tier is not.
   */
  const buildFar = (prefix: string, raster: TerrainRaster, splitSite: boolean): { ids: string[]; site: string | null } => {
    const stepM = Math.max(FAR_STEP_M, raster.cellM / FAR_STEP_CELLS);
    const field = farFieldSpec(raster, stepM);
    const patchM = PATCH_CELLS * raster.cellM;
    const { nx, nz } = farPatchCounts(raster);
    const underCity = (px: number, pz: number): boolean => {
      const x = field.originXM + px * patchM;
      const z = field.originZM + pz * patchM;
      return x >= cMinX && x + patchM <= cMaxX && z >= cMinZ && z + patchM <= cMaxZ;
    };
    const siteParts: ColumnBatchPart[] = [];
    const sitePx0 = Math.ceil((cMinX - field.originXM) / patchM);
    const sitePz0 = Math.ceil((cMinZ - field.originZM) / patchM);
    const place = (px: number, pz: number) => ({
      originXM: field.originXM + px * patchM,
      originYM: field.baseM,
      originZM: field.originZM + pz * patchM,
      cellM: raster.cellM,
      stepM,
    });
    const ids: string[] = [];
    for (let bz = 0; bz < nz; bz += BATCH_PATCHES) {
      for (let bx = 0; bx < nx; bx += BATCH_PATCHES) {
        const parts: ColumnBatchPart[] = [];
        for (let pz = bz; pz < Math.min(nz, bz + BATCH_PATCHES); pz++) {
          for (let px = bx; px < Math.min(nx, bx + BATCH_PATCHES); px++) {
            sampleFarPatch(raster, stepM, px, pz, patch);
            const meshes = meshColumnPatch(input, scratch);
            farQuads += quadsOf(meshes);
            const site = splitSite && underCity(px, pz);
            for (const { slab, mesh } of meshes) {
              if (site) siteParts.push({ px: px - sitePx0, pz: pz - sitePz0, slab, mesh });
              else parts.push({ px: px - bx, pz: pz - bz, slab, mesh });
            }
          }
        }
        const id = `${prefix}.${bx}.${bz}`;
        renderer.setColumnBatch(id, parts, place(bx, bz));
        ids.push(id);
        batches++;
      }
    }
    if (!splitSite) return { ids, site: null };
    const site = `${prefix}.site`;
    renderer.setColumnBatch(site, siteParts, place(sitePx0, sitePz0));
    batches++;
    return { ids, site };
  };

  // Far tier at the raster's own cell size, and a twice coarser copy for the whole-Bay view, where the fine
  // cells are smaller than a pixel. A raster that cannot be halved into whole patches has no coarse copy.
  const fine = buildFar('far', far, true);
  const FAR_SITE = fine.site;
  if (FAR_SITE === null) throw new Error('buildLod: the fine far tier has no site batch');
  renderer.setColumnBatchVisible(FAR_SITE, false);
  const halvable = (far.cols / 2) % PATCH_CELLS === 0 && (far.rows / 2) % PATCH_CELLS === 0;
  const coarse = halvable ? buildFar('far2', coarsenFarRaster(far, 2), false) : null;
  if (coarse !== null) for (const id of coarse.ids) renderer.setColumnBatchVisible(id, false);

  // City tier: 1 m vertical steps above sea level, so its surfaces line up with the voxel chunks.
  const cityField: ColumnFieldSpec = { originXM: cMinX, originZM: cMinZ, cellM: city.cellM, stepM: 1, baseM: SEA_LEVEL_M };
  const cityPatchM = PATCH_CELLS * city.cellM;
  const cnx = (cMaxX - cMinX) / cityPatchM;
  const cnz = (cMaxZ - cMinZ) / cityPatchM;
  if (!Number.isInteger(cnx) || !Number.isInteger(cnz)) {
    throw new RangeError(`buildLod: city bounds [${city.bounds.join(', ')}] are not a whole number of ${cityPatchM} m patches`);
  }
  const sample = createColumnSample();
  const cityIds: string[] = [];
  let cityQuads = 0;
  for (let bz = 0; bz < cnz; bz += BATCH_PATCHES) {
    for (let bx = 0; bx < cnx; bx += BATCH_PATCHES) {
      const parts: ColumnBatchPart[] = [];
      for (let pz = bz; pz < Math.min(cnz, bz + BATCH_PATCHES); pz++) {
        for (let px = bx; px < Math.min(cnx, bx + BATCH_PATCHES); px++) {
          if (!sampleSourcePatch(city.source, cityField, px, pz, patch, sample)) continue;
          const meshes = meshColumnPatch(input, scratch);
          cityQuads += quadsOf(meshes);
          for (const { slab, mesh } of meshes) parts.push({ px: px - bx, pz: pz - bz, slab, mesh });
        }
      }
      const id = `city.${bx}.${bz}`;
      renderer.setColumnBatch(id, parts, {
        originXM: cityField.originXM + bx * cityPatchM,
        originYM: cityField.baseM,
        originZM: cityField.originZM + bz * cityPatchM,
        cellM: city.cellM,
        stepM: cityField.stepM,
      });
      cityIds.push(id);
      batches++;
    }
  }

  let cityShown = true;
  let coarseShown = false;
  let hole: Rect | null = null;
  return {
    farQuads,
    cityQuads,
    batches,
    setCameraDistance(cameraDistanceM) {
      const showCity = cameraDistanceM <= CITY_MAX_DISTANCE_M;
      const showCoarse = coarse !== null && cameraDistanceM > FAR_FINE_MAX_DISTANCE_M;
      if (showCity !== cityShown || showCoarse !== coarseShown) {
        cityShown = showCity;
        coarseShown = showCoarse;
        for (const id of cityIds) renderer.setColumnBatchVisible(id, showCity);
        renderer.setChunksVisible(showCity);
        for (const id of fine.ids) renderer.setColumnBatchVisible(id, !showCoarse);
        renderer.setColumnBatchVisible(FAR_SITE, !showCity && !showCoarse);
        if (coarse !== null) for (const id of coarse.ids) renderer.setColumnBatchVisible(id, showCoarse);
      }
      return showCity;
    },
    setNearField(nearBox, nearReady) {
      // The hole follows the near field once it is complete; while chunks are still streaming in it only
      // shrinks (to the part both the old and the new near field cover), so no ground is ever missing.
      hole = nearReady ? nearBox : intersect(hole, nearBox);
      renderer.setColumnHole(cityShown ? hole : null);
    },
  };
}
