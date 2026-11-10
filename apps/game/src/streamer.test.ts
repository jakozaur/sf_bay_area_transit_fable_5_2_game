import { type ChunkKey, Material, type MeshOutput, packChunkKey, unpackChunkKey } from '@bayvox/core';
import { createSyncMesherPool } from '@bayvox/mesher';
import { createSyntheticWorld, MemoryWorldStore } from '@bayvox/testkit';
import { ChunkWorldStore, SyntheticColumnSource } from '@bayvox/world';
import { expect, test } from 'vitest';
import { ChunkStreamer, type StreamMesher } from './streamer.ts';

class FakeRenderer {
  readonly meshes = new Map<ChunkKey, MeshOutput>();
  uploads = 0;
  upload(mesh: MeshOutput): void {
    this.meshes.set(mesh.key, mesh);
    this.uploads++;
  }
  remove(key: ChunkKey): void {
    this.meshes.delete(key);
  }
  quads(): number {
    let n = 0;
    for (const m of this.meshes.values()) n += m.quads.length / 2;
    return n;
  }
}

/** Pumps until idle, yielding to promise callbacks between pumps like frames do. */
async function settle(s: ChunkStreamer): Promise<number> {
  let frames = 0;
  while (!s.idle) {
    s.pump();
    await new Promise((r) => setTimeout(r, 0));
    if (++frames > 5000) throw new Error('streamer did not become idle within 5000 pumps');
  }
  return frames;
}

function setup(radius: number, continuous = false) {
  const world = createSyntheticWorld({ sizeChunks: 6, seed: 2 });
  const renderer = new FakeRenderer();
  const errors: Error[] = [];
  const mesher = createSyncMesherPool();
  const streamer = new ChunkStreamer({
    world: world.store,
    mesher,
    renderer,
    radius,
    minCy: -1,
    maxCy: 2,
    continuous,
    onError: (e) => errors.push(e),
  });
  return { world, renderer, errors, streamer, mesher };
}

test('streams the near field around the focus and skips all-air chunks', async () => {
  const { world, renderer, streamer, errors } = setup(2);
  expect(streamer.idle).toBe(true);
  streamer.setFocus(96, 96);
  expect(streamer.idle).toBe(false);
  await settle(streamer);
  expect(errors).toEqual([]);
  // 4 x 4 columns x 4 layers.
  expect(streamer.slotCount).toBe(64);
  const columns = new Set([...renderer.meshes.keys()].map((k) => `${unpackChunkKey(k).cx},${unpackChunkKey(k).cz}`));
  expect([...columns].sort()).toEqual([
    '1,1',
    '1,2',
    '1,3',
    '1,4',
    '2,1',
    '2,2',
    '2,3',
    '2,4',
    '3,1',
    '3,2',
    '3,3',
    '3,4',
    '4,1',
    '4,2',
    '4,3',
    '4,4',
  ]);
  // chunksLoaded counts the slots the store has data for; air above the terrain has none.
  let withData = 0;
  for (let cx = 1; cx <= 4; cx++) {
    for (let cz = 1; cz <= 4; cz++) {
      for (let cy = -1; cy <= 2; cy++) if (world.store.getChunk(packChunkKey(cx, cy, cz)) !== undefined) withData++;
    }
  }
  expect(streamer.chunksLoaded).toBe(withData);
  expect(withData).toBeLessThan(64);
  expect(streamer.meshJobs).toBe(withData);
  expect(renderer.quads()).toBeGreaterThan(1000);
});

test('moving the focus drops chunks that left and meshes only the new ones', async () => {
  const { renderer, streamer } = setup(1);
  streamer.setFocus(64, 64);
  await settle(streamer);
  const before = new Set(renderer.meshes.keys());
  const jobs = streamer.meshJobs;
  streamer.setFocus(64 + 32, 64);
  await settle(streamer);
  for (const key of renderer.meshes.keys()) {
    const c = unpackChunkKey(key);
    expect(c.cx === 2 || c.cx === 3, `cx ${c.cx}`).toBe(true);
  }
  expect([...before].some((k) => unpackChunkKey(k).cx === 1)).toBe(true);
  // One new column pair (cx 3, cz 1..2), at most 4 layers each.
  expect(streamer.meshJobs - jobs).toBeGreaterThan(0);
  expect(streamer.meshJobs - jobs).toBeLessThanOrEqual(8);
  // Same focus column again: nothing to do.
  streamer.setFocus(64 + 40, 70);
  expect(streamer.idle).toBe(true);
});

