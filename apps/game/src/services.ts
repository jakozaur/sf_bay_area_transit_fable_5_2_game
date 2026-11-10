/**
 * GameServices of the running app (round 2, docs/CONTRACTS.md): the one object packages/ui and packages/tools
 * call. Each port is a thin adapter over a part of the app shell (game.ts builds those parts and hands them in);
 * nothing here owns state the shell does not own.
 */
import {
  type AudioPort,
  type CameraBookmark,
  type CameraPort,
  type CameraState,
  type CameraStatus,
  type EntityPose,
  type EntityRef,
  type FollowMode,
  type FollowTarget,
  GAME_SPEEDS,
  type GameSpeed,
  type GameViewState,
  type GroundPick,
  type NamedBookmark,
  OVERLAY_LAYERS,
  type OverlayLayerId,
  type OverlayPort,
  type OverlaySpec,
  type PreviewGeometry,
  type SessionPort,
  type TimePort,
  type ToolPort,
  type ViewPort,
  type WorldPort,
  type WorldPos,
} from '@bayvox/core';
import type { OverlayLayer } from '@bayvox/render';
import type { BayServices } from '@bayvox/sim';
import { Cell } from './cell.ts';
import type { SimDriver } from './sim-driver.ts';

// ---------------------------------------------------------------- time

export interface TimeControl extends TimePort {
  readonly speed: Cell<GameSpeed>;
}

export function createTime(onChange: (speed: GameSpeed) => void): TimeControl {
  const speed = new Cell<GameSpeed>(1);
  let beforePause: GameSpeed = 1;
  return {
    speed,
    setSpeed(s) {
      if (!(GAME_SPEEDS as readonly number[]).includes(s))
        throw new RangeError(`time.setSpeed: speed must be one of ${GAME_SPEEDS.join(', ')}, got ${s}`);
      if (s !== 0) beforePause = s;
      if (speed.get() === s) return;
      speed.set(s);
      onChange(s);
    },
    togglePause() {
      this.setSpeed(speed.get() === 0 ? beforePause : 0);
    },
  };
}

// ---------------------------------------------------------------- view

export interface ViewControl extends ViewPort {
  readonly state: Cell<GameViewState>;
}

/**
 * `cutLevel` proposes a cut height when the cut is switched on without one (null: keep the level it had).
 */
export function createView(
  initial: GameViewState,
  limits: { minY: number; maxY: number; maxRadius: number },
  cutLevel: () => number | null = () => null,
): ViewControl {
  const state = new Cell<GameViewState>({ ...initial });
  return {
    state,
    set(v) {
      const next = { ...state.get(), ...v };
      if (v.cut === true && !state.get().cut && v.cutY === undefined) next.cutY = cutLevel() ?? next.cutY;
      if (!Number.isInteger(next.cutY)) throw new RangeError(`setView: cutY must be a whole metre, got ${next.cutY}`);
      if (!(next.cutRadius > 0) || next.cutRadius > limits.maxRadius) {
        throw new RangeError(`setView: cutRadius must be in (0, ${limits.maxRadius}] m, got ${next.cutRadius}`);
      }
      // The buttons and keys step the cut one metre at a time: the ends of the range hold, they do not fail.
      next.cutY = Math.min(limits.maxY, Math.max(limits.minY, next.cutY));
      const cur = state.get();
      if (next.cut === cur.cut && next.cutY === cur.cutY && next.cutRadius === cur.cutRadius && next.xray === cur.xray) return;
      state.set(next);
    },
  };
}

// ---------------------------------------------------------------- camera

/** The part of packages/input CameraRig the camera port drives. */
export interface RigLike {
  setBookmark(b: CameraBookmark, animate: boolean): void;
  focusOn(target: WorldPos, opts?: { distance?: number; animate?: boolean }): void;
  follow(mode: FollowMode, pose: EntityPose, distanceScale?: number): void;
  setFollowPose(pose: EntityPose): void;
  stopFollow(): void;
  readonly following: FollowMode | null;
  /** Metres between camera and focus. */
  readonly distance: number;
  target(): WorldPos;
}

/** A follow that ends closer than this leaves the camera at PULL_BACK_M from where the entity was, metres. */
const CLOSE_M = 200;
const PULL_BACK_M = 420;

