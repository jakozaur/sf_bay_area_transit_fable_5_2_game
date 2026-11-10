/**
 * The Portal (Downtown Rail Extension): Caltrain from 4th and King to the Salesforce Transit Center.
 * Facts from docs/research/05-bay-area-transit-projects.md section 3.1 unless another doc is named.
 *
 * Coordinates are world metres (core frame) read off the baked data in apps/game/public/data: street
 * intersections from the OSM road centrelines of the portal site tiles, the Caltrain terminal from the rail
 * network, the trainbox from the Overture footprint named "Salesforce Transit Center". Verified 2026-11-10.
 *   4th and Townsend      20791.8, -64773.5   (37.77707, -122.39507)
 *   Townsend and 3rd      20992.5, -64973.8
 *   Townsend and 2nd      21188.0, -65169.5   the corner the tunnel curves through
 *   2nd and Harrison      20777.3, -65576.8   under Rincon Hill, ground at +19 m
 *   2nd and Folsom        20637.8, -65714.8
 *   2nd at the trainbox   20433.8, -65917.8   midway between Natoma and Minna
 *   trainbox centre       20624.6, -66108.8   (37.78912, -122.39687), at 1st Street
 *   4th and King station  20804.0, -64695.0   (Caltrain terminal, OSM)
 * The route follows the SEIS/SEIR description (under Townsend, a curve into 2nd, a curve into the trainbox);
 * the curve radii (200 m and 160 m), the track elevations and the start of the tunnel 350 m west of 4th
 * Street are this file's ASSUMPTIONS, chosen so the route is the official 1.3 mi (2.09 km).
 */
import type { GameCommand, Method, ScenarioDef } from '@bayvox/sim';
import { cameraOver, curve, EXISTING_BART, EXISTING_CALTRAIN, usd, world, wp } from './helpers.ts';

export const PORTAL_PROJECT_ID = 'portal';

const FOURTH_AND_KING = world(20804.0, -64695.0);
const FOURTH_AND_TOWNSEND = world(20791.8, -64773.5);
const TOWNSEND_AND_THIRD = world(20992.5, -64973.8);
const TOWNSEND_AND_SECOND = world(21188.0, -65169.5);
const SECOND_AND_HARRISON = world(20777.3, -65576.8);
/** 60 m north-west of 2nd and Folsom: where the mined tunnel hands over to the cut-and-cover throat. */
const THROAT_START = world(20595.2, -65757.1);
const SECOND_AT_TRAINBOX = world(20433.8, -65917.8);
const TRANSIT_CENTER = world(20624.6, -66108.8);
/** Tunnel portal in the Caltrain yard throat, 350 m along Townsend west of 4th Street (between 5th and 6th). */
const YARD_THROAT = world(20544.2, -64526.1);

/**
 * Real scope (doc 05 section 3.1, doc 02 section 6, doc 11 section 6.2): cut-and-cover under Townsend,
 * a three-track mined tunnel of about 0.65 mi under Townsend and 2nd, a cut-and-cover throat into the
 * existing trainbox, one new underground station and the fit-out of the trainbox.
 * Ground: fill over Bay Mud at both ends (doc 02 section 5), denser ground under Rincon Hill (UNVERIFIED).
 */
const CURVE_CHORDS = 5;
const TOWNSEND_CURVE = curve(TOWNSEND_AND_THIRD, TOWNSEND_AND_SECOND, SECOND_AND_HARRISON, 200, CURVE_CHORDS, -17.5, -18, 'softGround');
const TRAINBOX_CURVE = curve(THROAT_START, SECOND_AT_TRAINBOX, TRANSIT_CENTER, 160, CURVE_CHORDS, -16.5, -15, 'bayMud');

