/**
 * Column patches for the LOD tiers that are drawn as columns, not voxels (doc 04 section 9.1): fills the
 * padded 34 x 34 height and class grids that the column mesher (packages/mesher meshColumnPatch) takes.
 * A patch is 32 x 32 cells; patch (px, pz) of a field starts at the field origin plus 32 cells per index,
 * px east and pz south. Heights are integer vertical steps above the field's base height.
 */
import {
  CHUNK_SIZE,
  ColumnUnit,
  HEIGHT_UNITS_PER_M,
  Material,
  materialAt,
  PADDED_SIZE,
  SEA_LEVEL_M,
  type TerrainRaster,
} from '@bayvox/core';
import { type ColumnSample, type ColumnSource, createColumnSample } from './column-source.ts';

/** Cells per patch edge. */
export const PATCH_CELLS = CHUNK_SIZE;
/** Entries in a padded patch grid. */
export const PATCH_GRID_LENGTH = PADDED_SIZE * PADDED_SIZE;

export interface ColumnPatch {
  /** PATCH_GRID_LENGTH heights in vertical steps above the field's baseM; index (x + 1) + (z + 1) * 34. */
  heights: Int32Array;
  /** PATCH_GRID_LENGTH material ids; AIR marks a hole. */
  classes: Uint16Array;
}

export function createColumnPatch(): ColumnPatch {
  return { heights: new Int32Array(PATCH_GRID_LENGTH), classes: new Uint16Array(PATCH_GRID_LENGTH) };
}

/** Placement of a column field in the world. */
export interface ColumnFieldSpec {
  /** World x of the west edge of patch column 0 and world z of the north edge of patch row 0, metres. */
  originXM: number;
  originZM: number;
  cellM: number;
  /** Metres per vertical step. */
  stepM: number;
  /** World y of height 0. */
  baseM: number;
}

const P = PADDED_SIZE;
const N = PATCH_CELLS;
const AIR = Material.AIR;
const WATER = Material.WATER;
const ROCK = Material.ROCK;

/** How far below the base a field's outer skirt reaches, in steps: hides the gap to a coarser tier around it. */
const SKIRT_STEPS = 8;

/**
 * City tier: samples a ColumnSource at the centre of every cell of patch (px, pz). A column is as tall as
 * its building, else its water surface, else its ground, and takes that material. Cells outside the
 * source's data are holes inside the patch and a low skirt on its border.
 * Returns false if the patch has no data at all (nothing to mesh).
 */
export function sampleSourcePatch(
  source: ColumnSource,
  field: ColumnFieldSpec,
  px: number,
  pz: number,
  out: ColumnPatch,
  sample?: ColumnSample,
): boolean {
  const s = sample ?? createColumnSample();
  const { cellM, stepM, baseM } = field;
  const x0 = field.originXM + px * N * cellM;
  const z0 = field.originZM + pz * N * cellM;
  let any = false;
  for (let iz = -1; iz <= N; iz++) {
    for (let ix = -1; ix <= N; ix++) {
      const i = ix + 1 + (iz + 1) * P;
      source.sampleColumn(x0 + (ix + 0.5) * cellM, z0 + (iz + 0.5) * cellM, s);
      if (s.surfaceM === Number.NEGATIVE_INFINITY) {
        const border = ix < 0 || iz < 0 || ix >= N || iz >= N;
        out.heights[i] = -SKIRT_STEPS;
        out.classes[i] = border ? ROCK : AIR;
        continue;
      }
      let top = s.surfaceM;
      let material: number;
      if (s.buildingMaterial !== AIR && s.buildingTopM > top) {
        top = s.buildingTopM;
        material = s.buildingMaterial;
      } else if (s.waterLevelM > top) {
        top = s.waterLevelM;
        material = WATER;
      } else {
        material = s.surfaceMaterial !== AIR ? s.surfaceMaterial : materialAt(s.surfaceM, 0, s.columnClass);
      }
      out.heights[i] = Math.round((top - baseM) / stepM);
      out.classes[i] = material;
      if (ix >= 0 && iz >= 0 && ix < N && iz < N) any = true;
    }
  }
  return any;
}

/**
 * A coarser copy of a far raster for cheap renderers: `factor` x `factor` cells become one. Heights are
 * the mean of the block's water cells or of its land cells: a block is water when at least half its cells
 * are, else land. Its class byte is the most common one on that side (ties: the lowest value).
 */
