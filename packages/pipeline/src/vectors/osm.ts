/** OSM tables read from the NorCal PBF with ST_ReadOSM (SQL shape from research doc 01 section 3). */
import { type Db, sqlString } from './db.ts';
import { log } from './log.ts';
import type { LonLatBox } from './overture.ts';

export const RAIL_CLASSES = ['rail', 'subway', 'light_rail', 'tram'] as const;
export const STATION_KINDS = ['station', 'halt', 'tram_stop'] as const;
export const ROUTE_MODES = ['train', 'subway', 'light_rail', 'tram', 'monorail'] as const;
/** Road classes shipped in site tiles. Footways, cycleways, paths, steps and tracks are left out. */
export const ROAD_CLASSES = [
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'pedestrian',
] as const;

export function sqlList(values: readonly string[]): string {
  return `(${values.map(sqlString).join(', ')})`;
}

function inBox(b: LonLatBox, lon = 'lon', lat = 'lat'): string {
  return `(${lat} BETWEEN ${b.south} AND ${b.north} AND ${lon} BETWEEN ${b.west} AND ${b.east})`;
}

/**
 * Creates:
 *   way(id, tags, refs)            railway track/station ways and road ways, whole extract
 *   node(id, lat, lon)             every node inside `nodeBox`
 *   tnode(id, lat, lon, tags)      tagged nodes inside `nodeBox`: stations, stops, cities and towns
 *   rel(id, tags, refs, ref_roles, ref_types)  rail route and route_master relations
 *   rail_geom(id, lons, lats, nids, nrefs)     railway ways with at least two nodes inside `nodeBox`
 *   road_line(id, g, in_site)      road ways as lon/lat lines; in_site if a node lies in a site box
 */
export async function loadOsm(db: Db, pbf: string, nodeBox: LonLatBox, siteBoxes: readonly LonLatBox[]): Promise<void> {
  const src = `ST_ReadOSM(${sqlString(pbf)})`;
  let t0 = performance.now();
  await db.run(`CREATE TABLE way AS SELECT id, tags, refs FROM ${src} WHERE kind = 'way'
    AND (tags['railway'] IN ${sqlList([...RAIL_CLASSES, ...STATION_KINDS])} OR tags['highway'] IN ${sqlList(ROAD_CLASSES)})`);
  await db.run(`CREATE TABLE node AS SELECT id, lat, lon FROM ${src} WHERE kind = 'node' AND ${inBox(nodeBox)}`);
  await db.run(`CREATE TABLE tnode AS SELECT id, lat, lon, tags FROM ${src} WHERE kind = 'node' AND ${inBox(nodeBox)}
    AND (tags['railway'] IN ${sqlList([...STATION_KINDS, 'stop'])} OR tags['public_transport'] IN ('stop_position', 'station')
      OR tags['place'] IN ('city', 'town'))`);
  await db.run(`CREATE TABLE rel AS SELECT id, tags, refs, ref_roles, ref_types::VARCHAR[] AS ref_types FROM ${src} WHERE kind = 'relation'
    AND tags['type'] IN ('route', 'route_master')
    AND (tags['route'] IN ${sqlList(ROUTE_MODES)} OR tags['route_master'] IN ${sqlList(ROUTE_MODES)})`);
  log('osm: read ways, nodes and relations from the PBF', t0);
  t0 = performance.now();
  await db.run(`CREATE TABLE rail_geom AS
    WITH u AS (SELECT id, len(refs) AS nrefs, unnest(refs) AS ref, generate_subscripts(refs, 1) AS i FROM way WHERE tags['railway'] IS NOT NULL)
    SELECT u.id, any_value(u.nrefs) AS nrefs, list(n.lon ORDER BY u.i) AS lons, list(n.lat ORDER BY u.i) AS lats, list(u.ref ORDER BY u.i) AS nids
    FROM u JOIN node n ON n.id = u.ref GROUP BY u.id HAVING count(*) >= 2`);
  const anySite = siteBoxes.map((b) => inBox(b, 'n.lon', 'n.lat')).join(' OR ');
  await db.run(`CREATE TABLE road_line AS
    WITH u AS (SELECT id, unnest(refs) AS ref, generate_subscripts(refs, 1) AS i FROM way WHERE tags['highway'] IS NOT NULL)
    SELECT u.id, ST_MakeLine(list(ST_Point(n.lon, n.lat) ORDER BY u.i)) AS g, bool_or(${anySite}) AS in_site
    FROM u JOIN node n ON n.id = u.ref GROUP BY u.id HAVING count(*) >= 2`);
  log('osm: assembled way geometry', t0);
}

/** SQL expression: lon/lat geometry to UTM 10N metres (easting, northing). */
export function toUtm(geom: string): string {
  return `ST_Transform(${geom}, 'EPSG:4326', 'EPSG:32610', always_xy := true)`;
}
