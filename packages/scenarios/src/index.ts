/** Scenario data (work package J). Every scenario validates against the sim and runs headlessly. */
import type { CampaignProgress, MissionCard } from '@bayvox/core';
import { autopilotCommands, type GameCommand, type GameSim, POLAND_PROFILE, type ScenarioDef, validateScenario } from '@bayvox/sim';
import { type CostBenefitRow, costBenefitOf } from './cost-benefit.ts';
import { DUMBARTON_TO_META } from './dumbarton.ts';
import { GOOGLEPLEX_SPUR } from './googleplex.ts';
import { THE_PORTAL } from './portal.ts';
import { SANDBOX } from './sandbox.ts';
import { SILICON_BRANCH } from './silicon.ts';

export const PACKAGE_NAME = '@bayvox/scenarios';

export {
  BENEFIT_DAYS_PER_YEAR,
  BENEFIT_PRESENT_VALUE_YEARS,
  BENEFIT_USD_PER_TRIP,
  type CostBenefitRow,
  costBenefitOf,
} from './cost-benefit.ts';
export { DUMBARTON_PROJECT_ID, DUMBARTON_TO_META } from './dumbarton.ts';
export { GOOGLEPLEX_PROJECT_ID, GOOGLEPLEX_SPUR } from './googleplex.ts';
export { at, cameraOver, curve, usd, world, wp, xz } from './helpers.ts';
export { HOUSING_META_BAYFRONT, HOUSING_NORTH_BAYSHORE, HOUSING_SALT_WORKS, HOUSING_SAN_ANTONIO } from './housing.ts';
export { type MissionOptions, type MissionRun, playMission } from './play.ts';
export { PORTAL_PROJECT_ID, THE_PORTAL } from './portal.ts';
export { SANDBOX } from './sandbox.ts';
export { SILICON_BRANCH, SILICON_PROJECT_ID } from './silicon.ts';

/** List order: The Portal first, then the campus branches, then free build (doc 08 section 4.7). Any may be played first. */
export const SCENARIOS: readonly ScenarioDef[] = [THE_PORTAL, GOOGLEPLEX_SPUR, DUMBARTON_TO_META, SILICON_BRANCH, SANDBOX];

/** Missions that shipped once and were removed, with the build that removed them: an old save or link names the reason. */
export const REMOVED_SCENARIOS: Readonly<Record<string, string>> = {
  'oracle-shuttle': 'the Oracle shuttle tunnel was removed in M2 (2026-11-10)',
};

/** The cost-benefit comparison of the shipped missions (cost-benefit.ts), for the mission picker. Computed on first call. */
export function costBenefit(): readonly CostBenefitRow[] {
  return costBenefitOf(SCENARIOS);
}

/** A fresh campaign profile: nothing opened yet. Every mission is unlocked from the start. */
export const EMPTY_CAMPAIGN: CampaignProgress = { schemaVersion: 1, missions: {} };

/**
 * The mission list of the title screen, in campaign order (round 2, docs/CONTRACTS.md). Since M2 no mission is
 * locked: `locked` is always false and `lockReason` null.
 * Throws naming the scenario if one has no briefing.
 */
export function missionCards(progress: CampaignProgress, scenarios: readonly ScenarioDef[] = SCENARIOS): MissionCard[] {
  if (!progress || typeof progress.missions !== 'object' || progress.missions === null)
    throw new Error('scenarios missionCards: progress.missions must be an object (use EMPTY_CAMPAIGN for a new profile)');
  return scenarios.map((s) => {
    if (!s.briefing) throw new Error(`scenarios missionCards: scenario "${s.id}" has no briefing`);
    const freeBuild = s.sandbox === true;
    const result = progress.missions[s.id];
    // M2 (owner): any mission can be picked at any time. Nothing is locked; the order is only the order of the list.
    const locked = false;
    return {
      id: s.id,
      title: s.title,
      pitch: s.description,
      siteId: s.siteId,
      freeBuild,
      locked,
      lockReason: null,
      completed: result !== undefined,
      bestStars: result === undefined ? null : result.stars,
      briefing: { ...s.briefing },
      objectives: s.objectives.map((o) => o.title),
    };
  });
}

/** Scenario by id. Throws naming the id and the known ones. */
export function scenarioById(id: string): ScenarioDef {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) {
    const known = SCENARIOS.map((x) => x.id).join(', ');
    const gone = Object.hasOwn(REMOVED_SCENARIOS, id) ? REMOVED_SCENARIOS[id] : null;
    if (gone) throw new Error(`scenarios: no scenario "${id}": ${gone}; a save of it cannot be loaded (known: ${known})`);
    throw new Error(`scenarios: no scenario "${id}" (known: ${known})`);
  }
  return s;
}

/** The same scenario with every Polish-practice reform enacted from day one: "Poland mode". */
export function withPolandProfile(s: ScenarioDef): ScenarioDef {
  return { ...s, costProfile: 'polishBaseline' };
}

/** The same scenario with extra reforms enacted at the start (prerequisites are not checked for start state). */
export function withStartReforms(s: ScenarioDef, ids: readonly string[]): ScenarioDef {
  const policies = [...s.start.policies];
  for (const id of ids) if (!policies.includes(id) && !s.start.tech.includes(id)) policies.push(id);
  return { ...s, start: { ...s.start, policies } };
}

/** All problems of all shipped scenarios. Empty means the data is sound. */
export function validateAll(): string[] {
  return SCENARIOS.flatMap((s) => validateScenario(s));
}

export interface PlayResult {
  opened: boolean;
  ticks: number;
}

/**
 * Plays a scenario's reference project headlessly: draws it, then passes every player gate as soon as
 * it comes up and lets event cards take their default option. Stops when the project opens or after
 * `maxTicks`. `extra` commands are dispatched before the first tick.
 */
export function playReference(sim: GameSim, scenario: ScenarioDef, maxTicks: number, extra: readonly GameCommand[] = []): PlayResult {
  const ref = scenario.reference;
  if (!ref) throw new Error(`scenarios: scenario "${scenario.id}" has no reference project to play`);
  sim.dispatch([...ref.commands, ...extra]);
  const start = sim.state.tick;
  let opened = false;
  sim.run(maxTicks, (s) => {
    const project = s.state.projects.find((p) => p.id === ref.projectId);
    if (project?.status === 'open') {
      opened = true;
      return false;
    }
    return autopilotCommands(s.state);
  });
  return { opened, ticks: sim.state.tick - start };
}

export { POLAND_PROFILE };
