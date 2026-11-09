/** World store contract (work package C, doc 10 section 11). Implemented by packages/world; packages/testkit has a naive fake. */
import type { Aabb, ChunkKey, VoxelCoord } from './chunk.ts';

/**
 * One 32^3 chunk, palette compressed.
 * - `palette`: material ids used in the chunk. palette[0] is the material of a uniform chunk.
 * - `indices`: CHUNK_VOLUME palette indices in localIndex order (x + z * 32 + y * 1024),
 *   Uint8Array when the palette has at most 256 entries, else Uint16Array.
 *   null means the chunk is uniform: every voxel is palette[0].
 * A chunk the store has never materialized is all AIR and may be reported as undefined by getChunk.
 */
export interface ChunkData {
  key: ChunkKey;
  palette: Uint16Array;
  indices: Uint8Array | Uint16Array | null;
}

export interface WorldStore {
  /** Material id at a world voxel. Unloaded or never-written space reads as the store's implicit material (AIR in fakes). */
  getVoxel(c: VoxelCoord): number;
  /**
   * Applies an edit synchronously. Returns the keys of every chunk whose mesh may have changed:
   * chunks with changed voxels plus neighbours (face, edge and corner) whose 1-voxel border changed.
   * Sorted ascending, no duplicates. Empty if the edit changed nothing. Also delivered to onDirty listeners.
   */
  applyEdit(e: WorldEdit): ChunkKey[];
  getChunk(key: ChunkKey): ChunkData | undefined;
  /**
   * Writes the chunk plus a 1-voxel border from its 26 neighbours into `out` as material ids,
   * addressed by paddedIndex. `out.length` must be PADDED_VOLUME (34^3 = 39,304); anything else throws.
   */
  paddedCopy(key: ChunkKey, out: Uint16Array): void;
  /** Subscribes to dirty chunk notifications. Returns an unsubscribe function. */
  onDirty(cb: (keys: ChunkKey[]) => void): () => void;
  /** Resolves once every chunk intersecting the box is readable. Rejects naming the region that failed to load. */
  ensureLoaded(aabb: Aabb): Promise<void>;
}

/**
 * World mutations. All coordinates are world voxels.
 * - fillBox: sets every voxel in the half-open box [min, max) to `material`.
 * - carveCapsule: sets to AIR every voxel whose centre (coord + 0.5) is within `radius` voxels
 *   of the segment between the centres of voxels `a` and `b`. `radius` may be fractional.
 * - setVoxels: `coords` holds x, y, z triples; `materials` has one id per triple.
 */
export type WorldEdit =
  | { t: 'fillBox'; min: VoxelCoord; max: VoxelCoord; material: number }
  | { t: 'carveCapsule'; a: VoxelCoord; b: VoxelCoord; radius: number }
  | { t: 'setVoxels'; coords: Int32Array; materials: Uint16Array };
