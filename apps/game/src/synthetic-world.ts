/**
 * Synthetic world over packages/world: a ChunkWorldStore generating lazily from the seeded synthetic column
 * source, centred on 4th and King (65 km from the grid origin, which exercises camera-relative rendering).
 * No data files: used by `?world=synthetic` for renderer and input tests that must not depend on map data.
 */
import { type CameraBookmark, CHUNK_SIZE, lonLatToWorld, SEA_LEVEL_M, VOXEL_SIZE_M, type WorldPos } from '@bayvox/core';
import { ChunkWorldStore, SyntheticColumnSource } from '@bayvox/world';
import type { GameWorld } from './game-world.ts';
import type { GameParams } from './params.ts';

/** Vertical range streamed and shown, voxels: two chunks below sea level to four above. */
const MIN_Y = -2 * CHUNK_SIZE;
const MAX_Y = 4 * CHUNK_SIZE;
/** Depth of the demo tunnel axis below sea level, voxels. */
const TUNNEL_DEPTH = 16;
const TUNNEL_RADIUS = 4.5;
/** Smallest world edge the camera bookmarks are laid out for, metres. */
const MIN_VIEW_SPAN = 320;

export function createSyntheticWorld(params: GameParams): GameWorld {
  const source = new SyntheticColumnSource({ seed: params.seed });
  const store = new ChunkWorldStore({ voxelSizeM: VOXEL_SIZE_M, source, columnCacheSize: 2048 });
  const size = params.size * CHUNK_SIZE;
  const half = size / 2;
  const king = lonLatToWorld(-122.3947, 37.7765);
  const cx = Math.round(king.x / CHUNK_SIZE) * CHUNK_SIZE;
  const cz = Math.round(king.z / CHUNK_SIZE) * CHUNK_SIZE;

  // A tunnel across the map so the cut plane and x-ray have something to show.
  const tunnelY = SEA_LEVEL_M - TUNNEL_DEPTH;
  const margin = Math.min(24, size / 8);
  const a = { x: cx - half + margin, y: tunnelY, z: cz };
  const b = { x: cx + half - margin, y: tunnelY, z: cz };
  store.applyEdit({ t: 'carveCapsule', a, b, radius: TUNNEL_RADIUS });

  const c: WorldPos = { x: cx, y: 0, z: cz };
  const view = (dx: number, dy: number, dz: number, target: WorldPos = c): CameraBookmark => ({
    position: { x: target.x + dx, y: target.y + dy, z: target.z + dz },
    target,
  });
  const quarter: WorldPos = { x: cx - size * 0.2, y: 0, z: cz + size * 0.12 };
  // Camera offsets scale with the world but never drop below the tallest thing in it (48 m hills plus
  // 69 m buildings): a camera inside a hill sees and picks nothing useful.
  const span = Math.max(size, MIN_VIEW_SPAN);
  const groundAt = (x: number, z: number): number => Math.max(source.heightAt(x, z), SEA_LEVEL_M);
  return {
    store,
    min: { x: cx - half, y: MIN_Y, z: cz - half },
    max: { x: cx + half, y: MAX_Y, z: cz + half },
    seaLevel: SEA_LEVEL_M,
    bookmarks: [
      view(span * 0.34, span * 0.42, span * 0.56),
      view(60, 125, 95, quarter),
      view(-span * 0.5, span * 0.42, span * 0.25),
      view(0, span * 1.1, span * 0.12),
    ],
    decorate(overlay) {
      const y = tunnelY + 0.5;
      overlay.setPolyline(
        'demo.alignment',
        [
          { x: a.x, y, z: a.z + 0.5 },
          { x: b.x, y, z: b.z + 0.5 },
        ],
        { color: 0xff7043, widthPx: 3, xray: true, dashM: 6 },
      );
      overlay.setMarker('demo.station.a', { x: a.x + 0.5, y: groundAt(a.x, a.z), z: a.z + 0.5 }, { color: 0x1e88e5, sizeM: 14 });
      overlay.setMarker('demo.station.b', { x: b.x + 0.5, y: groundAt(b.x, b.z), z: b.z + 0.5 }, { color: 0x1e88e5, sizeM: 14 });
      overlay.setShape(
        'demo.tbm',
        { kind: 'cylinder', radius: TUNNEL_RADIUS - 1, length: 12, color: 0xffca28 },
        { position: { x: cx - half * 0.3, y, z: a.z + 0.5 }, yaw: Math.PI / 2 },
      );
    },
    groundAt,
    summary: `synthetic world, seed ${params.seed}, ${params.size} x ${params.size} chunks`,
  };
}
