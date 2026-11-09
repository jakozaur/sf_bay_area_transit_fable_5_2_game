import {
  CHUNK_VOLUME,
  type ChunkKey,
  ColumnUnit,
  chunkKeyOfVoxel,
  createRng,
  Material,
  nextFloat,
  nextInt,
  PADDED_VOLUME,
  packChunkKey,
  packColumnClass,
  paddedIndex,
  type Rng,
  VOXEL_SIZE_M,
  type WorldEdit,
} from '@bayvox/core';
import { MemoryWorldStore } from '@bayvox/testkit';
import { describe, expect, test } from 'vitest';
import { ChunkWorldStore, DEFAULT_VOXEL_SIZE_M } from './chunk-store.ts';
import type { ColumnSample, ColumnSource } from './column-source.ts';
import { SyntheticColumnSource } from './synthetic-source.ts';

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

function setOne(store: { applyEdit(e: WorldEdit): ChunkKey[] }, x: number, y: number, z: number, material: number): ChunkKey[] {
  return store.applyEdit({ t: 'setVoxels', coords: Int32Array.of(x, y, z), materials: Uint16Array.of(material) });
}

/** A flat world: ground up to surfaceM, optional water plane. */
function flatSource(surfaceM: number, waterLevelM = Number.NEGATIVE_INFINITY, surfaceMaterial = 0): ColumnSource {
  return {
    sampleColumn(_xM: number, _zM: number, out: ColumnSample): void {
      out.surfaceM = surfaceM;
      out.surfaceMaterial = surfaceMaterial;
      out.columnClass = 0;
      out.buildingMaterial = 0;
      out.buildingBaseM = 0;
      out.buildingTopM = 0;
      out.waterLevelM = waterLevelM;
    },
  };
}

const rockOnly = (): number => Material.ROCK;

describe('voxel access', () => {
  test('defaults to the core voxel size (1 m) and an all-AIR world without a source', () => {
    const store = new ChunkWorldStore();
    expect(DEFAULT_VOXEL_SIZE_M).toBe(VOXEL_SIZE_M);
    expect(store.voxelSizeM).toBe(1);
    expect(store.getVoxel({ x: 5, y: -70, z: 123456 })).toBe(Material.AIR);
    expect(new ChunkWorldStore({ voxelSizeM: 1 }).voxelSizeM).toBe(1);
    expect(() => new ChunkWorldStore({ voxelSizeM: 0 })).toThrow(/voxelSizeM must be finite and > 0, got 0/);
  });

  test('set and get round trip across chunk borders and negative coordinates', () => {
    const store = new ChunkWorldStore();
    const coords: number[] = [];
    const materials: number[] = [];
    let m = 2;
    for (const x of [-65, -33, -32, -1, 0, 1, 31, 32, 63, 64]) {
      for (const y of [-33, -32, -1, 0, 31, 32]) {
        for (const z of [-2147483648 + 1, -100000, -32, -1, 0, 31, 32]) {
          if (z < -200000) continue; // far outside the key range, checked separately below
          coords.push(x, y, z);
          materials.push(m);
          m = m === 18 ? 2 : m + 1;
        }
      }
    }
    store.applyEdit({ t: 'setVoxels', coords: Int32Array.from(coords), materials: Uint16Array.from(materials) });
    for (let i = 0; i < materials.length; i++) {
      const c = { x: coords[i * 3] as number, y: coords[i * 3 + 1] as number, z: coords[i * 3 + 2] as number };
      expect(store.getVoxel(c), `voxel ${c.x},${c.y},${c.z}`).toBe(materials[i]);
    }
    // Neighbours of written voxels stay AIR.
    expect(store.get(-34, -34, -33)).toBe(Material.AIR);
    expect(store.get(2, 1, 1)).toBe(Material.AIR);
    expect(store.lastEditVoxelsChanged).toBe(materials.length);
  });

  test('rejects non-integer coordinates and space outside the chunk key range, naming the input', () => {
    const store = new ChunkWorldStore();
    expect(() => store.get(0.5, 0, 0)).toThrow(/int32 voxel coordinate, got \(0.5, 0, 0\)/);
    expect(() => store.get(0, 5000, 0)).toThrow(/out of range/);
    expect(() => setOne(store, 0, 4096, 0, 7)).toThrow(/setVoxels reaches \(0, 4096, 0\)/);
    expect(() => store.applyEdit({ t: 'fillBox', ...box(0, 0, 0, 4, 4, 4), material: 70000 })).toThrow(
      /material id out of u16 range: 70000/,
    );
    expect(() => store.applyEdit({ t: 'carveCapsule', a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, radius: -1 })).toThrow(
      /radius must be finite and >= 0, got -1/,
    );
    expect(() => store.applyEdit({ t: 'setVoxels', coords: Int32Array.of(1, 2), materials: Uint16Array.of(1) })).toThrow(
      /3 coords per material/,
    );
  });

  test('a rejected edit changes nothing and is not logged', () => {
    const store = new ChunkWorldStore();
    const before = store.hashRegion(box(0, 0, 0, 64, 64, 64));
    // The second voxel is outside the world: the first must not be written.
    expect(() => store.applyEdit({ t: 'setVoxels', coords: Int32Array.of(1, 1, 1, 0, 9999, 0), materials: Uint16Array.of(7, 7) })).toThrow(
      RangeError,
    );
    expect(store.get(1, 1, 1)).toBe(Material.AIR);
    expect(store.hashRegion(box(0, 0, 0, 64, 64, 64))).toBe(before);
    expect(store.editLog).toHaveLength(0);
  });
});

