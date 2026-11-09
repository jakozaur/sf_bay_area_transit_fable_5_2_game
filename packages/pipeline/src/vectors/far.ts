/** net/far: light region-wide layers for the far view: water, motorways and trunk roads with the Bay crossings, places. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  FAR_BRIDGES,
  FAR_VECTOR_QUANT_M,
  type FarHighway,
  type FarPlace,
  type FarVectors,
  type FarWater,
  GRID_HEIGHT_M,
  GRID_ORIGIN_EASTING,
  GRID_ORIGIN_NORTHING,
  GRID_WIDTH_M,
  isInGrid,
  lonLatToWorld,
  type RailStation,
} from '@bayvox/core';
import { blob, type Db, num, sqlString, str } from './db.ts';
import { lineLength, snapPart, sortSpatially, utmToWorldFlat } from './geom.ts';
import { toUtm } from './osm.ts';
import { WATER_FILTER } from './site-tiles.ts';
import { parseWkb } from './wkb.ts';

export const PLACES_JSON_PATH = path.join(import.meta.dirname, 'places.json');
/** Inland water smaller than this is left out of the far layer, m2. */
export const FAR_WATER_MIN_AREA_M2 = 100_000;
/** Simplification tolerances, metres. */
export const FAR_WATER_SIMPLIFY_M = 12;
export const FAR_HIGHWAY_SIMPLIFY_M = 6;
/** Every crossing must have at least this much bridge-tagged carriageway, summed over both directions. */
export const MIN_CROSSING_KM = 2;

type Crossing = (typeof FAR_BRIDGES)[number];
const CROSSING_PATTERNS: readonly [Crossing, RegExp][] = [
  ['Bay Bridge', /oakland bay bridge/],
  ['Golden Gate Bridge', /golden gate bridge/],
  ['San Mateo Bridge', /san mateo\s*-\s*hayward bridge/],
  ['Dumbarton Bridge', /dumbarton bridge/],
  ['Richmond-San Rafael Bridge', /richmond\s*-\s*san rafael bridge/],
];

/** Which Bay crossing an OSM bridge way belongs to, from its name and bridge:name tags; '' for none. */
export function crossingOf(name: string, bridgeName: string): Crossing | '' {
  const text = `${name};${bridgeName}`.toLowerCase().replaceAll('–', '-');
  return CROSSING_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? '';
}

interface CuratedPlace {
  name: string;
  kind: string;
  lat: number;
  lon: number;
  snapToStation?: string;
}

export function loadCuratedPlaces(): CuratedPlace[] {
  const doc = JSON.parse(readFileSync(PLACES_JSON_PATH, 'utf8')) as { places: CuratedPlace[] };
  return doc.places;
}

const gridEnvelope = `ST_MakeEnvelope(${GRID_ORIGIN_EASTING}, ${GRID_ORIGIN_NORTHING}, ${GRID_ORIGIN_EASTING + GRID_WIDTH_M}, ${GRID_ORIGIN_NORTHING + GRID_HEIGHT_M})`;

export interface FarStats {
  /** Bridge-tagged carriageway kilometres per crossing, both directions summed. */
  crossingKm: Record<string, number>;
}

