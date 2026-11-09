import { CHUNK_SIZE, chunkKeyOfVoxel, Material, type MeshInput, PADDED_VOLUME, packChunkKey } from '@bayvox/core';
import { createNaiveScratch, createSyntheticWorld, MemoryWorldStore, naiveMeshChunk } from '@bayvox/testkit';
import { test } from 'vitest';
import { meshChunk, meshChunkFlat } from './mesh-chunk.ts';
import { type ColumnMeshInput, columnIndex, meshColumnPatch } from './mesh-columns.ts';
import { createMesherScratch } from './scratch.ts';
import { quadCount, randomPadded } from './test-helpers.ts';

// Vitest 5 benchmark API: `bench` is a test-context fixture. Quad counts are part of the bench names.
const scratch = createMesherScratch();
const naiveScratch = createNaiveScratch();
const mesh = meshChunk;
const meshFlat = meshChunkFlat;
const naive = naiveMeshChunk;

function label(name: string, input: MeshInput): string {
  const ao = quadCount(meshChunk(input, scratch));
  const flat = quadCount(meshChunkFlat(input, scratch));
  const faces = quadCount(naiveMeshChunk(input, naiveScratch));
  return `${name} [quads: ${ao} with AO, ${flat} flat, ${faces} naive faces]`;
}

/** Surface chunks (those that contain both ground and air) of the synthetic heightmap world. */
function surfaceChunks(): MeshInput[] {
  const world = createSyntheticWorld({ seed: 1, sizeChunks: 4 });
  const inputs: MeshInput[] = [];
  for (const key of world.store.chunkKeys()) {
    const padded = new Uint16Array(PADDED_VOLUME);
    world.store.paddedCopy(key, padded);
    const input = { key, size: CHUNK_SIZE, padded };
    if (meshChunk(input, scratch).opaqueCount > 0) inputs.push(input);
  }
  return inputs;
}

test('32^3 heightmap chunk (same chunk as the testkit naive bench)', async ({ bench }) => {
  const world = createSyntheticWorld({ seed: 1, sizeChunks: 1 });
  const key = chunkKeyOfVoxel(0, 0, 0);
  const padded = new Uint16Array(PADDED_VOLUME);
  world.store.paddedCopy(key, padded);
  const input = { key, size: CHUNK_SIZE, padded };
  await bench.compare(
    bench(label('meshChunk', input), () => {
      mesh(input, scratch);
    }),
    bench('meshChunkFlat', () => {
      meshFlat(input, scratch);
    }),
    bench('naiveMeshChunk', () => {
      naive(input, naiveScratch);
    }),
  );
});

test('all non-empty chunks of a 4 x 4 chunk heightmap world, per chunk', async ({ bench }) => {
  const inputs = surfaceChunks();
  let ao = 0;
  let flat = 0;
  for (const input of inputs) {
    ao += quadCount(meshChunk(input, scratch));
    flat += quadCount(meshChunkFlat(input, scratch));
  }
  const n = inputs.length;
  let i = 0;
  let j = 0;
  await bench.compare(
    bench(`meshChunk, one of ${n} chunks per iteration [mean quads: ${(ao / n).toFixed(0)} with AO, ${(flat / n).toFixed(0)} flat]`, () => {
      mesh(inputs[i++ % n] as MeshInput, scratch);
    }),
    bench('meshChunkFlat, same chunks', () => {
      meshFlat(inputs[j++ % n] as MeshInput, scratch);
    }),
  );
});

test('other chunk contents', async ({ bench }) => {
  const empty = { key: 0, size: CHUNK_SIZE, padded: new Uint16Array(PADDED_VOLUME) };
  const solid = { key: 0, size: CHUNK_SIZE, padded: new Uint16Array(PADDED_VOLUME).fill(Material.ROCK) };
  const random = { key: 0, size: CHUNK_SIZE, padded: randomPadded(1, 0.5, [Material.ROCK, Material.FILL]) };
  const store = new MemoryWorldStore();
  store.applyEdit({ t: 'fillBox', min: { x: -32, y: -32, z: -32 }, max: { x: 64, y: 64, z: 64 }, material: Material.BAY_MUD });
  store.applyEdit({ t: 'carveCapsule', a: { x: -10, y: 16, z: 16 }, b: { x: 50, y: 16, z: 16 }, radius: 3.5 });
  const tunnel = { key: packChunkKey(0, 0, 0), size: CHUNK_SIZE, padded: new Uint16Array(PADDED_VOLUME) };
  store.paddedCopy(tunnel.key, tunnel.padded);
  await bench.compare(
    bench(label('empty (all air)', empty), () => {
      mesh(empty, scratch);
    }),
    bench(label('buried (all rock)', solid), () => {
      mesh(solid, scratch);
    }),
    bench(label('7 m bore through solid ground', tunnel), () => {
      mesh(tunnel, scratch);
    }),
    bench(label('random 50% fill, 2 materials', random), () => {
      mesh(random, scratch);
    }),
  );
});

test('column patch 32 x 32', async ({ bench }) => {
  const world = createSyntheticWorld({ seed: 1, sizeChunks: 2, relief: 60 });
  const heights = new Int16Array(34 * 34);
  const classes = new Uint16Array(34 * 34);
  for (let z = -1; z <= 32; z++) {
    for (let x = -1; x <= 32; x++) {
      const h = world.heightAt(x + 16, z + 16);
      heights[columnIndex(x, z)] = h;
      classes[columnIndex(x, z)] = h < 2 ? Material.WATER : h > 20 ? Material.ROCK : Material.GRASS;
    }
  }
  const input: ColumnMeshInput = { key: 0, size: 32, heights, classes };
  const slabs = meshColumnPatch(input, scratch);
  let quads = 0;
  for (const s of slabs) quads += quadCount(s.mesh);
  const flatInput: ColumnMeshInput = {
    key: 0,
    size: 32,
    heights: new Int16Array(34 * 34).fill(5),
    classes: new Uint16Array(34 * 34).fill(Material.GRASS),
  };
  const patch = meshColumnPatch;
  await bench.compare(
    bench(`meshColumnPatch, hills [${slabs.length} slabs, ${quads} quads]`, () => {
      patch(input, scratch);
    }),
    bench('meshColumnPatch, flat plain [1 slab, 1 quad]', () => {
      patch(flatInput, scratch);
    }),
  );
});
