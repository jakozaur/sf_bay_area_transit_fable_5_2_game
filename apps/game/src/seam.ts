/**
 * Composition seam: the two implementations the app shell is built on. To swap one, change its line.
 * Everything else in the app talks to the core interfaces (WorldStore, MeshOutput) and to GameWorld.
 */
import type { GameWorld } from './game-world.ts';
import type { GameParams } from './params.ts';
import { createSiteWorld } from './site-world.ts';
import { createSyntheticWorld } from './synthetic-world.ts';

// Mesher: packages/mesher binary greedy mesher behind its worker pool (and its in-thread pool as fallback).
export { createSyncMesherPool, createWorkerMesherPool, type MesherPool } from '@bayvox/mesher';

/**
 * World: packages/world ChunkWorldStore in both cases. `site` (the default) voxelizes the real map data
 * under data/; `synthetic` generates seeded terrain without any data file.
 */
export function createWorld(params: GameParams): GameWorld | Promise<GameWorld> {
  return params.world === 'synthetic' ? createSyntheticWorld(params) : createSiteWorld(params);
}

export type { GameWorld };
