/**
 * GameServices: the one object the UI and the tools call. Implemented by apps/game (the composition root);
 * packages/ui and packages/tools are built and tested against fakes of it.
 *
 * Package neutral: core cannot name the sim's snapshot, command or query types, so the interface is generic.
 * packages/sim exports the closed instance, `BayServices`, which is what ui, tools and the app import.
 *
 * Rules for every method: synchronous unless it returns a Promise; throws (or rejects) with a one-line
 * diagnostic naming the offending input; never falls back silently.
 */
import type { VoxelCoord } from './chunk.ts';
import type { EntityRef, PreviewGeometry } from './entities.ts';
import type { WorldPos } from './frame.ts';
import type { GameViewState } from './hook.ts';
import type { CameraBookmark, CameraState } from './render.ts';
import type { Command, SimSnapshot } from './sim.ts';
import type { ToolAvailability, ToolId, ToolOptionValue, ToolOptionValues, ToolStatus } from './tooling.ts';

/** Minimal observable value. The UI wraps these in signals; nothing here depends on a UI library. */
export interface Readable<T> {
  /** Current value. The same object is returned until the value changes, so identity can be used to skip work. */
  get(): T;
  /** Calls `cb` after every change (not immediately). Returns an unsubscribe function. */
  subscribe(cb: (value: T) => void): () => void;
}

// ---------------------------------------------------------------- sim

/** The running sim, as callers see it. `Q` adds the sim package's typed queries (estimateAlignment). */
export interface SimPort<S extends SimSnapshot = SimSnapshot, C extends Command = Command> {
  /** Latest snapshot. Republished at most once per rendered frame, and only when the sim state changed. */
  readonly snapshot: Readable<S>;
  /**
   * Validates a command now (a malformed one throws here, naming the field) and queues it for the next sub-step.
   * Rule violations (wrong phase, no money) do not throw: they appear in the snapshot's notices.
   */
  command(c: C): void;
}

// ---------------------------------------------------------------- time

export const GAME_SPEEDS = [0, 1, 10, 100] as const;
/** 0 is paused. What 1x means in game days per second is the sim's call (snapshot clock), so a phase never drags. */
export type GameSpeed = (typeof GAME_SPEEDS)[number];

export interface TimePort {
  readonly speed: Readable<GameSpeed>;
  setSpeed(speed: GameSpeed): void;
  /** Pauses, or returns to the speed that was set before the pause. */
  togglePause(): void;
}

// ---------------------------------------------------------------- session: missions, save, load

/** The real project in four lines, shown on the briefing card. Every line is a sourced fact. */
export interface MissionBriefing {
  /** What the project is. */
  what: string;
  /** The ghost: the sponsor's official cost. */
  officialCost: string;
  /** The ghost: the sponsor's official opening date. */
  officialDate: string;
  /** Why it matters. */
  why: string;
  source: string;
}

/** One row of the mission list on the title screen. */
export interface MissionCard {
  /** Scenario id. */
  id: string;
  title: string;
  /** One line under the title. */
  pitch: string;
  /** Voxel site the mission plays on (packages/pipeline/sites.json). */
  siteId: string;
  /** Free build: always unlocked, no ghost, no scorecard gate. */
  freeBuild: boolean;
  locked: boolean;
  /** "Open The Portal first." Null when unlocked. */
  lockReason: string | null;
  /** The player has opened this mission's line at least once. */
  completed: boolean;
  /** Best star rating so far, 0 to 3, or null when never completed. */
  bestStars: number | null;
  briefing: MissionBriefing;
  /** Objective titles, in scenario order. */
  objectives: string[];
}

/** Result of a completed mission, kept in the campaign profile. Money is integer cents. */
export interface MissionResult {
  stars: number;
  costCents: number;
  costPerKmCents: number;
  openDate: string;
  /** Your cost divided by what Poland would have paid, as computed by the model. */
  ratioToPoland: number;
}

/** Campaign profile: which missions the player has opened. Persisted by the app apart from any save slot. */
export interface CampaignProgress {
  schemaVersion: 1;
  /** Best result per scenario id. A mission unlocks when the one before it in campaign order has an entry. */
  missions: Record<string, MissionResult>;
}

/** A stored save, for the Continue button and the menu. */
export interface SaveSlotInfo {
  slot: string;
  scenarioId: string;
  title: string;
  /** Game date of the save, ISO. */
  date: string;
  tick: number;
  /** Wall-clock time of the save, ISO 8601. */
  savedAt: string;
}

