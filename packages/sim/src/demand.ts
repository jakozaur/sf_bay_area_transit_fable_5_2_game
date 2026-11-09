/**
 * Demand v0: riders per day for a new line from a station-catchment gravity model (doc 09 section 3.1,
 * level 1, singly constrained at origins) over a coarse embedded zone table.
 *
 * APPROXIMATE DATA: the population and jobs below are round numbers typed from memory for the key
 * zones named in docs 05 and 09. They are UNVERIFIED and exist so the loop has a ridership number
 * before the LODES pipeline of doc 09 lands. Do not quote them.
 *
 * A new line earns riders two ways: trips between its own station catchments, and trips between its
 * catchments and the zones of an existing line it interchanges with (Caltrain, BART), excluding zones
 * that line already reaches. Only + - * / and sqrt are used.
 */
import { lonLatToWorld } from '@bayvox/core';
import { CONSTANTS as K } from './constants.ts';
import { planDistance, pointAt } from './geometry.ts';
import type { ProjectState } from './types.ts';

export interface Zone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  population: number;
  jobs: number;
  /** Rough radius of the zone in km. */
  radiusKm: number;
}

function z(id: string, name: string, lat: number, lon: number, population: number, jobs: number, radiusKm: number): Zone {
  return { id, name, lat, lon, population, jobs, radiusKm };
}

/** Approximate, UNVERIFIED. See the file header. */
export const ZONES: readonly Zone[] = [
  z('sf-fidi', 'SF Financial District and Transbay', 37.791, -122.399, 30_000, 300_000, 1.0),
  z('sf-soma', 'SoMa and Mission Bay', 37.776, -122.395, 60_000, 120_000, 1.2),
  z('sf-civic', 'Civic Center and Union Square', 37.783, -122.413, 80_000, 110_000, 1.2),
  z('sf-mission', 'Mission', 37.76, -122.415, 90_000, 40_000, 1.5),
  z('sf-north', 'North Beach, Marina, Pacific Heights', 37.799, -122.425, 120_000, 60_000, 1.8),
  z('sf-west', 'Richmond and Sunset', 37.765, -122.48, 300_000, 60_000, 3.5),
  z('sf-south', 'Bayview and Excelsior', 37.725, -122.41, 200_000, 50_000, 3.0),
  z('daly-city', 'Daly City and Colma', 37.6879, -122.4702, 150_000, 35_000, 3.0),
  z('ssf', 'South San Francisco', 37.6547, -122.4077, 90_000, 75_000, 3.0),
  z('sfo-millbrae', 'SFO, San Bruno, Millbrae, Burlingame', 37.6, -122.386, 120_000, 80_000, 3.5),
  z('san-mateo', 'San Mateo and Foster City', 37.563, -122.3255, 140_000, 85_000, 3.5),
  z('belmont', 'Belmont', 37.5202, -122.2758, 28_000, 9_000, 1.6),
  z('san-carlos', 'San Carlos', 37.5072, -122.2605, 30_000, 22_000, 1.6),
  z('redwood-shores', 'Redwood Shores (Oracle)', 37.531, -122.255, 14_000, 22_000, 1.5),
  z('redwood-city', 'Redwood City', 37.4852, -122.2364, 84_000, 60_000, 2.5),
  z('menlo-east', 'East Menlo Park and East Palo Alto (Meta)', 37.483, -122.15, 40_000, 35_000, 1.8),
  z('menlo-park', 'Menlo Park and Atherton', 37.453, -122.182, 35_000, 30_000, 2.0),
  z('palo-alto', 'Palo Alto and Stanford', 37.4419, -122.143, 85_000, 130_000, 3.5),
  z('mv-downtown', 'Mountain View', 37.394, -122.078, 55_000, 30_000, 2.0),
  z('mv-north-bayshore', 'North Bayshore (Googleplex, Bay View)', 37.421, -122.078, 2_000, 45_000, 1.8),
  z('sunnyvale', 'Sunnyvale', 37.378, -122.03, 155_000, 110_000, 3.5),
  z('santa-clara', 'Santa Clara', 37.36, -121.97, 130_000, 140_000, 3.5),
  z('cupertino', 'Cupertino', 37.323, -122.032, 60_000, 50_000, 3.0),
  z('sj-downtown', 'San Jose downtown and Diridon', 37.333, -121.89, 120_000, 90_000, 2.5),
  z('sj-north', 'North San Jose', 37.4, -121.93, 90_000, 130_000, 3.5),
  z('sj-rest', 'San Jose, rest', 37.29, -121.85, 750_000, 220_000, 8.0),
  z('milpitas', 'Milpitas', 37.432, -121.899, 80_000, 50_000, 3.0),
  z('fremont', 'Fremont', 37.548, -121.988, 230_000, 120_000, 6.0),
  z('newark', 'Newark', 37.53, -122.04, 47_000, 20_000, 2.5),
  z('union-city', 'Union City', 37.593, -122.044, 70_000, 25_000, 3.0),
  z('hayward', 'Hayward', 37.669, -122.081, 160_000, 70_000, 4.0),
  z('san-leandro', 'San Leandro', 37.725, -122.156, 90_000, 45_000, 3.0),
  z('oakland-downtown', 'Oakland downtown', 37.804, -122.271, 60_000, 90_000, 1.5),
  z('oakland-rest', 'Oakland, rest', 37.79, -122.21, 370_000, 110_000, 5.0),
  z('berkeley', 'Berkeley and Emeryville', 37.87, -122.27, 150_000, 100_000, 3.0),
  z('richmond', 'Richmond and West Contra Costa', 37.935, -122.348, 250_000, 70_000, 6.0),
  z('central-contra-costa', 'Walnut Creek and Concord', 37.93, -122.05, 500_000, 200_000, 9.0),
  z('tri-valley', 'Dublin, Pleasanton, Livermore', 37.69, -121.9, 370_000, 180_000, 8.0),
  z('marin', 'Marin', 37.97, -122.53, 260_000, 110_000, 9.0),
];

