/** Renderer contract (work package E, doc 10 section 11). Implemented by packages/render. */
import type { ChunkKey, VoxelCoord } from './chunk.ts';
import type { WorldPos } from './frame.ts';
import type { MeshOutput } from './mesh.ts';

/** Camera for one frame. Positions are world metres in float64; the renderer converts to camera-relative float32. */
export interface CameraState {
  position: WorldPos;
  target: WorldPos;
  /** Vertical field of view in degrees. */
  fovYDeg: number;
  /** Viewport width divided by height. */
  aspect: number;
  near: number;
  far: number;
  /** Cut plane (doc 03 section 8): fragments with world y above this are discarded. Omit for no cut. */
  cutY?: number;
}

/** Saved camera pose, used by scenarios, URL params and tests. */
export interface CameraBookmark {
  position: WorldPos;
  target: WorldPos;
  fovYDeg?: number;
}

/** Deterministic counters for tests and perf gates (doc 10 sections 8.3 and 8.4). All integers. */
export interface RenderStats {
  /** Draw calls in the last frame. */
  drawCalls: number;
  /** Triangles submitted in the last frame (2 per quad drawn). */
  triangles: number;
  /** Chunks known to the world store. */
  chunksLoaded: number;
  /** Chunks with an uploaded mesh. */
  chunksMeshed: number;
  /** Bytes held in GPU buffers owned by the renderer. */
  gpuBytes: number;
}

export interface ChunkRenderer {
  /** Uploads or replaces the mesh for mesh.key. An empty mesh removes the chunk's draw. */
  upload(mesh: MeshOutput): void;
  remove(key: ChunkKey): void;
  /** Floating origin, as a chunk coordinate held in a VoxelCoord (x, y, z = cx, cy, cz). Chunk offsets are sent to the GPU relative to it. */
  setRenderOrigin(chunk: VoxelCoord): void;
  /** Draws one frame. `alpha` is the sim interpolation factor in [0, 1). */
  draw(camera: CameraState, alpha: number): void;
  stats(): RenderStats;
}
