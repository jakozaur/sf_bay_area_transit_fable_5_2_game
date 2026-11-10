/**
 * ChunkWorldStore: the real WorldStore (work package C, doc 10 section 11).
 *
 * - Sparse Map of 32^3 chunks, palette compressed, uniform chunks stored without indices.
 * - Chunks are generated lazily from a ColumnSource plus a subsurface material function, so any
 *   voxel is readable synchronously; ensureLoaded only pre-generates.
 * - Edits return the exact set of dirty chunks (changed chunks plus neighbours whose 1-voxel
 *   border changed) and are appended to an edit log (see edit-log.ts) that reproduces the world
 *   when replayed onto a freshly generated store. Every edit carries a layer name ('manual' for
 *   hand digs, which is what a save stores; the sim and the stamps use their own), so one layer
 *   can be exported, imported or removed without touching the others.
 * - Memory budget: trim() evicts the least recently used chunks outside the windows the caller
 *   protects. An evicted chunk is regenerated on the next read and the edits that changed it are
 *   replayed into it in their original order, so eviction never changes a voxel.
 * - setSource() swaps the terrain input (another site): chunks, column cache and edits are dropped.
 *
 * Voxel size is a constructor parameter: the store works in integer voxel coordinates and only
 * uses the size to convert voxel centres to world metres for the ColumnSource.
 */
import {
  type Aabb,
  type ChunkData,
  type ChunkKey,
  CHUNK_SIZE as CORE_CHUNK_SIZE,
  CHUNK_VOLUME as CORE_CHUNK_VOLUME,
  PADDED_SIZE as CORE_PADDED_SIZE,
  PADDED_VOLUME as CORE_PADDED_VOLUME,
  VOXEL_SIZE_M as CORE_VOXEL_SIZE_M,
  materialAt as coreMaterialAt,
  packChunkKey as corePackChunkKey,
  hex32,
  Material,
  unpackChunkKey,
  type VoxelCoord,
  type WorldEdit,
  type WorldStore,
} from '@bayvox/core';
import { type ColumnSample, type ColumnSource, createColumnSample, type SubsurfaceMaterialFn } from './column-source.ts';

// Module-level aliases keep the Vitest module runner's export getters out of hot loops.
const N = CORE_CHUNK_SIZE;
const VOLUME = CORE_CHUNK_VOLUME;
const P = CORE_PADDED_SIZE;
const PADDED = CORE_PADDED_VOLUME;
const pack = corePackChunkKey;
const AIR = Material.AIR;
const WATER = Material.WATER;
const defaultMaterialAt: SubsurfaceMaterialFn = coreMaterialAt;

const AREA = N * N;
const MAX_MATERIAL = 0xffff;
const INT32_MIN = -0x80000000;
const INT32_MAX = 0x7fffffff;
const CX_MIN = -8192;
const CX_MAX = 8191;
const CY_MIN = -128;
const CY_MAX = 127;
/** Voxel height standing for "no ground / no water / no building" in a column block. */
const NONE = -0x40000000;
const HEIGHT_LIMIT = 0x3fffffff;
const ALL_NEIGHBOURS = 0x7ffffff;
const CENTRE_BIT = 1 << 13;
const FNV_PRIME = 0x01000193;

/**
 * Default edge length of one voxel in metres: the project's voxel size, core VOXEL_SIZE_M (1 m, doc 04
 * section 9.1 tier W). The store itself works at any size; 2 m is the low-end fallback of doc 04.
 */
export const DEFAULT_VOXEL_SIZE_M = CORE_VOXEL_SIZE_M;

/**
 * Dirty-neighbour masks. Bit (dx + 1) + 3 * (dz + 1) + 9 * (dy + 1) stands for the neighbour
 * chunk at offset (dx, dy, dz); bit 13 is the chunk itself. The table is indexed by
 * xo | yo << 2 | zo << 4 where each two-bit field says whether a changed voxel sat on the low
 * face (bit 0) and/or the high face (bit 1) of that axis.
 */
const NEIGHBOUR_MASK = new Int32Array(64);
for (let code = 0; code < 64; code++) {
  let mask = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const okX = dx === 0 || (dx < 0 ? (code & 1) !== 0 : (code & 2) !== 0);
        const okY = dy === 0 || (dy < 0 ? (code & 4) !== 0 : (code & 8) !== 0);
        const okZ = dz === 0 || (dz < 0 ? (code & 16) !== 0 : (code & 32) !== 0);
        if (okX && okY && okZ) mask |= 1 << (dx + 1 + 3 * (dz + 1) + 9 * (dy + 1));
      }
    }
  }
  NEIGHBOUR_MASK[code] = mask;
}

/** Internal chunk. It is also the ChunkData handed out by getChunk (a live, read-only view). */
interface Chunk extends ChunkData {
  cx: number;
  cy: number;
  cz: number;
  /** Dirty-neighbour mask accumulated during the edit in progress; 0 between edits. */
  mask: number;
  /** Value of the store's access clock when the chunk was last looked up: the eviction order. */
  used: number;
  /** Edited while edits are not recorded: cannot be regenerated, so never evicted. */
  pinned: boolean;
}

/** Layer of edits applied without naming one: hand digs, the layer a save stores. */
export const MANUAL_EDIT_LAYER = 'manual';

/** Estimated bytes of a resident chunk beyond its palette and indices (object, map entry, array headers). */
const CHUNK_OVERHEAD_BYTES = 256;
/** trim() evicts down to this share of the budget, so a store at its limit does not evict on every call. */
const TRIM_TARGET = 0.75;

export interface TrimOptions {
  /** Bytes of chunk data allowed to stay resident. Default: the store's `budgetBytes`. */
  budgetBytes?: number;
  /** Voxel boxes (half-open) whose chunks are never evicted: the camera window, the machine window. */
  keep?: readonly Aabb[];
}

export interface TrimResult {
  evicted: number;
  /** Resident chunks and their estimated bytes after the call. Above the budget when everything left is protected. */
  chunks: number;
  residentBytes: number;
}

/** A WorldStore whose edits all go to one layer of a ChunkWorldStore; everything else is the store itself. */
export interface LayerView extends WorldStore {
  readonly layer: string;
}

/** Per (cx, cz) column data shared by every chunk in that vertical stack. Index = lx + lz * 32. */
interface ColumnBlock {
  /** Number of ground voxel layers: voxel y is ground iff y < groundTop. */
  groundTop: Int32Array;
  waterTop: Int32Array;
  buildingBase: Int32Array;
  buildingTop: Int32Array;
  surfaceMaterial: Uint16Array;
  buildingMaterial: Uint16Array;
  columnClass: Uint8Array;
  surfaceM: Float64Array;
  /** Every voxel with y >= maxTop is AIR in this block. */
  maxTop: number;
}

