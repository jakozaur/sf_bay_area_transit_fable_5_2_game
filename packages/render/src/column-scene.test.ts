import { type MeshOutput, packQuadWord0, packQuadWord1, QUAD_BYTES, unpackQuad } from '@bayvox/core';
import { type InstancedBufferGeometry, type Mesh, MeshBasicMaterial } from 'three';
import { expect, test } from 'vitest';
import { LAYER_TERRAIN, LAYER_WATER } from './chunk-scene.ts';
import { ColumnScene } from './column-scene.ts';

/** A slab mesh of `opaque` grass quads followed by `water` water quads. */
function slabMesh(opaque: number, water: number): MeshOutput {
  const quads = new Uint32Array((opaque + water) * 2);
  for (let i = 0; i < opaque + water; i++) {
    quads[i * 2] = packQuadWord0(i, 3, 5, 2, 4, 2);
    quads[i * 2 + 1] = packQuadWord1(i < opaque ? 11 : 1, 0xff);
  }
  return { key: 0, quads, faceOffsets: new Uint32Array(7), opaqueCount: opaque };
}

function scene(): ColumnScene {
  return new ColumnScene(new MeshBasicMaterial(), new MeshBasicMaterial());
}

const PLACE = { originXM: 18_432, originYM: 1, originZM: -67_584, cellM: 4, stepM: 1 };

function words(mesh: Mesh): Uint32Array {
  return (mesh.geometry as InstancedBufferGeometry).getAttribute('aQuad').array as Uint32Array;
}

test('a batch is one opaque and one water draw; quads carry their patch, slab and the LOD bit', () => {
  const s = scene();
  s.setBatch(
    'city.0.0',
    [
      { px: 0, pz: 0, slab: -1, mesh: slabMesh(2, 1) },
      { px: 3, pz: 7, slab: 2, mesh: slabMesh(1, 0) },
      { px: 5, pz: 5, slab: 0, mesh: slabMesh(0, 0) },
    ],
    PLACE,
  );
  expect(s.batchCount).toBe(1);
  expect(s.quadCount).toBe(4);
  expect(s.quadBytes).toBe(4 * QUAD_BYTES);
  expect(s.terrain.children.length).toBe(1);
  expect(s.water.children.length).toBe(1);
  const opaque = s.terrain.children[0] as Mesh;
  const water = s.water.children[0] as Mesh;
  expect(opaque.layers.mask).toBe(1 << LAYER_TERRAIN);
  expect(water.layers.mask).toBe(1 << LAYER_WATER);
  expect((opaque.geometry as InstancedBufferGeometry).instanceCount).toBe(3);
  expect((water.geometry as InstancedBufferGeometry).instanceCount).toBe(1);

  const w = words(opaque);
  // Bit 31 of word 0 marks an LOD quad; the rest of the quad is untouched.
  expect((w[0] as number) >>> 31).toBe(1);
  expect(unpackQuad(Uint32Array.of((w[0] as number) & 0x7fffffff, w[1] as number), 0)).toMatchObject({
    x: 0,
    y: 3,
    z: 5,
    w: 2,
    h: 4,
    face: 2,
    material: 11,
    ao: 0xff,
  });
  // Flags: patch x in bits 18..22, patch z in 23..27, slab above the batch's lowest in 28..31.
  const flags = (i: number): number[] => {
    const b = w[i * 2 + 1] as number;
    return [(b >>> 18) & 31, (b >>> 23) & 31, b >>> 28];
  };
  expect(flags(0)).toEqual([0, 0, 0]);
  expect(flags(2)).toEqual([3, 7, 3]);

  // Placement: scaled by cell and step, origin lowered to the batch's lowest slab (slab -1 = 32 steps down).
  s.setOrigin(650, 0, -2022);
  expect(opaque.scale.toArray()).toEqual([4, 1, 4]);
  expect(opaque.position.toArray()).toEqual([18_432 - 650 * 32, 1 - 32, -67_584 + 2022 * 32]);
  expect(water.position.toArray()).toEqual(opaque.position.toArray());
  // The culling sphere covers the used patches and slabs: 4 x 8 patches of 128 m, 4 slabs of 32 m.
  const sphere = opaque.geometry.boundingSphere;
  if (sphere === null) throw new Error('batch has no bounding sphere');
  expect(sphere.center.toArray()).toEqual([64, 64, 128]);
  expect(sphere.radius * 4).toBeCloseTo(Math.hypot(4 * 128, 8 * 128, 4 * 32) / 2, 9);
});

test('batches replace by id, hide without freeing, and fail loudly on bad input', () => {
  const s = scene();
  s.setBatch('far.0.0', [{ px: 1, pz: 1, slab: 0, mesh: slabMesh(5, 0) }], { ...PLACE, cellM: 64, stepM: 4 });
  s.setBatch('far.0.0', [{ px: 1, pz: 1, slab: 0, mesh: slabMesh(2, 0) }], { ...PLACE, cellM: 64, stepM: 4 });
  expect(s.quadCount).toBe(2);
  expect(s.terrain.children.length).toBe(1);
  expect(s.isVisible('far.0.0')).toBe(true);
  expect(s.setVisible('far.0.0', false)).toBe(true);
  expect(s.setVisible('far.0.0', false)).toBe(false);
  expect(s.terrain.children[0]?.visible).toBe(false);
  expect(s.quadCount).toBe(2);
  // An empty batch is legal and draws nothing.
  s.setBatch('far.8.0', [], PLACE);
  expect(s.batchCount).toBe(2);
  expect(s.terrain.children.length).toBe(1);
  expect(s.removeBatch('far.0.0')).toBe(true);
  expect(s.removeBatch('far.0.0')).toBe(false);
  expect(s.quadCount).toBe(0);

  expect(() => s.setVisible('nope', true)).toThrow(/no batch "nope"/);
  expect(() => s.setBatch('bad', [{ px: 32, pz: 0, slab: 0, mesh: slabMesh(1, 0) }], PLACE)).toThrow(/patch \(32, 0\) is outside 0..31/);
  expect(() =>
    s.setBatch(
      'tall',
      [
        { px: 0, pz: 0, slab: 0, mesh: slabMesh(1, 0) },
        { px: 0, pz: 0, slab: 16, mesh: slabMesh(1, 0) },
      ],
      PLACE,
    ),
  ).toThrow(/spans slabs 0..16, more than 16/);
  expect(() => s.setBatch('nan', [], { ...PLACE, cellM: Number.NaN })).toThrow(/placement cellM is not finite/);
  expect(() => s.setBatch('', [], PLACE)).toThrow(/batch id must not be empty/);
});
