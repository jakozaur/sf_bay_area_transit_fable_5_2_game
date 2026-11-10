import { Material } from '@bayvox/core';
import { MemoryWorldStore } from '@bayvox/testkit';
import { expect, test } from 'vitest';
import { type Cutaway, cutawayFootprint, cutawayStrip, cylinderStrip, fillLayerRect, fillWallColumns, insideCutaway } from './slice.ts';
import { wallGeometryData } from './wall.ts';

function world(): MemoryWorldStore {
  const w = new MemoryWorldStore();
  w.applyEdit({ t: 'fillBox', min: { x: -50, y: -40, z: -50 }, max: { x: 50, y: -10, z: 50 }, material: Material.ROCK });
  w.applyEdit({ t: 'fillBox', min: { x: -50, y: -10, z: -50 }, max: { x: 50, y: 3, z: 50 }, material: Material.BAY_MUD });
  w.applyEdit({ t: 'fillBox', min: { x: 5, y: 3, z: -8 }, max: { x: 20, y: 30, z: 9 }, material: Material.BUILDING_TOWER });
  w.applyEdit({ t: 'carveCapsule', a: { x: -30, y: -20, z: 0 }, b: { x: 30, y: -20, z: 0 }, radius: 3.3 });
  return w;
}

const id = (out: Uint8Array, i: number): number => (out[i * 2] as number) | ((out[i * 2 + 1] as number) << 8);

test('fillWallColumns matches getVoxel for every texel, across chunk borders and negative coordinates', () => {
  const w = world();
  const xs = [-33.5, -3.2, 0.5, 12.9, 31.99, 70];
  const zs = [-40.1, 0.5, 0.5, 4, -33, 0];
  const rows = 80;
  const y0 = -45;
  const out = new Uint8Array(xs.length * rows * 2).fill(9);
  fillWallColumns(w, xs, zs, y0, rows, out);
  let solid = 0;
  for (let c = 0; c < xs.length; c++) {
    for (let r = 0; r < rows; r++) {
      const want = w.get(Math.floor(xs[c] as number), y0 + r, Math.floor(zs[c] as number));
      expect(id(out, r * xs.length + c)).toBe(want);
      if (want !== 0) solid++;
    }
  }
  expect(solid).toBeGreaterThan(150);
  expect(() => fillWallColumns(w, xs, zs, y0, rows, new Uint8Array(3))).toThrow(/out must have/);
  expect(() => fillWallColumns(w, [0], [0, 1], 0, 4, new Uint8Array(8))).toThrow(/z values/);
  expect(() => fillWallColumns(w, [Number.NaN], [0], 0, 1, new Uint8Array(2))).toThrow(/column 0 is not finite/);
});

test('fillLayerRect matches getVoxel over a rectangle that is not chunk aligned', () => {
  const w = world();
  const out = new Uint8Array(71 * 45 * 2).fill(9);
  fillLayerRect(w, -37, -20, 71, 45, -20, out);
  let air = 0;
  for (let z = 0; z < 45; z++) {
    for (let x = 0; x < 71; x++) {
      const want = w.get(-37 + x, -20, -20 + z);
      expect(id(out, z * 71 + x)).toBe(want);
      if (want === 0) air++;
    }
  }
  // The tunnel crosses the layer.
  expect(air).toBeGreaterThan(300);
  expect(() => fillLayerRect(w, 0, 0, 0, 4, 0, new Uint8Array(0))).toThrow(/bad rectangle/);
});