test('an edit remeshes the dirty chunks and only those', async () => {
  const { world, renderer, streamer } = setup(2);
  streamer.setFocus(96, 96);
  await settle(streamer);
  const quads = renderer.quads();
  const uploads = renderer.uploads;
  const y = world.heightAt(100, 100) - 1;
  const dirty = world.store.applyEdit({ t: 'carveCapsule', a: { x: 100, y, z: 100 }, b: { x: 100, y, z: 100 }, radius: 3 });
  expect(dirty.length).toBeGreaterThan(0);
  expect(streamer.idle).toBe(false);
  await settle(streamer);
  expect(renderer.uploads - uploads).toBe(dirty.length);
  expect(renderer.quads()).not.toBe(quads);
  // An edit outside the near field is ignored.
  world.store.applyEdit({ t: 'fillBox', min: { x: 0, y: 40, z: 0 }, max: { x: 2, y: 42, z: 2 }, material: Material.ROCK });
  expect(streamer.idle).toBe(true);
});

test('an edit made while a chunk is being meshed still reaches the screen', async () => {
  const world = new MemoryWorldStore();
  world.applyEdit({ t: 'fillBox', min: { x: 0, y: 0, z: 0 }, max: { x: 32, y: 8, z: 32 }, material: Material.ROCK });
  const renderer = new FakeRenderer();
  const streamer = new ChunkStreamer({
    world,
    mesher: createSyncMesherPool(),
    renderer,
    radius: 1,
    minCy: 0,
    maxCy: 0,
    bounds: { minCx: 0, maxCx: 0, minCz: 0, maxCz: 0 },
    continuous: false,
    onError: (e) => {
      throw e;
    },
  });
  streamer.setFocus(16, 16);
  await new Promise((r) => setTimeout(r, 0));
  // The job is dispatched with the slab; the hole is carved before its result arrives.
  streamer.pump();
  world.applyEdit({ t: 'fillBox', min: { x: 8, y: 0, z: 8 }, max: { x: 24, y: 8, z: 24 }, material: Material.AIR });
  await settle(streamer);
  expect(streamer.slotCount).toBe(1);
  const mesh = renderer.meshes.get(packChunkKey(0, 0, 0));
  if (mesh === undefined) throw new Error('chunk was not uploaded');
  // A solid 32 x 8 x 32 slab greedy-meshes to 6 quads; the version with the hole needs more.
  expect(mesh.quads.length / 2).toBeGreaterThan(6);
  expect(streamer.meshJobs).toBe(2);
});

test('continuous mode drains the queue without further pumps; failures are reported once', async () => {
  const { streamer, renderer } = setup(2, true);
  streamer.setFocus(96, 96);
  await new Promise((r) => setTimeout(r, 0));
  streamer.pump();
  await new Promise((r) => setTimeout(r, 50));
  expect(streamer.idle).toBe(true);
  expect(renderer.meshes.size).toBeGreaterThan(16);

  const errors: Error[] = [];
  const failing: StreamMesher = {
    size: 1,
    takePadded: () => new Uint16Array(39304),
    meshChunk: (input) => Promise.reject(new Error(`mesher refused chunk ${input.key}`)),
  };
  const world = createSyntheticWorld({ sizeChunks: 2, seed: 2 });
  const s = new ChunkStreamer({
    world: world.store,
    mesher: failing,
    renderer,
    radius: 1,
    minCy: -1,
    maxCy: 0,
    continuous: false,
    onError: (e) => errors.push(e),
  });
  s.setFocus(32, 32);
  await new Promise((r) => setTimeout(r, 0));
  s.pump();
  await new Promise((r) => setTimeout(r, 0));
  s.pump();
  await new Promise((r) => setTimeout(r, 0));
  expect(errors).toHaveLength(1);
  expect(errors[0]?.message).toMatch(/mesher refused chunk/);
});

test('constructor rejects bad ranges', () => {
  const world = new MemoryWorldStore();
  const base = { world, mesher: createSyncMesherPool(), renderer: new FakeRenderer(), continuous: false, onError: () => {} };
  expect(() => new ChunkStreamer({ ...base, radius: 0, minCy: 0, maxCy: 0 })).toThrow(/radius/);
  expect(() => new ChunkStreamer({ ...base, radius: 1, minCy: 2, maxCy: 1 })).toThrow(/vertical chunk range/);
});

