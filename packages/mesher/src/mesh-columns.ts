/**
 * Column mesher for the LOD tiers that are column rasters, not 3D chunks (doc 04 section 9.1: far 64 m,
 * region 16 m, city 4 m). Emits the same packed quads as meshChunk so the renderer has one quad path;
 * the renderer scales a patch by (cell size, vertical step, cell size).
 *
 * A patch is 32 x 32 columns plus a 1-column border. Column (x, z) is solid for every integer y below
 * heights[(x + 1) + (z + 1) * 34] (vertical steps, any integer origin) and has one material, classes[...].
 * Emitted: the top face of every column and the side faces above each lower face-neighbour, greedily merged.
 * No bottom faces, no AO (AO_NONE).
 *
 * - Class AIR marks a hole (for example where true 3D chunks replace the columns): the column emits
 *   nothing and its neighbours emit no side towards it.
 * - Non-opaque classes (WATER) go to the transparent range after opaqueCount, like in MeshOutput.
 * - Border columns only occlude or expose sides. A border equal to the neighbouring interior height gives
 *   no side; a lower border gives a skirt down to it.
 *
 * Packed quads hold 6-bit coordinates, so the vertical axis is cut into slabs of 32 steps: slab s covers
 * y in [32 s, 32 s + 32) and its quads store y - 32 s.
 */
import {
  CHUNK_SIZE,
  FACE_COUNT,
  FACE_NEG_X,
  FACE_NEG_Y,
  FACE_NEG_Z,
  FACE_POS_X,
  FACE_POS_Y,
  FACE_POS_Z,
  type MesherScratch,
  type MeshOutput,
  PADDED_SIZE,
  QUAD_WORDS,
} from '@bayvox/core';
import { FLAT_KEY_BITS, greedyPlane } from './greedy.ts';
import {
  checkScratch,
  KIND_AIR,
  KIND_INVALID,
  KIND_OPAQUE,
  KIND_TRANSPARENT,
  MATERIAL_KIND,
  WORK_KEYS,
  WORK_ROWS,
  WORK_TOPS,
} from './scratch.ts';

/** Columns per patch edge. */
export const COLUMN_PATCH_SIZE = CHUNK_SIZE;
/** Entries in a padded column grid: 34 x 34. */
export const COLUMN_GRID_LENGTH = PADDED_SIZE * PADDED_SIZE;
/** Vertical steps per slab. */
export const COLUMN_SLAB_HEIGHT = CHUNK_SIZE;

export interface ColumnMeshInput {
  /** Caller-defined id, copied to every MeshOutput.key (for example a patch index). */
  key: number;
  /** Must be COLUMN_PATCH_SIZE (32). */
  size: number;
  /** COLUMN_GRID_LENGTH integer heights in vertical steps. Column is solid below its height. */
  heights: Int16Array | Int32Array;
  /** COLUMN_GRID_LENGTH material ids. Material.AIR is a hole. */
  classes: Uint16Array;
}

export interface ColumnSlabMesh {
  /** Slab index: the mesh's local y = 0 is vertical step slab * 32. */
  slab: number;
  mesh: MeshOutput;
}

/** Index into a padded column grid. x and z are patch-local in [-1, 32]. */
export function columnIndex(x: number, z: number): number {
  return x + 1 + (z + 1) * PADDED_SIZE;
}

const KIND = MATERIAL_KIND;
const ROWS = WORK_ROWS;
const KEYS = WORK_KEYS;
const TOPS = WORK_TOPS;
const P = PADDED_SIZE;
const merge = greedyPlane;
const FLAT = FLAT_KEY_BITS;
const AIR_KIND = KIND_AIR;
const INVALID = KIND_INVALID;
const GRID = PADDED_SIZE * PADDED_SIZE;
const SLAB = CHUNK_SIZE;
const TOP = FACE_POS_Y;
/** Grid index delta to the neighbour across faces +X, -X, (unused, unused), +Z, -Z. */
const SIDE_DELTA = [1, -1, 0, 0, P, -P];
const SIDE_FACES = [FACE_POS_X, FACE_NEG_X, FACE_POS_Z, FACE_NEG_Z];
/** Guard against sentinel heights (for example -32768 as "no data") exploding into thousands of slabs. */
export const COLUMN_MAX_SLABS = 256;

