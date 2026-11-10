/** What the app shell needs from a world, whatever produces it (see seam.ts). */
import type { CameraBookmark, DigResult, VoxelCoord, WorldPos, WorldStore } from '@bayvox/core';
import type { OverlayLayer, VoxelRenderer } from '@bayvox/render';
import type { GroundQuery, SavedEditLog, StampRecords } from '@bayvox/world';

/** Plan rectangle in world metres: [minX, minZ, maxX, maxZ]. */
export type Rect = readonly [number, number, number, number];

/** The column LOD tiers of a world (far and city), built into a renderer. */
export interface LodTiers {
  /**
   * Called first in every frame with the camera to focus distance: picks which tiers are drawn.
   * Returns false when the view is so far out that voxel chunks are not shown; streaming pauses then.
   */
  setCameraDistance(cameraDistanceM: number): boolean;
  /**
   * Called after streaming in every frame. `nearBox` is the plan rectangle the voxel near field covers
   * (null if none) and `nearReady` whether all of it is meshed and uploaded.
   */
  setNearField(nearBox: Rect | null, nearReady: boolean): void;
}

/** The voxel edits of a world, by who made them (packages/world edit layers). */
export interface WorldEdits {
  /** Hand dig: carves a sphere into the manual layer and reports the solid volume removed (core WorldPort.dig). */
  dig(center: WorldPos, radiusM: number): DigResult;
  /** The manual layer as text for a save slot, with the edit count and hash that go into core EditLogRef. */
  save(): SavedEditLog;
  /**
   * Replays a saved manual layer onto the loaded site. With `expected` (the save's EditLogRef) a wrong hash
   * or edit count throws before anything is written. Call after loadSite and before the sim replays its carves.
   */
  load(text: string, expected?: { edits: number; hash: string }): number;
  /** Mission restart: removes every edit (hand digs, sim carves, stamps); the site is pristine again. */
  reset(): void;
  /**
   * Brings station boxes and launch pits in the voxels in line with the sim's records (packages/world
   * WorldStamps). Cheap when nothing changed; call whenever the snapshot changes. Returns the stamps applied.
   */
  syncStamps(records: StampRecords): number;
}

export interface GameWorld {
  store: WorldStore;
  /**
   * The same voxels for the sim: edits made through it are recorded as sim carves, which a save does not
   * store (loadSim replays them). Default: `store`.
   */
  simStore?: WorldStore;
  /**
   * Voxel bounds, half-open: limits streaming and the cut slider. The same two objects for the life of
   * the world; loadSite updates them in place.
   */
  min: VoxelCoord;
  max: VoxelCoord;
  /** Id of the voxel site loaded now (packages/pipeline/sites.json). Absent for worlds without sites. */
  readonly siteId?: string;
  /** Ids of the sites loadSite accepts. */
  readonly siteIds?: readonly string[];
  /** Plan rectangle of a site by id, loaded or not (the briefing flies the camera there). Undefined for an unknown id. */
  siteRect?(siteId: string): Rect | undefined;
  /** Version of the world data (core WorldManifest.worldVersion), recorded in saves. */
  readonly worldVersion?: string;
  /**
   * Replaces the voxel site: fetches it, swaps the store's content (every edit of the previous site is
   * gone), updates `min`, `max`, `bookmarks` and the city LOD tier. Rejects naming the file or site that
   * failed, leaving the previous site in place. The caller then resets its streamer to the new bounds
   * (ChunkStreamer.reset). Loading the site that is already loaded only resets its edits.
   */
  loadSite?(siteId: string): Promise<void>;
  /** Ground anywhere in the game grid, voxel site or not: surface, water depth, material at depth, ray picking. */
  ground?: GroundQuery;
  edits?: WorldEdits;
  /** World-metre box the camera focus may roam in. Default: the voxel bounds. */
  focusMin?: WorldPos;
  focusMax?: WorldPos;
  seaLevel: number;
  /** Saved camera poses; index 0 is the start view. At least one. The same array for the life of the world; loadSite refills it. */
  bookmarks: CameraBookmark[];
  /** Adds the world's vector layer (rail lines, places) to the renderer. */
  decorate(overlay: OverlayLayer): void;
  /** Overlay ids `decorate` added (the rail network layer). */
  decorationIds?(): readonly string[];
  /** Builds the column LOD tiers, if the world has any. */
  buildLod?(renderer: VoxelRenderer): LodTiers;
  /** Called once per frame with the camera to focus distance, for overlays that depend on zoom. */
  onZoom?(overlay: OverlayLayer, cameraDistanceM: number): void;
  /** Height of what is seen from above (ground or water surface) in world metres at a plan position, for placing things on the surface. */
  groundAt(x: number, z: number): number;
  /** One line for the boot log: what was loaded. */
  summary: string;
}
