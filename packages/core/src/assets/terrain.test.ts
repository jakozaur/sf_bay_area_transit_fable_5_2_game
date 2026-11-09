import { expect, test } from 'vitest';
import { SEA_LEVEL_M } from '../frame.ts';
import { Material } from '../materials.ts';
import {
  ColumnUnit,
  columnRockheadM,
  columnUnit,
  decodeTerrainRaster,
  encodeTerrainRaster,
  isWaterColumn,
  materialAt,
  packColumnClass,
  parseTerrainHeader,
  TERRAIN_HEADER_BYTES,
  type TerrainRaster,
  terrainClassAt,
  terrainHeightM,
} from './terrain.ts';

// The codec is tested here with an identity "deflate" (core has no dependencies); the pipeline
// tests repeat the round trip with a real zlib stream.
const identity = (b: Uint8Array): Uint8Array => b.slice();

function makeRaster(kind: 'far' | 'dem', cols: number, rows: number): TerrainRaster {
  const heights = new Int16Array(cols * rows);
  const classes = new Uint8Array(cols * rows);
  let s = 12345;
  for (let i = 0; i < heights.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    heights[i] = (s >>> 8) & 0xffff;
    classes[i] = s >>> 24;
  }
  // Extremes, to exercise the 16-bit wrap of the deltas.
  heights[0] = -32768;
  heights[1] = 32767;
  heights[cols] = 32767;
  return { kind, cols, rows, cellM: kind === 'far' ? 64 : 8, originX: 18432, originN: 61440, heights, classes };
}

test('terrain raster round-trips bit-exactly for both kinds', () => {
  for (const kind of ['far', 'dem'] as const) {
    const r = makeRaster(kind, 37, 23);
    const file = encodeTerrainRaster(r, identity);
    expect(file.length).toBe(TERRAIN_HEADER_BYTES + 37 * 23 * 3);
    const header = parseTerrainHeader(file);
    expect(header).toEqual({
      kind,
      cols: 37,
      rows: 23,
      cellM: r.cellM,
      originX: 18432,
      originN: 61440,
      rawBytes: 37 * 23 * 3,
      payloadBytes: 37 * 23 * 3,
    });
    const back = decodeTerrainRaster(file, identity);
    expect(back.kind).toBe(kind);
    expect(Array.from(back.heights)).toEqual(Array.from(r.heights));
    expect(Array.from(back.classes)).toEqual(Array.from(r.classes));
  }
});

test('decoder works on a view with a byte offset', () => {
  const file = encodeTerrainRaster(makeRaster('dem', 5, 4), identity);
  const padded = new Uint8Array(file.length + 7);
  padded.set(file, 7);
  const back = decodeTerrainRaster(padded.subarray(7), identity);
  expect(back.heights[1]).toBe(32767);
});

test('decoder rejects corrupt files with a diagnostic', () => {
  const file = encodeTerrainRaster(makeRaster('far', 4, 4), identity);
  const badMagic = file.slice();
  badMagic[0] = 0;
  expect(() => parseTerrainHeader(badMagic)).toThrow(/bad magic/);
  const badVersion = file.slice();
  badVersion[4] = 9;
  expect(() => parseTerrainHeader(badVersion)).toThrow(/version 9/);
  expect(() => parseTerrainHeader(file.subarray(0, file.length - 1))).toThrow(/header says/);
  expect(() => parseTerrainHeader(file.subarray(0, 10))).toThrow(/too short/);
  expect(() => decodeTerrainRaster(file, (z) => z.subarray(1))).toThrow(/inflated 47 bytes/);
  expect(() => encodeTerrainRaster({ ...makeRaster('far', 4, 4), cols: 5 }, identity)).toThrow(/expected 20 samples/);
});

test('far sampling reads the containing cell, row 0 at the south edge', () => {
  const r: TerrainRaster = {
    kind: 'far',
    cols: 2,
    rows: 2,
    cellM: 64,
    originX: 0,
    originN: 0,
    heights: Int16Array.from([10, 20, 30, 40]),
    classes: Uint8Array.from([1, 2, 3, 4]),
  };
  expect(terrainHeightM(r, 1, -1)).toBe(1);
  expect(terrainHeightM(r, 127, -1)).toBe(2);
  expect(terrainHeightM(r, 1, -65)).toBe(3);
  expect(terrainHeightM(r, 100, -127.5)).toBe(4);
  expect(terrainClassAt(r, 100, -127.5)).toBe(4);
  expect(() => terrainHeightM(r, 128, -1)).toThrow(/outside the far raster/);
  expect(() => terrainHeightM(r, 1, 1)).toThrow(/outside the far raster/);
});

