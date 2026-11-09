/** Named work sites shared by the pipeline stages: packages/pipeline/sites.json. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GRID_HEIGHT_M, GRID_WIDTH_M, lonLatToWorld, SITE_TILE_SIZE_M } from '@bayvox/core';

export const SITES_JSON_PATH = path.resolve(import.meta.dirname, '../../sites.json');

export interface SiteConfig {
  id: string;
  title: string;
  centerLat: number;
  centerLon: number;
  /** Edge of the square site in metres; a multiple of the site tile size. */
  sizeM: number;
}

export interface SiteTileBox {
  /** First site tile east and north (2,048 m tiles counted from the grid origin). */
  tx0: number;
  ty0: number;
  nx: number;
  ny: number;
}

function fail(file: string, what: string): never {
  throw new Error(`sites: ${file}: ${what}`);
}

/** Parse and validate the sites config. Unknown extra fields (owned by other stages) are ignored. */
export function parseSites(json: string, file: string): SiteConfig[] {
  const doc = JSON.parse(json) as { siteTileSizeM?: unknown; sites?: unknown };
  if (doc.siteTileSizeM !== SITE_TILE_SIZE_M) fail(file, `siteTileSizeM is ${String(doc.siteTileSizeM)}, core says ${SITE_TILE_SIZE_M}`);
  if (!Array.isArray(doc.sites) || doc.sites.length === 0) fail(file, 'no sites listed');
  const seen = new Set<string>();
  return doc.sites.map((raw: Partial<SiteConfig>, i: number) => {
    const { id, title, centerLat, centerLon, sizeM } = raw;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) fail(file, `site ${i} has an invalid id: ${String(id)}`);
    if (seen.has(id)) fail(file, `duplicate site id ${id}`);
    seen.add(id);
    if (typeof title !== 'string' || title === '') fail(file, `site ${id} has no title`);
    if (typeof centerLat !== 'number' || typeof centerLon !== 'number') fail(file, `site ${id} has no centerLat/centerLon`);
    if (typeof sizeM !== 'number' || sizeM <= 0 || sizeM % SITE_TILE_SIZE_M !== 0) {
      fail(file, `site ${id} sizeM ${String(sizeM)} is not a positive multiple of ${SITE_TILE_SIZE_M}`);
    }
    return { id, title, centerLat, centerLon, sizeM };
  });
}

export function loadSites(file: string = SITES_JSON_PATH): SiteConfig[] {
  return parseSites(readFileSync(file, 'utf8'), file);
}

/** The square of site tiles best centred on the site's centre point (rule in sites.json boxRule). */
export function siteTileBox(site: SiteConfig): SiteTileBox {
  const k = site.sizeM / SITE_TILE_SIZE_M;
  const c = lonLatToWorld(site.centerLon, site.centerLat);
  const tx0 = Math.round(c.x / SITE_TILE_SIZE_M - k / 2);
  const ty0 = Math.round((0 - c.z) / SITE_TILE_SIZE_M - k / 2);
  if (tx0 < 0 || ty0 < 0 || (tx0 + k) * SITE_TILE_SIZE_M > GRID_WIDTH_M || (ty0 + k) * SITE_TILE_SIZE_M > GRID_HEIGHT_M) {
    throw new Error(`sites: site ${site.id} box (tx0 ${tx0}, ty0 ${ty0}, ${k} x ${k} tiles) leaves the game grid`);
  }
  return { tx0, ty0, nx: k, ny: k };
}

/** World-metre bbox [minX, minZ, maxX, maxZ] of a site tile box (z points south). */
export function siteBoxBbox(box: SiteTileBox): [number, number, number, number] {
  return [
    box.tx0 * SITE_TILE_SIZE_M,
    0 - (box.ty0 + box.ny) * SITE_TILE_SIZE_M,
    (box.tx0 + box.nx) * SITE_TILE_SIZE_M,
    0 - box.ty0 * SITE_TILE_SIZE_M,
  ];
}
