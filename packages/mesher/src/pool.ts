/**
 * Promise-based mesher pool. Jobs are dispatched first in, first out, one job per worker at a time.
 * All bulk data moves by transfer:
 * - meshChunk: `input.padded` is transferred to the worker when the job is dispatched (at once if a
 *   worker is idle, otherwise when it leaves the queue). The caller gives the array up at the call: it
 *   must not be read or written afterwards, and it ends up detached. The buffer returns to the pool's
 *   free list when the job finishes. Get input buffers from takePadded() so steady-state meshing
 *   allocates only the exact-size results.
 * - meshColumns: heights and classes are copied into small job-owned arrays first (7 kB), because they
 *   are usually views into a large raster whose buffer must not be detached.
 *
 * createSyncMesherPool runs the same pool code against an in-thread endpoint with the same transfer
 * semantics (inputs really are detached), for tests and for environments without workers.
 */
import { CHUNK_SIZE, type MeshInput, type MeshOutput, PADDED_VOLUME } from '@bayvox/core';
import { COLUMN_GRID_LENGTH, type ColumnMeshInput, type ColumnSlabMesh } from './mesh-columns.ts';
import { type MesherRequest, type MesherResponse, runMesherRequest } from './protocol.ts';
import { createMesherScratch } from './scratch.ts';

export const MESHER_POOL_MAX_SIZE = 6;

export interface MeshJobOptions {
  /** Bake ambient occlusion (default true). False gives meshChunkFlat output. */
  ao?: boolean;
}

export interface MesherPool {
  /** Number of workers. */
  readonly size: number;
  /** Jobs queued or running. */
  readonly pending: number;
  /** Meshes one chunk. Takes ownership of `input.padded` (transferred to a worker, then recycled). */
  meshChunk(input: MeshInput, options?: MeshJobOptions): Promise<MeshOutput>;
  /** Meshes one column patch into its non-empty slabs. Does not detach the caller's arrays. */
  meshColumns(input: ColumnMeshInput): Promise<ColumnSlabMesh[]>;
  /** A PADDED_VOLUME buffer to fill and pass to meshChunk: recycled if available, else new. Contents are stale. */
  takePadded(): Uint16Array;
  /** Stops all workers. Queued and running jobs reject; later calls reject. */
  dispose(): void;
}

/** Client-side transport to one mesher worker. */
export interface MesherEndpoint {
  post(request: MesherRequest, transfer: Transferable[]): void;
  /** Called once by the pool before the first post. */
  listen(onResponse: (response: MesherResponse) => void, onError: (message: string) => void): void;
  close(): void;
}

/** Pool size rule: hardwareConcurrency - 1, at least 1, at most MESHER_POOL_MAX_SIZE. */
export function defaultPoolSize(hardwareConcurrency: number): number {
  if (!Number.isInteger(hardwareConcurrency) || hardwareConcurrency < 1) {
    throw new RangeError(`defaultPoolSize: hardwareConcurrency must be a positive integer, got ${hardwareConcurrency}`);
  }
  return Math.min(MESHER_POOL_MAX_SIZE, Math.max(1, hardwareConcurrency - 1));
}

interface Job {
  request: MesherRequest;
  transfer: Transferable[];
  resolve: (response: MesherResponse) => void;
  reject: (error: Error) => void;
  worker: number;
}

