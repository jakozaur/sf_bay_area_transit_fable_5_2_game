import { AO_NONE, createRng, isOpaque, Material, type MeshOutput, nextInt, PADDED_VOLUME, paddedIndex, unpackQuad } from '@bayvox/core';
import { createNaiveScratch, naiveMeshChunk } from '@bayvox/testkit';
import { describe, expect, test } from 'vitest';
import { COLUMN_GRID_LENGTH, type ColumnMeshInput, columnIndex, columnSlabRange, meshColumnPatch, meshColumnSlab } from './mesh-columns.ts';
import { createMesherScratch } from './scratch.ts';
import { expectSameCells, FACE_CELLS, faceCellIndex, inputOf, quadCount, rasterize } from './test-helpers.ts';

const scratch = createMesherScratch();
const naiveScratch = createNaiveScratch();
/** Grid delta per side face id (+X, -X, -, -, +Z, -Z). */
const SIDES: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [1, -1, 0],
  [4, 0, 1],
  [5, 0, -1],
];

function patchFrom(height: (x: number, z: number) => number, cls: (x: number, z: number) => number, key = 5): ColumnMeshInput {
  const heights = new Int32Array(COLUMN_GRID_LENGTH);
  const classes = new Uint16Array(COLUMN_GRID_LENGTH);
  for (let z = -1; z <= 32; z++) {
    for (let x = -1; x <= 32; x++) {
      heights[columnIndex(x, z)] = height(x, z);
      classes[columnIndex(x, z)] = cls(x, z);
    }
  }
  return { key, size: 32, heights, classes };
}

/** Brute-force face cells of one slab, straight from the rules in the mesh-columns.ts header. */
function referenceSlab(input: ColumnMeshInput, slab: number): { opaque: Uint16Array; transparent: Uint16Array; faces: number } {
  const opaque = new Uint16Array(FACE_CELLS);
  const transparent = new Uint16Array(FACE_CELLS);
  let faces = 0;
  const y0 = slab * 32;
  for (let z = 0; z < 32; z++) {
    for (let x = 0; x < 32; x++) {
      const m = input.classes[columnIndex(x, z)] as number;
      if (m === Material.AIR) continue;
      const h = input.heights[columnIndex(x, z)] as number;
      const target = isOpaque(m) ? opaque : transparent;
      const top = h - 1 - y0;
      if (top >= 0 && top < 32) {
        target[faceCellIndex(2, x, top, z)] = m + 1;
        faces++;
      }
      for (const [face, dx, dz] of SIDES) {
        if (input.classes[columnIndex(x + dx, z + dz)] === Material.AIR) continue;
        const hn = input.heights[columnIndex(x + dx, z + dz)] as number;
        for (let y = Math.max(hn, y0); y < Math.min(h, y0 + 32); y++) {
          target[faceCellIndex(face, x, y - y0, z)] = m + 1;
          faces++;
        }
      }
    }
  }
  return { opaque, transparent, faces };
}

function checkSlab(input: ColumnMeshInput, slab: number, mesh: MeshOutput): number {
  expect(mesh.key).toBe(input.key);
  expect(mesh.faceOffsets[0]).toBe(0);
  expect(mesh.faceOffsets[6]).toBe(mesh.opaqueCount);
  for (let f = 0; f < 6; f++) {
    for (let i = mesh.faceOffsets[f] as number; i < (mesh.faceOffsets[f + 1] as number); i++) {
      const q = unpackQuad(mesh.quads, i);
      if (q.face !== f) throw new Error(`quad ${i} is in bucket ${f} but has face ${q.face}`);
    }
  }
  for (let i = 0; i < quadCount(mesh); i++) {
    const q = unpackQuad(mesh.quads, i);
    if (q.ao !== AO_NONE || q.face === 3) throw new Error(`column quad ${i} has AO or is a bottom face: ${JSON.stringify(q)}`);
  }
  const ref = referenceSlab(input, slab);
  expectSameCells(rasterize(mesh, 0, mesh.opaqueCount), ref.opaque, `slab ${slab} opaque`);
  expectSameCells(rasterize(mesh, mesh.opaqueCount, quadCount(mesh)), ref.transparent, `slab ${slab} transparent`);
  return ref.faces;
}

