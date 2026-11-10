/** View-model helpers shared by the components: which project is the mission's, and what the "do it" button does. */
import { TOOL_KEYS, type ToolId } from '@bayvox/core';
import {
  type GameCommand,
  type GameSnapshot,
  type Geology,
  type NextAction,
  POLAND_TARGET_LIMIT,
  type PolandTarget,
  type ProjectView,
  type ReceiptLine,
  type SocialPost,
  type TbmView,
} from '@bayvox/sim';
import type { PanelId } from './contract.ts';
import type { UiStoreInternal } from './store.ts';

/** One row of the mission comparison (costBenefit() of packages/scenarios, M2 shared contract). */
export interface CostBenefitRow {
  scenarioId: string;
  name: string;
  lengthKm: number;
  polandCostCents: number;
  officialCostCents: number;
  dailyRiders: number;
  polandCostPerRiderUsd: number;
  benefitCostRatio: number;
}

export type { PolandTarget, SocialPost };
export { POLAND_TARGET_LIMIT };

/** The snapshot's backlash posts, oldest first. Read at the boundary: a snapshot from before M2 has none. */
export function socialPosts(s: GameSnapshot): readonly SocialPost[] {
  return s.socialPosts ?? [];
}

/** Identity of a post across snapshots. The tick is part of it: a restarted mission reuses ids. */
export function postKey(p: SocialPost): string {
  return `${p.id}:${p.tick}`;
}

/**
 * The 2x Poland target of a project: the sim's `scorecard.polandTarget` when the snapshot carries it, else the
 * same two ratios from the scorecard columns. Null while there is no Polish figure to divide by.
 */
export function polandTarget(p: ProjectView): PolandTarget | null {
  const sc = p.scorecard;
  if (sc.polandTarget !== undefined) return sc.polandTarget;
  const costRatio = safeRatio(sc.yours.costCents, sc.poland.costCents);
  const timeRatio = safeRatio(sc.yours.yearsToOpen, sc.poland.yearsToOpen);
  if (costRatio === null || timeRatio === null) return null;
  return { costRatio, timeRatio, limit: POLAND_TARGET_LIMIT, met: costRatio <= POLAND_TARGET_LIMIT && timeRatio <= POLAND_TARGET_LIMIT };
}

/** The project the mission is scored on, or the one being planned, or null before anything is drawn. */
export function missionProject(s: GameSnapshot): ProjectView | null {
  const id = s.mission.projectId ?? s.mission.planProjectId;
  return s.projects.find((p) => p.id === id) ?? s.projects[0] ?? null;
}

/** Runs a UI action. A service that throws (its contract: one line naming the offending input) becomes a red toast. */
export function act(store: UiStoreInternal, fn: () => unknown): void {
  const fail = (err: unknown): void => {
    const text = err instanceof Error ? err.message : String(err);
    console.error(`ui action failed: ${text}`);
    store.services.audio.cue('ui.error');
    store.notify(text, 'bad');
  };
  try {
    const r = fn();
    if (r instanceof Promise) r.catch(fail);
  } catch (err) {
    fail(err);
  }
}

export function command(store: UiStoreInternal, c: GameCommand): void {
  act(store, () => store.services.sim.command(c));
}

/** Picks up a tool, or puts the active one away with null. An unavailable tool says why instead of throwing. */
export function selectTool(store: UiStoreInternal, id: ToolId | null, headingId?: string): void {
  if (id !== null) {
    const reason = store.toolAvailability.value[id];
    if (reason !== null) {
      store.services.audio.cue('ui.error');
      store.notify(reason, 'bad');
      return;
    }
  }
  act(store, () => store.services.tools.activate(id, headingId === undefined ? undefined : { [TOOL_KEYS.driveHeadingId]: headingId }));
}

