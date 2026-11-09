import { Material } from '@bayvox/core';
import { test } from 'vitest';
import { ChunkWorldStore } from './chunk-store.ts';
import type { ColumnSample, ColumnSource } from './column-source.ts';
import { SyntheticColumnSource } from './synthetic-source.ts';

// Targets (work package C): generate a 32^3 chunk in under 2 ms; carve a 7 m bore 100 m long in under 20 ms.
// Vitest 5 benchmark API: `bench` is a test-context fixture.

const synthetic = new SyntheticColumnSource({ seed: 1 });

test('chunk generation, cold (new store, column sampling included)', async ({ bench }) => {
  let n = 0;
  await bench.compare(
    // Each iteration generates a different chunk column so nothing is served from a cache.
    bench('surface chunk, synthetic terrain with buildings, 2 m voxels', () => {
      const store = new ChunkWorldStore({ voxelSizeM: 2, source: synthetic });
      store.get((n++ % 4096) * 32, 0, 0);
    }),
    bench('underground chunk (32768 core materialAt calls), 2 m voxels', () => {
      const store = new ChunkWorldStore({ voxelSizeM: 2, source: synthetic });
      store.get((n++ % 4096) * 32, -40, 0);
    }),
    bench('surface chunk, synthetic terrain, 1 m voxels', () => {
      const store = new ChunkWorldStore({ voxelSizeM: 1, source: synthetic });
      store.get((n++ % 4096) * 32, 0, 0);
    }),
    bench('sky chunk (uniform AIR)', () => {
      const store = new ChunkWorldStore({ voxelSizeM: 2, source: synthetic });
      store.get((n++ % 4096) * 32, 2000, 0);
    }),
    bench('empty store construction alone (overhead included above)', () => {
      new ChunkWorldStore({ voxelSizeM: 2, source: synthetic });
    }),
  );
});

const solid: ColumnSource = {
  sampleColumn(_xM: number, _zM: number, out: ColumnSample): void {
    out.surfaceM = 1000;
    out.surfaceMaterial = 0;
    out.columnClass = 0;
    out.buildingMaterial = 0;
    out.buildingBaseM = 0;
    out.buildingTopM = 0;
    out.waterLevelM = Number.NEGATIVE_INFINITY;
  },
};

test('carve a 7 m diameter capsule 100 m long, then refill it (both edits timed together)', async ({ bench }) => {
  // The refill restores solid ground so every iteration carves real material; it makes the figures an upper bound on the carve.
  function setup(voxelSizeM: number, b: { x: number; y: number; z: number }): () => void {
    const store = new ChunkWorldStore({ voxelSizeM, source: solid, materialAt: () => Material.ROCK, recordEdits: false });
    const a = { x: 0, y: 0, z: 0 };
    const radius = 3.5 / voxelSizeM;
    const pad = Math.ceil(radius) + 1;
    const min = { x: Math.min(a.x, b.x) - pad, y: Math.min(a.y, b.y) - pad, z: Math.min(a.z, b.z) - pad };
    const max = { x: Math.max(a.x, b.x) + pad + 1, y: Math.max(a.y, b.y) + pad + 1, z: Math.max(a.z, b.z) + pad + 1 };
    store.applyEdit({ t: 'carveCapsule', a, b, radius }); // warm up: generates the chunks
    store.applyEdit({ t: 'fillBox', min, max, material: Material.ROCK });
    return () => {
      const dirty = store.applyEdit({ t: 'carveCapsule', a, b, radius });
      if (dirty.length === 0 || store.lastEditVoxelsChanged === 0) throw new Error('bench: carve changed nothing');
      store.applyEdit({ t: 'fillBox', min, max, material: Material.ROCK });
    };
  }
  await bench.compare(
    bench('2 m voxels, along x', setup(2, { x: 50, y: 0, z: 0 })),
    bench('2 m voxels, oblique', setup(2, { x: 30, y: -10, z: 39 })),
    bench('1 m voxels, along x', setup(1, { x: 100, y: 0, z: 0 })),
    bench('1 m voxels, along z', setup(1, { x: 0, y: 0, z: 100 })),
    bench('1 m voxels, oblique', setup(1, { x: 60, y: -20, z: 77 })),
    bench('1 m voxels, space diagonal', setup(1, { x: 58, y: -58, z: 58 })),
  );
});
