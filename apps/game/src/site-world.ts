/**
 * The real world: the map data under data/ (built by `pnpm data:build`), voxelized by packages/world.
 * Near field: 1 m voxel chunks from a ChunkWorldStore over the loaded site's DEM and vector tiles. Around
 * it the city tier (the same site at 4 m columns) and the far tier (the whole Bay at 64 m), plus the rail
 * network overlay. One site is loaded at a time; loadSite swaps it (a mission names its site). Outside the
 * site there are no voxels: the ground query answers from the far raster, so alignments there are
 * vector-only. Missing or stale data stops the load with the file name; there is no synthetic fallback.
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
  createGroundQuery,
  digSphere,
  type FetchBytes,
  loadEditLog,
  loadFarRaster,
  loadFarVectors,
  loadManifest,
  loadRailNetwork,
  loadSite,
  type SiteData,
  saveEditLog,
  TiledSiteSource,
  WorldStamps,
} from '@bayvox/world';
import type { GameWorld, Rect } from './game-world.ts';
import { buildLod, type LodBuild } from './lod.ts';
import { addNetworkOverlay, type NetworkOverlay } from './network-overlay.ts';
import type { GameParams } from './params.ts';

/** The site of the first scenario (packages/pipeline/sites.json). */
export const DEFAULT_SITE_ID = 'portal';
/** Vertical range of the voxel world: three chunks below sea level (tunnels, the cut) to above the tallest tower. */
const MIN_Y = -3 * CHUNK_SIZE;
const MAX_Y = 11 * CHUNK_SIZE;
/** Chunk data kept resident before the least recently used chunks outside the streaming windows are dropped. */
export const CHUNK_BUDGET_BYTES = 192 * 1024 * 1024;
/** 1 m site tiles (about 20 MB each) kept rasterized: the near field touches at most four, the machine window may add one. */
export const SITE_TILES_RESIDENT = 5;

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

