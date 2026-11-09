/**
 * Naive in-memory WorldStore: a Map of dense 32^3 Uint16Array chunks. Correct, not fast.
 * Space with no chunk reads as AIR. Fake for tests and for rendering before packages/world lands.
 */
import {
  type Aabb,
  CHUNK_SIZE,
  CHUNK_VOLUME,
  type ChunkData,
  type ChunkKey,
  chunkOrigin,
  localIndex,
  Material,
  PADDED_VOLUME,
  packChunkKey,
  unpackChunkKey,
  type VoxelCoord,
  type WorldEdit,
  type WorldStore,
} from '@bayvox/core';

const MAX_MATERIAL = 0xffff;
// Module-level aliases keep export getters of Vitest's module runner out of the hot loops.
const AIR = Material.AIR;
const N = CHUNK_SIZE;
const P = N + 2;
const pack = packChunkKey;

function assertInt(v: number, what: string): void {
  if (!Number.isInteger(v)) throw new RangeError(`MemoryWorldStore: ${what} must be an integer, got ${v}`);
}

export class MemoryWorldStore implements WorldStore {
  private readonly chunks = new Map<ChunkKey, Uint16Array>();
  private readonly listeners = new Set<(keys: ChunkKey[]) => void>();

  /** Number of chunks that have ever been written. */
  get chunkCount(): number {
    return this.chunks.size;
  }

  /** Keys of all materialized chunks, ascending. */
  chunkKeys(): ChunkKey[] {
    return [...this.chunks.keys()].sort((a, b) => a - b);
  }

  getVoxel(c: VoxelCoord): number {
    return this.get(c.x, c.y, c.z);
  }

  /** getVoxel without the object. */
  get(x: number, y: number, z: number): number {
    const chunk = this.chunks.get(packChunkKey(x >> 5, y >> 5, z >> 5));
    if (chunk === undefined) return Material.AIR;
    return chunk[localIndex(x & 31, y & 31, z & 31)] as number;
  }

  /**
   * Writes one voxel without dirty tracking or notifications. For world generators only;
   * gameplay code goes through applyEdit. Returns true if the voxel changed.
   */
  setRaw(x: number, y: number, z: number, material: number): boolean {
    if (!Number.isInteger(material) || material < 0 || material > MAX_MATERIAL) {
      throw new RangeError(`MemoryWorldStore: material id out of u16 range: ${material}`);
    }
    const key = packChunkKey(x >> 5, y >> 5, z >> 5);
    let chunk = this.chunks.get(key);
    if (chunk === undefined) {
      if (material === Material.AIR) return false;
      chunk = new Uint16Array(CHUNK_VOLUME);
      this.chunks.set(key, chunk);
    }
    const i = localIndex(x & 31, y & 31, z & 31);
    if (chunk[i] === material) return false;
    chunk[i] = material;
    return true;
  }

  applyEdit(e: WorldEdit): ChunkKey[] {
    const dirty = new Set<ChunkKey>();
    const write = (x: number, y: number, z: number, material: number): void => {
      if (this.setRaw(x, y, z, material)) markDirty(dirty, x, y, z);
    };
    switch (e.t) {
      case 'fillBox': {
        for (const v of [e.min.x, e.min.y, e.min.z, e.max.x, e.max.y, e.max.z]) assertInt(v, 'fillBox bound');
        for (let y = e.min.y; y < e.max.y; y++) {
          for (let z = e.min.z; z < e.max.z; z++) {
            for (let x = e.min.x; x < e.max.x; x++) write(x, y, z, e.material);
          }
        }
        break;
      }
      case 'carveCapsule': {
        for (const v of [e.a.x, e.a.y, e.a.z, e.b.x, e.b.y, e.b.z]) assertInt(v, 'carveCapsule endpoint');
        if (!(e.radius >= 0) || !Number.isFinite(e.radius)) {
          throw new RangeError(`MemoryWorldStore: carveCapsule radius must be finite and >= 0, got ${e.radius}`);
        }
        const r = Math.ceil(e.radius);
        const r2 = e.radius * e.radius;
        const abx = e.b.x - e.a.x;
        const aby = e.b.y - e.a.y;
        const abz = e.b.z - e.a.z;
        const len2 = abx * abx + aby * aby + abz * abz;
        for (let y = Math.min(e.a.y, e.b.y) - r; y <= Math.max(e.a.y, e.b.y) + r; y++) {
          for (let z = Math.min(e.a.z, e.b.z) - r; z <= Math.max(e.a.z, e.b.z) + r; z++) {
            for (let x = Math.min(e.a.x, e.b.x) - r; x <= Math.max(e.a.x, e.b.x) + r; x++) {
              // Voxel centres are offset by 0.5 on both the sample and the segment, so the offsets cancel.
              const px = x - e.a.x;
              const py = y - e.a.y;
              const pz = z - e.a.z;
              let t = len2 === 0 ? 0 : (px * abx + py * aby + pz * abz) / len2;
              t = Math.max(0, Math.min(1, t));
              const dx = px - t * abx;
              const dy = py - t * aby;
              const dz = pz - t * abz;
              if (dx * dx + dy * dy + dz * dz <= r2) write(x, y, z, Material.AIR);
            }
          }
        }
        break;
      }
      case 'setVoxels': {
        if (e.coords.length !== e.materials.length * 3) {
          throw new RangeError(
            `MemoryWorldStore: setVoxels needs 3 coords per material, got ${e.coords.length} coords for ${e.materials.length} materials`,
          );
        }
        for (let i = 0; i < e.materials.length; i++) {
          write(e.coords[i * 3] as number, e.coords[i * 3 + 1] as number, e.coords[i * 3 + 2] as number, e.materials[i] as number);
        }
        break;
      }
      default: {
        const unknown: never = e;
        throw new Error(`MemoryWorldStore: unknown edit ${JSON.stringify(unknown)}`);
      }
    }
    const keys = [...dirty].sort((a, b) => a - b);
    if (keys.length > 0) for (const cb of [...this.listeners]) cb(keys);
    return keys;
  }

