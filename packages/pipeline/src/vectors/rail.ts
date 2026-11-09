/** net/rail: tracks, stations and route relations from OSM for the whole grid. */
import {
  isInGrid,
  lonLatToWorld,
  RAIL_ROUTE_QUANT_M,
  RAIL_TRACK_QUANT_M,
  type RailNetwork,
  type RailRoute,
  type RailRouteStop,
  type RailStation,
  type RailSystem,
  type RailTrack,
} from '@bayvox/core';
import { type Db, num, numList, type Row, str, strList } from './db.ts';
import { anyPointInGrid, lineLength, simplifyLine, snapPart, sortSpatially } from './geom.ts';
import { RAIL_CLASSES, STATION_KINDS, sqlList } from './osm.ts';

/** Tolerance of the Douglas-Peucker pass over route polylines, metres. */
export const ROUTE_SIMPLIFY_M = 1;
/** A route stop is linked to the nearest station within this distance, metres. */
export const STOP_STATION_RADIUS_M = 300;
/** Systems the build refuses to ship without (at least one route each). */
export const REQUIRED_SYSTEMS: readonly RailSystem[] = ['Caltrain', 'BART', 'Muni', 'VTA', 'ACE', 'Capitol Corridor'];

const SYSTEM_PATTERNS: readonly [RailSystem, RegExp][] = [
  ['Capitol Corridor', /capitol corridor/],
  ['Caltrain', /caltrain|peninsula corridor joint powers/],
  ['BART', /\bbart\b|bay area rapid transit/],
  ['Muni', /\bmuni\b|san francisco municipal/],
  ['VTA', /\bvta\b|santa clara valley transportation/],
  ['SMART', /\bsmart\b|sonoma.marin area rail/],
  ['ACE', /\bace\b|altamont corridor express|san joaquin regional rail/],
  ['Amtrak', /amtrak/],
];

/** Every system named in the text (OSM network, operator, ref and name values), in SYSTEM_PATTERNS order. */
export function railSystems(text: string): RailSystem[] {
  const lower = text.toLowerCase();
  return SYSTEM_PATTERNS.filter(([, re]) => re.test(lower)).map(([system]) => system);
}

/**
 * The single system of a route relation. Capitol Corridor is tagged network=Amtrak and is recognised
 * by ref or name; every other system is taken from network, then operator, and only then from ref and
 * name (a Muni route named "... => Caltrain" is still Muni).
 */
export function routeSystem(network: string, operator: string, ref: string, name: string): RailSystem {
  if (railSystems(`${ref};${name}`).includes('Capitol Corridor')) return 'Capitol Corridor';
  return railSystems(network)[0] ?? railSystems(operator)[0] ?? railSystems(`${ref};${name}`)[0] ?? 'other';
}

function firstInt(s: string): number {
  const m = /\d+/.exec(s);
  return m === null ? 0 : Number(m[0]);
}

/** OSM maxspeed to km/h: a bare number is km/h, "N mph" is miles per hour; anything else is 0. */
export function maxspeedKph(s: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(mph|km\/h|kph)?$/.exec(s.trim());
  if (m === null) return 0;
  return Math.round(Number(m[1]) * (m[2] === 'mph' ? 1.609344 : 1));
}

const flag = (v: string): number => (v !== '' && v !== 'no' ? 1 : 0);

export interface ChainWay {
  /** OSM node ids along the way. */
  nids: readonly number[];
  /** Flat x, z pairs, one per node id. */
  points: Float64Array;
}

/**
 * Chain a route's member ways, in relation order, into polylines. Each way is oriented to continue
 * from the previous one through a shared end node; when it does not connect, a new part starts.
 * A second pass joins consecutive parts that share an end node, which repairs runs of members listed
 * in reverse. A well-ordered route yields one part.
 */
