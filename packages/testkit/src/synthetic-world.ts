/**
 * Synthetic heightmap world: rolling hills, a water body, layered geology, a few box buildings.
 * Fully determined by its options (integer lattice noise, no Math.random, no transcendentals).
 */
import { CHUNK_SIZE, hashCoords, Material } from '@bayvox/core';
import { MemoryWorldStore } from './memory-world.ts';

export interface SyntheticWorldOptions {
  seed?: number;
  /** Extent in chunks along x and z. The world spans voxels [0, sizeChunks * 32) on both axes. Default 4. */
  sizeChunks?: number;
  /** Lowest generated voxel y (inclusive). Default -32. */
  minY?: number;
  /** Water fills empty voxels with y < seaLevel. Default 0. */
  seaLevel?: number;
  /** Terrain height range in voxels, peak to trough. Default 40. */
  relief?: number;
  /** Number of box buildings to attempt. Default 6. */
  buildings?: number;
}

export interface SyntheticBuilding {
  /** Half-open footprint and height range in world voxels. */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  baseY: number;
  topY: number;
  material: number;
}

export interface SyntheticWorld {
  store: MemoryWorldStore;
  /** World voxel extent, half-open. */
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  seaLevel: number;
  buildings: SyntheticBuilding[];
  /** Terrain surface: the highest solid ground voxel in column (x, z) has y = heightAt(x, z) - 1. */
  heightAt(x: number, z: number): number;
}

const BUILDING_MATERIALS = [
  Material.BUILDING_RESIDENTIAL,
  Material.BUILDING_COMMERCIAL,
  Material.BUILDING_INDUSTRIAL,
  Material.BUILDING_CIVIC,
  Material.BUILDING_TOWER,
] as const;

/** Lattice value in [0, 1). */
function lattice(ix: number, iz: number, seed: number): number {
  return hashCoords(ix, 0, iz, seed) / 0x100000000;
}

/** Smooth value noise in [0, 1) with the given cell size in voxels. */
function valueNoise(x: number, z: number, cell: number, seed: number): number {
  const fx = x / cell;
  const fz = z / cell;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = lattice(ix, iz, seed);
  const b = lattice(ix + 1, iz, seed);
  const c = lattice(ix, iz + 1, seed);
  const d = lattice(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export function createSyntheticWorld(options: SyntheticWorldOptions = {}): SyntheticWorld {
  const seed = options.seed ?? 1;
  const sizeChunks = options.sizeChunks ?? 4;
  const minY = options.minY ?? -32;
  const seaLevel = options.seaLevel ?? 0;
  const relief = options.relief ?? 40;
  const buildingCount = options.buildings ?? 6;
  if (!Number.isInteger(sizeChunks) || sizeChunks < 1 || sizeChunks > 64) {
    throw new RangeError(`createSyntheticWorld: sizeChunks must be an integer in [1, 64], got ${sizeChunks}`);
  }
  if (!Number.isInteger(minY) || !Number.isInteger(seaLevel) || !Number.isInteger(relief) || relief < 1) {
    throw new RangeError(`createSyntheticWorld: minY, seaLevel, relief must be integers (relief >= 1)`);
  }
  if (seaLevel - relief / 2 <= minY) {
    throw new RangeError(`createSyntheticWorld: minY ${minY} is not below the deepest terrain (${seaLevel - relief / 2})`);
  }
  const size = sizeChunks * CHUNK_SIZE;
  // Terrain is centred slightly above sea level so roughly a third of the map is under water.
  const base = seaLevel - relief / 2 + relief * 0.15;

  const heightAt = (x: number, z: number): number => {
    const n = 0.65 * valueNoise(x, z, 48, seed) + 0.25 * valueNoise(x, z, 16, seed + 1) + 0.1 * valueNoise(x, z, 6, seed + 2);
    const h = Math.floor(base + n * relief);
    return h <= minY ? minY + 1 : h;
  };

  const store = new MemoryWorldStore();
  let maxY = seaLevel;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const h = heightAt(x, z);
      if (h > maxY) maxY = h;
      const underwater = h <= seaLevel;
      for (let y = minY; y < h; y++) {
        const depth = h - 1 - y;
        let m: number;
        if (depth === 0) m = underwater ? Material.BAY_MUD : h - seaLevel <= 2 ? Material.BEACH_SAND : Material.GRASS;
        else if (depth < 4) m = underwater ? Material.BAY_MUD : Material.FILL;
        else if (depth < 10) m = Material.SAND;
        else if (depth < 18) m = Material.STIFF_CLAY;
        else m = Material.ROCK;
        store.setRaw(x, y, z, m);
      }
      for (let y = h; y < seaLevel; y++) store.setRaw(x, y, z, Material.WATER);
    }
  }

  const buildings: SyntheticBuilding[] = [];
  for (let i = 0; i < buildingCount; i++) {
    const w = 6 + (hashCoords(i, 1, 0, seed) % 10);
    const d = 6 + (hashCoords(i, 2, 0, seed) % 10);
    if (w + 2 >= size || d + 2 >= size) continue;
    const minX = 1 + (hashCoords(i, 3, 0, seed) % (size - w - 2));
    const minZ = 1 + (hashCoords(i, 4, 0, seed) % (size - d - 2));
    let ground = -Infinity;
    let lowest = Infinity;
    for (let z = minZ; z < minZ + d; z++) {
      for (let x = minX; x < minX + w; x++) {
        const h = heightAt(x, z);
        if (h > ground) ground = h;
        if (h < lowest) lowest = h;
      }
    }
    // Buildings stand on dry land only.
    if (lowest <= seaLevel) continue;
    const height = 8 + (hashCoords(i, 5, 0, seed) % 40);
    const material = BUILDING_MATERIALS[hashCoords(i, 6, 0, seed) % BUILDING_MATERIALS.length] as number;
    const b: SyntheticBuilding = { minX, minZ, maxX: minX + w, maxZ: minZ + d, baseY: lowest, topY: ground + height, material };
    for (let y = b.baseY; y < b.topY; y++) {
      for (let z = b.minZ; z < b.maxZ; z++) {
        for (let x = b.minX; x < b.maxX; x++) store.setRaw(x, y, z, material);
      }
    }
    if (b.topY > maxY) maxY = b.topY;
    buildings.push(b);
  }

  return {
    store,
    min: { x: 0, y: minY, z: 0 },
    max: { x: size, y: maxY, z: size },
    seaLevel,
    buildings,
    heightAt,
  };
}