export type GameScreen = 'title' | 'briefing' | 'loading' | 'playing' | 'scorecard';

export interface SessionState {
  screen: GameScreen;
  /** Scenario being briefed, loaded or played. Null on the title screen. */
  missionId: string | null;
  /** Set while a site or a save loads. `progress` is 0..1. */
  loading: { label: string; progress: number } | null;
  missions: MissionCard[];
  /** Newest first. Empty hides the Continue button. */
  saves: SaveSlotInfo[];
  /** Last failed action (site missing, corrupt save), one line, until the next action. */
  error: string | null;
}

export interface SessionPort {
  readonly state: Readable<SessionState>;
  /** Title to briefing card: flies the camera to the mission's site. Throws for a locked or unknown mission. */
  brief(missionId: string): void;
  /** Loads the scenario's site, creates the sim at tick 0 and switches to 'playing'. Rejects naming what failed to load. */
  start(missionId: string): Promise<void>;
  /** Stores the sim state and the manual world edit log under `slot` (default: the autosave slot). */
  save(slot?: string): Promise<SaveSlotInfo>;
  /** Restores `slot` (default: the newest save): site, manual edits, sim state. Rejects on a corrupt or foreign save. */
  load(slot?: string): Promise<void>;
  /** The current mission again from tick 0 with the same seed. Manual world edits are discarded. */
  restart(): Promise<void>;
  /** Autosaves and returns to the title screen over the whole-Bay view. */
  toTitle(): Promise<void>;
  /** From the scorecard: starts the next mission in campaign order. Rejects when there is none. */
  nextMission(): Promise<void>;
  /** From the scorecard: back to the opened line. */
  keepPlaying(): void;
}

// ---------------------------------------------------------------- camera and view

export interface NamedBookmark {
  id: string;
  label: string;
  /** KeyboardEvent.code of its shortcut, if any. */
  hotkey?: string;
  bookmark: CameraBookmark;
}

/**
 * How the camera tracks an entity.
 * - 'chase': behind and above the entity, looking along its direction of travel.
 * - 'cutaway': orbit around the entity with the ground cut away around it (the cut plane and cap follow the entity).
 * - 'orbit': keeps the player's current angle and distance, only the focus moves.
 */
export type FollowMode = 'chase' | 'cutaway' | 'orbit';

export interface FollowTarget {
  entity: EntityRef;
  mode: FollowMode;
}

export interface CameraStatus {
  bookmarks: NamedBookmark[];
  following: FollowTarget | null;
}

export interface CameraPort {
  readonly status: Readable<CameraStatus>;
  /** Camera of the current frame. */
  state(): CameraState;
  /** Flies to a bookmark of `status.bookmarks`. Throws for an unknown id. Ends any follow. */
  goTo(bookmarkId: string): void;
  flyTo(pose: CameraBookmark): void;
  /** Re-centres on a point, keeping the viewing angle. */
  focusOn(target: WorldPos, distanceM?: number): void;
  /** Starts following an entity, or stops with null. Throws when the entity does not exist. */
  follow(target: FollowTarget | null): void;
  /** World point to CSS pixels on the canvas, for labels anchored in the world. Null when behind the camera. */
  project(p: WorldPos): { x: number; y: number } | null;
}

/** Cut plane and x-ray. */
export interface ViewPort {
  readonly state: Readable<GameViewState>;
  /** Merges and validates (whole-metre cutY, radius within the cap limit). */
  set(v: Partial<GameViewState>): void;
}

// ---------------------------------------------------------------- world

export interface GroundPick {
  voxel: VoxelCoord;
  /** Face of the voxel the ray entered through (core face ids). */
  face: number;
  material: number;
  /** Where the ray enters the voxel, world metres. */
  point: WorldPos;
  /** Ground surface elevation of the column under `point`, world metres. */
  groundY: number;
}

export interface DigResult {
  /** Solid volume removed, cubic metres. 0 when the brush only met air or water. */
  removedM3: number;
  dirtyChunks: number;
}