const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: PORTAL_PROJECT_ID,
    name: 'The Portal',
    waypoints: [
      wp(YARD_THROAT.x, YARD_THROAT.z, -8, 'bayMud'),
      wp(FOURTH_AND_TOWNSEND.x, FOURTH_AND_TOWNSEND.z, -15, 'bayMud'),
      wp(TOWNSEND_AND_THIRD.x, TOWNSEND_AND_THIRD.z, -17, 'softGround'),
      ...TOWNSEND_CURVE,
      wp(SECOND_AND_HARRISON.x, SECOND_AND_HARRISON.z, -18, 'softGround'),
      wp(THROAT_START.x, THROAT_START.z, -17, 'bayMud'),
      ...TRAINBOX_CURVE,
      wp(TRANSIT_CENTER.x, TRANSIT_CENTER.z, -13, 'bayMud'),
    ],
    methods: [
      // Under Townsend: the U-wall and the 4th and Townsend station box.
      'cutAndCover',
      'cutAndCover',
      // Townsend and 3rd, round the curve, up 2nd Street to just past Folsom.
      ...new Array<Method>(CURVE_CHORDS + 2).fill('mined'),
      // The throat: round the curve into the trainbox.
      ...new Array<Method>(CURVE_CHORDS + 1).fill('cutAndCover'),
    ],
  },
  {
    t: 'addStation',
    projectId: PORTAL_PROJECT_ID,
    stationId: 'fourth-townsend',
    name: '4th and Townsend',
    template: 'undergroundStandard',
    at: FOURTH_AND_TOWNSEND,
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
  siteId: 'portal',
  title: 'The Portal',
  description:
    'The trainbox under the Salesforce Transit Center opened in 2018. Trains: 0. Caltrain stops 2.1 km short, at 4th and King. Connect them. The official plan: $6.84 billion, open in 2036.',
  briefing: {
    what: 'Caltrain ends at 4th and King. The Portal is 2.1 km of tunnel under Townsend and 2nd Street to the trainbox that has sat empty under the Salesforce Transit Center since 2018.',
    officialCost: '$6.84 billion for 2.1 km, not counting the trainbox already built: about $3.3 billion per km (TJPA, July 2025).',
    officialDate: 'Open for use in the first quarter of 2036, if the federal grant is signed in July 2027.',
    why: 'It is the most expensive railway per km on the continent, and it carries the Bay Area into its own downtown. Warsaw builds metro for about $140 million per km in 2026 money, stations included.',
    source: 'doc 05 section 3.1 (SFCTA memo, January 2026); doc 11 section 6.3 (Warsaw M2 extensions, 2015 to 2022, in 2026 money)',
  },
  start: {
    date: '2026-11-09',
    // Committed local money: $7.57B less the built trainbox ($0.73B), the FTA share and the $2.2B still needed.
    budgetCents: usd(1.26e9),
    // Doc 07 section 5 design note: SB 131 (narrow record) is already law in 2026.
    policies: ['narrowRecord'],
    tech: [],
    // Two or three reforms on day one; the rest is earned at milestones (engine.ts PC_*).
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
      // The remaining $1.15B of the official plan of finance is "local and land-based sources, to be identified"
      // (doc 05 section 3.1: about $2.2B still needed, less the state share). Money nobody has identified is not
      // funding: at status-quo prices the project runs out before it opens (PLAN 6.6) and the cash call comes up.
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
    ghostLabel: 'Official plan (TJPA, 2025)',
    projectId: PORTAL_PROJECT_ID,
    commands: REFERENCE,
    officialCostCents: usd(6.84e9),
    officialOpenDate: '2036-03-31',
    launchPit: { name: 'Caltrain yard throat at Townsend Street', ...YARD_THROAT },
    destination: { name: 'Salesforce Transit Center trainbox', ...TRANSIT_CENTER },
    source:
      'doc 05 section 3.1 and doc 06 section 3.1 (SFCTA memo, Jan 2026: $7.57B indicative, $6.84B excluding the built trainbox; open for use Q1 2036)',
    note: 'The game does not rebuild the trainbox, so the calibration target is $6.84B. Cross-sections are the ASSUMED ones of doc 11 section 6.2.',
  },
};
