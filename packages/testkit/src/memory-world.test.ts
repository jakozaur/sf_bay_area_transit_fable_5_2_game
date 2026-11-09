import {
  CHUNK_VOLUME,
  chunkKeyOfVoxel,
  localIndex,
  Material,
  PADDED_VOLUME,
  packChunkKey,
  paddedIndex,
  unpackChunkKey,
} from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { MemoryWorldStore } from './memory-world.ts';

describe('MemoryWorldStore', () => {
  test('empty space is air; set and get round-trip including negatives', () => {
    const w = new MemoryWorldStore();
    expect(w.getVoxel({ x: 5, y: -70, z: 1234 })).toBe(Material.AIR);
    w.applyEdit({
      t: 'setVoxels',
      coords: Int32Array.from([-1, -1, -1, 40, 2, -65]),
      materials: Uint16Array.from([Material.ROCK, Material.FILL]),
    });
    expect(w.getVoxel({ x: -1, y: -1, z: -1 })).toBe(Material.ROCK);
    expect(w.getVoxel({ x: 40, y: 2, z: -65 })).toBe(Material.FILL);
    expect(w.getVoxel({ x: 0, y: 0, z: 0 })).toBe(Material.AIR);
    expect(w.chunkCount).toBe(2);
  });

  test('fillBox is half-open and returns sorted dirty chunks without neighbours for interior edits', () => {
    const w = new MemoryWorldStore();
    const dirty = w.applyEdit({ t: 'fillBox', min: { x: 4, y: 4, z: 4 }, max: { x: 8, y: 6, z: 7 }, material: Material.SAND });
    expect(dirty).toEqual([packChunkKey(0, 0, 0)]);
    let count = 0;
    for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) if (w.get(x, y, z) === Material.SAND) count++;
    expect(count).toBe(4 * 2 * 3);
    expect(w.get(8, 4, 4)).toBe(Material.AIR);
    expect(w.get(7, 5, 6)).toBe(Material.SAND);
  });

  test('an edit that changes nothing reports no dirty chunks and does not notify', () => {
    const w = new MemoryWorldStore();
    let calls = 0;
    w.onDirty(() => calls++);
    expect(w.applyEdit({ t: 'fillBox', min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 4, z: 4 }, material: Material.AIR })).toEqual([]);
    w.applyEdit({ t: 'fillBox', min: { x: 1, y: 1, z: 1 }, max: { x: 2, y: 2, z: 2 }, material: Material.ROCK });
    expect(w.applyEdit({ t: 'fillBox', min: { x: 1, y: 1, z: 1 }, max: { x: 2, y: 2, z: 2 }, material: Material.ROCK })).toEqual([]);
    expect(calls).toBe(1);
  });

  test('boundary edits dirty face, edge and corner neighbours', () => {
    const w = new MemoryWorldStore();
    const face = w.applyEdit({ t: 'setVoxels', coords: Int32Array.from([31, 5, 5]), materials: Uint16Array.from([Material.ROCK]) });
    expect(face).toEqual([packChunkKey(0, 0, 0), packChunkKey(1, 0, 0)]);
    const corner = w.applyEdit({ t: 'setVoxels', coords: Int32Array.from([0, 0, 0]), materials: Uint16Array.from([Material.ROCK]) });
    expect(corner.length).toBe(8);
    expect(corner).toEqual([...corner].sort((a, b) => a - b));
    for (const k of corner) {
      const c = unpackChunkKey(k);
      expect([c.cx, c.cy, c.cz].every((v) => v === 0 || v === -1)).toBe(true);
    }
  });

  test('onDirty delivers the same keys and unsubscribes', () => {
    const w = new MemoryWorldStore();
    const got: number[][] = [];
    const off = w.onDirty((k) => got.push(k));
    const dirty = w.applyEdit({ t: 'fillBox', min: { x: 30, y: 0, z: 0 }, max: { x: 34, y: 1, z: 1 }, material: Material.FILL });
    expect(got).toEqual([dirty]);
    off();
    w.applyEdit({ t: 'fillBox', min: { x: 0, y: 8, z: 8 }, max: { x: 1, y: 9, z: 9 }, material: Material.FILL });
    expect(got.length).toBe(1);
  });

  test('carveCapsule removes a tube and nothing else', () => {
    const w = new MemoryWorldStore();
    w.applyEdit({ t: 'fillBox', min: { x: 0, y: 0, z: 0 }, max: { x: 64, y: 32, z: 32 }, material: Material.ROCK });
    const dirty = w.applyEdit({ t: 'carveCapsule', a: { x: 10, y: 16, z: 16 }, b: { x: 50, y: 16, z: 16 }, radius: 3.5 });
    expect(dirty).toEqual([packChunkKey(0, 0, 0), packChunkKey(1, 0, 0)]);
    expect(w.get(30, 16, 16)).toBe(Material.AIR);
    expect(w.get(30, 19, 16)).toBe(Material.AIR);
    expect(w.get(30, 20, 16)).toBe(Material.ROCK);
    expect(w.get(30, 19, 19)).toBe(Material.ROCK);
    expect(w.get(53, 16, 16)).toBe(Material.AIR);
    expect(w.get(54, 16, 16)).toBe(Material.ROCK);
    expect(w.get(6, 16, 16)).toBe(Material.ROCK);
    // Cross-section at mid-span: voxel centres within 3.5 of the axis.
    let cross = 0;
    for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) if (w.get(30, y, z) === Material.AIR) cross++;
    let expected = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) if (dy * dy + dz * dz <= 3.5 * 3.5) expected++;
    expect(cross).toBe(expected);
  });

  test('getChunk: undefined when never written, uniform as null indices, palette otherwise', () => {
    const w = new MemoryWorldStore();
    const key = packChunkKey(2, 0, -1);
    expect(w.getChunk(key)).toBeUndefined();
    w.applyEdit({ t: 'fillBox', min: { x: 64, y: 0, z: -32 }, max: { x: 96, y: 32, z: 0 }, material: Material.ROCK });
    const uniform = w.getChunk(key);
    expect(uniform?.indices).toBeNull();
    expect(Array.from(uniform?.palette ?? [])).toEqual([Material.ROCK]);
    w.applyEdit({ t: 'setVoxels', coords: Int32Array.from([65, 3, -30]), materials: Uint16Array.from([Material.WATER]) });
    const mixed = w.getChunk(key);
    expect(mixed?.indices).toBeInstanceOf(Uint8Array);
    expect(mixed?.indices?.length).toBe(CHUNK_VOLUME);
    const idx = mixed?.indices?.[localIndex(1, 3, 2)] as number;
    expect(mixed?.palette[idx]).toBe(Material.WATER);
    expect(mixed?.palette[mixed.indices?.[0] as number]).toBe(Material.ROCK);
  });

  test('paddedCopy includes the border from all neighbours and checks the buffer size', () => {
    const w = new MemoryWorldStore();
    const coords = Int32Array.from([0, 0, 0, -1, 0, 0, 32, 31, 31, -1, -1, -1, 32, 32, 32, 5, 32, 7, 33, 0, 0]);
    w.applyEdit({ t: 'setVoxels', coords, materials: Uint16Array.from([2, 3, 4, 5, 6, 7, 8]) });
    const out = new Uint16Array(PADDED_VOLUME);
    w.paddedCopy(chunkKeyOfVoxel(0, 0, 0), out);
    expect(out[paddedIndex(0, 0, 0)]).toBe(2);
    expect(out[paddedIndex(-1, 0, 0)]).toBe(3);
    expect(out[paddedIndex(32, 31, 31)]).toBe(4);
    expect(out[paddedIndex(-1, -1, -1)]).toBe(5);
    expect(out[paddedIndex(32, 32, 32)]).toBe(6);
    expect(out[paddedIndex(5, 32, 7)]).toBe(7);
    // (33, 0, 0) is two voxels outside: not part of this chunk's border.
    expect(out.reduce((n, m) => n + (m !== 0 ? 1 : 0), 0)).toBe(6);
    expect(() => w.paddedCopy(chunkKeyOfVoxel(0, 0, 0), new Uint16Array(32768))).toThrow('32768');
  });

  test('bad edits fail loudly', () => {
    const w = new MemoryWorldStore();
    expect(() => w.applyEdit({ t: 'setVoxels', coords: new Int32Array(4), materials: new Uint16Array(1) })).toThrow('4 coords');
    expect(() => w.applyEdit({ t: 'fillBox', min: { x: 0.5, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 }, material: 1 })).toThrow('0.5');
    expect(() => w.applyEdit({ t: 'carveCapsule', a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, radius: -1 })).toThrow('-1');
    expect(() => w.setRaw(0, 0, 0, 70000)).toThrow('70000');
    expect(() => w.getVoxel({ x: 0, y: 5000, z: 0 })).toThrow('out of range');
  });

  test('ensureLoaded resolves', async () => {
    await expect(new MemoryWorldStore().ensureLoaded({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } })).resolves.toBeUndefined();
  });
});