function validate(who: string, input: ColumnMeshInput): void {
  if (input.size !== COLUMN_PATCH_SIZE) throw new RangeError(`${who}: size must be ${COLUMN_PATCH_SIZE}, got ${input.size}`);
  if (input.heights.length !== GRID) {
    throw new RangeError(`${who}: heights must have ${GRID} entries, got ${input.heights.length}`);
  }
  if (input.classes.length !== GRID) {
    throw new RangeError(`${who}: classes must have ${GRID} entries, got ${input.classes.length}`);
  }
  const classes = input.classes;
  for (let i = 0; i < GRID; i++) {
    if (KIND[classes[i] as number] === INVALID) {
      throw new RangeError(`${who}: unknown material id ${classes[i]} at column (${(i % P) - 1}, ${Math.floor(i / P) - 1})`);
    }
  }
}

/**
 * Vertical extent of the patch's geometry as a half-open slab range [first, end), or undefined if the
 * patch emits nothing (all holes).
 */
export function columnSlabRange(input: ColumnMeshInput): { first: number; end: number } | undefined {
  validate('columnSlabRange', input);
  const { heights, classes } = input;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let z = 0; z < 32; z++) {
    for (let x = 0; x < 32; x++) {
      const i = x + 1 + (z + 1) * P;
      if (KIND[classes[i] as number] === AIR_KIND) continue;
      const h = heights[i] as number;
      // Lowest emitted cell: the top cell, or the bottom of the tallest exposed side.
      let low = h - 1;
      for (let s = 0; s < 4; s++) {
        const j = i + (SIDE_DELTA[SIDE_FACES[s] as number] as number);
        if (KIND[classes[j] as number] === AIR_KIND) continue;
        const hn = heights[j] as number;
        if (hn < low) low = hn;
      }
      if (low < minY) minY = low;
      if (h - 1 > maxY) maxY = h - 1;
    }
  }
  if (maxY === Number.NEGATIVE_INFINITY) return undefined;
  const first = Math.floor(minY / SLAB);
  const end = Math.floor(maxY / SLAB) + 1;
  if (end - first > COLUMN_MAX_SLABS) {
    throw new RangeError(`columnSlabRange: patch ${input.key} spans y ${minY}..${maxY}, more than ${COLUMN_MAX_SLABS} slabs`);
  }
  return { first, end };
}

/** Side faces of one kind and one face direction for one slab. X faces: plane row = y, bit = z. Z faces: row = y, bit = x. */
function meshSides(input: ColumnMeshInput, work: Uint32Array, out: Uint32Array, n: number, y0: number, kind: number, face: number): number {
  const { heights, classes } = input;
  const y1 = y0 + SLAB;
  const delta = SIDE_DELTA[face] as number;
  const alongX = face < 2;
  for (let layer = 0; layer < 32; layer++) {
    let any = 0;
    for (let b = 0; b < 32; b++) {
      const i = alongX ? layer + 1 + (b + 1) * P : b + 1 + (layer + 1) * P;
      const material = classes[i] as number;
      if (KIND[material] !== kind) continue;
      if (KIND[classes[i + delta] as number] === AIR_KIND) continue;
      const h = heights[i] as number;
      const hn = heights[i + delta] as number;
      const lo = Math.max(hn, y0);
      const hi = Math.min(h, y1);
      if (lo >= hi) continue;
      if (any === 0) {
        for (let r = 0; r < 32; r++) work[ROWS + r] = 0;
        any = 1;
      }
      const key = material | FLAT;
      const bit = 1 << b;
      for (let y = lo - y0; y < hi - y0; y++) {
        work[ROWS + y] = (work[ROWS + y] as number) | bit;
        work[KEYS + y * 32 + b] = key;
      }
    }
    if (any !== 0) n = merge(work, out, n, face, layer);
  }
  return n;
}

