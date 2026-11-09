/**
 * Vector pipeline: OSM (Geofabrik NorCal PBF) and Overture extracts to the quantized, deflated assets
 * described in packages/core/src/assets/vectors.ts, plus data/manifest.vectors.json.
 * Output is a pure function of the pinned inputs, sites.json, places.json and this code: no timestamps.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import {
  decodeVectorBundle,
  encodeFarVectors,
  encodeRailNetwork,
  encodeSiteVectorTile,
  GRID_ORIGIN_EASTING,
  GRID_ORIGIN_NORTHING,
  lonLatToUtm10,
  SITE_TILE_SIZE_M,
  VECTOR_FORMAT_VERSION,
  type VectorAssetRef,
  type VectorManifest,
  type VectorSite,
  WORLD_CRS,
} from '@bayvox/core';
import {
  DATA_DIR,
  NODE_BBOX_MARGIN_DEG,
  OSM_PBF_BYTES,
  OSM_PBF_MD5,
  OSM_PBF_URL,
  OSM_SNAPSHOT,
  OSM_SNAPSHOT_DATE,
  OVERTURE_RELEASE,
  VECTOR_MANIFEST_PATH,
} from './config.ts';
import { type Db, num, openDb } from './db.ts';
import { buildFar } from './far.ts';
import { log } from './log.ts';
import { loadOsm, toUtm } from './osm.ts';
import { ensureOvertureExtracts, GRID_WORLD_BBOX, loadSiteBoxes, lonLatEnvelope, OVERTURE_TYPES } from './overture.ts';
import { buildRail } from './rail.ts';
import { ensureOsmPbf } from './raw.ts';
import { buildSiteTiles, MAX_TILE_BYTES } from './site-tiles.ts';

/** The rail file must stay under this size as served (task budget). */
export const MAX_RAIL_BYTES = 2_000_000;

/** Fail unless DuckDB's PROJ transform and the core frame agree to 5 mm at every probe point. */
async function checkProjection(db: Db, probes: readonly { lon: number; lat: number }[]): Promise<void> {
  for (const p of probes) {
    const [row] = await db.rows(`SELECT ST_X(u) AS e, ST_Y(u) AS n FROM (SELECT ${toUtm(`ST_Point(${p.lon}, ${p.lat})`)} AS u)`);
    const core = lonLatToUtm10(p.lon, p.lat);
    const err = Math.hypot(num(row ?? {}, 'e') - core.easting, num(row ?? {}, 'n') - core.northing);
    if (!(err < 0.005)) throw new Error(`projection: DuckDB and core disagree by ${err} m at lon ${p.lon}, lat ${p.lat}`);
  }
}

/** Remove this pipeline's earlier outputs from a directory (files named <prefix>.<hash>.bin). */
function clearOutputs(dir: string, pattern: RegExp): void {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) if (pattern.test(name)) rmSync(path.join(dir, name));
}

/** Deflate, verify the round trip, write data/<dir>/<stem>.<hash>.bin and return its manifest entry. */
function writeAsset(dir: string, stem: string, bundle: Uint8Array): VectorAssetRef {
  const packed = deflateSync(bundle, { level: 9 });
  const layers = decodeVectorBundle(new Uint8Array(inflateSync(packed)));
  const sha256 = createHash('sha256').update(packed).digest('hex');
  const file = `${dir}/${stem}.${sha256.slice(0, 12)}.bin`;
  writeFileSync(path.join(DATA_DIR, file), packed);
  return {
    file,
    bytes: packed.length,
    rawBytes: bundle.length,
    sha256,
    counts: Object.fromEntries(layers.map((l) => [l.name, l.geometry.length])),
  };
}

