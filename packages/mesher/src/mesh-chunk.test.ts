import { AO_NONE, CHUNK_SIZE, Material, type MeshOutput, PADDED_VOLUME, packChunkKey, paddedIndex, unpackQuad } from '@bayvox/core';
import { createNaiveScratch, createSyntheticWorld, MemoryWorldStore, naiveMeshChunk } from '@bayvox/testkit';
import { describe, expect, test } from 'vitest';
import { meshChunk, meshChunkFlat } from './mesh-chunk.ts';
import { createMesherScratch, MAX_MESHER_QUADS } from './scratch.ts';
import { expectSameCells, inputOf, paddedFrom, quadCount, randomPadded, rasterize, referenceAo, referenceCells } from './test-helpers.ts';

const scratch = createMesherScratch();
const naiveScratch = createNaiveScratch();
const N = CHUNK_SIZE;
const unpack = unpackQuad;
const SOLIDS = [Material.FILL, Material.ROCK, Material.BAY_MUD, Material.BUILDING_TOWER];

/** Structural invariants plus exact face coverage against the brute-force reference. Returns the face count. */
function checkAgainstReference(padded: Uint16Array, mesh: MeshOutput): number {
  const total = quadCount(mesh);
  expect(mesh.quads.length % 2).toBe(0);
  expect(mesh.faceOffsets.length).toBe(7);
  expect(mesh.faceOffsets[0]).toBe(0);
  expect(mesh.faceOffsets[6]).toBe(mesh.opaqueCount);
  expect(mesh.opaqueCount).toBeLessThanOrEqual(total);
  for (let f = 0; f < 6; f++) {
    const from = mesh.faceOffsets[f] as number;
    const to = mesh.faceOffsets[f + 1] as number;
    expect(to).toBeGreaterThanOrEqual(from);
    for (let i = from; i < to; i++) {
      if (unpackQuad(mesh.quads, i).face !== f) throw new Error(`quad ${i} is in bucket ${f} but has another face`);
    }
  }
  const ref = referenceCells(padded);
  // rasterize throws on out-of-bounds and overlapping quads, so equality means exact coverage.
  expectSameCells(rasterize(mesh, 0, mesh.opaqueCount), ref.opaque, 'opaque vs reference');
  expectSameCells(rasterize(mesh, mesh.opaqueCount, total), ref.transparent, 'transparent vs reference');
  return ref.faces;
}

/** Every voxel face covered by a quad must have exactly the quad's AO at its own corners. */
function checkAo(padded: Uint16Array, mesh: MeshOutput): void {
  for (let i = 0; i < quadCount(mesh); i++) {
    const q = unpack(mesh.quads, i);
    if (i >= mesh.opaqueCount) {
      if (q.ao !== AO_NONE) throw new Error(`transparent quad ${i} has ao ${q.ao}`);
      continue;
    }
    const d = q.face >> 1;
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    for (let dv = 0; dv < q.h; dv++) {
      for (let du = 0; du < q.w; du++) {
        const p = [q.x, q.y, q.z];
        p[u] = (p[u] as number) + du;
        p[v] = (p[v] as number) + dv;
        const want = referenceAo(padded, q.face, p[0] as number, p[1] as number, p[2] as number);
        if (want !== q.ao) throw new Error(`quad ${i} ${JSON.stringify(q)}: cell (${p.join(', ')}) needs ao ${want}`);
      }
    }
  }
}

function checkAll(padded: Uint16Array): { ao: MeshOutput; flat: MeshOutput; faces: number } {
  const ao = meshChunk(inputOf(padded), scratch);
  const flat = meshChunkFlat(inputOf(padded), scratch);
  const faces = checkAgainstReference(padded, ao);
  checkAgainstReference(padded, flat);
  checkAo(padded, ao);
  for (let i = 0; i < quadCount(flat); i++) {
    if (unpackQuad(flat.quads, i).ao !== AO_NONE) throw new Error(`flat quad ${i} carries AO`);
  }
  expect(quadCount(flat)).toBeLessThanOrEqual(quadCount(ao));
  expect(quadCount(ao)).toBeLessThanOrEqual(faces);
  return { ao, flat, faces };
}

