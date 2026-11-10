import { Material, type WorldEdit } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { ChunkWorldStore } from './chunk-store.ts';
import type { ColumnSample, ColumnSource } from './column-source.ts';
import { type PitRecord, STAMP_EDIT_LAYER, type StationRecord, stampLaunchPit, stampStationBox, WorldStamps } from './stamps.ts';

/** Flat rock at 10 m. */
const flat: ColumnSource = {
  sampleColumn(_x: number, _z: number, out: ColumnSample): void {
    out.surfaceM = 10;
    out.surfaceMaterial = 0;
    out.columnClass = 0;
    out.buildingMaterial = 0;
    out.buildingBaseM = 0;
    out.buildingTopM = 0;
    out.waterLevelM = Number.NEGATIVE_INFINITY;
  },
};
const fresh = (): ChunkWorldStore => new ChunkWorldStore({ source: flat });
const REGION = { min: { x: -128, y: -64, z: -128 }, max: { x: 128, y: 64, z: 128 } };
const AIR = Material.AIR;
const ROCK = Material.ROCK;
const CONCRETE = Material.CONCRETE_LINING;

// Along +x (yaw 90 degrees), axis at y = -20.
const station = { position: { x: 0.5, y: -20, z: 0.5 }, yaw: Math.PI / 2, lengthM: 60, widthM: 20, heightM: 8 };
const bore: WorldEdit = { t: 'carveCapsule', a: { x: -100, y: -20, z: 0 }, b: { x: 100, y: -20, z: 0 }, radius: 3.3 };

describe('station box', () => {
  test('void, lining, platform and trough', () => {
    const w = fresh();
    expect(stampStationBox(w, station).length).toBeGreaterThan(0);
    expect(w.editCount(STAMP_EDIT_LAYER)).toBe(1);
    // Hall above the platform.
    expect(w.get(10, -18, 6)).toBe(AIR);
    expect(w.get(10, -14, 6)).toBe(AIR);
    // Roof slab, base slab, side wall, ground beyond.
    expect(w.get(10, -13, 6)).toBe(CONCRETE);
    expect(w.get(10, -12, 6)).toBe(ROCK);
    expect(w.get(10, -24, 0)).toBe(CONCRETE);
    expect(w.get(10, -25, 0)).toBe(ROCK);
    expect(w.get(10, -18, 10)).toBe(CONCRETE);
    expect(w.get(10, -18, -9)).toBe(CONCRETE);
    expect(w.get(10, -18, 11)).toBe(ROCK);
    // Platform slab beside the trough, trough on the axis down to the tunnel invert.
    expect(w.get(10, -22, 6)).toBe(CONCRETE);
    expect(w.get(10, -23, 0)).toBe(AIR);
    // End wall: concrete, untouched where the tube will come through.
    expect(w.get(29, -18, 7)).toBe(CONCRETE);
    expect(w.get(29, -20, 0)).toBe(ROCK);
    expect(w.get(31, -18, 0)).toBe(ROCK);
    // Stamping again changes nothing.
    expect(stampStationBox(w, station)).toEqual([]);
  });

  test('the result does not depend on whether the bore or the stamp comes first', () => {
    for (const yaw of [Math.PI / 2, Math.PI / 2 + 0.3]) {
      const a = fresh();
      const b = fresh();
      a.applyEdit(bore, 'sim');
      stampStationBox(a, { ...station, yaw });
      stampStationBox(b, { ...station, yaw });
      b.applyEdit(bore, 'sim');
      expect(a.hashRegion(REGION)).toBe(b.hashRegion(REGION));
      // The tube is open through both end walls.
      expect(a.get(29, -20, 0)).toBe(AIR);
    }
  });

  test('a yawed box follows the track direction and survives eviction', () => {
    const w = fresh();
    stampStationBox(w, { ...station, yaw: Math.PI / 4 }); // travelling south-east
    const d = Math.SQRT1_2;
    expect(w.get(Math.floor(20 * d), -18, Math.floor(20 * d))).toBe(AIR);
    expect(w.get(Math.floor(20 * d), -18, Math.floor(-20 * d))).toBe(ROCK);
    const hash = w.hashRegion(REGION);
    w.trim({ budgetBytes: 1 });
    expect(w.hashRegion(REGION)).toBe(hash);
  });

  test('bad specs fail naming the input', () => {
    expect(() => stampStationBox(fresh(), { ...station, widthM: 0 })).toThrow(/box sizes must be in \(0, 2048\] m, got 60 x 0 x 8/);
    expect(() => stampStationBox(fresh(), { ...station, yaw: Number.NaN })).toThrow(/not finite/);
    expect(() => stampStationBox(fresh(), { ...station, tracks: { radiusM: 0, laterals: [0] } })).toThrow(/radius > 0/);
  });
});