export interface CameraControl extends CameraPort {
  readonly status: Cell<CameraStatus>;
  setBookmarks(list: NamedBookmark[]): void;
  /** Once per frame, after the scene is built: moves the followed pose, or ends a follow whose entity is gone. */
  track(): void;
  following(): FollowTarget | null;
}

export function createCamera(deps: {
  rig: RigLike;
  /** Camera of the current frame. */
  state: () => CameraState;
  /** Canvas size in CSS pixels. */
  size: () => { width: number; height: number };
  /** Pose of an entity in the scene of this frame, or null. */
  poseOf: (ref: EntityRef) => EntityPose | null;
  /** How much further back than the default a follow of this entity starts (1: the default); for machines larger than a twin bore. */
  followScale?: (ref: EntityRef) => number;
  /** False makes every move instant (frozen clock). */
  animate: () => boolean;
}): CameraControl {
  const { rig } = deps;
  const status = new Cell<CameraStatus>({ bookmarks: [], following: null });
  const setFollowing = (following: FollowTarget | null): void => {
    const cur = status.get();
    if (cur.following === following) return;
    status.set({ bookmarks: cur.bookmarks, following });
  };
  const endFollow = (pullBack = false): void => {
    const was = status.get().following;
    rig.stopFollow();
    setFollowing(null);
    // Left next to a machine underground the map camera would sit inside a building: back out to see the district.
    if (pullBack && was !== null && rig.distance < CLOSE_M) rig.focusOn(rig.target(), { distance: PULL_BACK_M, animate: deps.animate() });
  };
  return {
    status,
    state: deps.state,
    setBookmarks(list) {
      status.set({ bookmarks: list, following: status.get().following });
    },
    goTo(bookmarkId) {
      const b = status.get().bookmarks.find((x) => x.id === bookmarkId);
      if (b === undefined) {
        throw new RangeError(
          `camera.goTo: unknown bookmark "${bookmarkId}" (have: ${
            status
              .get()
              .bookmarks.map((x) => x.id)
              .join(', ') || 'none'
          })`,
        );
      }
      endFollow();
      rig.setBookmark(b.bookmark, deps.animate());
    },
    flyTo(pose) {
      endFollow();
      rig.setBookmark(pose, deps.animate());
    },
    focusOn(target, distanceM) {
      endFollow();
      rig.focusOn(target, distanceM === undefined ? { animate: deps.animate() } : { distance: distanceM, animate: deps.animate() });
    },
    follow(target) {
      if (target === null) {
        endFollow(true);
        return;
      }
      const pose = deps.poseOf(target.entity);
      if (pose === null) throw new Error(`camera.follow: there is no ${target.entity.type} "${target.entity.id}" to follow`);
      // The cutaway around a machine is a trench along its drive, open behind it: the view into it is from behind,
      // so a 'cutaway' follow of a machine is flown as a chase. Trains and stations keep the free orbit.
      rig.follow(
        target.mode === 'cutaway' && target.entity.type === 'tbm' ? 'chase' : target.mode,
        pose,
        deps.followScale?.(target.entity) ?? 1,
      );
      setFollowing({ entity: { ...target.entity }, mode: target.mode });
    },
    project(p) {
      const cam = deps.state();
      const { width, height } = deps.size();
      const fx = cam.target.x - cam.position.x;
      const fy = cam.target.y - cam.position.y;
      const fz = cam.target.z - cam.position.z;
      const fl = Math.hypot(fx, fy, fz);
      if (!(fl > 0)) return null;
      const f = { x: fx / fl, y: fy / fl, z: fz / fl };
      // right = forward x up, up = right x forward (the renderer's pinhole: y up, vertical field of view).
      let rx = -f.z;
      let rz = f.x;
      const rl = Math.hypot(rx, rz);
      if (!(rl > 0)) return null;
      rx /= rl;
      rz /= rl;
      const ux = -rz * f.y;
      const uy = rz * f.x - rx * f.z;
      const uz = rx * f.y;
      const dx = p.x - cam.position.x;
      const dy = p.y - cam.position.y;
      const dz = p.z - cam.position.z;
      const depth = dx * f.x + dy * f.y + dz * f.z;
      if (depth <= 0) return null;
      const t = Math.tan((cam.fovYDeg * Math.PI) / 360);
      const ndcX = (dx * rx + dz * rz) / (depth * t * cam.aspect);
      const ndcY = (dx * ux + dy * uy + dz * uz) / (depth * t);
      return { x: ((ndcX + 1) / 2) * width, y: ((1 - ndcY) / 2) * height };
    },
    track() {
      const f = status.get().following;
      if (f === null) return;
      if (rig.following === null) {
        // The rig left the follow by itself (a bookmark, a focus move).
        setFollowing(null);
        return;
      }
      const pose = deps.poseOf(f.entity);
      if (pose === null) endFollow(true);
      else rig.setFollowPose(pose);
    },
    following: () => status.get().following,
  };
}

