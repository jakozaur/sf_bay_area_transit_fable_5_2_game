/**
 * Greedy merge of one 32 x 32 face plane into packed quads.
 *
 * A plane is 32 row masks (work[WORK_ROWS + row], bit b set = cell (row, b) has a face) plus one merge
 * key per set cell (work[WORK_KEYS + row * 32 + b]). The key is word 1 of the packed quad (material and
 * AO).
 *
 * Plane axes per face axis (d = face >> 1), chosen so no bit-matrix work is needed per plane:
 *   d = 0 (X faces): layer = x, row = y (quad u axis), bit = z (quad v axis)
 *   d = 1 (Y faces): layer = y, row = z (quad u axis), bit = x (quad v axis)
 *   d = 2 (Z faces): layer = z, row = y (quad v axis), bit = x (quad u axis)
 *
 * Cells merge only when their keys are identical, which is also sufficient for exact AO: two exposed
 * faces that are neighbours in a plane get the same AO level at the two corners they share (both levels
 * are computed from the same two front-layer voxels, the third one being the non-opaque voxel in front of the other
 * face). So equal keys in neighbouring cells mean the AO is constant along the merge direction, and
 * every cell of a merged quad has exactly the quad's AO at its own corners.
 */
import { AO_NONE } from '@bayvox/core';
import { WORK_KEYS, WORK_ROWS } from './scratch.ts';

/** OR this into a material id to get the key of a cell with no ambient occlusion. */
export const FLAT_KEY_BITS = AO_NONE << 10;

// Module-level aliases: Vitest's module runner turns cross-module export reads into getter calls.
const ROWS = WORK_ROWS;
const KEYS = WORK_KEYS;
const clz32 = Math.clz32;

/**
 * Merges the plane in `work` and appends its quads to `out` starting at quad index `n`.
 * Consumes the row masks. Returns the new quad count.
 */
export function greedyPlane(work: Uint32Array, out: Uint32Array, n: number, face: number, layer: number): number {
  const d = face >> 1;
  // Bit positions of the layer, row and bit coordinates inside word 0 (x at 0, y at 6, z at 12).
  const layerShift = d === 0 ? 0 : d === 1 ? 6 : 12;
  const rowShift = d === 0 ? 6 : d === 1 ? 12 : 6;
  const bitShift = d === 0 ? 12 : 0;
  // Extent fields: w (bits 18..22) runs along u, h (bits 23..27) along v.
  const rowExtentShift = d === 2 ? 23 : 18;
  const bitExtentShift = d === 2 ? 18 : 23;
  const fixed = (layer << layerShift) | (face << 28);

  for (let r = 0; r < 32; r++) {
    let m = work[ROWS + r] | 0;
    const kr = KEYS + r * 32;
    while (m !== 0) {
      const b0 = 31 - clz32(m & -m);
      const key = work[kr + b0] as number;
      let b1 = b0 + 1;
      while (b1 < 32 && ((m >>> b1) & 1) !== 0 && work[kr + b1] === key) b1++;
      const runMask = (0xffffffff >>> (32 - (b1 - b0))) << b0;
      m &= ~runMask;
      let r1 = r + 1;
      grow: while (r1 < 32) {
        const next = work[ROWS + r1] | 0;
        if ((next & runMask) !== runMask) break;
        const kn = KEYS + r1 * 32;
        for (let b = b0; b < b1; b++) {
          if (work[kn + b] !== key) break grow;
        }
        work[ROWS + r1] = next & ~runMask;
        r1++;
      }
      out[n * 2] = fixed | (r << rowShift) | (b0 << bitShift) | ((r1 - r - 1) << rowExtentShift) | ((b1 - b0 - 1) << bitExtentShift);
      out[n * 2 + 1] = key;
      n++;
    }
  }
  return n;
}
