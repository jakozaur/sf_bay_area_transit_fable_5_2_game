import { createRng, Material, nextInt, type WorldEdit } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { ChunkWorldStore, MANUAL_EDIT_LAYER } from './chunk-store.ts';
import { loadEditLog, saveEditLog } from './edit-log.ts';
import { SyntheticColumnSource } from './synthetic-source.ts';

const REGION = { min: { x: -160, y: -96, z: -160 }, max: { x: 160, y: 96, z: 160 } };
const fresh = (options = {}): ChunkWorldStore => new ChunkWorldStore({ source: new SyntheticColumnSource({ seed: 42 }), ...options });

/** A session of mixed edits spread over the region; `layerOf` names the layer of edit i. */
function edits(seed: number, n: number): WorldEdit[] {
  const rng = createRng(seed);
  const p = () => ({ x: nextInt(rng, 240) - 120, y: nextInt(rng, 60) - 40, z: nextInt(rng, 240) - 120 });
  const out: WorldEdit[] = [];
  for (let i = 0; i < n; i++) {
    const a = p();
    if (i % 4 === 0)
      out.push({
        t: 'fillBox',
        min: a,
        max: { x: a.x + 40, y: a.y + 6, z: a.z + 9 },
        material: i % 8 === 0 ? Material.AIR : Material.CONCRETE_LINING,
      });
    else if (i % 4 === 3) {
      const coords = new Int32Array(90);
      for (let k = 0; k < 30; k++) coords.set([a.x + k * 2, a.y, a.z + (k % 3)], k * 3);
      out.push({ t: 'setVoxels', coords, materials: new Uint16Array(30).fill(Material.TRACK_BALLAST) });
    } else out.push({ t: 'carveCapsule', a, b: p(), radius: 2.5 + (i % 3) });
  }
  return out;
}

describe('eviction', () => {
  test('a trimmed store regenerates identical voxels, edits included', () => {
    const reference = fresh();
    const store = fresh({ budgetBytes: 200_000 });
    const list = edits(7, 40);
    for (const e of list) reference.applyEdit(e);
    // Evict between edits, so later edits land on chunks that were evicted and replayed mid-edit.
    for (let i = 0; i < list.length; i++) {
      store.applyEdit(list[i] as WorldEdit);
      if (i % 3 === 0) store.trim();
    }
    const trimmed = store.trim();
    expect(store.evictedChunks).toBeGreaterThan(100);
    expect(trimmed.residentBytes).toBeLessThanOrEqual(200_000);
    expect(store.hashRegion(REGION)).toBe(reference.hashRegion(REGION));
    expect(store.editLog).toHaveLength(reference.editLog.length);
  });

  test('chunks inside a keep box stay, least recently used go first', () => {
    const store = fresh();
    store.hashRegion(REGION);
    const before = store.chunkCount;
    const keep = { min: { x: 0, y: -32, z: 0 }, max: { x: 64, y: 32, z: 64 } };
    store.get(-150, 0, -150); // most recently used chunk outside the keep box
    const r = store.trim({ budgetBytes: 1, keep: [keep] });
    expect(r.evicted).toBe(before - 8);
    expect(r.chunks).toBe(8);
    for (const key of store.chunkKeys()) expect(store.getChunk(key)).toBeDefined();
    const partial = fresh();
    partial.hashRegion(REGION);
    partial.get(-150, 0, -150);
    const total = partial.residentBytes;
    partial.trim({ budgetBytes: total - 1 });
    expect(partial.residentBytes).toBeLessThanOrEqual((total - 1) * 0.75);
    expect(partial.isLoaded(partial.chunkKeys().find((k) => partial.getChunk(k) !== undefined) as number)).toBe(true);
    expect(() => store.trim({ budgetBytes: 0 })).toThrow(/budgetBytes must be > 0, got 0/);
  });

  test('without an edit log, edited chunks are pinned', () => {
    const store = fresh({ recordEdits: false });
    store.applyEdit({ t: 'carveCapsule', a: { x: 5, y: -5, z: 5 }, b: { x: 5, y: -5, z: 5 }, radius: 3 });
    const hash = store.hashRegion(REGION);
    store.trim({ budgetBytes: 1 });
    expect(store.chunkCount).toBeGreaterThan(0);
    expect(store.hashRegion(REGION)).toBe(hash);
    expect(() => store.resetEdits()).toThrow(/needs the edit log/);
  });
});