/** Top faces of one kind for one slab. Plane row = z, bit = x. */
function meshTops(input: ColumnMeshInput, work: Uint32Array, out: Uint32Array, n: number, y0: number, kind: number): number {
  const { heights, classes } = input;
  for (let i = 0; i < 1024; i++) work[TOPS + i] = 0;
  let layers = 0;
  for (let z = 0; z < 32; z++) {
    for (let x = 0; x < 32; x++) {
      const i = x + 1 + (z + 1) * P;
      const material = classes[i] as number;
      work[KEYS + z * 32 + x] = material | FLAT;
      if (KIND[material] !== kind) continue;
      const y = (heights[i] as number) - 1 - y0;
      if (y < 0 || y >= SLAB) continue;
      work[TOPS + y * 32 + z] = (work[TOPS + y * 32 + z] as number) | (1 << x);
      layers |= 1 << y;
    }
  }
  for (let y = 0; y < 32; y++) {
    if (((layers >>> y) & 1) === 0) continue;
    for (let z = 0; z < 32; z++) work[ROWS + z] = work[TOPS + y * 32 + z] as number;
    n = merge(work, out, n, TOP, y);
  }
  return n;
}

/** All quads of one kind for one slab, in face order. Fills faceOffsets[0..5] when given. */
function meshKind(
  input: ColumnMeshInput,
  work: Uint32Array,
  out: Uint32Array,
  n: number,
  y0: number,
  kind: number,
  faceOffsets: Uint32Array | undefined,
): number {
  for (let face = 0; face < FACE_COUNT; face++) {
    if (faceOffsets !== undefined) faceOffsets[face] = n;
    if (face === FACE_POS_Y) n = meshTops(input, work, out, n, y0, kind);
    else if (face !== FACE_NEG_Y) n = meshSides(input, work, out, n, y0, kind, face);
  }
  return n;
}

function meshSlab(input: ColumnMeshInput, slab: number, scratch: MesherScratch): MeshOutput {
  const out = scratch.quads;
  const work = scratch.work;
  const y0 = slab * SLAB;
  const faceOffsets = new Uint32Array(FACE_COUNT + 1);
  const opaqueCount = meshKind(input, work, out, 0, y0, KIND_OPAQUE, faceOffsets);
  faceOffsets[FACE_COUNT] = opaqueCount;
  const n = meshKind(input, work, out, opaqueCount, y0, KIND_TRANSPARENT, undefined);
  return { key: input.key, quads: out.slice(0, n * QUAD_WORDS), faceOffsets, opaqueCount };
}

/** Meshes the part of a column patch inside one slab. An empty slab gives an empty mesh. */
export function meshColumnSlab(input: ColumnMeshInput, slab: number, scratch: MesherScratch): MeshOutput {
  validate('meshColumnSlab', input);
  if (!Number.isInteger(slab)) throw new RangeError(`meshColumnSlab: slab must be an integer, got ${slab}`);
  checkScratch('meshColumnSlab', scratch);
  return meshSlab(input, slab, scratch);
}

/** Meshes a whole column patch: one mesh per slab that contains quads, in ascending slab order. */
export function meshColumnPatch(input: ColumnMeshInput, scratch: MesherScratch): ColumnSlabMesh[] {
  checkScratch('meshColumnPatch', scratch);
  const range = columnSlabRange(input);
  const result: ColumnSlabMesh[] = [];
  if (range === undefined) return result;
  for (let slab = range.first; slab < range.end; slab++) {
    const mesh = meshSlab(input, slab, scratch);
    if (mesh.quads.length > 0) result.push({ slab, mesh });
  }
  return result;
}
