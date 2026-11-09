/**
 * Terrain stage: `pnpm data:build:terrain` (node src/terrain/cli.ts).
 * Downloads terrarium tiles (cached in data/raw/terrarium/), resamples them to the world frame and
 * writes the far raster, the site DEM tiles and manifest.terrain.json under apps/game/public/data/.
 * Output is a pure function of the raw tiles, sites.json and this code: no timestamps.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  columnRockheadM,
  columnUnit,
  DEM_CELL_M,
  DEM_TILE_NODES,
  decodeTerrainRaster,
  encodeTerrainRaster,
  GRID_ORIGIN_EASTING,
  GRID_ORIGIN_NORTHING,
  GRID_TILES_X,
  GRID_TILES_Y,
  HEIGHT_UNITS_PER_M,
  isWaterColumn,
  lonLatToWorld,
  MATERIALS,
  materialAt,
  SEA_LEVEL_M,
  SITE_TILE_SIZE_M,
  TERRAIN_FORMAT_VERSION,
  type TerrainDemTileRef,
  type TerrainFileRef,
  type TerrainManifestFragment,
  type TerrainRaster,
  type TerrainSiteEntry,
  TILE_SIZE_M,
  terrainClassAt,
  terrainHeightM,
  WORLD_CRS,
} from '@bayvox/core';
import { unzlibSync, zlibSync } from 'fflate';
import { buildFarRaster, FAR_COLS, FAR_ROWS } from '../far/far-raster.ts';
import { buildDemTile } from './dem-tiles.ts';
import { gridRectPixelBounds, sampleGrid } from './resample.ts';
import { loadSites, siteBoxBbox, siteTileBox } from './sites.ts';
import { loadMosaic, type MosaicResult } from './terrarium.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const RAW_DIR = path.join(REPO_ROOT, 'data/raw/terrarium');
const OUT_DIR = path.join(REPO_ROOT, 'apps/game/public/data');
const FAR_ZOOM = 12;
const SITE_ZOOM = 14;

const deflate = (raw: Uint8Array): Uint8Array => zlibSync(raw, { level: 9 });
const inflate = (zlib: Uint8Array, rawBytes: number): Uint8Array => unzlibSync(zlib, { out: new Uint8Array(rawBytes) });

function seconds(t0: number): string {
  return `${((performance.now() - t0) / 1000).toFixed(1)} s`;
}

interface Encoded {
  ref: TerrainFileRef;
  bytes: Uint8Array;
  /** Decoded back from `bytes`: what the app will see. */
  decoded: TerrainRaster;
}

