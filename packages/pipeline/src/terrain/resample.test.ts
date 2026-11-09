import { DEM_TILE_NODES, lonLatToWorld, SITE_TILE_SIZE_M, terrainHeightM } from '@bayvox/core';
import { expect, test } from 'vitest';
import type { ColumnField } from '../far/classify.ts';
import { buildDemTile } from './dem-tiles.ts';
import { type ElevationSource, gridRectPixelBounds, gridToPixel, quantizeHeight, resampleCells, resampleNodes } from './resample.ts';

/**
 * A source that is an exact plane in grid metres: it inverts the Web Mercator pixel address back
 * to lon/lat, projects with core, and evaluates the plane. Resampling it must return the plane.
 */
function planeSource(z: number, f: (east: number, north: number) => number): ElevationSource {
  const size = 256 * 2 ** z;
  return {
    z,
    sample(px: number, py: number): number {
      const lon = (px / size) * 360 - 180;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / size))) * 180) / Math.PI;
      const w = lonLatToWorld(lon, lat);
      return f(w.x, 0 - w.z);
    },
  };
}

const plane = (e: number, n: number): number => 0.01 * e - 0.02 * n + 1500;

test('gridToPixel agrees with the known tile of Salesforce Transit Center', () => {
  const w = lonLatToWorld(-122.3962, 37.7897);
  const p = gridToPixel(w.x, 0 - w.z, 14);
  expect([Math.floor(p.px / 256), Math.floor(p.py / 256)]).toEqual([2621, 6331]);
});

test('gridRectPixelBounds contains every interior sample', () => {
  const rect = { minE: 0, minN: 0, maxE: 81920, maxN: 98304 };
  const b = gridRectPixelBounds(12, rect);
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      const p = gridToPixel((rect.maxE * i) / 20, (rect.maxN * j) / 20, 12);
      expect(p.px >= b.minPx && p.px <= b.maxPx && p.py >= b.minPy && p.py <= b.maxPy).toBe(true);
    }
  }
});

test('resampleNodes reproduces a plane at the node positions, row 0 south', () => {
  const grid = { originE: 20480, originN: 63488, cols: 5, rows: 4, cellM: 8 };
  const h = resampleNodes(planeSource(14, plane), grid);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      expect(h[col + row * 5]).toBe(Math.round(plane(20480 + col * 8, 63488 + row * 8) * 10));
    }
  }
});

test('resampleCells returns the cell mean, which for a plane is the centre value', () => {
  const grid = { originE: 4096, originN: 8192, cols: 4, rows: 3, cellM: 64 };
  const h = resampleCells(planeSource(12, plane), grid, 2);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      expect(h[col + row * 4]).toBe(Math.round(plane(4096 + (col + 0.5) * 64, 8192 + (row + 0.5) * 64) * 10));
    }
  }
});

test('quantizeHeight refuses values that do not fit instead of clamping', () => {
  expect(quantizeHeight(-113.34, 'x')).toBe(-1133);
  expect(() => quantizeHeight(4000, 'cell (3, 4)')).toThrow(/4000 m at cell \(3, 4\) does not fit/);
  expect(() => quantizeHeight(Number.NaN, 'cell (0, 0)')).toThrow(/does not fit/);
});

test('adjacent DEM tiles share identical edge nodes and decode to the source plane', () => {
  const field: ColumnField = {
    cols: 1280,
    rows: 1536,
    cellM: 64,
    units: new Uint8Array(1280 * 1536).fill(4),
    rockheadM: new Float32Array(1280 * 1536).fill(40),
    sandy: new Uint8Array(1280 * 1536),
  };
  const src = planeSource(14, plane);
  const west = buildDemTile(src, field, 9, 31);
  const east = buildDemTile(src, field, 10, 31);
  const north = buildDemTile(src, field, 9, 32);
  expect([west.cols, west.rows, west.cellM]).toEqual([DEM_TILE_NODES, DEM_TILE_NODES, 8]);
  expect([east.originX, north.originN]).toEqual([10 * SITE_TILE_SIZE_M, 32 * SITE_TILE_SIZE_M]);
  const last = DEM_TILE_NODES - 1;
  for (let k = 0; k < DEM_TILE_NODES; k++) {
    expect(west.heights[last + k * DEM_TILE_NODES]).toBe(east.heights[k * DEM_TILE_NODES]);
    expect(west.classes[last + k * DEM_TILE_NODES]).toBe(east.classes[k * DEM_TILE_NODES]);
    expect(west.heights[k + last * DEM_TILE_NODES]).toBe(north.heights[k]);
  }
  // World z is south: grid north 31.5 tiles is z = -64512.
  expect(terrainHeightM(west, 9 * 2048 + 100, -(31 * 2048 + 1024))).toBeCloseTo(plane(9 * 2048 + 100, 31 * 2048 + 1024), 1);
  // Alluvium unit 4, rockhead 40 m = level 10.
  expect(west.classes[0]).toBe(4 | (10 << 3));
});
