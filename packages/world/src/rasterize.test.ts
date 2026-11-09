import { createRng, nextFloat } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { type GridSpec, type Ring, rasterizeBuildings, rasterizePolygon } from './rasterize.ts';

const GRID: GridSpec = { originXM: 100, originZM: -200, cellSizeM: 2, width: 40, depth: 30 };

function cover(grid: GridSpec, rings: readonly Ring[]): Uint8Array {
  const out = new Uint8Array(grid.width * grid.depth);
  rasterizePolygon(grid, rings, (iz, ix0, ix1) => {
    expect(ix0).toBeLessThan(ix1);
    for (let ix = ix0; ix < ix1; ix++) out[ix + iz * grid.width] = (out[ix + iz * grid.width] as number) + 1;
  });
  return out;
}

/** Reference: even-odd point-in-polygon at every cell centre. */
function coverBrute(grid: GridSpec, rings: readonly Ring[]): Uint8Array {
  const out = new Uint8Array(grid.width * grid.depth);
  for (let iz = 0; iz < grid.depth; iz++) {
    for (let ix = 0; ix < grid.width; ix++) {
      const x = grid.originXM + (ix + 0.5) * grid.cellSizeM;
      const z = grid.originZM + (iz + 0.5) * grid.cellSizeM;
      let inside = false;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
          const x0 = ring[j] as number;
          const z0 = ring[j + 1] as number;
          const x1 = ring[i] as number;
          const z1 = ring[i + 1] as number;
          if (z0 <= z !== z1 <= z && x >= x0 + ((z - z0) * (x1 - x0)) / (z1 - z0)) inside = !inside;
        }
      }
      if (inside) out[ix + iz * grid.width] = 1;
    }
  }
  return out;
}

const sum = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
const rect = (x0: number, z0: number, x1: number, z1: number): number[] => [x0, z0, x1, z0, x1, z1, x0, z1];

describe('rasterizePolygon', () => {
  test('an axis-aligned rectangle on cell boundaries covers exactly its cells, either winding', () => {
    const cw = cover(GRID, [rect(104, -196, 116, -186)]);
    expect(sum(cw)).toBe(6 * 5);
    expect(cw[2 + 2 * GRID.width]).toBe(1);
    expect(cw[7 + 6 * GRID.width]).toBe(1);
    expect(cw[8 + 6 * GRID.width]).toBe(0);
    expect(cw[7 + 7 * GRID.width]).toBe(0);
    expect(cw[1 + 2 * GRID.width]).toBe(0);
    const ccw = cover(GRID, [[104, -196, 104, -186, 116, -186, 116, -196]]);
    expect(ccw).toEqual(cw);
  });

  test('a cell is covered only when its centre is inside', () => {
    // Covers the centre of cell (0, 0) at (101, -199) but not of cell (1, 0) at (103, -199).
    expect([...cover(GRID, [rect(100.5, -199.5, 102.9, -198.5)]).subarray(0, 3)]).toEqual([1, 0, 0]);
    // Sliver between centres: nothing.
    expect(sum(cover(GRID, [rect(101.1, -199.9, 102.9, -197.1)]))).toBe(0);
  });

  test('polygons sharing an edge cover every cell exactly once: no gaps, no overlaps', () => {
    const rng = createRng(5);
    // A strip of quads with jittered shared vertical edges, each edge passing through cell centres at times.
    const xs = [100, 113, 125, 141, 163, 180];
    const top: number[] = xs.map((x) => x + (nextFloat(rng) - 0.5) * 6);
    const bottom: number[] = xs.map((x) => x + (nextFloat(rng) - 0.5) * 6);
    top[0] = bottom[0] = 100;
    top[5] = bottom[5] = 180;
    top[2] = 125; // exactly through cell centres x = 125
    bottom[2] = 125;
    const total = new Uint8Array(GRID.width * GRID.depth);
    for (let i = 0; i < 5; i++) {
      const quad = [top[i] as number, -200, top[i + 1] as number, -200, bottom[i + 1] as number, -140, bottom[i] as number, -140];
      const c = cover(GRID, [quad]);
      for (let j = 0; j < total.length; j++) total[j] = (total[j] as number) + (c[j] as number);
    }
    expect([...new Set(total)]).toEqual([1]);
  });

  test('holes use the even-odd rule', () => {
    const outer = rect(110, -190, 150, -160);
    const hole = rect(120, -180, 130, -170);
    const c = cover(GRID, [outer, hole]);
    expect(sum(c)).toBe(20 * 15 - 5 * 5);
    expect(c[12 + 12 * GRID.width]).toBe(0); // centre (125, -175) is in the hole
    expect(c[9 + 12 * GRID.width]).toBe(1);
    expect(c[15 + 12 * GRID.width]).toBe(1);
  });

  test('concave, self-touching and random polygons match brute-force point-in-polygon', () => {
    const lShape = [110, -190, 150, -190, 150, -175, 127, -175, 127, -150, 110, -150];
    const star: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 27 : 9;
      star.push(140 + r * Math.cos((i * Math.PI) / 5), -170 + r * Math.sin((i * Math.PI) / 5));
    }
    const bowtie = [110, -190, 160, -150, 160, -190, 110, -150];
    const rng = createRng(77);
    const shapes: number[][] = [lShape, star, bowtie];
    for (let s = 0; s < 40; s++) {
      const ring: number[] = [];
      const n = 3 + (s % 9);
      for (let i = 0; i < n; i++) ring.push(90 + nextFloat(rng) * 100, -210 + nextFloat(rng) * 80);
      shapes.push(ring);
    }
    for (const [i, ring] of shapes.entries()) {
      expect(cover(GRID, [ring]), `shape ${i}`).toEqual(coverBrute(GRID, [ring]));
    }
    expect(sum(cover(GRID, [lShape]))).toBeGreaterThan(100);
    expect(sum(cover(GRID, [star]))).toBeGreaterThan(100);
  });

  test('triangle area converges on the analytic area', () => {
    const fine: GridSpec = { originXM: 0, originZM: 0, cellSizeM: 0.25, width: 400, depth: 400 };
    const tri = [3.3, 4.1, 91.7, 20.9, 40.2, 88.8];
    const area = Math.abs((91.7 - 3.3) * (88.8 - 4.1) - (40.2 - 3.3) * (20.9 - 4.1)) / 2;
    const cells = sum(cover(fine, [tri]));
    expect(Math.abs(cells * 0.0625 - area) / area).toBeLessThan(0.002);
  });

  test('polygons are clipped to the grid and may lie wholly outside it', () => {
    expect(sum(cover(GRID, [rect(0, -1000, 1000, 1000)]))).toBe(GRID.width * GRID.depth);
    expect(sum(cover(GRID, [rect(90, -210, 104, -196)]))).toBe(2 * 2);
    expect(sum(cover(GRID, [rect(500, 500, 600, 600)]))).toBe(0);
    expect(sum(cover(GRID, [rect(-50, -190, 90, -180)]))).toBe(0);
  });

  test('rejects malformed rings naming the ring', () => {
    expect(() => cover(GRID, [[0, 0, 1, 1]])).toThrow(/ring 0 needs at least 3 x,z pairs, got 4 numbers/);
    expect(() => cover(GRID, [rect(0, 0, 1, 1), [0, 0, 1, 1, 2]])).toThrow(/ring 1 needs at least 3 x,z pairs, got 5 numbers/);
    expect(() => cover(GRID, [[0, 0, Number.NaN, 1, 2, 2]])).toThrow(/ring 0 vertex 1 is not finite/);
    expect(() => cover({ ...GRID, cellSizeM: 0 }, [rect(0, 0, 1, 1)])).toThrow(/cellSizeM must be finite and > 0, got 0/);
    expect(() => cover({ ...GRID, width: 2.5 }, [rect(0, 0, 1, 1)])).toThrow(/positive integers, got 2.5 x 30/);
  });
});

