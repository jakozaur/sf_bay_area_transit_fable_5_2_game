/** What the app shell needs from a world, whatever produces it (see seam.ts). */
import type { CameraBookmark, VoxelCoord, WorldPos, WorldStore } from '@bayvox/core';
import type { OverlayLayer, VoxelRenderer } from '@bayvox/render';

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

export interface GameWorld {
  store: WorldStore;
  /** Voxel bounds, half-open: limits streaming and the cut slider. */
  min: VoxelCoord;
  max: VoxelCoord;
  /** World-metre box the camera focus may roam in. Default: the voxel bounds. */
  focusMin?: WorldPos;
  focusMax?: WorldPos;
  seaLevel: number;
  /** Saved camera poses; index 0 is the start view. At least one. */
  bookmarks: CameraBookmark[];
  /** Adds the world's vector layer (rail lines, places) to the renderer. */
  decorate(overlay: OverlayLayer): void;
  /** Builds the column LOD tiers, if the world has any. */
  buildLod?(renderer: VoxelRenderer): LodTiers;
  /** Called once per frame with the camera to focus distance, for overlays that depend on zoom. */
  onZoom?(overlay: OverlayLayer, cameraDistanceM: number): void;
  /** Ground height in world metres at a plan position, for placing things on the surface. */
  groundAt(x: number, z: number): number;
  /** One line for the boot log: what was loaded. */
  summary: string;
}
