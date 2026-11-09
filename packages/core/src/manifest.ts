/**
 * World data manifest and asset path conventions. TYPES ONLY: binary layouts of the files named
 * here are defined by the pipeline work packages in files they own.
 *
 * Runtime data is served from apps/game/public/data/ (URL prefix `data/`, relative to the app base):
 *
 *   data/manifest.json                      WorldManifest (this file's type)
 *   data/far/<name>.<hash>.bin              far raster, tier F: 64 m columns for the whole grid, one file
 *   data/rail/<name>.<hash>.bin|json        existing rail network plus scenario alignments, one file
 *   data/sites/<siteId>/<tx>_<ty>.<hash>.bin  site tiles: DEM plus vectors for a work site, 2,048 m tiles
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
export type RailNetworkPath = `rail/${string}`;
export type SiteTilePath = `sites/${string}/${number}_${number}.${string}`;

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

/** Existing rail network plus scenario alignments. */
export interface RailNetworkAsset extends AssetRef<RailNetworkPath> {
  /** Layout discriminator owned by the pipeline, for example `rail-json-v1`. */
  kind: string;
}

/** One 2,048 m site tile. (tx, ty) index the site-tile grid: tx east from the grid origin, ty north. */
export interface SiteTileAsset extends AssetRef<SiteTilePath> {
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
  tiles: SiteTileAsset[];
}

export interface SourceAttribution {
  name: string;
  license: string;
  attribution: string;
  /** sha256 of the raw input. */
  sha256: string;
}

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
  sites: SiteAsset[];
  sources: SourceAttribution[];
}
