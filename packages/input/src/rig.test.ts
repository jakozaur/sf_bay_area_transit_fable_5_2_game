import { beforeAll, expect, test, vi } from 'vitest';
import { CameraRig } from './rig.ts';

beforeAll(() => {
  // camera-controls allocates a DOMRect in its constructor; Node has none. The rig is never connected to an element here.
  vi.stubGlobal(
    'DOMRect',
    class {
      x = 0;
      y = 0;
      width = 0;
      height = 0;
    },
  );
});

const NONE = { panX: 0, panZ: 0, rotate: 0, tilt: 0, zoom: 0 };

test('bookmarks round-trip and near/far follow the zoom', () => {
  const rig = new CameraRig();
  rig.setBookmark({ position: { x: 20_900, y: 400, z: -64_400 }, target: { x: 20_800, y: 0, z: -64_700 } }, false);
  const b = rig.bookmark();
  expect(b.position.x).toBeCloseTo(20_900, 6);
  expect(b.position.y).toBeCloseTo(400, 6);
  expect(b.position.z).toBeCloseTo(-64_400, 6);
  expect(b.target).toEqual({ x: 20_800, y: 0, z: -64_700 });
  const s = rig.state(16 / 9);
  const d = Math.hypot(100, 400, 300);
  expect(rig.distance).toBeCloseTo(d, 6);
  expect(s.near).toBeCloseTo(d * 0.02, 6);
  expect(s.far).toBeCloseTo(d * 12, 6);
  expect(s.aspect).toBe(16 / 9);
  expect(rig.isMoving).toBe(false);
});

test('zoom is clamped to 50 m and 150 km', () => {
  const rig = new CameraRig();
  rig.setBookmark({ position: { x: 0, y: 5, z: 5 }, target: { x: 0, y: 0, z: 0 } }, false);
  expect(rig.distance).toBeCloseTo(50, 6);
  rig.setBookmark({ position: { x: 0, y: 400_000, z: 400_000 }, target: { x: 0, y: 0, z: 0 } }, false);
  expect(rig.distance).toBeCloseTo(150_000, 3);
  expect(rig.state(1).far).toBeGreaterThan(150_000);
});

test('keyboard pan moves the focus over the ground plane, scaled by distance', () => {
  const rig = new CameraRig();
  // Camera south of the target looking north (-z).
  rig.setBookmark({ position: { x: 0, y: 300, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  rig.update(0.1, { ...NONE, panZ: 1 });
  const fwd = rig.target();
  expect(fwd.x).toBeCloseTo(0, 6);
  expect(fwd.y).toBeCloseTo(0, 6);
  expect(fwd.z).toBeCloseTo(-500 * 0.9 * 0.1, 6);
  rig.update(0.1, { ...NONE, panX: 1 });
  const right = rig.target();
  expect(right.x).toBeCloseTo(45, 6);
  expect(right.y).toBeCloseTo(0, 6);
  expect(rig.distance).toBeCloseTo(500, 6);
});

test('rotate keeps the focus and distance, tilt is clamped, zoom key dollies in', () => {
  const rig = new CameraRig();
  rig.setBookmark({ position: { x: 0, y: 300, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  rig.update(0.5, { ...NONE, rotate: 1 });
  expect(rig.target()).toEqual({ x: 0, y: 0, z: 0 });
  expect(rig.distance).toBeCloseTo(500, 6);
  const p = rig.position();
  expect(p.y).toBeCloseTo(300, 6);
  // rotate +1 turns the heading clockwise seen from above (north towards east): the camera swings west.
  expect(p.x).toBeLessThan(-100);
  for (let i = 0; i < 100; i++) rig.update(0.1, { ...NONE, tilt: -1 });
  // maxPolar 80 degrees: height is distance * cos(80 deg).
  expect(rig.position().y).toBeCloseTo(500 * Math.cos((80 * Math.PI) / 180), 4);
  rig.update(0.5, { ...NONE, zoom: 1 });
  expect(rig.distance).toBeCloseTo(500 * Math.exp(-0.8), 6);
});

test('focusOn animates towards the point and settles', () => {
  const rig = new CameraRig();
  rig.setBookmark({ position: { x: 0, y: 300, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  rig.focusOn({ x: 1000, y: 20, z: -2000 }, { distance: 200 });
  expect(rig.update(1 / 60)).toBe(true);
  const mid = rig.target();
  expect(mid.x).toBeGreaterThan(0);
  expect(mid.x).toBeLessThan(1000);
  let frames = 0;
  while (rig.update(1 / 60)) {
    frames++;
    if (frames > 2000) throw new Error('focusOn did not settle within 2000 frames');
  }
  const t = rig.target();
  expect(t.x).toBeCloseTo(1000, 1);
  expect(t.y).toBeCloseTo(20, 1);
  expect(t.z).toBeCloseTo(-2000, 1);
  expect(rig.distance).toBeCloseTo(200, 1);
});

test('setBookmark rejects non-finite poses', () => {
  const rig = new CameraRig();
  expect(() => rig.setBookmark({ position: { x: Number.NaN, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } }, false)).toThrow(/position/);
});