export async function buildVectors(): Promise<VectorManifest> {
  const tAll = performance.now();
  const pbf = await ensureOsmPbf();
  const sites = loadSiteBoxes();
  const db = await openDb();
  try {
    await checkProjection(
      db,
      sites.map((s) => ({ lon: s.site.centerLon, lat: s.site.centerLat })),
    );
    const extracts = await ensureOvertureExtracts(db, sites);
    await loadOsm(
      db,
      pbf,
      lonLatEnvelope(GRID_WORLD_BBOX, NODE_BBOX_MARGIN_DEG),
      sites.map((s) => s.lonLat),
    );

    let t0 = performance.now();
    const rail = await buildRail(db);
    clearOutputs(path.join(DATA_DIR, 'net'), /^(rail|far)\.[0-9a-f]+\.bin$/);
    const railRef = writeAsset('net', 'rail', encodeRailNetwork(rail.network));
    if (railRef.bytes > MAX_RAIL_BYTES) throw new Error(`rail: ${railRef.file} is ${railRef.bytes} bytes, budget ${MAX_RAIL_BYTES}`);
    log(
      `rail: ${railRef.counts.tracks} tracks, ${rail.stats.trackKm} km, ${railRef.counts.stations} stations, ${railRef.counts.routes} routes, ${railRef.bytes} bytes`,
      t0,
    );

    t0 = performance.now();
    const far = await buildFar(db, extracts.water, rail.network.stations);
    const farRef = writeAsset('net', 'far', encodeFarVectors(far.far));
    log(
      `far: ${farRef.counts.water} water polygons, ${farRef.counts.highways} highway lines, ${farRef.counts.places} places, ${farRef.bytes} bytes`,
      t0,
    );

    const built = await buildSiteTiles(db, sites, extracts);
    const manifestSites: VectorSite[] = [];
    for (const s of sites) {
      const dir = `sites/${s.site.id}`;
      clearOutputs(path.join(DATA_DIR, dir), /^\d+_\d+\.vectors\.[0-9a-f]+\.bin$/);
      const counts: Record<string, number> = {};
      const tiles = built
        .filter((b) => b.siteId === s.site.id)
        .map((b) => {
          const ref = writeAsset(dir, `${b.tx}_${b.ty}.vectors`, encodeSiteVectorTile(b.tile));
          if (ref.bytes > MAX_TILE_BYTES) throw new Error(`sites: ${ref.file} is ${ref.bytes} bytes, limit ${MAX_TILE_BYTES}`);
          for (const [layer, n] of Object.entries(ref.counts)) counts[layer] = (counts[layer] ?? 0) + n;
          return { tx: b.tx, ty: b.ty, ...ref };
        });
      if ((counts.buildings ?? 0) === 0 || (counts.roads ?? 0) === 0) {
        throw new Error(
          `sites: site ${s.site.id} has ${counts.buildings ?? 0} buildings and ${counts.roads ?? 0} roads; an empty site is a broken extract`,
        );
      }
      manifestSites.push({
        id: s.site.id,
        title: s.site.title,
        center: { lat: s.site.centerLat, lon: s.site.centerLon },
        sizeM: s.site.sizeM,
        bbox: s.bbox,
        tiles,
        counts,
      });
      const bytes = tiles.reduce((sum, t) => sum + t.bytes, 0);
      log(
        `site ${s.site.id}: ${tiles.length} tiles, ${counts.buildings} buildings, ${counts.buildingParts} parts, ${counts.roads} roads, ${counts.water} water, ${counts.landuse} land use, ${bytes} bytes`,
      );
    }

    const manifest: VectorManifest = {
      format: 'bayvox-vectors',
      formatVersion: VECTOR_FORMAT_VERSION,
      frame: { crs: WORLD_CRS, originEasting: GRID_ORIGIN_EASTING, originNorthing: GRID_ORIGIN_NORTHING, siteTileSizeM: SITE_TILE_SIZE_M },
      sources: {
        osm: {
          provider: 'Geofabrik NorCal extract of OpenStreetMap',
          url: OSM_PBF_URL,
          snapshot: OSM_SNAPSHOT,
          snapshotDate: OSM_SNAPSHOT_DATE,
          bytes: OSM_PBF_BYTES,
          md5: OSM_PBF_MD5,
          license: 'ODbL 1.0',
        },
        overture: { release: OVERTURE_RELEASE, types: OVERTURE_TYPES, license: 'ODbL 1.0 (buildings, base)' },
        curated: {
          file: 'packages/pipeline/src/vectors/places.json',
          note: 'anchor points from docs/research/05-bay-area-transit-projects.md section 5',
        },
      },
      net: {
        rail: { ...railRef, ...rail.stats },
        far: { ...farRef, ...far.stats },
      },
      sites: manifestSites,
    };
    writeFileSync(VECTOR_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    log('done', tAll);
    return manifest;
  } finally {
    db.close();
  }
}
