/** View-model helpers shared by the components: which project is the mission's, and what the "do it" button does. */
import { TOOL_KEYS, type ToolId } from '@bayvox/core';
import {
  type DesignOptionView,
  type GameCommand,
  type GameSnapshot,
  type Geology,
  type HousingView,
  type MachineView,
  type NextAction,
  POLAND_TARGET_LIMIT,
  type PolandTarget,
  type ProjectView,
  type ReceiptLine,
  type ReformView,
  type SocialPost,
  type TbmView,
} from '@bayvox/sim';
import type { PanelId } from './contract.ts';
import { isBoring, nextDecisionBlocked, SPEED_REGULAR } from './pace.ts';
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
  /** The same row with every housing option of the mission enacted; absent for a mission without options. */
  withHousing?: { homes: number; dailyRiders: number; benefitCostRatio: number };
}

/** The mission's housing options. Read at the boundary: a snapshot from before the options has none. */
export function housingOptions(s: GameSnapshot): readonly HousingView[] {
  return s.housing ?? [];
}

/** Homes and riders the enacted housing added to a project's scorecard, or null when it added none. */
export function scorecardHousing(p: ProjectView): { homes: number; ridersPerDayAdded: number } | null {
  const h = p.scorecard.housing;
  return h !== undefined && h.homes > 0 ? h : null;
}

export type { PolandTarget, SocialPost };
export { POLAND_TARGET_LIMIT };

/** Likes and reposts of a post. A post without counts (an older save) gets small ones made from its id. */
export function postStats(p: SocialPost): { likes: number; reposts: number } {
  return { likes: p.likes ?? 7 + ((p.id * 37) % 90), reposts: p.reposts ?? 2 + ((p.id * 13) % 30) };
}

/** How many people are angry at the player: everyone who posted, liked or reposted. */
export function angryCount(posts: readonly SocialPost[]): number {
  return posts.reduce((n, p) => {
    const st = postStats(p);
    return n + 1 + st.likes + st.reposts;
  }, 0);
}

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
/** The player gates: commands that take the project through a decision that cannot be taken back. */
export type GateId = 'approveProject' | 'advancePhase' | 'launchTBM' | 'openLine';

/**
 * The gate the mission project stands at: approval of a buildable draft, or the gate the project waits at.
 * Null when the next thing to do is not a gate.
 */
export function gateOf(s: GameSnapshot): { project: ProjectView; gate: GateId; key: string } | null {
  const project = missionProject(s);
  const c = project?.nextAction.command ?? null;
  if (project === null || c === null) return null;
  const gate = (['approveProject', 'advancePhase', 'launchTBM', 'openLine'] as const).find((g) => g === c.t);
  if (gate === undefined) return null;
  // Approval is offered on a draft; the other three hold the clock until the player goes through.
  if (gate !== 'approveProject' && s.clock.hold !== 'gate') return null;
  return { project, gate, key: `${project.id}:${gate}` };
}

/** The machine a tunnel option brings, as the chooser and the twin-bore reform row show it. */
export type MachineCard = MachineView;

/** The machine of a design option; null for a station option and for no option at all. */
export function machineOf(option: DesignOptionView | undefined): MachineCard | null {
  return option?.machine ?? null;
}

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
    // Nothing to decide, only to wait. With a machine boring the clock runs by itself: the button only undoes a pause.
    if (isBoring(snap)) {
      if (store.speed.value !== 0) return null;
      return { label: 'Resume time', disabledReason: null, run: () => act(store, () => store.services.time.togglePause()) };
    }
    // Otherwise time moves only when asked: the same run as "Next decision" in the top bar.
    if (store.speed.value !== 0) return null;
    return {
      label: 'Next decision',
      disabledReason: nextDecisionBlocked(snap),
      run: () => act(store, () => store.services.time.setSpeed(SPEED_REGULAR)),
    };
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

/** True when a reform's preview moves neither the cost (to the dollar) nor the opening date (to the day) of the project. */
export function reformIsQuiet(r: ReformView): boolean {
  const p = r.preview;
  return p !== null && Math.round(p.costDeltaCents / 100) === 0 && Math.round(p.daysDelta) === 0;
}

/**
 * The reforms sheet as one list: what to buy, sorted by what each saves on this project (cost first, days on a
 * tie, the sim's order after that), then what is already enacted; and apart from them the reforms that change
 * nothing on this line. Without a project nothing can be measured: every reform stays in `list`, in the sim's order.
 */
export function reformList(reforms: readonly ReformView[]): { list: ReformView[]; noEffect: ReformView[] } {
  const saved = (r: ReformView): number => -(r.preview?.costDeltaCents ?? 0);
  const sooner = (r: ReformView): number => -(r.preview?.daysDelta ?? 0);
  const enacted = reforms.filter((r) => r.status === 'enacted');
  const noEffect = reforms.filter((r) => r.status !== 'enacted' && reformIsQuiet(r));
  const open = reforms
    .filter((r) => r.status !== 'enacted' && !reformIsQuiet(r))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => saved(b.r) - saved(a.r) || sooner(b.r) - sooner(a.r) || a.i - b.i)
    .map((x) => x.r);
  return { list: [...open, ...enacted], noEffect };
}
