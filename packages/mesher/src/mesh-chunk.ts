/**
 * Binary greedy chunk mesher (doc 03 sections 5.2 to 5.4), output in the frozen MeshOutput format.
 *
 * 1. One scan of the 34^3 padded input builds 32-bit occupancy row masks along x for every (y, z) line,
 *    for opaque and for transparent voxels, plus the two border bits of each line.
 * 2. Row masks along z are derived per y layer with a 32 x 32 bit-matrix transpose.
 * 3. Per face direction and layer, the face plane is `mask & ~neighbourMask` (32 ANDs), then cells get a
 *    merge key (material plus baked AO) and the plane is merged greedily (greedy.ts).
 *
 * Face rule (core mesh.ts): opaque voxels face any non-opaque neighbour; transparent voxels face AIR only.
 * AO: 2 bits per corner from the three opaque neighbours touching that corner in the layer in front of
 * the face (0fps scheme: both sides solid = 0, else 3 - count). Transparent quads carry AO_NONE.
 */
import {
  CHUNK_SIZE,
  FACE_COUNT,
  type MesherScratch,
  type MeshInput,
  type MeshOutput,
  PADDED_SIZE,
  PADDED_VOLUME,
  QUAD_WORDS,
} from '@bayvox/core';
import { FLAT_KEY_BITS, greedyPlane } from './greedy.ts';
import {
  checkScratch,
  KIND_INVALID,
  MATERIAL_KIND,
  WORK_KEYS,
  WORK_ROWS,
  WORK_TMP,
  WORK_XB,
  WORK_XO,
  WORK_XT,
  WORK_ZO,
  WORK_ZT,
} from './scratch.ts';

// Module-level aliases: Vitest's module runner turns cross-module export reads into getter calls.
const KIND = MATERIAL_KIND;
const XO = WORK_XO;
const XT = WORK_XT;
const XB = WORK_XB;
const ZO = WORK_ZO;
const ZT = WORK_ZT;
const ROWS = WORK_ROWS;
const KEYS = WORK_KEYS;
const TMP = WORK_TMP;
const P = PADDED_SIZE;
const PP = PADDED_SIZE * PADDED_SIZE;
const LINES = PADDED_SIZE * PADDED_SIZE;
const INTERIOR0 = 1 + P + PP;
const merge = greedyPlane;
const FLAT = FLAT_KEY_BITS;
const INVALID = KIND_INVALID;
const clz32 = Math.clz32;

/** In-place transpose of the 32 x 32 bit matrix at work[off..off + 32): afterwards bit b of row r is the old bit r of row b. */
function transpose32(work: Uint32Array, off: number): void {
  let m = 0x0000ffff;
  for (let j = 16; j !== 0; j >>= 1, m ^= m << j) {
    for (let k = 0; k < 32; k = (k + j + 1) & ~j) {
      const a = work[off + k] as number;
      const b = work[off + k + j] as number;
      const t = ((a >>> j) ^ b) & m;
      work[off + k + j] = b ^ t;
      work[off + k] = a ^ (t << j);
    }
  }
}

function throwBadMaterial(padded: Uint16Array): never {
  for (let i = 0; i < padded.length; i++) {
    if (KIND[padded[i] as number] === INVALID) {
      const x = (i % P) - 1;
      const z = (Math.floor(i / P) % P) - 1;
      const y = Math.floor(i / PP) - 1;
      throw new RangeError(`meshChunk: unknown material id ${padded[i]} at chunk-local (${x}, ${y}, ${z})`);
    }
  }
  throw new Error('meshChunk: material validation failed but no offending voxel was found');
}

/**
 * Builds the row masks. Returns bit 0 = any opaque voxel inside the chunk, bit 1 = any transparent voxel
 * inside the chunk, bit 2 = any transparent voxel anywhere in the padded volume.
 */