// ---------------------------------------------------------------- overlay

export interface OverlayControl extends OverlayPort {
  preview(): PreviewGeometry | null;
  highlighted(): EntityRef | null;
  layerVisible(layer: OverlayLayerId): boolean;
  /** Removes every item callers added and clears preview and highlight (a new sim). */
  clear(): void;
}

export function createOverlay(overlay: OverlayLayer, networkIds: () => readonly string[]): OverlayControl {
  let preview: PreviewGeometry | null = null;
  let highlight: EntityRef | null = null;
  let next = 0;
  const live = new Set<string>();
  const visible: Record<OverlayLayerId, boolean> = { railNetwork: true, alignments: true, stations: true, tunnels: true, trains: true };
  const put = (id: string, spec: OverlaySpec): void => {
    if (spec.kind === 'polyline') {
      if (spec.points.length < 2) {
        overlay.remove(id);
        return;
      }
      overlay.setPolyline(id, spec.points, {
        color: spec.color,
        ...(spec.widthPx === undefined ? {} : { widthPx: spec.widthPx }),
        ...(spec.xray === undefined ? {} : { xray: spec.xray }),
        ...(spec.dashM === undefined ? {} : { dashM: spec.dashM }),
      });
    } else {
      overlay.setMarker(id, spec.position, {
        color: spec.color,
        ...(spec.sizeM === undefined ? {} : { sizeM: spec.sizeM }),
        ...(spec.xray === undefined ? {} : { xray: spec.xray }),
      });
    }
  };
  return {
    add(spec) {
      const id = `port.${next++}`;
      live.add(id);
      put(id, spec);
      let shown = true;
      const alive = (what: string): void => {
        if (!live.has(id)) throw new Error(`overlay handle ${id}: ${what} after remove`);
      };
      return {
        id,
        update(s) {
          alive('update');
          put(id, s);
          if (!shown && overlay.has(id)) overlay.setVisible(id, false);
        },
        setVisible(v) {
          alive('setVisible');
          shown = v;
          if (overlay.has(id)) overlay.setVisible(id, v);
        },
        remove() {
          alive('remove');
          live.delete(id);
          overlay.remove(id);
        },
      };
    },
    setPreview(p) {
      preview = p;
      overlay.touch();
    },
    highlight(ref) {
      highlight = ref;
      overlay.touch();
    },
    setLayerVisible(layer, v) {
      if (!(OVERLAY_LAYERS as readonly string[]).includes(layer)) throw new RangeError(`overlay.setLayerVisible: unknown layer "${layer}"`);
      visible[layer] = v;
      if (layer === 'railNetwork') for (const id of networkIds()) if (overlay.has(id)) overlay.setVisible(id, v);
      overlay.touch();
    },
    preview: () => preview,
    highlighted: () => highlight,
    layerVisible: (layer) => visible[layer],
    clear() {
      for (const id of live) overlay.remove(id);
      live.clear();
      preview = null;
      highlight = null;
      overlay.touch();
    },
  };
}

// ---------------------------------------------------------------- the bundle

export interface ServiceParts {
  driver: SimDriver;
  time: TimePort;
  session: SessionPort;
  camera: CameraPort;
  view: ViewPort;
  world: WorldPort;
  overlay: OverlayPort;
  /** Lazy: the tool host is created with these services. */
  tools: () => ToolPort;
  audio: AudioPort;
}

export function createGameServices(parts: ServiceParts): BayServices {
  const { driver } = parts;
  return {
    sim: {
      snapshot: driver.readable,
      command: (c) => driver.command(c),
      estimateAlignment: (req) => driver.sim.estimateAlignment(req),
    },
    time: parts.time,
    session: parts.session,
    camera: parts.camera,
    view: parts.view,
    world: parts.world,
    overlay: parts.overlay,
    get tools() {
      return parts.tools();
    },
    audio: parts.audio,
  };
}

export type { GroundPick };
