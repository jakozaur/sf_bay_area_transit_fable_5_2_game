/** Free build over the whole Bay: no reference project, effectively unlimited money and political capital (doc 08 section 4.6). */
import { GAME_BOX } from '@bayvox/core';
import type { ScenarioDef } from '@bayvox/sim';
import { cameraOver, EXISTING_BART, EXISTING_CALTRAIN, usd } from './helpers.ts';

export const SANDBOX: ScenarioDef = {
  id: 'sandbox',
  siteId: 'portal',
  title: 'Free build',
  description:
    'The whole Bay, a trillion dollars and all the political capital you can spend. Status-quo rules apply until you change them.',
  briefing: {
    what: 'No project. The whole Bay Area, every reform on the table, and a trillion dollars.',
    officialCost: 'No official figure: nobody has planned what you are about to draw.',
    officialDate: 'No official date.',
    why: 'Draw the network the region keeps studying. The receipt still tells you what Poland would have paid.',
    source: 'doc 08 section 4.6 (free build)',
  },
  sandbox: true,
  start: {
    date: '2026-11-09',
    budgetCents: usd(1e12),
    policies: ['narrowRecord'],
    tech: [],
    politicalCapital: 1000,
    funding: [],
  },
  camera: cameraOver((GAME_BOX.south + GAME_BOX.north) / 2, (GAME_BOX.west + GAME_BOX.east) / 2, 60000),
  existing: [EXISTING_CALTRAIN, EXISTING_BART],
  feeders: ['caltrain', 'bart'],
  objectives: [{ id: 'riders', title: 'Carry 50,000 riders a day on new lines', kind: 'minRiders', riders: 50_000 }],
  costProfile: 'bayAreaStatusQuo',
};