describe('edit layers', () => {
  test('removing one layer leaves the others as if it had never been applied', () => {
    const list = edits(11, 30);
    const layerOf = (i: number): string => (i % 3 === 0 ? 'sim' : MANUAL_EDIT_LAYER);
    const both = fresh();
    const manualOnly = fresh();
    const dirtySeen: number[] = [];
    list.forEach((e, i) => {
      both.applyEdit(e, layerOf(i));
      if (layerOf(i) === MANUAL_EDIT_LAYER) manualOnly.applyEdit(e);
    });
    both.onDirty((keys) => dirtySeen.push(...keys));
    expect(both.editCount('sim')).toBeGreaterThan(5);
    const dirty = both.resetEdits('sim');
    expect(dirty.length).toBeGreaterThan(0);
    expect(dirtySeen).toEqual(dirty);
    expect(both.editCount('sim')).toBe(0);
    expect(both.editCount()).toBe(manualOnly.editCount());
    expect(both.hashRegion(REGION)).toBe(manualOnly.hashRegion(REGION));
    // The remaining index still replays correctly after eviction.
    both.trim({ budgetBytes: 1 });
    expect(both.hashRegion(REGION)).toBe(manualOnly.hashRegion(REGION));
    // Restart: everything goes, the world is pristine.
    both.resetEdits();
    expect(both.editLog).toHaveLength(0);
    expect(both.hashRegion(REGION)).toBe(fresh().hashRegion(REGION));
    expect(both.resetEdits()).toEqual([]);
  });

  test('a layer view records under its layer', () => {
    const store = fresh();
    const sim = store.view('sim');
    sim.applyEdit({ t: 'carveCapsule', a: { x: 0, y: -10, z: 0 }, b: { x: 30, y: -10, z: 0 }, radius: 3 });
    expect(store.editCount('sim')).toBe(1);
    expect(store.exportEdits().edits).toHaveLength(0);
    expect(sim.getVoxel({ x: 10, y: -10, z: 0 })).toBe(Material.AIR);
    expect(() => store.view('')).toThrow(/non-empty string/);
  });

  test('save and load: the manual layer round trips through text, sim carves are not stored', () => {
    const list = edits(5, 24);
    const played = fresh();
    list.forEach((e, i) => void played.applyEdit(e, i % 2 === 0 ? 'sim' : MANUAL_EDIT_LAYER));
    const saved = saveEditLog(played);
    expect(saved.edits).toBe(played.editCount(MANUAL_EDIT_LAYER));
    expect(saved.hash).toMatch(/^[0-9a-f]+$/);

    // Load order of docs/CONTRACTS.md: site, manual log, then the sim replays its carves.
    const loaded = fresh();
    expect(loadEditLog(loaded, saved.text, { edits: saved.edits, hash: saved.hash })).toBe(saved.edits);
    const manualOnly = fresh();
    list.forEach((e, i) => void (i % 2 === 1 && manualOnly.applyEdit(e)));
    expect(loaded.hashRegion(REGION)).toBe(manualOnly.hashRegion(REGION));
    expect(saveEditLog(loaded).text).toBe(saved.text);

    const other = fresh();
    expect(() => loadEditLog(other, saved.text, { edits: saved.edits, hash: 'deadbeef' })).toThrow(
      /has hash [0-9a-f]+, the save expects deadbeef/,
    );
    expect(() => loadEditLog(other, saved.text, { edits: saved.edits + 1, hash: saved.hash })).toThrow(
      /has \d+ edits, the save expects \d+/,
    );
    expect(other.editLog).toHaveLength(0);
    expect(() => new ChunkWorldStore({ voxelSizeM: 2 }).importEdits(played.exportEdits())).toThrow(
      /recorded at 1 m voxels, the store uses 2 m/,
    );
  });

  test('setSource drops chunks and edits and generates from the new source', () => {
    const store = fresh();
    store.applyEdit({ t: 'carveCapsule', a: { x: 0, y: -10, z: 0 }, b: { x: 30, y: -10, z: 0 }, radius: 3 });
    store.setSource(new SyntheticColumnSource({ seed: 43 }));
    expect(store.chunkCount).toBe(0);
    expect(store.editLog).toHaveLength(0);
    expect(store.hashRegion(REGION)).toBe(new ChunkWorldStore({ source: new SyntheticColumnSource({ seed: 43 }) }).hashRegion(REGION));
  });
});

test('digSphere reports the solid volume, not air or water', async () => {
  const { digSphere } = await import('./dig.ts');
  const store = fresh();
  // Find a land column and dig half in the ground, half in the air.
  let x = 0;
  while (store.get(x, 2, 0) === Material.AIR || store.get(x, 2, 0) === Material.WATER) x += 8;
  let top = 2;
  while (store.get(x, top + 1, 0) !== Material.AIR) top++;
  const deep = digSphere(store, { x: x + 0.5, y: top - 20, z: 0.5 }, 3);
  expect(deep.removedM3).toBe(store.lastEditVoxelsChanged);
  expect(deep.removedM3).toBe(123);
  expect(deep.dirty.length).toBeGreaterThan(0);
  expect(digSphere(store, { x: x + 0.5, y: top - 20, z: 0.5 }, 3)).toEqual({ removedM3: 0, dirty: [] });
  expect(digSphere(store, { x: x + 0.5, y: 500, z: 0.5 }, 3).removedM3).toBe(0);
  expect(store.exportEdits().edits).toHaveLength(1);
  expect(() => digSphere(store, { x: 0, y: 0, z: 0 }, 0)).toThrow(/radius must be in \(0, 64\] m, got 0/);
});