describe('rasterizeBuildings', () => {
  test('writes height and class, the taller footprint winning where they overlap', () => {
    const b = rasterizeBuildings(GRID, [
      { rings: [rect(104, -196, 116, -186)], heightM: 12.4, cls: 3 },
      { rings: [rect(112, -192, 124, -180)], heightM: 40, cls: 5 },
      { rings: [rect(112, -192, 114, -190)], heightM: 40, cls: 9 }, // tie with the tower: the earlier one stays
      { rings: [rect(160, -160, 162, -158)], heightM: 0.2, cls: 1 },
    ]);
    const at = (ix: number, iz: number) => [b.height[ix + iz * GRID.width], b.cls[ix + iz * GRID.width]];
    expect(b.grid).toBe(GRID);
    expect(b.heightScaleM).toBe(1);
    expect(at(2, 2)).toEqual([12, 3]);
    expect(at(6, 4)).toEqual([40, 5]); // overlap
    expect(at(11, 9)).toEqual([40, 5]);
    expect(at(0, 0)).toEqual([0, 0]);
    expect(at(30, 20)).toEqual([1, 1]); // heights round but never to zero
    for (let i = 0; i < b.height.length; i++) expect(b.height[i] === 0).toBe(b.cls[i] === 0);
  });

  test('height scale and validation', () => {
    const b = rasterizeBuildings(GRID, [{ rings: [rect(104, -196, 116, -186)], heightM: 12.4, cls: 3 }], 0.1);
    expect(b.height[2 + 2 * GRID.width]).toBe(124);
    const one =
      (heightM: number, cls: number, scale = 1) =>
      () =>
        rasterizeBuildings(GRID, [{ rings: [rect(0, 0, 1, 1)], heightM, cls }], scale);
    expect(one(0, 3)).toThrow(/building 0 heightM must be finite and > 0, got 0/);
    expect(one(10, 0)).toThrow(/building 0 cls must be an integer in \[1, 255\], got 0/);
    expect(one(10, 256)).toThrow(/cls must be an integer/);
    expect(one(7000, 3, 0.1)).toThrow(/building 0 height 7000 m overflows 16 bits at 0.1 m per unit/);
    expect(one(10, 3, 0)).toThrow(/heightScaleM must be finite and > 0, got 0/);
  });
});
