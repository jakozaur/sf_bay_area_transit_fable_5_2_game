/**
 * Googleplex spur: a fantasy branch between San Antonio Caltrain and the Googleplex (doc 05 section 5
 * anchors, doc 08 section 4.7 "a campus branch"). No agency has proposed it and there is no official cost.
 * The stretch objective to Bay View went in M3: a mission has its connections and the one target. The alignment is authored for the game and is fictional.
 *
 * M2 (owner, 2026-11-10): the spur starts at San Antonio station, not Mountain View station: a straight
 * 2.6 km drive in place of 4.3 km round a curve, and one station fewer.
 *
 * Coordinates are world metres (core frame) read off the baked data, verified 2026-11-10:
 *   San Antonio Caltrain          46529.3, -23963.3   (37.40741, -122.10724, rail network station)
 *   Mountain View Caltrain        49319.3, -22540.0   (the start until M2; no longer on the line)
 *   Shoreline and Charleston Rd   49110.8, -25438.0
 *   Googleplex, Building 43       48574.1, -25554.9   (37.42158, -122.08396, Overture footprint)
 *   Bay View (doc 05 anchor)      50341.2, -25508.0   (37.421, -122.064; the campus is not a named footprint)
 * The googleplex voxel site is x 47104 to 51200, z -28672 to -24576. It does NOT cover San Antonio station
 * (460 m west and 610 m south of its corner; the old start at Mountain View station was 2 km outside it too).
 * The line is drawn from the Googleplex end, where the site has ground for a launch pit, in a straight line
 * south-west under the office blocks and US-101 to the station: the first 1.5 km (to z -24576, x about 47434)
 * are on 1 m voxels, the last 1.1 km are network-level track. The diagonal follows no street (a bored tunnel
 * need not), and track elevations outside the site follow an ASSUMED ground of about +20 m at San Antonio
 * station (UNVERIFIED: the site DEM stops at the freeway).
 */
import type { GameCommand, ScenarioDef } from '@bayvox/sim';
import { cameraOver, EXISTING_CALTRAIN, POLAND_TARGET, usd, world, wp } from './helpers.ts';
import { HOUSING_NORTH_BAYSHORE, HOUSING_SAN_ANTONIO } from './housing.ts';

export const GOOGLEPLEX_PROJECT_ID = 'googleplex-spur';

const SAN_ANTONIO = world(46529.25, -23963.25);
const GOOGLEPLEX = world(48574.1, -25554.9);
/** Launch pit and terminus north of Charleston Road, 170 m from Building 43. */
const GOOGLEPLEX_STATION = world(48650, -25400);
/** Where the straight line leaves the googleplex voxel site, under US-101. */
const SITE_EDGE = world(47433.7, -24576);

const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: GOOGLEPLEX_PROJECT_ID,
    name: 'Googleplex spur',
    waypoints: [
      wp(GOOGLEPLEX_STATION.x, GOOGLEPLEX_STATION.z, -16, 'bayMud'),
      wp(SITE_EDGE.x, SITE_EDGE.z, -10, 'softGround'),
      wp(SAN_ANTONIO.x, SAN_ANTONIO.z, 0, 'softGround'),
    ],
    methods: ['boredTwin', 'boredTwin'],
  },
  {
    t: 'addStation',
    projectId: GOOGLEPLEX_PROJECT_ID,
    stationId: 'googleplex',
    name: 'Googleplex',
    template: 'undergroundStandard',
    at: GOOGLEPLEX_STATION,
  },
  {
    t: 'addStation',
    projectId: GOOGLEPLEX_PROJECT_ID,
    stationId: 'san-antonio',
    name: 'San Antonio',
    template: 'undergroundStandard',
    at: SAN_ANTONIO,
  },
];

export const GOOGLEPLEX_SPUR: ScenarioDef = {
  id: 'googleplex-spur',
  siteId: 'googleplex',
  title: 'Googleplex spur',
  description: 'A 2.6 km tunnel from San Antonio Caltrain to Google. Allow homes at the stations so it pays. Fictional.',
  briefing: {
    what: 'A fictional 2.6 km twin-bore branch: San Antonio Caltrain, north-east under US-101 to a station beside the Googleplex. Two stations, one straight drive. Nobody has proposed it.',
    // One line (M3): the model's status quo, since no sponsor figure exists (m3.test.ts).
    officialCost: "None. The game's estimate under today's rules: $5.92 billion, 11.7x Poland.",
    officialDate: 'No official date exists.',
    why: 'North Bayshore has about 45,000 jobs and no railway. San Antonio is the nearest Caltrain station to the campus, so the tunnel is short; the riders have to come from homes you allow around it.',
    source: "doc 05 section 5 (campus locations); a fictional project, and the jobs figure is the game's own estimate",
  },
  start: {
    date: '2026-11-09',
    budgetCents: usd(4e8),
    // The three mainline-terminal mandates are The Portal's; they do not apply to a metro-style spur.
    policies: ['twinBoreStandard'],
    tech: [],
    // M3: enough for four or five of the eleven reforms on offer before tender. The cost half of the 2x target is
    // reached by buying from the top of the sheet and missed in list order or cheapest first (m3.test.ts).
    politicalCapital: 160,
    funding: [
      {
        id: 'employer',
        name: 'Employer contribution',
        amountCents: usd(1e9),
        release: 'permitting',
        source: 'game assumption; doc 07 section 7 (private contributions as a funding card with a governance cost)',
      },
      { id: 'county', name: 'County sales-tax measure', amountCents: usd(1.5e9), release: 'procurement', source: 'game assumption' },
    ],
  },
  camera: cameraOver(37.414, -122.095, 3500),
  existing: [EXISTING_CALTRAIN],
  feeders: ['caltrain'],
  objectives: [
    {
      id: 'connect',
      title: 'Connect San Antonio Caltrain to the Googleplex',
      kind: 'connect',
      a: { name: 'San Antonio Caltrain', ...SAN_ANTONIO },
      b: { name: 'Googleplex', ...GOOGLEPLEX },
      radiusM: 650,
    },
    POLAND_TARGET,
  ],
  costProfile: 'bayAreaStatusQuo',
  housing: [HOUSING_NORTH_BAYSHORE, HOUSING_SAN_ANTONIO],
  reference: {
    title: 'A straight twin-bore spur from San Antonio station',
    projectId: GOOGLEPLEX_PROJECT_ID,
    commands: REFERENCE,
    launchPit: { name: 'Googleplex, north of Charleston Road', ...GOOGLEPLEX_STATION },
    destination: { name: 'San Antonio Caltrain', ...SAN_ANTONIO },
    source:
      'fictional alignment: a straight line between the San Antonio station of the baked rail network and the Googleplex anchor of doc 05 section 5',
    note: 'No official cost or date exists: the receipt and the scorecard compare against the model under 2026 rules.',
  },
};
