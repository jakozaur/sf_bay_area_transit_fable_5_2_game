/**
 * RTS / orbit camera rig on camera-controls (doc 03 section 7, doc 10 section 10.4).
 * The rig works in absolute world metres in JS doubles and never renders: it hands a CameraState to the
 * renderer, which converts to camera-relative float32. Its PerspectiveCamera is private bookkeeping.
 */
import type { CameraBookmark, CameraState, EntityPose, FollowMode, WorldPos } from '@bayvox/core';
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
  /** Closest zoom while following an entity (a 6.6 m machine needs a closer look than the map). Default 12. */
  followMinDistance?: number;
  /** Metres the camera keeps above the surface under it when a ground function is set. Default 3. */
  groundClearance?: number;
}

/**
 * Surface elevation in world metres under a plan position (terrain, or roofs if the provider knows them),
 * or null where it is unknown (outside the loaded data): the rig then leaves the camera alone.
 */
export type GroundFn = (x: number, z: number) => number | null;

/** Camera placement per follow mode when the follow starts. Distances in metres, polar angle from straight down. */
export const FOLLOW_DEFAULTS: Readonly<Record<FollowMode, { distance: number; polarDeg: number; lookAheadM: number; dropM: number }>> = {
  /**
   * Behind and above the cutterhead, looking along the drive. The focus sits on the shield a little behind the
   * face and `dropM` below the axis, so the machine is drawn in the upper half of the screen, clear of the HUD.
   */
  chase: { distance: 48, polarDeg: 58, lookAheadM: -5, dropM: 3 },
  /** Free orbit around the machine inside the cutaway. */
  cutaway: { distance: 90, polarDeg: 55, lookAheadM: 0, dropM: 0 },
  /** The player's own angle and distance; only the focus moves. */
  orbit: { distance: 0, polarDeg: 0, lookAheadM: 0, dropM: 0 },
};

/** Seconds for the focus to close in on a newly followed entity, and for the chase camera to swing behind it. */
const FOLLOW_TAU = 0.25;
const TWO_PI = Math.PI * 2;

