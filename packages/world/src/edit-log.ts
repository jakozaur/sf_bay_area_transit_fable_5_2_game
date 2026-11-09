/**
 * Edit log: the save format for manual digs. A world is reproduced by generating it from the same
 * ColumnSource and replaying the log in order. Serialized as compact JSON:
 *
 *   {"format":"bayvox-editlog","v":1,"voxelSizeM":2,"edits":[
 *     ["f", minX, minY, minZ, maxX, maxY, maxZ, material],      fillBox
 *     ["c", aX, aY, aZ, bX, bY, bZ, radius],                    carveCapsule
 *     ["s", [x0, y0, z0, dx, dy, dz, ...], [material, run, ...]] setVoxels
 *   ]}
 *
 * setVoxels coordinates are delta coded (the first triple is absolute, each later triple is the
 * difference from the previous voxel) and materials are run-length coded as (material, run) pairs.
 */
import type { WorldEdit, WorldStore } from '@bayvox/core';

export const EDIT_LOG_FORMAT = 'bayvox-editlog';
export const EDIT_LOG_VERSION = 1;

export interface EditLog {
  voxelSizeM: number;
  edits: WorldEdit[];
}

type Row = (number | number[])[];

export function serializeEditLog(log: EditLog): string {
  const rows: Row[] = [];
  for (const e of log.edits) {
    switch (e.t) {
      case 'fillBox':
        rows.push(['f', e.min.x, e.min.y, e.min.z, e.max.x, e.max.y, e.max.z, e.material] as unknown as Row);
        break;
      case 'carveCapsule':
        rows.push(['c', e.a.x, e.a.y, e.a.z, e.b.x, e.b.y, e.b.z, e.radius] as unknown as Row);
        break;
      case 'setVoxels': {
        if (e.coords.length !== e.materials.length * 3) {
          throw new RangeError(`serializeEditLog: edit ${rows.length} has ${e.coords.length} coords for ${e.materials.length} materials`);
        }
        const coords: number[] = [];
        for (let i = 0; i < e.coords.length; i++) {
          coords.push(i < 3 ? (e.coords[i] as number) : (e.coords[i] as number) - (e.coords[i - 3] as number));
        }
        const runs: number[] = [];
        for (let i = 0; i < e.materials.length; ) {
          const m = e.materials[i] as number;
          let j = i + 1;
          while (j < e.materials.length && e.materials[j] === m) j++;
          runs.push(m, j - i);
          i = j;
        }
        rows.push(['s', coords, runs] as unknown as Row);
        break;
      }
      default: {
        const unknown: never = e;
        throw new Error(`serializeEditLog: unknown edit ${JSON.stringify(unknown)}`);
      }
    }
  }
  return JSON.stringify({ format: EDIT_LOG_FORMAT, v: EDIT_LOG_VERSION, voxelSizeM: log.voxelSizeM, edits: rows });
}

function isInt32(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff;
}

function isMaterial(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffff;
}

