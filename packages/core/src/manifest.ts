/**
 * World data manifest and asset path conventions. TYPES ONLY: binary layouts of the files named
 * here are defined by the pipeline work packages in files they own.
 *
 * Runtime data is served from apps/game/public/data/ (URL prefix `data/`, relative to the app base):
 *
 *   data/manifest.json                                 WorldManifest (this file's type), merged by the pipeline
 *                                                      from manifest.terrain.json and manifest.vectors.json
 *   data/far/terrain.<hash>.bin                        far raster, tier F: 64 m columns for the whole grid (assets/terrain.ts)
 *   data/net/rail.<hash>.bin                           existing rail network (assets/vectors.ts)
 *   data/net/far.<hash>.bin                            region-wide water, highways and places (assets/vectors.ts)
 *   data/sites/<siteId>/dem_<tx>_<ty>.<hash>.bin       site DEM tile, 2,048 m, 8 m nodes (assets/terrain.ts)
 *   data/sites/<siteId>/<tx>_<ty>.vectors.<hash>.bin   site vector tile: buildings, roads, water, land use (assets/vectors.ts)
 *
 * `<hash>` is a content hash so files are immutable and cacheable forever; only manifest.json is
 * fetched uncached. Every path in the manifest is relative to data/. Raw downloads live in
 * data/raw/ at the repo root (gitignored) and are never served.
 */

/** URL prefix of runtime data, relative to the app base. */
export const DATA_URL_PREFIX = 'data/';
/** Manifest location relative to the app base. */
export const MANIFEST_URL = 'data/manifest.json';
/** Site tile edge in metres (doc 04 section 9.2): half a region tile. */
export const SITE_TILE_SIZE_M = 2048;
/** Far raster cell in metres (tier F). */
export const FAR_CELL_M = 64;

export type FarRasterPath = `far/${string}.bin`;
export type RailNetworkPath = `net/rail.${string}.bin`;
export type FarVectorsPath = `net/far.${string}.bin`;
/** Site vector tile. */
export type SiteTilePath = `sites/${string}/${number}_${number}.vectors.${string}.bin`;
export type SiteDemPath = `sites/${string}/dem_${number}_${number}.${string}.bin`;

/** One served file. */
export interface AssetRef<P extends string = string> {
  /** Path relative to data/. */
  file: P;
  bytes: number;
  /** Lower-case hex sha256 of the file as served. */
  sha256: string;
}

/** Far raster (tier F): one column per 64 m cell over the whole 20 x 24 tile grid. */
export interface FarRasterAsset extends AssetRef<FarRasterPath> {
  cellM: number;
  /** Columns west to east: 1,280 at 64 m. */
  cols: number;
  /** Rows: 1,536 at 64 m. Row order is defined by the binary layout. */
  rows: number;
}

/** Existing rail network. */
export interface RailNetworkAsset extends AssetRef<RailNetworkPath> {
  /** Layout discriminator owned by the pipeline: `bvv1-rail` (assets/vectors.ts RailNetwork). */
  kind: string;
}

/** Region-wide vector layers: water, highways, places. */
export interface FarVectorsAsset extends AssetRef<FarVectorsPath> {
  /** `bvv1-far` (assets/vectors.ts FarVectors). */
  kind: string;
}

/** One 2,048 m site vector tile. (tx, ty) index the site-tile grid: tx east from the grid origin, ty north. */
export interface SiteTileAsset extends AssetRef<SiteTilePath> {
  tx: number;
  ty: number;
}

/** One 2,048 m site DEM tile, same indexing as SiteTileAsset. */
export interface SiteDemTileAsset extends AssetRef<SiteDemPath> {
  tx: number;
  ty: number;
}

/** A work site: the set of tiles to load for a scenario area such as The Portal. */
export interface SiteAsset {
  /** Stable id, for example `portal`. Also the directory name under data/sites/. */
  id: string;
  title: string;
  /** World metres: [minX, minZ, maxX, maxZ]. */
  bbox: [number, number, number, number];
  /** Site-tile range: tiles tx0 .. tx0 + nx - 1 east, ty0 .. ty0 + ny - 1 north. */
  tileBox: { tx0: number; ty0: number; nx: number; ny: number };
  /** Vector tiles, one per site tile of tileBox. */
  tiles: SiteTileAsset[];
  /** DEM tiles, one per site tile of tileBox. */
  dem: SiteDemTileAsset[];
}

export interface SourceAttribution {
  name: string;
  license: string;
  attribution: string;
  /** Checksum of the raw input: sha256, or the publisher's own digest prefixed with its name (`md5:...`). */
  sha256: string;
}

/** Version of the binary layouts named by a WorldManifest; the app refuses any other value. */
export const WORLD_FORMAT_VERSION = 1;

export interface WorldManifest {
  format: 'bayvox-world';
  /** Version of the binary layouts; the app refuses any other value. */
  formatVersion: number;
  /** Hash of all inputs plus params; saves pin this. */
  worldVersion: string;
  /** World frame; must equal the constants in frame.ts or the app refuses to load. */
  frame: {
    crs: 'EPSG:32610';
    originEasting: number;
    originNorthing: number;
    tileSizeM: number;
    tilesX: number;
    tilesY: number;
    seaLevelM: number;
  };
  voxelSizeM: number;
  chunkSize: number;
  far: FarRasterAsset;
  rail: RailNetworkAsset;
  farVectors: FarVectorsAsset;
  sites: SiteAsset[];
  sources: SourceAttribution[];
}