export function chainWays(ways: readonly ChainWay[]): Float64Array[] {
  interface Part {
    pts: number[];
    first: number;
    last: number;
  }
  const reversed = (p: Part): Part => {
    const pts: number[] = [];
    for (let i = p.pts.length - 2; i >= 0; i -= 2) pts.push(p.pts[i] as number, p.pts[i + 1] as number);
    return { pts, first: p.last, last: p.first };
  };
  const joined = (a: Part, b: Part): Part => ({ pts: a.pts.concat(b.pts.slice(2)), first: a.first, last: b.last });
  /** Join b onto a through a shared end node; a may be flipped only while it is still free to turn. */
  const connect = (a: Part, b: Part, aFree: boolean): Part | undefined => {
    if (a.last === b.first) return joined(a, b);
    if (a.last === b.last) return joined(a, reversed(b));
    if (aFree && a.first === b.first) return joined(reversed(a), b);
    if (aFree && a.first === b.last) return joined(reversed(a), reversed(b));
    return undefined;
  };
  const chain = (items: readonly Part[]): Part[] => {
    const out: Part[] = [];
    let cur: Part | undefined;
    let free = true;
    for (const item of items) {
      const next: Part | undefined = cur === undefined ? undefined : connect(cur, item, free);
      if (next !== undefined) {
        cur = next;
        free = false;
        continue;
      }
      if (cur !== undefined) out.push(cur);
      cur = item;
      free = true;
    }
    if (cur !== undefined) out.push(cur);
    return out;
  };
  const single = ways.map(
    (w): Part => ({ pts: Array.from(w.points), first: w.nids[0] as number, last: w.nids[w.nids.length - 1] as number }),
  );
  return chain(chain(single)).map((p) => Float64Array.from(p.pts));
}

interface TrackRec {
  feature: RailTrack;
  nids: number[];
  points: Float64Array;
  systems: Set<RailSystem>;
}

export interface RailStats {
  trackKm: number;
  trackKmByClass: Record<string, number>;
  /** Tracks whose way had nodes outside the node bbox (shape cut short beyond the grid margin). */
  truncatedTracks: number;
  routesBySystem: Record<string, number>;
  /** Routes that chained into a single polyline. */
  singlePartRoutes: number;
  stationsBySystem: Record<string, number>;
}

