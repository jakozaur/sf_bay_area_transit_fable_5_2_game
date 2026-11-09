/**
 * Scratch memory and tables shared by the chunk mesher and the column mesher.
 *
 * `work` layout (u32 words). "Row masks" are 32-bit occupancy masks of the 32 interior voxels of one line.
 *   XO  1156  opaque row masks along x, indexed (y + 1) * 34 + (z + 1), y and z in -1..32
 *   XT  1156  transparent row masks along x, same index
 *   XB  1156  border bits of the same lines: bit 0 opaque at x = -1, bit 1 opaque at x = 32,
 *             bit 2 transparent at x = -1, bit 3 transparent at x = 32
 *   ZO  1088  opaque row masks along z, indexed y * 34 + (x + 1), y in 0..31, x in -1..32
 *   ZT  1088  transparent row masks along z, same index
 *   ROWS  32  face mask of the plane being merged (consumed by the greedy merge)
 *   KEYS 1024 merge key per plane cell, indexed row * 32 + bit (see greedy.ts)
 *   TMP   32  bit-matrix transpose buffer
 *   TOPS 1024 column mesher: top-face masks, indexed layer * 32 + z
 */
import { CHUNK_SIZE, MATERIAL_OPAQUE, Material, type MesherScratch, PADDED_SIZE, QUAD_WORDS } from '@bayvox/core';

export const WORK_XO = 0;
export const WORK_XT = WORK_XO + PADDED_SIZE * PADDED_SIZE;
export const WORK_XB = WORK_XT + PADDED_SIZE * PADDED_SIZE;
export const WORK_ZO = WORK_XB + PADDED_SIZE * PADDED_SIZE;
export const WORK_ZT = WORK_ZO + CHUNK_SIZE * PADDED_SIZE;
export const WORK_ROWS = WORK_ZT + CHUNK_SIZE * PADDED_SIZE;
export const WORK_KEYS = WORK_ROWS + CHUNK_SIZE;
export const WORK_TMP = WORK_KEYS + CHUNK_SIZE * CHUNK_SIZE;
export const WORK_TOPS = WORK_TMP + CHUNK_SIZE;
export const WORK_WORDS = WORK_TOPS + CHUNK_SIZE * CHUNK_SIZE;

/**
 * Upper bound on quads this mesher can emit for one 32^3 chunk: one per pair of face-adjacent voxels
 * with at least one voxel inside the chunk (3 * 32 * 32 * 33). Reached by an opaque/water 3D checkerboard
 * surrounded by air. This is larger than core's MAX_QUADS_PER_CHUNK (98,304), which only counts the
 * single-material checkerboard.
 */
export const MAX_MESHER_QUADS = 3 * CHUNK_SIZE * CHUNK_SIZE * (CHUNK_SIZE + 1);

/** Scratch for meshChunk and the column mesher. One per worker; never share with another mesher implementation. */
export function createMesherScratch(): MesherScratch {
  return { quads: new Uint32Array(MAX_MESHER_QUADS * QUAD_WORDS), work: new Uint32Array(WORK_WORDS) };
}

export function checkScratch(who: string, scratch: MesherScratch): void {
  if (scratch.quads.length < MAX_MESHER_QUADS * QUAD_WORDS || scratch.work.length < WORK_WORDS) {
    throw new RangeError(
      `${who}: scratch too small (quads ${scratch.quads.length} words, work ${scratch.work.length} words); use createMesherScratch()`,
    );
  }
}

export const KIND_AIR = 0;
export const KIND_OPAQUE = 1;
export const KIND_TRANSPARENT = 2;
export const KIND_INVALID = 4;

/** Material kind for every possible u16 voxel value, so hot loops need no bounds or undefined checks. */
export const MATERIAL_KIND: Uint8Array = (() => {
  const kind = new Uint8Array(65536).fill(KIND_INVALID);
  for (let id = 0; id < MATERIAL_OPAQUE.length; id++) kind[id] = MATERIAL_OPAQUE[id] === 1 ? KIND_OPAQUE : KIND_TRANSPARENT;
  kind[Material.AIR] = KIND_AIR;
  return kind;
})();
