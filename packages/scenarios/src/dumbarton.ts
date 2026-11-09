/**
 * Dumbarton to Meta: Redwood City Caltrain along the Dumbarton right-of-way to Meta at Willow Road,
 * optionally on across the Bay to Newark and Union City BART (doc 05 section 3.5).
 * Coordinates are the approximate, UNVERIFIED values of doc 05 sections 3.5 and 5.
 */
import type { GameCommand, ScenarioDef } from '@bayvox/sim';
import { at, cameraOver, EXISTING_BART, EXISTING_CALTRAIN, usd, xz } from './helpers.ts';

export const DUMBARTON_PROJECT_ID = 'dumbarton-meta';

const REDWOOD_CITY = xz(37.4854, -122.2319);
const WILLOW_ROAD = xz(37.48, -122.15);
const META = xz(37.485, -122.148);
const UNION_CITY = xz(37.5906, -122.0173);

/** The corridor SamTrans owns: surface track in the existing right-of-way as far as Meta. */
const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: DUMBARTON_PROJECT_ID,
    name: 'Dumbarton to Meta',
    waypoints: [
      at(37.4854, -122.2319, 4, 'softGround'), // Redwood City Caltrain
      at(37.484, -122.205, 4, 'softGround'), // Marsh Road and North Fair Oaks
      at(37.482, -122.178, 3, 'bayMud'), // Bayfront
      at(37.48, -122.15, 3, 'bayMud'), // Willow Road, Meta
    ],
    methods: ['atGrade', 'atGrade', 'atGrade'],
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
    name: 'Marsh Road',
    template: 'surface',
    at: xz(37.484, -122.205),
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
  title: 'Dumbarton to Meta',
  description:
    'SamTrans bought this right-of-way for $6.9 million in 1994. Estimates for a railway on it went from $50 million (1998) to $1.6 billion (2017); the current study is for a busway. Lay track to Meta, then decide whether to cross the Bay.',
  start: {
    date: '2026-11-09',
    budgetCents: usd(3e8),
    // The three mainline-terminal mandates are The Portal's; they do not apply to a surface line.
    policies: ['narrowRecord', 'twoTracks', 'shallowBoxes', 'rightSizeTerminal'],
    tech: [],
    politicalCapital: 50,
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
    {
      id: 'cross-the-bay',
      title: 'Stretch: cross the Bay to Union City BART',
      kind: 'connect',
      a: { name: 'Redwood City Caltrain', ...REDWOOD_CITY },
      b: { name: 'Union City BART', ...UNION_CITY },
      radiusM: 800,
      stretch: true,
    },
    { id: 'budget', title: 'Spend no more than the 2017 estimate for the whole corridor, $1.6B', kind: 'maxCost', cents: usd(1.6e9) },
    {
      id: 'early',
      title: 'Stretch: open before the busway would start construction (2031)',
      kind: 'openBy',
      date: '2031-12-31',
      stretch: true,
    },
  ],
  costProfile: 'bayAreaStatusQuo',
  reference: {
    title: 'Surface rail in the existing right-of-way',
    projectId: DUMBARTON_PROJECT_ID,
    commands: REFERENCE,
    source: 'doc 05 section 3.5 (corridor, station list, cost history)',
    note: 'The $1.6B of 2017 covers the whole 20.5 mi corridor with the bridge, not this 7 km; it is the budget objective, not a calibration target.',
  },
};