export interface WorldPort {
  /** First solid voxel under a canvas position, honouring the cut plane. Null over sky or beyond pick range. */
  pick(screenX: number, screenY: number): GroundPick | null;
  /** Ground surface elevation in world metres at a plan position. Throws outside the loaded site. */
  groundAt(x: number, z: number): number;
  /** Material id at a world voxel. */
  voxelAt(x: number, y: number, z: number): number;
  /** Plan rectangle of the loaded voxel site in world metres, half-open. */
  siteBounds(): { minX: number; minZ: number; maxX: number; maxZ: number };
  /**
   * Hand dig: carves a sphere and records the edit in the manual edit log that saves reference.
   * Does not charge; the dig tool sends the sim's chargeDig command with `removedM3`.
   */
  dig(center: WorldPos, radiusM: number): DigResult;
  /**
   * Why the hand brush may not dig at `center` right now, one line for the player, or null when it may. The app
   * refuses where a hole would not be drawn: beyond the 1 m voxel near field, or from a camera so far out that
   * the hole is under a few pixels. Absent: digging is allowed wherever `dig` is (test fakes).
   */
  digBlocked?(center: WorldPos, radiusM: number): string | null;
}

// ---------------------------------------------------------------- overlay, tools, audio

/** A transient overlay item a caller owns: a measuring line, a marker. Entities and previews do not use these. */
export type OverlaySpec =
  | { kind: 'polyline'; points: WorldPos[]; color: number; widthPx?: number; xray?: boolean; dashM?: number }
  | { kind: 'marker'; position: WorldPos; color: number; sizeM?: number; xray?: boolean };

export interface OverlayHandle {
  readonly id: string;
  update(spec: OverlaySpec): void;
  setVisible(visible: boolean): void;
  /** Frees the item. Calling anything on the handle afterwards throws. */
  remove(): void;
}

export const OVERLAY_LAYERS = ['railNetwork', 'alignments', 'stations', 'tunnels', 'trains'] as const;
export type OverlayLayerId = (typeof OVERLAY_LAYERS)[number];

export interface OverlayPort {
  add(spec: OverlaySpec): OverlayHandle;
  /** Shows the preview of the active tool; null clears it. The tool host calls this, the UI normally does not. */
  setPreview(preview: PreviewGeometry | null): void;
  /** Outlines one entity, or none. */
  highlight(ref: EntityRef | null): void;
  setLayerVisible(layer: OverlayLayerId, visible: boolean): void;
}

export interface ToolPort {
  readonly status: Readable<ToolStatus>;
  /** Which toolbar buttons are enabled, re-evaluated when the snapshot changes. */
  readonly availability: Readable<ToolAvailability>;
  /** Switches tool (null: none). Throws for a tool that is unavailable, with the reason from `availability`. */
  activate(id: ToolId | null, options?: ToolOptionValues): void;
  /** Sets one option of the active tool by key (core TOOL_KEYS). Throws for an unknown key or an out-of-range value. */
  setOption(key: string, value: ToolOptionValue): void;
  /** Presses one of the active tool's command buttons (core TOOL_COMMANDS). Throws for an unknown or disabled id. */
  invoke(commandId: string): void;
}

/** One-shot sounds. */
export const AUDIO_CUES = [
  'ui.click',
  'ui.open',
  'ui.close',
  'ui.error',
  'tool.place',
  'tool.remove',
  'tool.invalid',
  'dig',
  'money',
  'phase.done',
  'gate.ready',
  'event.raised',
  'event.resolved',
  'reform.enacted',
  'tbm.launch',
  'tbm.ring',
  'tbm.stop',
  'tbm.offPlan',
  'tbm.breakthrough',
  'station.done',
  'line.open',
  'scorecard.star',
  'mission.complete',
] as const;
export type AudioCue = (typeof AUDIO_CUES)[number];

/** Continuous sounds with a level. */
export const AUDIO_LOOPS = ['tbm.drone', 'train.run', 'timelapse'] as const;
export type AudioLoop = (typeof AUDIO_LOOPS)[number];

export interface AudioPort {
  /** Plays a one-shot. Before the first user gesture the browser forbids audio: the cue is then dropped, by design. */
  cue(id: AudioCue): void;
  /** Sets a loop's level 0..1 (0 stops it) and its pitch factor (1 is neutral; the TBM drone is pitched by ground class). */
  loop(id: AudioLoop, level: number, pitch?: number): void;
  readonly muted: Readable<boolean>;
  setMuted(muted: boolean): void;
}

// ---------------------------------------------------------------- the bundle

export interface GameServices<S extends SimSnapshot = SimSnapshot, C extends Command = Command, Q extends object = object> {
  /** Snapshot, commands and the sim package's queries. */
  readonly sim: SimPort<S, C> & Q;
  readonly time: TimePort;
  readonly session: SessionPort;
  readonly camera: CameraPort;
  readonly view: ViewPort;
  readonly world: WorldPort;
  readonly overlay: OverlayPort;
  readonly tools: ToolPort;
  readonly audio: AudioPort;
}
