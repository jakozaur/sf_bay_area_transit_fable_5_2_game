/**
 * Dumbarton to Meta: Redwood City Caltrain along the Dumbarton right-of-way to Meta at Willow Road
 * (doc 05 section 3.5). The stretch objective across the Bay to Union City BART went in M3.
 *
 * Coordinates are world metres (core frame) read off the baked data, verified 2026-11-10. The corridor is the
 * OSM track "Redwood Junction Industrial Lead" (the Dumbarton Cutoff as far as Chilco Street) and the short
 * "Dumbarton Branch" east of it:
 *   Redwood City Caltrain        35441.5, -32566.3   (37.48583, -122.23172)
 *   Redwood Junction             36565.0, -31726.0   where the lead leaves the Caltrain main line
 *   lead, east leg of the wye    36829.0, -31633.0 and 37387.0, -31545.0
 *   lead at 5th Avenue           38584.0, -31652.0
 *   lead near Marsh Road         39508.0, -31740.0   Marsh Road itself is placed from memory, UNVERIFIED
 *   lead at the site edge        40646.0, -31849.0
 *   Dumbarton Branch at Chilco   41432.0, -31924.0
 *   Willow Road at the tracks    42640.0, -31975.0   between Hamilton Avenue and Bayfront Expressway
 *   Meta, classic campus         42844.1, -32538.0   (37.485, -122.148, doc 05; MPK 10 to 18 footprints)
 *   Union City BART              54268.3, -44369.8   (rail network station)
 * Only the last 1.7 km (east of x 40960) lie inside the meta voxel site. The line is surface track: no tunnel,
 * no machine to drive.
 */
import type { GameCommand, ScenarioDef } from '@bayvox/sim';
import { cameraOver, EXISTING_BART, EXISTING_CALTRAIN, POLAND_TARGET, usd, world, wp } from './helpers.ts';
import { HOUSING_META_BAYFRONT, HOUSING_SALT_WORKS } from './housing.ts';

export const DUMBARTON_PROJECT_ID = 'dumbarton-meta';

const REDWOOD_CITY = world(35441.5, -32566.3);
const NORTH_FAIR_OAKS = world(39508.0, -31740.0);
const WILLOW_ROAD = world(42640.0, -31975.0);
const META = world(42844.1, -32538.0);

/** The corridor SamTrans owns: surface track in the existing right-of-way as far as Meta. */
const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: DUMBARTON_PROJECT_ID,
    name: 'Dumbarton to Meta',
    waypoints: [
      wp(REDWOOD_CITY.x, REDWOOD_CITY.z, 5, 'softGround'),
      wp(36565.0, -31726.0, 5, 'softGround'),
      wp(36829.0, -31633.0, 5, 'softGround'),
      wp(37387.0, -31545.0, 4, 'softGround'),
      wp(38584.0, -31652.0, 4, 'softGround'),
      wp(NORTH_FAIR_OAKS.x, NORTH_FAIR_OAKS.z, 4, 'bayMud'),
      wp(40646.0, -31849.0, 3, 'bayMud'),
      wp(41432.0, -31924.0, 3, 'bayMud'),
      wp(WILLOW_ROAD.x, WILLOW_ROAD.z, 3, 'bayMud'),
    ],
    methods: ['atGrade', 'atGrade', 'atGrade', 'atGrade', 'atGrade', 'atGrade', 'atGrade', 'atGrade'],
  },
  {
    t: 'addStation',
    projectId: DUMBARTON_PROJECT_ID,
    stationId: 'redwood-city',
    name: 'Redwood City',
    template: 'surface',
    at: REDWOOD_CITY,
  },
  {
    t: 'addStation',
    projectId: DUMBARTON_PROJECT_ID,
    stationId: 'marsh-road',
    name: 'North Fair Oaks (Marsh Road)',
    template: 'surface',
    at: NORTH_FAIR_OAKS,
  },
  {
    t: 'addStation',
    projectId: DUMBARTON_PROJECT_ID,
    stationId: 'willow-road',
    name: 'Willow Road (Meta)',
    template: 'surface',
    at: WILLOW_ROAD,
  },
];