describe('palette and uniform elision', () => {
  test('untouched and all-AIR chunks have no indices', () => {
    const store = new ChunkWorldStore();
    const chunk = store.getChunk(packChunkKey(3, -2, 1));
    expect(chunk.indices).toBeNull();
    expect([...chunk.palette]).toEqual([Material.AIR]);
    expect(chunk.key).toBe(packChunkKey(3, -2, 1));
  });

  test('palette grows with new materials: Uint8Array up to 256 entries, Uint16Array beyond', () => {
    const store = new ChunkWorldStore();
    const key = chunkKeyOfVoxel(-32, 0, 0);
    setOne(store, -32, 0, 0, 500);
    let chunk = store.getChunk(key);
    expect([...chunk.palette]).toEqual([Material.AIR, 500]);
    expect(chunk.indices).toBeInstanceOf(Uint8Array);
    expect(chunk.indices).toHaveLength(CHUNK_VOLUME);

    // 255 distinct materials plus AIR = 256 palette entries: still one byte per voxel.
    const n = 300;
    const coords = new Int32Array(n * 3);
    const materials = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      coords[i * 3] = -32 + (i % 32);
      coords[i * 3 + 1] = Math.floor(i / 32);
      coords[i * 3 + 2] = 5;
      materials[i] = 1000 + i;
    }
    store.applyEdit({ t: 'setVoxels', coords: coords.subarray(0, 254 * 3), materials: materials.subarray(0, 254) });
    chunk = store.getChunk(key);
    expect(chunk.palette).toHaveLength(256);
    expect(chunk.indices).toBeInstanceOf(Uint8Array);

    store.applyEdit({ t: 'setVoxels', coords, materials });
    chunk = store.getChunk(key);
    expect(chunk.palette).toHaveLength(302);
    expect(chunk.indices).toBeInstanceOf(Uint16Array);
    for (let i = 0; i < n; i++) {
      expect(store.get(coords[i * 3] as number, coords[i * 3 + 1] as number, 5)).toBe(1000 + i);
    }
    expect(store.get(-32, 0, 0)).toBe(500);
    expect(store.get(-1, 31, 31)).toBe(Material.AIR);
  });

  test('a chunk filled whole becomes uniform again, also when the fill arrives in pieces', () => {
    const store = new ChunkWorldStore();
    const key = chunkKeyOfVoxel(32, 32, 32);
    store.applyEdit({ t: 'fillBox', ...box(32, 32, 32, 64, 64, 64), material: Material.ROCK });
    expect(store.getChunk(key).indices).toBeNull();
    expect([...store.getChunk(key).palette]).toEqual([Material.ROCK]);
    expect(store.lastEditVoxelsChanged).toBe(CHUNK_VOLUME);

    store.applyEdit({ t: 'fillBox', ...box(32, 32, 32, 64, 48, 64), material: Material.SAND });
    expect(store.getChunk(key).indices).not.toBeNull();
    expect(store.lastEditVoxelsChanged).toBe(CHUNK_VOLUME / 2);
    store.applyEdit({ t: 'fillBox', ...box(32, 48, 32, 64, 64, 64), material: Material.SAND });
    expect(store.getChunk(key).indices).toBeNull();
    expect([...store.getChunk(key).palette]).toEqual([Material.SAND]);

    // Carving everything out returns it to uniform AIR.
    store.applyEdit({ t: 'carveCapsule', a: { x: 48, y: 48, z: 48 }, b: { x: 48, y: 48, z: 48 }, radius: 40 });
    expect(store.getChunk(key).indices).toBeNull();
    expect([...store.getChunk(key).palette]).toEqual([Material.AIR]);
  });

  test('generated chunks are uniform where the terrain is: sky and deep single-material ground', () => {
    const store = new ChunkWorldStore({ voxelSizeM: 1, source: flatSource(10), materialAt: rockOnly });
    expect(store.getChunk(packChunkKey(0, 2, 0)).indices).toBeNull(); // sky
    expect([...store.getChunk(packChunkKey(0, 2, 0)).palette]).toEqual([Material.AIR]);
    expect(store.getChunk(packChunkKey(0, -1, 0)).indices).toBeNull(); // rock
    expect([...store.getChunk(packChunkKey(0, -1, 0)).palette]).toEqual([Material.ROCK]);
    const surface = store.getChunk(packChunkKey(0, 0, 0));
    expect(surface.indices).toBeInstanceOf(Uint8Array);
    expect([...surface.palette].sort()).toEqual([Material.AIR, Material.ROCK]);
  });
});