  getChunk(key: ChunkKey): ChunkData | undefined {
    const dense = this.chunks.get(key);
    if (dense === undefined) return undefined;
    const slotOf = new Map<number, number>();
    const palette: number[] = [];
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      const m = dense[i] as number;
      if (!slotOf.has(m)) {
        slotOf.set(m, palette.length);
        palette.push(m);
      }
    }
    if (palette.length === 1) return { key, palette: Uint16Array.from(palette), indices: null };
    const indices = palette.length <= 256 ? new Uint8Array(CHUNK_VOLUME) : new Uint16Array(CHUNK_VOLUME);
    for (let i = 0; i < CHUNK_VOLUME; i++) indices[i] = slotOf.get(dense[i] as number) as number;
    return { key, palette: Uint16Array.from(palette), indices };
  }

  paddedCopy(key: ChunkKey, out: Uint16Array): void {
    if (out.length !== PADDED_VOLUME) {
      throw new RangeError(`MemoryWorldStore: paddedCopy needs ${PADDED_VOLUME} entries, got ${out.length}`);
    }
    const o = chunkOrigin(key);
    let i = 0;
    // paddedIndex order: y outermost, then z, then x.
    for (let ly = -1; ly <= N; ly++) {
      for (let lz = -1; lz <= N; lz++) {
        for (let lx = -1; lx <= N; lx++) out[i++] = this.getOrAir(o.x + lx, o.y + ly, o.z + lz);
      }
    }
    if (i !== P * P * P) throw new Error(`MemoryWorldStore: paddedCopy wrote ${i} entries`);
  }

  onDirty(cb: (keys: ChunkKey[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  ensureLoaded(_aabb: Aabb): Promise<void> {
    return Promise.resolve();
  }

  /** Like get, but voxels beyond the ChunkKey range (possible only in a border) read as AIR instead of throwing. */
  private getOrAir(x: number, y: number, z: number): number {
    const cx = x >> 5;
    const cy = y >> 5;
    const cz = z >> 5;
    if (cx < -8192 || cx > 8191 || cz < -8192 || cz > 8191 || cy < -128 || cy > 127) return AIR;
    const chunk = this.chunks.get(pack(cx, cy, cz));
    if (chunk === undefined) return AIR;
    return chunk[(x & 31) + (z & 31) * N + (y & 31) * N * N] as number;
  }
}

/** Marks the chunk of a changed voxel and every neighbour chunk whose 1-voxel border contains it. */
function markDirty(dirty: Set<ChunkKey>, x: number, y: number, z: number): void {
  const lx = x & 31;
  const ly = y & 31;
  const lz = z & 31;
  const cx = x >> 5;
  const cy = y >> 5;
  const cz = z >> 5;
  const x0 = lx === 0 ? -1 : 0;
  const x1 = lx === 31 ? 1 : 0;
  const y0 = ly === 0 ? -1 : 0;
  const y1 = ly === 31 ? 1 : 0;
  const z0 = lz === 0 ? -1 : 0;
  const z1 = lz === 31 ? 1 : 0;
  for (let dy = y0; dy <= y1; dy++) {
    for (let dz = z0; dz <= z1; dz++) {
      for (let dx = x0; dx <= x1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;
        // Neighbours beyond the key range cannot exist; skip them rather than throw on a legal edit.
        if (nx < -8192 || nx > 8191 || nz < -8192 || nz > 8191 || ny < -128 || ny > 127) continue;
        dirty.add(packChunkKey(nx, ny, nz));
      }
    }
  }
}

/** Chunk coordinate triple of a key, for test diagnostics. */
export function describeChunk(key: ChunkKey): string {
  const c = unpackChunkKey(key);
  return `chunk(${c.cx}, ${c.cy}, ${c.cz})`;
}
