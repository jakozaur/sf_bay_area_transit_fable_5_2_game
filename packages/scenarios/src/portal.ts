/**
 * The Portal (Downtown Rail Extension): Caltrain from 4th and King to the Salesforce Transit Center.
 * Facts from docs/research/05-bay-area-transit-projects.md section 3.1 unless another doc is named.
 *
 * Coordinates: the two end points and the 4th and Townsend station are the approximate (UNVERIFIED)
 * values of doc 05 section 3.1. The vertices in between are laid out on the SoMa street grid (bearing
 * 45 degrees, blocks of about 250 m and 170 m) from those anchors, so they are UNVERIFIED too; the
 * resulting route is 2.09 km, the official 1.3 mi. Replace with a trace of the SEIS/SEIR figures.
 */
import type { GameCommand, ScenarioDef } from '@bayvox/sim';
import { at, cameraOver, EXISTING_BART, EXISTING_CALTRAIN, usd, xz } from './helpers.ts';

export const PORTAL_PROJECT_ID = 'portal';

const FOURTH_AND_KING = xz(37.7766, -122.3947);
const TRANSIT_CENTER = xz(37.7897, -122.3966);

/**
 * Real scope (doc 05 section 3.1, doc 02 section 6, doc 11 section 6.2): cut-and-cover under Townsend,
 * a three-track mined tunnel of about 0.65 mi under Townsend and 2nd, a cut-and-cover throat into the
 * existing trainbox, one new underground station and the fit-out of the trainbox.
 * Ground: fill over Bay Mud at both ends (doc 02 section 5), denser ground under Rincon Hill (UNVERIFIED).
 */
const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: PORTAL_PROJECT_ID,
    name: 'The Portal',
    waypoints: [
      at(37.77535, -122.39759, -14, 'bayMud'), // Caltrain yard throat on the Townsend side of 4th and King
      at(37.777, -122.3955, -16, 'bayMud'), // 4th and Townsend
      at(37.7786, -122.39347, -18, 'softGround'), // Townsend and 3rd
      at(37.7802, -122.39145, -20, 'softGround'), // Townsend and 2nd: the curve
      at(37.78127, -122.3928, -22, 'softGround'), // 2nd and Brannan
      at(37.78341, -122.3955, -22, 'softGround'), // 2nd and Harrison, under Rincon Hill
      at(37.78554, -122.3982, -20, 'bayMud'), // 2nd and Howard: the throat widens
      at(37.7897, -122.3966, -18, 'bayMud'), // Salesforce Transit Center trainbox
    ],
    methods: ['cutAndCover', 'cutAndCover', 'mined', 'mined', 'mined', 'mined', 'cutAndCover'],
  },
  {
    t: 'addStation',
    projectId: PORTAL_PROJECT_ID,
    stationId: 'fourth-townsend',
    name: '4th and Townsend',
    template: 'undergroundStandard',
    at: xz(37.777, -122.3955),
    depthM: 20,
  },
  {
    t: 'addStation',
    projectId: PORTAL_PROJECT_ID,
    stationId: 'transit-center',
    name: 'Salesforce Transit Center',
    template: 'terminalFitOut',
    at: TRANSIT_CENTER,
    depthM: 18,
  },
];

export const THE_PORTAL: ScenarioDef = {
  id: 'the-portal',
  title: 'The Portal',
  description:
    'The trainbox under the Salesforce Transit Center opened in 2018. Trains: 0. Caltrain stops 2.1 km short, at 4th and King. Connect them. The official plan costs $6.84 billion more and opens in 2036.',
  start: {
    date: '2026-11-09',
    // Committed local money: $7.57B less the built trainbox ($0.73B), the FTA share and the $2.2B still needed.
    budgetCents: usd(1.26e9),
    // Doc 07 section 5 design note: SB 131 (narrow record) is already law in 2026.
    policies: ['narrowRecord'],
    tech: [],
    politicalCapital: 40,
    funding: [
      {
        id: 'fta-cig',
        name: 'FTA Capital Investment Grant',
        amountCents: usd(3.38e9),
        release: 'permitting',
        source: 'doc 05 section 3.1 (CIG New Starts $3.38B, released at the FFGA)',
      },
      {
        id: 'state',
        name: 'State TIRCP and cap-and-invest',
        amountCents: usd(1.05e9),
        release: 'procurement',
        source: 'doc 05 section 3.1 (about $1.05B planned from the state)',
      },
      {
        id: 'local-gap',
        name: 'Local and land-based sources, to be identified',
        amountCents: usd(1.15e9),
        release: 'utilities',
        source: 'doc 05 section 3.1 (remaining need about $2.2B, less the state share)',
      },
    ],
    headStart: {
      phase: 'permitting',
      progress: 0.79,
      source:
        'doc 05 section 3.1: environmental clearance is done and the project has been in FTA Engineering since May 2024, 30 of the 38 months to the July 2027 FFGA target',
    },
  },
  camera: cameraOver(37.7832, -122.3955, 1400),
  existing: [EXISTING_CALTRAIN, EXISTING_BART],
  feeders: ['caltrain', 'bart'],
  objectives: [
    {
      id: 'connect',
      title: 'Run trains from 4th and King to the Salesforce Transit Center',
      kind: 'connect',
      a: { name: '4th and King', ...FOURTH_AND_KING },
      b: { name: 'Salesforce Transit Center', ...TRANSIT_CENTER },
      radiusM: 400,
    },
    { id: 'official-budget', title: 'Spend no more than the official $6.84B', kind: 'maxCost', cents: usd(6.84e9) },
    { id: 'official-date', title: 'Open by the official date, Q1 2036', kind: 'openBy', date: '2036-03-31' },
    { id: 'under-2b', title: 'Stretch: build it for under $2B', kind: 'maxCost', cents: usd(2e9), stretch: true },
    { id: 'early', title: 'Stretch: open before 2033', kind: 'openBy', date: '2032-12-31', stretch: true },
    { id: 'near-poland', title: 'Stretch: pay no more than 3x what Poland would', kind: 'maxRatioToPoland', ratio: 3, stretch: true },
  ],
  costProfile: 'bayAreaStatusQuo',
  reference: {
    title: 'The official plan',
    projectId: PORTAL_PROJECT_ID,
    commands: REFERENCE,
    officialCostCents: usd(6.84e9),
    officialOpenDate: '2036-03-31',
    source:
      'doc 05 section 3.1 and doc 06 section 3.1 (SFCTA memo, Jan 2026: $7.57B indicative, $6.84B excluding the built trainbox; open for use Q1 2036)',
    note: 'The game does not rebuild the trainbox, so the calibration target is $6.84B. Cross-sections are the ASSUMED ones of doc 11 section 6.2.',
  },
};
