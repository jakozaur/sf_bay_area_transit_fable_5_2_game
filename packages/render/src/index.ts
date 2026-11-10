export { CAP_MAX_CHUNKS, CAP_MAX_RADIUS, type CapRegion, capRegion, fillCapLayer } from './cap.ts';
export { ChunkScene, LAYER_OVERLAY, LAYER_SKY, LAYER_TERRAIN, LAYER_WATER } from './chunk-scene.ts';
export { BATCH_MAX_PATCHES, BATCH_MAX_SLABS, type ColumnBatchPart, type ColumnBatchPlacement, ColumnScene } from './column-scene.ts';
export {
  createEntityLayer,
  type EntityLayer,
  type EntityLayerOptions,
  type EntityLayerStats,
  type MachineSpec,
  machineOf,
  type TrackPath,
} from './entities.ts';
export { hexToLinear, MeshBuilder, type MeshData } from './mesh-builder.ts';
export {
  buildMachine,
  buildPit,
  buildRing,
  buildStation,
  buildTbm,
  buildTrackPanel,
  buildTrainCar,
  MACHINE_DIAMETER_M,
  MACHINE_KINDS,
  type MachineKind,
  type MachineModel,
  RAIL_DROP_M,
  type StationModelSpec,
  stationLevels,
  TBM_LENGTH_M,
} from './models.ts';
export {
  type FrameListener,
  type LineStyle,
  type MarkerStyle,
  OverlayLayer,
  type OverlayShape,
  type PolylineStyle,
  type Pose,
  type WorkLight,
} from './overlay.ts';
export { buildPaletteRgba, PALETTE_WIDTH, TRANSLUCENT_ALPHA, UNKNOWN_MATERIAL_RGB } from './palette.ts';
export { type ViewOptions, VoxelRenderer, type VoxelRendererOptions } from './renderer.ts';
export { type Cutaway, insideCutaway } from './slice.ts';
