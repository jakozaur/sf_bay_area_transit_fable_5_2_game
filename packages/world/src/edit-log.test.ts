import { createRng, Material, nextInt, type WorldEdit } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { ChunkWorldStore } from './chunk-store.ts';
import { type EditLog, parseEditLog, replayEditLog, serializeEditLog } from './edit-log.ts';
import { SyntheticColumnSource } from './synthetic-source.ts';

const REGION = { min: { x: -160, y: -96, z: -160 }, max: { x: 160, y: 96, z: 160 } };

function freshWorld(): ChunkWorldStore {
  return new ChunkWorldStore({ voxelSizeM: 2, source: new SyntheticColumnSource({ seed: 42 }) });
}

/** A dig session: tunnels, a station box, lining, and hand-placed voxels. */
function dig(store: ChunkWorldStore): void {
  const rng = createRng(99);
  const p = () => ({ x: nextInt(rng, 240) - 120, y: nextInt(rng, 40) - 30, z: nextInt(rng, 240) - 120 });
  for (let i = 0; i < 12; i++) store.applyEdit({ t: 'carveCapsule', a: p(), b: p(), radius: 1.75 + (i % 3) });
  store.applyEdit({ t: 'fillBox', min: { x: -20, y: -18, z: -8 }, max: { x: 45, y: -10, z: 9 }, material: Material.AIR });
  store.applyEdit({ t: 'fillBox', min: { x: -20, y: -19, z: -8 }, max: { x: 45, y: -18, z: 9 }, material: Material.CONCRETE_LINING });
  const n = 500;
  const coords = new Int32Array(n * 3);
  const materials = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    coords[i * 3] = -20 + (i % 65);
    coords[i * 3 + 1] = -18;
    coords[i * 3 + 2] = -1 + (i % 3);
    materials[i] = i % 130 < 100 ? Material.TRACK_BALLAST : Material.CONCRETE_LINING;
  }
  store.applyEdit({ t: 'setVoxels', coords, materials });
}

