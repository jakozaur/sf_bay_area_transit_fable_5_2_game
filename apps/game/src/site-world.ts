/**
 * The real world: the map data under data/ (built by `pnpm data:build`), voxelized by packages/world.
 * Near field: 1 m voxel chunks from a ChunkWorldStore over the site's DEM and vector tiles. Around it the city
 * tier (the same site at 4 m columns) and the far tier (the whole Bay at 64 m), plus the rail network overlay.
 * Missing or stale data stops the boot with the file name; there is no synthetic fallback.
 */
import {
  type CameraBookmark,
  CHUNK_SIZE,
  GRID_HEIGHT_M,
  GRID_WIDTH_M,
  lonLatToWorld,
  SEA_LEVEL_M,
  VOXEL_SIZE_M,
  type WorldPos,
} from '@bayvox/core';
import {
  ChunkWorldStore,
  coarsenFarRaster,
  createColumnSample,
  type FetchBytes,
  loadFarRaster,
  loadFarVectors,
  loadManifest,
  loadRailNetwork,
  loadSite,
  TiledSiteSource,
} from '@bayvox/world';
import type { GameWorld } from './game-world.ts';
import { buildLod } from './lod.ts';
import { addNetworkOverlay, type NetworkOverlay } from './network-overlay.ts';
import type { GameParams } from './params.ts';

/** The site of the first scenario (packages/pipeline/sites.json). */
export const DEFAULT_SITE_ID = 'portal';
/** Vertical range of the voxel world: three chunks below sea level (tunnels, the cut) to above the tallest tower. */
const MIN_Y = -3 * CHUNK_SIZE;
const MAX_Y = 11 * CHUNK_SIZE;

const TRANSIT_CENTER = lonLatToWorld(-122.3966, 37.7897);
const FOURTH_AND_KING = lonLatToWorld(-122.3947, 37.7765);

/** Fetches data files relative to the page, uncached for the manifest and from the HTTP cache for hashed files. */
function dataFetcher(): FetchBytes {
  const base = new URL('data/', document.baseURI);
  return async (path) => {
    const url = new URL(path, base);
    let response: Response;
    try {
      response = await fetch(url, { cache: path === 'manifest.json' ? 'no-cache' : 'default' });
    } catch (err) {
      throw new Error(`world data: cannot fetch ${url.pathname}: ${(err as Error).message}`);
    }
    // A dev server answers unknown paths with its index page, so the status alone is not enough.
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || type.startsWith('text/html')) {
      throw new Error(`world data: ${url.pathname} is missing (HTTP ${response.status}); run pnpm data:build`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };
}

export async function createSiteWorld(params: GameParams): Promise<GameWorld> {
  const t0 = performance.now();
  const fetchBytes = dataFetcher();
  const manifest = await loadManifest(fetchBytes);
  const [far, rail, farVectors] = await Promise.all([
    loadFarRaster(manifest, fetchBytes),
    loadRailNetwork(manifest, fetchBytes),
    loadFarVectors(manifest, fetchBytes),
  ]);
  const site = await loadSite(manifest, DEFAULT_SITE_ID, fetchBytes, rail);
  const source = new TiledSiteSource(site, VOXEL_SIZE_M);
  const store = new ChunkWorldStore({ voxelSizeM: VOXEL_SIZE_M, source, columnCacheSize: 2048 });
  const loadMs = performance.now() - t0;

  const sample = createColumnSample();
  const { minX, minZ, maxX, maxZ } = site.bounds;
  const groundAt = (x: number, z: number): number => {
    if (!(x >= minX && x < maxX && z >= minZ && z < maxZ)) return SEA_LEVEL_M;
    source.sampleColumn(x, z, sample);
    return Math.max(sample.surfaceM, sample.waterLevelM);
  };
  const on = (p: { x: number; z: number }): WorldPos => ({ x: p.x, y: Math.round(groundAt(p.x, p.z)), z: p.z });
  const view = (target: WorldPos, dx: number, dy: number, dz: number): CameraBookmark => ({
    position: { x: target.x + dx, y: target.y + dy, z: target.z + dz },
    target,
  });
  // Camera positions are south of their target (+z), so north is up on screen.
  const downtown = on({ x: (TRANSIT_CENTER.x + FOURTH_AND_KING.x) / 2, z: (TRANSIT_CENTER.z + FOURTH_AND_KING.z) / 2 });
  const bay: WorldPos = { x: GRID_WIDTH_M / 2, y: 0, z: -GRID_HEIGHT_M / 2 };

  let network: NetworkOverlay | undefined;
  return {
    store,
    min: { x: minX, y: MIN_Y, z: minZ },
    max: { x: maxX, y: MAX_Y, z: maxZ },
    focusMin: { x: 0, y: MIN_Y, z: -GRID_HEIGHT_M },
    focusMax: { x: GRID_WIDTH_M, y: MAX_Y, z: 0 },
    seaLevel: SEA_LEVEL_M,
    bookmarks: [
      view(downtown, 0, 1250, 1750),
      view(on(TRANSIT_CENTER), 120, 420, 520),
      view(on(FOURTH_AND_KING), -80, 300, 380),
      view(bay, 0, 118_000, 22_000),
    ],
    decorate(overlay) {
      // 4 m at the native 64 m far tier; coarser settings simplify the lines to match.
      network = addNetworkOverlay(overlay, far, rail, farVectors, params.far / 16);
    },
    buildLod(renderer) {
      const t1 = performance.now();
      const lod = buildLod(renderer, {
        far: coarsenFarRaster(far, params.far / far.cellM),
        city: { source: new TiledSiteSource(site, params.detail), bounds: [minX, minZ, maxX, maxZ], cellM: params.detail },
      });
      console.info(
        `lod: far ${lod.farQuads} quads at ${params.far} m, city ${lod.cityQuads} quads at ${params.detail} m, ${lod.batches} batches in ${Math.round(performance.now() - t1)} ms`,
      );
      return lod;
    },
    onZoom(overlay, cameraDistanceM) {
      network?.onZoom(overlay, cameraDistanceM);
    },
    groundAt,
    summary:
      `site ${site.id} (world ${manifest.worldVersion}): ${site.counts.buildings} buildings, ${site.counts.buildingParts} parts, ` +
      `${site.counts.roads} roads, ${site.counts.railTracks} rail tracks, far raster ${far.cols} x ${far.rows}, ` +
      `${rail.tracks.length} tracks, loaded in ${Math.round(loadMs)} ms`,
  };
}
