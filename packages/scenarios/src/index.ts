/** Scenario data (work package J). Every scenario validates against the sim and runs headlessly. */
import { autopilotCommands, type GameCommand, type GameSim, POLAND_PROFILE, type ScenarioDef, validateScenario } from '@bayvox/sim';
import { DUMBARTON_TO_META } from './dumbarton.ts';
import { GOOGLEPLEX_SPUR } from './googleplex.ts';
import { ORACLE_SHUTTLE } from './oracle.ts';
import { THE_PORTAL } from './portal.ts';
import { SANDBOX } from './sandbox.ts';

export const PACKAGE_NAME = '@bayvox/scenarios';

export { DUMBARTON_PROJECT_ID, DUMBARTON_TO_META } from './dumbarton.ts';
export { GOOGLEPLEX_PROJECT_ID, GOOGLEPLEX_SPUR } from './googleplex.ts';
export { at, cameraOver, usd, xz } from './helpers.ts';
export { ORACLE_PROJECT_ID, ORACLE_SHUTTLE } from './oracle.ts';
export { PORTAL_PROJECT_ID, THE_PORTAL } from './portal.ts';
export { SANDBOX } from './sandbox.ts';

/** Campaign order: The Portal first, then the campus branches, then free build (doc 08 section 4.7). */
export const SCENARIOS: readonly ScenarioDef[] = [THE_PORTAL, GOOGLEPLEX_SPUR, DUMBARTON_TO_META, ORACLE_SHUTTLE, SANDBOX];

/** Scenario by id. Throws naming the id and the known ones. */
export function scenarioById(id: string): ScenarioDef {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`scenarios: no scenario "${id}" (known: ${SCENARIOS.map((x) => x.id).join(', ')})`);
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
