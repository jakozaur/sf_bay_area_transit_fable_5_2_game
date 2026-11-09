import { CHUNK_SIZE, Material, type MeshInput, PADDED_VOLUME, paddedIndex } from '@bayvox/core';
import { afterEach, describe, expect, test } from 'vitest';
import { meshChunk, meshChunkFlat } from './mesh-chunk.ts';
import { COLUMN_GRID_LENGTH, type ColumnMeshInput, meshColumnPatch } from './mesh-columns.ts';
import { createMesherPool, createSyncMesherPool, defaultPoolSize, type MesherEndpoint, type MesherPool } from './pool.ts';
import { type MesherRequest, type MesherResponse, serveMesher } from './protocol.ts';
import { createMesherScratch } from './scratch.ts';
import { randomPadded } from './test-helpers.ts';

const scratch = createMesherScratch();
const SOLIDS = [Material.FILL, Material.ROCK, Material.WATER];

/**
 * A "worker" on a MessageChannel: the server half runs the real worker handler (serveMesher), and messages
 * cross a real structured-clone boundary with transfer lists, as with a dedicated worker.
 */
function channelEndpoint(log?: number[], index = 0): MesherEndpoint & { fail(message: string): void } {
  const channel = new MessageChannel();
  serveMesher(channel.port2, createMesherScratch());
  let onError: ((message: string) => void) | undefined;
  return {
    post(request: MesherRequest, transfer: Transferable[]) {
      log?.push(index);
      channel.port1.postMessage(request, transfer);
    },
    listen(onResponse, error) {
      onError = error;
      channel.port1.onmessage = (event) => onResponse(event.data as MesherResponse);
    },
    close() {
      channel.port1.close();
      channel.port2.close();
    },
    fail(message: string) {
      onError?.(message);
    },
  };
}

function chunkInput(pool: MesherPool, seed: number): { input: MeshInput; copy: MeshInput } {
  const source = randomPadded(seed, 0.4, SOLIDS);
  const padded = pool.takePadded();
  padded.set(source);
  return { input: { key: seed, size: CHUNK_SIZE, padded }, copy: { key: seed, size: CHUNK_SIZE, padded: source } };
}

function columnInput(): ColumnMeshInput {
  const heights = new Int16Array(COLUMN_GRID_LENGTH);
  const classes = new Uint16Array(COLUMN_GRID_LENGTH);
  for (let i = 0; i < COLUMN_GRID_LENGTH; i++) {
    heights[i] = (i * 7) % 50;
    classes[i] = i % 5 === 0 ? Material.WATER : Material.GRASS;
  }
  return { key: 3, size: 32, heights, classes };
}

let pools: MesherPool[] = [];
function track(pool: MesherPool): MesherPool {
  pools.push(pool);
  return pool;
}
afterEach(() => {
  for (const pool of pools) pool.dispose();
  pools = [];
});

const variants: [string, () => MesherPool][] = [
  ['sync fallback', () => createSyncMesherPool()],
  ['3 message-channel workers', () => createMesherPool([channelEndpoint(), channelEndpoint(), channelEndpoint()])],
];

