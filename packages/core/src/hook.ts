/** Test hook the app exposes as `window.__game` (doc 10 section 8.3). Structural asserts go through it before any pixel comparison. */
import type { CameraBookmark, CameraState, RenderStats } from './render.ts';
import type { Command, SimSnapshot } from './sim.ts';

export interface GameStats extends RenderStats {
  /** WebGL UNMASKED_RENDERER string, for example "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, ...)". */
  renderer: string;
  /** Sim tick the last frame showed. */
  tick: number;
  /** Commands accepted through the hook or the UI and not yet applied. */
  pendingCommands: number;
  /** Quads held in uploaded chunk meshes (opaque plus transparent). Optional until every app shell reports it. */
  quads?: number;
  /** Frames drawn since boot. */
  frame?: number;
  /** Quads held in column LOD batches (far and city tiers), shown or not. */
  columnQuads?: number;
  /** False when the camera is so far out that voxel chunks and the city tier are not drawn (the far tier stands in). */
  voxelsShown?: boolean;
}

/** View toggles of the underground modes (doc 03 section 8), readable and settable through the hook. */
export interface GameViewState {
  cut: boolean;
  /** World y of the horizontal cut plane, metres. */
  cutY: number;
  /** Radius around the camera focus inside which the cut applies, metres. */
  cutRadius: number;
  xray: boolean;
}

/** Result of GameTestHook.benchFrames: synchronous draw plus gl.finish per frame, milliseconds. */
export interface FrameBenchResult {
  frames: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface GameTestHook {
  /** Resolves once the app has booted and drawn its first frame. Rejects with the boot error. */
  ready: Promise<void>;
  stats(): GameStats;
  simHash(): string;
  /** Queues a command for the next tick. */
  command(c: Command): void;
  /** Later milestones (doc 10 section 8.3). Optional until the owning package lands. */
  settled?(): Promise<void>;
  /** Applies queued commands, then advances the sim by exactly `ticks` game days, whatever the speed. */
  stepSim?(ticks: number): void;
  /** UI-facing sim state after the last step (the sim package's full snapshot type extends SimSnapshot). */
  snapshot?(): SimSnapshot;
  setCamera?(b: CameraBookmark): void;
  /** The camera of the current frame, for projecting world points to the screen in tests. */
  camera?(): CameraState;
  pick?(screenX: number, screenY: number): { voxel: [number, number, number]; material: number; face?: number } | null;
  /** Material id at a world voxel. */
  getVoxel?(x: number, y: number, z: number): number;
  /** Carves a sphere of `radius` voxels at a world position (temporary dig tool). Returns the number of dirty chunks. */
  dig?(worldPos: { x: number; y: number; z: number }, radius: number): number;
  view?(): GameViewState;
  setView?(v: Partial<GameViewState>): void;
  /** Draws `frames` frames back to back outside requestAnimationFrame and reports per-frame wall time. */
  benchFrames?(frames: number): FrameBenchResult;
}
