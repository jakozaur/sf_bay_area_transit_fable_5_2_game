import {
  CHUNK_SIZE,
  chunkKeyOfVoxel,
  FACE_NORMALS,
  isOpaque,
  Material,
  type MeshOutput,
  PADDED_VOLUME,
  packChunkKey,
  paddedIndex,
  stableHash,
  unpackQuad,
} from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { MemoryWorldStore } from './memory-world.ts';
import { createNaiveScratch, naiveMeshChunk } from './naive-mesher.ts';
import { createSyntheticWorld } from './synthetic-world.ts';

const scratch = createNaiveScratch();
const KEY = packChunkKey(0, 0, 0);

function meshOf(store: MemoryWorldStore, key = KEY): MeshOutput {
  const padded = new Uint16Array(PADDED_VOLUME);
  store.paddedCopy(key, padded);
  return naiveMeshChunk({ key, size: CHUNK_SIZE, padded }, scratch);
}

function quadCount(m: MeshOutput): number {
  return m.quads.length / 2;
}

describe('naive mesher', () => {
  test('empty chunk gives an empty mesh', () => {
    const m = meshOf(new MemoryWorldStore());
    expect(m.quads.length).toBe(0);
    expect(m.opaqueCount).toBe(0);
    expect(Array.from(m.faceOffsets)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(m.key).toBe(KEY);
  });

  test('single voxel gives 6 quads, one per face bucket', () => {
    const w = new MemoryWorldStore();
    w.setRaw(3, 4, 5, Material.ROCK);
    const m = meshOf(w);
    expect(quadCount(m)).toBe(6);
    expect(m.opaqueCount).toBe(6);
    expect(Array.from(m.faceOffsets)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (let f = 0; f < 6; f++) {
      expect(unpackQuad(m.quads, f)).toEqual({ x: 3, y: 4, z: 5, w: 1, h: 1, face: f, material: Material.ROCK, ao: 255, flags: 0 });
    }
  });

  test('full chunk in empty space exposes exactly its 6 x 32 x 32 boundary faces', () => {
    const w = new MemoryWorldStore();
    w.applyEdit({ t: 'fillBox', min: { x: 0, y: 0, z: 0 }, max: { x: 32, y: 32, z: 32 }, material: Material.ROCK });
    const m = meshOf(w);
    expect(quadCount(m)).toBe(6 * 32 * 32);
    for (let f = 0; f < 6; f++) expect((m.faceOffsets[f + 1] as number) - (m.faceOffsets[f] as number)).toBe(1024);
  });

  test('neighbour padding hides seam faces', () => {
    const w = new MemoryWorldStore();
    w.applyEdit({ t: 'fillBox', min: { x: 0, y: 0, z: 0 }, max: { x: 64, y: 32, z: 32 }, material: Material.ROCK });
    const m = meshOf(w);
    expect(quadCount(m)).toBe(5 * 32 * 32);
    expect((m.faceOffsets[1] as number) - (m.faceOffsets[0] as number)).toBe(0);
    w.applyEdit({ t: 'fillBox', min: { x: -32, y: -32, z: -32 }, max: { x: 64, y: 64, z: 64 }, material: Material.ROCK });
    expect(quadCount(meshOf(w))).toBe(0);
  });

  test('opaque faces are bucketed by face and precede transparent quads', () => {
    const w = createSyntheticWorld({ seed: 5, sizeChunks: 2 }).store;
    for (const key of w.chunkKeys()) {
      const m = meshOf(w, key);
      expect(m.faceOffsets[0]).toBe(0);
      expect(m.faceOffsets[6]).toBe(m.opaqueCount);
      for (let f = 0; f < 6; f++) {
        expect(m.faceOffsets[f + 1] as number).toBeGreaterThanOrEqual(m.faceOffsets[f] as number);
        for (let i = m.faceOffsets[f] as number; i < (m.faceOffsets[f + 1] as number); i++) {
          const q = unpackQuad(m.quads, i);
          if (q.face !== f || !isOpaque(q.material)) throw new Error(`quad ${i} of chunk ${key} is in the wrong bucket`);
        }
      }
      for (let i = m.opaqueCount; i < quadCount(m); i++) {
        if (unpackQuad(m.quads, i).material !== Material.WATER) throw new Error(`quad ${i} of chunk ${key} should be water`);
      }
    }
  });

  test('every quad is a real visible face, and the count equals a brute-force count on the world store', () => {
    const world = createSyntheticWorld({ seed: 2, sizeChunks: 2 });
    const w = world.store;
    let meshed = 0;
    let transparent = 0;
    for (const key of w.chunkKeys()) {
      const m = meshOf(w, key);
      const padded = new Uint16Array(PADDED_VOLUME);
      w.paddedCopy(key, padded);
      for (let i = 0; i < quadCount(m); i++) {
        const q = unpackQuad(m.quads, i);
        const n = FACE_NORMALS[q.face] as readonly [number, number, number];
        const self = padded[paddedIndex(q.x, q.y, q.z)] as number;
        const other = padded[paddedIndex(q.x + n[0], q.y + n[1], q.z + n[2])] as number;
        if (self !== q.material || q.w !== 1 || q.h !== 1) throw new Error(`quad ${i} of chunk ${key} does not match its voxel`);
        if (isOpaque(self) ? isOpaque(other) : other !== Material.AIR) throw new Error(`quad ${i} of chunk ${key} is hidden`);
      }
      meshed += quadCount(m);
      transparent += quadCount(m) - m.opaqueCount;
    }
    let expected = 0;
    let expectedTransparent = 0;
    for (let y = world.min.y - 1; y <= world.max.y; y++) {
      for (let z = -1; z <= world.max.z; z++) {
        for (let x = -1; x <= world.max.x; x++) {
          const self = w.get(x, y, z);
          if (self === Material.AIR) continue;
          for (const [nx, ny, nz] of FACE_NORMALS) {
            const other = w.get(x + nx, y + ny, z + nz);
            if (isOpaque(self)) {
              if (!isOpaque(other)) expected++;
            } else if (other === Material.AIR) {
              expected++;
              expectedTransparent++;
            }
          }
        }
      }
    }
    expect(meshed).toBe(expected);
    expect(transparent).toBe(expectedTransparent);
    expect(expectedTransparent).toBeGreaterThan(0);
  });

  test('water: no faces between water voxels or against opaque, opaque still faces water', () => {
    const w = new MemoryWorldStore();
    w.applyEdit({ t: 'fillBox', min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 1, z: 4 }, material: Material.BAY_MUD });
    w.applyEdit({ t: 'fillBox', min: { x: 0, y: 1, z: 0 }, max: { x: 4, y: 3, z: 4 }, material: Material.WATER });
    const m = meshOf(w);
    // Mud slab: all 6 sides visible (top faces water): 2 * 16 + 4 * 4.
    expect(m.opaqueCount).toBe(48);
    // Water block 4 x 2 x 4: top 16 + sides 4 * 8; bottom touches mud, so none there.
    expect(quadCount(m) - m.opaqueCount).toBe(48);
  });

  test('identical input gives byte-identical output and a fresh, exact-size buffer', () => {
    const w = createSyntheticWorld({ seed: 9, sizeChunks: 1 }).store;
    const key = chunkKeyOfVoxel(0, 0, 0);
    const a = meshOf(w, key);
    const b = meshOf(w, key);
    expect(quadCount(a)).toBeGreaterThan(100);
    expect(stableHash(a.quads)).toBe(stableHash(b.quads));
    expect(a.quads.buffer).not.toBe(b.quads.buffer);
    expect(a.quads.buffer).not.toBe(scratch.quads.buffer);
    expect(a.quads.byteLength).toBe(quadCount(a) * 8);
  });

  test('worst case checkerboard fits the scratch buffer', () => {
    const w = new MemoryWorldStore();
    for (let y = 0; y < 32; y++)
      for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) if ((x + y + z) % 2 === 0) w.setRaw(x, y, z, Material.ROCK);
    expect(quadCount(meshOf(w))).toBe(98304);
  });

  test('bad input fails loudly', () => {
    expect(() => naiveMeshChunk({ key: KEY, size: 16, padded: new Uint16Array(PADDED_VOLUME) }, scratch)).toThrow('got 16');
    expect(() => naiveMeshChunk({ key: KEY, size: 32, padded: new Uint16Array(10) }, scratch)).toThrow('got 10');
    const padded = new Uint16Array(PADDED_VOLUME);
    padded[paddedIndex(1, 1, 1)] = 999;
    expect(() => naiveMeshChunk({ key: KEY, size: 32, padded }, scratch)).toThrow('999');
  });
});
