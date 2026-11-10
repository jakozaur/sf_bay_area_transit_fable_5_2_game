/**
 * Googleplex spur: a fantasy branch between Mountain View Caltrain, the Googleplex and Bay View
 * (doc 05 section 5 anchors, doc 08 section 4.7 "a campus branch"). No agency has proposed it and there
 * is no official cost. The alignment is authored for the game and is fictional.
 *
 * Coordinates are world metres (core frame) read off the baked data, verified 2026-11-10:
 *   Mountain View Caltrain        49319.3, -22540.0   (37.39434, -122.07588, rail network station)
 *   Shoreline Blvd at Pear Ave    49109.0, -24893.0   Shoreline runs due north here, x about 49110
 *   Shoreline and Charleston Rd   49110.8, -25438.0
 *   Shoreline and Amphitheatre    49106.8, -25761.3
 *   Googleplex, Building 43       48574.1, -25554.9   (37.42158, -122.08396, Overture footprint)
 *   Bay View (doc 05 anchor)      50341.2, -25508.0   (37.421, -122.064; the campus is not a named footprint)
 * The line is drawn from Bay View, where there is room for a launch pit and where the googleplex voxel site
 * has ground, west along the shoreline, round a 300 m curve into Shoreline Boulevard and south to Caltrain.
 * South of US-101 (z above -24576) the route leaves the googleplex site: the last 2.2 km have no 1 m voxels.
 * Track elevations south of US-101 follow an ASSUMED ground rising to about +28 m at the station (UNVERIFIED:
 * the site DEM stops at the freeway).
 */
import type { GameCommand, Method, ScenarioDef } from '@bayvox/sim';
import { cameraOver, curve, EXISTING_CALTRAIN, usd, world, wp } from './helpers.ts';

export const GOOGLEPLEX_PROJECT_ID = 'googleplex-spur';

const MOUNTAIN_VIEW = world(49319.3, -22540.0);
const GOOGLEPLEX = world(48574.1, -25554.9);
const BAY_VIEW = world(50341.2, -25508.0);
/** Launch pit and terminus on the Bay View side of Stevens Creek. */
const BAY_VIEW_STATION = world(50320, -25620);
/** Where the east-west run meets the line of Shoreline Boulevard: the corner the 300 m curve replaces. */
const SHORELINE_CORNER = world(49110, -25740);
/** Station under Shoreline Boulevard between Charleston Road and Pear Avenue, 600 m from Building 43. */
const GOOGLEPLEX_STATION = world(49110, -25290);
const SHORELINE_AT_101 = world(49110.5, -24663.7);
const SHORELINE_AT_MIDDLEFIELD = world(49075.5, -23720.3);

const SHORELINE_CURVE = curve(BAY_VIEW_STATION, SHORELINE_CORNER, GOOGLEPLEX_STATION, 300, 5, -16, -16, 'bayMud');

const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: GOOGLEPLEX_PROJECT_ID,
    name: 'Googleplex spur',
    waypoints: [
      wp(BAY_VIEW_STATION.x, BAY_VIEW_STATION.z, -16, 'bayMud'),
      ...SHORELINE_CURVE,
      wp(GOOGLEPLEX_STATION.x, GOOGLEPLEX_STATION.z, -16, 'bayMud'),
      wp(SHORELINE_AT_101.x, SHORELINE_AT_101.z, -12, 'softGround'),
      wp(SHORELINE_AT_MIDDLEFIELD.x, SHORELINE_AT_MIDDLEFIELD.z, -3, 'softGround'),
      wp(MOUNTAIN_VIEW.x, MOUNTAIN_VIEW.z, 8, 'softGround'),
    ],
    methods: new Array<Method>(SHORELINE_CURVE.length + 4).fill('boredTwin'),
  },
  {
    t: 'addStation',
    projectId: GOOGLEPLEX_PROJECT_ID,
    stationId: 'bay-view',
    name: 'Bay View',
    template: 'undergroundStandard',
    at: BAY_VIEW_STATION,
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
    stationId: 'mountain-view',
    name: 'Mountain View',
    template: 'undergroundStandard',
    at: MOUNTAIN_VIEW,
  },
];

export const GOOGLEPLEX_SPUR: ScenarioDef = {
  id: 'googleplex-spur',
  siteId: 'googleplex',
  title: 'Googleplex spur',
  description:
    'Mountain View Caltrain is about 3 km from the Googleplex and nothing on rails covers the gap. Draw the branch, launch the first long TBM drive, and find out what a campus station is worth. Fictional project; the employer money is a game assumption.',
  briefing: {
    what: 'A fictional 4.3 km twin-bore branch: Mountain View Caltrain, north under Shoreline Boulevard to the Googleplex, then east to Bay View. Nobody has proposed it.',
    officialCost: 'No official figure exists. The game prices the same line under 2026 rules and shows that as the status quo.',
    officialDate: 'No official date exists.',
    why: 'North Bayshore has about 45,000 jobs and no railway. This is the first drive long enough to care how fast the machine goes.',
    source: "doc 05 section 5 (campus locations); a fictional project, and the jobs figure is the game's own estimate",
  },
  start: {
    date: '2026-11-09',
    budgetCents: usd(4e8),
    // The three mainline-terminal mandates are The Portal's; they do not apply to a metro-style spur.
    policies: ['narrowRecord', 'twoTracks', 'twinBoreStandard', 'shallowBoxes', 'rightSizeTerminal'],
    tech: [],
    politicalCapital: 50,
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
  camera: cameraOver(37.409, -122.076, 4500),
  existing: [EXISTING_CALTRAIN],
  feeders: ['caltrain'],
  objectives: [
    {
      id: 'connect',
      title: 'Connect Mountain View Caltrain to the Googleplex',
      kind: 'connect',
      a: { name: 'Mountain View Caltrain', ...MOUNTAIN_VIEW },
      b: { name: 'Googleplex', ...GOOGLEPLEX },
      radiusM: 650,
    },
    {
      id: 'bay-view',
      title: 'Stretch: continue to Bay View',
      kind: 'connect',
      a: { name: 'Mountain View Caltrain', ...MOUNTAIN_VIEW },
      b: { name: 'Google Bay View', ...BAY_VIEW },
      radiusM: 500,
      stretch: true,
    },
    { id: 'riders', title: 'Carry 2,500 riders a day', kind: 'minRiders', riders: 2_500 },
    { id: 'near-poland', title: 'Stretch: pay no more than 2x what Poland would', kind: 'maxRatioToPoland', ratio: 2, stretch: true },
  ],
  costProfile: 'bayAreaStatusQuo',
  reference: {
    title: 'A twin-bore spur under Shoreline Boulevard',
    projectId: GOOGLEPLEX_PROJECT_ID,
    commands: REFERENCE,
    launchPit: { name: 'Bay View, east of Stevens Creek', ...BAY_VIEW_STATION },
    destination: { name: 'Mountain View Caltrain', ...MOUNTAIN_VIEW },
    source: 'fictional alignment between the campus anchors of doc 05 section 5, on streets of the baked OSM data',
    note: 'No official cost or date exists: the receipt and the scorecard compare against the model under 2026 rules.',
  },
};