export interface Feeder {
  id: string;
  name: string;
  /** Zone ids the existing line already serves. */
  servedZones: string[];
  /** Existing stations a new line can interchange at. Approximate coordinates, UNVERIFIED. */
  connectAt: { name: string; lat: number; lon: number }[];
  /** Calibration reference from doc 09 section 5. Not used by the model. */
  weekdayRiders: number;
}

export const FEEDERS: readonly Feeder[] = [
  {
    id: 'caltrain',
    name: 'Caltrain',
    servedZones: [
      'sf-soma',
      'ssf',
      'sfo-millbrae',
      'san-mateo',
      'belmont',
      'san-carlos',
      'redwood-city',
      'menlo-park',
      'palo-alto',
      'mv-downtown',
      'sunnyvale',
      'santa-clara',
      'sj-downtown',
    ],
    connectAt: [
      { name: 'San Francisco 4th and King', lat: 37.7766, lon: -122.3947 },
      { name: 'Millbrae', lat: 37.5997, lon: -122.3868 },
      { name: 'Belmont', lat: 37.5206, lon: -122.2759 },
      { name: 'San Carlos', lat: 37.5075, lon: -122.2603 },
      { name: 'Redwood City', lat: 37.4854, lon: -122.2319 },
      { name: 'Menlo Park', lat: 37.4545, lon: -122.1823 },
      { name: 'Palo Alto', lat: 37.4434, lon: -122.1651 },
      { name: 'Mountain View', lat: 37.3945, lon: -122.076 },
      { name: 'Sunnyvale', lat: 37.3784, lon: -122.0308 },
      { name: 'San Jose Diridon', lat: 37.3299, lon: -121.9024 },
    ],
    weekdayRiders: 41_968,
  },
  {
    id: 'bart',
    name: 'BART',
    servedZones: [
      'sf-fidi',
      'sf-civic',
      'sf-mission',
      'daly-city',
      'sfo-millbrae',
      'oakland-downtown',
      'oakland-rest',
      'berkeley',
      'richmond',
      'central-contra-costa',
      'san-leandro',
      'hayward',
      'union-city',
      'fremont',
      'tri-valley',
      'milpitas',
      'sj-north',
    ],
    connectAt: [
      { name: 'Embarcadero', lat: 37.7929, lon: -122.3969 },
      { name: 'Montgomery', lat: 37.7894, lon: -122.4013 },
      { name: 'Millbrae', lat: 37.5997, lon: -122.3868 },
      { name: 'Union City', lat: 37.5906, lon: -122.0173 },
      { name: 'Fremont', lat: 37.5574, lon: -121.9764 },
    ],
    weekdayRiders: 204_800,
  },
];