describe('launch pit', () => {
  test('open to the sky, concrete floor and walls', () => {
    const w = fresh();
    stampLaunchPit(w, { position: { x: 0.5, y: -20, z: 0.5 }, yaw: 0, lengthM: 30, widthM: 12, topM: 50 });
    for (const y of [-20, 0, 9]) expect(w.get(0, y, 0)).toBe(AIR);
    expect(w.get(0, -21, 0)).toBe(CONCRETE);
    expect(w.get(0, -22, 0)).toBe(ROCK);
    expect(w.get(5, 0, 0)).toBe(CONCRETE);
    expect(w.get(0, 0, 14)).toBe(CONCRETE);
    // No wall in the air above the ground.
    expect(w.get(5, 12, 0)).toBe(AIR);
    expect(w.get(7, 0, 0)).toBe(ROCK);
    expect(() => stampLaunchPit(w, { position: { x: 0, y: -20, z: 0 }, yaw: 0, lengthM: 30, widthM: 12, topM: -30 })).toThrow(
      /topM -30 must be above the floor -20/,
    );
  });
});

describe('WorldStamps', () => {
  const rec = (progress: number, x = 0.5): StationRecord => ({
    id: 's1',
    style: 'compactBox',
    progress,
    ...station,
    position: { ...station.position, x },
  });
  const pit = (state: PitRecord['state']): PitRecord => ({
    id: 'p1',
    position: { x: -80.5, y: -23, z: 0.5 },
    yaw: Math.PI / 2,
    lengthM: 20,
    widthM: 10,
    state,
  });

  test('stamps records as they become real, once', () => {
    const w = fresh();
    const stamps = new WorldStamps(w, () => 10);
    expect(stamps.sync({ stations: [rec(0)], pits: [pit('planned')] })).toBe(0);
    expect(w.editLog).toHaveLength(0);
    expect(stamps.sync({ stations: [rec(0.1)], pits: [pit('ready')] })).toBe(2);
    expect(stamps.sync({ stations: [rec(1)], pits: [pit('launched')] })).toBe(0);
    expect(w.get(10, -18, 6)).toBe(AIR);
    expect(w.get(-80, 20, 0)).toBe(AIR);
    expect(stamps.sync({ stations: [{ ...rec(1), style: 'elevated' }], pits: [] })).toBe(0);
    expect(w.editCount(STAMP_EDIT_LAYER)).toBe(0);
  });

  test('a moved record is restamped; hand digs and sim carves stay', () => {
    const w = fresh();
    const stamps = new WorldStamps(w, () => 10);
    w.applyEdit(bore, 'sim');
    w.applyEdit({ t: 'carveCapsule', a: { x: 50, y: 9, z: 50 }, b: { x: 50, y: 9, z: 50 }, radius: 3 });
    stamps.sync({ stations: [rec(1)], pits: [] });
    expect(stamps.sync({ stations: [rec(1, 40.5)], pits: [] })).toBe(1);
    const moved = fresh();
    moved.applyEdit(bore, 'sim');
    moved.applyEdit({ t: 'carveCapsule', a: { x: 50, y: 9, z: 50 }, b: { x: 50, y: 9, z: 50 }, radius: 3 });
    stampStationBox(moved, { ...station, position: { ...station.position, x: 40.5 } });
    expect(w.hashRegion(REGION)).toBe(moved.hashRegion(REGION));
    expect(w.editCount()).toBe(3);
    // After a restart the world has no edits; forget() lets the same records be stamped again.
    w.resetEdits();
    stamps.forget();
    expect(stamps.sync({ stations: [rec(1, 40.5)], pits: [] })).toBe(1);
    expect(() => new WorldStamps(w, () => 10, 'manual')).toThrow(/must not share the manual edit layer/);
  });
});
