import { describe, expect, test } from 'vitest';
import {
  CHUNK_VOLUME,
  chunkKeyOfVoxel,
  chunkOrigin,
  localIndex,
  PADDED_VOLUME,
  packChunkKey,
  paddedIndex,
  unpackChunkKey,
  voxelToChunk,
  voxelToLocal,
} from './chunk.ts';

describe('ChunkKey', () => {
  test('round-trips corners of the range and typical values', () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [-8192, -128, -8192],
      [8191, 127, 8191],
      [650, 0, -2022],
      [-1, -1, -1],
      [1, -4, 2559],
    ];
    for (const [cx, cy, cz] of cases) {
      expect(unpackChunkKey(packChunkKey(cx, cy, cz))).toEqual({ cx, cy, cz });
    }
  });

  test('keys are unique safe integers and sort by cx, cz, cy', () => {
    const seen = new Set<number>();
    for (let cx = -3; cx <= 3; cx++) {
      for (let cy = -3; cy <= 3; cy++) {
        for (let cz = -3; cz <= 3; cz++) {
          const k = packChunkKey(cx, cy, cz);
          expect(Number.isSafeInteger(k)).toBe(true);
          seen.add(k);
        }
      }
    }
    expect(seen.size).toBe(343);
    expect(packChunkKey(1, -128, -8192)).toBeGreaterThan(packChunkKey(0, 127, 8191));
    expect(packChunkKey(0, -128, 1)).toBeGreaterThan(packChunkKey(0, 127, 0));
  });

  test('rejects out-of-range and non-integer coordinates, naming them', () => {
    expect(() => packChunkKey(8192, 0, 0)).toThrow('(8192, 0, 0)');
    expect(() => packChunkKey(0, -129, 0)).toThrow('(0, -129, 0)');
    expect(() => packChunkKey(0, 0, 0.5)).toThrow('(0, 0, 0.5)');
    expect(() => unpackChunkKey(-1)).toThrow('-1');
    expect(() => unpackChunkKey(2 ** 36)).toThrow();
  });

  test('voxel to chunk and local use floor semantics for negatives', () => {
    expect(voxelToChunk(-1)).toBe(-1);
    expect(voxelToLocal(-1)).toBe(31);
    expect(voxelToChunk(-33)).toBe(-2);
    expect(voxelToChunk(32)).toBe(1);
    expect(voxelToLocal(32)).toBe(0);
    const key = chunkKeyOfVoxel(-1, 64, -65);
    expect(unpackChunkKey(key)).toEqual({ cx: -1, cy: 2, cz: -3 });
    expect(chunkOrigin(key)).toEqual({ x: -32, y: 64, z: -96 });
  });

  test('dense and padded index orders', () => {
    expect(localIndex(0, 0, 0)).toBe(0);
    expect(localIndex(1, 0, 0)).toBe(1);
    expect(localIndex(0, 0, 1)).toBe(32);
    expect(localIndex(0, 1, 0)).toBe(1024);
    expect(localIndex(31, 31, 31)).toBe(CHUNK_VOLUME - 1);
    expect(paddedIndex(-1, -1, -1)).toBe(0);
    expect(paddedIndex(0, 0, 0)).toBe(1 + 34 + 1156);
    expect(paddedIndex(32, 32, 32)).toBe(PADDED_VOLUME - 1);
  });
});