export async function createSiteWorld(params: GameParams, fetchBytes: FetchBytes = dataFetcher(), firstSite?: string): Promise<GameWorld> {
  const t0 = performance.now();
  const manifest = await loadManifest(fetchBytes);
  const [far, rail, farVectors] = await Promise.all([
    loadFarRaster(manifest, fetchBytes),
    loadRailNetwork(manifest, fetchBytes),
    loadFarVectors(manifest, fetchBytes),
  ]);
  const siteRects = manifest.sites.map((s) => ({ id: s.id, bounds: s.bbox as Rect }));

  const store = new ChunkWorldStore({ voxelSizeM: VOXEL_SIZE_M, columnCacheSize: 2048, budgetBytes: CHUNK_BUDGET_BYTES });
  let site: SiteData | null = null;
  let source: TiledSiteSource | undefined;
  let lod: LodBuild | undefined;
  let network: NetworkOverlay | undefined;

  const ground = createGroundQuery(far, { detail: () => source });
  const groundAt = (x: number, z: number): number => (ground.contains(x, z) ? ground.topM(x, z) : SEA_LEVEL_M);
  const stamps = new WorldStamps(store, (x, z) => ground.surfaceM(x, z));

  const on = (p: { x: number; z: number }): WorldPos => ({ x: p.x, y: Math.round(groundAt(p.x, p.z)), z: p.z });
  const view = (target: WorldPos, dx: number, dy: number, dz: number): CameraBookmark => ({
    position: { x: target.x + dx, y: target.y + dy, z: target.z + dz },
    target,
  });
  const bay: WorldPos = { x: GRID_WIDTH_M / 2, y: 0, z: -GRID_HEIGHT_M / 2 };
  /** Four views per site: overview, two close ones, the whole Bay. Camera positions are south of their target (+z), so north is up on screen. */
  const bookmarksOf = (s: SiteData): CameraBookmark[] => {
    if (s.id === 'portal') {
      const downtown = on({ x: (TRANSIT_CENTER.x + FOURTH_AND_KING.x) / 2, z: (TRANSIT_CENTER.z + FOURTH_AND_KING.z) / 2 });
      return [
        view(downtown, 0, 1250, 1750),
        view(on(TRANSIT_CENTER), 120, 420, 520),
        view(on(FOURTH_AND_KING), -80, 300, 380),
        view(bay, 0, 118_000, 22_000),
      ];
    }
    const cx = (s.bounds.minX + s.bounds.maxX) / 2;
    const cz = (s.bounds.minZ + s.bounds.maxZ) / 2;
    const quarter = (s.bounds.maxX - s.bounds.minX) / 4;
    return [
      view(on({ x: cx, z: cz }), 0, 1250, 1750),
      view(on({ x: cx, z: cz }), 120, 420, 520),
      view(on({ x: cx - quarter, z: cz + quarter }), -80, 300, 380),
      view(bay, 0, 118_000, 22_000),
    ];
  };
  const cityOf = (s: SiteData) => ({ siteId: s.id, source: new TiledSiteSource(s, params.detail), cellM: params.detail });

  const world: GameWorld & { siteId: string; summary: string } = {
    store,
    simStore: store.view('sim'),
    min: { x: 0, y: MIN_Y, z: 0 },
    max: { x: 0, y: MAX_Y, z: 0 },
    focusMin: { x: 0, y: MIN_Y, z: -GRID_HEIGHT_M },
    focusMax: { x: GRID_WIDTH_M, y: MAX_Y, z: 0 },
    seaLevel: SEA_LEVEL_M,
    siteId: '',
    siteIds: manifest.sites.map((s) => s.id),
    siteRect: (siteId) => siteRects.find((r) => r.id === siteId)?.bounds,
    worldVersion: manifest.worldVersion,
    bookmarks: [],
    ground,
    summary: '',
    async loadSite(siteId) {
      if (site !== null && siteId === site.id) {
        world.edits?.reset();
        return;
      }
      const t1 = performance.now();
      // Fetched and decoded before anything is replaced: a failure leaves the previous site in place.
      const next = await loadSite(manifest, siteId, fetchBytes, rail);
      const t2 = performance.now();
      site = next;
      source = new TiledSiteSource(next, VOXEL_SIZE_M, { maxTiles: SITE_TILES_RESIDENT });
      store.setSource(source);
      stamps.forget();
      world.siteId = next.id;
      world.min.x = next.bounds.minX;
      world.min.z = next.bounds.minZ;
      world.max.x = next.bounds.maxX;
      world.max.z = next.bounds.maxZ;
      world.bookmarks.splice(0, world.bookmarks.length, ...bookmarksOf(next));
      const quads = lod?.setCity(cityOf(next));
      world.summary =
        `site ${next.id} (world ${manifest.worldVersion}): ${next.counts.buildings} buildings, ${next.counts.buildingParts} parts, ` +
        `${next.counts.roads} roads, ${next.counts.railTracks} rail tracks, far raster ${far.cols} x ${far.rows}, ` +
        `${rail.tracks.length} tracks, loaded in ${Math.round(t2 - t1)} ms`;
      if (quads !== undefined)
        console.info(
          `site ${next.id}: loaded in ${Math.round(t2 - t1)} ms, city tier ${quads} quads in ${Math.round(performance.now() - t2)} ms`,
        );
    },
    edits: {
      dig(center, radiusM) {
        const r = digSphere(store, center, radiusM);
        return { removedM3: r.removedM3, dirtyChunks: r.dirty.length };
      },
      save: () => saveEditLog(store),
      load: (text, expected) => loadEditLog(store, text, expected),
      reset() {
        store.resetEdits();
        stamps.forget();
      },
      syncStamps: (records) => stamps.sync(records),
    },
    decorate(overlay) {
      // 4 m at the native 64 m far tier; coarser settings simplify the lines to match.
      network = addNetworkOverlay(overlay, far, rail, farVectors, params.far / 16);
    },
    decorationIds: () => network?.ids ?? [],
    buildLod(renderer) {
      const t1 = performance.now();
      lod = buildLod(renderer, {
        far: coarsenFarRaster(far, params.far / far.cellM),
        sites: siteRects,
        city: site === null ? null : cityOf(site),
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
  };
  await world.loadSite?.(firstSite ?? params.site ?? DEFAULT_SITE_ID);
  world.summary = world.summary.replace(/loaded in \d+ ms$/, `loaded in ${Math.round(performance.now() - t0)} ms`);
  return world;
}
