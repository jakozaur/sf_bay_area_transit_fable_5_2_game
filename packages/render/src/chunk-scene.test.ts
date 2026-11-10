import { Material, type MeshOutput, PADDED_VOLUME, packChunkKey, QUAD_BYTES } from '@bayvox/core';
import { createNaiveScratch, MemoryWorldStore, naiveMeshChunk } from '@bayvox/testkit';
import { type InstancedBufferGeometry, type Mesh, MeshBasicMaterial } from 'three';
import { expect, test } from 'vitest';
import { BATCH_CHUNKS_XZ, BATCH_CHUNKS_Y, ChunkScene, LAYER_TERRAIN, LAYER_WATER } from './chunk-scene.ts';

function meshOf(world: MemoryWorldStore, cx: number, cy: number, cz: number): MeshOutput {
  const key = packChunkKey(cx, cy, cz);
  const padded = new Uint16Array(PADDED_VOLUME);
  world.paddedCopy(key, padded);
  return naiveMeshChunk({ key, size: 32, padded }, createNaiveScratch());
}

function scene(): ChunkScene {
  return new ChunkScene(new MeshBasicMaterial(), new MeshBasicMaterial());
}

/** A 4 x 4 x 4 rock cube with a 2 x 2 x 1 puddle on top, far from the grid origin (San Francisco is near chunk (650, 0, -2022)). */
function world(cx: number, cz: number): MemoryWorldStore {
  const w = new MemoryWorldStore();
  const x = cx * 32;
  const z = cz * 32;
  w.applyEdit({ t: 'fillBox', min: { x: x + 4, y: 4, z: z + 4 }, max: { x: x + 8, y: 8, z: z + 8 }, material: Material.ROCK });
  w.applyEdit({ t: 'fillBox', min: { x: x + 5, y: 8, z: z + 5 }, max: { x: x + 7, y: 9, z: z + 7 }, material: Material.WATER });
  return w;
}

test('upload splits opaque and water into two instanced meshes on their layers', () => {
  const s = scene();
  const mesh = meshOf(world(650, -2022), 650, 0, -2022);
  // Cube: 6 faces x 16 (faces under water are kept: water is not opaque). Puddle: top 4 + sides 8.
  expect(mesh.opaqueCount).toBe(96);
  expect(mesh.quads.length / 2 - mesh.opaqueCount).toBe(12);
  s.upload(mesh);
  expect(s.chunkCount).toBe(1);
  expect(s.meshedCount).toBe(1);
  expect(s.quadCount).toBe(108);
  expect(s.quadBytes).toBe(108 * QUAD_BYTES);
  // Nothing is in the scene graph until the frame's flush builds the batch.
  expect(s.terrain.children).toHaveLength(0);
  expect(s.flush()).toBe(1);
  expect(s.flush()).toBe(0);
  const opaque = s.terrain.children[0] as Mesh;
  const water = s.water.children[0] as Mesh;
  expect((opaque.geometry as InstancedBufferGeometry).instanceCount).toBe(96);
  expect((water.geometry as InstancedBufferGeometry).instanceCount).toBe(12);
  expect(opaque.layers.mask).toBe(1 << LAYER_TERRAIN);
  expect(water.layers.mask).toBe(1 << LAYER_WATER);
  // The instance attribute is the packed words themselves, as unsigned integers.
  const attr = opaque.geometry.getAttribute('aQuad');
  expect(attr.array).toBeInstanceOf(Uint32Array);
  expect(attr.itemSize).toBe(2);
  expect(attr.array[0]).toBe(mesh.quads[0]);
});