function buildMasks(padded: Uint16Array, work: Uint32Array): number {
  let bad = 0;
  let anyT = 0;
  let i = 0;
  for (let line = 0; line < LINES; line++, i += P) {
    const k0 = KIND[padded[i] as number] as number;
    const k1 = KIND[padded[i + 33] as number] as number;
    let o = 0;
    let t = 0;
    for (let x = 0; x < 32; x++) {
      const k = KIND[padded[i + 1 + x] as number] as number;
      o |= (k & 1) << x;
      t |= ((k >>> 1) & 1) << x;
      bad |= k;
    }
    bad |= k0 | k1;
    work[XO + line] = o;
    work[XT + line] = t;
    const border = (k0 & 1) | ((k1 & 1) << 1) | ((k0 & 2) << 1) | ((k1 & 2) << 2);
    work[XB + line] = border;
    anyT |= t | (border >>> 2);
  }
  if ((bad & INVALID) !== 0) throwBadMaterial(padded);

  let innerO = 0;
  let innerT = 0;
  for (let y = 0; y < 32; y++) {
    const lineBase = (y + 1) * P + 1;
    const zBase = y * P;
    let lo = 0;
    let hi = 0;
    for (let z = 0; z < 32; z++) {
      const o = work[XO + lineBase + z] as number;
      work[TMP + z] = o;
      innerO |= o;
      const border = work[XB + lineBase + z] as number;
      lo |= (border & 1) << z;
      hi |= ((border >>> 1) & 1) << z;
    }
    transpose32(work, TMP);
    work[ZO + zBase] = lo;
    work[ZO + zBase + 33] = hi;
    for (let x = 0; x < 32; x++) work[ZO + zBase + 1 + x] = work[TMP + x] as number;
    if (anyT === 0) continue;
    lo = 0;
    hi = 0;
    for (let z = 0; z < 32; z++) {
      const t = work[XT + lineBase + z] as number;
      work[TMP + z] = t;
      innerT |= t;
      const border = work[XB + lineBase + z] as number;
      lo |= ((border >>> 2) & 1) << z;
      hi |= ((border >>> 3) & 1) << z;
    }
    transpose32(work, TMP);
    work[ZT + zBase] = lo;
    work[ZT + zBase + 33] = hi;
    for (let x = 0; x < 32; x++) work[ZT + zBase + 1 + x] = work[TMP + x] as number;
  }
  return (innerO !== 0 ? 1 : 0) | (innerT !== 0 ? 2 : 0) | (anyT !== 0 ? 4 : 0);
}

/**
 * Loads the face plane of `face` at `layer` into work[ROWS..]. Returns 0 if the plane is empty.
 * Opaque pass: mask & ~opaqueNeighbour. Transparent pass: mask & ~(opaque | transparent)Neighbour.
 */
function loadPlane(work: Uint32Array, face: number, layer: number, transparent: boolean): number {
  let any = 0;
  if (face < 2) {
    // X faces: row = y, bits over z, from the z row masks of columns x and x +/- 1.
    const self = layer + 1;
    const other = face === 0 ? layer + 2 : layer;
    for (let y = 0; y < 32; y++) {
      const base = y * P;
      const m = transparent
        ? (work[ZT + base + self] as number) & ~((work[ZO + base + other] as number) | (work[ZT + base + other] as number))
        : (work[ZO + base + self] as number) & ~(work[ZO + base + other] as number);
      work[ROWS + y] = m;
      any |= m;
    }
  } else if (face < 4) {
    // Y faces: row = z, bits over x, from the x row masks of layers y and y +/- 1.
    const self = (layer + 1) * P + 1;
    const other = (face === 2 ? layer + 2 : layer) * P + 1;
    for (let z = 0; z < 32; z++) {
      const m = transparent
        ? (work[XT + self + z] as number) & ~((work[XO + other + z] as number) | (work[XT + other + z] as number))
        : (work[XO + self + z] as number) & ~(work[XO + other + z] as number);
      work[ROWS + z] = m;
      any |= m;
    }
  } else {
    // Z faces: row = y, bits over x, from the x row masks of lines z and z +/- 1.
    const self = layer + 1;
    const other = face === 4 ? layer + 2 : layer;
    for (let y = 0; y < 32; y++) {
      const base = (y + 1) * P;
      const m = transparent
        ? (work[XT + base + self] as number) & ~((work[XO + base + other] as number) | (work[XT + base + other] as number))
        : (work[XO + base + self] as number) & ~(work[XO + base + other] as number);
      work[ROWS + y] = m;
      any |= m;
    }
  }
  return any;
}

