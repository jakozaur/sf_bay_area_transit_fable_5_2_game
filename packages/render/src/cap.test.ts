import { Material } from '@bayvox/core';
import { createSyntheticWorld, MemoryWorldStore } from '@bayvox/testkit';
import { expect, test } from 'vitest';
import { CAP_MAX_RADIUS, capRegion, fillCapLayer } from './cap.ts';

test('capRegion covers the cut disc with whole chunks and picks the layer under the plane', () => {
  expect(capRegion(10, 100, 100, 50)).toEqual({ layerY: 9, cx0: 1, cz0: 1, n: 4 });
  // A fractional cut height shows the layer the plane passes through.
  expect(capRegion(10.5, 100, 100, 50).layerY).toBe(10);
  expect(capRegion(-3, -10, -10, 20)).toEqual({ layerY: -4, cx0: -1, cz0: -1, n: 2 });
  expect(capRegion(0, 0, 0, CAP_MAX_RADIUS).n).toBeLessThanOrEqual(32);
  expect(() => capRegion(0, 0, 0, CAP_MAX_RADIUS + 1)).toThrow(/cut radius/);
  expect(() => capRegion(0, 0, 0, 0)).toThrow(/cut radius/);
});

test('fillCapLayer matches getVoxel for every texel, including negative coordinates and unknown chunks', () => {
  const w = new MemoryWorldStore();
  w.applyEdit({ t: 'fillBox', min: { x: -40, y: -40, z: -40 }, max: { x: 40, y: -2, z: 40 }, material: Material.ROCK });
  w.applyEdit({ t: 'fillBox', min: { x: -10, y: -8, z: 3 }, max: { x: 12, y: -2, z: 9 }, material: Material.BAY_MUD });
  w.applyEdit({ t: 'carveCapsule', a: { x: -20, y: -5, z: -20 }, b: { x: 20, y: -5, z: -20 }, radius: 3 });
  const region = capRegion(-4, 0, 0, 60);
  expect(region).toEqual({ layerY: -5, cx0: -2, cz0: -2, n: 4 });
  const size = region.n * 32;
  const out = new Uint8Array(size * size * 2).fill(7);
  fillCapLayer(w, region, out);
  let solid = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const o = (z * size + x) * 2;
      const id = (out[o] as number) | ((out[o + 1] as number) << 8);
      if (id !== w.get(x - 64, -5, z - 64)) throw new Error(`texel (${x}, ${z}) is ${id}, world has ${w.get(x - 64, -5, z - 64)}`);
      if (id !== Material.AIR) solid++;
    }
  }
  expect(solid).toBeGreaterThan(5000);
  expect(() => fillCapLayer(w, region, new Uint8Array(10))).toThrow(/out must have/);
});

test('fillCapLayer agrees with the synthetic world at sea level', () => {
  const world = createSyntheticWorld({ sizeChunks: 2, seed: 3 });
  const region = { layerY: -1, cx0: 0, cz0: 0, n: 2 };
  const out = new Uint8Array(64 * 64 * 2);
  fillCapLayer(world.store, region, out);
  const seen = new Set<number>();
  for (let z = 0; z < 64; z++) {
    for (let x = 0; x < 64; x++) {
      const id = out[(z * 64 + x) * 2] as number;
      expect(id).toBe(world.store.get(x, -1, z));
      seen.add(id);
    }
  }
  // The slice just below sea level cuts through water and at least one ground material.
  expect(seen.has(Material.WATER)).toBe(true);
  expect(seen.size).toBeGreaterThan(1);
});
