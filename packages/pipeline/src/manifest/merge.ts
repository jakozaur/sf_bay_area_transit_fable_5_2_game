/**
 * Manifest stage: merges the terrain and vector fragments (manifest.terrain.json, manifest.vectors.json)
 * into the one file the app fetches, data/manifest.json (core WorldManifest). Pure: no file access here.
 */
import {
  CHUNK_SIZE,
  type FarVectorsPath,
  GRID_ORIGIN_EASTING,
  GRID_ORIGIN_NORTHING,
  GRID_TILES_X,
  GRID_TILES_Y,
  type RailNetworkPath,
  SEA_LEVEL_M,
  SITE_TILE_SIZE_M,
  type SiteAsset,
  type SiteDemPath,
  type SiteTilePath,
  TERRAIN_FORMAT_VERSION,
  type TerrainManifestFragment,
  TILE_SIZE_M,
  VECTOR_FORMAT_VERSION,
  type VectorManifest,
  VOXEL_SIZE_M,
  WORLD_CRS,
  WORLD_FORMAT_VERSION,
  type WorldManifest,
} from '@bayvox/core';

function fail(what: string): never {
  throw new Error(`manifest: ${what}`);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function matches<P extends string>(file: string, pattern: RegExp, what: string): P {
  if (!pattern.test(file)) fail(`${what} has an unexpected path: ${file}`);
  return file as P;
}

/** Every served file of a manifest with its recorded size and hash. */
export function manifestFiles(m: WorldManifest): { file: string; bytes: number; sha256: string }[] {
  const out: { file: string; bytes: number; sha256: string }[] = [m.far, m.rail, m.farVectors].map(({ file, bytes, sha256 }) => ({
    file,
    bytes,
    sha256,
  }));
  for (const site of m.sites) {
    for (const t of [...site.dem, ...site.tiles]) out.push({ file: t.file, bytes: t.bytes, sha256: t.sha256 });
  }
  return out;
}

/**
 * `sha256Hex` hashes a string; it is injected so this module stays free of node:crypto.
 * Throws naming the mismatch if the two fragments do not describe the same frame, sites and tiles.
 */
export function mergeManifest(
  terrain: TerrainManifestFragment,
  vectors: VectorManifest,
  sha256Hex: (text: string) => string,
): WorldManifest {
  if (terrain.format !== 'bayvox-terrain' || terrain.formatVersion !== TERRAIN_FORMAT_VERSION) {
    fail(`terrain fragment is ${terrain.format} v${terrain.formatVersion}, this build reads bayvox-terrain v${TERRAIN_FORMAT_VERSION}`);
  }
  if (vectors.format !== 'bayvox-vectors' || vectors.formatVersion !== VECTOR_FORMAT_VERSION) {
    fail(`vector fragment is ${vectors.format} v${vectors.formatVersion}, this build reads bayvox-vectors v${VECTOR_FORMAT_VERSION}`);
  }
  const frame: WorldManifest['frame'] = {
    crs: WORLD_CRS,
    originEasting: GRID_ORIGIN_EASTING,
    originNorthing: GRID_ORIGIN_NORTHING,
    tileSizeM: TILE_SIZE_M,
    tilesX: GRID_TILES_X,
    tilesY: GRID_TILES_Y,
    seaLevelM: SEA_LEVEL_M,
  };
  if (!same(terrain.frame, frame))
    fail(`terrain fragment frame ${JSON.stringify(terrain.frame)} differs from core ${JSON.stringify(frame)}`);
  const vf = vectors.frame;
  if (
    vf.crs !== frame.crs ||
    vf.originEasting !== frame.originEasting ||
    vf.originNorthing !== frame.originNorthing ||
    vf.siteTileSizeM !== SITE_TILE_SIZE_M
  ) {
    fail(`vector fragment frame ${JSON.stringify(vf)} differs from core (site tile ${SITE_TILE_SIZE_M} m)`);
  }

  const vectorSites = new Map(vectors.sites.map((s) => [s.id, s]));
  if (vectorSites.size !== terrain.sites.length) {
    fail(`terrain has sites [${terrain.sites.map((s) => s.id).join(', ')}], vectors have [${[...vectorSites.keys()].join(', ')}]`);
  }
  const sites: SiteAsset[] = terrain.sites.map((t) => {
    const v = vectorSites.get(t.id);
    if (v === undefined) fail(`site ${t.id} has terrain but no vector tiles`);
    if (!same(t.bbox, v.bbox)) fail(`site ${t.id} bbox differs: terrain ${JSON.stringify(t.bbox)}, vectors ${JSON.stringify(v.bbox)}`);
    const want = t.tileBox.nx * t.tileBox.ny;
    const key = (tile: { tx: number; ty: number }): string => `${tile.tx}_${tile.ty}`;
    const expected = new Set<string>();
    for (let ty = t.tileBox.ty0; ty < t.tileBox.ty0 + t.tileBox.ny; ty++) {
      for (let tx = t.tileBox.tx0; tx < t.tileBox.tx0 + t.tileBox.nx; tx++) expected.add(`${tx}_${ty}`);
    }
    for (const [what, tiles] of [
      ['DEM', t.dem.tiles],
      ['vector', v.tiles],
    ] as const) {
      const got = new Set(tiles.map(key));
      if (tiles.length !== want || got.size !== want || [...got].some((k) => !expected.has(k))) {
        fail(`site ${t.id} ${what} tiles [${[...got].join(', ')}] do not cover its tile box [${[...expected].join(', ')}]`);
      }
    }
    const order = (a: { tx: number; ty: number }, b: { tx: number; ty: number }): number => a.ty - b.ty || a.tx - b.tx;
    return {
      id: t.id,
      title: t.title,
      bbox: t.bbox,
      tileBox: t.tileBox,
      tiles: [...v.tiles].sort(order).map((tile) => ({
        file: matches<SiteTilePath>(tile.file, /^sites\/[^/]+\/\d+_\d+\.vectors\.[0-9a-f]+\.bin$/, `site ${t.id} vector tile`),
        bytes: tile.bytes,
        sha256: tile.sha256,
        tx: tile.tx,
        ty: tile.ty,
      })),
      dem: [...t.dem.tiles].sort(order).map((tile) => ({
        file: matches<SiteDemPath>(tile.file, /^sites\/[^/]+\/dem_\d+_\d+\.[0-9a-f]+\.bin$/, `site ${t.id} DEM tile`),
        bytes: tile.bytes,
        sha256: tile.sha256,
        tx: tile.tx,
        ty: tile.ty,
      })),
    };
  });

  const { osm, overture } = vectors.sources;
  const manifest: WorldManifest = {
    format: 'bayvox-world',
    formatVersion: WORLD_FORMAT_VERSION,
    worldVersion: '',
    frame,
    voxelSizeM: VOXEL_SIZE_M,
    chunkSize: CHUNK_SIZE,
    far: {
      file: matches(terrain.far.file, /^far\/terrain\.[0-9a-f]+\.bin$/, 'far raster'),
      bytes: terrain.far.bytes,
      sha256: terrain.far.sha256,
      cellM: terrain.far.cellM,
      cols: terrain.far.cols,
      rows: terrain.far.rows,
    },
    rail: {
      file: matches<RailNetworkPath>(vectors.net.rail.file, /^net\/rail\.[0-9a-f]+\.bin$/, 'rail network'),
      bytes: vectors.net.rail.bytes,
      sha256: vectors.net.rail.sha256,
      kind: 'bvv1-rail',
    },
    farVectors: {
      file: matches<FarVectorsPath>(vectors.net.far.file, /^net\/far\.[0-9a-f]+\.bin$/, 'far vectors'),
      bytes: vectors.net.far.bytes,
      sha256: vectors.net.far.sha256,
      kind: 'bvv1-far',
    },
    sites,
    sources: [
      ...terrain.sources,
      {
        name: `${osm.provider}, snapshot ${osm.snapshot} (${osm.snapshotDate})`,
        license: osm.license,
        attribution: '(c) OpenStreetMap contributors, https://www.openstreetmap.org/copyright',
        sha256: `md5:${osm.md5}`,
      },
      {
        name: `Overture Maps Foundation, release ${overture.release} (${overture.types.join(', ')})`,
        license: overture.license,
        attribution: '(c) OpenStreetMap contributors, Overture Maps Foundation, https://docs.overturemaps.org/attribution/',
        // Overture publishes no archive checksum; the release id pins the input.
        sha256: `release:${overture.release}`,
      },
    ],
  };
  // The world version is a hash over every served file's hash: it changes exactly when the data does.
  manifest.worldVersion = sha256Hex(
    manifestFiles(manifest)
      .map((f) => `${f.file} ${f.sha256}`)
      .sort()
      .join('\n'),
  ).slice(0, 16);
  return manifest;
}