describe('dirty chunk reporting', () => {
  const k = packChunkKey;

  test('interior voxel dirties one chunk, face two, edge four, corner eight', () => {
    const store = new ChunkWorldStore();
    expect(setOne(store, 5, 6, 7, 7)).toEqual([k(0, 0, 0)]);
    expect(setOne(store, 31, 6, 7, 7)).toEqual([k(0, 0, 0), k(1, 0, 0)]);
    expect(setOne(store, 5, 0, 7, 7)).toEqual([k(0, -1, 0), k(0, 0, 0)]);
    expect(setOne(store, 5, 6, 32, 7)).toEqual([k(0, 0, 0), k(0, 0, 1)]);
    expect(setOne(store, 0, 31, 9, 7)).toEqual([k(-1, 0, 0), k(-1, 1, 0), k(0, 0, 0), k(0, 1, 0)].sort((a, b) => a - b));
    const corner = setOne(store, -32, -32, -32, 7);
    expect(corner).toHaveLength(8);
    expect(corner).toEqual(
      [k(-2, -2, -2), k(-2, -2, -1), k(-2, -1, -2), k(-2, -1, -1), k(-1, -2, -2), k(-1, -2, -1), k(-1, -1, -2), k(-1, -1, -1)].sort(
        (a, b) => a - b,
      ),
    );
  });

  test('an edit that changes nothing reports nothing, notifies nobody and is not logged', () => {
    const store = new ChunkWorldStore();
    setOne(store, 31, 31, 31, 7);
    let calls = 0;
    store.onDirty(() => calls++);
    expect(setOne(store, 31, 31, 31, 7)).toEqual([]);
    expect(store.applyEdit({ t: 'fillBox', ...box(100, 100, 100, 140, 140, 140), material: Material.AIR })).toEqual([]);
    expect(store.applyEdit({ t: 'fillBox', ...box(5, 5, 5, 5, 9, 9), material: Material.ROCK })).toEqual([]); // empty box
    expect(calls).toBe(0);
    expect(store.lastEditVoxelsChanged).toBe(0);
    expect(store.editLog).toHaveLength(1);
  });

  test('only the borders that actually changed dirty a neighbour', () => {
    const store = new ChunkWorldStore();
    store.applyEdit({ t: 'fillBox', ...box(0, 0, 0, 32, 32, 32), material: Material.ROCK });
    // Stops one voxel short of the x = 31 face.
    expect(store.applyEdit({ t: 'fillBox', ...box(28, 4, 4, 31, 6, 6), material: Material.SAND })).toEqual([k(0, 0, 0)]);
    // Same box one voxel longer: only x = 31 changes, and that is on the border.
    expect(store.applyEdit({ t: 'fillBox', ...box(28, 4, 4, 32, 6, 6), material: Material.SAND })).toEqual([k(0, 0, 0), k(1, 0, 0)]);
    expect(store.lastEditVoxelsChanged).toBe(4);
    // A box spanning the face whose border voxels already hold the material changes only the far side:
    // voxels at x = 32 change, so chunk 0 is dirty as their neighbour although none of its voxels changed.
    expect(store.applyEdit({ t: 'fillBox', ...box(31, 4, 4, 33, 6, 6), material: Material.SAND })).toEqual([k(0, 0, 0), k(1, 0, 0)]);
    expect(store.lastEditVoxelsChanged).toBe(4);
    // Whole uniform chunk replaced: all 27.
    expect(store.applyEdit({ t: 'fillBox', ...box(64, 0, 0, 96, 32, 32), material: Material.SAND })).toHaveLength(27);
  });

  test('onDirty delivers the returned keys until unsubscribed', () => {
    const store = new ChunkWorldStore();
    const seen: ChunkKey[][] = [];
    const off = store.onDirty((keys) => seen.push(keys));
    const keys = setOne(store, 0, 0, 0, 7);
    expect(seen).toEqual([keys]);
    off();
    setOne(store, 1, 1, 1, 7);
    expect(seen).toHaveLength(1);
  });
});