describe.each(variants)('mesher pool: %s', (_name, make) => {
  test('chunk jobs give exactly the direct meshChunk output', async () => {
    const pool = track(make());
    const jobs = [];
    const expected = [];
    for (let seed = 1; seed <= 8; seed++) {
      const { input, copy } = chunkInput(pool, seed);
      const ao = seed % 2 === 0;
      jobs.push(pool.meshChunk(input, { ao }));
      expected.push(ao ? meshChunk(copy, scratch) : meshChunkFlat(copy, scratch));
    }
    expect(pool.pending).toBe(8);
    const results = await Promise.all(jobs);
    expect(results).toEqual(expected);
    expect(pool.pending).toBe(0);
    // AO is the default.
    const { input, copy } = chunkInput(pool, 20);
    expect(await pool.meshChunk(input)).toEqual(meshChunk(copy, scratch));
  });

  test('padded input is transferred away and recycled through takePadded', async () => {
    const pool = track(make());
    const { input } = chunkInput(pool, 5);
    const buffer = input.padded;
    const job = pool.meshChunk(input);
    expect(buffer.length).toBe(0); // detached: the caller cannot reuse it by accident
    const mesh = await job;
    expect(mesh.quads.length).toBeGreaterThan(0);
    expect(mesh.quads.byteLength).toBe(mesh.quads.buffer.byteLength);
    const recycled = pool.takePadded();
    expect(recycled.length).toBe(PADDED_VOLUME);
    expect(recycled[paddedIndex(0, 0, 0)]).toBe(randomPadded(5, 0.4, SOLIDS)[paddedIndex(0, 0, 0)]);
    // Free list is now empty: the next one is fresh and zeroed.
    expect(pool.takePadded().every((v) => v === 0)).toBe(true);
  });

  test('column jobs give the direct output and leave the caller arrays intact', async () => {
    const pool = track(make());
    const input = columnInput();
    const slabs = await pool.meshColumns(input);
    expect(input.heights.length).toBe(COLUMN_GRID_LENGTH);
    expect(input.classes.length).toBe(COLUMN_GRID_LENGTH);
    expect(slabs).toEqual(meshColumnPatch(input, scratch));
    // Heights 0..49: the top cell of a height-0 column is y = -1, so slabs -1, 0 and 1.
    expect(slabs.map((s) => s.slab)).toEqual([-1, 0, 1]);
  });

  test('a failing job rejects with the job named and the pool keeps working', async () => {
    const pool = track(make());
    const padded = pool.takePadded();
    padded[paddedIndex(1, 2, 3)] = 4000;
    await expect(pool.meshChunk({ key: 77, size: CHUNK_SIZE, padded })).rejects.toThrow(
      'mesher job chunk key 77: meshChunk: unknown material id 4000 at chunk-local (1, 2, 3)',
    );
    const { input, copy } = chunkInput(pool, 6);
    expect(await pool.meshChunk(input)).toEqual(meshChunk(copy, scratch));
  });

  test('rejects inputs it cannot transfer safely', async () => {
    const pool = track(make());
    const big = new Uint16Array(PADDED_VOLUME * 2);
    await expect(pool.meshChunk({ key: 9, size: CHUNK_SIZE, padded: big.subarray(0, PADDED_VOLUME) })).rejects.toThrow(
      'chunk 9: padded must own a whole 39304-entry buffer',
    );
    expect(big.length).toBe(PADDED_VOLUME * 2);
    await expect(pool.meshChunk({ key: 9, size: 16, padded: pool.takePadded() })).rejects.toThrow('size must be 32, got 16');
    await expect(pool.meshColumns({ ...columnInput(), classes: new Uint16Array(3) })).rejects.toThrow(
      'patch 3: heights and classes must have 1156',
    );
  });

  test('dispose rejects queued, running and later jobs', async () => {
    const pool = track(make());
    const jobs = [];
    for (let seed = 1; seed <= 5; seed++) jobs.push(pool.meshChunk(chunkInput(pool, seed).input));
    pool.dispose();
    const settled = await Promise.allSettled(jobs);
    for (const s of settled) {
      expect(s.status).toBe('rejected');
      if (s.status === 'rejected') expect(String(s.reason)).toContain('mesher pool is disposed');
    }
    await expect(pool.meshColumns(columnInput())).rejects.toThrow('mesher pool is disposed');
    expect(pool.pending).toBe(0);
  });
});

describe('mesher pool scheduling', () => {
  test('one job per worker at a time, first in first out', async () => {
    const log: number[] = [];
    const pool = track(createMesherPool([channelEndpoint(log, 0), channelEndpoint(log, 1)]));
    expect(pool.size).toBe(2);
    const order: number[] = [];
    const jobs = [];
    for (let seed = 1; seed <= 6; seed++) {
      jobs.push(pool.meshChunk(chunkInput(pool, seed).input).then((mesh) => order.push(mesh.key)));
    }
    // Only two jobs are posted up front; the rest wait in the queue.
    expect(log.length).toBe(2);
    expect(new Set(log).size).toBe(2);
    await Promise.all(jobs);
    expect(log.length).toBe(6);
    expect([...order].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(log.filter((w) => w === 0).length).toBeGreaterThan(0);
    expect(log.filter((w) => w === 1).length).toBeGreaterThan(0);
  });

  test('a crashed worker rejects its job; the others take over; no workers left rejects everything', async () => {
    const a = channelEndpoint();
    const b = channelEndpoint();
    const pool = track(createMesherPool([a, b]));
    const first = pool.meshChunk(chunkInput(pool, 1).input); // goes to the last idle worker: b
    const second = pool.meshChunk(chunkInput(pool, 2).input); // a
    b.fail('script error');
    await expect(first).rejects.toThrow('mesher worker 1 failed: script error');
    expect((await second).key).toBe(2);
    expect((await pool.meshChunk(chunkInput(pool, 3).input)).key).toBe(3);
    const third = pool.meshChunk(chunkInput(pool, 4).input);
    const queued = pool.meshChunk(chunkInput(pool, 5).input);
    a.fail('out of memory');
    await expect(third).rejects.toThrow('mesher worker 0 failed: out of memory');
    await expect(queued).rejects.toThrow('mesher pool has no live workers; last failure: out of memory');
    await expect(pool.meshChunk(chunkInput(pool, 6).input)).rejects.toThrow('mesher pool has no live workers');
  });

  test('pool size rule: hardwareConcurrency - 1, clamped to 1..6', () => {
    expect([1, 2, 3, 4, 7, 8, 10, 64].map(defaultPoolSize)).toEqual([1, 1, 2, 3, 6, 6, 6, 6]);
    expect(() => defaultPoolSize(0)).toThrow('hardwareConcurrency must be a positive integer, got 0');
    expect(() => defaultPoolSize(Number.NaN)).toThrow('got NaN');
    expect(() => createMesherPool([])).toThrow('needs at least one endpoint');
  });
});
