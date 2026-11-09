import { Material, type MeshOutput, PADDED_VOLUME, packChunkKey, QUAD_BYTES } from '@bayvox/core';
import { createNaiveScratch, MemoryWorldStore, naiveMeshChunk } from '@bayvox/testkit';
import { type InstancedBufferGeometry, type Mesh, MeshBasicMaterial } from 'three';
import { expect, test } from 'vitest';
import { ChunkScene, LAYER_TERRAIN, LAYER_WATER } from './chunk-scene.ts';

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

test('chunk meshes are positioned relative to the floating origin, exactly', () => {
  const s = scene();
  s.upload(meshOf(world(650, -2022), 650, 0, -2022));
  const m = s.terrain.children[0] as Mesh;
  expect(m.position.toArray()).toEqual([650 * 32, 0, -2022 * 32]);
  s.setOrigin(648, -1, -2020);
  expect(m.position.toArray()).toEqual([64, 32, -64]);
  expect(m.matrix.elements.slice(12, 15)).toEqual([64, 32, -64]);
  // A chunk uploaded after the rebase lands relative to the same origin.
  s.upload(meshOf(world(649, -2021), 649, 0, -2021));
  expect((s.terrain.children[1] as Mesh).position.toArray()).toEqual([32, 32, -32]);
  expect(() => s.setOrigin(0.5, 0, 0)).toThrow(/integer chunk coordinate/);
});

test('re-upload replaces, an empty mesh keeps the chunk known but draws nothing, remove forgets it', () => {
  const s = scene();
  const w = world(0, 0);
  const key = packChunkKey(0, 0, 0);
  s.upload(meshOf(w, 0, 0, 0));
  w.applyEdit({ t: 'fillBox', min: { x: 4, y: 4, z: 4 }, max: { x: 8, y: 9, z: 8 }, material: Material.AIR });
  s.upload(meshOf(w, 0, 0, 0));
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
