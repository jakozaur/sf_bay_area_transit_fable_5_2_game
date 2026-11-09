/** sites/<siteId>/<tx>_<ty>.vectors: buildings and parts (Overture), roads (OSM), water and land use (Overture). */
import {
  fnv1a32String,
  GRID_ORIGIN_EASTING,
  GRID_ORIGIN_NORTHING,
  SITE_TILE_SIZE_M,
  SITE_VECTOR_QUANT_M,
  type SiteBuilding,
  type SiteLanduse,
  type SiteRoad,
  type SiteVectorTile,
  type SiteWater,
} from '@bayvox/core';
import { blob, type Db, num, optNum, type Row, sqlString, str } from './db.ts';
import { snapPart, sortSpatially, utmToWorldFlat } from './geom.ts';
import { log } from './log.ts';
import { ROAD_CLASSES, sqlList, toUtm } from './osm.ts';
import type { OvertureExtracts, SiteBox } from './overture.ts';
import { parseWkb } from './wkb.ts';

/** Storey height of the num_floors fallback, metres (research doc 01, recommendation 6). */
export const FLOOR_HEIGHT_M = 3;
/** Last step of the height chain: metres by Overture class, then by subtype, then DEFAULT_HEIGHT_M. */
export const CLASS_HEIGHT_M: Readonly<Record<string, number>> = {
  garage: 3,
  garages: 3,
  shed: 3,
  carport: 3,
  hut: 3,
  cabin: 3,
  kiosk: 3,
  greenhouse: 3,
  static_caravan: 3,
  houseboat: 3,
  roof: 4,
  bungalow: 4,
  house: 6,
  detached: 6,
  semidetached_house: 6,
  terrace: 7,
  residential: 8,
  apartments: 12,
  dormitory: 12,
  retail: 6,
  supermarket: 6,
  commercial: 8,
  warehouse: 8,
  industrial: 8,
  hangar: 10,
  parking: 9,
  office: 15,
  hotel: 15,
  school: 8,
  university: 12,
  hospital: 15,
  church: 12,
  cathedral: 20,
  stadium: 20,
};
export const SUBTYPE_HEIGHT_M: Readonly<Record<string, number>> = {
  outbuilding: 3,
  service: 4,
  agricultural: 5,
  residential: 6,
  military: 6,
  transportation: 6,
  commercial: 8,
  industrial: 8,
  civic: 8,
  education: 8,
  entertainment: 8,
  medical: 10,
  religious: 10,
};
export const DEFAULT_HEIGHT_M = 6;

/** Buildings keep their name when they are at least this tall, this large, or of a civic subtype. */
export const LANDMARK_HEIGHT_M = 40;
export const LANDMARK_AREA_M2 = 3000;
export const LANDMARK_SUBTYPES: readonly string[] = ['civic', 'education', 'entertainment', 'medical', 'religious', 'transportation'];

/** Lane width of the lanes fallback, metres. */
export const LANE_WIDTH_M = 3.3;
/** Last step of the road width chain: carriageway metres by OSM highway class. */
export const ROAD_CLASS_WIDTH_M: Readonly<Record<(typeof ROAD_CLASSES)[number], number>> = {
  motorway: 14,
  trunk: 14,
  primary: 14,
  secondary: 12,
  tertiary: 10,
  unclassified: 8,
  residential: 8,
  living_street: 6,
  service: 4,
  pedestrian: 5,
  motorway_link: 6,
  trunk_link: 6,
  primary_link: 6,
  secondary_link: 6,
  tertiary_link: 6,
};

/** Overture water that is not a water body to draw: named-area outlines and pools. Salt ponds are kept. */
export const WATER_FILTER = "subtype <> 'physical' AND (subtype <> 'human_made' OR class = 'salt_pond')";

/** Bounds a tile must stay inside (doc 04 section 9.4 step 6): beyond these the bake fails. */
export const MAX_TILE_BUILDINGS = 30_000;
export const MAX_TILE_BYTES = 1_500_000;