export interface ChunkStoreOptions {
  /** Edge length of one voxel in metres. Default DEFAULT_VOXEL_SIZE_M (core VOXEL_SIZE_M). */
  voxelSizeM?: number;
  /** Terrain input. Without one the world starts as all AIR. */
  source?: ColumnSource;
  /** Material of ground voxels below the surface cap. Default: materialAt from core assets/terrain.ts. */
  materialAt?: SubsurfaceMaterialFn;
  /** Append every applied edit to `editLog`. Default true. */
  recordEdits?: boolean;
  /** Column blocks (one per chunk column, about 30 kB each) kept for reuse. Default 256. */
  columnCacheSize?: number;
  /**
   * Bytes of chunk data trim() keeps resident (palette plus indices plus a fixed overhead per chunk).
   * Default: no limit, trim() evicts nothing unless it is given a budget.
   */
  budgetBytes?: number;
}

export class ChunkWorldStore implements WorldStore {
  readonly voxelSizeM: number;
  /**
   * Every edit that changed at least one voxel, in order, all layers (empty when recordEdits is false).
   * Treat as read-only; see edit-log.ts and exportEdits.
   */
  readonly editLog: WorldEdit[] = [];
  /** Layer of each entry of `editLog`. */
  private readonly editLayers: string[] = [];
  /** Per chunk: indices into `editLog` of the edits that changed a voxel of it, ascending. Survives eviction. */
  private readonly editIndex = new Map<ChunkKey, number[]>();

  private source: ColumnSource | undefined;
  private materialAt: SubsurfaceMaterialFn;
  private readonly recordEdits: boolean;
  private readonly columnCacheSize: number;
  private readonly budgetBytes: number;
  private clock = 0;
  private evictedTotal = 0;
  /** True while an edit is being applied; trim, resetEdits and setSource refuse to run inside one. */
  private editing = false;
  private readonly chunks = new Map<ChunkKey, Chunk>();
  private readonly columns = new Map<number, ColumnBlock>();
  private readonly listeners = new Set<(keys: ChunkKey[]) => void>();

  private readonly sample: ColumnSample = createColumnSample();
  private readonly scratch = new Uint16Array(VOLUME);
  /** Palette slot per material id during chunk encoding; -1 = not in the palette. */
  private readonly slotOf = new Int32Array(MAX_MATERIAL + 1).fill(-1);

  private lastChunk: Chunk | undefined;
  private touched: Chunk[] = [];
  private changed = 0;
  private lastChanged = 0;
  private slotChunk: Chunk | undefined;
  private slotMaterial = -1;
  private slot = 0;

  constructor(options: ChunkStoreOptions = {}) {
    const voxelSizeM = options.voxelSizeM ?? DEFAULT_VOXEL_SIZE_M;
    if (!(voxelSizeM > 0) || !Number.isFinite(voxelSizeM)) {
      throw new RangeError(`ChunkWorldStore: voxelSizeM must be finite and > 0, got ${voxelSizeM}`);
    }
    const columnCacheSize = options.columnCacheSize ?? 256;
    if (!Number.isInteger(columnCacheSize) || columnCacheSize < 1) {
      throw new RangeError(`ChunkWorldStore: columnCacheSize must be a positive integer, got ${columnCacheSize}`);
    }
    this.voxelSizeM = voxelSizeM;
    this.source = options.source;
    this.materialAt = options.materialAt ?? defaultMaterialAt;
    this.recordEdits = options.recordEdits ?? true;
    this.columnCacheSize = columnCacheSize;
    const budgetBytes = options.budgetBytes ?? Number.POSITIVE_INFINITY;
    if (!(budgetBytes > 0)) throw new RangeError(`ChunkWorldStore: budgetBytes must be > 0, got ${budgetBytes}`);
    this.budgetBytes = budgetBytes;
  }

  /** Number of chunks generated or written so far. */
  get chunkCount(): number {
    return this.chunks.size;
  }

  /** Keys of all loaded chunks, ascending. */
  chunkKeys(): ChunkKey[] {
    return [...this.chunks.keys()].sort((a, b) => a - b);
  }

  /** Number of voxels whose material changed in the most recent applyEdit (the excavated volume for a carve). */
  get lastEditVoxelsChanged(): number {
    return this.lastChanged;
  }

  getVoxel(c: VoxelCoord): number {
    return this.get(c.x, c.y, c.z);
  }

  /** getVoxel without the object. Generates the chunk if needed. */
  get(x: number, y: number, z: number): number {
    assertVoxel(x, y, z, 'get');
    const chunk = this.chunkAt(x >> 5, y >> 5, z >> 5);
    const indices = chunk.indices;
    if (indices === null) return chunk.palette[0] as number;
    return chunk.palette[indices[(x & 31) + (z & 31) * N + (y & 31) * AREA] as number] as number;
  }

  /**
   * The chunk for a key, generating it if needed. The returned object is the store's live chunk:
   * do not write to it, and do not hold it across edits (an edit may replace `palette` and `indices`).
   * `palette` may contain materials that edits have since removed from the chunk.
   */
  getChunk(key: ChunkKey): ChunkData {
    const c = unpackChunkKey(key);
    return this.chunkAt(c.cx, c.cy, c.cz);
  }

  /** True if the chunk has been generated or written. Never generates. */
  isLoaded(key: ChunkKey): boolean {
    return this.chunks.has(key);
  }