/** Encode, decode again, and insist the round trip is exact before anything is written. */
function encode(raster: TerrainRaster, dir: string, stem: string): Encoded {
  const bytes = encodeTerrainRaster(raster, deflate);
  const decoded = decodeTerrainRaster(bytes, inflate);
  for (let i = 0; i < raster.heights.length; i++) {
    if (decoded.heights[i] !== raster.heights[i] || decoded.classes[i] !== raster.classes[i]) {
      throw new Error(`terrain: ${dir}/${stem} does not round-trip at sample ${i}`);
    }
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { ref: { file: `${dir}/${stem}.${sha256.slice(0, 12)}.bin`, bytes: bytes.length, sha256 }, bytes, decoded };
}

/** Remove this stage's previous outputs so stale hashed files never accumulate. */
async function removeOld(dir: string, pattern: RegExp): Promise<void> {
  if (!existsSync(dir)) return;
  for (const name of await readdir(dir)) {
    if (pattern.test(name)) await rm(path.join(dir, name));
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

interface CheckPoint {
  lat: number;
  lon: number;
}

const POINTS = {
  twinPeaksSouth: { lat: 37.7516, lon: -122.4477 },
  salesforceTransitCenter: { lat: 37.7897, lon: -122.3962 },
  fourthAndKing: { lat: 37.7765, lon: -122.3947 },
  bayBridgeWestSpanMid: { lat: 37.798, lon: -122.377 },
  bayBridgeSfAnchorage: { lat: 37.7879, lon: -122.388 },
  bayBridgeYerbaBuena: { lat: 37.8075, lon: -122.369 },
} as const satisfies Record<string, CheckPoint>;

async function main(): Promise<void> {
  const tAll = performance.now();
  const sites = loadSites();

  // Far raster: z12 over the whole grid.
  let t0 = performance.now();
  const gridRect = { minE: 0, minN: 0, maxE: GRID_TILES_X * TILE_SIZE_M, maxN: GRID_TILES_Y * TILE_SIZE_M };
  const far12 = await loadMosaic(RAW_DIR, FAR_ZOOM, gridRectPixelBounds(FAR_ZOOM, gridRect));
  console.log(
    `terrain: z${FAR_ZOOM} mosaic, ${far12.tileCount} tiles (${far12.fetchedCount} fetched), ${far12.repairedVoids} void pixels repaired ${seconds(t0)}`,
  );
  t0 = performance.now();
  const farBuild = buildFarRaster(far12.mosaic);
  const far = encode(farBuild.raster, 'far', 'terrain');
  console.log(`terrain: far raster ${FAR_COLS} x ${FAR_ROWS} at 64 m, ${far.ref.bytes} bytes ${seconds(t0)}`);

  // Site DEM tiles: z14 per site box.
  const siteEntries: TerrainSiteEntry[] = [];
  const demFiles: Encoded[] = [];
  const demBySite = new Map<string, TerrainRaster[]>();
  const z14Sources: string[] = [];
  let z14Tiles = 0;
  for (const site of sites) {
    t0 = performance.now();
    const box = siteTileBox(site);
    const rect = {
      minE: box.tx0 * SITE_TILE_SIZE_M,
      minN: box.ty0 * SITE_TILE_SIZE_M,
      maxE: (box.tx0 + box.nx) * SITE_TILE_SIZE_M,
      maxN: (box.ty0 + box.ny) * SITE_TILE_SIZE_M,
    };
    const src: MosaicResult = await loadMosaic(RAW_DIR, SITE_ZOOM, gridRectPixelBounds(SITE_ZOOM, rect));
    z14Sources.push(`${site.id} ${src.sourceSha256}`);
    z14Tiles += src.tileCount;
    const tiles: TerrainDemTileRef[] = [];
    const rasters: TerrainRaster[] = [];
    let bytes = 0;
    for (let ty = box.ty0; ty < box.ty0 + box.ny; ty++) {
      for (let tx = box.tx0; tx < box.tx0 + box.nx; tx++) {
        const enc = encode(buildDemTile(src.mosaic, farBuild.field, tx, ty), `sites/${site.id}`, `dem_${tx}_${ty}`);
        demFiles.push(enc);
        rasters.push(enc.decoded);
        tiles.push({ tx, ty, ...enc.ref });
        bytes += enc.ref.bytes;
      }
    }
    demBySite.set(site.id, rasters);
    siteEntries.push({
      id: site.id,
      title: site.title,
      bbox: siteBoxBbox(box),
      tileBox: box,
      dem: { cellM: DEM_CELL_M, nodes: DEM_TILE_NODES, tiles },
    });
    console.log(
      `terrain: site ${site.id} tiles ${box.tx0}..${box.tx0 + box.nx - 1} x ${box.ty0}..${box.ty0 + box.ny - 1}, ${tiles.length} DEM tiles, ${bytes} bytes, ${src.tileCount} z${SITE_ZOOM} tiles (${src.fetchedCount} fetched), ${src.repairedVoids} void pixels repaired ${seconds(t0)}`,
    );
  }

  // Sanity checks on the decoded outputs (what the app will read), all in NAVD88 metres.
  const checks: Record<string, number> = {};
  const failures: string[] = [];
  const check = (name: string, value: number, lo: number, hi: number): void => {
    checks[name] = round2(value);
    if (!(value >= lo && value <= hi)) failures.push(`${name} = ${value.toFixed(2)} m, expected ${lo} to ${hi}`);
  };
  const demAt = (siteId: string, p: CheckPoint): { height: number; cls: number } => {
    const w = lonLatToWorld(p.lon, p.lat);
    for (const r of demBySite.get(siteId) ?? []) {
      const e = w.x - r.originX;
      const n = 0 - w.z - r.originN;
      if (e >= 0 && e < SITE_TILE_SIZE_M && n >= 0 && n < SITE_TILE_SIZE_M)
        return { height: terrainHeightM(r, w.x, w.z), cls: terrainClassAt(r, w.x, w.z) };
    }
    throw new Error(`terrain: check point ${p.lat}, ${p.lon} is not covered by site ${siteId}`);
  };
  const farAt = (p: CheckPoint): number => {
    const w = lonLatToWorld(p.lon, p.lat);
    return terrainHeightM(far.decoded, w.x, w.z);
  };
  const strata = (surface: number, cls: number): string => {
    const parts: string[] = [];
    let last = -1;
    for (let d = 0; d <= 130; d++) {
      const m = materialAt(surface, d, cls);
      if (m !== last) parts.push(`${MATERIALS[m]?.key} from ${d} m`);
      last = m;
    }
    return parts.join(', ');
  };

  // Twin Peaks: the resampler against the published 280.5 m summit (window max over z14), then the far cell.
  {
    const w = lonLatToWorld(POINTS.twinPeaksSouth.lon, POINTS.twinPeaksSouth.lat);
    const e0 = w.x;
    const n0 = 0 - w.z;
    const rect = { minE: e0 - 200, minN: n0 - 200, maxE: e0 + 200, maxN: n0 + 200 };
    const src = await loadMosaic(RAW_DIR, SITE_ZOOM, gridRectPixelBounds(SITE_ZOOM, rect));
    let peak = Number.NEGATIVE_INFINITY;
    for (let n = rect.minN; n <= rect.maxN; n += 4)
      for (let e = rect.minE; e <= rect.maxE; e += 4) peak = Math.max(peak, sampleGrid(src.mosaic, e, n));
    check('twinPeaksZ14WindowMaxM', peak, 277, 284);
    let farPeak = Number.NEGATIVE_INFINITY;
    for (let dn = -128; dn <= 128; dn += 64)
      for (let de = -128; de <= 128; de += 64) farPeak = Math.max(farPeak, terrainHeightM(far.decoded, w.x + de, w.z + dn));
    check('twinPeaksFarMaxM', farPeak, 245, 284);
  }
  const stc = demAt('portal', POINTS.salesforceTransitCenter);
  check('salesforceTransitCenterDemM', stc.height, SEA_LEVEL_M + 1, 9);
  check('salesforceTransitCenterFarM', farAt(POINTS.salesforceTransitCenter), SEA_LEVEL_M, 12);
  const king = demAt('portal', POINTS.fourthAndKing);
  check('fourthAndKingDemM', king.height, SEA_LEVEL_M + 0.5, 7);
  check('fourthAndKingFarM', farAt(POINTS.fourthAndKing), SEA_LEVEL_M, 8);
  const span = demAt('portal', POINTS.bayBridgeWestSpanMid);
  check('bayBridgeWestSpanMidDemM', span.height, -45, -3);
  check('bayBridgeWestSpanMidFarM', farAt(POINTS.bayBridgeWestSpanMid), -45, -3);
  if (!isWaterColumn(span.cls)) failures.push(`bay bridge west span mid is not classed as water (class ${span.cls})`);
  if (isWaterColumn(stc.cls) || isWaterColumn(king.cls)) failures.push('Salesforce Transit Center or 4th and King is classed as water');
  {
    const a = POINTS.bayBridgeSfAnchorage;
    const b = POINTS.bayBridgeYerbaBuena;
    let deepest = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 100; i++)
      deepest = Math.min(deepest, farAt({ lat: a.lat + ((b.lat - a.lat) * i) / 100, lon: a.lon + ((b.lon - a.lon) * i) / 100 }));
    check('bayBridgeWestSpanDeepestFarM', deepest, -45, -10);
  }
  for (const site of sites) {
    if (site.id === 'portal') continue;
    check(`${site.id}CentreDemM`, demAt(site.id, { lat: site.centerLat, lon: site.centerLon }).height, -3, 15);
  }
  let farMin = Number.POSITIVE_INFINITY;
  let farMax = Number.NEGATIVE_INFINITY;
  let waterCells = 0;
  const fh = far.decoded.heights;
  for (let i = 0; i < fh.length; i++) {
    farMin = Math.min(farMin, fh[i]);
    farMax = Math.max(farMax, fh[i]);
    if (isWaterColumn(far.decoded.classes[i])) waterCells++;
  }
  check('farMinM', farMin / HEIGHT_UNITS_PER_M, -125, -80);
  check('farMaxM', farMax / HEIGHT_UNITS_PER_M, 1050, 1250);
  const waterFraction = waterCells / fh.length;
  for (const [name, value] of Object.entries(checks)) console.log(`terrain: check ${name} = ${value}`);
  console.log(
    `terrain: Salesforce Transit Center column (unit ${columnUnit(stc.cls)}, rockhead ${columnRockheadM(stc.cls)} m): ${strata(stc.height, stc.cls)}`,
  );
  console.log(
    `terrain: 4th and King column (unit ${columnUnit(king.cls)}, rockhead ${columnRockheadM(king.cls)} m): ${strata(king.height, king.cls)}`,
  );
  if (failures.length > 0) throw new Error(`terrain: ${failures.length} sanity check(s) failed, nothing written: ${failures.join('; ')}`);

  // Write.
  await removeOld(path.join(OUT_DIR, 'far'), /^terrain\.[0-9a-f]+\.bin$/);
  if (existsSync(path.join(OUT_DIR, 'sites'))) {
    for (const dir of await readdir(path.join(OUT_DIR, 'sites'), { withFileTypes: true })) {
      if (dir.isDirectory()) await removeOld(path.join(OUT_DIR, 'sites', dir.name), /^dem_\d+_\d+\.[0-9a-f]+\.bin$/);
    }
  }
  for (const f of [far, ...demFiles]) {
    const file = path.join(OUT_DIR, f.ref.file);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, f.bytes);
  }
  const attribution =
    'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration.';
  const manifest: TerrainManifestFragment = {
    format: 'bayvox-terrain',
    formatVersion: TERRAIN_FORMAT_VERSION,
    frame: {
      crs: WORLD_CRS,
      originEasting: GRID_ORIGIN_EASTING,
      originNorthing: GRID_ORIGIN_NORTHING,
      tileSizeM: TILE_SIZE_M,
      tilesX: GRID_TILES_X,
      tilesY: GRID_TILES_Y,
      seaLevelM: SEA_LEVEL_M,
    },
    heightUnitsPerM: HEIGHT_UNITS_PER_M,
    far: {
      ...far.ref,
      cellM: far.decoded.cellM,
      cols: far.decoded.cols,
      rows: far.decoded.rows,
      rawBytes: far.decoded.cols * far.decoded.rows * 3,
      minHeightM: farMin / HEIGHT_UNITS_PER_M,
      maxHeightM: farMax / HEIGHT_UNITS_PER_M,
      waterFraction: Math.round(waterFraction * 1e4) / 1e4,
    },
    sites: siteEntries,
    sources: [
      {
        name: `AWS Terrain Tiles, terrarium z${FAR_ZOOM}, ${far12.tileCount} tiles`,
        license: 'Public domain (USGS 3DEP, SRTM, GMTED2010; NOAA ETOPO1); attribution requested',
        attribution,
        sha256: far12.sourceSha256,
      },
      {
        name: `AWS Terrain Tiles, terrarium z${SITE_ZOOM}, ${z14Tiles} tiles over ${sites.length} sites`,
        license: 'Public domain (USGS 3DEP, SRTM, GMTED2010; NOAA ETOPO1); attribution requested',
        attribution,
        sha256: createHash('sha256').update(z14Sources.join('\n')).digest('hex'),
      },
    ],
    checks,
  };
  await writeFile(path.join(OUT_DIR, 'manifest.terrain.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const total = far.ref.bytes + demFiles.reduce((s, f) => s + f.ref.bytes, 0);
  console.log(`terrain: wrote ${1 + demFiles.length} files, ${total} bytes, plus manifest.terrain.json ${seconds(tAll)}`);
}

main().catch((err: unknown) => {
  // Expected failures carry a one-line diagnostic; anything else is a bug and gets its stack.
  const expected = err instanceof Error && (err.constructor === Error || err.constructor === RangeError);
  console.error(expected ? err.message : err);
  process.exit(1);
});
