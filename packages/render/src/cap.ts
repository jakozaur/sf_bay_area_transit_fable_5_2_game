/**
 * Cut-plane cap (doc 03 section 8, slice-texture caps): the voxel layer just below the cut is copied into a
 * material-id texture and drawn as one horizontal quad, so the cross-section shows geology without remeshing.
 */
import { CHUNK_SIZE, CHUNK_Y_MAX, CHUNK_Y_MIN, type ChunkData, type ChunkKey, packChunkKey } from '@bayvox/core';

/** Largest cap region edge in chunks (1,024 m): bounds the texture and the rebuild cost. */
export const CAP_MAX_CHUNKS = 32;
/** Largest cut radius the cap can cover, metres. */
export const CAP_MAX_RADIUS = ((CAP_MAX_CHUNKS - 1) * CHUNK_SIZE) / 2;

export interface CapRegion {
  /** Voxel layer shown on the cap: the highest layer entirely at or below the cut plane. */
  layerY: number;
  /** Minimum chunk of the region and its edge length in chunks. */
  cx0: number;
  cz0: number;
  n: number;
}

/** Chunk-aligned square covering the cut disc around a focus point (world metres). */
export function capRegion(cutY: number, focusX: number, focusZ: number, radius: number): CapRegion {
  if (!(radius > 0) || radius > CAP_MAX_RADIUS) {
    throw new RangeError(`capRegion: cut radius must be in (0, ${CAP_MAX_RADIUS}] m, got ${radius}`);
  }
  const cx0 = Math.floor((focusX - radius) / CHUNK_SIZE);
  const cz0 = Math.floor((focusZ - radius) / CHUNK_SIZE);
  const n = Math.max(Math.floor((focusX + radius) / CHUNK_SIZE) - cx0, Math.floor((focusZ + radius) / CHUNK_SIZE) - cz0) + 1;
  return { layerY: Math.ceil(cutY) - 1, cx0, cz0, n };
}

export function sameRegion(a: CapRegion | null, b: CapRegion): boolean {
  return a !== null && a.layerY === b.layerY && a.cx0 === b.cx0 && a.cz0 === b.cz0 && a.n === b.n;
}

const N = CHUNK_SIZE;
const pack = packChunkKey;

/**
 * Writes the material ids of one voxel layer into `out` as 2 bytes per texel (low byte, high byte),
 * row-major with x along a row and z down the rows: texel (x - cx0 * 32, z - cz0 * 32).
 * Chunks the store does not know read as AIR (0).
 */
export function fillCapLayer(world: { getChunk(key: ChunkKey): ChunkData | undefined }, r: CapRegion, out: Uint8Array): void {
  const size = r.n * N;
  if (out.length !== size * size * 2) {
    throw new RangeError(`fillCapLayer: out must have ${size * size * 2} bytes for a ${r.n}-chunk region, got ${out.length}`);
  }
  out.fill(0);
  const cy = r.layerY >> 5;
  if (cy < CHUNK_Y_MIN || cy > CHUNK_Y_MAX) return;
  const layerBase = (r.layerY & 31) * N * N;
  for (let j = 0; j < r.n; j++) {
    for (let i = 0; i < r.n; i++) {
      const chunk = world.getChunk(pack(r.cx0 + i, cy, r.cz0 + j));
      if (chunk === undefined) continue;
      const { palette, indices } = chunk;
      for (let z = 0; z < N; z++) {
        let o = ((j * N + z) * size + i * N) * 2;
        const row = layerBase + z * N;
        for (let x = 0; x < N; x++, o += 2) {
          const m = palette[indices === null ? 0 : (indices[row + x] as number)] as number;
          out[o] = m & 255;
          out[o + 1] = m >> 8;
        }
      }
    }
  }
}