/** The height fallback chain: Overture height, else floors x 3 m, else class, subtype, then the global default. */
export function buildingHeight(
  height: number | undefined,
  floors: number | undefined,
  cls: string,
  subtype: string,
): { heightDm: number; heightSrc: string } {
  if (height !== undefined && height > 0) return { heightDm: Math.max(1, Math.round(height * 10)), heightSrc: 'height' };
  if (floors !== undefined && floors > 0) return { heightDm: floors * FLOOR_HEIGHT_M * 10, heightSrc: 'floors' };
  return { heightDm: (CLASS_HEIGHT_M[cls] ?? SUBTYPE_HEIGHT_M[subtype] ?? DEFAULT_HEIGHT_M) * 10, heightSrc: 'default' };
}

/** OSM width tag to metres: "12", "12.5 m", or feet and inches such as 21'4". Undefined when unparsable. */
export function parseWidthM(tag: string): number | undefined {
  const metric = /^(\d+(?:\.\d+)?)\s*m?$/.exec(tag.trim());
  if (metric !== null) return Number(metric[1]);
  const imperial = /^(\d+)'(?:\s*(\d+)")?$/.exec(tag.trim());
  if (imperial !== null) return Number(imperial[1]) * 0.3048 + Number(imperial[2] ?? 0) * 0.0254;
  return undefined;
}

/** Road width chain: OSM width tag, else lanes x 3.3 m, else the class default. Clamped to 2..60 m. */
export function roadWidth(widthTag: string, lanes: number, cls: string): { widthDm: number; widthSrc: string } {
  const clamp = (m: number): number => Math.round(Math.min(60, Math.max(2, m)) * 10);
  const tagged = parseWidthM(widthTag);
  if (tagged !== undefined && tagged > 0) return { widthDm: clamp(tagged), widthSrc: 'width' };
  if (lanes > 0) return { widthDm: clamp(lanes * LANE_WIDTH_M), widthSrc: 'lanes' };
  const byClass = (ROAD_CLASS_WIDTH_M as Record<string, number>)[cls];
  if (byClass === undefined) throw new Error(`roads: no default width for highway class "${cls}"`);
  return { widthDm: clamp(byClass), widthSrc: 'class' };
}

export interface BuiltSiteTile {
  siteId: string;
  tx: number;
  ty: number;
  tile: SiteVectorTile;
}

const tileKey = (siteId: string, tx: number, ty: number): string => `${siteId}/${tx}_${ty}`;

/** World-frame polygons of a UTM WKB geometry, one ring list per polygon, snapped; degenerate rings dropped. */
function polygonsOf(wkb: Uint8Array): Float64Array[][] {
  const out: Float64Array[][] = [];
  for (const rings of parseWkb(wkb).polygons) {
    const snapped: Float64Array[] = [];
    for (let r = 0; r < rings.length; r++) {
      const ring = snapPart(utmToWorldFlat(rings[r] as Float64Array), SITE_VECTOR_QUANT_M, true);
      if (ring !== undefined) snapped.push(ring);
      else if (r === 0) break;
    }
    if (snapped.length > 0) out.push(snapped);
  }
  return out;
}

