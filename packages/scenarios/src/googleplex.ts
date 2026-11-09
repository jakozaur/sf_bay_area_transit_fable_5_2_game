/**
 * Googleplex spur: a fantasy branch from Mountain View Caltrain to the Googleplex and Bay View
 * (doc 05 section 5 anchors, doc 08 section 4.7 "a campus branch"). No agency has proposed it and there
 * is no official cost. All coordinates are approximate and UNVERIFIED (doc 05 marks the distances so);
 * the alignment under Shoreline Boulevard is authored for the game and is fictional.
 */
import type { GameCommand, ScenarioDef } from '@bayvox/sim';
import { at, cameraOver, EXISTING_CALTRAIN, usd, xz } from './helpers.ts';

export const GOOGLEPLEX_PROJECT_ID = 'googleplex-spur';

const MOUNTAIN_VIEW = xz(37.3945, -122.076);
const GOOGLEPLEX = xz(37.422, -122.084);
const BAY_VIEW = xz(37.421, -122.064);

const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: GOOGLEPLEX_PROJECT_ID,
    name: 'Googleplex spur',
    waypoints: [
      at(37.3945, -122.076, -18, 'softGround'), // Mountain View Caltrain
      at(37.405, -122.0785, -20, 'softGround'), // Shoreline Boulevard near Middlefield
      at(37.4135, -122.078, -20, 'bayMud'), // Shoreline at US-101
      at(37.422, -122.084, -18, 'bayMud'), // Googleplex
      at(37.421, -122.064, -18, 'bayMud'), // Bay View
    ],
    methods: ['boredTwin', 'boredTwin', 'boredTwin', 'boredTwin'],
  },
  {
    t: 'addStation',
    projectId: GOOGLEPLEX_PROJECT_ID,
    stationId: 'mountain-view',
    name: 'Mountain View',
    template: 'undergroundStandard',
    at: MOUNTAIN_VIEW,
  },
  {
    t: 'addStation',
    projectId: GOOGLEPLEX_PROJECT_ID,
    stationId: 'googleplex',
    name: 'Googleplex',
    template: 'undergroundStandard',
    at: GOOGLEPLEX,
  },
  {
    t: 'addStation',
    projectId: GOOGLEPLEX_PROJECT_ID,
    stationId: 'bay-view',
    name: 'Bay View',
    template: 'undergroundStandard',
    at: BAY_VIEW,
  },
];

export const GOOGLEPLEX_SPUR: ScenarioDef = {
  id: 'googleplex-spur',
  title: 'Googleplex spur',
  description:
    'Mountain View Caltrain is about 3 km from the Googleplex and nothing on rails covers the gap. Draw the branch, launch the first long TBM drive, and find out what a campus station is worth. Fictional project; the employer money is a game assumption.',
  start: {
    date: '2026-11-09',
    budgetCents: usd(4e8),
    // The three mainline-terminal mandates are The Portal's; they do not apply to a metro-style spur.
    policies: ['narrowRecord', 'twoTracks', 'shallowBoxes', 'rightSizeTerminal'],
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
      radiusM: 500,
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
    source: 'fictional alignment between the campus anchors of doc 05 section 5',
    note: 'No official cost or date exists.',
  },
};
