import { beforeAll, expect, test, vi } from 'vitest';
import { CameraRig, FOLLOW_DEFAULTS, linkClaims } from './rig.ts';

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

function settle(rig: CameraRig, frames = 600): void {
  for (let i = 0; i < frames; i++) rig.update(1 / 60, NONE);
}

test('orbit follow: the focus glides onto the entity and then tracks it exactly, angle and distance kept', () => {
  const rig = new CameraRig();
  rig.setBookmark({ position: { x: 0, y: 300, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  const pose = { position: { x: 200, y: -20, z: -100 }, yaw: 0, pitch: 0 };
  rig.follow('orbit', pose);
  expect(rig.following).toBe('orbit');
  rig.update(1 / 60, NONE);
  const first = rig.target();
  // No snap: after one frame the focus has moved a small part of the way.
  expect(first.x).toBeGreaterThan(0);
  expect(first.x).toBeLessThan(30);
  settle(rig);
  expect(rig.target().x).toBeCloseTo(200, 3);
  expect(rig.target().y).toBeCloseTo(-20, 3);
  expect(rig.distance).toBeCloseTo(500, 3);
  // The entity moves: the focus is on it in the same frame.
  for (let i = 1; i <= 30; i++) {
    rig.setFollowPose({ position: { x: 200, y: -20, z: -100 - i }, yaw: 0, pitch: 0 });
    rig.update(1 / 60, NONE);
    expect(rig.target().z).toBeCloseTo(-100 - i, 6);
  }
  // Pan keys do nothing while following; rotate still orbits around the entity.
  rig.update(0.1, { ...NONE, panX: 1, rotate: 1 });
  expect(rig.target().x).toBeCloseTo(200, 6);
  expect(rig.position().x).toBeLessThan(200);
  rig.stopFollow();
  expect(rig.following).toBeNull();
  expect(() => rig.setFollowPose(pose)).toThrow(/not following/);
});

test('chase follow: the camera settles behind and above the machine, looking along the drive, and turns with it', () => {
  const rig = new CameraRig();
  rig.setBookmark({ position: { x: 0, y: 300, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  // Travelling east (+x): yaw 90 degrees, since travel is (sin yaw, 0, cos yaw).
  let pose = { position: { x: 1000, y: -25, z: 500 }, yaw: Math.PI / 2, pitch: 0 };
  rig.follow('chase', pose);
  settle(rig);
  let p = rig.position();
  let t = rig.target();
  // Focus on the shield just behind the cutterhead, camera behind (west) and above, on the tunnel axis in plan.
  expect(t.x).toBeCloseTo(1000 + FOLLOW_DEFAULTS.chase.lookAheadM, 2);
  expect(t.z).toBeCloseTo(500, 2);
  expect(p.x).toBeLessThan(1000 - 20);
  expect(p.z).toBeCloseTo(500, 1);
  expect(p.y).toBeGreaterThan(-25 + 10);
  expect(rig.distance).toBeCloseTo(FOLLOW_DEFAULTS.chase.distance, 1);
  // The machine curves to the south (+z): the camera swings to the north of it, with no jump in any frame.
  pose = { position: pose.position, yaw: 0, pitch: 0 };
  rig.setFollowPose(pose);
  let prev = rig.position();
  for (let i = 0; i < 600; i++) {
    rig.update(1 / 60, NONE);
    const q = rig.position();
    expect(Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z)).toBeLessThan(6);
    prev = q;
  }
  p = rig.position();
  t = rig.target();
  expect(t.z).toBeCloseTo(500 + FOLLOW_DEFAULTS.chase.lookAheadM, 2);
  expect(p.z).toBeLessThan(500 - 20);
  expect(p.x).toBeCloseTo(1000, 1);
  // The tilt key still works in the chase view; rotate does not.
  const y0 = rig.position().y;
  for (let i = 0; i < 30; i++) rig.update(1 / 60, { ...NONE, tilt: 1, rotate: 1 });
  settle(rig);
  expect(rig.position().y).toBeGreaterThan(y0 + 2);
  expect(rig.position().x).toBeCloseTo(1000, 1);
});

test('following allows a closer zoom than the map; ending the follow backs the camera out', () => {
  const rig = new CameraRig();
  rig.setBookmark({ position: { x: 0, y: 300, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  rig.follow('cutaway', { position: { x: 0, y: -20, z: 0 }, yaw: 0, pitch: 0 });
  settle(rig);
  // 500 m out is more than twice the cutaway default: the camera was brought in.
  expect(rig.distance).toBeCloseTo(FOLLOW_DEFAULTS.cutaway.distance, 1);
  for (let i = 0; i < 300; i++) rig.update(1 / 60, { ...NONE, zoom: 1 });
  expect(rig.distance).toBeCloseTo(12, 3);
  rig.stopFollow();
  settle(rig);
  expect(rig.distance).toBeCloseTo(50, 2);
  // A bookmark ends a follow too.
  rig.follow('orbit', { position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  rig.setBookmark({ position: { x: 0, y: 300, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  expect(rig.following).toBeNull();
  expect(() => rig.follow('orbit', { position: { x: Number.NaN, y: 0, z: 0 }, yaw: 0, pitch: 0 })).toThrow(/not finite/);
});

test('terrain following: the focus rides the surface and the camera never sits inside a hill', () => {
  const rig = new CameraRig({ groundClearance: 3 });
  // Flat at 0 with a 200 m plateau south of z = 150 (where the camera starts).
  const ground = (_x: number, z: number): number => (z > 150 ? 200 : 0);
  rig.setBookmark({ position: { x: 0, y: 60, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  rig.setGround(ground);
  rig.update(1 / 60, NONE);
  let p = rig.position();
  expect(p.y).toBeGreaterThanOrEqual(ground(p.x, p.z) + 3 - 1e-6);
  // The focus did not move and the camera kept its azimuth: it was only lifted.
  expect(rig.target()).toEqual({ x: 0, y: 0, z: 0 });
  expect(p.x).toBeCloseTo(0, 6);
  // Panning onto the plateau raises the focus smoothly to the surface; the camera stays above ground in every frame.
  for (let i = 0; i < 400; i++) {
    rig.update(1 / 60, { ...NONE, panZ: -1 });
    p = rig.position();
    expect(p.y).toBeGreaterThanOrEqual(ground(p.x, p.z) + 3 - 1e-6);
  }
  settle(rig);
  expect(rig.target().z).toBeGreaterThan(150);
  expect(rig.target().y).toBeCloseTo(200, 2);
  // Unknown ground (outside the loaded data) leaves the camera alone; a broken provider fails loudly.
  rig.setGround(() => null);
  const before = rig.position();
  rig.update(1 / 60, NONE);
  expect(rig.position().y).toBeCloseTo(before.y, 6);
  rig.setGround(() => Number.NaN);
  expect(() => rig.update(1 / 60, NONE)).toThrow(/ground function returned NaN/);
});

test('the cutaway follow ignores the ground: the camera may sit below the surface next to the machine', () => {
  const rig = new CameraRig();
  rig.setGround(() => 0);
  rig.setBookmark({ position: { x: 0, y: 300, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  rig.follow('cutaway', { position: { x: 0, y: -60, z: 0 }, yaw: 0, pitch: 0 });
  settle(rig);
  for (let i = 0; i < 300; i++) rig.update(1 / 60, { ...NONE, zoom: 1, tilt: -1 });
  settle(rig);
  expect(rig.target().y).toBeCloseTo(-60, 3);
  expect(rig.position().y).toBeLessThan(0);
  // The plain orbit follow keeps the camera above ground.
  rig.follow('orbit', { position: { x: 0, y: -60, z: 0 }, yaw: 0, pitch: 0 });
  settle(rig);
  expect(rig.position().y).toBeGreaterThanOrEqual(3 - 1e-6);
});

test('linkClaims hands the pointer to a tool for the length of a claimed gesture', () => {
  const rig = new CameraRig();
  const calls: boolean[] = [];
  rig.setPointerEnabled = (e: boolean): void => {
    calls.push(e);
  };
  let cb: (claimed: boolean) => void = () => {};
  const off = linkClaims(
    {
      onClaim(f) {
        cb = f;
        return () => {};
      },
    },
    rig,
  );
  cb(true);
  cb(false);
  off();
  expect(calls).toEqual([false, true, true]);
});

test('a zoom floor keeps the map camera out of places with nothing to see up close; a follow ignores it', () => {
  const rig = new CameraRig();
  rig.setBookmark({ position: { x: 0, y: 300, z: 400 }, target: { x: 0, y: 0, z: 0 } }, false);
  for (let i = 0; i < 300; i++) rig.update(1 / 60, { ...NONE, zoom: 1 });
  settle(rig);
  expect(rig.distance).toBeCloseTo(50, 3);
  // The app raises the floor (the focus left the voxel site): the camera backs out and the wheel stops there.
  rig.setZoomFloor(1500);
  settle(rig);
  expect(rig.distance).toBeCloseTo(1500, 1);
  for (let i = 0; i < 300; i++) rig.update(1 / 60, { ...NONE, zoom: 1 });
  settle(rig);
  expect(rig.distance).toBeCloseTo(1500, 1);
  // A machine is watched from close wherever it is; the floor is back when the watch ends.
  rig.follow('chase', { position: { x: 0, y: -20, z: 0 }, yaw: 0, pitch: 0 });
  settle(rig);
  expect(rig.distance).toBeLessThan(100);
  rig.stopFollow();
  settle(rig);
  expect(rig.distance).toBeCloseTo(1500, 1);
  rig.setZoomFloor(null);
  for (let i = 0; i < 300; i++) rig.update(1 / 60, { ...NONE, zoom: 1 });
  settle(rig);
  expect(rig.distance).toBeCloseTo(50, 3);
  expect(() => rig.setZoomFloor(-1)).toThrow(/floor must be in/);
  expect(() => rig.setZoomFloor(1e9)).toThrow(/floor must be in/);
});