  onDirty(cb: (keys: ChunkKey[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Generates every chunk intersecting the box. Generation is synchronous; the promise only
   * carries the failure. Rejects if the box leaves the ColumnSource bounds or the chunk key range.
   */
  ensureLoaded(aabb: Aabb): Promise<void> {
    try {
      this.loadBox(aabb);
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  }

  private loadBox(aabb: Aabb): void {
    const { min, max } = aabb;
    const where = `[${min.x}, ${min.y}, ${min.z}) to [${max.x}, ${max.y}, ${max.z})`;
    for (const v of [min.x, min.y, min.z, max.x, max.y, max.z]) {
      if (!Number.isInteger(v) || v < INT32_MIN || v > INT32_MAX) {
        throw new RangeError(`ChunkWorldStore: ensureLoaded bounds must be int32 integers, got ${where}`);
      }
    }
    if (max.x <= min.x || max.y <= min.y || max.z <= min.z) return;
    const bounds = this.source?.bounds;
    if (bounds !== undefined) {
      const s = this.voxelSizeM;
      if (min.x * s < bounds.minXM || max.x * s > bounds.maxXM || min.z * s < bounds.minZM || max.z * s > bounds.maxZM) {
        throw new RangeError(
          `ChunkWorldStore: ensureLoaded region ${where} (voxels of ${s} m) leaves the source bounds ` +
            `x [${bounds.minXM}, ${bounds.maxXM}) z [${bounds.minZM}, ${bounds.maxZM}) m`,
        );
      }
    }
    const cx0 = min.x >> 5;
    const cx1 = (max.x - 1) >> 5;
    const cy0 = min.y >> 5;
    const cy1 = (max.y - 1) >> 5;
    const cz0 = min.z >> 5;
    const cz1 = (max.z - 1) >> 5;
    if (cx0 < CX_MIN || cx1 > CX_MAX || cz0 < CX_MIN || cz1 > CX_MAX || cy0 < CY_MIN || cy1 > CY_MAX) {
      throw new RangeError(`ChunkWorldStore: ensureLoaded region ${where} leaves the chunk key range`);
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cy = cy0; cy <= cy1; cy++) this.chunkAt(cx, cy, cz);
      }
    }
  }

  paddedCopy(key: ChunkKey, out: Uint16Array): void {
    if (out.length !== PADDED) {
      throw new RangeError(`ChunkWorldStore: paddedCopy needs ${PADDED} entries, got ${out.length}`);
    }
    const c = unpackChunkKey(key);
    for (let dy = -1; dy <= 1; dy++) {
      const sy0 = dy < 0 ? N - 1 : 0;
      const ny = dy === 0 ? N : 1;
      const py0 = dy < 0 ? 0 : dy === 0 ? 1 : N + 1;
      for (let dz = -1; dz <= 1; dz++) {
        const sz0 = dz < 0 ? N - 1 : 0;
        const nz = dz === 0 ? N : 1;
        const pz0 = dz < 0 ? 0 : dz === 0 ? 1 : N + 1;
        for (let dx = -1; dx <= 1; dx++) {
          const sx0 = dx < 0 ? N - 1 : 0;
          const nx = dx === 0 ? N : 1;
          const px0 = dx < 0 ? 0 : dx === 0 ? 1 : N + 1;
          const cx = c.cx + dx;
          const cy = c.cy + dy;
          const cz = c.cz + dz;
          // Space beyond the chunk key range cannot hold voxels; it reads as AIR in a border.
          const inRange = cx >= CX_MIN && cx <= CX_MAX && cz >= CX_MIN && cz <= CX_MAX && cy >= CY_MIN && cy <= CY_MAX;
          const chunk = inRange ? this.chunkAt(cx, cy, cz) : undefined;
          const indices = chunk === undefined ? null : chunk.indices;
          const palette = chunk === undefined ? undefined : chunk.palette;
          const uniform = palette === undefined ? AIR : (palette[0] as number);
          for (let j = 0; j < ny; j++) {
            for (let k = 0; k < nz; k++) {
              const dst = px0 + (pz0 + k) * P + (py0 + j) * P * P;
              if (indices === null || palette === undefined) {
                if (nx === 1) out[dst] = uniform;
                else out.fill(uniform, dst, dst + nx);
              } else {
                const src = sx0 + (sz0 + k) * N + (sy0 + j) * AREA;
                for (let i = 0; i < nx; i++) out[dst + i] = palette[indices[src + i] as number] as number;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Stable 64-bit hash (16 hex characters) of the materials of every chunk intersecting the box
   * (whole chunks, so the box is effectively expanded to chunk boundaries). Independent of palette
   * order, of uniform elision and of which chunks happened to be loaded. Generates missing chunks.
   */
  hashRegion(aabb: Aabb): string {
    const { min, max } = aabb;
    for (const v of [min.x, min.y, min.z, max.x, max.y, max.z]) {
      if (!Number.isInteger(v) || v < INT32_MIN || v > INT32_MAX) {
        throw new RangeError(`ChunkWorldStore: hashRegion bounds must be int32 integers, got ${JSON.stringify(aabb)}`);
      }
    }
    let h1 = 0x811c9dc5 | 0;
    let h2 = 0x9747b28c | 0;
    if (max.x <= min.x || max.y <= min.y || max.z <= min.z) return hex32(h1) + hex32(h2);
    for (let cx = min.x >> 5; cx <= (max.x - 1) >> 5; cx++) {
      for (let cz = min.z >> 5; cz <= (max.z - 1) >> 5; cz++) {
        for (let cy = min.y >> 5; cy <= (max.y - 1) >> 5; cy++) {
          const chunk = this.chunkAt(cx, cy, cz);
          const indices = chunk.indices;
          const palette = chunk.palette;
          for (let i = 0; i < VOLUME; i++) {
            const m = indices === null ? (palette[0] as number) : (palette[indices[i] as number] as number);
            h1 = Math.imul(h1 ^ (m & 0xff), FNV_PRIME);
            h1 = Math.imul(h1 ^ (m >>> 8), FNV_PRIME);
            h2 = Math.imul(h2 ^ (m & 0xff), FNV_PRIME);
            h2 = Math.imul(h2 ^ (m >>> 8), FNV_PRIME);
          }
        }
      }
    }
    return hex32(h1) + hex32(h2);
  }

  // ---------------------------------------------------------------------------------------------
  // Edits
  // ---------------------------------------------------------------------------------------------

  /**
   * Applies an edit and records it under `layer` (default MANUAL_EDIT_LAYER). The layer only matters for
   * exportEdits, importEdits and resetEdits: the voxels are the same whatever it is.
   */
  applyEdit(e: WorldEdit, layer: string = MANUAL_EDIT_LAYER): ChunkKey[] {
    if (this.editing) throw new Error('ChunkWorldStore: applyEdit called from inside another edit');
    if (typeof layer !== 'string' || layer === '')
      throw new RangeError(`ChunkWorldStore: edit layer must be a non-empty string, got ${JSON.stringify(layer)}`);
    this.touched = [];
    this.changed = 0;
    this.slotChunk = undefined;
    this.editing = true;
    try {
      // Validation happens before the first write, so a rejected edit leaves the world untouched.
      switch (e.t) {
        case 'fillBox':
          this.fillBox(e.min, e.max, e.material, undefined);
          break;
        case 'carveCapsule':
          this.carveCapsule(e.a, e.b, e.radius, undefined);
          break;
        case 'setVoxels':
          this.setVoxels(e.coords, e.materials, undefined);
          break;
        default: {
          const unknown: never = e;
          throw new Error(`ChunkWorldStore: unknown edit ${JSON.stringify(unknown)}`);
        }
      }
    } finally {
      this.editing = false;
    }
    // An edit that changed nothing is a no-op on replay too, so it is left out of the log.
    const record = this.recordEdits && this.changed > 0;
    const editNumber = this.editLog.length;
    if (record) {
      this.editLog.push(cloneEdit(e));
      this.editLayers.push(layer);
    }
    this.lastChanged = this.changed;

    const dirty = new Set<ChunkKey>();
    for (const chunk of this.touched) {
      const mask = chunk.mask;
      chunk.mask = 0;
      if (record) {
        const list = this.editIndex.get(chunk.key);
        if (list === undefined) this.editIndex.set(chunk.key, [editNumber]);
        else list.push(editNumber);
      } else {
        chunk.pinned = true;
      }
      for (let bit = 0; bit < 27; bit++) {
        if ((mask & (1 << bit)) === 0) continue;
        const cx = chunk.cx + (bit % 3) - 1;
        const cz = chunk.cz + (Math.floor(bit / 3) % 3) - 1;
        const cy = chunk.cy + Math.floor(bit / 9) - 1;
        // Neighbours beyond the key range cannot exist; skip them rather than throw on a legal edit.
        if (cx < CX_MIN || cx > CX_MAX || cz < CX_MIN || cz > CX_MAX || cy < CY_MIN || cy > CY_MAX) continue;
        dirty.add(pack(cx, cy, cz));
      }
      collapseIfUniform(chunk);
    }
    this.touched = [];
    const keys = [...dirty].sort((a, b) => a - b);
    if (keys.length > 0) for (const cb of [...this.listeners]) cb(keys);
    return keys;
  }

  /** With `clip`, only the voxels of that chunk are written (replay into a regenerated chunk). */
  private fillBox(min: VoxelCoord, max: VoxelCoord, material: number, clip: Chunk | undefined): void {
    assertVoxel(min.x, min.y, min.z, 'fillBox min');
    assertVoxel(max.x, max.y, max.z, 'fillBox max');
    assertMaterial(material, 'fillBox');
    if (max.x <= min.x || max.y <= min.y || max.z <= min.z) return;
    const x1 = max.x - 1;
    const y1 = max.y - 1;
    const z1 = max.z - 1;
    assertChunkRange(min.x, min.y, min.z, x1, y1, z1, 'fillBox');
    let cx0 = min.x >> 5;
    let cx1 = x1 >> 5;
    let cy0 = min.y >> 5;
    let cy1 = y1 >> 5;
    let cz0 = min.z >> 5;
    let cz1 = z1 >> 5;
    if (clip !== undefined) {
      cx0 = Math.max(cx0, clip.cx);
      cx1 = Math.min(cx1, clip.cx);
      cy0 = Math.max(cy0, clip.cy);
      cy1 = Math.min(cy1, clip.cy);
      cz0 = Math.max(cz0, clip.cz);
      cz1 = Math.min(cz1, clip.cz);
    }
    for (let cy = cy0; cy <= cy1; cy++) {
      const ly0 = Math.max(min.y, cy * N) - cy * N;
      const ly1 = Math.min(y1, cy * N + N - 1) - cy * N;
      for (let cz = cz0; cz <= cz1; cz++) {
        const lz0 = Math.max(min.z, cz * N) - cz * N;
        const lz1 = Math.min(z1, cz * N + N - 1) - cz * N;
        for (let cx = cx0; cx <= cx1; cx++) {
          const lx0 = Math.max(min.x, cx * N) - cx * N;
          const lx1 = Math.min(x1, cx * N + N - 1) - cx * N;
          const chunk = clip ?? this.chunkAt(cx, cy, cz);
          if (chunk.indices === null) {
            if (chunk.palette[0] === material) continue;
            const whole = lx0 === 0 && ly0 === 0 && lz0 === 0 && lx1 === N - 1 && ly1 === N - 1 && lz1 === N - 1;
            if (whole) {
              // Uniform chunk fully overwritten: stays uniform, every voxel and every border changed.
              chunk.palette = Uint16Array.of(material);
              this.changed += VOLUME;
              if (chunk.mask === 0) this.touched.push(chunk);
              chunk.mask = ALL_NEIGHBOURS;
              this.slotChunk = undefined;
              continue;
            }
          }
          for (let ly = ly0; ly <= ly1; ly++) {
            for (let lz = lz0; lz <= lz1; lz++) this.fillRow(chunk, lx0, lx1, ly, lz, material);
          }
        }
      }
    }
  }

  private carveCapsule(a: VoxelCoord, b: VoxelCoord, radius: number, clip: Chunk | undefined): void {
    assertVoxel(a.x, a.y, a.z, 'carveCapsule a');
    assertVoxel(b.x, b.y, b.z, 'carveCapsule b');
    if (!(radius >= 0) || !Number.isFinite(radius)) {
      throw new RangeError(`ChunkWorldStore: carveCapsule radius must be finite and >= 0, got ${radius}`);
    }
    const ri = Math.ceil(radius);
    const r2 = radius * radius;
    const ax = a.x;
    const ay = a.y;
    const az = a.z;
    const dx = b.x - ax;
    const dy = b.y - ay;
    const dz = b.z - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let yMin = Math.min(ay, b.y) - ri;
    let yMax = Math.max(ay, b.y) + ri;
    let zMin = Math.min(az, b.z) - ri;
    let zMax = Math.max(az, b.z) + ri;
    assertChunkRange(Math.min(ax, b.x) - ri - 2, yMin, zMin, Math.max(ax, b.x) + ri + 2, yMax, zMax, 'carveCapsule');
    if (clip !== undefined) {
      yMin = Math.max(yMin, clip.cy * N);
      yMax = Math.min(yMax, clip.cy * N + N - 1);
      zMin = Math.max(zMin, clip.cz * N);
      zMax = Math.min(zMax, clip.cz * N + N - 1);
    }
    const axisAlongX = dy === 0 && dz === 0;

    for (let y = yMin; y <= yMax; y++) {
      const py = y - ay;
      for (let z = zMin; z <= zMax; z++) {
        const pz = z - az;
        // The capsule is convex, so a row meets it in one interval. Bound that interval
        // analytically (hull of the two end spheres and the clipped cylinder, x relative to a.x),
        // then trim both ends with the exact voxel-centre test.
        const q = py * py + pz * pz;
        let lo = Number.POSITIVE_INFINITY;
        let hi = Number.NEGATIVE_INFINITY;
        const sa = r2 - q;
        if (sa >= 0) {
          const w = Math.sqrt(sa);
          lo = -w;
          hi = w;
        }
        const c = py * dy + pz * dz;
        if (len2 > 0) {
          const ey = py - dy;
          const ez = pz - dz;
          const sb = r2 - ey * ey - ez * ez;
          if (sb >= 0) {
            const w = Math.sqrt(sb);
            if (dx - w < lo) lo = dx - w;
            if (dx + w > hi) hi = dx + w;
          }
          // Cylinder: |p|^2 - (p.d)^2 / len2 <= r2 with p = (x, py, pz), clipped to 0 <= p.d <= len2.
          let c0 = Number.POSITIVE_INFINITY;
          let c1 = Number.NEGATIVE_INFINITY;
          const cc = q - (c * c) / len2 - r2;
          if (axisAlongX) {
            if (cc <= 0) {
              c0 = Number.NEGATIVE_INFINITY;
              c1 = Number.POSITIVE_INFINITY;
            }
          } else {
            const qa = 1 - (dx * dx) / len2;
            const qb = (-2 * c * dx) / len2;
            const disc = qb * qb - 4 * qa * cc;
            if (disc >= 0) {
              const sq = Math.sqrt(disc);
              c0 = (-qb - sq) / (2 * qa);
              c1 = (-qb + sq) / (2 * qa);
            }
          }
          if (dx === 0) {
            if (c < 0 || c > len2) c1 = Number.NEGATIVE_INFINITY;
          } else {
            const t0 = -c / dx;
            const t1 = (len2 - c) / dx;
            const tLo = Math.min(t0, t1);
            const tHi = Math.max(t0, t1);
            if (tLo > c0) c0 = tLo;
            if (tHi < c1) c1 = tHi;
          }
          if (c0 <= c1) {
            if (c0 < lo) lo = c0;
            if (c1 > hi) hi = c1;
          }
        }
        if (!(lo <= hi)) continue;
        // One voxel of slack on each side covers rounding in the analytic bound.
        let x0 = Math.floor(lo) - 1;
        let x1 = Math.ceil(hi) + 1;
        while (x0 <= x1 && !inCapsule(x0, py, pz, c, dx, dy, dz, len2, r2)) x0++;
        while (x1 >= x0 && !inCapsule(x1, py, pz, c, dx, dy, dz, len2, r2)) x1--;
        if (x0 <= x1) this.writeRun(ax + x0, ax + x1, y, z, AIR, clip);
      }
    }
  }

  private setVoxels(coords: Int32Array, materials: Uint16Array, clip: Chunk | undefined): void {
    if (coords.length !== materials.length * 3) {
      throw new RangeError(
        `ChunkWorldStore: setVoxels needs 3 coords per material, got ${coords.length} coords for ${materials.length} materials`,
      );
    }
    for (let i = 0; i < coords.length; i += 3) {
      const x = coords[i] as number;
      const y = coords[i + 1] as number;
      const z = coords[i + 2] as number;
      assertChunkRange(x, y, z, x, y, z, 'setVoxels');
    }
    for (let i = 0; i < materials.length; i++) {
      const x = coords[i * 3] as number;
      const y = coords[i * 3 + 1] as number;
      const z = coords[i * 3 + 2] as number;
      if (clip !== undefined && (y >> 5 !== clip.cy || z >> 5 !== clip.cz)) continue;
      this.writeRun(x, x, y, z, materials[i] as number, clip);
    }
  }

  /** Sets world voxels x0..x1 (inclusive) of one row to a material. With `clip` (a chunk the row passes through), only its part. */
  private writeRun(x0: number, x1: number, y: number, z: number, material: number, clip: Chunk | undefined): void {
    const cy = y >> 5;
    const cz = z >> 5;
    const ly = y & 31;
    const lz = z & 31;
    let cx0 = x0 >> 5;
    let cx1 = x1 >> 5;
    if (clip !== undefined) {
      cx0 = Math.max(cx0, clip.cx);
      cx1 = Math.min(cx1, clip.cx);
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      const base = cx * N;
      const lx0 = x0 > base ? x0 - base : 0;
      const lx1 = x1 < base + N - 1 ? x1 - base : N - 1;
      this.fillRow(clip ?? this.chunkAt(cx, cy, cz), lx0, lx1, ly, lz, material);
    }
  }

  /** Sets local voxels lx0..lx1 (inclusive) of one chunk row, tracking changes and dirty borders exactly. */
  private fillRow(chunk: Chunk, lx0: number, lx1: number, ly: number, lz: number, material: number): void {
    if (chunk.indices === null && chunk.palette[0] === material) return;
    let slot = this.slot;
    if (this.slotChunk !== chunk || this.slotMaterial !== material) {
      slot = slotFor(chunk, material);
      this.slotChunk = chunk;
      this.slotMaterial = material;
      this.slot = slot;
    }
    // slotFor materialized the indices: the chunk is not uniform in `material`, so a write may differ.
    const indices = chunk.indices as Uint8Array | Uint16Array;
    const row = lz * N + ly * AREA;
    let first = -1;
    let last = -1;
    let n = 0;
    for (let i = lx0; i <= lx1; i++) {
      if (indices[row + i] !== slot) {
        indices[row + i] = slot;
        if (first < 0) first = i;
        last = i;
        n++;
      }
    }
    if (n === 0) return;
    this.changed += n;
    const code =
      (first === 0 ? 1 : 0) |
      (last === N - 1 ? 2 : 0) |
      (ly === 0 ? 4 : 0) |
      (ly === N - 1 ? 8 : 0) |
      (lz === 0 ? 16 : 0) |
      (lz === N - 1 ? 32 : 0);
    if (chunk.mask === 0) this.touched.push(chunk);
    chunk.mask |= code === 0 ? CENTRE_BIT : (NEIGHBOUR_MASK[code] as number);
  }

  // ---------------------------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------------------------

  private chunkAt(cx: number, cy: number, cz: number): Chunk {
    const last = this.lastChunk;
    if (last !== undefined && last.cx === cx && last.cy === cy && last.cz === cz) return last;
    const key = pack(cx, cy, cz);
    let chunk = this.chunks.get(key);
    if (chunk === undefined) {
      chunk = this.generate(key, cx, cy, cz);
      this.chunks.set(key, chunk);
      const edits = this.editIndex.get(key);
      if (edits !== undefined) this.replayInto(chunk, edits);
    }
    chunk.used = ++this.clock;
    this.lastChunk = chunk;
    return chunk;
  }

  /**
   * Replays the logged edits that changed this chunk into its freshly generated copy, clipped to it.
   * An edit that is not in the chunk's list changed nothing here when it was first applied, and the chunk
   * goes through the same states again, so it would change nothing now either.
   * May run in the middle of an edit (the edit reaches a chunk that was evicted): the bookkeeping of the
   * edit in progress is put back afterwards.
   */
  private replayInto(chunk: Chunk, edits: readonly number[]): void {
    const changed = this.changed;
    const touched = this.touched.length;
    for (const n of edits) {
      const e = this.editLog[n];
      if (e === undefined) throw new Error(`ChunkWorldStore: chunk ${chunk.key} refers to edit ${n}, the log has ${this.editLog.length}`);
      if (e.t === 'fillBox') this.fillBox(e.min, e.max, e.material, chunk);
      else if (e.t === 'carveCapsule') this.carveCapsule(e.a, e.b, e.radius, chunk);
      else this.setVoxels(e.coords, e.materials, chunk);
    }
    chunk.mask = 0;
    this.touched.length = touched;
    this.changed = changed;
    this.slotChunk = undefined;
    collapseIfUniform(chunk);
  }

  // ---------------------------------------------------------------------------------------------
  // Edit layers, eviction, source swap
  // ---------------------------------------------------------------------------------------------

  /** A WorldStore over this store whose edits are recorded under `layer`. */
  view(layer: string): LayerView {
    if (typeof layer !== 'string' || layer === '')
      throw new RangeError(`ChunkWorldStore: edit layer must be a non-empty string, got ${JSON.stringify(layer)}`);
    return {
      layer,
      getVoxel: (c) => this.getVoxel(c),
      applyEdit: (e) => this.applyEdit(e, layer),
      getChunk: (key) => this.getChunk(key),
      paddedCopy: (key, out) => this.paddedCopy(key, out),
      onDirty: (cb) => this.onDirty(cb),
      ensureLoaded: (aabb) => this.ensureLoaded(aabb),
    };
  }

  /** Number of logged edits, of one layer or of all. */
  editCount(layer?: string): number {
    if (layer === undefined) return this.editLog.length;
    let n = 0;
    for (const l of this.editLayers) if (l === layer) n++;
    return n;
  }

  /** The edits of one layer in the order they were applied: with the voxel size, the EditLog a save stores (serializeEditLog). */
  exportEdits(layer: string = MANUAL_EDIT_LAYER): { voxelSizeM: number; edits: WorldEdit[] } {
    this.assertRecording('exportEdits');
    const edits: WorldEdit[] = [];
    for (let i = 0; i < this.editLog.length; i++) if (this.editLayers[i] === layer) edits.push(cloneEdit(this.editLog[i] as WorldEdit));
    return { voxelSizeM: this.voxelSizeM, edits };
  }

  /**
   * Applies a saved log under `layer` on top of the current world. A log recorded at another voxel size
   * addresses different space and is rejected before anything is written. Returns every dirty chunk key.
   */
  importEdits(log: { voxelSizeM: number; edits: readonly WorldEdit[] }, layer: string = MANUAL_EDIT_LAYER): ChunkKey[] {
    if (log.voxelSizeM !== this.voxelSizeM) {
      throw new RangeError(
        `ChunkWorldStore: importEdits log was recorded at ${log.voxelSizeM} m voxels, the store uses ${this.voxelSizeM} m`,
      );
    }
    const dirty = new Set<ChunkKey>();
    for (const e of log.edits) for (const key of this.applyEdit(e, layer)) dirty.add(key);
    return [...dirty].sort((a, b) => a - b);
  }

  /**
   * Removes the edits of one layer, or of all layers (mission restart: back to the pristine site). The chunks
   * they changed are regenerated and the remaining edits replayed into them. Returns the keys of every chunk
   * whose mesh may have changed, also delivered to onDirty listeners.
   */
  resetEdits(layer?: string): ChunkKey[] {
    this.assertRecording('resetEdits');
    if (this.editing) throw new Error('ChunkWorldStore: resetEdits called from inside an edit');
    const drop = new Uint8Array(this.editLog.length);
    let dropped = 0;
    for (let i = 0; i < drop.length; i++) {
      if (layer === undefined || this.editLayers[i] === layer) {
        drop[i] = 1;
        dropped++;
      }
    }
    if (dropped === 0) return [];
    // New position of every kept edit.
    const moved = new Int32Array(drop.length);
    let kept = 0;
    for (let i = 0; i < drop.length; i++) {
      if (drop[i] === 1) continue;
      this.editLog[kept] = this.editLog[i] as WorldEdit;
      this.editLayers[kept] = this.editLayers[i] as string;
      moved[i] = kept++;
    }
    this.editLog.length = kept;
    this.editLayers.length = kept;

    const dirty = new Set<ChunkKey>();
    for (const [key, list] of [...this.editIndex]) {
      if (!list.some((n) => drop[n] === 1)) {
        for (let i = 0; i < list.length; i++) list[i] = moved[list[i] as number] as number;
        continue;
      }
      const rest: number[] = [];
      for (const n of list) if (drop[n] === 0) rest.push(moved[n] as number);
      if (rest.length === 0) this.editIndex.delete(key);
      else this.editIndex.set(key, rest);
      // Regenerated on the next read, with the remaining edits replayed.
      this.chunks.delete(key);
      const c = unpackChunkKey(key);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dy = -1; dy <= 1; dy++) {
            const cx = c.cx + dx;
            const cy = c.cy + dy;
            const cz = c.cz + dz;
            if (cx < CX_MIN || cx > CX_MAX || cz < CX_MIN || cz > CX_MAX || cy < CY_MIN || cy > CY_MAX) continue;
            dirty.add(pack(cx, cy, cz));
          }
        }
      }
    }
    this.lastChunk = undefined;
    const keys = [...dirty].sort((a, b) => a - b);
    if (keys.length > 0) for (const cb of [...this.listeners]) cb(keys);
    return keys;
  }

  /** Estimated bytes of the resident chunks (what `budgetBytes` limits). Walks every chunk. */
  get residentBytes(): number {
    let bytes = 0;
    for (const chunk of this.chunks.values()) bytes += chunkBytes(chunk);
    return bytes;
  }

  /** Chunks evicted by trim() so far. */
  get evictedChunks(): number {
    return this.evictedTotal;
  }

  /**
   * Evicts least recently used chunks until the resident data fits the budget (down to three quarters of
   * it, so the next call has room). Chunks inside a `keep` box stay, as do chunks edited while edits are
   * not recorded. Voxels never change: an evicted chunk is regenerated, edits included, when it is read again.
   */
  trim(options: TrimOptions = {}): TrimResult {
    if (this.editing) throw new Error('ChunkWorldStore: trim called from inside an edit');
    const budget = options.budgetBytes ?? this.budgetBytes;
    if (!(budget > 0)) throw new RangeError(`ChunkWorldStore: trim budgetBytes must be > 0, got ${budget}`);
    let bytes = this.residentBytes;
    if (bytes <= budget) return { evicted: 0, chunks: this.chunks.size, residentBytes: bytes };
    const keep = options.keep ?? [];
    // Chunk coordinate ranges of the protected boxes, inclusive.
    const boxes: number[] = [];
    for (const box of keep) {
      if (box.max.x <= box.min.x || box.max.y <= box.min.y || box.max.z <= box.min.z) continue;
      boxes.push(box.min.x >> 5, (box.max.x - 1) >> 5, box.min.y >> 5, (box.max.y - 1) >> 5, box.min.z >> 5, (box.max.z - 1) >> 5);
    }
    const candidates: Chunk[] = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.pinned) continue;
      let kept = false;
      for (let i = 0; i < boxes.length && !kept; i += 6) {
        kept =
          chunk.cx >= (boxes[i] as number) &&
          chunk.cx <= (boxes[i + 1] as number) &&
          chunk.cy >= (boxes[i + 2] as number) &&
          chunk.cy <= (boxes[i + 3] as number) &&
          chunk.cz >= (boxes[i + 4] as number) &&
          chunk.cz <= (boxes[i + 5] as number);
      }
      if (!kept) candidates.push(chunk);
    }
    candidates.sort((p, q) => p.used - q.used);
    const target = budget * TRIM_TARGET;
    let evicted = 0;
    for (const chunk of candidates) {
      if (bytes <= target) break;
      bytes -= chunkBytes(chunk);
      this.chunks.delete(chunk.key);
      evicted++;
    }
    if (evicted > 0) this.lastChunk = undefined;
    this.evictedTotal += evicted;
    return { evicted, chunks: this.chunks.size, residentBytes: bytes };
  }

  /**
   * Swaps the terrain input: another site, or none (all AIR). Every chunk, the column cache and all edits
   * are dropped; nothing is reported dirty, so whoever shows chunks must start over (ChunkStreamer.reset).
   */
  setSource(source: ColumnSource | undefined, materialAt?: SubsurfaceMaterialFn): void {
    if (this.editing) throw new Error('ChunkWorldStore: setSource called from inside an edit');
    this.source = source;
    if (materialAt !== undefined) this.materialAt = materialAt;
    this.chunks.clear();
    this.columns.clear();
    this.editLog.length = 0;
    this.editLayers.length = 0;
    this.editIndex.clear();
    this.lastChunk = undefined;
    this.lastChanged = 0;
  }

  private assertRecording(what: string): void {
    if (!this.recordEdits) throw new Error(`ChunkWorldStore: ${what} needs the edit log, this store was created with recordEdits: false`);
  }

  private generate(key: ChunkKey, cx: number, cy: number, cz: number): Chunk {
    const chunk: Chunk = { key, palette: Uint16Array.of(AIR), indices: null, cx, cy, cz, mask: 0, used: 0, pinned: false };
    if (this.source === undefined) return chunk;
    const col = this.columnBlock(cx, cz);
    const y0 = cy * N;
    if (y0 >= col.maxTop) return chunk;

    const { groundTop, waterTop, buildingBase, buildingTop, surfaceMaterial, buildingMaterial, columnClass, surfaceM } = col;
    const materialAt = this.materialAt;
    const s = this.voxelSizeM;
    const out = this.scratch;
    for (let lz = 0; lz < N; lz++) {
      for (let lx = 0; lx < N; lx++) {
        const c = lx + lz * N;
        const g = (groundTop[c] as number) - y0;
        const ground = Math.max(0, Math.min(g, N));
        let i = c;
        if (ground > 0) {
          const sM = surfaceM[c] as number;
          const cls = columnClass[c] as number;
          const cap = surfaceMaterial[c] as number;
          for (let ly = 0; ly < ground; ly++) {
            let m: number;
            if (cap !== 0 && ly === g - 1) {
              m = cap;
            } else {
              // Depth of the voxel's top face below the column's top ground voxel, in metres.
              const depth = (g - 1 - ly) * s;
              m = materialAt(sM, depth, cls);
              if (!(m >= 0 && m <= MAX_MATERIAL) || (m | 0) !== m) {
                throw new RangeError(`ChunkWorldStore: materialAt(${sM}, ${depth}, ${cls}) returned ${m}, not a u16 material id`);
              }
            }
            out[i] = m;
            i += AREA;
          }
        }
        if (ground < N) {
          const bm = buildingMaterial[c] as number;
          const bb = (buildingBase[c] as number) - y0;
          const bt = bm === 0 ? NONE : (buildingTop[c] as number) - y0;
          const wt = (waterTop[c] as number) - y0;
          for (let ly = ground; ly < N; ly++) {
            out[i] = ly >= bb && ly < bt ? bm : ly < wt ? WATER : AIR;
            i += AREA;
          }
        }
      }
    }

    // Palette-encode the scratch in place.
    const slotOf = this.slotOf;
    const palette: number[] = [];
    let lastMaterial = -1;
    let lastSlot = 0;
    for (let i = 0; i < VOLUME; i++) {
      const m = out[i] as number;
      if (m !== lastMaterial) {
        let slot = slotOf[m] as number;
        if (slot < 0) {
          slot = palette.length;
          slotOf[m] = slot;
          palette.push(m);
        }
        lastMaterial = m;
        lastSlot = slot;
      }
      out[i] = lastSlot;
    }
    for (const m of palette) slotOf[m] = -1;
    chunk.palette = Uint16Array.from(palette);
    if (palette.length > 1) chunk.indices = palette.length <= 256 ? new Uint8Array(out) : out.slice();
    return chunk;
  }

  private columnBlock(cx: number, cz: number): ColumnBlock {
    const columnKey = (cx - CX_MIN) * 16384 + (cz - CX_MIN);
    const cached = this.columns.get(columnKey);
    if (cached !== undefined) return cached;
    const source = this.source;
    if (source === undefined) throw new Error('ChunkWorldStore: columnBlock called without a source');
    const block: ColumnBlock = {
      groundTop: new Int32Array(AREA),
      waterTop: new Int32Array(AREA),
      buildingBase: new Int32Array(AREA),
      buildingTop: new Int32Array(AREA),
      surfaceMaterial: new Uint16Array(AREA),
      buildingMaterial: new Uint16Array(AREA),
      columnClass: new Uint8Array(AREA),
      surfaceM: new Float64Array(AREA),
      maxTop: NONE,
    };
    const s = this.voxelSizeM;
    const sample = this.sample;
    let maxTop = NONE;
    for (let lz = 0; lz < N; lz++) {
      const zM = (cz * N + lz + 0.5) * s;
      for (let lx = 0; lx < N; lx++) {
        const xM = (cx * N + lx + 0.5) * s;
        source.sampleColumn(xM, zM, sample);
        const c = lx + lz * N;
        const ground = toLayers(sample.surfaceM, s, 'surfaceM', xM, zM);
        const water = toLayers(sample.waterLevelM, s, 'waterLevelM', xM, zM);
        block.groundTop[c] = ground;
        block.waterTop[c] = water;
        block.surfaceM[c] = sample.surfaceM;
        block.surfaceMaterial[c] = toMaterial(sample.surfaceMaterial, 'surfaceMaterial', xM, zM);
        const cls = sample.columnClass;
        if (!(cls >= 0 && cls <= 0xff) || (cls | 0) !== cls) {
          throw new RangeError(`ChunkWorldStore: ColumnSource returned columnClass = ${cls} at (${xM}, ${zM}) m, not a byte`);
        }
        block.columnClass[c] = cls;
        if (ground > maxTop) maxTop = ground;
        if (water > maxTop) maxTop = water;
        const bm = toMaterial(sample.buildingMaterial, 'buildingMaterial', xM, zM);
        block.buildingMaterial[c] = bm;
        if (bm !== 0) {
          const top = toLayers(sample.buildingTopM, s, 'buildingTopM', xM, zM);
          block.buildingBase[c] = toLayers(sample.buildingBaseM, s, 'buildingBaseM', xM, zM);
          block.buildingTop[c] = top;
          if (top > maxTop) maxTop = top;
        }
      }
    }
    block.maxTop = maxTop;
    if (this.columns.size >= this.columnCacheSize) {
      // Drop the oldest block; it is pure derived data and is rebuilt on demand.
      const oldest = this.columns.keys().next();
      if (!oldest.done) this.columns.delete(oldest.value);
    }
    this.columns.set(columnKey, block);
    return block;
  }
}

/** Metres to a count of voxel layers (voxel y is below the height iff y < layers). -Infinity maps to NONE. */
function toLayers(heightM: number, voxelSizeM: number, field: string, xM: number, zM: number): number {
  if (heightM === Number.NEGATIVE_INFINITY) return NONE;
  const layers = Math.round(heightM / voxelSizeM);
  if (!(layers > -HEIGHT_LIMIT && layers < HEIGHT_LIMIT)) {
    throw new RangeError(`ChunkWorldStore: ColumnSource returned ${field} = ${heightM} at (${xM}, ${zM}) m`);
  }
  return layers;
}

function toMaterial(id: number, field: string, xM: number, zM: number): number {
  if (!(id >= 0 && id <= MAX_MATERIAL) || (id | 0) !== id) {
    throw new RangeError(`ChunkWorldStore: ColumnSource returned ${field} = ${id} at (${xM}, ${zM}) m, not a u16 material id`);
  }
  return id;
}

/** Exact voxel-centre test, same arithmetic as the testkit reference: x, py, pz are relative to endpoint a. */
function inCapsule(x: number, py: number, pz: number, c: number, dx: number, dy: number, dz: number, len2: number, r2: number): boolean {
  let t = len2 === 0 ? 0 : (x * dx + c) / len2;
  t = Math.max(0, Math.min(1, t));
  const ex = x - t * dx;
  const ey = py - t * dy;
  const ez = pz - t * dz;
  return ex * ex + ey * ey + ez * ez <= r2;
}

/** Palette slot of a material in a chunk about to be written, appending and materializing as needed. */
function slotFor(chunk: Chunk, material: number): number {
  const palette = chunk.palette;
  let slot = -1;
  for (let i = 0; i < palette.length; i++) {
    if (palette[i] === material) {
      slot = i;
      break;
    }
  }
  if (slot < 0) {
    slot = palette.length;
    const grown = new Uint16Array(slot + 1);
    grown.set(palette);
    grown[slot] = material;
    chunk.palette = grown;
  }
  if (chunk.indices === null) {
    chunk.indices = new Uint8Array(VOLUME); // all slot 0: the former uniform material
  }
  if (slot > 0xff && chunk.indices instanceof Uint8Array) {
    chunk.indices = new Uint16Array(chunk.indices);
  }
  return slot;
}

/** Drops the indices of a chunk whose voxels have all become one material (uniform elision after edits). */
function collapseIfUniform(chunk: Chunk): void {
  const indices = chunk.indices;
  if (indices === null) return;
  const first = indices[0] as number;
  for (let i = 1; i < VOLUME; i++) if (indices[i] !== first) return;
  chunk.palette = Uint16Array.of(chunk.palette[first] as number);
  chunk.indices = null;
}

function chunkBytes(chunk: Chunk): number {
  return CHUNK_OVERHEAD_BYTES + chunk.palette.byteLength + (chunk.indices === null ? 0 : chunk.indices.byteLength);
}

function assertVoxel(x: number, y: number, z: number, what: string): void {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    !Number.isInteger(z) ||
    x < INT32_MIN ||
    x > INT32_MAX ||
    y < INT32_MIN ||
    y > INT32_MAX ||
    z < INT32_MIN ||
    z > INT32_MAX
  ) {
    throw new RangeError(`ChunkWorldStore: ${what} must be an int32 voxel coordinate, got (${x}, ${y}, ${z})`);
  }
}

function assertMaterial(material: number, what: string): void {
  if (!Number.isInteger(material) || material < 0 || material > MAX_MATERIAL) {
    throw new RangeError(`ChunkWorldStore: ${what} material id out of u16 range: ${material}`);
  }
}

/** Throws before any write if an edit's voxel bounding box (inclusive) leaves the chunk key range. */
function assertChunkRange(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, what: string): void {
  const lo = CX_MIN * N;
  const hi = CX_MAX * N + N - 1;
  const yLo = CY_MIN * N;
  const yHi = CY_MAX * N + N - 1;
  if (x0 < lo || x1 > hi || z0 < lo || z1 > hi || y0 < yLo || y1 > yHi) {
    throw new RangeError(
      `ChunkWorldStore: ${what} reaches (${x0}, ${y0}, ${z0}) to (${x1}, ${y1}, ${z1}), outside the world ` +
        `x,z [${lo}, ${hi}] y [${yLo}, ${yHi}]`,
    );
  }
}

function cloneEdit(e: WorldEdit): WorldEdit {
  switch (e.t) {
    case 'fillBox':
      return {
        t: 'fillBox',
        min: { x: e.min.x, y: e.min.y, z: e.min.z },
        max: { x: e.max.x, y: e.max.y, z: e.max.z },
        material: e.material,
      };
    case 'carveCapsule':
      return { t: 'carveCapsule', a: { x: e.a.x, y: e.a.y, z: e.a.z }, b: { x: e.b.x, y: e.b.y, z: e.b.z }, radius: e.radius };
    case 'setVoxels':
      return { t: 'setVoxels', coords: e.coords.slice(), materials: e.materials.slice() };
  }
}
