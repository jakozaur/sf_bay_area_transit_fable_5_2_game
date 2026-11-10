/**
 * Silicon branch: one line that leaves Caltrain at Redwood City, runs the Dumbarton right-of-way to Meta at
 * Willow Road, then turns south-east along the bay front to the Googleplex in Mountain View. FICTIONAL: no
 * agency has proposed it and there is no official cost. It replaces two campus stubs with one branch that
 * serves both employers.
 *
 * Coordinates are world metres (core frame). West of Willow Road the line is the Dumbarton reference of
 * dumbarton.ts (verified against the baked OSM track there). The Googleplex station is the one of
 * googleplex.ts (verified there). Everything between Willow Road and the googleplex site is this file's
 * ASSUMPTION: four points placed by latitude and longitude from memory on the bay side of US-101, UNVERIFIED
 * against the baked data, joined by a viaduct because the ground there is marsh, creeks and freeway ramps.
 *   Willow Road at the tracks     42640.0, -31975.0   (dumbarton.ts)
 *   Googleplex station            49110.0, -25290.0   (googleplex.ts, under Shoreline Boulevard)
 * Only two stretches lie inside 1 m voxel sites: the last 1.7 km of the Dumbarton leg (meta site) and the
 * 2 km approach to the Googleplex (googleplex site, the site this mission loads). The last 1.1 km is a twin
 * bore under North Bayshore, so there is a machine to drive on the voxels; the rest is network-level track.
 */
import type { GameCommand, Method, ScenarioDef } from '@bayvox/sim';
import { cameraOver, EXISTING_CALTRAIN, usd, world, wp, xz } from './helpers.ts';
import { HOUSING_META_BAYFRONT, HOUSING_NORTH_BAYSHORE, HOUSING_SALT_WORKS } from './housing.ts';

export const SILICON_PROJECT_ID = 'silicon-branch';

const REDWOOD_CITY = world(35441.5, -32566.3);
const NORTH_FAIR_OAKS = world(39508.0, -31740.0);
const WILLOW_ROAD = world(42640.0, -31975.0);
const META = world(42844.1, -32538.0);
const GOOGLEPLEX = world(48574.1, -25554.9);
const GOOGLEPLEX_STATION = world(49110, -25290);
/** ASSUMED, UNVERIFIED (see the header): the bay front between Meta and North Bayshore. */
const EAST_PALO_ALTO = xz(37.468, -122.13);
const BAYLANDS = xz(37.452, -122.114);
const SAN_ANTONIO = xz(37.433, -122.1);
/** Where the viaduct comes down and the twin bore starts, inside the googleplex voxel site. */
const NORTH_BAYSHORE_PORTAL = world(47900, -25800);

const SURFACE = 8;
const VIADUCT = 3;
const BORED = 2;

const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: SILICON_PROJECT_ID,
    name: 'Silicon branch',
    waypoints: [
      // The Dumbarton right-of-way, as in dumbarton.ts.
      wp(REDWOOD_CITY.x, REDWOOD_CITY.z, 5, 'softGround'),
      wp(36565.0, -31726.0, 5, 'softGround'),
      wp(36829.0, -31633.0, 5, 'softGround'),
      wp(37387.0, -31545.0, 4, 'softGround'),
      wp(38584.0, -31652.0, 4, 'softGround'),
      wp(NORTH_FAIR_OAKS.x, NORTH_FAIR_OAKS.z, 4, 'bayMud'),
      wp(40646.0, -31849.0, 3, 'bayMud'),
      wp(41432.0, -31924.0, 3, 'bayMud'),
      wp(WILLOW_ROAD.x, WILLOW_ROAD.z, 3, 'bayMud'),
      // The bay front, on a viaduct.
      wp(EAST_PALO_ALTO.x, EAST_PALO_ALTO.z, 10, 'bayMud'),
      wp(BAYLANDS.x, BAYLANDS.z, 10, 'bayMud'),
      wp(SAN_ANTONIO.x, SAN_ANTONIO.z, 10, 'bayMud'),
      // Down into North Bayshore and under it.
      wp(NORTH_BAYSHORE_PORTAL.x, NORTH_BAYSHORE_PORTAL.z, -8, 'bayMud'),
      wp(48700, -25500, -16, 'bayMud'),
      wp(GOOGLEPLEX_STATION.x, GOOGLEPLEX_STATION.z, -16, 'bayMud'),
    ],
    methods: [
      ...new Array<Method>(SURFACE).fill('atGrade'),
      ...new Array<Method>(VIADUCT).fill('viaduct'),
      'cutAndCover',
      ...new Array<Method>(BORED).fill('boredTwin'),
    ],
  },
  {
    t: 'addStation',
    projectId: SILICON_PROJECT_ID,
    stationId: 'redwood-city',
    name: 'Redwood City',
    template: 'surface',
    at: REDWOOD_CITY,
  },
  // M2: the stop for the salt works, as on the Dumbarton mission.
  {
    t: 'addStation',
    projectId: SILICON_PROJECT_ID,
    stationId: 'marsh-road',
    name: 'North Fair Oaks (Marsh Road)',
    template: 'surface',
    at: NORTH_FAIR_OAKS,
  },
  {
    t: 'addStation',
    projectId: SILICON_PROJECT_ID,
    stationId: 'willow-road',
    name: 'Willow Road (Meta)',
    template: 'surface',
    at: WILLOW_ROAD,
  },
  {
    t: 'addStation',
    projectId: SILICON_PROJECT_ID,
    stationId: 'east-palo-alto',
    name: 'East Palo Alto',
    template: 'elevated',
    at: EAST_PALO_ALTO,
  },
  {
    t: 'addStation',
    projectId: SILICON_PROJECT_ID,
    stationId: 'googleplex',
    name: 'Googleplex',
    template: 'undergroundStandard',
    at: GOOGLEPLEX_STATION,
  },
];