describe('edit log', () => {
  test('replaying the serialized log onto a freshly generated world reproduces the same voxels', () => {
    const original = freshWorld();
    const pristine = original.hashRegion(REGION);
    dig(original);
    const dug = original.hashRegion(REGION);
    expect(dug).not.toBe(pristine);
    expect(original.editLog).toHaveLength(15);

    const text = serializeEditLog({ voxelSizeM: original.voxelSizeM, edits: original.editLog });
    const restored = freshWorld();
    expect(restored.hashRegion(REGION)).toBe(pristine);
    expect(replayEditLog(restored, restored.voxelSizeM, parseEditLog(text))).toBe(15);
    expect(restored.hashRegion(REGION)).toBe(dug);
    // The restored world carries the same log, so a second save is byte-identical.
    expect(serializeEditLog({ voxelSizeM: restored.voxelSizeM, edits: restored.editLog })).toBe(text);
  });

  test('replay works whatever was loaded before, and the log is append-only across more digging', () => {
    const original = freshWorld();
    dig(original);
    const half = original.editLog.slice(0, 7);
    const restored = freshWorld();
    restored.get(500, 0, 500); // unrelated chunk loaded first
    replayEditLog(restored, 2, { voxelSizeM: 2, edits: half });
    replayEditLog(restored, 2, { voxelSizeM: 2, edits: original.editLog.slice(7) });
    expect(restored.hashRegion(REGION)).toBe(original.hashRegion(REGION));
    expect(restored.editLog).toEqual(original.editLog);
  });

  test('the log holds copies: mutating the caller arrays afterwards does not change it', () => {
    const store = new ChunkWorldStore();
    const coords = Int32Array.of(1, 2, 3);
    const materials = Uint16Array.of(7);
    store.applyEdit({ t: 'setVoxels', coords, materials });
    coords[0] = 99;
    materials[0] = 9;
    expect(store.editLog[0]).toEqual({ t: 'setVoxels', coords: Int32Array.of(1, 2, 3), materials: Uint16Array.of(7) });
    const off = new ChunkWorldStore({ recordEdits: false });
    off.applyEdit({ t: 'setVoxels', coords, materials });
    expect(off.editLog).toHaveLength(0);
  });

  test('serialization round trips every edit kind exactly and is compact', () => {
    const edits: WorldEdit[] = [
      { t: 'fillBox', min: { x: -5, y: -6, z: -7 }, max: { x: 5, y: 6, z: 7 }, material: 8 },
      { t: 'carveCapsule', a: { x: 1, y: -2, z: 3 }, b: { x: -100000, y: 20, z: 30 }, radius: 3.5 },
      {
        t: 'setVoxels',
        coords: Int32Array.of(10, -20, 30, 11, -20, 30, 12, -20, 31, -2147483648, 0, 2147483647),
        materials: Uint16Array.of(9, 9, 9, 65535),
      },
      { t: 'setVoxels', coords: new Int32Array(0), materials: new Uint16Array(0) },
    ];
    const log: EditLog = { voxelSizeM: 2, edits };
    const text = serializeEditLog(log);
    expect(text).toBe(
      '{"format":"bayvox-editlog","v":1,"voxelSizeM":2,"edits":[["f",-5,-6,-7,5,6,7,8],["c",1,-2,3,-100000,20,30,3.5],' +
        '["s",[10,-20,30,1,0,0,1,0,1,-2147483660,20,2147483616],[9,3,65535,1]],["s",[],[]]]}',
    );
    expect(parseEditLog(text)).toEqual(log);
  });

  test('parse rejects malformed logs naming the edit', () => {
    const wrap = (edits: string, head = '"format":"bayvox-editlog","v":1,"voxelSizeM":2') => `{${head},"edits":${edits}}`;
    expect(() => parseEditLog('nope')).toThrow(/not JSON/);
    expect(() => parseEditLog(wrap('[]', '"format":"other","v":1,"voxelSizeM":2'))).toThrow(/format is "other"/);
    expect(() => parseEditLog(wrap('[]', '"format":"bayvox-editlog","v":2,"voxelSizeM":2'))).toThrow(/unsupported version 2/);
    expect(() => parseEditLog(wrap('[]', '"format":"bayvox-editlog","v":1,"voxelSizeM":0'))).toThrow(/voxelSizeM/);
    expect(() => parseEditLog(wrap('[["f",0,0,0,1,1,1,8],["x",1]]'))).toThrow(/edit 1 has an unknown tag/);
    expect(() => parseEditLog(wrap('[["f",0,0,0,1,1,1.5,8]]'))).toThrow(/edit 0 field 6 is not an int32/);
    expect(() => parseEditLog(wrap('[["f",0,0,0,1,1,1,-1]]'))).toThrow(/edit 0 material is not a u16/);
    expect(() => parseEditLog(wrap('[["c",0,0,0,1,1,1,-2]]'))).toThrow(/edit 0 radius/);
    expect(() => parseEditLog(wrap('[["s",[1,2,3],[7,2]]]'))).toThrow(/edit 0 run 0 length does not fit 1 voxels/);
    expect(() => parseEditLog(wrap('[["s",[1,2,3,4,5,6],[7,1]]]'))).toThrow(/edit 0 runs cover 1 of 2 voxels/);
    expect(() => parseEditLog(wrap('[["s",[2147483647,0,0,1,0,0],[7,2]]]'))).toThrow(/edit 0 coords entry 3 is not an int32/);
  });

  test('replay refuses a log recorded at another voxel size', () => {
    const store = new ChunkWorldStore({ voxelSizeM: 1 });
    expect(() => replayEditLog(store, store.voxelSizeM, { voxelSizeM: 2, edits: [] })).toThrow(
      /recorded at 2 m voxels, the store uses 1 m/,
    );
  });
});
