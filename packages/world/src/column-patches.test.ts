import { ColumnUnit, Material, packColumnClass, SEA_LEVEL_M, type TerrainRaster } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import {
  coarsenFarRaster,
  createColumnPatch,
  FAR_PALETTE,
  farFieldSpec,
  farPatchCounts,
  PATCH_GRID_LENGTH,
  sampleFarPatch,
  sampleSourcePatch,
} from './column-patches.ts';
import { type ColumnSample, type ColumnSource, clearColumnSample } from './column-source.ts';

const WATER = packColumnClass(ColumnUnit.WATER, 10);
const ROCK = packColumnClass(ColumnUnit.ROCK, 0);
const PLAIN = packColumnClass(ColumnUnit.ALLUVIUM, 20);

/** 64 x 32 cells of 64 m: west half water at -5 m, east half land rising 1 m per column; the two north rows are rock at 100 m. */
function far(): TerrainRaster {
  const cols = 64;
  const rows = 32;
  const heights = new Int16Array(cols * rows);
  const classes = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = col + row * cols;
      if (col < 32) {
        heights[i] = -50;
        classes[i] = WATER;
      } else if (row >= rows - 2) {
        heights[i] = 1000;
        classes[i] = ROCK;
      } else {
        heights[i] = (col - 30) * 10;
        classes[i] = PLAIN;
      }
    }
  }
  return { kind: 'far', cols, rows, cellM: 64, originX: 4096, originN: 8192, heights, classes };
}

const at = (x: number, z: number): number => x + 1 + (z + 1) * 34;

describe('far tier patches', () => {
  test('field and patch grid follow the raster: origin at the north-west corner, base at sea level', () => {
    expect(farPatchCounts(far())).toEqual({ nx: 2, nz: 1 });
    expect(farFieldSpec(far(), 4)).toEqual({ originXM: 4096, originZM: -(8192 + 32 * 64), cellM: 64, stepM: 4, baseM: SEA_LEVEL_M });
    expect(() => farPatchCounts({ ...far(), kind: 'dem' })).toThrow(/need a 'far' raster/);
    expect(() => farPatchCounts({ ...far(), cols: 60 })).toThrow(/not a whole number/);
  });

  test('water is a flat sheet at height 0; land is at least one step up and coloured by unit', () => {
    const patch = createColumnPatch();
    expect(patch.heights.length).toBe(PATCH_GRID_LENGTH);
    sampleFarPatch(far(), 4, 0, 0, patch);
    for (let z = 0; z < 32; z++) {
      for (let x = 0; x < 32; x++) {
        expect(patch.heights[at(x, z)]).toBe(0);
        expect(patch.classes[at(x, z)]).toBe(Material.WATER);
      }
    }
    // East border of the water patch is the first land column of the neighbour: 2 m, forced up to one step.
    expect(patch.heights[at(32, 10)]).toBe(1);
    expect(patch.classes[at(32, 10)]).toBe(FAR_PALETTE.lowland);
    // Outside the raster the border is sea.
    expect(patch.classes[at(-1, 10)]).toBe(Material.WATER);
    expect(patch.classes[at(10, 32)]).toBe(Material.WATER);

    sampleFarPatch(far(), 4, 1, 0, patch);
    // Patch rows count from the north: rows 0 and 1 are the rock ridge at 100 m = round(99 / 4) steps.
    expect(patch.heights[at(5, 0)]).toBe(25);
    expect(patch.classes[at(5, 1)]).toBe(FAR_PALETTE.upland);
    // Below it the plain: column 32 + 5 is 7 m, column 63 is 33 m = 8 steps.
    expect(patch.heights[at(5, 2)]).toBe(2);
    expect(patch.heights[at(31, 31)]).toBe(8);
    expect(patch.classes[at(31, 31)]).toBe(FAR_PALETTE.lowland);
    expect(patch.heights[at(-1, 5)]).toBe(0);
    expect(() => sampleFarPatch(far(), 4, 2, 0, patch)).toThrow(/patch \(2, 0\) is outside/);
    expect(() => sampleFarPatch(far(), 0, 0, 0, patch)).toThrow(/stepM/);
  });

  test('coarsening keeps water below sea level and land above it, by majority', () => {
    const coarse = coarsenFarRaster(far(), 2);
    expect(coarse).toMatchObject({ kind: 'far', cols: 32, rows: 16, cellM: 128, originX: 4096, originN: 8192 });
    expect(coarse.classes[0]).toBe(WATER);
    expect(coarse.heights[0]).toBe(-50);
    // Block of columns 32 and 33 (2 m and 3 m): mean 2.5 m.
    expect(coarse.heights[16]).toBe(25);
    expect(coarse.classes[16]).toBe(PLAIN);
    expect(coarse.classes[16 + 15 * 32]).toBe(ROCK);
    // A block that is half water becomes water, and stays below sea level whatever the mean.
    const mixed = far();
    mixed.heights[0] = 500;
    mixed.classes[0] = PLAIN;
    mixed.heights[1] = 500;
    mixed.classes[1] = PLAIN;
    const half = coarsenFarRaster(mixed, 2);
    expect(half.classes[0]).toBe(WATER);
    expect(half.heights[0]).toBe(-50);
    expect(coarsenFarRaster(far(), 1)).toEqual(far());
    expect(() => coarsenFarRaster(far(), 3)).toThrow(/factor 3 does not divide/);
  });
});