function project(lons: number[], lats: number[]): Float64Array {
  const out = new Float64Array(lons.length * 2);
  for (let i = 0; i < lons.length; i++) {
    const p = lonLatToWorld(lons[i] as number, lats[i] as number);
    out[i * 2] = p.x;
    out[i * 2 + 1] = p.z;
  }
  return out;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

function tally(into: Record<string, number>, key: string, by = 1): void {
  into[key] = (into[key] ?? 0) + by;
}

function sortedRecord(r: Record<string, number>, digits: boolean): Record<string, number> {
  return Object.fromEntries(
    Object.keys(r)
      .sort()
      .map((k) => [k, digits ? round1(r[k] as number) : (r[k] as number)]),
  );
}

async function readTracks(db: Db): Promise<{ tracks: Map<number, TrackRec>; truncated: number }> {
  const rows = await db.rows(`SELECT w.id, g.nrefs, g.lons, g.lats, g.nids,
      w.tags['railway'] AS cls, w.tags['name'] AS name, w.tags['operator'] AS operator, w.tags['service'] AS service,
      w.tags['usage'] AS usage, w.tags['tunnel'] AS tunnel, w.tags['bridge'] AS bridge, w.tags['layer'] AS layer,
      w.tags['electrified'] AS electrified, w.tags['voltage'] AS voltage, w.tags['gauge'] AS gauge, w.tags['maxspeed'] AS maxspeed
    FROM way w JOIN rail_geom g USING (id) WHERE w.tags['railway'] IN ${sqlList(RAIL_CLASSES)} ORDER BY w.id`);
  const tracks = new Map<number, TrackRec>();
  let truncated = 0;
  for (const row of rows) {
    const nids = numList(row, 'nids');
    const points = project(numList(row, 'lons'), numList(row, 'lats'));
    if (!anyPointInGrid(points)) continue;
    const snapped = snapPart(points, RAIL_TRACK_QUANT_M, false);
    if (snapped === undefined) continue;
    if (nids.length !== num(row, 'nrefs')) truncated++;
    const layer = Number.parseInt(str(row, 'layer'), 10);
    const feature: RailTrack = {
      osmId: num(row, 'id'),
      cls: str(row, 'cls'),
      name: str(row, 'name'),
      operator: str(row, 'operator'),
      systems: '',
      service: str(row, 'service'),
      usage: str(row, 'usage'),
      tunnel: flag(str(row, 'tunnel')),
      bridge: flag(str(row, 'bridge')),
      layer: Number.isInteger(layer) ? layer : 0,
      electrified: str(row, 'electrified'),
      voltage: firstInt(str(row, 'voltage')),
      gaugeMm: firstInt(str(row, 'gauge')),
      maxspeedKph: maxspeedKph(str(row, 'maxspeed')),
      parts: [snapped],
    };
    tracks.set(feature.osmId, { feature, nids, points, systems: new Set() });
  }
  return { tracks, truncated };
}

async function readStations(db: Db): Promise<RailStation[]> {
  const kinds = sqlList(STATION_KINDS);
  const rows = await db.rows(`
    SELECT id, 'node' AS osm_type, lon, lat, tags['railway'] AS kind, tags['name'] AS name, tags['network'] AS network, tags['operator'] AS operator
      FROM tnode WHERE tags['railway'] IN ${kinds}
    UNION ALL
    SELECT w.id, 'way', (list_min(g.lons) + list_max(g.lons)) / 2, (list_min(g.lats) + list_max(g.lats)) / 2,
        w.tags['railway'], w.tags['name'], w.tags['network'], w.tags['operator']
      FROM way w JOIN rail_geom g USING (id) WHERE w.tags['railway'] IN ${kinds}
    ORDER BY 2, 1`);
  const stations: RailStation[] = [];
  for (const row of rows) {
    const p = lonLatToWorld(num(row, 'lon'), num(row, 'lat'));
    if (!isInGrid(p.x, p.z)) continue;
    const network = str(row, 'network');
    const operator = str(row, 'operator');
    stations.push({
      osmId: num(row, 'id'),
      osmType: str(row, 'osm_type'),
      kind: str(row, 'kind'),
      name: str(row, 'name'),
      network,
      operator,
      systems: railSystems(`${network};${operator}`).sort().join(';'),
      parts: [Float64Array.of(p.x, p.z)],
    });
  }
  return sortSpatially(stations, (s) => s.osmId);
}

function nearestStation(stations: readonly RailStation[], x: number, z: number, system: RailSystem): number {
  let best = -1;
  let bestD = STOP_STATION_RADIUS_M;
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i] as RailStation;
    const p = s.parts[0] as Float64Array;
    // A station of the route's own system wins over a nearer station of another one.
    const d = Math.hypot((p[0] as number) - x, (p[1] as number) - z) * (s.systems.split(';').includes(system) ? 0.25 : 1);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export async function buildRail(db: Db): Promise<{ network: RailNetwork; stats: RailStats }> {
  const { tracks, truncated } = await readTracks(db);
  const stations = await readStations(db);

  const relRows = await db.rows(`SELECT id, tags['type'] AS type, coalesce(tags['route'], tags['route_master']) AS mode,
      tags['network'] AS network, tags['operator'] AS operator, tags['ref'] AS ref, tags['name'] AS name, tags['from'] AS "from",
      tags['to'] AS "to", tags['colour'] AS colour, refs, ref_roles, ref_types FROM rel ORDER BY id`);
  const masterOf = new Map<number, number>();
  for (const row of relRows) {
    if (str(row, 'type') !== 'route_master') continue;
    const refs = numList(row, 'refs');
    const types = strList(row, 'ref_types');
    refs.forEach((ref, i) => {
      if (types[i] === 'relation' && !masterOf.has(ref)) masterOf.set(ref, num(row, 'id'));
    });
  }
  const stopRows = await db.rows(`
    WITH m AS (SELECT id AS rel, unnest(refs) AS ref, unnest(ref_roles) AS role, unnest(ref_types) AS t, generate_subscripts(refs, 1) AS i
               FROM rel WHERE tags['type'] = 'route')
    SELECT m.rel, n.lon, n.lat, t.tags['name'] AS name FROM m JOIN node n ON n.id = m.ref LEFT JOIN tnode t ON t.id = m.ref
    WHERE m.t = 'node' AND m.role LIKE 'stop%' ORDER BY m.rel, m.i`);
  const stopsOf = new Map<number, Row[]>();
  for (const row of stopRows) {
    const rel = num(row, 'rel');
    const list = stopsOf.get(rel);
    if (list === undefined) stopsOf.set(rel, [row]);
    else list.push(row);
  }

  interface RouteRec {
    route: RailRoute;
    stops: Omit<RailRouteStop, 'route'>[];
  }
  const recs: RouteRec[] = [];
  for (const row of relRows) {
    if (str(row, 'type') !== 'route') continue;
    const refs = numList(row, 'refs');
    const roles = strList(row, 'ref_roles');
    const types = strList(row, 'ref_types');
    const system = routeSystem(str(row, 'network'), str(row, 'operator'), str(row, 'ref'), str(row, 'name'));
    const used: TrackRec[] = [];
    let memberWays = 0;
    refs.forEach((ref, i) => {
      if (types[i] !== 'way' || (roles[i] as string).startsWith('platform') || roles[i] === 'stop') return;
      memberWays++;
      const t = tracks.get(ref);
      if (t !== undefined) used.push(t);
    });
    if (used.length === 0) continue;
    for (const t of used) t.systems.add(system);
    const parts: Float64Array[] = [];
    for (const chained of chainWays(used)) {
      const part = snapPart(simplifyLine(chained, ROUTE_SIMPLIFY_M), RAIL_ROUTE_QUANT_M, false);
      if (part !== undefined) parts.push(part);
    }
    if (parts.length === 0) continue;
    const id = num(row, 'id');
    const stops: Omit<RailRouteStop, 'route'>[] = [];
    for (const s of stopsOf.get(id) ?? []) {
      const p = lonLatToWorld(num(s, 'lon'), num(s, 'lat'));
      if (!isInGrid(p.x, p.z)) continue;
      const station = nearestStation(stations, p.x, p.z, system);
      const name = str(s, 'name') || (station >= 0 ? (stations[station] as RailStation).name : '');
      stops.push({ name, stationPlus1: station + 1, parts: [Float64Array.of(p.x, p.z)] });
    }
    recs.push({
      route: {
        osmId: id,
        system,
        mode: str(row, 'mode'),
        network: str(row, 'network'),
        operator: str(row, 'operator'),
        ref: str(row, 'ref'),
        name: str(row, 'name'),
        from: str(row, 'from'),
        to: str(row, 'to'),
        colour: str(row, 'colour'),
        masterId: masterOf.get(id) ?? 0,
        memberWays,
        usedWays: used.length,
        stopStart: 0,
        stopCount: stops.length,
        parts,
      },
      stops,
    });
  }
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  recs.sort(
    (a, b) =>
      cmp(a.route.system, b.route.system) ||
      cmp(a.route.ref, b.route.ref) ||
      cmp(a.route.name, b.route.name) ||
      a.route.osmId - b.route.osmId,
  );
  const routes: RailRoute[] = [];
  const routeStops: RailRouteStop[] = [];
  for (const rec of recs) {
    rec.route.stopStart = routeStops.length;
    for (const s of rec.stops) routeStops.push({ route: routes.length, ...s });
    routes.push(rec.route);
  }

  const trackList: RailTrack[] = [];
  const stats: RailStats = {
    trackKm: 0,
    trackKmByClass: {},
    truncatedTracks: truncated,
    routesBySystem: {},
    singlePartRoutes: 0,
    stationsBySystem: {},
  };
  for (const t of tracks.values()) {
    t.feature.systems = [...t.systems]
      .filter((s) => s !== 'other')
      .sort()
      .join(';');
    trackList.push(t.feature);
    const km = lineLength(t.feature.parts[0] as Float64Array) / 1000;
    stats.trackKm += km;
    tally(stats.trackKmByClass, t.feature.cls, km);
    if (t.feature.service === '') tally(stats.trackKmByClass, `${t.feature.cls}:running`, km);
  }
  for (const r of routes) {
    tally(stats.routesBySystem, r.system);
    if (r.parts.length === 1) stats.singlePartRoutes++;
  }
  for (const s of stations) for (const sys of s.systems === '' ? ['other'] : s.systems.split(';')) tally(stats.stationsBySystem, sys);
  stats.trackKm = round1(stats.trackKm);
  stats.trackKmByClass = sortedRecord(stats.trackKmByClass, true);
  stats.routesBySystem = sortedRecord(stats.routesBySystem, false);
  stats.stationsBySystem = sortedRecord(stats.stationsBySystem, false);

  for (const system of REQUIRED_SYSTEMS) {
    if ((stats.routesBySystem[system] ?? 0) === 0)
      throw new Error(`rail: no route relation found for ${system}; check the PBF and the patterns in rail.ts`);
  }
  if (trackList.length < 5000 || stations.length < 300) {
    throw new Error(`rail: implausibly small network: ${trackList.length} tracks, ${stations.length} stations`);
  }
  return { network: { tracks: sortSpatially(trackList, (t) => t.osmId), stations, routes, routeStops }, stats };
}