const GATE_FALLBACK: Readonly<Record<string, string>> = {
  approveProject: 'Approve the project',
  advancePhase: 'Go to tender',
  launchTBM: 'Launch the TBM',
  openLine: 'Open the line',
};
const FOCUS_TOOL: Readonly<Record<string, { tool: ToolId; label: string }>> = {
  plan: { tool: 'plan', label: 'Draw the alignment' },
  station: { tool: 'station', label: 'Place a station' },
  drive: { tool: 'drive', label: 'Drive the machine' },
};
const FOCUS_PANEL: Readonly<Record<string, { panel: PanelId; label: string }>> = {
  design: { panel: 'design', label: 'Choose the design' },
  project: { panel: 'project', label: 'Open the project' },
  reforms: { panel: 'reforms', label: 'Open reforms' },
  receipt: { panel: 'receipt', label: 'See the receipt' },
};

/** The one button that performs a NextAction, or null when there is nothing to press (waiting, an open event card). */
export interface ActionButton {
  label: string;
  disabledReason: string | null;
  run(): void;
}

export function actionButton(store: UiStoreInternal, a: NextAction): ActionButton | null {
  const snap = store.snapshot.value;
  if (a.command !== null) {
    const c = a.command;
    const project = snap.projects.find((p) => p.id === a.projectId);
    const gate = project?.phases.find((ph) => ph.gate !== null && ph.gate.command === c.t)?.gate;
    const label = gate?.label ?? GATE_FALLBACK[c.t] ?? 'Do it';
    return { label, disabledReason: null, run: () => command(store, c) };
  }
  if (a.focus === null || a.focus === 'event') return null;
  if (a.focus === 'speed') {
    if (store.speed.value === 0)
      return { label: 'Resume time', disabledReason: null, run: () => act(store, () => store.services.time.togglePause()) };
    // Machines at work and nothing to decide: the one useful button is the faster clock.
    if (store.speed.value === 1 && snap.clock.mode === 'build' && snap.clock.hold === null)
      return { label: 'Fast forward (10x)', disabledReason: null, run: () => act(store, () => store.services.time.setSpeed(10)) };
    return null;
  }
  const tool = FOCUS_TOOL[a.focus];
  if (tool !== undefined) {
    if (store.tool.value.id === tool.tool) return null;
    return { label: tool.label, disabledReason: store.toolAvailability.value[tool.tool], run: () => selectTool(store, tool.tool) };
  }
  const panel = FOCUS_PANEL[a.focus];
  if (panel === undefined) throw new Error(`ui: unknown NextAction focus "${a.focus}"`);
  if (store.panel.value === panel.panel) return null;
  return { label: panel.label, disabledReason: null, run: () => store.openPanel(panel.panel) };
}

/** The heading the drive tool possesses, or null. */
export function possessedTbm(store: UiStoreInternal): TbmView | null {
  const tool = store.tool.value;
  if (tool.id !== 'drive') return null;
  const id = tool.values[TOOL_KEYS.driveHeadingId];
  const all = store.snapshot.value.projects.flatMap((p) => p.tbms);
  return all.find((t) => t.id === id) ?? null;
}

/** Legend colours of the ground classes in the cut face (CSS). */
export const GEOLOGY_COLORS: Readonly<Record<Geology, string>> = {
  softGround: '#c9a66b',
  bayMud: '#6e7f86',
  mixedFace: '#a0785a',
  rock: '#9a9da3',
  faultZone: '#c2493c',
};

/** Receipt lines worth a row: anything with money in a column, and the price-level gap always (owner decision). */
export function visibleLines(lines: readonly ReceiptLine[]): ReceiptLine[] {
  return lines.filter((l) => l.id === 'priceLevel' || l.cents.yours !== 0 || l.cents.statusQuo !== 0 || l.cents.poland !== 0);
}

/** a / b as a model ratio, or null when the denominator is not a positive number yet (no project, placeholders). */
export function safeRatio(a: number, b: number): number | null {
  return b > 0 && Number.isFinite(a) ? a / b : null;
}