test('chunks are drawn in batches of 4 x 16 x 4: a near field of hundreds of chunks is a handful of draws', () => {
  const s = scene();
  const w = new MemoryWorldStore();
  // A slab of rock one voxel thick through an 8 x 8 block of chunk columns at two levels: 128 chunks with quads.
  const x0 = 648 * 32;
  const z0 = -2024 * 32;
  for (const y of [4, 36])
    w.applyEdit({ t: 'fillBox', min: { x: x0, y, z: z0 }, max: { x: x0 + 8 * 32, y: y + 1, z: z0 + 8 * 32 }, material: Material.ROCK });
  let quads = 0;
  for (let cx = 648; cx < 656; cx++) {
    for (let cz = -2024; cz < -2016; cz++) {
      for (const cy of [0, 1]) {
        const m = meshOf(w, cx, cy, cz);
        quads += m.quads.length / 2;
        s.upload(m);
      }
    }
  }
  expect(s.meshedCount).toBe(128);
  s.flush();
  // 8 x 8 columns aligned on the batch grid: four batches, each one mesh. Per chunk it was 128.
  expect(BATCH_CHUNKS_XZ).toBe(4);
  expect(BATCH_CHUNKS_Y).toBe(16);
  expect(s.batchCount).toBe(4);
  expect(s.terrain.children).toHaveLength(4);
  expect(s.water.children).toHaveLength(0);
  let drawn = 0;
  for (const c of s.terrain.children) drawn += ((c as Mesh).geometry as InstancedBufferGeometry).instanceCount;
  expect(drawn).toBe(quads);
  expect(s.quadCount).toBe(quads);
  // Each quad carries its chunk's place in the batch in the flag bits of word 1: x at 18, z at 23, y at 28.
  const places = new Set<string>();
  for (const c of s.terrain.children) {
    const words = (c as Mesh).geometry.getAttribute('aQuad').array as Uint32Array;
    for (let i = 1; i < words.length; i += 2) {
      const b = words[i] as number;
      places.add(`${(b >>> 18) & 31},${(b >>> 28) & 15},${(b >>> 23) & 31}`);
      // The material and the ambient occlusion below the flags are untouched.
      expect(b & 1023).toBe(Material.ROCK);
    }
  }
  expect(places.size).toBe(4 * 2 * 4);
  expect([...places].every((p) => /^[0-3],[01],[0-3]$/.test(p))).toBe(true);
  // A chunk below sea level (cy -1) is in the batch layer below: slab 15 of it.
  s.upload(meshOf(world(650, -2022), 650, 0, -2022));
  const below = new MemoryWorldStore();
  below.applyEdit({
    t: 'fillBox',
    min: { x: 650 * 32, y: -20, z: -2022 * 32 },
    max: { x: 650 * 32 + 4, y: -16, z: -2022 * 32 + 4 },
    material: Material.ROCK,
  });
  s.upload(meshOf(below, 650, -1, -2022));
  expect(s.flush()).toBe(2);
  expect(s.batchCount).toBe(5);
  const deep = s.terrain.children[s.terrain.children.length - 1] as Mesh;
  expect(deep.position.toArray()).toEqual([648 * 32, -16 * 32, -2024 * 32]);
  const b = (deep.geometry.getAttribute('aQuad').array as Uint32Array)[1] as number;
  expect([(b >>> 18) & 31, (b >>> 28) & 15, (b >>> 23) & 31]).toEqual([2, 15, 2]);
  // Removing every chunk of a batch removes its mesh.
  for (let cx = 648; cx < 652; cx++) for (let cz = -2024; cz < -2020; cz++) for (const cy of [0, 1]) s.remove(packChunkKey(cx, cy, cz));
  s.flush();
  expect(s.batchCount).toBe(4);
  expect(s.terrain.children).toHaveLength(4);
});

test('chunk meshes are positioned relative to the floating origin, exactly', () => {
  const s = scene();
  s.upload(meshOf(world(650, -2022), 650, 0, -2022));
  s.flush();
  const m = s.terrain.children[0] as Mesh;
  // The mesh stands at the corner of its batch, chunk (648, 0, -2024); the chunk is at place (2, 0, 2) inside it.
  expect(m.position.toArray()).toEqual([648 * 32, 0, -2024 * 32]);
  const b = (m.geometry.getAttribute('aQuad').array as Uint32Array)[1] as number;
  expect([(b >>> 18) & 31, (b >>> 28) & 15, (b >>> 23) & 31]).toEqual([2, 0, 2]);
  s.setOrigin(648, -1, -2020);
  expect(m.position.toArray()).toEqual([0, 32, -128]);
  expect(m.matrix.elements.slice(12, 15)).toEqual([0, 32, -128]);
  // A chunk uploaded after the rebase lands relative to the same origin: chunk (645, 0, -2021) is at place
  // (1, 0, 3) of the batch whose corner is chunk (644, 0, -2024).
  s.upload(meshOf(world(645, -2021), 645, 0, -2021));
  s.flush();
  const second = s.terrain.children[1] as Mesh;
  expect(second.position.toArray()).toEqual([-128, 32, -128]);
  const b2 = (second.geometry.getAttribute('aQuad').array as Uint32Array)[1] as number;
  expect([(b2 >>> 18) & 31, (b2 >>> 28) & 15, (b2 >>> 23) & 31]).toEqual([1, 0, 3]);
  expect(() => s.setOrigin(0.5, 0, 0)).toThrow(/integer chunk coordinate/);
});

test('re-upload replaces, an empty mesh keeps the chunk known but draws nothing, remove forgets it', () => {
  const s = scene();
  const w = world(0, 0);
  const key = packChunkKey(0, 0, 0);
  s.upload(meshOf(w, 0, 0, 0));
  s.flush();
  expect(s.terrain.children).toHaveLength(1);
  w.applyEdit({ t: 'fillBox', min: { x: 4, y: 4, z: 4 }, max: { x: 8, y: 9, z: 8 }, material: Material.AIR });
  s.upload(meshOf(w, 0, 0, 0));
  s.flush();
  expect(s.chunkCount).toBe(1);
  expect(s.meshedCount).toBe(0);
  expect(s.quadCount).toBe(0);
  expect(s.terrain.children).toHaveLength(0);
  expect(s.water.children).toHaveLength(0);
  expect(s.has(key)).toBe(true);
  s.remove(key);
  expect(s.has(key)).toBe(false);
  expect(s.chunkCount).toBe(0);
  s.remove(key);
});

test('upload rejects an inconsistent mesh', () => {
  const s = scene();
  const bad: MeshOutput = { key: packChunkKey(0, 0, 0), quads: new Uint32Array(4), faceOffsets: new Uint32Array(7), opaqueCount: 3 };
  expect(() => s.upload(bad)).toThrow(/opaqueCount 3/);
});