/** Builds a pool over the given endpoints (one per worker). */
export function createMesherPool(endpoints: MesherEndpoint[]): MesherPool {
  if (endpoints.length === 0) throw new RangeError('createMesherPool: needs at least one endpoint');
  const idle: number[] = [];
  const alive: boolean[] = endpoints.map(() => true);
  const queue: Job[] = [];
  let queueHead = 0;
  const running = new Map<number, Job>();
  const freePadded: Uint16Array[] = [];
  let nextId = 1;
  let disposed = false;

  function pump(): void {
    while (idle.length > 0 && queueHead < queue.length) {
      const job = queue[queueHead++] as Job;
      const worker = idle.pop() as number;
      job.worker = worker;
      running.set(job.request.id, job);
      (endpoints[worker] as MesherEndpoint).post(job.request, job.transfer);
    }
    if (queueHead === queue.length) {
      queue.length = 0;
      queueHead = 0;
    }
  }

  function rejectQueued(reason: string): void {
    for (let i = queueHead; i < queue.length; i++) (queue[i] as Job).reject(new Error(reason));
    queue.length = 0;
    queueHead = 0;
  }

  endpoints.forEach((endpoint, worker) => {
    endpoint.listen(
      (response) => {
        const job = running.get(response.id);
        if (job === undefined) return; // rejected earlier by dispose
        running.delete(response.id);
        idle.push(worker);
        job.resolve(response);
        pump();
      },
      (message) => {
        // The worker itself failed (script error, crash): it will not answer its job and takes no more.
        alive[worker] = false;
        const at = idle.indexOf(worker);
        if (at >= 0) idle.splice(at, 1);
        for (const job of [...running.values()]) {
          if (job.worker !== worker) continue;
          running.delete(job.request.id);
          job.reject(new Error(`mesher worker ${worker} failed: ${message}`));
        }
        if (!alive.includes(true)) rejectQueued(`mesher pool has no live workers; last failure: ${message}`);
      },
    );
    idle.push(worker);
  });

  function submit(request: MesherRequest, transfer: Transferable[]): Promise<MesherResponse> {
    return new Promise<MesherResponse>((resolve, reject) => {
      if (disposed) {
        reject(new Error('mesher pool is disposed'));
        return;
      }
      if (!alive.includes(true)) {
        reject(new Error('mesher pool has no live workers'));
        return;
      }
      queue.push({ request, transfer, resolve, reject, worker: -1 });
      pump();
    });
  }

  return {
    size: endpoints.length,
    get pending() {
      return running.size + (queue.length - queueHead);
    },
    async meshChunk(input, options) {
      const padded = input.padded;
      if (input.size !== CHUNK_SIZE) throw new RangeError(`MesherPool.meshChunk: size must be ${CHUNK_SIZE}, got ${input.size}`);
      if (padded.length !== PADDED_VOLUME || padded.byteOffset !== 0 || padded.buffer.byteLength !== padded.byteLength) {
        throw new RangeError(
          `MesherPool.meshChunk: chunk ${input.key}: padded must own a whole ${PADDED_VOLUME}-entry buffer (use takePadded()), got length ${padded.length}`,
        );
      }
      const id = nextId++;
      const response = await submit({ id, t: 'chunk', key: input.key, padded, ao: options?.ao ?? true }, [padded.buffer]);
      if (!response.ok) throw new Error(response.error);
      if (response.t !== 'chunk') throw new Error(`mesher pool: job ${id} got a ${response.t} response to a chunk request`);
      freePadded.push(response.padded);
      return response.mesh;
    },
    async meshColumns(input) {
      if (input.size !== CHUNK_SIZE) throw new RangeError(`MesherPool.meshColumns: size must be ${CHUNK_SIZE}, got ${input.size}`);
      if (input.heights.length !== COLUMN_GRID_LENGTH || input.classes.length !== COLUMN_GRID_LENGTH) {
        throw new RangeError(
          `MesherPool.meshColumns: patch ${input.key}: heights and classes must have ${COLUMN_GRID_LENGTH} entries, got ${input.heights.length} and ${input.classes.length}`,
        );
      }
      const heights = input.heights.slice();
      const classes = input.classes.slice();
      const id = nextId++;
      const response = await submit({ id, t: 'columns', key: input.key, heights, classes }, [heights.buffer, classes.buffer]);
      if (!response.ok) throw new Error(response.error);
      if (response.t !== 'columns') throw new Error(`mesher pool: job ${id} got a ${response.t} response to a columns request`);
      return response.slabs;
    },
    takePadded() {
      return freePadded.pop() ?? new Uint16Array(PADDED_VOLUME);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const endpoint of endpoints) endpoint.close();
      for (const job of running.values()) job.reject(new Error('mesher pool is disposed'));
      running.clear();
      rejectQueued('mesher pool is disposed');
    },
  };
}

/** Adapts a dedicated module worker running mesher.worker.ts. */
export function workerEndpoint(worker: Worker): MesherEndpoint {
  return {
    post(request, transfer) {
      worker.postMessage(request, transfer);
    },
    listen(onResponse, onError) {
      worker.onmessage = (event) => onResponse(event.data as MesherResponse);
      worker.onerror = (event) => onError(event.message || 'worker error event without a message');
      worker.onmessageerror = () => onError('message could not be deserialized');
    },
    close() {
      worker.terminate();
    },
  };
}

/**
 * Pool of real workers. Default size: defaultPoolSize(navigator.hardwareConcurrency).
 * Browser (Vite) only: the worker URL is resolved by the bundler.
 */
export function createWorkerMesherPool(size?: number): MesherPool {
  const count = size ?? defaultPoolSize(navigator.hardwareConcurrency);
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`createWorkerMesherPool: size must be a positive integer, got ${count}`);
  const endpoints: MesherEndpoint[] = [];
  for (let i = 0; i < count; i++) {
    // Vite detects workers only when `new URL(...)` sits directly inside `new Worker(...)` with literal options.
    endpoints.push(workerEndpoint(new Worker(new URL('./mesher.worker.ts', import.meta.url), { type: 'module', name: 'mesher' })));
  }
  return createMesherPool(endpoints);
}

/** In-thread endpoint: runs each job in a microtask on the calling thread, moving buffers exactly like a worker would. */
export function inlineEndpoint(): MesherEndpoint {
  const scratch = createMesherScratch();
  let respond: ((response: MesherResponse) => void) | undefined;
  let closed = false;
  return {
    post(request, transfer) {
      const received = structuredClone(request, { transfer });
      queueMicrotask(() => {
        if (closed || respond === undefined) return;
        const reply = runMesherRequest(received, scratch);
        respond(structuredClone(reply.response, { transfer: reply.transfer }));
      });
    },
    listen(onResponse) {
      respond = onResponse;
    },
    close() {
      closed = true;
    },
  };
}

/** Synchronous fallback with the same interface and semantics as the worker pool (size 1, no threads). */
export function createSyncMesherPool(): MesherPool {
  return createMesherPool([inlineEndpoint()]);
}
