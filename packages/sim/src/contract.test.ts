/** Round 2 contract guards (docs/CONTRACTS.md): shapes that must hold before and after the stubs are filled in. */
import type { Command, GameServices, Tool } from '@bayvox/core';
import { expect, test } from 'vitest';
import { SUBSTEPS_PER_DAY } from './constants.ts';
import { parseCommand } from './engine.ts';
import { createSim } from './sim.ts';
import { TEST_DESIGN, testScenario } from './test-scenario.ts';
import { type BayServices, type BayTool, type GameCommand, PENDING_COMMANDS, RECEIPT_COLUMNS, RECEIPT_GROUPS } from './types.ts';

// Compile-time: the closed instances are usable wherever core's generic defaults are expected.
export const servicesAreCore = (s: BayServices): GameServices => s;
export const toolsAreCore = (t: BayTool): Tool => t;
export const commandsAreCore = (c: GameCommand): Command => c;

test('a snapshot carries every round 2 view', () => {
  const sim = createSim(testScenario(), 1);
  sim.dispatch(TEST_DESIGN);
  const s = sim.snapshot();
  for (const key of ['clock', 'mission', 'nextAction', 'headline', 'services', 'feed', 'handDig']) expect(s).toHaveProperty(key);
  const project = s.projects[0];
  for (const key of ['nextAction', 'design', 'checks', 'alignment', 'tunnels', 'pits', 'receipt', 'scorecard']) {
    expect(project).toHaveProperty(key);
  }
  expect(Object.keys(project.receipt.columns).sort()).toEqual([...RECEIPT_COLUMNS].sort());
  expect(project.alignment.points).toHaveLength(project.waypoints.length);
  expect(project.alignment.segmentIssues).toHaveLength(project.waypoints.length - 1);
  expect(s.mission.planProjectId).not.toBe('');
});

test('the receipt has the four owner-decided factor groups, price level last', () => {
  expect(RECEIPT_GROUPS).toEqual(['designScope', 'institutional', 'delay', 'priceLevel']);
});

test('a day is a whole number of sub-steps and the round 2 commands are known to the parser', () => {
  expect(Number.isInteger(SUBSTEPS_PER_DAY) && SUBSTEPS_PER_DAY > 0).toBe(true);
  for (const t of PENDING_COMMANDS) expect(() => parseCommand({ t })).not.toThrow(/unknown command type/);
});
