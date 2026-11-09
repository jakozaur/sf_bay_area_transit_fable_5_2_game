import { Material } from '@bayvox/core';
import { expect, test } from 'vitest';
import { createColumnSample } from './column-source.ts';
import { SyntheticColumnSource } from './synthetic-source.ts';

test('same seed gives the same columns, another seed different ones', () => {
  const a = new SyntheticColumnSource({ seed: 1 });
  const b = new SyntheticColumnSource({ seed: 1 });
  const c = new SyntheticColumnSource({ seed: 2 });
  const sa = createColumnSample();
  const sb = createColumnSample();
  let differs = 0;
  for (let i = 0; i < 400; i++) {
    const x = (i * 37.5) % 2000;
    const z = -((i * 91.25) % 3000);
    a.sampleColumn(x, z, sa);
    b.sampleColumn(x, z, sb);
    expect(sa).toEqual(sb);
    c.sampleColumn(x, z, sb);
    if (sa.surfaceM !== sb.surfaceM) differs++;
  }
  expect(differs).toBeGreaterThan(390);
});

test('heights stay in range and are continuous; water, beach, grass and buildings all occur', () => {
  const source = new SyntheticColumnSource({ seed: 9, minHeightM: -10, maxHeightM: 30, waterLevelM: 2 });
  const s = createColumnSample();
  let water = 0;
  let beach = 0;
  let grass = 0;
  let buildings = 0;
  let previous = source.heightAt(-500, 10);
  for (let x = -500; x < 1500; x += 0.5) {
    source.sampleColumn(x, 10 + x * 0.37, s);
    const h = source.heightAt(x, 10);
    expect(Math.abs(h - previous)).toBeLessThan(0.5); // under 1 m per metre of slope
    previous = h;
    expect(s.surfaceM).toBeGreaterThanOrEqual(-10);
    expect(s.surfaceM).toBeLessThan(30);
    expect(s.waterLevelM).toBe(2);
    if (s.surfaceM < 2) water++;
    if (s.surfaceMaterial === Material.BEACH_SAND) beach++;
    if (s.surfaceMaterial === Material.GRASS) grass++;
    if (s.buildingMaterial !== 0) {
      buildings++;
      expect(s.buildingMaterial).toBeGreaterThanOrEqual(Material.BUILDING_RESIDENTIAL);
      expect(s.buildingMaterial).toBeLessThanOrEqual(Material.BUILDING_TRANSIT);
      expect(s.buildingBaseM).toBe(s.surfaceM);
      expect(s.buildingTopM).toBeGreaterThan(s.surfaceM);
    }
  }
  expect(water).toBeGreaterThan(50);
  expect(beach).toBeGreaterThan(10);
  expect(grass).toBeGreaterThan(500);
  expect(buildings).toBeGreaterThan(500);
  const bare = new SyntheticColumnSource({ seed: 9, buildings: false });
  for (let x = 0; x < 500; x += 1.5) {
    bare.sampleColumn(x, x, s);
    expect(s.buildingMaterial).toBe(0);
  }
});

test('rejects bad options naming the value', () => {
  expect(() => new SyntheticColumnSource({ seed: 1.5 })).toThrow(/seed must be a safe integer, got 1.5/);
  expect(() => new SyntheticColumnSource({ seed: 1, minHeightM: 5, maxHeightM: 5 })).toThrow(/minHeightM < maxHeightM, got 5 and 5/);
  expect(() => new SyntheticColumnSource({ seed: 1, lotSizeM: 2 })).toThrow(/lotSizeM must be finite and >= 8, got 2/);
});