/** Parses and validates a serialized edit log. Throws naming the first offending edit. */
export function parseEditLog(text: string): EditLog {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new SyntaxError(`parseEditLog: not JSON: ${(err as Error).message}`);
  }
  if (typeof raw !== 'object' || raw === null) throw new TypeError('parseEditLog: top level is not an object');
  const doc = raw as { format?: unknown; v?: unknown; voxelSizeM?: unknown; edits?: unknown };
  if (doc.format !== EDIT_LOG_FORMAT)
    throw new TypeError(`parseEditLog: format is ${JSON.stringify(doc.format)}, expected "${EDIT_LOG_FORMAT}"`);
  if (doc.v !== EDIT_LOG_VERSION)
    throw new RangeError(`parseEditLog: unsupported version ${JSON.stringify(doc.v)}, this build reads ${EDIT_LOG_VERSION}`);
  const voxelSizeM = doc.voxelSizeM;
  if (typeof voxelSizeM !== 'number' || !(voxelSizeM > 0) || !Number.isFinite(voxelSizeM)) {
    throw new RangeError(`parseEditLog: voxelSizeM must be a finite number > 0, got ${JSON.stringify(voxelSizeM)}`);
  }
  if (!Array.isArray(doc.edits)) throw new TypeError('parseEditLog: edits is not an array');
  const edits: WorldEdit[] = [];
  for (let n = 0; n < doc.edits.length; n++) {
    const row: unknown = doc.edits[n];
    const bad = (why: string): never => {
      throw new RangeError(`parseEditLog: edit ${n} ${why}: ${JSON.stringify(row)?.slice(0, 120)}`);
    };
    if (!Array.isArray(row)) return bad('is not an array');
    const tag: unknown = row[0];
    if (tag === 'f' || tag === 'c') {
      if (row.length !== 8) return bad('needs 8 fields');
      for (let i = 1; i <= 6; i++) if (!isInt32(row[i])) return bad(`field ${i} is not an int32`);
      const [, x0, y0, z0, x1, y1, z1, last] = row as [string, number, number, number, number, number, number, unknown];
      if (tag === 'f') {
        if (!isMaterial(last)) return bad('material is not a u16');
        edits.push({ t: 'fillBox', min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 }, material: last });
      } else {
        if (typeof last !== 'number' || !(last >= 0) || !Number.isFinite(last)) return bad('radius is not a finite number >= 0');
        edits.push({ t: 'carveCapsule', a: { x: x0, y: y0, z: z0 }, b: { x: x1, y: y1, z: z1 }, radius: last });
      }
    } else if (tag === 's') {
      if (row.length !== 3 || !Array.isArray(row[1]) || !Array.isArray(row[2])) return bad('needs a coords array and a runs array');
      const deltas = row[1] as unknown[];
      const runs = row[2] as unknown[];
      if (deltas.length % 3 !== 0 || runs.length % 2 !== 0) return bad('has a ragged coords or runs array');
      const coords = new Int32Array(deltas.length);
      for (let i = 0; i < deltas.length; i++) {
        const d = deltas[i];
        // A delta between two int32 values can itself exceed int32; only the decoded coordinate must fit.
        const v = typeof d === 'number' && Number.isSafeInteger(d) ? (i < 3 ? d : d + (coords[i - 3] as number)) : Number.NaN;
        if (!isInt32(v)) return bad(`coords entry ${i} is not an int32`);
        coords[i] = v;
      }
      const materials = new Uint16Array(deltas.length / 3);
      let at = 0;
      for (let i = 0; i < runs.length; i += 2) {
        const m = runs[i];
        const run = runs[i + 1];
        if (!isMaterial(m)) return bad(`run ${i / 2} material is not a u16`);
        if (typeof run !== 'number' || !Number.isInteger(run) || run < 1 || at + run > materials.length) {
          return bad(`run ${i / 2} length does not fit ${materials.length} voxels`);
        }
        materials.fill(m, at, at + run);
        at += run;
      }
      if (at !== materials.length) return bad(`runs cover ${at} of ${materials.length} voxels`);
      edits.push({ t: 'setVoxels', coords, materials });
    } else {
      return bad('has an unknown tag');
    }
  }
  return { voxelSizeM, edits };
}

/**
 * Applies a log to a store, in order. Pass the voxel size of the target store: a log recorded at
 * another voxel size addresses different space and is rejected. Returns the number of edits applied.
 */
export function replayEditLog(store: WorldStore, storeVoxelSizeM: number, log: EditLog): number {
  if (log.voxelSizeM !== storeVoxelSizeM) {
    throw new RangeError(`replayEditLog: log was recorded at ${log.voxelSizeM} m voxels, the store uses ${storeVoxelSizeM} m`);
  }
  for (const e of log.edits) store.applyEdit(e);
  return log.edits.length;
}
