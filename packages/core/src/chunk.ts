/**
 * Voxel and chunk coordinates.
 *
 * World voxel frame (right-handed, three.js compatible):
 *   x = east, y = up, z = south. One voxel is VOXEL_SIZE_M metres (work-site tier W, doc 04 section 9.1).
 *   Voxel (x, y, z) covers [x, x+1) x [y, y+1) x [z, z+1) voxel units.
 * See frame.ts for how this maps to UTM 10N and lon/lat (z = -(northing - origin)).
 */

/** Chunk edge length in voxels (doc 03 section 5.1). */
export const CHUNK_SIZE = 32;
export const CHUNK_SHIFT = 5;
export const CHUNK_MASK = CHUNK_SIZE - 1;
/** Voxels per chunk: 32^3. */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;
/** Edge length of the padded mesher input: chunk plus a 1-voxel border on every side. */
export const PADDED_SIZE = CHUNK_SIZE + 2;
/** Voxels in a padded mesher input: 34^3. */
export const PADDED_VOLUME = PADDED_SIZE * PADDED_SIZE * PADDED_SIZE;
/** Edge length of one voxel in metres at the work-site tier. */
export const VOXEL_SIZE_M = 1;

/** Integer world voxel coordinate (int32 range). x east, y up, z south. */
export interface VoxelCoord {
  x: number;
  y: number;
  z: number;
}

/** Integer chunk coordinate: voxel coordinate floor-divided by CHUNK_SIZE. */
export interface ChunkCoord {
  cx: number;
  cy: number;
  cz: number;
}

/** Half-open voxel box: min inclusive, max exclusive. */
export interface Aabb {
  min: VoxelCoord;
  max: VoxelCoord;
}

/**
 * Packed chunk coordinate. A plain number (safe integer, 36 bits used), usable as a Map key
 * and transferable to workers. Layout, most significant first:
 *   (cx + 8192) : 14 bits | (cz + 8192) : 14 bits | (cy + 128) : 8 bits
 * Ranges: cx, cz in [-8192, 8191] (262 km at 1 m voxels), cy in [-128, 127] (-4096 m to +4095 m).
 * Keys sort by cx, then cz, then cy. Built with multiplication, not bit operators (more than 32 bits).
 */
export type ChunkKey = number;

export const CHUNK_XZ_MIN = -8192;
export const CHUNK_XZ_MAX = 8191;
export const CHUNK_Y_MIN = -128;
export const CHUNK_Y_MAX = 127;

const XZ_BIAS = 8192;
const XZ_RANGE = 16384;
const Y_BIAS = 128;
const Y_RANGE = 256;

export function packChunkKey(cx: number, cy: number, cz: number): ChunkKey {
  if (
    !Number.isInteger(cx) ||
    !Number.isInteger(cy) ||
    !Number.isInteger(cz) ||
    cx < CHUNK_XZ_MIN ||
    cx > CHUNK_XZ_MAX ||
    cz < CHUNK_XZ_MIN ||
    cz > CHUNK_XZ_MAX ||
    cy < CHUNK_Y_MIN ||
    cy > CHUNK_Y_MAX
  ) {
    throw new RangeError(`packChunkKey: chunk coordinate out of range: (${cx}, ${cy}, ${cz})`);
  }
  return ((cx + XZ_BIAS) * XZ_RANGE + (cz + XZ_BIAS)) * Y_RANGE + (cy + Y_BIAS);
}

export function unpackChunkKey(key: ChunkKey): ChunkCoord {
  if (!Number.isInteger(key) || key < 0 || key >= XZ_RANGE * XZ_RANGE * Y_RANGE) {
    throw new RangeError(`unpackChunkKey: not a chunk key: ${key}`);
  }
  const cy = (key % Y_RANGE) - Y_BIAS;
  const xz = Math.floor(key / Y_RANGE);
  const cz = (xz % XZ_RANGE) - XZ_BIAS;
  const cx = Math.floor(xz / XZ_RANGE) - XZ_BIAS;
  return { cx, cy, cz };
}

/** Chunk coordinate component containing a voxel coordinate component (floor division, correct for negatives). */
export function voxelToChunk(v: number): number {
  return v >> CHUNK_SHIFT;
}

/** Chunk-local component in [0, 31] of a voxel coordinate component (correct for negatives). */
export function voxelToLocal(v: number): number {
  return v & CHUNK_MASK;
}

/** Key of the chunk containing a voxel. */
export function chunkKeyOfVoxel(x: number, y: number, z: number): ChunkKey {
  return packChunkKey(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT, z >> CHUNK_SHIFT);
}

/** World voxel coordinate of a chunk's minimum corner. */
export function chunkOrigin(key: ChunkKey): VoxelCoord {
  const c = unpackChunkKey(key);
  return { x: c.cx * CHUNK_SIZE, y: c.cy * CHUNK_SIZE, z: c.cz * CHUNK_SIZE };
}

/**
 * Index of a chunk-local voxel in a dense CHUNK_VOLUME array.
 * Order is y-major, then z, then x: index = x + z * 32 + y * 1024.
 * ChunkData.indices and every dense chunk array in the repo use this order.
 */
export function localIndex(lx: number, ly: number, lz: number): number {
  return lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
}

/**
 * Index into a padded PADDED_VOLUME array (MeshInput.padded). Arguments are chunk-local
 * coordinates in [-1, 32]; -1 and 32 address the neighbour border.
 * index = (lx + 1) + (lz + 1) * 34 + (ly + 1) * 1156.
 */
export function paddedIndex(lx: number, ly: number, lz: number): number {
  return lx + 1 + (lz + 1) * PADDED_SIZE + (ly + 1) * PADDED_SIZE * PADDED_SIZE;
}