function randomEdit(rng: Rng): WorldEdit {
  const coord = () => nextInt(rng, 120) - 44;
  const kind = nextInt(rng, 10);
  if (kind < 3) {
    const x = coord();
    const y = coord();
    const z = coord();
    return {
      t: 'fillBox',
      min: { x, y, z },
      max: { x: x + nextInt(rng, 40), y: y + nextInt(rng, 40), z: z + nextInt(rng, 40) },
      material: nextInt(rng, 6) === 0 ? Material.AIR : 2 + nextInt(rng, 17),
    };
  }
  if (kind < 8) {
    const a = { x: coord(), y: coord(), z: coord() };
    let b = { x: coord(), y: coord(), z: coord() };
    const shape = nextInt(rng, 6);
    if (shape === 0) b = { ...a };
    if (shape === 1) b = { x: b.x, y: a.y, z: a.z };
    if (shape === 2) b = { x: a.x, y: b.y, z: a.z };
    if (shape === 3) b = { x: a.x, y: a.y, z: b.z };
    const radius = nextInt(rng, 4) === 0 ? nextInt(rng, 7) : nextFloat(rng) * 6.5;
    return { t: 'carveCapsule', a, b, radius };
  }
  const n = 1 + nextInt(rng, 40);
  const coords = new Int32Array(n * 3);
  const materials = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    coords[i * 3] = coord();
    coords[i * 3 + 1] = coord();
    coords[i * 3 + 2] = coord();
    materials[i] = nextInt(rng, 19);
  }
  return { t: 'setVoxels', coords, materials };
}

describe('differential against the testkit MemoryWorldStore', () => {
  test('300 random edits: identical dirty keys after every edit, identical voxels and padded copies at the end', () => {
    const real = new ChunkWorldStore();
    const fake = new MemoryWorldStore();
    const start: WorldEdit = { t: 'fillBox', ...box(-40, -40, -40, 72, 72, 72), material: Material.ROCK };
    expect(real.applyEdit(start)).toEqual(fake.applyEdit(start));
    const rng = createRng(20261109);
    for (let i = 0; i < 300; i++) {
      const e = randomEdit(rng);
      expect(real.applyEdit(e), `edit ${i}: ${e.t}`).toEqual(fake.applyEdit(e));
    }
    let mismatches = 0;
    for (let y = -64; y < 96; y++) {
      for (let z = -64; z < 96; z++) {
        for (let x = -64; x < 96; x++) if (real.get(x, y, z) !== fake.get(x, y, z)) mismatches++;
      }
    }
    expect(mismatches).toBe(0);

    const a = new Uint16Array(PADDED_VOLUME);
    const b = new Uint16Array(PADDED_VOLUME);
    for (const [cx, cy, cz] of [
      [0, 0, 0],
      [-1, -1, -1],
      [1, 0, -1],
      [2, 2, 2],
      [-2, 1, 0],
    ] as const) {
      real.paddedCopy(packChunkKey(cx, cy, cz), a);
      fake.paddedCopy(packChunkKey(cx, cy, cz), b);
      expect(a, `padded chunk ${cx},${cy},${cz}`).toEqual(b);
    }
  });
});