export async function buildFar(db: Db, waterFile: string, stations: readonly RailStation[]): Promise<{ far: FarVectors; stats: FarStats }> {
  // Water: clip to the grid, drop small inland water, simplify.
  const waterRows = await db.rows(`
    WITH p AS (SELECT id, subtype, name, ST_MakeValid(${toUtm('geometry')}) AS u FROM read_parquet(${sqlString(waterFile)})
               WHERE ST_GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON') AND ${WATER_FILTER}),
    c AS (SELECT id, subtype, name, ST_Intersection(u, ${gridEnvelope}) AS g FROM p WHERE ST_Intersects(u, ${gridEnvelope}))
    SELECT DISTINCT ON (id) id, subtype, name, ST_AsWKB(ST_SimplifyPreserveTopology(g, ${FAR_WATER_SIMPLIFY_M})) AS wkb
    FROM c WHERE subtype = 'ocean' OR ST_Area(g) >= ${FAR_WATER_MIN_AREA_M2} ORDER BY id`);
  const water: FarWater[] = [];
  for (const row of waterRows) {
    for (const rings of parseWkb(blob(row, 'wkb')).polygons) {
      const parts: Float64Array[] = [];
      for (let r = 0; r < rings.length; r++) {
        const ring = snapPart(utmToWorldFlat(rings[r] as Float64Array), FAR_VECTOR_QUANT_M, true);
        if (ring !== undefined) parts.push(ring);
        else if (r === 0) break;
      }
      if (parts.length > 0) water.push({ subtype: str(row, 'subtype'), name: str(row, 'name'), parts });
    }
  }
  if (!water.some((w) => w.subtype === 'ocean')) throw new Error('far: no ocean polygon intersects the grid; the Bay would be missing');

  // Highways: motorway and trunk ways clipped to the grid.
  const roadRows = await db.rows(`
    WITH r AS (SELECT l.id, ${toUtm('l.g')} AS u FROM road_line l JOIN way w USING (id) WHERE w.tags['highway'] IN ('motorway', 'trunk'))
    SELECT r.id, w.tags['highway'] AS cls, w.tags['ref'] AS ref, w.tags['name'] AS name, w.tags['bridge'] AS bridge, w.tags['tunnel'] AS tunnel,
      w.tags['bridge:name'] AS bridge_name, ST_AsWKB(ST_SimplifyPreserveTopology(ST_Intersection(r.u, ${gridEnvelope}), ${FAR_HIGHWAY_SIMPLIFY_M})) AS wkb
    FROM r JOIN way w ON w.id = r.id WHERE ST_Intersects(r.u, ${gridEnvelope}) ORDER BY r.id`);
  const flag = (v: string): number => (v !== '' && v !== 'no' ? 1 : 0);
  const highways: FarHighway[] = [];
  const crossingKm: Record<string, number> = Object.fromEntries(FAR_BRIDGES.map((b) => [b, 0]));
  for (const row of roadRows) {
    const bridge = flag(str(row, 'bridge'));
    const crossing = bridge === 1 ? crossingOf(str(row, 'name'), str(row, 'bridge_name')) : '';
    for (const line of parseWkb(blob(row, 'wkb')).lines) {
      const part = snapPart(utmToWorldFlat(line), FAR_VECTOR_QUANT_M, false);
      if (part === undefined) continue;
      highways.push({
        osmId: num(row, 'id'),
        cls: str(row, 'cls'),
        ref: str(row, 'ref'),
        name: str(row, 'name'),
        bridge,
        tunnel: flag(str(row, 'tunnel')),
        crossing,
        parts: [part],
      });
      if (crossing !== '') crossingKm[crossing] = (crossingKm[crossing] as number) + lineLength(part) / 1000;
    }
  }
  for (const b of FAR_BRIDGES) {
    const km = crossingKm[b] as number;
    if (km < MIN_CROSSING_KM)
      throw new Error(
        `far: crossing "${b}" has ${km.toFixed(2)} km of bridge ways, expected at least ${MIN_CROSSING_KM}; check CROSSING_PATTERNS`,
      );
    crossingKm[b] = Math.round(km * 10) / 10;
  }

  // Places: OSM cities and towns, then the curated anchors.
  const places: FarPlace[] = [];
  const placeRows = await db.rows(`SELECT id, lon, lat, tags['place'] AS kind, tags['name'] AS name, tags['population'] AS population
    FROM tnode WHERE tags['place'] IN ('city', 'town') AND tags['name'] IS NOT NULL ORDER BY id`);
  for (const row of placeRows) {
    const p = lonLatToWorld(num(row, 'lon'), num(row, 'lat'));
    if (!isInGrid(p.x, p.z)) continue;
    const population = Number.parseInt(str(row, 'population').replaceAll(',', ''), 10);
    places.push({
      kind: str(row, 'kind'),
      name: str(row, 'name'),
      population: Number.isInteger(population) && population > 0 ? population : 0,
      parts: [Float64Array.of(p.x, p.z)],
    });
  }
  for (const c of loadCuratedPlaces()) {
    let p = lonLatToWorld(c.lon, c.lat);
    if (!isInGrid(p.x, p.z)) throw new Error(`far: curated place "${c.name}" lies outside the grid`);
    if (c.snapToStation !== undefined) {
      let best: Float64Array | undefined;
      let bestD = 500;
      for (const s of stations) {
        const q = s.parts[0] as Float64Array;
        const d = Math.hypot((q[0] as number) - p.x, (q[1] as number) - p.z);
        if (s.kind === 'station' && s.name.includes(c.snapToStation) && d < bestD) {
          bestD = d;
          best = q;
        }
      }
      if (best === undefined)
        throw new Error(`far: no OSM station named like "${c.snapToStation}" within 500 m of curated place "${c.name}"`);
      p = { x: best[0] as number, z: best[1] as number };
    }
    places.push({ kind: c.kind, name: c.name, population: 0, parts: [Float64Array.of(p.x, p.z)] });
  }
  return { far: { water, highways: sortSpatially(highways, (h) => h.osmId), places }, stats: { crossingKm } };
}