describe('city tier patches', () => {
  /** Ground at 5 m with a 40 m tower on x in [8, 16), water east of x = 64, nothing at all south of z = 96. */
  const source: ColumnSource = {
    sampleColumn(x: number, z: number, out: ColumnSample): void {
      clearColumnSample(out);
      if (z >= 96) return;
      out.surfaceM = x >= 64 ? -3 : 5;
      out.surfaceMaterial = x >= 64 ? 0 : Material.ROAD;
      out.columnClass = x >= 64 ? WATER : PLAIN;
      out.waterLevelM = x >= 64 ? SEA_LEVEL_M : Number.NEGATIVE_INFINITY;
      if (x >= 8 && x < 16) {
        out.buildingMaterial = Material.BUILDING_TOWER;
        out.buildingBaseM = 5;
        out.buildingTopM = 45;
      }
    },
  };
  const field = { originXM: 0, originZM: 0, cellM: 4, stepM: 1, baseM: SEA_LEVEL_M };

  test('a column is as tall as its building, water or ground, in steps above the base', () => {
    const patch = createColumnPatch();
    expect(sampleSourcePatch(source, field, 0, 0, patch)).toBe(true);
    // Cell 0 is ground at 5 m: 4 steps above sea level, painted as road.
    expect(patch.heights[at(0, 0)]).toBe(4);
    expect(patch.classes[at(0, 0)]).toBe(Material.ROAD);
    // Cells 2 and 3 (x 8 to 16) are the tower: roof at 45 m.
    expect(patch.heights[at(2, 0)]).toBe(44);
    expect(patch.classes[at(3, 5)]).toBe(Material.BUILDING_TOWER);
    // Cells from 16 (x 64) are water at sea level.
    expect(patch.heights[at(16, 0)]).toBe(0);
    expect(patch.classes[at(16, 0)]).toBe(Material.WATER);
    // No data south of z = 96 (cell 24): a hole inside the patch, a low rock skirt on its border.
    expect(patch.classes[at(0, 24)]).toBe(Material.AIR);
    expect(patch.classes[at(0, 32)]).toBe(Material.ROCK);
    expect(patch.heights[at(0, 32)]).toBeLessThan(0);
    // A patch with no data at all reports it.
    expect(sampleSourcePatch(source, field, 0, 1, patch)).toBe(false);
  });
});
