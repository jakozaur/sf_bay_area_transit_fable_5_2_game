import { inflateSync } from 'node:zlib';
import { ColumnUnit, columnRockheadM, columnUnit, decodeTerrainRaster, encodeTerrainRaster, type TerrainRaster } from '@bayvox/core';
import { unzlibSync, zlibSync } from 'fflate';
import { expect, test } from 'vitest';
import { classifyColumns, classifyNodes, distanceTransform, fieldClasses } from './classify.ts';

test('distanceTransform equals brute force on a pseudo-random mask', () => {
  const cols = 23;
  const rows = 17;
  const mask = new Uint8Array(cols * rows);
  let s = 7;
  for (let i = 0; i < mask.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    if (s >>> 28 === 0) mask[i] = 1;
  }
  mask[5 + 3 * cols] = 1;
  const d = distanceTransform(mask, cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let best = Number.POSITIVE_INFINITY;
      for (let rr = 0; rr < rows; rr++)
        for (let cc = 0; cc < cols; cc++) if (mask[cc + rr * cols] === 1) best = Math.min(best, Math.hypot(cc - c, rr - r));
      expect(d[c + r * cols]).toBeCloseTo(best, 4);
    }
  }
  expect(() => distanceTransform(new Uint8Array(4), 2, 2)).toThrow(/no set cell/);
});

/**
 * 60 x 40 cells of 64 m, west to east: open water (cols 0..9, -5 m), flat low ground at 3 m
 * (cols 10..39), a 10% slope (cols 40..49) and a plateau at 64 m beyond. Heights in 0.1 m.
 */
function synthetic(): { heights: Int16Array; cols: number; rows: number } {
  const cols = 60;
  const rows = 40;
  const heights = new Int16Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const m = c < 10 ? -5 : c < 40 ? 3 : c < 50 ? 3 + (c - 39) * 6.4 : 67;
      heights[c + r * cols] = Math.round(m * 10);
    }
  }
  return { heights, cols, rows };
}

test('classifyColumns separates water, made land, lowland and rock, and grows rockhead away from rock', () => {
  const { heights, cols, rows } = synthetic();
  const sandy = new Uint8Array(cols * rows);
  for (let r = 0; r < 20; r++) for (let c = 0; c < cols; c++) sandy[c + r * cols] = 1;
  const f = classifyColumns(heights, cols, rows, 64, sandy);
  const unit = (c: number, r: number): number => f.units[c + r * cols];
  expect(unit(3, 30)).toBe(ColumnUnit.WATER);
  // Within 1,500 m of water (23 cells), flat and low: made land. Beyond: lowland.
  expect(unit(12, 30)).toBe(ColumnUnit.FILL_OVER_ALLUVIUM);
  expect(unit(12, 5)).toBe(ColumnUnit.FILL_OVER_SAND);
  expect(unit(36, 30)).toBe(ColumnUnit.ALLUVIUM);
  expect(unit(36, 5)).toBe(ColumnUnit.SAND);
  // The slope is rock only where it also stands 20 m or higher: cols 42..48 (15.8 m at col 41,
  // and the central difference at col 49 already sees the plateau: 0.05).
  expect(unit(41, 30)).toBe(ColumnUnit.ALLUVIUM);
  expect(unit(42, 30)).toBe(ColumnUnit.ROCK);
  expect(unit(48, 30)).toBe(ColumnUnit.ROCK);
  expect(unit(49, 30)).toBe(ColumnUnit.ALLUVIUM);
  // The flat plateau is not outcrop; col 51 sits three cells from it.
  expect(unit(51, 30)).toBe(ColumnUnit.ALLUVIUM);
  expect(f.rockheadM[51 + 30 * cols]).toBeCloseTo(0.08 * 3 * 64, 4);
  expect(f.rockheadM[45 + 30 * cols]).toBe(0);
  // 12 cells west of the first rock column; far out over the water the cap of 124 m applies.
  expect(f.rockheadM[30 + 30 * cols]).toBeCloseTo(0.08 * 12 * 64, 3);
  expect(f.rockheadM[3 + 30 * cols]).toBe(124);
  const classes = fieldClasses(f);
  expect(columnUnit(classes[45 + 30 * cols])).toBe(ColumnUnit.ROCK);
  expect(columnRockheadM(classes[45 + 30 * cols])).toBe(0);
  expect(columnRockheadM(classes[30 + 30 * cols])).toBe(60);
  expect(columnRockheadM(classes[3 + 30 * cols])).toBe(124);
  // A non-rock cell never gets rockhead 0.
  expect(columnRockheadM(classes[41 + 30 * cols])).toBeGreaterThanOrEqual(4);
});

test('classifyNodes decides water from the node height and inherits the land unit from the field', () => {
  const { heights, cols, rows } = synthetic();
  const f = classifyColumns(heights, cols, rows, 64, new Uint8Array(cols * rows));
  // Three nodes on row n = 1,600 m: over a water cell, over made land, over rock.
  const grid = { originE: 320, originN: 1600, cols: 3, rows: 1, cellM: 8 };
  const land = classifyNodes(f, Int16Array.from([25, 25, 25]), grid);
  // Field cell is water but the node is dry: made land.
  expect(columnUnit(land[0])).toBe(ColumnUnit.FILL_OVER_ALLUVIUM);
  const wet = classifyNodes(f, Int16Array.from([9, -40, 10]), grid);
  expect(Array.from(wet, columnUnit)).toEqual([ColumnUnit.WATER, ColumnUnit.WATER, ColumnUnit.FILL_OVER_ALLUVIUM]);
  const rock = classifyNodes(f, Int16Array.from([400]), { originE: 45 * 64 + 32, originN: 1600, cols: 1, rows: 1, cellM: 8 });
  expect(rock[0]).toBe(ColumnUnit.ROCK);
  // Rockhead is interpolated between field cell centres: halfway between cols 30 and 31.
  const mid = classifyNodes(f, Int16Array.from([30]), { originE: 31 * 64, originN: 1600, cols: 1, rows: 1, cellM: 8 });
  expect(columnRockheadM(mid[0])).toBe(Math.round((0.08 * 11.5 * 64) / 4) * 4);
  expect(() => classifyNodes(f, Int16Array.from([30]), { originE: 60 * 64 + 8, originN: 0, cols: 1, rows: 1, cellM: 8 })).toThrow(
    /outside the column field/,
  );
});

test('terrain files are real zlib streams: fflate and node:zlib both read them', () => {
  const { heights, cols, rows } = synthetic();
  const f = classifyColumns(heights, cols, rows, 64, new Uint8Array(cols * rows));
  const raster: TerrainRaster = { kind: 'far', cols, rows, cellM: 64, originX: 0, originN: 0, heights, classes: fieldClasses(f) };
  const file = encodeTerrainRaster(raster, (raw) => zlibSync(raw, { level: 9 }));
  expect(file.length).toBeLessThan(cols * rows);
  const viaFflate = decodeTerrainRaster(file, (z, n) => unzlibSync(z, { out: new Uint8Array(n) }));
  const viaNode = decodeTerrainRaster(file, (z) => new Uint8Array(inflateSync(z)));
  for (const back of [viaFflate, viaNode]) {
    expect(Array.from(back.heights)).toEqual(Array.from(heights));
    expect(Array.from(back.classes)).toEqual(Array.from(raster.classes));
  }
});
