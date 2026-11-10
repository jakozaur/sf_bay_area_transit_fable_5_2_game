import { ColumnUnit, Material, materialAt, packColumnClass, SEA_LEVEL_M, type TerrainRaster } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { ChunkWorldStore } from './chunk-store.ts';
import { createGroundQuery } from './ground-query.ts';
import { SyntheticColumnSource } from './synthetic-source.ts';

const LAND = packColumnClass(ColumnUnit.FILL_OVER_SAND, 10);
const SEA = packColumnClass(ColumnUnit.WATER, 8);
const HILL = packColumnClass(ColumnUnit.ROCK, 0);

/** 4 x 4 cells of 64 m at the grid origin. West half: bay 6 m deep. East half: land at 5 m, one 100 m hill at (3, 3). */
function far(): TerrainRaster {
  const heights = new Int16Array(16);
  const classes = new Uint8Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const i = col + row * 4;
      const wet = col < 2;
      heights[i] = wet ? -50 : 50;
      classes[i] = wet ? SEA : LAND;
    }
  }
  heights[15] = 1000;
  classes[15] = HILL;
  return { kind: 'far', cols: 4, rows: 4, cellM: 64, originX: 0, originN: 0, heights, classes };
}

describe('ground query on the far raster', () => {
  const q = createGroundQuery(far());

  test('surface, water depth and bounds', () => {
    expect(q.bounds).toEqual({ minX: 0, maxX: 256, minZ: -256, maxZ: 0 });
    expect(q.surfaceM(200, -30)).toBe(5);
    expect(q.waterDepthM(200, -30)).toBe(0);
    expect(q.topM(200, -30)).toBe(5);
    expect(q.surfaceM(30, -30)).toBe(-5);
    expect(q.waterDepthM(30, -30)).toBe(SEA_LEVEL_M + 5);
    expect(q.topM(30, -30)).toBe(SEA_LEVEL_M);
    expect(q.surfaceM(200, -200)).toBe(100);
    expect(q.column(200, -30).detail).toBe('far');
    expect(q.contains(300, -30)).toBe(false);
    expect(() => q.surfaceM(300, -30)).toThrow(/\(x 300, z -30\) is outside the game grid/);
  });

  test('material at a point and at depth follows the geology column', () => {
    expect(q.materialAt(200, 8, -30)).toBe(Material.AIR);
    expect(q.materialAt(200, 4.5, -30)).toBe(Material.FILL);
    expect(q.materialAt(200, -30, -30)).toBe(materialAt(5, 34, LAND));
    expect(q.materialAtDepth(200, -30, 34.2)).toBe(materialAt(5, 34, LAND));
    expect(q.materialAtDepth(200, -30, 60)).toBe(Material.ROCK);
    expect(q.materialAt(30, 0.5, -30)).toBe(Material.WATER);
    expect(q.materialAt(30, 1.5, -30)).toBe(Material.AIR);
    expect(q.materialAt(30, -5.5, -30)).toBe(Material.BAY_MUD);
    expect(() => q.materialAtDepth(200, -30, -1)).toThrow(/depthM must be finite and >= 0, got -1/);
  });

  test('raycast hits land, water and a hillside, and misses the sky', () => {
    const down = q.raycast({ x: 200, y: 500, z: -30 }, { x: 0, y: -1, z: 0 }, 1000);
    expect(down?.point.y).toBe(5);
    expect(down?.water).toBe(false);
    expect(down?.distanceM).toBeCloseTo(495, 3);
    const sea = q.raycast({ x: 200, y: 300, z: -30 }, { x: -1, y: -2, z: 0 }, 1000);
    expect(sea?.water).toBe(true);
    expect(sea?.point.y).toBe(SEA_LEVEL_M);
    expect(sea?.point.x).toBeCloseTo(200 - 299 / 2, 2);
    // Level ray at 50 m towards the hill: stops at its west face.
    const hill = q.raycast({ x: 140, y: 50, z: -220 }, { x: 1, y: 0, z: 0 }, 1000);
    expect(hill?.point.x).toBeCloseTo(192, 2);
    expect(q.raycast({ x: 140, y: 50, z: -220 }, { x: 0, y: 1, z: 0 }, 1000)).toBeNull();
    expect(q.raycast({ x: 140, y: 50, z: -220 }, { x: -1, y: 0, z: 0 }, 1000)).toBeNull();
    // From outside the grid, looking in.
    expect(q.raycast({ x: -500, y: 300, z: -30 }, { x: 1, y: -0.5, z: 0 }, 5000)?.point.x).toBeGreaterThan(0);
    expect(() => q.raycast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 10)).toThrow(/bad ray/);
  });
});

test('inside the detail source the query answers what the voxel world generates', () => {
  const source = new SyntheticColumnSource({ seed: 9, buildings: false });
  const big = far();
  big.originX = -128;
  big.originN = -128;
  const q = createGroundQuery(big, { detail: () => source });
  const store = new ChunkWorldStore({ source });
  let solid = 0;
  for (let x = -100; x < 100; x += 7) {
    for (let z = -100; z < 100; z += 11) {
      expect(q.column(x + 0.5, z + 0.5).detail).toBe('site');
      for (let y = -40; y < 60; y += 3) {
        const m = store.get(x, y, z);
        expect(q.materialAt(x + 0.5, y + 0.5, z + 0.5)).toBe(m);
        if (m > Material.WATER) solid++;
      }
    }
  }
  expect(solid).toBeGreaterThan(1000);
  // Without detail the same query falls back to the raster.
  expect(createGroundQuery(big, { detail: () => undefined }).column(0.5, 0.5).detail).toBe('far');
});
