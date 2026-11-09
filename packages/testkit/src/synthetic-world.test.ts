import { Material, stableHash } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { createSyntheticWorld } from './synthetic-world.ts';

function fingerprint(seed: number): string {
  const w = createSyntheticWorld({ seed, sizeChunks: 2 });
  const parts: string[] = [];
  for (const key of w.store.chunkKeys()) {
    const c = w.store.getChunk(key);
    if (c === undefined) throw new Error(`missing chunk ${key}`);
    parts.push(`${key}:${stableHash(c.palette)}:${c.indices === null ? 'u' : stableHash(c.indices)}`);
  }
  return parts.join('|');
}

describe('synthetic world', () => {
  const world = createSyntheticWorld({ seed: 1, sizeChunks: 4 });
  const size = 128;

  test('is deterministic per seed and differs across seeds', () => {
    expect(fingerprint(3)).toBe(fingerprint(3));
    expect(fingerprint(3)).not.toBe(fingerprint(4));
  });

  test('columns match the heightmap: solid below, water up to sea level, air above', () => {
    for (let z = 0; z < size; z += 7) {
      for (let x = 0; x < size; x += 5) {
        if (world.buildings.some((b) => x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ)) continue;
        const h = world.heightAt(x, z);
        expect(world.store.get(x, h - 1, z), `ground at ${x}, ${z}`).toBeGreaterThan(Material.WATER);
        expect(world.store.get(x, world.min.y, z)).toBe(Material.ROCK);
        const above = world.store.get(x, h, z);
        expect(above).toBe(h < world.seaLevel ? Material.WATER : Material.AIR);
        expect(world.store.get(x, Math.max(h, world.seaLevel), z)).toBe(Material.AIR);
      }
    }
  });

  test('has hills, water and land in meaningful proportions', () => {
    let wet = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const h = world.heightAt(x, z);
        if (h < world.seaLevel) wet++;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    }
    const share = wet / (size * size);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.7);
    expect(hi - lo).toBeGreaterThan(12);
    expect(lo).toBeGreaterThan(world.min.y);
  });

  test('places a few box buildings on dry land, solid inside, inside bounds', () => {
    expect(world.buildings.length).toBeGreaterThanOrEqual(2);
    for (const b of world.buildings) {
      expect(b.minX).toBeGreaterThanOrEqual(0);
      expect(b.maxX).toBeLessThanOrEqual(size);
      expect(b.baseY).toBeGreaterThan(world.seaLevel);
      expect(b.topY).toBeLessThanOrEqual(world.max.y);
      expect(world.store.get(b.minX, b.topY - 1, b.minZ)).toBe(b.material);
      expect(world.store.get(b.maxX - 1, b.topY - 1, b.maxZ - 1)).toBe(b.material);
      expect(world.store.get(b.minX, b.topY, b.minZ)).toBe(Material.AIR);
    }
  });

  test('rejects bad options, naming the value', () => {
    expect(() => createSyntheticWorld({ sizeChunks: 0 })).toThrow('got 0');
    expect(() => createSyntheticWorld({ minY: 0 })).toThrow('minY 0');
  });
});
