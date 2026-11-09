/**
 * Sim, tool and scenario contracts (work packages G, H, J; doc 10 sections 3 and 11).
 * PLACEHOLDERS: the shapes of Command, SimSnapshot, SimStateV, ProjectRecord, Objective, InputAction,
 * ToolContext and PreviewGeometry are minimal on purpose. The owning work package extends them
 * additively (new union members, new fields); it must not rename or remove what is here.
 */
import type { CameraBookmark } from './render.ts';
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
  /** Free-form voxel deltas; `chunk` is a ChunkKey in decimal, `rle` is base64. */
  edits: { chunk: string; rle: string }[];
  /** Integrity check after load. */
  stateHash: string;
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

/** Semantic input action from packages/input, for example `camera.pan` or `tool.primary`. Placeholder. */
export interface InputAction {
  type: string;
  readonly [field: string]: unknown;
}

/** What a tool may read while handling an action. Placeholder. */
export interface ToolContext {
  world: WorldStore;
  snapshot: SimSnapshot;
}

/** Geometry the renderer draws for a tool preview; not sim state. Placeholder. */
export interface PreviewGeometry {
  kind: string;
  readonly [field: string]: unknown;
}

export interface Tool {
  id: string;
  onAction(a: InputAction, ctx: ToolContext): void;
  /** The renderer draws it; not sim state. */
  preview(): PreviewGeometry | null;
  commit(): Command[];
}