test('dem sampling is bilinear between nodes and includes both edges', () => {
  const r: TerrainRaster = {
    kind: 'dem',
    cols: 3,
    rows: 2,
    cellM: 8,
    originX: 2048,
    originN: 4096,
    heights: Int16Array.from([0, 100, 200, 400, 500, 600]),
    classes: Uint8Array.from([1, 2, 3, 4, 5, 6]),
  };
  expect(terrainHeightM(r, 2048, -4096)).toBe(0);
  expect(terrainHeightM(r, 2064, -4104)).toBe(60);
  expect(terrainHeightM(r, 2052, -4100)).toBeCloseTo(25, 10);
  expect(terrainHeightM(r, 2060, -4096)).toBeCloseTo(15, 10);
  expect(terrainClassAt(r, 2059, -4101)).toBe(5);
  expect(terrainClassAt(r, 2051, -4099)).toBe(1);
  expect(() => terrainHeightM(r, 2064.5, -4096)).toThrow(/outside the dem raster/);
});

test('column class packs unit and rockhead level', () => {
  const c = packColumnClass(ColumnUnit.FILL_OVER_SAND, 15);
  expect(c).toBeLessThan(256);
  expect(columnUnit(c)).toBe(ColumnUnit.FILL_OVER_SAND);
  expect(columnRockheadM(c)).toBe(60);
  expect(isWaterColumn(c)).toBe(false);
  expect(isWaterColumn(packColumnClass(ColumnUnit.WATER, 31))).toBe(true);
  expect(() => packColumnClass(6, 0)).toThrow(/unknown unit/);
  expect(() => packColumnClass(ColumnUnit.ROCK, 32)).toThrow(/rockhead level/);
});

/** Material at every whole metre down to 140 m, collapsed to the sequence of [material, topDepth]. */
function strata(surface: number, cls: number): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 0; d <= 140; d++) {
    const m = materialAt(surface, d, cls);
    if (out.length === 0 || (out[out.length - 1] as [number, number])[0] !== m) out.push([m, d]);
  }
  return out;
}

test('materialAt: made land over sand matches the SoMa calibration column', () => {
  // Surface 4 m NAVD88, rockhead 60 m: fill to 3 m below sea level, Bay Mud, Colma sand, Old Bay Clay, rock.
  const cls = packColumnClass(ColumnUnit.FILL_OVER_SAND, 15);
  expect(strata(SEA_LEVEL_M + 3, cls)).toEqual([
    [Material.FILL, 0],
    [Material.BAY_MUD, 6],
    [Material.SAND, 24],
    [Material.STIFF_CLAY, 36],
    [Material.ROCK, 60],
  ]);
});

test('materialAt: every unit ends in rock at its rockhead and never returns air or water', () => {
  expect(strata(120, packColumnClass(ColumnUnit.ROCK, 0))).toEqual([[Material.ROCK, 0]]);
  expect(strata(-12, packColumnClass(ColumnUnit.WATER, 31))).toEqual([
    [Material.BAY_MUD, 0],
    [Material.ALLUVIUM, 35],
    [Material.STIFF_CLAY, 65],
    [Material.ROCK, 124],
  ]);
  expect(strata(30, packColumnClass(ColumnUnit.ALLUVIUM, 30))).toEqual([
    [Material.ALLUVIUM, 0],
    [Material.STIFF_CLAY, 40],
    [Material.ROCK, 120],
  ]);
  expect(strata(40, packColumnClass(ColumnUnit.SAND, 6))).toEqual([
    [Material.SAND, 0],
    [Material.STIFF_CLAY, 10],
    [Material.ROCK, 24],
  ]);
  // Shallow rock cuts the sequence short: fill straight onto rock.
  expect(strata(3, packColumnClass(ColumnUnit.FILL_OVER_ALLUVIUM, 1))).toEqual([
    [Material.FILL, 0],
    [Material.ROCK, 4],
  ]);
  for (let unit = 0; unit <= ColumnUnit.SAND; unit++) {
    for (let level = 0; level <= 31; level++) {
      for (const surface of [-60, 0, 2, 9, 300]) {
        for (const [m] of strata(surface, packColumnClass(unit, level))) {
          expect(m).toBeGreaterThanOrEqual(Material.FILL);
          expect(m).toBeLessThanOrEqual(Material.ROCK);
        }
      }
    }
  }
});

test('materialAt: fill thickness follows the surface height within 3 to 10 m', () => {
  const cls = packColumnClass(ColumnUnit.FILL_OVER_ALLUVIUM, 31);
  expect(strata(SEA_LEVEL_M, cls)[1]).toEqual([Material.BAY_MUD, 3]);
  expect(strata(SEA_LEVEL_M + 2, cls)[1]).toEqual([Material.BAY_MUD, 5]);
  expect(strata(SEA_LEVEL_M + 30, cls)[1]).toEqual([Material.BAY_MUD, 10]);
});

test('materialAt rejects invalid input', () => {
  expect(() => materialAt(0, -1, 0)).toThrow(/depthBelowSurface/);
  expect(() => materialAt(0, Number.NaN, 0)).toThrow(/depthBelowSurface/);
  expect(() => materialAt(0, 1, 7)).toThrow(/invalid column class/);
  expect(() => materialAt(0, 1, 256)).toThrow(/invalid column class/);
});