/** Face coverage per bucket must also match the naive mesher from testkit (the shared oracle). */
function checkAgainstNaive(padded: Uint16Array, mesh: MeshOutput): void {
  const naive = naiveMeshChunk(inputOf(padded), naiveScratch);
  expectSameCells(rasterize(mesh, 0, mesh.opaqueCount), rasterize(naive, 0, naive.opaqueCount), 'opaque vs naive');
  expectSameCells(
    rasterize(mesh, mesh.opaqueCount, quadCount(mesh)),
    rasterize(naive, naive.opaqueCount, quadCount(naive)),
    'transparent vs naive',
  );
  for (let f = 0; f < 6; f++) {
    const area = (m: MeshOutput): number => {
      let a = 0;
      for (let i = m.faceOffsets[f] as number; i < (m.faceOffsets[f + 1] as number); i++) {
        const q = unpackQuad(m.quads, i);
        a += q.w * q.h;
      }
      return a;
    };
    expect(area(mesh)).toBe(area(naive));
  }
}

describe('meshChunk: known shapes', () => {
  test('empty chunk gives an empty mesh', () => {
    const m = meshChunk(inputOf(new Uint16Array(PADDED_VOLUME), 42), scratch);
    expect(m.quads.length).toBe(0);
    expect(m.opaqueCount).toBe(0);
    expect(Array.from(m.faceOffsets)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(m.key).toBe(42);
  });

  test('empty chunk with solid neighbours gives an empty mesh', () => {
    const padded = paddedFrom((x, y, z) => (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N ? Material.ROCK : Material.AIR));
    expect(meshChunk(inputOf(padded), scratch).quads.length).toBe(0);
  });

  test('single voxel gives 6 unit quads, one per face bucket', () => {
    const padded = new Uint16Array(PADDED_VOLUME);
    padded[paddedIndex(3, 4, 5)] = Material.ROCK;
    const m = meshChunk(inputOf(padded), scratch);
    expect(Array.from(m.faceOffsets)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (let f = 0; f < 6; f++) {
      expect(unpackQuad(m.quads, f)).toEqual({ x: 3, y: 4, z: 5, w: 1, h: 1, face: f, material: Material.ROCK, ao: AO_NONE, flags: 0 });
    }
  });

  test('solid chunk in air merges to 6 quads of 32 x 32', () => {
    const padded = paddedFrom((x, y, z) => (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N ? Material.AIR : Material.ROCK));
    const { ao, flat } = checkAll(padded);
    checkAgainstNaive(padded, ao);
    for (const m of [ao, flat]) {
      expect(quadCount(m)).toBe(6);
      for (let f = 0; f < 6; f++) {
        const q = unpackQuad(m.quads, f);
        expect([q.w, q.h, q.face, q.ao]).toEqual([32, 32, f, AO_NONE]);
        const d = f >> 1;
        const min = [q.x, q.y, q.z];
        expect(min[d]).toBe((f & 1) === 0 ? 31 : 0);
        expect(min[(d + 1) % 3]).toBe(0);
        expect(min[(d + 2) % 3]).toBe(0);
      }
    }
  });

  test('solid chunk inside solid neighbours has no faces (padding seams)', () => {
    const padded = new Uint16Array(PADDED_VOLUME).fill(Material.ROCK);
    expect(meshChunk(inputOf(padded), scratch).quads.length).toBe(0);
    // Removing the +X neighbour exposes exactly that side.
    const open = paddedFrom((x) => (x >= N ? Material.AIR : Material.ROCK));
    const m = meshChunk(inputOf(open), scratch);
    expect(quadCount(m)).toBe(1);
    expect(unpackQuad(m.quads, 0)).toEqual({ x: 31, y: 0, z: 0, w: 32, h: 32, face: 0, material: Material.ROCK, ao: AO_NONE, flags: 0 });
  });

  test('materials split quads', () => {
    const padded = paddedFrom((x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return Material.AIR;
      return y < 16 ? Material.ROCK : Material.FILL;
    });
    const { flat } = checkAll(padded);
    // Top and bottom: 1 each. Each of the 4 sides: 2 (one per material).
    expect(quadCount(flat)).toBe(10);
  });

  test('3D checkerboard does not merge and matches the naive mesher', () => {
    const padded = paddedFrom((x, y, z) => (((x + y + z) & 1) === 0 ? Material.ROCK : Material.AIR));
    const { ao, flat, faces } = checkAll(padded);
    checkAgainstNaive(padded, ao);
    expect(faces).toBe(16384 * 6);
    expect(quadCount(ao)).toBe(faces);
    expect(quadCount(flat)).toBe(faces);
  });

  test('opaque/water checkerboard in air reaches the mesher bound without overflow', () => {
    const padded = paddedFrom((x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return Material.AIR;
      return ((x + y + z) & 1) === 0 ? Material.ROCK : Material.WATER;
    });
    const { ao, faces } = checkAll(padded);
    expect(faces).toBe(MAX_MESHER_QUADS);
    expect(quadCount(ao)).toBe(MAX_MESHER_QUADS);
  });

  test('water faces air only, opaque faces water, water quads follow opaqueCount', () => {
    // Rock floor y < 8, water 8 <= y < 16, air above; neighbours continue the same layers.
    const padded = paddedFrom((_x, y) => (y < 8 ? Material.ROCK : y < 16 ? Material.WATER : Material.AIR));
    const { ao } = checkAll(padded);
    checkAgainstNaive(padded, ao);
    expect(quadCount(ao)).toBe(2);
    expect(ao.opaqueCount).toBe(1);
    expect(unpackQuad(ao.quads, 0)).toEqual({ x: 0, y: 7, z: 0, w: 32, h: 32, face: 2, material: Material.ROCK, ao: AO_NONE, flags: 0 });
    expect(unpackQuad(ao.quads, 1)).toEqual({ x: 0, y: 15, z: 0, w: 32, h: 32, face: 2, material: Material.WATER, ao: AO_NONE, flags: 0 });
  });
});

describe('meshChunk: ambient occlusion', () => {
  test('a block on a floor darkens the floor corners that touch it', () => {
    const padded = paddedFrom((x, y, z) => (y === 0 || (x === 5 && y === 1 && z === 5) ? Material.ROCK : Material.AIR));
    const { ao, flat } = checkAll(padded);
    const aoAt = (x: number, z: number): number => {
      for (let i = ao.faceOffsets[2] as number; i < (ao.faceOffsets[3] as number); i++) {
        const q = unpackQuad(ao.quads, i);
        // +Y quads: u = z (extent w), v = x (extent h).
        if (q.y === 0 && z >= q.z && z < q.z + q.w && x >= q.x && x < q.x + q.h) return q.ao;
      }
      throw new Error(`no floor quad covers (${x}, ${z})`);
    };
    // Floor cell west of the block: the block is on its +x (= +v) side, so both v1 corners drop to 2.
    expect(aoAt(4, 5)).toBe(3 | (3 << 2) | (2 << 4) | (2 << 6));
    // Cell north of it (block on +z = +u side): both u1 corners drop to 2.
    expect(aoAt(5, 4)).toBe(3 | (2 << 2) | (3 << 4) | (2 << 6));
    // Diagonal cell: only the (u1, v1) corner sees the block.
    expect(aoAt(4, 4)).toBe(3 | (3 << 2) | (3 << 4) | (2 << 6));
    expect(aoAt(20, 20)).toBe(AO_NONE);
    // AO costs quads here: the flat mesh needs fewer.
    expect(quadCount(flat)).toBeLessThan(quadCount(ao));
  });

  test('inside corner: both sides solid gives level 0', () => {
    // Floor plus two walls meeting at the x = 0, z = 0 corner.
    const padded = paddedFrom((x, y, z) => (y === 0 || x === 0 || z === 0 ? Material.ROCK : Material.AIR));
    const { ao } = checkAll(padded);
    let found = false;
    for (let i = ao.faceOffsets[2] as number; i < (ao.faceOffsets[3] as number); i++) {
      const q = unpackQuad(ao.quads, i);
      if (q.x === 1 && q.y === 0 && q.z === 1) {
        expect(q.ao & 3).toBe(0);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('meshChunk: reference comparison', () => {
  test.each([
    [0.02, 1],
    [0.1, 2],
    [0.5, 3],
    [0.9, 4],
    [0.98, 5],
  ])('random opaque voxels, fill %f', (fill, seed) => {
    const padded = randomPadded(seed, fill, SOLIDS);
    const { ao } = checkAll(padded);
    checkAgainstNaive(padded, ao);
  });

  test.each([
    [0.3, 11],
    [0.7, 12],
    [0.95, 13],
  ])('random voxels with water, fill %f', (fill, seed) => {
    const padded = randomPadded(seed, fill, [...SOLIDS, Material.WATER, Material.WATER]);
    const { ao } = checkAll(padded);
    checkAgainstNaive(padded, ao);
  });

  test('blobby random volume (large merged quads with AO)', () => {
    // Low-frequency pattern: 4^3 cells, so quads merge and AO edges are common.
    const cells = randomPadded(21, 0.5, SOLIDS);
    const padded = paddedFrom((x, y, z) => cells[paddedIndex((x + 1) >> 2, (y + 1) >> 2, (z + 1) >> 2)] as number);
    const { ao, faces } = checkAll(padded);
    checkAgainstNaive(padded, ao);
    expect(quadCount(ao)).toBeLessThan(faces / 2);
  });

  test('every chunk of a synthetic heightmap world', () => {
    const world = createSyntheticWorld({ seed: 3, sizeChunks: 3 });
    const padded = new Uint16Array(PADDED_VOLUME);
    let chunks = 0;
    let faces = 0;
    let quads = 0;
    let water = 0;
    for (const key of world.store.chunkKeys()) {
      world.store.paddedCopy(key, padded);
      const r = checkAll(padded);
      checkAgainstNaive(padded, r.ao);
      expect(r.ao.key).toBe(7);
      chunks++;
      faces += r.faces;
      quads += quadCount(r.ao);
      water += quadCount(r.ao) - r.ao.opaqueCount;
    }
    expect(chunks).toBeGreaterThan(9);
    expect(water).toBeGreaterThan(0);
    expect(quads).toBeLessThan(faces / 2);
  });

  test('tunnel carved through layered ground', () => {
    const store = new MemoryWorldStore();
    store.applyEdit({ t: 'fillBox', min: { x: -32, y: -32, z: -32 }, max: { x: 64, y: 20, z: 64 }, material: Material.BAY_MUD });
    store.applyEdit({ t: 'fillBox', min: { x: -32, y: -32, z: -32 }, max: { x: 64, y: 8, z: 64 }, material: Material.ROCK });
    store.applyEdit({ t: 'carveCapsule', a: { x: -10, y: 10, z: 16 }, b: { x: 50, y: 12, z: 16 }, radius: 3.5 });
    const padded = new Uint16Array(PADDED_VOLUME);
    store.paddedCopy(packChunkKey(0, 0, 0), padded);
    const { ao } = checkAll(padded);
    checkAgainstNaive(padded, ao);
    expect(quadCount(ao)).toBeGreaterThan(0);
  });
});

describe('meshChunk: contract', () => {
  test('deterministic, and independent of what the scratch meshed before', () => {
    const a = randomPadded(31, 0.4, [...SOLIDS, Material.WATER]);
    const b = randomPadded(32, 0.8, SOLIDS);
    const first = meshChunk(inputOf(a), scratch);
    meshChunk(inputOf(b), scratch);
    const second = meshChunk(inputOf(a), scratch);
    const fresh = meshChunk(inputOf(a), createMesherScratch());
    expect(second).toEqual(first);
    expect(fresh).toEqual(first);
    // The result is an exact-size copy, not a view of the scratch.
    expect(first.quads.buffer).not.toBe(scratch.quads.buffer);
    expect(first.quads.byteLength).toBe(first.quads.buffer.byteLength);
  });

  test('does not modify its input', () => {
    const a = randomPadded(33, 0.5, SOLIDS);
    const copy = a.slice();
    meshChunk(inputOf(a), scratch);
    expect(a).toEqual(copy);
  });

  test('rejects bad input with a diagnostic naming it', () => {
    const padded = new Uint16Array(PADDED_VOLUME);
    expect(() => meshChunk({ key: 1, size: 16, padded }, scratch)).toThrow('meshChunk: size must be 32, got 16');
    expect(() => meshChunk({ key: 1, size: 32, padded: new Uint16Array(10) }, scratch)).toThrow('padded must have 39304 entries, got 10');
    expect(() => meshChunk(inputOf(padded), createNaiveScratch())).toThrow('scratch too small');
    padded[paddedIndex(32, 3, -1)] = 999;
    expect(() => meshChunk(inputOf(padded), scratch)).toThrow('meshChunk: unknown material id 999 at chunk-local (32, 3, -1)');
  });
});