export const SILICON_BRANCH: ScenarioDef = {
  id: 'siliconBranch',
  siteId: 'googleplex',
  title: 'Silicon branch',
  description: 'One 17 km branch off Caltrain for Meta and Google: track, a viaduct, a short tunnel. Fictional.',
  briefing: {
    what: 'A fictional 17 km branch: Redwood City Caltrain, the Dumbarton right-of-way to Willow Road (Meta), a viaduct on the bay side of US-101, and a twin bore to a station under Shoreline Boulevard (Google). Nobody has proposed it.',
    officialCost: "None. You race the game's estimate under today's rules.",
    officialDate: 'No official date exists.',
    why: 'Two large employers sit a few kilometres from Caltrain with no railway between them. Most of the line is cheap track on a public right-of-way. It starts from nothing, so permits are most of the calendar: here a specustawa earns its price.',
    source:
      'doc 05 section 3.5 (Dumbarton right-of-way) and section 5 (campus locations); the alignment between Willow Road and North Bayshore is fictional and unverified',
  },
  start: {
    date: '2026-11-09',
    budgetCents: usd(6e8),
    // The three mainline-terminal mandates are The Portal's; they do not apply to a branch line.
    policies: ['narrowRecord', 'twoTracks', 'twinBoreStandard', 'shallowBoxes', 'rightSizeTerminal'],
    tech: [],
    // Enough for the specustawa on day one, or for three ordinary reforms.
    politicalCapital: 60,
    funding: [
      { id: 'measure', name: 'Regional measure share', amountCents: usd(1.5e9), release: 'permitting', source: 'game assumption' },
      {
        id: 'employers',
        name: 'Contribution of the two employers',
        amountCents: usd(2e9),
        release: 'procurement',
        source: 'game assumption; doc 05 section 3.5 (Facebook floated $1B for Dumbarton in 2019)',
      },
    ],
  },
  camera: cameraOver(37.455, -122.15, 16000),
  existing: [EXISTING_CALTRAIN],
  feeders: ['caltrain'],
  objectives: [
    {
      id: 'connect',
      title: 'Connect Redwood City Caltrain to Meta',
      kind: 'connect',
      a: { name: 'Redwood City Caltrain', ...REDWOOD_CITY },
      b: { name: 'Meta, Menlo Park', ...META },
      radiusM: 800,
    },
    {
      id: 'connect-google',
      title: 'Run the same line on to the Googleplex',
      kind: 'connect',
      a: { name: 'Redwood City Caltrain', ...REDWOOD_CITY },
      b: { name: 'Googleplex', ...GOOGLEPLEX },
      radiusM: 650,
    },
    { id: 'riders', title: 'Carry 5,000 riders a day', kind: 'minRiders', riders: 5_000 },
    { id: 'near-poland', title: 'The target: pay no more than 2x what Poland would', kind: 'maxRatioToPoland', ratio: 2, stretch: true },
  ],
  costProfile: 'bayAreaStatusQuo',
  housing: [HOUSING_SALT_WORKS, HOUSING_META_BAYFRONT, HOUSING_NORTH_BAYSHORE],
  reference: {
    title: 'Dumbarton tracks, bay-front viaduct, twin bore under North Bayshore',
    projectId: SILICON_PROJECT_ID,
    commands: REFERENCE,
    // The first heading is the track gang on the Dumbarton right-of-way; the machine starts at the North Bayshore portal.
    launchPit: { name: 'Redwood City Caltrain (track gang; the TBM starts at North Bayshore)', ...REDWOOD_CITY },
    destination: { name: 'Googleplex station', ...GOOGLEPLEX_STATION },
    source:
      'fictional alignment: the Dumbarton reference west of Willow Road, assumed points along the bay front, the Googleplex station of the spur mission',
    note: 'No official cost or date exists: the receipt and the scorecard compare against the model under 2026 rules. The bay-front points are unverified against the baked map.',
  },
};
