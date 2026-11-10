/**
 * Oracle shuttle tunnel: a short fantasy link from Belmont Caltrain under US-101 to Oracle at Redwood
 * Shores (doc 05 section 5). The alignment is fictional. Doc 05 notes the headquarters has left; the campus remains.
 *
 * Coordinates are world metres (core frame) read off the baked data, verified 2026-11-10:
 *   Belmont Caltrain               31468.8, -36466.3   (37.52126, -122.27632, rail network station)
 *   Ralston Ave at US-101          32019.6, -37056.3
 *   Marine Pkwy and Oracle Pkwy    32326.8, -37277.3
 *   Oracle towers (six footprints) 32440 to 32734, -37428 to -37547; centre about 32590, -37490
 *   San Carlos Caltrain            32925.0, -34958.0   (37.50757, -122.25997)
 * All of it is inside the oracle voxel site. Ground is about +10 m at Belmont station and +2 m at the campus (site DEM).
 */
import type { GameCommand, ScenarioDef } from '@bayvox/sim';
import { cameraOver, EXISTING_CALTRAIN, usd, world, wp } from './helpers.ts';

export const ORACLE_PROJECT_ID = 'oracle-shuttle';

const BELMONT = world(31468.8, -36466.3);
const SAN_CARLOS = world(32925.0, -34958.0);
const ORACLE = world(32590, -37490);
const RALSTON_AT_101 = world(32019.6, -37056.3);
/** Station between Marine Parkway and the towers, 150 m from the middle of the campus. */
const ORACLE_STATION = world(32480, -37390);

const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: ORACLE_PROJECT_ID,
    name: 'Oracle shuttle tunnel',
    waypoints: [
      wp(BELMONT.x, BELMONT.z, -10, 'softGround'),
      wp(RALSTON_AT_101.x, RALSTON_AT_101.z, -16, 'bayMud'),
      wp(ORACLE_STATION.x, ORACLE_STATION.z, -16, 'bayMud'),
    ],
    methods: ['boredTwin', 'boredTwin'],
  },
  { t: 'addStation', projectId: ORACLE_PROJECT_ID, stationId: 'belmont', name: 'Belmont', template: 'undergroundStandard', at: BELMONT },
  {
    t: 'addStation',
    projectId: ORACLE_PROJECT_ID,
    stationId: 'oracle',
    name: 'Oracle',
    template: 'undergroundStandard',
    at: ORACLE_STATION,
  },
];

export const ORACLE_SHUTTLE: ScenarioDef = {
  id: 'oracle-shuttle',
  siteId: 'oracle',
  title: 'Oracle shuttle tunnel',
  description:
    'The towers at Redwood Shores are 1.4 km from Belmont station and on the wrong side of a freeway. A short tunnel, two stations, one small machine. The headquarters moved away; the question is whether the tunnel is still worth it.',
  briefing: {
    what: 'A fictional 1.4 km twin-bore tunnel from Belmont Caltrain under Ralston Avenue and US-101 to the Oracle towers at Redwood Shores.',
    officialCost: 'No official figure exists. The game prices the same line under 2026 rules and shows that as the status quo.',
    officialDate: 'No official date exists.',
    why: 'Oracle moved its headquarters to Austin in 2020 and announced Nashville in 2024. The campus is still there. Is a tunnel to it?',
    source: 'doc 05 section 5 (campus anchor, headquarters moves)',
  },
  start: {
    date: '2026-11-09',
    budgetCents: usd(2e8),
    // The three mainline-terminal mandates are The Portal's; they do not apply to a shuttle tunnel.
    policies: ['narrowRecord', 'twoTracks', 'shallowBoxes', 'rightSizeTerminal'],
    tech: [],
    politicalCapital: 40,
    funding: [{ id: 'employer', name: 'Employer contribution', amountCents: usd(5e8), release: 'permitting', source: 'game assumption' }],
  },
  camera: cameraOver(37.5245, -122.271, 1800),
  existing: [EXISTING_CALTRAIN],
  feeders: ['caltrain'],
  objectives: [
    {
      id: 'connect',
      title: 'Connect Belmont Caltrain to Oracle',
      kind: 'connect',
      a: { name: 'Belmont Caltrain', ...BELMONT },
      b: { name: 'Oracle, Redwood Shores', ...ORACLE },
      radiusM: 500,
    },
    {
      id: 'from-san-carlos',
      title: 'Stretch: reach Oracle from San Carlos too',
      kind: 'connect',
      a: { name: 'San Carlos Caltrain', ...SAN_CARLOS },
      b: { name: 'Oracle, Redwood Shores', ...ORACLE },
      radiusM: 500,
      stretch: true,
    },
    { id: 'near-poland', title: 'Stretch: pay no more than 2x what Poland would', kind: 'maxRatioToPoland', ratio: 2, stretch: true },
  ],
  costProfile: 'bayAreaStatusQuo',
  reference: {
    title: 'Twin bore under US-101',
    projectId: ORACLE_PROJECT_ID,
    commands: REFERENCE,
    launchPit: { name: 'Belmont Caltrain', ...BELMONT },
    destination: { name: 'Oracle station, Redwood Shores', ...ORACLE_STATION },
    source: 'fictional alignment between the anchors of doc 05 section 5, on streets of the baked OSM data',
    note: 'No official cost or date exists: the receipt and the scorecard compare against the model under 2026 rules.',
  },
};