export function coarsenFarRaster(far: TerrainRaster, factor: number): TerrainRaster {
  if (far.kind !== 'far') throw new RangeError(`coarsenFarRaster: need a 'far' raster, got '${far.kind}'`);
  if (!Number.isInteger(factor) || factor < 1 || far.cols % factor !== 0 || far.rows % factor !== 0) {
    throw new RangeError(`coarsenFarRaster: factor ${factor} does not divide the ${far.cols} x ${far.rows} raster`);
  }
  if (factor === 1) return far;
  const cols = far.cols / factor;
  const rows = far.rows / factor;
  const heights = new Int16Array(cols * rows);
  const classes = new Uint8Array(cols * rows);
  const votes = new Int32Array(256);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let waterCells = 0;
      let waterSum = 0;
      let landSum = 0;
      votes.fill(0);
      for (let dr = 0; dr < factor; dr++) {
        const k0 = col * factor + (row * factor + dr) * far.cols;
        for (let dc = 0; dc < factor; dc++) {
          const h = far.heights[k0 + dc] as number;
          const c = far.classes[k0 + dc] as number;
          votes[c] = (votes[c] as number) + 1;
          if ((c & 7) === ColumnUnit.WATER) {
            waterCells++;
            waterSum += h;
          } else {
            landSum += h;
          }
        }
      }
      const i = col + row * cols;
      const landCells = factor * factor - waterCells;
      const water = waterCells >= landCells;
      let best = -1;
      for (let c = 0; c < 256; c++) {
        if (((c & 7) === ColumnUnit.WATER) !== water) continue;
        if (best < 0 || (votes[c] as number) > (votes[best] as number)) best = c;
      }
      classes[i] = best;
      // Keep the invariant of the format: water cells are below sea level, land cells are not.
      heights[i] = water
        ? Math.min(Math.round(waterSum / waterCells), SEA_LEVEL_M * HEIGHT_UNITS_PER_M - 1)
        : Math.max(Math.round(landSum / landCells), SEA_LEVEL_M * HEIGHT_UNITS_PER_M);
    }
  }
  return { kind: 'far', cols, rows, cellM: far.cellM * factor, originX: far.originX, originN: far.originN, heights, classes };
}

/** Surface materials of the far tier, by what the 64 m cell is. */
export interface FarPalette {
  water: number;
  /** Upland (rock from the surface: slopes and hills). */
  upland: number;
  /** Lowland plains and made land. */
  lowland: number;
}

export const FAR_PALETTE: FarPalette = { water: Material.WATER, upland: Material.GRASS, lowland: Material.PAVEMENT };

/** Patches per axis that cover a far raster. */
export function farPatchCounts(far: TerrainRaster): { nx: number; nz: number } {
  if (far.kind !== 'far') throw new RangeError(`farPatchCounts: need a 'far' raster, got '${far.kind}'`);
  if (far.cols % N !== 0 || far.rows % N !== 0) {
    throw new RangeError(`farPatchCounts: far raster ${far.cols} x ${far.rows} is not a whole number of ${N}-cell patches`);
  }
  return { nx: far.cols / N, nz: far.rows / N };
}

/** The field of a far raster: origin at its north-west corner, base at sea level. */
export function farFieldSpec(far: TerrainRaster, stepM: number): ColumnFieldSpec {
  return { originXM: far.originX, originZM: 0 - (far.originN + far.rows * far.cellM), cellM: far.cellM, stepM, baseM: SEA_LEVEL_M };
}

/**
 * Far tier: patch (px, pz) of the whole-grid raster, pz counted from the north edge. Water cells are a
 * flat sheet at sea level (height 0); land is at least one step above it so the shoreline always shows.
 * Outside the raster the border is at sea level, which gives the world edge a skirt.
 */
export function sampleFarPatch(
  far: TerrainRaster,
  stepM: number,
  px: number,
  pz: number,
  out: ColumnPatch,
  palette: FarPalette = FAR_PALETTE,
): void {
  const { nx, nz } = farPatchCounts(far);
  if (!Number.isInteger(px) || !Number.isInteger(pz) || px < 0 || pz < 0 || px >= nx || pz >= nz) {
    throw new RangeError(`sampleFarPatch: patch (${px}, ${pz}) is outside the ${nx} x ${nz} patch grid`);
  }
  if (!(stepM > 0)) throw new RangeError(`sampleFarPatch: stepM must be > 0, got ${stepM}`);
  const { cols, rows, heights, classes } = far;
  const scale = 1 / (HEIGHT_UNITS_PER_M * stepM);
  for (let iz = -1; iz <= N; iz++) {
    // Raster rows run south to north; patch rows run north to south.
    const row = rows - 1 - (pz * N + iz);
    for (let ix = -1; ix <= N; ix++) {
      const col = px * N + ix;
      const i = ix + 1 + (iz + 1) * P;
      if (col < 0 || col >= cols || row < 0 || row >= rows) {
        out.heights[i] = 0;
        out.classes[i] = palette.water;
        continue;
      }
      const k = col + row * cols;
      const unit = (classes[k] as number) & 7;
      if (unit === ColumnUnit.WATER) {
        out.heights[i] = 0;
        out.classes[i] = palette.water;
      } else {
        out.heights[i] = Math.max(1, Math.round(((heights[k] as number) - SEA_LEVEL_M * HEIGHT_UNITS_PER_M) * scale));
        out.classes[i] = unit === ColumnUnit.ROCK ? palette.upland : palette.lowland;
      }
    }
  }
}
