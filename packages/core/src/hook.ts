/** Test hook the app exposes as `window.__game` (doc 10 section 8.3). Structural asserts go through it before any pixel comparison. */
import type { CameraBookmark, RenderStats } from './render.ts';
import type { Command } from './sim.ts';

export interface GameStats extends RenderStats {
  /** WebGL UNMASKED_RENDERER string, for example "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, ...)". */
  renderer: string;
  /** Sim tick the last frame showed. */
  tick: number;
  /** Commands accepted through the hook or the UI and not yet applied. */
  pendingCommands: number;
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
  stepSim?(ticks: number): void;
  setCamera?(b: CameraBookmark): void;
  pick?(screenX: number, screenY: number): { voxel: [number, number, number]; material: number } | null;
}
