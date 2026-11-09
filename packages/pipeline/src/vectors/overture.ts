/** Overture extracts (buildings, building parts, water, land use), cached as parquet under data/raw/overture/. */
import { GRID_HEIGHT_M, GRID_WIDTH_M, worldToLonLat } from '@bayvox/core';
import { loadSites, type SiteConfig, type SiteTileBox, siteBoxBbox, siteTileBox } from '../terrain/sites.ts';
import { OVERTURE_S3 } from './config.ts';
import type { Db } from './db.ts';
import { cachedExtract } from './raw.ts';

export interface LonLatBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SiteBox {
  site: SiteConfig;
  box: SiteTileBox;
  /** World metres [minX, minZ, maxX, maxZ]. */
  bbox: [number, number, number, number];
  lonLat: LonLatBox;
}

/** Smallest lon/lat box around a world-metre rectangle, grown by `marginDeg`, rounded outward to 1e-4 degrees. */
export function lonLatEnvelope(bbox: readonly [number, number, number, number], marginDeg: number): LonLatBox {
  const corners = [
    worldToLonLat(bbox[0], bbox[1]),
    worldToLonLat(bbox[0], bbox[3]),
    worldToLonLat(bbox[2], bbox[1]),
    worldToLonLat(bbox[2], bbox[3]),
  ];
  const down = (v: number): number => Math.floor(v * 1e4) / 1e4;
  const up = (v: number): number => Math.ceil(v * 1e4) / 1e4;
  return {
    west: down(Math.min(...corners.map((c) => c.lon)) - marginDeg),
    south: down(Math.min(...corners.map((c) => c.lat)) - marginDeg),
    east: up(Math.max(...corners.map((c) => c.lon)) + marginDeg),
    north: up(Math.max(...corners.map((c) => c.lat)) + marginDeg),
  };
}

export const GRID_WORLD_BBOX: [number, number, number, number] = [0, 0 - GRID_HEIGHT_M, GRID_WIDTH_M, 0];

export function loadSiteBoxes(): SiteBox[] {
  return loadSites().map((site) => {
    const box = siteTileBox(site);
    const bbox = siteBoxBbox(box);
    return { site, box, bbox, lonLat: lonLatEnvelope(bbox, 0.003) };
  });
}

function bboxWhere(b: LonLatBox): string {
  return `bbox.xmax > ${b.west} AND bbox.xmin < ${b.east} AND bbox.ymax > ${b.south} AND bbox.ymin < ${b.north}`;
}

function perSite(sites: readonly SiteBox[], type: string, columns: string): string {
  return sites
    .map((s) => `SELECT '${s.site.id}' AS site, ${columns} FROM read_parquet('${OVERTURE_S3}/${type}/*') WHERE ${bboxWhere(s.lonLat)}`)
    .join(' UNION ALL ');
}

export interface OvertureExtracts {
  buildings: string;
  buildingParts: string;
  landUse: string;
  /** Whole grid: used by the site tiles and the far layer. */
  water: string;
}

export const OVERTURE_TYPES = ['buildings/building', 'buildings/building_part', 'base/water', 'base/land_use'];

export async function ensureOvertureExtracts(db: Db, sites: readonly SiteBox[]): Promise<OvertureExtracts> {
  const grid = lonLatEnvelope(GRID_WORLD_BBOX, 0.01);
  const buildings = await cachedExtract(
    db,
    'site-buildings',
    perSite(
      sites,
      'theme=buildings/type=building',
      'id, height, num_floors, min_height, subtype, class, names.primary AS name, has_parts, is_underground, geometry',
    ),
  );
  const buildingParts = await cachedExtract(
    db,
    'site-building-parts',
    perSite(
      sites,
      'theme=buildings/type=building_part',
      'id, building_id, height, num_floors, min_height, names.primary AS name, is_underground, geometry',
    ),
  );
  const landUse = await cachedExtract(
    db,
    'site-land-use',
    perSite(sites, 'theme=base/type=land_use', 'id, subtype, class, names.primary AS name, geometry'),
  );
  const water = await cachedExtract(
    db,
    'grid-water',
    `SELECT id, subtype, class, names.primary AS name, geometry FROM read_parquet('${OVERTURE_S3}/theme=base/type=water/*') WHERE ${bboxWhere(grid)}`,
  );
  return { buildings, buildingParts, landUse, water };
}
