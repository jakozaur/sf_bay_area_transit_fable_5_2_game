/**
 * Sim, tool and scenario contracts (work packages G, H, J; doc 10 sections 3 and 11).
 * PLACEHOLDERS: the shapes of Command, SimSnapshot, SimStateV, ProjectRecord, Objective and InputAction
 * are minimal on purpose. The owning work package extends them additively (new union members, new fields);
 * it must not rename or remove what is here.
 * Round 2 (docs/CONTRACTS.md) closed the tool side: ToolAction and ToolStatus are in ./tooling.ts,
 * PreviewGeometry in ./entities.ts, and Tool and ToolContext below are generic over the sim package's types.
 */
import type { PreviewGeometry } from './entities.ts';
import type { CameraBookmark } from './render.ts';
import type { GameServices } from './services.ts';
import type { ToolAction, ToolOptionValue, ToolOptionValues, ToolStatus } from './tooling.ts';
import type { WorldStore } from './world.ts';

/**
 * A serializable state change applied at a tick boundary. Discriminated by `t`.
 * The sim package replaces the open payload with a closed union of concrete commands.
 */
export interface Command {
  t: string;
  readonly [field: string]: unknown;
}

/** Immutable, UI-facing view of sim state, published after each step. */
export interface SimSnapshot {
  /** Ticks since scenario start. */
  tick: number;
  /** Game date, ISO 8601 (YYYY-MM-DD). */
  date: string;
  /** Money is integer cents everywhere. */
  budgetCents: number;
}

/** Versioned, JSON-serializable sim state. */
export interface SimStateV {
  schemaVersion: number;
  readonly [field: string]: unknown;
}

export interface Sim {
  /** Advances exactly one tick, applying the commands first, in order. */
  step(commands: readonly Command[]): void;
  /** Immutable, UI-facing. */
  snapshot(): SimSnapshot;
  serialize(): SimStateV;
  /** Stable hash of the canonical state: same seed and commands give the same hash at tick N. */
  hash(): string;
}

/** Save container v1 (doc 10 section 3.5). */
export interface SaveFile {
  format: 'bayvox-save';
  /** Bump on any shape change. */
  schemaVersion: number;
  /** WorldManifest.worldVersion the save was made against. */
  worldDataVersion: string;
  scenarioId: string;
  seed: number;
  tick: number;
  sim: SimStateV;
  /** Free-form voxel deltas; `chunk` is a ChunkKey in decimal, `rle` is base64. Unused so far: manual digs travel in `editLog`. */
  edits: { chunk: string; rle: string }[];
  /** Integrity check after load. */
  stateHash: string;
  /**
   * Reference to the manual world edit log (hand digs) stored next to this save. Absent when nothing was dug by hand.
   * Carves made by the sim (headings, station boxes) are not in the log: loadSim replays them from the sim state.
   */
  editLog?: EditLogRef;
}

/**
 * Where the manual edit log of a save lives and what it must look like when read back.
 * The log itself is the packages/world edit-log text format (serializeEditLog), kept by the app's storage under `key`.
 * Load order: generate the site, replay this log, then loadSim (which replays the sim's own carves).
 */
export interface EditLogRef {
  /** Storage key of the serialized log, next to the save slot. */
  key: string;
  /** Number of edits in the log. */
  edits: number;
  /** stableHashString of the serialized log. A mismatch on load fails loudly. */
  hash: string;
}

/** Signatures the sim package exports. */
export type CreateSimFn = (scenario: Scenario, seed: number, world: WorldStore) => Sim;
export type LoadSimFn = (save: SaveFile, world: WorldStore) => Sim;

/** A pre-built or planned piece of the network. Placeholder. */
export interface ProjectRecord {
  id: string;
  kind: string;
  readonly [field: string]: unknown;
}

/** A scenario goal, for example "connect 4th and King to Salesforce Transit Center". Placeholder. */
export interface Objective {
  id: string;
  title: string;
  readonly [field: string]: unknown;
}

export interface Scenario {
  id: string;
  title: string;
  start: { date: string; budgetCents: number; policies: string[]; tech: string[] };
  camera: CameraBookmark;
  /** Pre-built network. */
  existing: ProjectRecord[];
  objectives: Objective[];
  costProfile: 'bayAreaStatusQuo' | 'polishBaseline' | (string & {});
}

/**
 * Semantic input action from packages/input, for example `camera.pan` or `view.toggleCut`. Placeholder for
 * the whole action stream; the subset tools consume is the closed ToolAction union (./tooling.ts).
 */
export interface InputAction {
  type: string;
  readonly [field: string]: unknown;
}

/**
 * What a tool may read and call while handling an action. The type parameters are the sim package's
 * snapshot, command and query types; packages/sim exports the closed instance as BayToolContext.
 */
export interface ToolContext<S extends SimSnapshot = SimSnapshot, C extends Command = Command, Q extends object = object> {
  world: WorldStore;
  /** Snapshot of the current frame. */
  snapshot: S;
  /** Picking, ground height, estimates, camera, audio. A tool never touches the DOM or the renderer. */
  services: GameServices<S, C, Q>;
}

/**
 * A pointer tool. The tool host (packages/tools createToolHost) owns the active tool and calls, in this order:
 * activate, then per input onAction, per frame update, then preview and commit after each of those, and
 * deactivate when the player switches away. Commands returned by commit go to the sim queue; the tool keeps
 * no copy of sim state and re-reads the snapshot on every call.
 */
export interface Tool<S extends SimSnapshot = SimSnapshot, C extends Command = Command, Q extends object = object> {
  id: string;
  /** Null when the tool can be activated in this state, else one line saying why not. Drives the toolbar button. */
  unavailableReason(ctx: ToolContext<S, C, Q>): string | null;
  /** The tool became active. `options` are initial option values by key (core TOOL_KEYS). */
  activate?(ctx: ToolContext<S, C, Q>, options?: ToolOptionValues): void;
  /** The tool stops being active: drop the draft selection and any possession. */
  deactivate?(ctx: ToolContext<S, C, Q>): void;
  /**
   * Handles one action. Returning true consumes it: for `pointer.down` that claims the gesture (the camera
   * does not move), for anything else it stops the action from reaching view and camera shortcuts.
   */
  onAction(a: ToolAction, ctx: ToolContext<S, C, Q>): boolean | undefined;
  /** Once per rendered frame while active. `dtSeconds` is wall time; never use it to change sim state. */
  update?(dtSeconds: number, ctx: ToolContext<S, C, Q>): void;
  /** The renderer draws it; not sim state. */
  preview(): PreviewGeometry | null;
  /** Drains the commands produced since the last call. */
  commit(): C[];
  /** Hint line, readouts, options and buttons for the UI. Called after every onAction and update. */
  status(): ToolStatus;
  /** Sets one option by key. Throws for an unknown key or an out-of-range value. */
  setOption(key: string, value: ToolOptionValue, ctx: ToolContext<S, C, Q>): void;
  /** Runs one of the tool's command buttons. Throws for an unknown or disabled id. */
  invoke(commandId: string, ctx: ToolContext<S, C, Q>): void;
}
