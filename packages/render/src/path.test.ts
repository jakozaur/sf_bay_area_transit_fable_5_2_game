import { expect, test } from 'vitest';
import { createPathSample, frameMatrix, PathCursor, pitchOf, rayYawBox, yawOf } from './path.ts';

test('PathCursor grows at its end, skips duplicate points and samples by chainage', () => {
  const c = new PathCursor();
  const path = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 10 },
    { x: 0, y: 0, z: 10 },
    { x: 10, y: 0, z: 10 },
  ];
  c.extend(path.slice(0, 2));
  expect(c.lengthM).toBe(10);
  expect(c.continues(path)).toBe(true);
  c.extend(path);
  expect(c.points.length).toBe(3);
  expect(c.lengthM).toBe(20);
  const s = c.sample(15, createPathSample());
  expect([s.x, s.y, s.z]).toEqual([5, 0, 10]);
  expect([s.tx, s.ty, s.tz]).toEqual([1, 0, 0]);
  // Past the end and before the start: extrapolated along the end segments.
  expect(c.sample(25, createPathSample()).x).toBe(15);
  expect(c.sample(-5, createPathSample()).z).toBe(-5);
  // A path that was replaced, not appended to, is detected.
  expect(c.continues([{ x: 1, y: 0, z: 0 }])).toBe(false);
  expect(c.continues([...path.slice(0, 3), { x: 10, y: 0, z: 11 }])).toBe(false);
  expect(() => new PathCursor().sample(0, createPathSample())).toThrow(/needs 2/);
  expect(() => c.extend([...path, { x: Number.NaN, y: 0, z: 0 }])).toThrow(/point 4 is not finite/);
});

test('nearest finds the chainage of the closest point on any segment', () => {
  const c = new PathCursor();
  c.extend([
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 100 },
    { x: 100, y: 0, z: 100 },
  ]);
  expect(c.nearest({ x: 3, y: 4, z: 40 })).toEqual({ chainageM: 40, distanceM: 5 });
  const n = c.nearest({ x: 60, y: 0, z: 110 });
  expect(n.chainageM).toBeCloseTo(160, 9);
  expect(n.distanceM).toBeCloseTo(10, 9);
});

test('yaw is counter-clockwise from +z, pitch positive nose up', () => {
  expect(yawOf(0, 1)).toBe(0);
  expect(yawOf(1, 0)).toBeCloseTo(Math.PI / 2, 12);
  expect(pitchOf(Math.sin(0.1))).toBeCloseTo(0.1, 12);
});

test('frameMatrix: z along the tangent, x level and to the left of travel, lateral shifts left', () => {
  const m = new Float32Array(16);
  // Travelling south (+z): left is east (+x).
  frameMatrix({ x: 100, y: -20, z: 50, tx: 0, ty: 0, tz: 1 }, 5, { x: 90, y: -20, z: 40 }, 1, m, 0);
  const near = (from: number, want: number[]): void => {
    for (let i = 0; i < want.length; i++) expect(m[from + i]).toBeCloseTo(want[i] as number, 6);
  };
  near(0, [1, 0, 0]);
  near(4, [0, 1, 0]);
  near(8, [0, 0, 1]);
  near(12, [15, 0, 10]);
  // Climbing at 45 degrees towards +x: the frame stays orthonormal and x stays level.
  const k = Math.SQRT1_2;
  frameMatrix({ x: 0, y: 0, z: 0, tx: k, ty: k, tz: 0 }, 0, { x: 0, y: 0, z: 0 }, 2, m, 0);
  const col = (i: number): number[] => [m[i * 4] as number, m[i * 4 + 1] as number, m[i * 4 + 2] as number];
  const dot = (a: number[], b: number[]): number =>
    (a[0] as number) * (b[0] as number) + (a[1] as number) * (b[1] as number) + (a[2] as number) * (b[2] as number);
  expect(col(0)[1]).toBe(0);
  for (const [a, b] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const) {
    expect(dot(col(a), col(b))).toBeCloseTo(0, 6);
  }
  for (const i of [0, 1, 2]) expect(Math.hypot(...col(i))).toBeCloseTo(2, 6);
  // Up has a positive y component.
  expect(col(1)[1]).toBeGreaterThan(0);
});

test('rayYawBox hits a box turned about the vertical axis and reports the entry distance', () => {
  const center = { x: 0, y: 0, z: 0 };
  // Box long in z (20), narrow in x (2); yaw 90 degrees turns its length along world x.
  const down = { x: 0, y: -1, z: 0 };
  expect(rayYawBox({ x: 15, y: 10, z: 0 }, down, center, 0, 2, 1, 20)).toBe(-1);
  expect(rayYawBox({ x: 15, y: 10, z: 0 }, down, center, Math.PI / 2, 2, 1, 20)).toBeCloseTo(9, 9);
  expect(rayYawBox({ x: 0, y: 10, z: 15 }, down, center, Math.PI / 2, 2, 1, 20)).toBe(-1);
  // From inside: distance 0.
  expect(rayYawBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, center, 0.3, 2, 1, 20)).toBe(0);
});