/** Shortest signed difference a - b of two angles, in (-pi, pi]. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d <= -Math.PI) d += TWO_PI;
  return d;
}

function assertPose(p: EntityPose, who: string): void {
  const { x, y, z } = p.position;
  if (!Number.isFinite(x + y + z + p.yaw + p.pitch)) {
    throw new RangeError(`${who}: pose is not finite: position (${x}, ${y}, ${z}), yaw ${p.yaw}, pitch ${p.pitch}`);
  }
}

/** A followed camera that moved less than this in a frame is at rest, metres. */
const REST_EPSILON_M = 1e-4;
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
  private readonly tmp2 = new Vector3();
  private moving = false;
  /** Camera position and focus after the last update: x, y, z, x, y, z. */
  private readonly lastPose = [0, 0, 0, 0, 0, 0];
  private readonly followMinDistance: number;
  /** Extra lower bound on the map zoom set by the app (setZoomFloor), metres; 0 when none. */
  private zoomFloor = 0;
  private readonly groundClearance: number;
  private ground: GroundFn | null = null;
  private followState: {
    mode: FollowMode;
    pose: EntityPose;
    /** Focus minus the followed anchor; decays to zero so the focus glides onto the entity. */
    offset: Vector3;
    /** Chase only: smoothed azimuth and polar angle the rig holds. */
    azimuth: number;
    polar: number;
    polarGoal: number;
  } | null = null;

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
    // One notch of a mouse wheel is a third closer or further (0.95 ^ (10 x 0.7)); at 1.5 a notch more than halved
    // the distance and a short spin went from the street to the whole Bay.
    c.dollySpeed = 0.7;
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
    this.followMinDistance = opts.followMinDistance ?? 12;
    this.groundClearance = opts.groundClearance ?? 3;
    if (!(this.followMinDistance > 0) || this.followMinDistance > this.minDistance) {
      throw new RangeError(`CameraRig: need 0 < followMinDistance <= minDistance, got ${this.followMinDistance}`);
    }
    if (!(this.groundClearance >= 0)) throw new RangeError(`CameraRig: groundClearance must be >= 0, got ${this.groundClearance}`);
  }

  /**
   * Lets a tool take the pointer: false cancels any camera drag in progress and makes the rig ignore mouse and
   * wheel until it is true again. Wire it to InputMapper.onClaim (see linkClaims). Keyboard axes are unaffected.
   */
  setPointerEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  /**
   * Terrain following. With a ground function the focus rides on the surface (so orbiting pivots on what the
   * player looks at) and the camera is lifted whenever it would sit inside a hill or building. Not applied to
   * the focus while following an entity, nor to the camera in the 'chase' and 'cutaway' modes, where the
   * renderer cuts the ground away around the machine.
   */
  setGround(ground: GroundFn | null): void {
    this.ground = ground;
  }

  /**
   * Starts following an entity, or changes the mode. `pose` is the entity now; feed setFollowPose every frame
   * with the pose to draw (the interpolated one). The focus glides onto the entity; nothing snaps.
   * - 'orbit': the player's angle and distance stay, the focus moves with the entity.
   * - 'cutaway': the same, and a camera further out than the cutaway is brought in to its default distance.
   * - 'chase': the rig holds the camera behind and above the entity, looking along its direction of travel;
   *   the tilt keys and the wheel still work, horizontal orbit does not.
   * `distanceScale` stretches the default distance of the mode: a machine larger than the one the defaults
   * frame (a 16 m single bore) is watched from further back.
   */
  follow(mode: FollowMode, pose: EntityPose, distanceScale = 1): void {
    if (!(mode in FOLLOW_DEFAULTS)) throw new RangeError(`CameraRig.follow: unknown mode ${String(mode)}`);
    assertPose(pose, 'CameraRig.follow');
    if (!(distanceScale >= 1) || !Number.isFinite(distanceScale))
      throw new RangeError(`CameraRig.follow: distanceScale must be 1 or more, got ${distanceScale}`);
    const c = this.controls;
    const def = FOLLOW_DEFAULTS[mode];
    const anchor = this.anchorOf(mode, pose, c.azimuthAngle, this.tmp2);
    const offset = c.getTarget(this.tmp, false).clone().sub(anchor);
    c.minDistance = this.followMinDistance;
    this.followState = {
      mode,
      pose: { position: { ...pose.position }, yaw: pose.yaw, pitch: pose.pitch },
      offset,
      azimuth: c.azimuthAngle,
      polar: c.polarAngle,
      polarGoal: Math.min(c.maxPolarAngle, Math.max(c.minPolarAngle, def.polarDeg * DEG)),
    };
    if (mode === 'chase' || (mode === 'cutaway' && c.distance > def.distance * 2)) void c.dollyTo(def.distance * distanceScale, true);
  }

  /** The followed entity moved: its pose for this frame. Throws when nothing is followed. */
  setFollowPose(pose: EntityPose): void {
    const f = this.followState;
    if (f === null) throw new Error('CameraRig.setFollowPose: not following anything, call follow first');
    assertPose(pose, 'CameraRig.setFollowPose');
    f.pose = { position: { ...pose.position }, yaw: pose.yaw, pitch: pose.pitch };
  }

  /** Ends the follow where the camera is. The map zoom limit returns; a closer camera backs out smoothly. */
  stopFollow(): void {
    if (this.followState === null) return;
    this.followState = null;
    this.applyMapZoomLimit();
  }

  /**
   * Keeps the map camera at least `metres` from its focus (null: only the rig's own minimum). The app raises the
   * floor where the map has no close-up detail, so the wheel cannot take the view down to an empty patch of sea.
   * A follow ignores it: a machine is watched from close wherever it is.
   */
  setZoomFloor(metres: number | null): void {
    const floor = metres ?? 0;
    if (!(floor >= 0) || floor >= this.maxDistance) {
      throw new RangeError(`CameraRig.setZoomFloor: floor must be in [0, ${this.maxDistance}) m or null, got ${String(metres)}`);
    }
    if (floor === this.zoomFloor) return;
    this.zoomFloor = floor;
    if (this.followState === null) this.applyMapZoomLimit();
  }

  private applyMapZoomLimit(): void {
    const c = this.controls;
    const min = Math.max(this.minDistance, this.zoomFloor);
    c.minDistance = min;
    if (c.distance < min) void c.dollyTo(min, true);
  }

  /** Mode of the follow in progress, or null. */
  get following(): FollowMode | null {
    return this.followState?.mode ?? null;
  }

  /**
   * Point the focus sits on: the entity, or in the chase view a little ahead of it along the direction the
   * camera looks (the smoothed heading, so a sudden turn of the machine does not jerk the focus).
   */
  private anchorOf(mode: FollowMode, pose: EntityPose, cameraAzimuth: number, out: Vector3): Vector3 {
    const { lookAheadM: ahead, dropM } = FOLLOW_DEFAULTS[mode];
    return out.set(
      pose.position.x - Math.sin(cameraAzimuth) * ahead,
      pose.position.y - dropM,
      pose.position.z - Math.cos(cameraAzimuth) * ahead,
    );
  }

  private applyFollow(dt: number, axes: CameraAxes | undefined): void {
    const f = this.followState;
    if (f === null) return;
    const c = this.controls;
    const k = dt > 0 ? Math.exp(-dt / FOLLOW_TAU) : 1;
    f.offset.multiplyScalar(k);
    if (f.offset.lengthSq() < 1e-6) f.offset.set(0, 0, 0);
    if (f.mode === 'chase') {
      // Behind the machine: the camera sits opposite the direction of travel (sin yaw, 0, cos yaw).
      if (axes !== undefined && axes.tilt !== 0) {
        f.polarGoal = Math.min(c.maxPolarAngle, Math.max(c.minPolarAngle, f.polarGoal - axes.tilt * TILT_RATE * dt));
      }
      f.azimuth += angleDiff(f.pose.yaw + Math.PI, f.azimuth) * (1 - k);
      f.polar += (f.polarGoal - f.polar) * (1 - k);
      void c.rotateTo(f.azimuth, f.polar, false);
    }
    const a = this.anchorOf(f.mode, f.pose, f.azimuth, this.tmp2).add(f.offset);
    void c.moveTo(a.x, a.y, a.z, false);
  }

  /** Puts the end value of the focus on the surface; the current value eases there with the rig's smoothing. */
  private rideGround(): void {
    if (this.ground === null) return;
    const c = this.controls;
    const end = c.getTarget(this.tmp, true);
    const g = this.ground(end.x, end.z);
    if (g === null) return;
    if (!Number.isFinite(g)) throw new RangeError(`CameraRig: ground function returned ${g} at (${end.x}, ${end.z})`);
    if (Math.abs(g - end.y) > 0.01) void c.moveTo(end.x, g, end.z, true);
  }

  /** Lifts a camera that sits below the surface plus the clearance: tilts towards top-down, then backs out. */
  private keepAboveGround(): void {
    if (this.ground === null) return;
    const c = this.controls;
    for (let i = 0; i < 6; i++) {
      const p = c.getPosition(this.tmp, false);
      const g = this.ground(p.x, p.z);
      if (g === null) return;
      if (!Number.isFinite(g)) throw new RangeError(`CameraRig: ground function returned ${g} at (${p.x}, ${p.z})`);
      const need = g + this.groundClearance;
      if (p.y >= need - 1e-6) return;
      const t = c.getTarget(this.tmp2, false);
      let d = c.distance;
      // Height above the focus the camera needs, as a share of the distance; the extra metre makes the loop converge on slopes.
      const rise = need + i - t.y;
      const steepest = Math.cos(c.minPolarAngle);
      if (rise > d * steepest) {
        d = Math.min(c.maxDistance, rise / steepest);
        void c.dollyTo(d, false);
      }
      const polar = Math.acos(Math.min(steepest, Math.max(-1, rise / d)));
      void c.rotateTo(c.azimuthAngle, polar, false);
      c.update(0);
    }
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
    const f = this.followState;
    if (axes !== undefined && dt > 0) {
      const d = c.distance;
      // While following, the focus belongs to the entity: pan keys do nothing. The chase view also owns the angles.
      if (f === null) {
        if (axes.panX !== 0) void c.truck(axes.panX * d * PAN_RATE * dt, 0, false);
        if (axes.panZ !== 0) void c.forward(axes.panZ * d * PAN_RATE * dt, false);
      }
      if (f?.mode !== 'chase' && (axes.rotate !== 0 || axes.tilt !== 0)) {
        void c.rotate(-axes.rotate * ROTATE_RATE * dt, -axes.tilt * TILT_RATE * dt, false);
      }
      if (axes.zoom !== 0) void c.dollyTo(d * Math.exp(-axes.zoom * ZOOM_RATE * dt), false);
    }
    if (f === null) this.rideGround();
    else this.applyFollow(dt, axes);
    const updated = c.update(dt);
    if (f === null || f.mode === 'orbit') this.keepAboveGround();
    // A follow re-applies its focus and angles every frame, which camera-controls reports as an update even
    // when the entity stands still: the camera is moving only if its position or focus actually changed.
    const p = c.getPosition(this.tmp, false);
    const t = c.getTarget(this.tmp2, false);
    const last = this.lastPose;
    const shift = Math.max(
      Math.abs(p.x - last[0]),
      Math.abs(p.y - last[1]),
      Math.abs(p.z - last[2]),
      Math.abs(t.x - last[3]),
      Math.abs(t.y - last[4]),
      Math.abs(t.z - last[5]),
    );
    last[0] = p.x;
    last[1] = p.y;
    last[2] = p.z;
    last[3] = t.x;
    last[4] = t.y;
    last[5] = t.z;
    this.moving = f === null ? updated : shift > REST_EPSILON_M;
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

  /** Moves to a saved pose. Distance and pitch are clamped to the rig limits. Ends any follow. */
  setBookmark(b: CameraBookmark, animate: boolean): void {
    this.stopFollow();
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
    const c = this.controls;
    c.update(0);
    // An instant move lands on the surface at once: easing the focus there would keep the camera moving
    // (and the picture redrawing) for a second after a move that was asked to be instant.
    if (this.ground !== null && this.followState === null) {
      const end = c.getTarget(this.tmp, true);
      const g = this.ground(end.x, end.z);
      if (g !== null) {
        if (!Number.isFinite(g)) throw new RangeError(`CameraRig: ground function returned ${g} at (${end.x}, ${end.z})`);
        if (Math.abs(g - end.y) > 0.01) {
          void c.moveTo(end.x, g, end.z, false);
          c.update(0);
        }
      }
      this.keepAboveGround();
    }
    this.moving = false;
  }

  /** Smoothly re-centres on a world point, keeping the current viewing angle. Optionally sets the zoom distance. Ends any follow. */
  focusOn(target: WorldPos, opts: { distance?: number; animate?: boolean } = {}): void {
    this.stopFollow();
    const animate = opts.animate ?? true;
    void this.controls.moveTo(target.x, target.y, target.z, animate);
    if (opts.distance !== undefined) void this.controls.dollyTo(opts.distance, animate);
    if (!animate) this.settleNow();
  }

  dispose(): void {
    this.controls.dispose();
  }
}

/**
 * Hands the pointer to a tool for the length of a claimed gesture: the rig ignores mouse and wheel from the
 * pointer.down a tool claimed until its release. Returns an unsubscribe function, which also re-enables the rig.
 */
export function linkClaims(mapper: { onClaim(cb: (claimed: boolean) => void): () => void }, rig: CameraRig): () => void {
  const off = mapper.onClaim((claimed) => rig.setPointerEnabled(!claimed));
  return () => {
    off();
    rig.setPointerEnabled(true);
  };
}
