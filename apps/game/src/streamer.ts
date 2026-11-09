/**
 * Chunk streaming: keeps the near field around the camera focus meshed and uploaded, and remeshes chunks the
 * world reports dirty. Meshing goes through a MesherPool (workers, or the in-thread pool as fallback).
 */
import {
  CHUNK_SIZE,
  type ChunkKey,
  type ChunkRenderer,
  Material,
  type MeshInput,
  type MeshOutput,
  packChunkKey,
  type WorldStore,
} from '@bayvox/core';

/** The part of a mesher pool the streamer uses (packages/mesher MesherPool satisfies it). */
export interface StreamMesher {
  readonly size: number;
  /** Takes ownership of `input.padded`. */
  meshChunk(input: MeshInput): Promise<MeshOutput>;
  /** A PADDED_VOLUME buffer to fill and hand to meshChunk. */
  takePadded(): Uint16Array;
}

export interface StreamerOptions {
  world: WorldStore;
  mesher: StreamMesher;
  renderer: Pick<ChunkRenderer, 'upload' | 'remove'>;
  /** Near field half-width in chunks: columns [focus - radius, focus + radius) on x and z. */
  radius: number;
  /** Vertical chunk range, inclusive. */
  minCy: number;
  maxCy: number;
  /** Optional horizontal chunk limits, inclusive: nothing outside is requested (a bounded world). */
  bounds?: { minCx: number; maxCx: number; minCz: number; maxCz: number };
  /** Jobs handed to the mesher at once. Default 2 per worker. */
  maxInFlight?: number;
  /**
   * Dispatch more work as soon as a result arrives instead of waiting for the next pump. Right for real workers;
   * wrong for the in-thread pool, where it would mesh the whole queue without yielding a frame.
   */
  continuous: boolean;
  /** Called once with the first failure (world load or mesher). The streamer stops dispatching afterwards. */
  onError: (err: Error) => void;
}

const AIR = Material.AIR;

interface Slot {
  /** Bumped by every dirty notification; a result for an older version is dropped. */
  version: number;
  /** True once the slot's current content has been uploaded (or found to be empty). */
  ready: boolean;
  /** True if the world has voxel data for the chunk. */
  hasData: boolean;
  /** Mesh jobs running for this slot. */
  inFlight: number;
}

export class ChunkStreamer {
  private readonly o: StreamerOptions;
  private readonly maxInFlight: number;
  /** Every chunk of the current near field, queued or done. */
  private readonly slots = new Map<ChunkKey, Slot>();
  /** Keys waiting for a first mesh, farthest first (pop takes the nearest). */
  private pending: ChunkKey[] = [];
  /** Dirty keys waiting for a remesh; served before `pending`. */
  private readonly urgent: ChunkKey[] = [];
  private readonly urgentSet = new Set<ChunkKey>();
  private inFlight = 0;
  private loading = 0;
  private generation = 0;
  private focusCx = Number.NaN;
  private focusCz = Number.NaN;
  private failed = false;
  /** Chunk columns of the current near field, inclusive; null before the first focus or when it is empty. */
  private box: { x0: number; x1: number; z0: number; z1: number } | null = null;
  private dataCount = 0;
  private jobsDone = 0;
  private readonly unsubscribe: () => void;

  constructor(options: StreamerOptions) {
    if (!Number.isInteger(options.radius) || options.radius < 1) {
      throw new RangeError(`ChunkStreamer: radius must be a positive integer, got ${options.radius}`);
    }
    if (!Number.isInteger(options.minCy) || !Number.isInteger(options.maxCy) || options.maxCy < options.minCy) {
      throw new RangeError(`ChunkStreamer: bad vertical chunk range [${options.minCy}, ${options.maxCy}]`);
    }
    this.o = options;
    this.maxInFlight = options.maxInFlight ?? options.mesher.size * 2;
    this.unsubscribe = options.world.onDirty((keys) => this.markDirty(keys));
  }