/** A ChunkWorldStore on synthetic terrain with a small memory budget, streamed through the fake renderer. */
function setupEvicting(budgetBytes: number) {
  const store = new ChunkWorldStore({ source: new SyntheticColumnSource({ seed: 5 }), budgetBytes });
  const renderer = new FakeRenderer();
  const streamer = new ChunkStreamer({
    world: store,
    mesher: createSyncMesherPool(),
    renderer,
    radius: 2,
    minCy: -1,
    maxCy: 2,
    continuous: false,
    onError: (e) => {
      throw e;
    },
  });
  return { store, renderer, streamer };
}

test('flying evicts chunks behind the near field; coming back shows the same meshes, edits included', async () => {
  const { store, renderer, streamer } = setupEvicting(400_000);
  streamer.setFocus(64, 64);
  await settle(streamer);
  let y = 40;
  while (store.get(70, y, 70) === Material.AIR || store.get(70, y, 70) === Material.WATER) y--;
  store.applyEdit({ t: 'carveCapsule', a: { x: 70, y, z: 70 }, b: { x: 90, y: y - 6, z: 70 }, radius: 3 });
  await settle(streamer);
  const snapshot = new Map([...renderer.meshes].map(([k, m]) => [k, m.quads.slice()]));
  const hash = store.hashRegion({ min: { x: 0, y: -32, z: 0 }, max: { x: 128, y: 96, z: 128 } });

  for (let x = 64; x <= 64 + 32 * 40; x += 32) {
    streamer.setFocus(x, 64);
    await settle(streamer);
  }
  expect(streamer.chunksEvicted).toBeGreaterThan(200);
  // Nothing of the near field (plus its rim) was evicted: the budget is met only as far as that allows.
  expect(store.chunkCount).toBeLessThan(6 * 6 * 6 + 200);
  expect(store.isLoaded(packChunkKey(2, 0, 2))).toBe(false);

  streamer.setFocus(64, 64);
  await settle(streamer);
  expect(store.hashRegion({ min: { x: 0, y: -32, z: 0 }, max: { x: 128, y: 96, z: 128 } })).toBe(hash);
  expect(renderer.meshes.size).toBe(snapshot.size);
  for (const [key, quads] of snapshot) expect(renderer.meshes.get(key)?.quads, `chunk ${key}`).toEqual(quads);
});

test('the secondary focus keeps its window resident without meshing it', async () => {
  const { store, renderer, streamer } = setupEvicting(1);
  // The machine is at (1000, 1000); its ground was generated by a carve.
  store.applyEdit({ t: 'carveCapsule', a: { x: 1000, y: -10, z: 1000 }, b: { x: 1010, y: -10, z: 1000 }, radius: 3 }, 'sim');
  const machineChunk = packChunkKey(31, -1, 31);
  expect(store.isLoaded(machineChunk)).toBe(true);
  streamer.setSecondaryFocus({ x: 1000, z: 1000 });
  streamer.setFocus(64, 64);
  await settle(streamer);
  streamer.setFocus(64 + 320, 64);
  await settle(streamer);
  expect(streamer.chunksEvicted).toBeGreaterThan(0);
  expect(store.isLoaded(machineChunk)).toBe(true);
  for (const key of renderer.meshes.keys()) expect(unpackChunkKey(key).cx).toBeLessThan(20);
  // Without the secondary focus the machine's chunks go with the next trim.
  streamer.setSecondaryFocus(null);
  streamer.setFocus(64, 64);
  await settle(streamer);
  expect(store.isLoaded(machineChunk)).toBe(false);
  expect(store.get(1005, -10, 1000)).toBe(Material.AIR);
  expect(() => streamer.setSecondaryFocus({ x: Number.NaN, z: 0 })).toThrow(/not finite/);
});

test('reset drops every mesh and streams the replaced world within the new bounds', async () => {
  const { store, renderer, streamer } = setupEvicting(64_000_000);
  streamer.setFocus(64, 64);
  await settle(streamer);
  expect(renderer.meshes.size).toBeGreaterThan(0);
  const before = renderer.quads();
  store.setSource(new SyntheticColumnSource({ seed: 6 }));
  streamer.reset({ minCx: 2, maxCx: 2, minCz: 0, maxCz: 8 });
  expect(renderer.meshes.size).toBe(0);
  expect(streamer.slotCount).toBe(0);
  expect(streamer.nearBox).toBeNull();
  expect(streamer.idle).toBe(true);
  streamer.setFocus(64, 64);
  await settle(streamer);
  expect(renderer.meshes.size).toBeGreaterThan(0);
  for (const key of renderer.meshes.keys()) expect(unpackChunkKey(key).cx).toBe(2);
  expect(renderer.quads()).not.toBe(before);
});