const WORKERS = K.workersPerResident.value;
const CATCH_KM = K.catchmentKm.value;
const D0 = K.gravityHalfDistanceKm.value;
const MIN_TRIP_M = K.minTripKm.value * 1000;
const sqrt = Math.sqrt;

interface ZoneXZ {
  x: number;
  z: number;
}

const ZONE_XZ: ZoneXZ[] = ZONES.map((zn) => {
  const w = lonLatToWorld(zn.lon, zn.lat);
  return { x: Math.round(w.x), z: Math.round(w.z) };
});
const ZONE_INDEX = new Map<string, number>(ZONES.map((zn, i) => [zn.id, i]));

/** Deterrence function: 1 at zero distance, one half at D0. Rational, so no exp in state-affecting code. */
function deterrence(dKm: number): number {
  const r = dKm / D0;
  return 1 / (1 + r * r);
}

const N = ZONES.length;
/** F[i * N + j] = deterrence between zone centroids; a zone to itself uses half its radius. */
const F = new Float64Array(N * N);
/** DENOM[i] = sum over all zones of jobs * deterrence: the origin-constrained denominator. */
const DENOM = new Float64Array(N);
for (let i = 0; i < N; i++) {
  let sum = 0;
  for (let j = 0; j < N; j++) {
    const d = i === j ? ZONES[i].radiusKm / 2 : planDistance(ZONE_XZ[i].x, ZONE_XZ[i].z, ZONE_XZ[j].x, ZONE_XZ[j].z) / 1000;
    const f = deterrence(d);
    F[i * N + j] = f;
    sum += ZONES[j].jobs * f;
  }
  DENOM[i] = sum;
}

/** Share of a zone inside the walk catchment of a station at plan distance dKm from the zone centre. */
function catchmentShare(zone: Zone, dKm: number): number {
  const areaShare = Math.min(1, (CATCH_KM * CATCH_KM) / (zone.radiusKm * zone.radiusKm));
  const outside = Math.max(0, dKm - zone.radiusKm / 2);
  const r = outside / (CATCH_KM / 2);
  if (r > 2) return 0;
  return areaShare / (1 + r * r);
}

export interface FeederXZ {
  feeder: Feeder;
  connect: ZoneXZ[];
  served: boolean[];
}

const FEEDER_XZ: FeederXZ[] = FEEDERS.map((feeder) => {
  const served = new Array<boolean>(N).fill(false);
  for (const id of feeder.servedZones) {
    const i = ZONE_INDEX.get(id);
    if (i === undefined) throw new Error(`demand: feeder "${feeder.id}" names unknown zone "${id}"`);
    served[i] = true;
  }
  return {
    feeder,
    served,
    connect: feeder.connectAt.map((cpt) => {
      const w = lonLatToWorld(cpt.lon, cpt.lat);
      return { x: Math.round(w.x), z: Math.round(w.z) };
    }),
  };
});

export function feederById(id: string): Feeder | undefined {
  return FEEDERS.find((f) => f.id === id);
}

export interface RidershipBreakdown {
  ridersPerDay: number;
  internal: number;
  feeders: { id: string; riders: number }[];
  /** Zones in the line's catchment and the share of each captured. */
  catchment: { zoneId: string; share: number }[];
}

