/**
 * Mesher contract (work package D, doc 10 section 11) and the packed quad format (doc 03 section 5.3).
 *
 * PACKED QUAD: 8 bytes = two u32 words per quad, little-endian, stored consecutively in a Uint32Array.
 *
 *   word 0
 *     bits  0..5   x      chunk-local voxel x of the quad's minimum-corner voxel, 0..31 (6 bits reserved)
 *     bits  6..11  y      same for y
 *     bits 12..17  z      same for z
 *     bits 18..22  w - 1  extent along the face's u axis in voxels, 1..32 stored as 0..31
 *     bits 23..27  h - 1  extent along the face's v axis in voxels, 1..32 stored as 0..31
 *     bits 28..30  face   0 = +X, 1 = -X, 2 = +Y, 3 = -Y, 4 = +Z, 5 = -Z (outward normal)
 *     bit  31      reserved, 0
 *   word 1
 *     bits  0..9   material  material id, 0..1023 (materials.ts)
 *     bits 10..17  ao        ambient occlusion, 2 bits per corner, 3 = unoccluded, 0 = darkest.
 *                            Corner order: (u0,v0) bits 10..11, (u1,v0) 12..13, (u0,v1) 14..15, (u1,v1) 16..17
 *     bits 18..31  flags     reserved, 0 (light, wet, selection)
 *
 * Geometry: let d = face >> 1 be the normal axis (0 = x, 1 = y, 2 = z), u = (d + 1) % 3, v = (d + 2) % 3
 * (so X faces span u = y, v = z; Y faces span u = z, v = x; Z faces span u = x, v = y).
 * The quad lies in the plane p[d] = (x, y, z)[d] + (face is positive ? 1 : 0) and covers
 * [p[u], p[u] + w] x [p[v], p[v] + h] in chunk-local voxel units. Corners are integers in 0..32.
 * A mesher that does not compute AO writes ao = 0xff.
 */
import type { ChunkKey } from './chunk.ts';

export const FACE_POS_X = 0;
export const FACE_NEG_X = 1;
export const FACE_POS_Y = 2;
export const FACE_NEG_Y = 3;
export const FACE_POS_Z = 4;
export const FACE_NEG_Z = 5;
export const FACE_COUNT = 6;
/** Outward unit normals indexed by face id. */
export const FACE_NORMALS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
/** u32 words per quad. */
export const QUAD_WORDS = 2;
export const QUAD_BYTES = 8;
/** AO field value meaning "no occlusion at any corner". */
export const AO_NONE = 0xff;

export interface Quad {
  x: number;
  y: number;
  z: number;
  /** Extent along the u axis, 1..32. */
  w: number;
  /** Extent along the v axis, 1..32. */
  h: number;
  face: number;
  material: number;
  ao: number;
  flags: number;
}

/** First word of a packed quad. No range checks: hot path. */
export function packQuadWord0(x: number, y: number, z: number, w: number, h: number, face: number): number {
  return (x | (y << 6) | (z << 12) | ((w - 1) << 18) | ((h - 1) << 23) | (face << 28)) >>> 0;
}

/** Second word of a packed quad. No range checks: hot path. */
export function packQuadWord1(material: number, ao: number, flags = 0): number {
  return (material | (ao << 10) | (flags << 18)) >>> 0;
}

/** Decodes quad `i` (quad index, not word index) from a packed buffer. For tests and tools, not for hot loops. */
export function unpackQuad(quads: Uint32Array, i: number): Quad {
  if (!Number.isInteger(i) || i < 0 || i * QUAD_WORDS + 1 >= quads.length) {
    throw new RangeError(`unpackQuad: quad index ${i} out of range for ${quads.length / QUAD_WORDS} quads`);
  }
  const a = quads[i * QUAD_WORDS] as number;
  const b = quads[i * QUAD_WORDS + 1] as number;
  return {
    x: a & 63,
    y: (a >>> 6) & 63,
    z: (a >>> 12) & 63,
    w: ((a >>> 18) & 31) + 1,
    h: ((a >>> 23) & 31) + 1,
    face: (a >>> 28) & 7,
    material: b & 1023,
    ao: (b >>> 10) & 255,
    flags: b >>> 18,
  };
}

/**
 * Mesher input. `padded` holds PADDED_VOLUME material ids addressed by paddedIndex:
 * the chunk plus a 1-voxel border, as written by WorldStore.paddedCopy. `size` is CHUNK_SIZE (32).
 */
export interface MeshInput {
  key: ChunkKey;
  size: number;
  padded: Uint16Array;
}

/**
 * Mesher output.
 * - `quads`: packed quads, 2 words each, exact size (safe to transfer to the main thread).
 *   Opaque quads come first, grouped by face id; transparent quads (WATER) follow, in no face order.
 * - `faceOffsets`: 7 entries, in quads (not words). Opaque quads with face f occupy
 *   [faceOffsets[f], faceOffsets[f + 1]). faceOffsets[0] is 0 and faceOffsets[6] equals opaqueCount.
 * - `opaqueCount`: number of opaque quads. Transparent quads occupy [opaqueCount, quads.length / 2).
 * Face rule: an opaque voxel emits a face towards any non-opaque neighbour (AIR or transparent);
 * a transparent voxel emits a face only towards AIR ("same material = no face", and none against opaque).
 * An empty mesh has quads.length 0 and all offsets 0.
 */
export interface MeshOutput {
  key: ChunkKey;
  quads: Uint32Array;
  faceOffsets: Uint32Array;
  opaqueCount: number;
}

/**
 * Reusable per-worker scratch memory so meshing allocates nothing but its exact-size result.
 * - `quads`: staging buffer for packed quads, sized for the worst case of a 32^3 chunk
 *   (3D checkerboard: 16,384 voxels x 6 faces = 98,304 quads = 196,608 words).
 * - `work`: mesher-private buffer (bit masks, counters). Size and meaning belong to the mesher
 *   that created the scratch; never share one scratch between different mesher implementations.
 */
export interface MesherScratch {
  quads: Uint32Array;
  work: Uint32Array;
}

/** Worst-case quads for one 32^3 chunk. */
export const MAX_QUADS_PER_CHUNK = 98_304;

/** Signature every mesher exports as `meshChunk`. Pure: same input gives byte-identical output. */
export type MeshChunkFn = (input: MeshInput, scratch: MesherScratch) => MeshOutput;
