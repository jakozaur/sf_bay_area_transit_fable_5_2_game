/**
 * Naive face-culling mesher: one 1 x 1 quad per visible voxel face, no merging, no AO.
 * Emits the frozen MeshOutput format (see @bayvox/core mesh.ts), so it is a drop-in stand-in
 * and a correctness reference for the binary greedy mesher in packages/mesher:
 * a correct greedy mesh covers exactly the same face area per (face, material).
 */
import {
  AO_NONE,
  CHUNK_SIZE,
  FACE_COUNT,
  FACE_NORMALS,
  MATERIAL_OPAQUE,
  MAX_QUADS_PER_CHUNK,
  Material,
  type MesherScratch,
  type MeshInput,
  type MeshOutput,
  PADDED_SIZE,
  PADDED_VOLUME,
  packQuadWord0,
  packQuadWord1,
  QUAD_WORDS,
} from '@bayvox/core';

/** Scratch for naiveMeshChunk. `work` is unused by this mesher. */
export function createNaiveScratch(): MesherScratch {
  return { quads: new Uint32Array(MAX_QUADS_PER_CHUNK * QUAD_WORDS), work: new Uint32Array(0) };
}

// Module-level aliases: under Vitest's module runner every cross-module export access goes through a getter,
// which dominates hot loops. Local consts avoid that and cost nothing in the bundled app.
const N = CHUNK_SIZE;
const AIR = Material.AIR;
const OPAQUE = MATERIAL_OPAQUE;
const pack0 = packQuadWord0;
const pack1 = packQuadWord1;
const NO_AO = AO_NONE;

const STRIDE_X = 1;
const STRIDE_Z = PADDED_SIZE;
const STRIDE_Y = PADDED_SIZE * PADDED_SIZE;
/** Padded-array index delta to the neighbour across each face. */
const FACE_DELTA = FACE_NORMALS.map(([nx, ny, nz]) => nx * STRIDE_X + ny * STRIDE_Y + nz * STRIDE_Z);

function opaque(material: number): boolean {
  const o = OPAQUE[material];
  if (o === undefined) throw new RangeError(`naiveMeshChunk: unknown material id ${material}`);
  return o === 1;
}

export function naiveMeshChunk(input: MeshInput, scratch: MesherScratch): MeshOutput {
  if (input.size !== CHUNK_SIZE) throw new RangeError(`naiveMeshChunk: size must be ${CHUNK_SIZE}, got ${input.size}`);
  if (input.padded.length !== PADDED_VOLUME) {
    throw new RangeError(`naiveMeshChunk: padded must have ${PADDED_VOLUME} entries, got ${input.padded.length}`);
  }
  if (scratch.quads.length < MAX_QUADS_PER_CHUNK * QUAD_WORDS) {
    throw new RangeError(`naiveMeshChunk: scratch.quads too small: ${scratch.quads.length} words`);
  }
  const padded = input.padded;
  const out = scratch.quads;
  const faceOffsets = new Uint32Array(FACE_COUNT + 1);
  let n = 0;

  // Opaque pass: one sweep per face so quads come out grouped by face id.
  for (let face = 0; face < FACE_COUNT; face++) {
    faceOffsets[face] = n;
    const delta = FACE_DELTA[face] as number;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        let i = 1 + (z + 1) * STRIDE_Z + (y + 1) * STRIDE_Y;
        for (let x = 0; x < N; x++, i++) {
          const m = padded[i] as number;
          if (m === AIR || !opaque(m)) continue;
          if (opaque(padded[i + delta] as number)) continue;
          out[n * 2] = pack0(x, y, z, 1, 1, face);
          out[n * 2 + 1] = pack1(m, NO_AO);
          n++;
        }
      }
    }
  }
  faceOffsets[FACE_COUNT] = n;
  const opaqueCount = n;

  // Transparent pass: faces towards AIR only.
  for (let y = 0; y < N; y++) {
    for (let z = 0; z < N; z++) {
      let i = 1 + (z + 1) * STRIDE_Z + (y + 1) * STRIDE_Y;
      for (let x = 0; x < N; x++, i++) {
        const m = padded[i] as number;
        if (m === AIR || opaque(m)) continue;
        for (let face = 0; face < FACE_COUNT; face++) {
          if (padded[i + (FACE_DELTA[face] as number)] !== AIR) continue;
          out[n * 2] = pack0(x, y, z, 1, 1, face);
          out[n * 2 + 1] = pack1(m, NO_AO);
          n++;
        }
      }
    }
  }

  return { key: input.key, quads: out.slice(0, n * QUAD_WORDS), faceOffsets, opaqueCount };
}
