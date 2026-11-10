import type { CameraBookmark, CameraState, EntityPose, FollowMode, WorldPos } from '@bayvox/core';
import { expect, test } from 'vitest';
import { createCamera, createTime, createView, type RigLike } from './services.ts';

function fakeRig(): RigLike & { calls: string[] } {
  const calls: string[] = [];
  let mode: FollowMode | null = null;
  return {
    calls,
    setBookmark: (_b: CameraBookmark, animate: boolean) => {
      mode = null;
      calls.push(`bookmark:${animate}`);
    },
    focusOn: (_t: WorldPos, opts) => {
      mode = null;
      calls.push(`focus:${opts?.distance ?? ''}`);
    },
    follow: (m: FollowMode, _pose: EntityPose) => {
      mode = m;
      calls.push(`follow:${m}`);
    },
    setFollowPose: (pose: EntityPose) => calls.push(`pose:${pose.position.x}`),
    stopFollow: () => {
      mode = null;
      calls.push('stop');
    },
    get following() {
      return mode;
    },
    distance: 60,
    target: () => ({ x: 0, y: 0, z: 0 }),
  };
}

const CAM: CameraState = { position: { x: 0, y: 100, z: 100 }, target: { x: 0, y: 0, z: 0 }, fovYDeg: 45, aspect: 2, near: 1, far: 1000 };

test('time: speeds are validated, pause remembers the speed before it, changes are reported once', () => {
  const seen: number[] = [];
  const time = createTime((s) => seen.push(s));
  expect(time.speed.get()).toBe(1);
  time.setSpeed(10);
  time.setSpeed(10);
  time.togglePause();
  expect(time.speed.get()).toBe(0);
  time.togglePause();
  expect(time.speed.get()).toBe(10);
  expect(seen).toEqual([10, 0, 10]);
  expect(() => time.setSpeed(3 as never)).toThrow(/one of 0, 1, 10, 100, got 3/);
});

test('view: merges, validates, clamps the cut to the world and proposes a level when the cut is switched on', () => {
  let level: number | null = -17;
  const view = createView({ cut: false, cutY: -8, cutRadius: 160, xray: false }, { minY: -95, maxY: 352, maxRadius: 240 }, () => level);
  const states: boolean[] = [];
  view.state.subscribe((v) => states.push(v.cut));
  view.set({ cut: true });
  expect(view.state.get()).toMatchObject({ cut: true, cutY: -17 });
  // An explicit level wins; with the cut already on the proposal is not asked again.
  view.set({ cutY: -30 });
  view.set({ cut: true });
  expect(view.state.get().cutY).toBe(-30);
  view.set({ cut: false });
  level = null;
  view.set({ cut: true });
  expect(view.state.get().cutY).toBe(-30);
  view.set({ cutY: -500 });
  expect(view.state.get().cutY).toBe(-95);
  view.set({ cutY: -95 });
  expect(states).toEqual([true, true, false, true, true]);
  expect(() => view.set({ cutY: 1.5 })).toThrow(/whole metre/);
  expect(() => view.set({ cutRadius: 241 })).toThrow(/cutRadius/);
});

test('camera: bookmarks by id, follow needs an entity in the scene, a machine cutaway is flown as a chase', () => {
  const rig = fakeRig();
  let pose: EntityPose | null = { position: { x: 5, y: -20, z: 9 }, yaw: 0, pitch: 0 };
  const camera = createCamera({
    rig,
    state: () => CAM,
    size: () => ({ width: 800, height: 400 }),
    poseOf: () => pose,
    animate: () => true,
  });
  camera.setBookmarks([{ id: 'bay', label: 'Whole Bay', bookmark: { position: CAM.position, target: CAM.target } }]);
  camera.goTo('bay');
  expect(() => camera.goTo('moon')).toThrow(/unknown bookmark "moon" \(have: bay\)/);
  camera.follow({ entity: { type: 'tbm', id: 'f1' }, mode: 'cutaway' });
  expect(camera.status.get().following).toEqual({ entity: { type: 'tbm', id: 'f1' }, mode: 'cutaway' });
  camera.track();
  camera.follow({ entity: { type: 'train', id: 't1' }, mode: 'cutaway' });
  // The entity leaves the scene: the follow ends and the camera backs out of the ground.
  pose = null;
  camera.track();
  expect(camera.status.get().following).toBeNull();
  expect(() => camera.follow({ entity: { type: 'tbm', id: 'f1' }, mode: 'chase' })).toThrow(/no tbm "f1" to follow/);
  expect(rig.calls).toEqual(['stop', 'bookmark:true', 'follow:chase', 'pose:5', 'follow:cutaway', 'stop', 'focus:420']);
});

test('camera.project is the renderer pinhole: the focus lands in the middle, points behind the camera are null', () => {
  const camera = createCamera({
    rig: fakeRig(),
    state: () => CAM,
    size: () => ({ width: 800, height: 400 }),
    poseOf: () => null,
    animate: () => false,
  });
  expect(camera.project(CAM.target)).toEqual({ x: 400, y: 200 });
  // East is right, up is up.
  expect(camera.project({ x: 10, y: 0, z: 0 })?.x).toBeGreaterThan(400);
  expect(camera.project({ x: 0, y: 10, z: 0 })?.y).toBeLessThan(200);
  expect(camera.project({ x: 0, y: 200, z: 200 })).toBeNull();
});
