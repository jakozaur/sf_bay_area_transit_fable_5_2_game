/**
 * Oracle shuttle tunnel: a short fantasy link from Belmont Caltrain under US-101 to Oracle at Redwood
 * Shores (doc 05 section 5). Coordinates are approximate and UNVERIFIED; the alignment is fictional.
 * Doc 05 notes the headquarters has left; the campus remains.
 */
import type { GameCommand, ScenarioDef } from '@bayvox/sim';
import { at, cameraOver, EXISTING_CALTRAIN, usd, xz } from './helpers.ts';

export const ORACLE_PROJECT_ID = 'oracle-shuttle';

const BELMONT = xz(37.5206, -122.2759);
const SAN_CARLOS = xz(37.5075, -122.2603);
const ORACLE = xz(37.529, -122.266);

const REFERENCE: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: ORACLE_PROJECT_ID,
    name: 'Oracle shuttle tunnel',
    waypoints: [
      at(37.5206, -122.2759, -16, 'softGround'), // Belmont Caltrain
      at(37.5245, -122.2715, -18, 'bayMud'), // under US-101
      at(37.529, -122.266, -16, 'bayMud'), // Oracle, Redwood Shores
    ],
    methods: ['boredTwin', 'boredTwin'],
  },
  { t: 'addStation', projectId: ORACLE_PROJECT_ID, stationId: 'belmont', name: 'Belmont', template: 'undergroundStandard', at: BELMONT },
  { t: 'addStation', projectId: ORACLE_PROJECT_ID, stationId: 'oracle', name: 'Oracle', template: 'undergroundStandard', at: ORACLE },
];

export const ORACLE_SHUTTLE: ScenarioDef = {
  id: 'oracle-shuttle',
  title: 'Oracle shuttle tunnel',
  description:
    'The towers at Redwood Shores are 1.3 km from Belmont station and on the wrong side of a freeway. A short tunnel, two stations, one small machine. The headquarters moved away; the question is whether the tunnel is still worth it.',
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
    source: 'fictional alignment between the anchors of doc 05 section 5',
    note: 'No official cost or date exists.',
  },
};