describe('paddedCopy', () => {
  test('matches getVoxel on generated terrain, including the 26-neighbour border', () => {
    const store = new ChunkWorldStore({ voxelSizeM: 2, source: new SyntheticColumnSource({ seed: 7 }) });
    const out = new Uint16Array(PADDED_VOLUME);
    for (const [cx, cy, cz] of [
      [0, 0, 0],
      [-3, 0, 2],
      [5, -1, -4],
    ] as const) {
      store.paddedCopy(packChunkKey(cx, cy, cz), out);
      let mismatches = 0;
      for (let ly = -1; ly <= 32; ly++) {
        for (let lz = -1; lz <= 32; lz++) {
          for (let lx = -1; lx <= 32; lx++) {
            if (out[paddedIndex(lx, ly, lz)] !== store.get(cx * 32 + lx, cy * 32 + ly, cz * 32 + lz)) mismatches++;
          }
        }
      }
      expect(mismatches, `chunk ${cx},${cy},${cz}`).toBe(0);
    }
  });

  test('throws on a wrongly sized buffer and reads AIR beyond the key range', () => {
    const store = new ChunkWorldStore({ voxelSizeM: 1, source: flatSource(1e6), materialAt: rockOnly });
    expect(() => store.paddedCopy(packChunkKey(0, 0, 0), new Uint16Array(100))).toThrow(/needs 39304 entries, got 100/);
    const out = new Uint16Array(PADDED_VOLUME);
    store.paddedCopy(packChunkKey(0, -128, 0), out);
    expect(out[paddedIndex(4, 0, 4)]).toBe(Material.ROCK);
    expect(out[paddedIndex(4, -1, 4)]).toBe(Material.AIR);
  });
});