  /** True when nothing is loading, queued or being meshed: the near field on screen is complete. */
  get idle(): boolean {
    return this.loading === 0 && this.inFlight === 0 && this.pending.length === 0 && this.urgent.length === 0;
  }

  /** Near-field chunks that are meshed and uploaded (or known empty) and that the world has data for. */
  get chunksLoaded(): number {
    return this.dataCount;
  }

  /** Near-field chunk slots, including all-air ones. */
  get slotCount(): number {
    return this.slots.size;
  }

  get queued(): number {
    return this.pending.length + this.urgent.length + this.inFlight;
  }

  /** Plan rectangle the near field covers in world voxels [minX, minZ, maxX, maxZ), or null if it is empty. */
  get nearBox(): [number, number, number, number] | null {
    const b = this.box;
    return b === null ? null : [b.x0 * CHUNK_SIZE, b.z0 * CHUNK_SIZE, (b.x1 + 1) * CHUNK_SIZE, (b.z1 + 1) * CHUNK_SIZE];
  }

  /** Mesh jobs completed since start (first meshes and remeshes). */
  get meshJobs(): number {
    return this.jobsDone;
  }

  /** Moves the near field to the chunk column containing a world position (metres). Cheap when the column is unchanged. */
  setFocus(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError(`ChunkStreamer.setFocus: focus is not finite: (${x}, ${z})`);
    const cx = Math.round(x / CHUNK_SIZE);
    const cz = Math.round(z / CHUNK_SIZE);
    if (cx === this.focusCx && cz === this.focusCz) return;
    this.focusCx = cx;
    this.focusCz = cz;
    const { radius, minCy, maxCy, bounds } = this.o;
    let x0 = cx - radius;
    let x1 = cx + radius - 1;
    let z0 = cz - radius;
    let z1 = cz + radius - 1;
    if (bounds !== undefined) {
      x0 = Math.max(x0, bounds.minCx);
      x1 = Math.min(x1, bounds.maxCx);
      z0 = Math.max(z0, bounds.minCz);
      z1 = Math.min(z1, bounds.maxCz);
    }

    // Drop slots that left the near field.
    for (const [key, slot] of this.slots) {
      const c = unpack(key);
      if (c.cx >= x0 && c.cx <= x1 && c.cz >= z0 && c.cz <= z1) continue;
      this.forget(key, slot);
    }
    const gen = ++this.generation;
    this.pending = [];
    this.box = x1 < x0 || z1 < z0 ? null : { x0, x1, z0, z1 };
    if (this.box === null) return;

    const fresh: ChunkKey[] = [];
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        for (let iy = minCy; iy <= maxCy; iy++) {
          const key = packChunkKey(ix, iy, iz);
          const slot = this.slots.get(key);
          if (slot === undefined) {
            this.slots.set(key, { version: 0, ready: false, hasData: false, inFlight: 0 });
            fresh.push(key);
          } else if (!slot.ready && !this.urgentSet.has(key)) {
            // Was pending under the previous focus: requeue with the new priority. A job already in flight
            // for it resolves against the same version and marks it ready; the duplicate is then skipped.
            fresh.push(key);
          }
        }
      }
    }
    this.loading++;
    this.o.world
      .ensureLoaded({
        min: { x: x0 * CHUNK_SIZE, y: minCy * CHUNK_SIZE, z: z0 * CHUNK_SIZE },
        max: { x: (x1 + 1) * CHUNK_SIZE, y: (maxCy + 1) * CHUNK_SIZE, z: (z1 + 1) * CHUNK_SIZE },
      })
      .then(
        () => {
          this.loading--;
          if (gen !== this.generation) return;
          // Farthest first, so pop() serves the chunks nearest the focus.
          const dist = (key: ChunkKey): number => {
            const c = unpack(key);
            return Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz)) * 4 + Math.abs(c.cy);
          };
          this.pending = fresh.filter((k) => this.slots.has(k)).sort((p, q) => dist(q) - dist(p));
        },
        (err: unknown) => {
          this.loading--;
          this.fail(err);
        },
      );
  }

  /** Hands queued chunks to the mesher, up to the in-flight limit. Call once per frame. */
  pump(): void {
    if (this.failed) return;
    while (this.inFlight < this.maxInFlight) {
      let key = this.urgent.pop();
      const isUrgent = key !== undefined;
      if (key !== undefined) this.urgentSet.delete(key);
      else key = this.pending.pop();
      if (key === undefined) return;
      const slot = this.slots.get(key);
      if (slot === undefined) continue;
      // A pending key can be reached twice after a focus change: the second visit finds it done or under way.
      // An urgent key is always meshed again: a job already running for it saw the voxels before the edit.
      if (slot.ready || (!isUrgent && slot.inFlight > 0)) continue;
      this.dispatch(key, slot);
    }
  }

  dispose(): void {
    this.unsubscribe();
    this.failed = true;
    for (const [key, slot] of [...this.slots]) this.forget(key, slot);
    this.pending = [];
    this.urgent.length = 0;
    this.urgentSet.clear();
  }

  private dispatch(key: ChunkKey, slot: Slot): void {
    const { world, mesher, renderer } = this.o;
    const chunk = world.getChunk(key);
    const empty = chunk === undefined || (chunk.indices === null && chunk.palette[0] === AIR);
    if (empty) {
      // An all-air chunk has no faces of its own: nothing to mesh.
      renderer.remove(key);
      this.settle(slot, chunk !== undefined);
      return;
    }
    const version = slot.version;
    const padded = mesher.takePadded();
    world.paddedCopy(key, padded);
    this.inFlight++;
    slot.inFlight++;
    mesher.meshChunk({ key, size: CHUNK_SIZE, padded }).then(
      (mesh) => {
        this.inFlight--;
        slot.inFlight--;
        this.jobsDone++;
        if (this.failed) return;
        const now = this.slots.get(key);
        // Dropped from the near field, or dirtied again while meshing (a newer job is queued).
        if (now === slot && slot.version === version) {
          renderer.upload(mesh);
          this.settle(slot, true);
        }
        if (this.o.continuous) this.pump();
      },
      (err: unknown) => {
        this.inFlight--;
        this.fail(err);
      },
    );
  }

  private settle(slot: Slot, hasData: boolean): void {
    if (slot.ready && slot.hasData) this.dataCount--;
    slot.ready = true;
    slot.hasData = hasData;
    if (hasData) this.dataCount++;
  }

  private forget(key: ChunkKey, slot: Slot): void {
    if (slot.ready && slot.hasData) this.dataCount--;
    this.slots.delete(key);
    this.o.renderer.remove(key);
  }

  private markDirty(keys: ChunkKey[]): void {
    for (const key of keys) {
      const slot = this.slots.get(key);
      if (slot === undefined) continue;
      slot.version++;
      // Still waiting for its first mesh and no job running: that mesh will see the new voxels.
      if (!slot.ready && slot.inFlight === 0) continue;
      if (slot.ready && slot.hasData) this.dataCount--;
      slot.ready = false;
      slot.hasData = false;
      if (!this.urgentSet.has(key)) {
        this.urgentSet.add(key);
        this.urgent.push(key);
      }
    }
  }

  private fail(err: unknown): void {
    if (this.failed) return;
    this.failed = true;
    this.o.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

function unpack(key: ChunkKey): { cx: number; cy: number; cz: number } {
  // Inlined from core's unpackChunkKey without the validation: keys here always come from packChunkKey.
  const cy = (key % 256) - 128;
  const xz = Math.floor(key / 256);
  return { cx: Math.floor(xz / 16384) - 8192, cy, cz: (xz % 16384) - 8192 };
}