export const DUMBARTON_TO_META: ScenarioDef = {
  id: 'dumbarton-to-meta',
  siteId: 'meta',
  title: 'Dumbarton to Meta',
  description: 'The tracks to Meta exist and carry no passengers. Estimates grew from $50M to $1.6B. Lay the rails.',
  briefing: {
    what: 'A railway already runs most of the way: the Dumbarton Cutoff from Redwood Junction to Willow Road, 7.5 km, freight only. SamTrans has owned it since 1994.',
    // One line (M3). Per km, because the figure is for a longer corridor than the mission builds (m3.test.ts).
    officialCost: '$1.6 billion for the whole 33 km corridor with a new bridge, 2.2x Poland per km (SamTrans, 2017).',
    officialDate: 'No date. The current study is for a busway, with construction after 2031.',
    why: 'Meta sits on the tracks, and the Redwood City salt works lie beside them. Surface rail on an existing right-of-way is the cheapest railway there is, and it still has not been built. Homes on the salt ponds would fill it.',
    source: 'doc 05 section 3.5 (SamTrans, Reimagine Dumbarton; cost history of the Dumbarton Rail Corridor, 1998 to 2017)',
  },
  start: {
    date: '2026-11-09',
    budgetCents: usd(3e8),
    // The three mainline-terminal mandates are The Portal's; they do not apply to a surface line.
    policies: ['twinBoreStandard'],
    tech: [],
    // M3: enough for four or five of the eleven reforms on offer before tender. The cost half of the 2x target is
    // reached by buying from the top of the sheet and missed in list order or cheapest first (m3.test.ts).
    politicalCapital: 160,
    funding: [
      { id: 'measure', name: 'Regional measure share', amountCents: usd(6e8), release: 'permitting', source: 'game assumption' },
      {
        id: 'employer',
        name: 'Employer contribution',
        amountCents: usd(1e9),
        release: 'procurement',
        source: 'doc 05 section 3.5 (Facebook floated $1B in 2019, wound down 2020 to 2021); game assumption that it returns',
      },
    ],
  },
  camera: cameraOver(37.49, -122.17, 9000),
  existing: [EXISTING_CALTRAIN, EXISTING_BART],
  feeders: ['caltrain', 'bart'],
  objectives: [
    {
      id: 'connect',
      title: 'Connect Redwood City Caltrain to Meta',
      kind: 'connect',
      a: { name: 'Redwood City Caltrain', ...REDWOOD_CITY },
      b: { name: 'Meta, Menlo Park', ...META },
      radiusM: 800,
    },
    POLAND_TARGET,
  ],
  costProfile: 'bayAreaStatusQuo',
  housing: [HOUSING_SALT_WORKS, HOUSING_META_BAYFRONT],
  reference: {
    title: 'Surface rail in the existing right-of-way',
    ghostLabel: 'Corridor study (SamTrans, 2017)',
    projectId: DUMBARTON_PROJECT_ID,
    commands: REFERENCE,
    officialCostCents: usd(1.6e9),
    // 20.5 mi, Union City to Redwood City, with the bridge: the ghost is compared per route-km, not in total.
    officialLengthKm: 33,
    launchPit: { name: 'Redwood Junction (track gang, no pit)', x: 36565, z: -31726 },
    destination: { name: 'Willow Road station', ...WILLOW_ROAD },
    source: 'doc 05 section 3.5 (corridor, station list, cost history: $1.6B phased, 2017, for 20.5 mi)',
    note: 'The $1.6B of 2017 covers the whole 20.5 mi corridor with the bridge, not this 7.5 km; it is compared per route-km and has no opening date.',
  },
};