describe('generation from a ColumnSource', () => {
  // Made land with rock 80 m down. Core materialAt under a 10 m surface: FILL to 10 m depth,
  // BAY_MUD to 34 m, ALLUVIUM to 49.3 m, STIFF_CLAY to 80 m, ROCK below.
  const MADE_LAND = packColumnClass(ColumnUnit.FILL_OVER_ALLUVIUM, 20);
  const source: ColumnSource = {
    sampleColumn(xM: number, zM: number, out: ColumnSample): void {
      out.surfaceM = xM < 0 ? 4 : 10;
      out.columnClass = MADE_LAND;
      out.surfaceMaterial = zM < 0 ? 0 : Material.GRASS;
      out.waterLevelM = xM < 0 ? 8 : Number.NEGATIVE_INFINITY;
      const building = xM >= 16 && xM < 24 && zM >= 16 && zM < 24;
      out.buildingMaterial = building ? Material.BUILDING_CIVIC : 0;
      out.buildingBaseM = 10;
      out.buildingTopM = 30;
    },
  };

  for (const voxelSizeM of [1, 2]) {
    test(`columns become ground, cap, water, building and air at ${voxelSizeM} m voxels`, () => {
      const store = new ChunkWorldStore({ voxelSizeM, source });
      const v = (m: number) => m / voxelSizeM; // metres to voxels (all test heights are multiples of 2 m)
      // Land column: grass cap on the top ground voxel, core geology below, air above.
      const top = v(10) - 1;
      const atDepth = (depthM: number) => store.get(v(4), top - v(depthM), v(4)); // depth of the voxel's top face
      expect(atDepth(0)).toBe(Material.GRASS);
      expect(store.get(v(4), top - 1, v(4))).toBe(Material.FILL);
      expect(store.get(v(4), top + 1, v(4))).toBe(Material.AIR);
      expect(atDepth(8)).toBe(Material.FILL);
      expect(atDepth(10)).toBe(Material.BAY_MUD);
      expect(atDepth(32)).toBe(Material.BAY_MUD);
      expect(atDepth(40)).toBe(Material.ALLUVIUM);
      expect(atDepth(60)).toBe(Material.STIFF_CLAY);
      expect(atDepth(80)).toBe(Material.ROCK);
      expect(atDepth(200)).toBe(Material.ROCK);
      // No cap where surfaceMaterial is 0: the subsurface function decides.
      expect(store.get(v(4), top, -v(4))).toBe(Material.FILL);
      // Water column: ground to 4 m, water to 8 m.
      expect(store.get(-v(4), v(4) - 1, v(4))).toBe(Material.GRASS);
      expect(store.get(-v(4), v(4), v(4))).toBe(Material.WATER);
      expect(store.get(-v(4), v(8) - 1, v(4))).toBe(Material.WATER);
      expect(store.get(-v(4), v(8), v(4))).toBe(Material.AIR);
      // Building: [10, 30) m over its footprint only.
      expect(store.get(v(18), v(10), v(18))).toBe(Material.BUILDING_CIVIC);
      expect(store.get(v(18), v(30) - 1, v(18))).toBe(Material.BUILDING_CIVIC);
      expect(store.get(v(18), v(30), v(18))).toBe(Material.AIR);
      expect(store.get(v(18), v(10) - 1, v(18))).toBe(Material.GRASS);
      expect(store.get(v(24), v(12), v(18))).toBe(Material.AIR);
      expect(store.get(v(16) - 1, v(12), v(18))).toBe(Material.AIR);
    });
  }

  test('is deterministic and independent of load order', () => {
    const region = box(-96, -64, -96, 96, 64, 96);
    const a = new ChunkWorldStore({ source: new SyntheticColumnSource({ seed: 3 }) });
    const b = new ChunkWorldStore({ source: new SyntheticColumnSource({ seed: 3 }), columnCacheSize: 1 });
    for (let x = 95; x >= -96; x -= 13) b.get(x, 3, -x); // lazy, scattered loads first
    const other = new ChunkWorldStore({ source: new SyntheticColumnSource({ seed: 4 }) });
    expect(a.hashRegion(region)).toBe(b.hashRegion(region));
    expect(a.hashRegion(region)).not.toBe(other.hashRegion(region));
  });

  test('synthetic terrain has ground, water, buildings and air', () => {
    const store = new ChunkWorldStore({ source: new SyntheticColumnSource({ seed: 11 }) });
    const counts = new Map<number, number>();
    for (let y = -16; y < 48; y += 2) {
      for (let z = -200; z < 200; z += 3) {
        for (let x = -200; x < 200; x += 3) counts.set(store.get(x, y, z), (counts.get(store.get(x, y, z)) ?? 0) + 1);
      }
    }
    expect(counts.get(Material.AIR)).toBeGreaterThan(1000);
    expect(counts.get(Material.WATER)).toBeGreaterThan(100);
    expect(counts.get(Material.GRASS)).toBeGreaterThan(100);
    expect(counts.get(Material.ROCK)).toBeGreaterThan(100);
    expect(counts.get(Material.SAND)).toBeGreaterThan(100);
    expect(counts.get(Material.BAY_MUD)).toBeGreaterThan(100);
    let buildingVoxels = 0;
    for (let m = Material.BUILDING_RESIDENTIAL; m <= Material.BUILDING_TRANSIT; m++) buildingVoxels += counts.get(m) ?? 0;
    expect(buildingVoxels).toBeGreaterThan(1000);
  });

  test('a source or material function returning garbage fails naming the column', () => {
    const nan = new ChunkWorldStore({ voxelSizeM: 1, source: flatSource(Number.NaN) });
    expect(() => nan.get(0, 0, 0)).toThrow(/ColumnSource returned surfaceM = NaN at \(0.5, 0.5\) m/);
    const cls: ColumnSource = {
      sampleColumn(xM, zM, out) {
        flatSource(10).sampleColumn(xM, zM, out);
        out.columnClass = 300;
      },
    };
    expect(() => new ChunkWorldStore({ voxelSizeM: 1, source: cls }).get(0, 0, 0)).toThrow(
      /columnClass = 300 at \(0.5, 0.5\) m, not a byte/,
    );
    // Core materialAt rejects unit 7; the error names the class.
    const unit7: ColumnSource = {
      sampleColumn(xM, zM, out) {
        flatSource(10).sampleColumn(xM, zM, out);
        out.columnClass = 7;
      },
    };
    expect(() => new ChunkWorldStore({ voxelSizeM: 1, source: unit7 }).get(0, 0, 0)).toThrow(/invalid column class 7/);
    const bad = new ChunkWorldStore({ voxelSizeM: 1, source: flatSource(10), materialAt: () => 1.5 });
    expect(() => bad.get(0, 0, 0)).toThrow(/materialAt\(10, 9, 0\) returned 1.5, not a u16 material id/);
  });

  test('edits apply on top of lazily generated terrain', () => {
    const store = new ChunkWorldStore({
      voxelSizeM: 1,
      source: flatSource(10, Number.NEGATIVE_INFINITY, Material.ROAD),
      materialAt: rockOnly,
    });
    // Nothing loaded yet: the carve generates what it touches.
    expect(store.chunkCount).toBe(0);
    store.applyEdit({ t: 'carveCapsule', a: { x: 0, y: 0, z: 0 }, b: { x: 40, y: 0, z: 0 }, radius: 2 });
    expect(store.get(20, 0, 0)).toBe(Material.AIR);
    expect(store.get(20, 3, 0)).toBe(Material.ROCK);
    expect(store.get(20, 9, 0)).toBe(Material.ROAD);
    expect(store.lastEditVoxelsChanged).toBeGreaterThan(400);
  });
});

