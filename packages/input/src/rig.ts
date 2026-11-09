/**
 * RTS / orbit camera rig on camera-controls (doc 03 section 7, doc 10 section 10.4).
 * The rig works in absolute world metres in JS doubles and never renders: it hands a CameraState to the
 * renderer, which converts to camera-relative float32. Its PerspectiveCamera is private bookkeeping.
 */
import type { CameraBookmark, CameraState, WorldPos } from '@bayvox/core';
import CameraControls from 'camera-controls';
import { Box3, Matrix4, PerspectiveCamera, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4 } from 'three';
import type { CameraAxes } from './actions.ts';

CameraControls.install({ THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster } });

export interface CameraRigOptions {
  /** Closest zoom: metres between camera and focus. Default 50. */
  minDistance?: number;
  /** Farthest zoom, whole Bay. Default 150,000. */
  maxDistance?: number;
  fovYDeg?: number;
  /** Pitch limits as polar angles from straight down-looking (0) to horizontal (90). Defaults 5 and 80. */
  minPolarDeg?: number;
  maxPolarDeg?: number;
  /** Seconds a focus or bookmark transition takes to mostly settle. Default 0.35. */
  smoothTime?: number;
}

const DEG = Math.PI / 180;
/** Keyboard pan speed: fraction of the focus distance per second. */
const PAN_RATE = 0.9;
const ROTATE_RATE = 1.4;
const TILT_RATE = 0.9;
const ZOOM_RATE = 1.6;

export class CameraRig {
  readonly minDistance: number;
  readonly maxDistance: number;
  private readonly camera: PerspectiveCamera;
  private readonly controls: CameraControls;
  private readonly tmp = new Vector3();
  private moving = false;

  constructor(opts: CameraRigOptions = {}) {
    this.minDistance = opts.minDistance ?? 50;
    this.maxDistance = opts.maxDistance ?? 150_000;
    if (!(this.minDistance > 0) || !(this.maxDistance > this.minDistance)) {
      throw new RangeError(`CameraRig: need 0 < minDistance < maxDistance, got ${this.minDistance} and ${this.maxDistance}`);
    }
    this.camera = new PerspectiveCamera(opts.fovYDeg ?? 45, 1, 1, 1000);
    const c = new CameraControls(this.camera);
    c.minDistance = this.minDistance;
    c.maxDistance = this.maxDistance;
    c.minPolarAngle = (opts.minPolarDeg ?? 5) * DEG;
    c.maxPolarAngle = (opts.maxPolarDeg ?? 80) * DEG;
    c.smoothTime = opts.smoothTime ?? 0.35;
    c.draggingSmoothTime = 0.08;
    c.dollyToCursor = true;
    c.dollySpeed = 1.5;
    // Map-style mouse: left drag pans over the ground plane, right or middle drag orbits, wheel dollies.
    c.mouseButtons.left = CameraControls.ACTION.SCREEN_PAN;
    c.mouseButtons.right = CameraControls.ACTION.ROTATE;
    c.mouseButtons.middle = CameraControls.ACTION.ROTATE;
    c.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
    c.touches.one = CameraControls.ACTION.TOUCH_SCREEN_PAN;
    c.touches.two = CameraControls.ACTION.TOUCH_DOLLY_ROTATE;
    c.setLookAt(0, 300, 300, 0, 0, 0, false);
    c.update(0);
    this.controls = c;
  }

  /** Starts listening for drags and wheel on `el` (pointer capture is handled by camera-controls). */
  connect(el: HTMLElement): void {
    this.controls.connect(el);
  }

  disconnect(): void {
    this.controls.disconnect();
  }

  /** Restricts the focus point to a world-space box (metres). */
  setBounds(min: WorldPos, max: WorldPos): void {
    this.controls.setBoundary(new Box3(new Vector3(min.x, min.y, min.z), new Vector3(max.x, max.y, max.z)));
  }