export async function buildSiteTiles(db: Db, sites: readonly SiteBox[], extracts: OvertureExtracts): Promise<BuiltSiteTile[]> {
  const tiles = new Map<string, BuiltSiteTile>();
  const values: string[] = [];
  for (const s of sites) {
    for (let ty = s.box.ty0; ty < s.box.ty0 + s.box.ny; ty++) {
      for (let tx = s.box.tx0; tx < s.box.tx0 + s.box.nx; tx++) {
        tiles.set(tileKey(s.site.id, tx, ty), {
          siteId: s.site.id,
          tx,
          ty,
          tile: { buildings: [], buildingParts: [], roads: [], water: [], landuse: [] },
        });
        const e0 = GRID_ORIGIN_EASTING + tx * SITE_TILE_SIZE_M;
        const n0 = GRID_ORIGIN_NORTHING + ty * SITE_TILE_SIZE_M;
        values.push(
          `(${sqlString(s.site.id)}, ${tx}, ${ty}, ST_MakeEnvelope(${e0}, ${n0}, ${e0 + SITE_TILE_SIZE_M}, ${n0 + SITE_TILE_SIZE_M}))`,
        );
      }
    }
  }
  await db.run(`CREATE TABLE tile AS SELECT * FROM (VALUES ${values.join(', ')}) AS t(site, tx, ty, g)`);

  // Buildings and parts: whole footprints, assigned to the tile holding the centre of their bounding box.
  let t0 = performance.now();
  const footprints = async (file: string, isPart: boolean): Promise<void> => {
    const rows = await db.rows(`
      WITH g AS (SELECT *, ${toUtm('geometry')} AS u FROM read_parquet(${sqlString(file)}) WHERE NOT coalesce(is_underground, false))
      SELECT site, id, ${isPart ? 'building_id, NULL AS subtype, NULL AS class, false AS has_parts' : 'id AS building_id, subtype, class, has_parts'},
        height, num_floors, min_height, name, ST_AsWKB(u) AS wkb, ST_Area(u) AS area,
        (ST_XMin(u) + ST_XMax(u)) / 2 AS ce, (ST_YMin(u) + ST_YMax(u)) / 2 AS cn
      FROM g ORDER BY site, id`);
    const seen = new Set<string>();
    for (const row of rows) {
      const tx = Math.floor((num(row, 'ce') - GRID_ORIGIN_EASTING) / SITE_TILE_SIZE_M);
      const ty = Math.floor((num(row, 'cn') - GRID_ORIGIN_NORTHING) / SITE_TILE_SIZE_M);
      const site = str(row, 'site');
      const built = tiles.get(tileKey(site, tx, ty));
      const id = str(row, 'id');
      if (built === undefined || seen.has(`${site}/${id}`)) continue;
      seen.add(`${site}/${id}`);
      const subtype = str(row, 'subtype');
      const cls = str(row, 'class');
      const height = optNum(row, 'height');
      const h = buildingHeight(height, optNum(row, 'num_floors'), cls, subtype);
      const landmark = h.heightDm >= LANDMARK_HEIGHT_M * 10 || num(row, 'area') >= LANDMARK_AREA_M2 || LANDMARK_SUBTYPES.includes(subtype);
      const attrs = {
        ...h,
        minHeightDm: Math.max(0, Math.round((optNum(row, 'min_height') ?? 0) * 10)),
        floors: Math.max(0, optNum(row, 'num_floors') ?? 0),
        subtype,
        cls,
        name: landmark ? str(row, 'name') : '',
        hasParts: row.has_parts === true ? 1 : 0,
        idHash: fnv1a32String(str(row, 'building_id')),
      };
      for (const parts of polygonsOf(blob(row, 'wkb'))) {
        const feature: SiteBuilding = { ...attrs, parts };
        (isPart ? built.tile.buildingParts : built.tile.buildings).push(feature);
      }
    }
  };
  await footprints(extracts.buildings, false);
  await footprints(extracts.buildingParts, true);
  log('sites: buildings and parts', t0);

  // Roads: OSM ways clipped to each tile.
  t0 = performance.now();
  await db.run(`CREATE TABLE site_road AS SELECT id, ${toUtm('g')} AS u FROM road_line WHERE in_site`);
  const roadRows = await db.rows(`
    SELECT t.site, t.tx, t.ty, r.id, w.tags['highway'] AS cls, w.tags['name'] AS name, w.tags['width'] AS width, w.tags['lanes'] AS lanes,
      w.tags['oneway'] AS oneway, w.tags['bridge'] AS bridge, w.tags['tunnel'] AS tunnel, w.tags['layer'] AS layer,
      ST_AsWKB(ST_Intersection(r.u, t.g)) AS wkb
    FROM site_road r JOIN tile t ON ST_Intersects(r.u, t.g) JOIN way w ON w.id = r.id
    WHERE w.tags['highway'] IN ${sqlList(ROAD_CLASSES)} ORDER BY t.site, t.tx, t.ty, r.id`);
  const flag = (v: string): number => (v !== '' && v !== 'no' ? 1 : 0);
  for (const row of roadRows) {
    const built = tiles.get(tileKey(str(row, 'site'), num(row, 'tx'), num(row, 'ty'))) as BuiltSiteTile;
    const cls = str(row, 'cls');
    const lanes = Number.parseInt(str(row, 'lanes'), 10);
    const layer = Number.parseInt(str(row, 'layer'), 10);
    const oneway = str(row, 'oneway');
    const attrs = {
      osmId: num(row, 'id'),
      cls,
      name: str(row, 'name'),
      ...roadWidth(str(row, 'width'), Number.isInteger(lanes) && lanes > 0 ? lanes : 0, cls),
      lanes: Number.isInteger(lanes) && lanes > 0 ? lanes : 0,
      oneway: oneway === 'yes' || oneway === '-1' || oneway === '1' ? 1 : 0,
      bridge: flag(str(row, 'bridge')),
      tunnel: flag(str(row, 'tunnel')),
      layer: Number.isInteger(layer) ? layer : 0,
    };
    for (const line of parseWkb(blob(row, 'wkb')).lines) {
      const part = snapPart(utmToWorldFlat(line), SITE_VECTOR_QUANT_M, false);
      if (part !== undefined) built.tile.roads.push({ ...attrs, parts: [part] } satisfies SiteRoad);
    }
  }
  log('sites: roads', t0);

  // Water and land use: Overture polygons clipped to each tile.
  t0 = performance.now();
  const clipped = async (file: string, where: string): Promise<Row[]> =>
    db.rows(`
      WITH p AS (SELECT id, subtype, class, name, ST_MakeValid(${toUtm('geometry')}) AS u FROM read_parquet(${sqlString(file)})
                 WHERE ST_GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON') AND ${where})
      SELECT DISTINCT ON (t.site, t.tx, t.ty, p.id) t.site, t.tx, t.ty, p.id, p.subtype, p.class, p.name, ST_AsWKB(ST_Intersection(p.u, t.g)) AS wkb
      FROM p JOIN tile t ON ST_Intersects(p.u, t.g) ORDER BY t.site, t.tx, t.ty, p.id`);
  for (const [file, where, layer] of [
    [extracts.water, WATER_FILTER, 'water'],
    [extracts.landUse, 'true', 'landuse'],
  ] as const) {
    for (const row of await clipped(file, where)) {
      const built = tiles.get(tileKey(str(row, 'site'), num(row, 'tx'), num(row, 'ty'))) as BuiltSiteTile;
      const attrs = { subtype: str(row, 'subtype'), cls: str(row, 'class'), name: str(row, 'name') };
      for (const parts of polygonsOf(blob(row, 'wkb'))) {
        const feature: SiteWater & SiteLanduse = { ...attrs, parts };
        built.tile[layer].push(feature);
      }
    }
  }
  log('sites: water and land use', t0);

  const out = [...tiles.values()];
  for (const b of out) {
    b.tile.buildings = sortSpatially(b.tile.buildings, (f) => f.idHash);
    b.tile.buildingParts = sortSpatially(b.tile.buildingParts, (f) => f.idHash);
    b.tile.roads = sortSpatially(b.tile.roads, (f) => f.osmId);
    if (b.tile.buildings.length > MAX_TILE_BUILDINGS) {
      throw new Error(`sites: tile ${tileKey(b.siteId, b.tx, b.ty)} has ${b.tile.buildings.length} buildings, limit ${MAX_TILE_BUILDINGS}`);
    }
  }
  return out;
}
