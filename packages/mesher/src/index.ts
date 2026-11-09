/** Mesher (work package D): binary greedy chunk mesher, column mesher for LOD tiers, worker pool. */
export { meshChunk, meshChunkFlat } from './mesh-chunk.ts';
export {
  COLUMN_GRID_LENGTH,
  COLUMN_MAX_SLABS,
  COLUMN_PATCH_SIZE,
  COLUMN_SLAB_HEIGHT,
  type ColumnMeshInput,
  type ColumnSlabMesh,
  columnIndex,
  columnSlabRange,
  meshColumnPatch,
  meshColumnSlab,
} from './mesh-columns.ts';
export {
  createMesherPool,
  createSyncMesherPool,
  createWorkerMesherPool,
  defaultPoolSize,
  inlineEndpoint,
  MESHER_POOL_MAX_SIZE,
  type MesherEndpoint,
  type MesherPool,
  type MeshJobOptions,
  workerEndpoint,
} from './pool.ts';
export {
  type MesherReply,
  type MesherRequest,
  type MesherResponse,
  type MesherServerPort,
  runMesherRequest,
  serveMesher,
} from './protocol.ts';
export { createMesherScratch, MAX_MESHER_QUADS } from './scratch.ts';
