import { type CameraState, FACE_NEG_X, FACE_POS_Y, Material, type VoxelCoord } from '@bayvox/core';
import { expect, test } from 'vitest';
import { pickVoxel, screenRay } from './pick.ts';

interface Box {
  min: [number, number, number];
  max: [number, number, number];
  material: number;
}

/** Minimal voxel source: half-open boxes, later boxes win, everything else is AIR. */
function boxes(...list: Box[]): { getVoxel(c: VoxelCoord): number } {
  return {
    getVoxel(c) {
      let m: number = Material.AIR;
      for (const b of list) {
        if (c.x >= b.min[0] && c.x < b.max[0] && c.y >= b.min[1] && c.y < b.max[1] && c.z >= b.min[2] && c.z < b.max[2]) m = b.material;
      }
      return m;
    },
  };
}

/** Ground: y in [0, 10), 64 x 64 m, with a water layer on top. */
function slab(): { getVoxel(c: VoxelCoord): number } {
  return boxes(
    { min: [0, 0, 0], max: [64, 10, 64], material: Material.ROCK },
    { min: [0, 10, 0], max: [64, 12, 64], material: Material.WATER },
  );
}

test('a vertical ray passes water and hits the top face of the ground', () => {
  const hit = pickVoxel(slab(), { origin: { x: 20.5, y: 50, z: 30.5 }, dir: { x: 0, y: -1, z: 0 } }, { maxDistance: 100 });
  expect(hit).toEqual({ voxel: { x: 20, y: 9, z: 30 }, face: FACE_POS_Y, material: Material.ROCK, distance: 40 });
});

test('a horizontal ray enters through the side face; negative coordinates work', () => {
  const w = boxes({ min: [-40, -8, -8], max: [-30, 8, 8], material: Material.FILL });
  const hit = pickVoxel(w, { origin: { x: -60.25, y: -0.5, z: -0.5 }, dir: { x: 1, y: 0, z: 0 } }, { maxDistance: 100 });
  expect(hit).toEqual({ voxel: { x: -40, y: -1, z: -1 }, face: FACE_NEG_X, material: Material.FILL, distance: 20.25 });
});

test('the ray stops at maxDistance and rejects a bad limit', () => {
  const ray = { origin: { x: 20.5, y: 50, z: 30.5 }, dir: { x: 0, y: -1, z: 0 } };
  expect(pickVoxel(slab(), ray, { maxDistance: 39 })).toBeNull();
  expect(() => pickVoxel(slab(), ray, { maxDistance: Infinity })).toThrow(/maxDistance/);
});

test('a cut hides voxels at or above cut.y inside the radius only', () => {
  const w = slab();
  const down = { x: 0, y: -1, z: 0 };
  const cut = { y: 4, x: 20, z: 30, radius: 5 };
  const inside = pickVoxel(w, { origin: { x: 20.5, y: 50, z: 30.5 }, dir: down }, { maxDistance: 100, cut });
  expect(inside?.voxel).toEqual({ x: 20, y: 3, z: 30 });
  const outside = pickVoxel(w, { origin: { x: 40.5, y: 50, z: 30.5 }, dir: down }, { maxDistance: 100, cut });
  expect(outside?.voxel).toEqual({ x: 40, y: 9, z: 30 });
});

test('a diagonal ray visits every voxel it crosses (no tunnelling through a 1-voxel wall)', () => {
  const w = boxes({ min: [10, -50, -50], max: [11, 50, 50], material: Material.ROCK });
  const l = Math.hypot(1, 0.7, 0.4);
  const hit = pickVoxel(w, { origin: { x: 0.1, y: 0.2, z: 0.3 }, dir: { x: 1 / l, y: 0.7 / l, z: 0.4 / l } }, { maxDistance: 100 });
  expect(hit?.voxel.x).toBe(10);
  expect(hit?.face).toBe(FACE_NEG_X);
  expect(hit?.distance).toBeCloseTo(9.9 * l, 9);
});

test('screenRay: centre ray points at the target, corners follow fov and aspect', () => {
  const cam: CameraState = {
    position: { x: 100, y: 200, z: 300 },
    target: { x: 100, y: 0, z: 100 },
    fovYDeg: 90,
    aspect: 2,
    near: 1,
    far: 1000,
  };
  const c = screenRay(cam, 0, 0);
  const s = Math.SQRT1_2;
  expect(c.origin).toEqual(cam.position);
  expect(c.dir.x).toBeCloseTo(0, 12);
  expect(c.dir.y).toBeCloseTo(-s, 12);
  expect(c.dir.z).toBeCloseTo(-s, 12);
  // Looking north (-z): screen right is east (+x); with fov 90 and aspect 2 the right edge is 2 units per unit forward.
  const r = screenRay(cam, 1, 0);
  expect(r.dir.x / Math.hypot(r.dir.y, r.dir.z)).toBeCloseTo(2, 12);
  // Top edge tilts up by 45 degrees: forward (0, -s, -s) plus up (0, s, -s) is horizontal.
  const t = screenRay(cam, 0, 1);
  expect(t.dir.y).toBeCloseTo(0, 12);
  expect(t.dir.z).toBeCloseTo(-1, 12);
  expect(() => screenRay({ ...cam, target: { x: 100, y: 0, z: 300 } }, 0, 0)).toThrow(/y axis/);
});