describe('ensureLoaded', () => {
  test('generates every chunk intersecting the box', async () => {
    const store = new ChunkWorldStore({ source: new SyntheticColumnSource({ seed: 5 }) });
    await store.ensureLoaded(box(-1, 0, 0, 33, 1, 64));
    expect(store.chunkCount).toBe(3 * 1 * 2);
    expect(store.isLoaded(packChunkKey(-1, 0, 1))).toBe(true);
    expect(store.isLoaded(packChunkKey(2, 0, 0))).toBe(false);
    expect(store.chunkKeys()).toHaveLength(6);
    await store.ensureLoaded(box(0, 0, 0, 0, 10, 10)); // empty box
    expect(store.chunkCount).toBe(6);
  });

  test('rejects, naming the region, when the box leaves the source bounds or the world', async () => {
    const bounded: ColumnSource = { bounds: { minXM: 0, minZM: -128, maxXM: 128, maxZM: 0 }, sampleColumn: flatSource(4).sampleColumn };
    const store = new ChunkWorldStore({ voxelSizeM: 2, source: bounded });
    await expect(store.ensureLoaded(box(0, -32, -64, 64, 32, 0))).resolves.toBeUndefined();
    await expect(store.ensureLoaded(box(0, 0, -64, 65, 32, 0))).rejects.toThrow(
      /region \[0, 0, -64\) to \[65, 32, 0\) \(voxels of 2 m\) leaves the source bounds x \[0, 128\) z \[-128, 0\) m/,
    );
    await expect(new ChunkWorldStore().ensureLoaded(box(0, 0, 0, 32, 5000, 32))).rejects.toThrow(/leaves the chunk key range/);
    await expect(new ChunkWorldStore().ensureLoaded(box(0, 0, 0, 1.5, 1, 1))).rejects.toThrow(/int32 integers/);
  });
});