/** Trips from workers of zone i (scaled by wi) to jobs of zone j (scaled by wj). */
function trips(i: number, wi: number, j: number, wj: number): number {
  return (ZONES[i].population * WORKERS * wi * ZONES[j].jobs * wj * F[i * N + j]) / DENOM[i];
}

/** Riders per day for a project's stations, given the existing lines present in the scenario. */
export function ridership(project: Pick<ProjectState, 'waypoints' | 'cum' | 'stations'>, feederIds: readonly string[]): RidershipBreakdown {
  const share = new Float64Array(N);
  const stationXZ: ZoneXZ[] = [];
  for (const s of project.stations) {
    const p = pointAt(project.waypoints, project.cum, s.chainageM);
    stationXZ.push({ x: p.x, z: p.z });
    for (let i = 0; i < N; i++) {
      const d = planDistance(p.x, p.z, ZONE_XZ[i].x, ZONE_XZ[i].z) / 1000;
      share[i] = Math.min(1, share[i] + catchmentShare(ZONES[i], d));
    }
  }
  const catchment: { zoneId: string; share: number }[] = [];
  for (let i = 0; i < N; i++) if (share[i] > 0) catchment.push({ zoneId: ZONES[i].id, share: share[i] });

  const scale = 2 * K.attendance.value * K.nonWorkMultiplier.value;
  let internalTrips = 0;
  if (stationXZ.length >= 2) {
    for (let i = 0; i < N; i++) {
      if (share[i] === 0) continue;
      for (let j = 0; j < N; j++) {
        if (i === j || share[j] === 0) continue;
        // Nobody takes a train two stops across downtown: doc 09 section 1.1 counts ends more than 2 km apart.
        if (planDistance(ZONE_XZ[i].x, ZONE_XZ[i].z, ZONE_XZ[j].x, ZONE_XZ[j].z) < MIN_TRIP_M) continue;
        internalTrips += trips(i, share[i], j, share[j]);
      }
    }
  }
  const internal = internalTrips * scale * K.railShareDirect.value;

  const feeders: { id: string; riders: number }[] = [];
  const connectM = K.feederConnectM.value;
  for (const fx of FEEDER_XZ) {
    if (!feederIds.includes(fx.feeder.id)) continue;
    const connected = stationXZ.some((s) => fx.connect.some((cpt) => planDistance(s.x, s.z, cpt.x, cpt.z) <= connectM));
    if (!connected) continue;
    let t = 0;
    for (let j = 0; j < N; j++) {
      // Only what the existing line does not already reach counts as new.
      if (share[j] === 0 || fx.served[j]) continue;
      for (let k = 0; k < N; k++) {
        if (!fx.served[k] || k === j) continue;
        // The existing line reaches only the part of a big zone near its stations.
        const fk = Math.min(1, (CATCH_KM * CATCH_KM) / (ZONES[k].radiusKm * ZONES[k].radiusKm));
        t += trips(k, fk, j, share[j]) + trips(j, share[j], k, fk);
      }
    }
    feeders.push({ id: fx.feeder.id, riders: t * scale * K.railShareTransfer.value });
  }
  let total = internal;
  for (const f of feeders) total += f.riders;
  return {
    ridersPerDay: Math.round(total),
    internal: Math.round(internal),
    feeders: feeders.map((f) => ({ id: f.id, riders: Math.round(f.riders) })),
    catchment,
  };
}

/** Distance helper for tests and scenario validation. */
export function zoneDistanceKm(a: string, b: string): number {
  const i = ZONE_INDEX.get(a);
  const j = ZONE_INDEX.get(b);
  if (i === undefined || j === undefined) throw new Error(`demand: unknown zone "${i === undefined ? a : b}"`);
  return sqrt((ZONE_XZ[i].x - ZONE_XZ[j].x) ** 2 + (ZONE_XZ[i].z - ZONE_XZ[j].z) ** 2) / 1000;
}
