/** Small synthetic scenario for the sim's own tests. Real scenarios live in packages/scenarios, which depends on this package. */
import type { GameCommand, ScenarioDef, Waypoint } from './types.ts';

export const TEST_PROJECT = 'line';

const A = { x: 20_000, z: -65_000 };
const B = { x: 20_900, z: -65_400 };

/** 1.3 km: 500 m east, a bend, then north-east. One vertex sits mid-way through the twin-bore run. */
export const TEST_WAYPOINTS: Waypoint[] = [
  { x: A.x, y: -20, z: A.z, geology: 'softGround' },
  { x: A.x + 250, y: -22, z: A.z, geology: 'bayMud' },
  { x: A.x + 500, y: -22, z: A.z, geology: 'softGround' },
  { x: A.x + 700, y: -24, z: A.z - 200, geology: 'softGround' },
  { x: B.x, y: -20, z: B.z, geology: 'bayMud' },
];

export const TEST_DESIGN: GameCommand[] = [
  {
    t: 'setAlignment',
    projectId: TEST_PROJECT,
    name: 'Test line',
    waypoints: TEST_WAYPOINTS,
    methods: ['boredTwin', 'boredTwin', 'mined', 'cutAndCover'],
  },
  { t: 'addStation', projectId: TEST_PROJECT, stationId: 'a', name: 'A', template: 'undergroundStandard', chainageM: 0 },
  { t: 'addStation', projectId: TEST_PROJECT, stationId: 'b', name: 'B', template: 'undergroundStandard', at: B },
];

export function testScenario(over: Partial<ScenarioDef> = {}): ScenarioDef {
  return {
    id: 'test',
    siteId: 'portal',
    title: 'Test',
    description: 'Synthetic scenario for unit tests.',
    start: {
      date: '2026-01-01',
      budgetCents: 500_000_000_00,
      policies: [],
      tech: [],
      politicalCapital: 100,
      funding: [{ id: 'grant', name: 'Grant', amountCents: 1_000_000_000_00, release: 'permitting', source: 'test' }],
    },
    camera: { position: { x: A.x, y: 500, z: A.z + 500 }, target: { x: A.x, y: 0, z: A.z } },
    existing: [],
    feeders: [],
    objectives: [
      { id: 'connect', title: 'Connect A and B', kind: 'connect', a: { name: 'A', ...A }, b: { name: 'B', ...B }, radiusM: 100 },
      { id: 'budget', title: 'Stay under $20B', kind: 'maxCost', cents: 20_000_000_000_00 },
    ],
    costProfile: 'bayAreaStatusQuo',
    ...over,
  };
}
