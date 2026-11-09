import { CHUNK_SIZE, chunkKeyOfVoxel, PADDED_VOLUME } from '@bayvox/core';
import { test } from 'vitest';
import { createNaiveScratch, naiveMeshChunk } from './naive-mesher.ts';
import { createSyntheticWorld } from './synthetic-world.ts';

// Baseline for the binary greedy mesher in packages/mesher to beat on quad count, not on time.
// Vitest 5 benchmark API: `bench` is a test-context fixture.
test('naive mesher, 32^3 surface chunk', async ({ bench }) => {
  const world = createSyntheticWorld({ seed: 1, sizeChunks: 1 });
  const key = chunkKeyOfVoxel(0, 0, 0);
  const padded = new Uint16Array(PADDED_VOLUME);
  world.store.paddedCopy(key, padded);
  const scratch = createNaiveScratch();
  await bench.compare(
    bench('naiveMeshChunk', () => {
      naiveMeshChunk({ key, size: CHUNK_SIZE, padded }, scratch);
    }),
    bench('paddedCopy', () => {
      world.store.paddedCopy(key, padded);
    }),
  );
});