test('cylinderStrip: about a column per metre of arc, sampled half a metre outside the cut', () => {
  const s = cylinderStrip(1000, -2000, 160);
  expect(s.quads).toBe(Math.ceil(2 * Math.PI * 160));
  expect(s.xs.length).toBe(s.quads);
  for (let i = 0; i < s.quads; i += 37) {
    expect(Math.hypot((s.xs[i] as number) - 1000, (s.zs[i] as number) + 2000)).toBeCloseTo(160.5, 9);
    expect(Math.hypot(s.vertexXZ[i * 4] as number, s.vertexXZ[i * 4 + 1] as number)).toBeCloseTo(160, 3);
    expect(s.vertexU[i * 2 + 1]).toBe(i + 1);
  }
  expect(s.metresPerColumn).toBeCloseTo(1, 2);
  // A huge radius is capped at the texture limit.
  expect(cylinderStrip(0, 0, 2000).quads).toBe(4096);
  expect(() => cylinderStrip(0, 0, 0)).toThrow(/bad cylinder/);
});

const CUT: Cutaway = { position: { x: 100, y: -20, z: 50 }, yaw: 0.6, aheadM: 1, behindM: 80, halfWidthM: 12, floorY: -25 };

test('cutawayStrip: four walls whose samples lie just outside the trench, columns in wall order', () => {
  const s = cutawayStrip(CUT);
  expect(s.quads).toBe(4);
  // Two columns per metre: 81 m sides, 24 m ends.
  expect(s.xs.length).toBe(2 * (162 + 48));
  expect([...s.vertexU]).toEqual([0, 162, 162, 210, 210, 372, 372, 420]);
  for (let i = 0; i < s.xs.length; i++) {
    const p = { x: s.xs[i] as number, y: 0, z: s.zs[i] as number };
    expect(insideCutaway(CUT, p)).toBe(false);
    // ...by exactly the half metre, measured in the trench's own frame.
    const dx = p.x - CUT.position.x;
    const dz = p.z - CUT.position.z;
    const along = dx * Math.sin(CUT.yaw) + dz * Math.cos(CUT.yaw);
    const side = dx * Math.cos(CUT.yaw) - dz * Math.sin(CUT.yaw);
    expect(Math.max(Math.abs(side) - 12, along - 1, -80 - along)).toBeCloseTo(0.5, 9);
  }
  // Quad corners are the trench corners, relative to the reference point.
  const g = wallGeometryData(s, 30);
  expect(g.positions.length).toBe(48);
  expect(g.indices.length).toBe(24);
  for (let v = 0; v < 16; v++) {
    const x = g.positions[v * 3] as number;
    const z = g.positions[v * 3 + 2] as number;
    const along = x * Math.sin(CUT.yaw) + z * Math.cos(CUT.yaw);
    const side = x * Math.cos(CUT.yaw) - z * Math.sin(CUT.yaw);
    expect(Math.abs(side)).toBeCloseTo(12, 4);
    expect(Math.min(Math.abs(along - 1), Math.abs(along + 80))).toBeCloseTo(0, 4);
    expect([0, 30]).toContain(g.positions[v * 3 + 1]);
  }
  expect(() => cutawayStrip({ ...CUT, floorY: -25.5 })).toThrow(/bad trench/);
  expect(() => cutawayStrip({ ...CUT, halfWidthM: 0 })).toThrow(/bad trench/);
});

test('cutawayFootprint covers the trench; insideCutaway respects floor, ends and sides', () => {
  const f = cutawayFootprint(CUT);
  const s = Math.sin(CUT.yaw);
  const c = Math.cos(CUT.yaw);
  for (const side of [-11.99, 11.99]) {
    for (const along of [-79.99, 0.99]) {
      const x = CUT.position.x + side * c + along * s;
      const z = CUT.position.z - side * s + along * c;
      expect(x).toBeGreaterThanOrEqual(f.x0);
      expect(x).toBeLessThan(f.x0 + f.w);
      expect(z).toBeGreaterThanOrEqual(f.z0);
      expect(z).toBeLessThan(f.z0 + f.d);
      expect(insideCutaway(CUT, { x, y: -24, z })).toBe(true);
      expect(insideCutaway(CUT, { x, y: -25, z })).toBe(false);
    }
  }
  expect(insideCutaway(CUT, { x: CUT.position.x + 2 * s, y: 0, z: CUT.position.z + 2 * c })).toBe(false);
});