/** Checks every slab of the patch (plus one empty slab on each side) and returns totals. */
function checkPatch(input: ColumnMeshInput): { quads: number; faces: number; slabs: number[] } {
  const result = meshColumnPatch(input, scratch);
  const range = columnSlabRange(input);
  const bySlab = new Map(result.map((r) => [r.slab, r.mesh]));
  let quads = 0;
  let faces = 0;
  if (range === undefined) {
    expect(result).toEqual([]);
    return { quads, faces, slabs: [] };
  }
  for (let slab = range.first - 1; slab <= range.end; slab++) {
    const direct = meshColumnSlab(input, slab, scratch);
    const fromPatch = bySlab.get(slab);
    if (fromPatch === undefined) expect(direct.quads.length).toBe(0);
    else expect(direct).toEqual(fromPatch);
    faces += checkSlab(input, slab, direct);
    quads += quadCount(direct);
  }
  // Slab range is tight: geometry in the first and the last slab.
  expect(bySlab.has(range.first)).toBe(true);
  expect(bySlab.has(range.end - 1)).toBe(true);
  expect(result.map((r) => r.slab)).toEqual([...bySlab.keys()].sort((a, b) => a - b));
  return { quads, faces, slabs: result.map((r) => r.slab) };
}

describe('column mesher', () => {
  test('flat plain is one top quad', () => {
    const input = patchFrom(
      () => 5,
      () => Material.GRASS,
    );
    const { quads, slabs } = checkPatch(input);
    expect(quads).toBe(1);
    expect(slabs).toEqual([0]);
    const mesh = meshColumnSlab(input, 0, scratch);
    expect(unpackQuad(mesh.quads, 0)).toEqual({ x: 0, y: 4, z: 0, w: 32, h: 32, face: 2, material: Material.GRASS, ao: AO_NONE, flags: 0 });
    expect(Array.from(mesh.faceOffsets)).toEqual([0, 0, 0, 1, 1, 1, 1]);
  });

  test('one raised column: top plus four merged sides', () => {
    const input = patchFrom(
      (x, z) => (x === 10 && z === 20 ? 9 : 2),
      (x, z) => (x === 10 && z === 20 ? Material.BUILDING_TOWER : Material.ROAD),
    );
    const mesh = meshColumnSlab(input, 0, scratch);
    checkSlab(input, 0, mesh);
    const tower = [];
    for (let i = 0; i < quadCount(mesh); i++) {
      const q = unpackQuad(mesh.quads, i);
      if (q.material === Material.BUILDING_TOWER) tower.push(q);
    }
    expect(tower.map((q) => q.face)).toEqual([0, 1, 2, 4, 5]);
    for (const q of tower) {
      expect([q.x, q.z]).toEqual([10, 20]);
      if (q.face === 2) expect([q.y, q.w, q.h]).toEqual([8, 1, 1]);
      else expect([q.y, q.w * q.h]).toEqual([2, 7]);
    }
  });

  test('negative and tall heights split into slabs', () => {
    // A ramp from -40 to +52 along x: spans slabs -2..1.
    const input = patchFrom(
      (x) => x * 3 - 40,
      () => Material.ROCK,
    );
    const { slabs, quads, faces } = checkPatch(input);
    expect(slabs).toEqual([-2, -1, 0, 1]);
    expect(columnSlabRange(input)).toEqual({ first: -2, end: 2 });
    expect(quads).toBeLessThan(faces / 10);
  });

  test('border lower than the patch makes a skirt, equal border makes none', () => {
    const inside = (x: number, z: number): boolean => x >= 0 && x < 32 && z >= 0 && z < 32;
    const skirt = patchFrom(
      (x, z) => (inside(x, z) ? 10 : 4),
      () => Material.GRASS,
    );
    const { quads } = checkPatch(skirt);
    expect(quads).toBe(5);
    expect(
      checkPatch(
        patchFrom(
          () => 10,
          () => Material.GRASS,
        ),
      ).quads,
    ).toBe(1);
  });

  test('holes emit nothing and suppress neighbour sides', () => {
    const hole = (x: number, z: number): boolean => x >= 8 && x < 16 && z >= 8 && z < 16;
    const input = patchFrom(
      (x, z) => (hole(x, z) ? -100 : 6),
      (x, z) => (hole(x, z) ? Material.AIR : Material.GRASS),
    );
    const { faces, slabs } = checkPatch(input);
    expect(faces).toBe(32 * 32 - 64);
    expect(slabs).toEqual([0]);
    const allHoles = patchFrom(
      () => 3,
      () => Material.AIR,
    );
    expect(columnSlabRange(allHoles)).toBeUndefined();
    expect(meshColumnPatch(allHoles, scratch)).toEqual([]);
  });

  test('water columns go to the transparent range', () => {
    // Land at 6 for x >= 16, water surface at 1 for x < 16.
    const input = patchFrom(
      (x) => (x < 16 ? 1 : 6),
      (x) => (x < 16 ? Material.WATER : Material.GRASS),
    );
    checkPatch(input);
    const mesh = meshColumnSlab(input, 0, scratch);
    expect(mesh.opaqueCount).toBe(2);
    expect(quadCount(mesh)).toBe(3);
    expect(unpackQuad(mesh.quads, 2)).toEqual({ x: 0, y: 0, z: 0, w: 32, h: 16, face: 2, material: Material.WATER, ao: AO_NONE, flags: 0 });
    // The shore wall: -X side of the x = 16 columns, from the water surface up.
    expect(unpackQuad(mesh.quads, 0)).toEqual({ x: 16, y: 1, z: 0, w: 5, h: 32, face: 1, material: Material.GRASS, ao: AO_NONE, flags: 0 });
  });

  test.each([1, 2, 3, 4])('random heights and classes, seed %i', (seed) => {
    const rng = createRng(seed);
    const classes = [Material.GRASS, Material.ROCK, Material.ROAD, Material.WATER, Material.BUILDING_CIVIC, Material.AIR];
    const span = seed * 25;
    const input = patchFrom(
      () => nextInt(rng, span) - 20,
      () => classes[nextInt(rng, seed === 1 ? 3 : classes.length)] as number,
    );
    const { quads, faces } = checkPatch(input);
    expect(quads).toBeLessThanOrEqual(faces);
    expect(quads).toBeGreaterThan(0);
  });

  test('opaque patch equals the naive voxel mesher on the voxelized columns', () => {
    const rng = createRng(9);
    const mats = [Material.GRASS, Material.ROCK, Material.BUILDING_COMMERCIAL];
    const input = patchFrom(
      () => 4 + nextInt(rng, 24),
      () => mats[nextInt(rng, 3)] as number,
    );
    const padded = new Uint16Array(PADDED_VOLUME);
    for (let z = -1; z <= 32; z++) {
      for (let x = -1; x <= 32; x++) {
        const h = input.heights[columnIndex(x, z)] as number;
        for (let y = -1; y < h; y++) padded[paddedIndex(x, y, z)] = input.classes[columnIndex(x, z)] as number;
      }
    }
    const naive = naiveMeshChunk(inputOf(padded), naiveScratch);
    const mesh = meshColumnSlab(input, 0, scratch);
    expectSameCells(rasterize(mesh, 0, quadCount(mesh)), rasterize(naive, 0, quadCount(naive)), 'columns vs naive voxels');
  });

  test('deterministic and independent of earlier scratch use', () => {
    const rng = createRng(77);
    const a = patchFrom(
      () => nextInt(rng, 40),
      () => (nextInt(rng, 2) === 0 ? Material.GRASS : Material.WATER),
    );
    const b = patchFrom(
      () => 31,
      () => Material.ROCK,
    );
    const first = meshColumnPatch(a, scratch);
    meshColumnPatch(b, scratch);
    expect(meshColumnPatch(a, scratch)).toEqual(first);
    expect(meshColumnPatch(a, createMesherScratch())).toEqual(first);
  });

  test('rejects bad input with a diagnostic naming it', () => {
    const good = patchFrom(
      () => 1,
      () => Material.GRASS,
    );
    expect(() => meshColumnSlab({ ...good, size: 64 }, 0, scratch)).toThrow('meshColumnSlab: size must be 32, got 64');
    expect(() => meshColumnSlab({ ...good, heights: new Int16Array(4) }, 0, scratch)).toThrow('heights must have 1156 entries, got 4');
    expect(() => meshColumnSlab(good, 0.5, scratch)).toThrow('slab must be an integer, got 0.5');
    const bad = patchFrom(
      () => 1,
      (x, z) => (x === 3 && z === -1 ? 700 : Material.GRASS),
    );
    expect(() => meshColumnPatch(bad, scratch)).toThrow('unknown material id 700 at column (3, -1)');
    const sentinel = patchFrom(
      (x, z) => (x === 0 && z === 0 ? -32768 : 10),
      () => Material.GRASS,
      91,
    );
    expect(() => meshColumnPatch(sentinel, scratch)).toThrow('columnSlabRange: patch 91 spans y -32769..9, more than 256 slabs');
  });
});