describe('carveCapsule volume', () => {
  const analytic = (r: number, len: number) => Math.PI * r * r * len + (4 / 3) * Math.PI * r * r * r;

  function carvedCount(a: [number, number, number], b: [number, number, number], radius: number): number {
    const store = new ChunkWorldStore({ voxelSizeM: 1, source: flatSource(1e6), materialAt: rockOnly });
    store.applyEdit({ t: 'carveCapsule', a: { x: a[0], y: a[1], z: a[2] }, b: { x: b[0], y: b[1], z: b[2] }, radius });
    return store.lastEditVoxelsChanged;
  }

  const cases: { name: string; a: [number, number, number]; b: [number, number, number]; r: number }[] = [
    { name: '7 m bore, 100 m along x (1 m voxels)', a: [-20, -30, 7], b: [80, -30, 7], r: 3.5 },
    { name: '7 m bore, 100 m along y', a: [3, -90, 7], b: [3, 10, 7], r: 3.5 },
    { name: '7 m bore, 100 m along z', a: [3, -30, -50], b: [3, -30, 50], r: 3.5 },
    { name: '7 m bore, 100 m in the xz plane', a: [0, -30, 0], b: [60, -30, 80], r: 3.5 },
    { name: '7 m bore, 100 m descending', a: [-10, -10, -10], b: [70, -40, 42], r: 3.5 },
    { name: '10 m bore, 200 m', a: [-100, -40, 5], b: [60, -40, 125], r: 5 },
    { name: '16 m cavern, 30 m', a: [0, -40, 0], b: [18, -40, 24], r: 8 },
    { name: 'sphere, radius 9', a: [5, -40, 5], b: [5, -40, 5], r: 9 },
  ];
  for (const c of cases) {
    test(`${c.name}: voxel count within 5 percent of the analytic volume`, () => {
      const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]);
      const expected = analytic(c.r, len);
      const count = carvedCount(c.a, c.b, c.r);
      expect(Math.abs(count - expected) / expected, `count ${count}, analytic ${expected.toFixed(1)}`).toBeLessThan(0.05);
    });
  }

  const exact: { name: string; a: [number, number, number]; b: [number, number, number]; r: number }[] = [
    { name: 'oblique', a: [-7, -20, 3], b: [21, -9, -15], r: 4.3 },
    { name: 'along x', a: [-7, -20, 3], b: [25, -20, 3], r: 3.5 },
    { name: 'along y', a: [3, -22, 3], b: [3, -4, 3], r: 2 },
    { name: 'along z', a: [3, -12, -15], b: [3, -12, 9], r: 0.5 },
    { name: 'space diagonal', a: [-8, -24, -18], b: [10, -6, 0], r: 3.5 },
    { name: 'perpendicular to x', a: [5, -22, -14], b: [5, -8, 6], r: 3.9 },
    { name: 'single point, radius 0', a: [5, -22, -14], b: [5, -22, -14], r: 0 },
  ];
  for (const c of exact) {
    test(`carved voxels are exactly those whose centre is within the radius, brute force: ${c.name}`, () => {
      const store = new ChunkWorldStore({ voxelSizeM: 1, source: flatSource(1e6), materialAt: rockOnly });
      const a = { x: c.a[0], y: c.a[1], z: c.a[2] };
      const b = { x: c.b[0], y: c.b[1], z: c.b[2] };
      store.applyEdit({ t: 'carveCapsule', a, b, radius: c.r });
      const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const len2 = d.x * d.x + d.y * d.y + d.z * d.z;
      let wrong = 0;
      let carved = 0;
      for (let y = -32; y <= 2; y++) {
        for (let z = -26; z <= 14; z++) {
          for (let x = -16; x <= 32; x++) {
            const p = { x: x - a.x, y: y - a.y, z: z - a.z };
            const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (p.x * d.x + p.y * d.y + p.z * d.z) / len2));
            const inside = (p.x - t * d.x) ** 2 + (p.y - t * d.y) ** 2 + (p.z - t * d.z) ** 2 <= c.r * c.r;
            if (inside) carved++;
            if ((store.get(x, y, z) === Material.AIR) !== inside) wrong++;
          }
        }
      }
      expect(wrong).toBe(0);
      expect(carved).toBeGreaterThan(0);
      expect(store.lastEditVoxelsChanged).toBe(carved);
    });
  }

  test('lattice-aligned small bores undershoot: the space diagonal at radius 3.5 is 8.1 percent under', () => {
    // Along (1,1,1) the voxel centres project onto a triangular lattice whose next shell (12 points
    // per period) sits at 3.56 voxels, just outside the 3.5 radius. Centre sampling is the contract
    // (core WorldEdit), so this is the rule's discretisation error, not slack in the carve.
    const count = carvedCount([0, -70, 0], [58, -12, 58], 3.5);
    expect(count).toBe(3717);
    expect(count / analytic(3.5, Math.hypot(58, 58, 58))).toBeCloseTo(0.919, 3);
  });

  test('a 7 m bore at 2 m voxels is 9 voxels per slice when axis aligned: 6.4 percent under the analytic area', () => {
    // Centre sampling of a 1.75-voxel radius disc on the voxel lattice; documents the coarse-grid error.
    const store = new ChunkWorldStore({ voxelSizeM: 2, source: flatSource(1e6), materialAt: rockOnly });
    store.applyEdit({ t: 'carveCapsule', a: { x: 0, y: -20, z: 0 }, b: { x: 50, y: -20, z: 0 }, radius: 1.75 });
    let slice = 0;
    for (let y = -24; y <= -16; y++) for (let z = -4; z <= 4; z++) if (store.get(25, y, z) === Material.AIR) slice++;
    expect(slice).toBe(9);
    expect(9 / (Math.PI * 1.75 * 1.75)).toBeCloseTo(0.9355, 3);
  });
});