  /**
   * Advances transitions and applies held-key axes. `dt` in seconds.
   * Returns true while the camera is still moving.
   */
  update(dt: number, axes?: CameraAxes): boolean {
    const c = this.controls;
    if (axes !== undefined && dt > 0) {
      const d = c.distance;
      if (axes.panX !== 0) void c.truck(axes.panX * d * PAN_RATE * dt, 0, false);
      if (axes.panZ !== 0) void c.forward(axes.panZ * d * PAN_RATE * dt, false);
      if (axes.rotate !== 0 || axes.tilt !== 0) void c.rotate(-axes.rotate * ROTATE_RATE * dt, -axes.tilt * TILT_RATE * dt, false);
      if (axes.zoom !== 0) void c.dollyTo(d * Math.exp(-axes.zoom * ZOOM_RATE * dt), false);
    }
    this.moving = c.update(dt);
    return this.moving;
  }

  /** True if the last update moved the camera (a transition or damping is still running). */
  get isMoving(): boolean {
    return this.moving;
  }

  /** Metres between camera and focus. */
  get distance(): number {
    return this.controls.distance;
  }

  /** Focus point (orbit centre) in world metres. */
  target(): WorldPos {
    const t = this.controls.getTarget(this.tmp, false);
    return { x: t.x, y: t.y, z: t.z };
  }

  position(): WorldPos {
    const p = this.controls.getPosition(this.tmp, false);
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Camera for this frame. Near and far follow the zoom so depth precision holds from 50 m to 150 km. */
  state(aspect: number): CameraState {
    const d = this.controls.distance;
    return {
      position: this.position(),
      target: this.target(),
      fovYDeg: this.camera.fov,
      aspect,
      near: Math.max(0.5, d * 0.02),
      far: Math.max(3000, d * 12),
    };
  }

  bookmark(): CameraBookmark {
    return { position: this.position(), target: this.target(), fovYDeg: this.camera.fov };
  }

  /** Moves to a saved pose. Distance and pitch are clamped to the rig limits. */
  setBookmark(b: CameraBookmark, animate: boolean): void {
    const { position: p, target: t } = b;
    for (const [name, v] of [
      ['position', p],
      ['target', t],
    ] as const) {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
        throw new RangeError(`CameraRig.setBookmark: ${name} is not finite: (${v.x}, ${v.y}, ${v.z})`);
      }
    }
    if (b.fovYDeg !== undefined) {
      this.camera.fov = b.fovYDeg;
      this.camera.updateProjectionMatrix();
    }
    // Clamp zoom and pitch here: setLookAt applies the pose as given.
    const c = this.controls;
    let dx = p.x - t.x;
    let dy = p.y - t.y;
    let dz = p.z - t.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 0)) throw new RangeError('CameraRig.setBookmark: position equals target');
    const polar = Math.min(c.maxPolarAngle, Math.max(c.minPolarAngle, Math.acos(dy / len)));
    const dist = Math.min(this.maxDistance, Math.max(this.minDistance, len));
    const h = Math.hypot(dx, dz);
    // Straight above the target there is no heading; keep looking north.
    const hx = h > 1e-9 ? dx / h : 0;
    const hz = h > 1e-9 ? dz / h : 1;
    dx = hx * Math.sin(polar) * dist;
    dz = hz * Math.sin(polar) * dist;
    dy = Math.cos(polar) * dist;
    void c.setLookAt(t.x + dx, t.y + dy, t.z + dz, t.x, t.y, t.z, animate);
    if (!animate) this.settleNow();
  }

  private settleNow(): void {
    this.controls.update(0);
    this.moving = false;
  }

  /** Smoothly re-centres on a world point, keeping the current viewing angle. Optionally sets the zoom distance. */
  focusOn(target: WorldPos, opts: { distance?: number; animate?: boolean } = {}): void {
    const animate = opts.animate ?? true;
    void this.controls.moveTo(target.x, target.y, target.z, animate);
    if (opts.distance !== undefined) void this.controls.dollyTo(opts.distance, animate);
    if (!animate) this.settleNow();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