/** Writes the merge key of every set cell of the plane in work[ROWS..]. */
function fillKeys(padded: Uint16Array, work: Uint32Array, face: number, layer: number, ao: boolean): void {
  const d = face >> 1;
  const layerStride = d === 0 ? 1 : d === 1 ? PP : P;
  const rowStride = d === 1 ? P : PP;
  const bitStride = d === 0 ? P : 1;
  // Quad axes: u = (d + 1) % 3, v = (d + 2) % 3. For Z faces the bit axis (x) is u, otherwise it is v.
  const bitIsU = d === 2;
  const su = bitIsU ? bitStride : rowStride;
  const sv = bitIsU ? rowStride : bitStride;
  const front = (face & 1) === 0 ? layerStride : -layerStride;
  const base = INTERIOR0 + layer * layerStride;

  for (let r = 0; r < 32; r++) {
    let m = work[ROWS + r] | 0;
    const rowBase = base + r * rowStride;
    const kr = KEYS + r * 32;
    while (m !== 0) {
      const b = 31 - clz32(m & -m);
      m &= m - 1;
      const i = rowBase + b * bitStride;
      const material = padded[i] as number;
      if (!ao) {
        work[kr + b] = material | FLAT;
        continue;
      }
      const j = i + front;
      const um = (KIND[padded[j - su] as number] as number) & 1;
      const up = (KIND[padded[j + su] as number] as number) & 1;
      const vm = (KIND[padded[j - sv] as number] as number) & 1;
      const vp = (KIND[padded[j + sv] as number] as number) & 1;
      const mm = (KIND[padded[j - su - sv] as number] as number) & 1;
      const pm = (KIND[padded[j + su - sv] as number] as number) & 1;
      const mp = (KIND[padded[j - su + sv] as number] as number) & 1;
      const pp = (KIND[padded[j + su + sv] as number] as number) & 1;
      if ((um | up | vm | vp | mm | pm | mp | pp) === 0) {
        work[kr + b] = material | FLAT;
        continue;
      }
      const c00 = (um & vm) !== 0 ? 0 : 3 - um - vm - mm;
      const c10 = (up & vm) !== 0 ? 0 : 3 - up - vm - pm;
      const c01 = (um & vp) !== 0 ? 0 : 3 - um - vp - mp;
      const c11 = (up & vp) !== 0 ? 0 : 3 - up - vp - pp;
      work[kr + b] = material | ((c00 | (c10 << 2) | (c01 << 4) | (c11 << 6)) << 10);
    }
  }
}

function meshChunkImpl(input: MeshInput, scratch: MesherScratch, ao: boolean): MeshOutput {
  if (input.size !== CHUNK_SIZE) throw new RangeError(`meshChunk: size must be ${CHUNK_SIZE}, got ${input.size}`);
  if (input.padded.length !== PADDED_VOLUME) {
    throw new RangeError(`meshChunk: padded must have ${PADDED_VOLUME} entries, got ${input.padded.length}`);
  }
  checkScratch('meshChunk', scratch);
  const padded = input.padded;
  const work = scratch.work;
  const out = scratch.quads;
  const faceOffsets = new Uint32Array(FACE_COUNT + 1);
  const content = buildMasks(padded, work);
  let n = 0;

  if ((content & 1) !== 0) {
    for (let face = 0; face < FACE_COUNT; face++) {
      faceOffsets[face] = n;
      for (let layer = 0; layer < 32; layer++) {
        if (loadPlane(work, face, layer, false) === 0) continue;
        fillKeys(padded, work, face, layer, ao);
        n = merge(work, out, n, face, layer);
      }
    }
  }
  faceOffsets[FACE_COUNT] = n;
  const opaqueCount = n;

  if ((content & 2) !== 0) {
    for (let face = 0; face < FACE_COUNT; face++) {
      for (let layer = 0; layer < 32; layer++) {
        if (loadPlane(work, face, layer, true) === 0) continue;
        fillKeys(padded, work, face, layer, false);
        n = merge(work, out, n, face, layer);
      }
    }
  }
  return { key: input.key, quads: out.slice(0, n * QUAD_WORDS), faceOffsets, opaqueCount };
}

/** Binary greedy mesher with baked per-corner ambient occlusion. Conforms to core's MeshChunkFn. */
export function meshChunk(input: MeshInput, scratch: MesherScratch): MeshOutput {
  return meshChunkImpl(input, scratch, true);
}

/** Same mesher without AO: every quad carries AO_NONE and merging is limited by material only. */
export function meshChunkFlat(input: MeshInput, scratch: MesherScratch): MeshOutput {
  return meshChunkImpl(input, scratch, false);
}
