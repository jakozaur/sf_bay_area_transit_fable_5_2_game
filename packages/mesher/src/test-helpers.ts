/** Test-only helpers: brute-force references and input builders. Not exported from the package. */
import {
  CHUNK_SIZE,
  createRng,
  FACE_NORMALS,
  MATERIAL_OPAQUE,
  Material,
  type MeshInput,
  type MeshOutput,
  nextFloat,
  nextInt,
  PADDED_SIZE,
  PADDED_VOLUME,
  paddedIndex,
  unpackQuad,
} from '@bayvox/core';

// Module-level aliases keep the export getters of Vitest's module runner out of the loops.
const N = CHUNK_SIZE;
const AIR = Material.AIR;
const OPAQUE = MATERIAL_OPAQUE;
const unpack = unpackQuad;
const P = PADDED_SIZE;
const PP = PADDED_SIZE * PADDED_SIZE;
/** Padded index stride per axis (x, y, z). */
const STRIDE = [1, PP, P];
function pidx(x: number, y: number, z: number): number {
  return x + 1 + (z + 1) * P + (y + 1) * PP;
}
function opaqueAt(padded: Uint16Array, i: number): number {
  const o = OPAQUE[padded[i] as number];
  if (o === undefined) throw new RangeError(`unknown material id ${padded[i]}`);
  return o;
}
export const FACE_CELLS = 6 * N * N * N;

export function faceCellIndex(face: number, x: number, y: number, z: number): number {
  return ((face * N + y) * N + z) * N + x;
}

/**
 * Rasterizes quads [from, to) into unit face cells: result[faceCellIndex] = material + 1, 0 = no face.
 * Throws if a quad leaves the chunk or two quads overlap.
 */
export function rasterize(mesh: MeshOutput, from: number, to: number): Uint16Array {
  const cells = new Uint16Array(FACE_CELLS);
  for (let i = from; i < to; i++) {
    const q = unpack(mesh.quads, i);
    if (q.face > 5) throw new Error(`quad ${i}: bad face ${q.face}`);
    if (q.flags !== 0) throw new Error(`quad ${i}: flags must be 0, got ${q.flags}`);
    const d = q.face >> 1;
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const min = [q.x, q.y, q.z];
    if ((min[u] as number) + q.w > N || (min[v] as number) + q.h > N || (min[d] as number) >= N) {
      throw new Error(`quad ${i} crosses the chunk bound: ${JSON.stringify(q)}`);
    }
    // faceCellIndex strides per axis (x, y, z).
    const cellStride = [1, N * N, N];
    const c0 = faceCellIndex(q.face, q.x, q.y, q.z);
    for (let dv = 0; dv < q.h; dv++) {
      for (let du = 0; du < q.w; du++) {
        const c = c0 + du * (cellStride[u] as number) + dv * (cellStride[v] as number);
        if (cells[c] !== 0) throw new Error(`quad ${i} overlaps another quad: ${JSON.stringify(q)} at offset (${du}, ${dv})`);
        cells[c] = q.material + 1;
      }
    }
  }
  return cells;
}

/** Brute-force face cells straight from the face rule in core mesh.ts. */
export function referenceCells(padded: Uint16Array): { opaque: Uint16Array; transparent: Uint16Array; faces: number } {
  const opaque = new Uint16Array(FACE_CELLS);
  const transparent = new Uint16Array(FACE_CELLS);
  let faces = 0;
  const delta = FACE_NORMALS.map(([nx, ny, nz]) => nx + ny * PP + nz * P);
  for (let y = 0; y < N; y++) {
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = pidx(x, y, z);
        const m = padded[i] as number;
        if (m === AIR) continue;
        const selfOpaque = opaqueAt(padded, i) === 1;
        for (let face = 0; face < 6; face++) {
          const j = i + (delta[face] as number);
          if (selfOpaque) {
            if (opaqueAt(padded, j) === 1) continue;
            opaque[faceCellIndex(face, x, y, z)] = m + 1;
          } else {
            if (padded[j] !== AIR) continue;
            transparent[faceCellIndex(face, x, y, z)] = m + 1;
          }
          faces++;
        }
      }
    }
  }
  return { opaque, transparent, faces };
}

/** Brute-force AO byte of the face of voxel (x, y, z), corner order as in core mesh.ts. */
export function referenceAo(padded: Uint16Array, face: number, x: number, y: number, z: number): number {
  const d = face >> 1;
  const su = STRIDE[(d + 1) % 3] as number;
  const sv = STRIDE[(d + 2) % 3] as number;
  const front = pidx(x, y, z) + ((face & 1) === 0 ? 1 : -1) * (STRIDE[d] as number);
  const solid = (du: number, dv: number): number => opaqueAt(padded, front + du * su + dv * sv);
  let ao = 0;
  let shift = 0;
  for (const sv of [-1, 1]) {
    for (const su of [-1, 1]) {
      const side1 = solid(su, 0);
      const side2 = solid(0, sv);
      const corner = solid(su, sv);
      const level = side1 === 1 && side2 === 1 ? 0 : 3 - side1 - side2 - corner;
      ao |= level << shift;
      shift += 2;
    }
  }
  return ao;
}

export function inputOf(padded: Uint16Array, key = 7): MeshInput {
  return { key, size: CHUNK_SIZE, padded };
}

/** Padded volume filled by f(x, y, z) for chunk-local coordinates in [-1, 32]. */
export function paddedFrom(f: (x: number, y: number, z: number) => number): Uint16Array {
  const padded = new Uint16Array(PADDED_VOLUME);
  for (let y = -1; y <= N; y++) {
    for (let z = -1; z <= N; z++) {
      for (let x = -1; x <= N; x++) padded[paddedIndex(x, y, z)] = f(x, y, z);
    }
  }
  return padded;
}

/** Random voxels over the whole padded volume (borders included). `fill` is the non-air probability. */
export function randomPadded(seed: number, fill: number, materials: readonly number[]): Uint16Array {
  const rng = createRng(seed);
  return paddedFrom(() => (nextFloat(rng) < fill ? (materials[nextInt(rng, materials.length)] as number) : Material.AIR));
}

export function quadCount(mesh: MeshOutput): number {
  return mesh.quads.length / 2;
}

/** Fast typed-array equality with a diagnostic naming the first differing face cell. */
export function expectSameCells(actual: Uint16Array, expected: Uint16Array, label: string): void {
  if (actual.length !== expected.length) throw new Error(`${label}: length ${actual.length} != ${expected.length}`);
  for (let c = 0; c < actual.length; c++) {
    if (actual[c] !== expected[c]) {
      const x = c % N;
      const z = Math.floor(c / N) % N;
      const y = Math.floor(c / (N * N)) % N;
      const face = Math.floor(c / (N * N * N));
      throw new Error(
        `${label}: face ${face} of voxel (${x}, ${y}, ${z}): got ${actual[c]}, expected ${expected[c]} (material + 1, 0 = none)`,
      );
    }
  }
}
