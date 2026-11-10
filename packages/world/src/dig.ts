/** Hand dig: carves a sphere and reports the solid volume it removed (what the sim charges for). */
import { type ChunkKey, MATERIALS, type WorldEdit, type WorldPos } from '@bayvox/core';
import { MANUAL_EDIT_LAYER } from './chunk-store.ts';

/** Largest brush radius, voxels. */
export const DIG_MAX_RADIUS = 64;

export interface DigWorld {
  readonly voxelSizeM: number;
  get(x: number, y: number, z: number): number;
  applyEdit(e: WorldEdit, layer?: string): ChunkKey[];
}

export interface DigOutcome {
  /** Solid volume removed, cubic metres. 0 when the brush only met air or water. */
  removedM3: number;
  /** Keys of the chunks whose mesh may have changed. */
  dirty: ChunkKey[];
}

/**
 * Carves the sphere of `radiusM` around the voxel containing `center` (world metres) and records the
 * edit under `layer` (default: the manual layer a save stores). Voxels that were air or water do not
 * count towards the removed volume.
 */
export function digSphere(world: DigWorld, center: WorldPos, radiusM: number, layer: string = MANUAL_EDIT_LAYER): DigOutcome {
  const s = world.voxelSizeM;
  const radius = radiusM / s;
  if (!(radius > 0) || radius > DIG_MAX_RADIUS)
    throw new RangeError(`digSphere: radius must be in (0, ${DIG_MAX_RADIUS * s}] m, got ${radiusM}`);
  const cx = Math.floor(center.x / s);
  const cy = Math.floor(center.y / s);
  const cz = Math.floor(center.z / s);
  if (!Number.isFinite(cx + cy + cz)) throw new RangeError(`digSphere: centre is not finite: (${center.x}, ${center.y}, ${center.z})`);
  const reach = Math.ceil(radius);
  const r2 = radius * radius;
  let solid = 0;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dz = -reach; dz <= reach; dz++) {
      const q = dy * dy + dz * dz;
      if (q > r2) continue;
      const w = Math.floor(Math.sqrt(r2 - q));
      for (let dx = -w; dx <= w; dx++) {
        const def = MATERIALS[world.get(cx + dx, cy + dy, cz + dz)];
        if (def?.solid === true) solid++;
      }
    }
  }
  const at = { x: cx, y: cy, z: cz };
  const dirty = world.applyEdit({ t: 'carveCapsule', a: at, b: at, radius }, layer);
  return { removedM3: solid * s * s * s, dirty };
}
