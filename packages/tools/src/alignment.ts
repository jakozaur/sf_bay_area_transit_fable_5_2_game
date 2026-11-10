/** Draw alignment tool ('plan'). The contract is AlignmentTool in ./contract.ts. */
import {
  type AlignmentEntity,
  type AlignmentIssue,
  ENTITY_COLORS,
  MATERIALS,
  type OverlayHandle,
  type PreviewGeometry,
  TOOL_COMMANDS,
  TOOL_KEYS,
  type ToolAction,
  type ToolCommandSpec,
  type ToolOptionSpec,
  type ToolOptionValue,
  type ToolOptionValues,
  type ToolReadout,
  type ToolStatus,
  type WorldPos,
} from '@bayvox/core';
import {
  type AlignmentEstimate,
  type BayToolContext,
  chainages,
  type GameCommand,
  type Geology,
  geologyOfMaterial,
  isUnderground,
  type Method,
  monthYear,
  nearestChainage,
  type ProjectView,
  type Waypoint,
} from '@bayvox/sim';
import type { AlignmentDraft, AlignmentTool, AlignmentToolDeps, PlanAnchor } from './contract.ts';
import { clamp, cm, formatLength, formatMoney, screenSegment, smoothCentreline } from './util.ts';

/** Extra command ids of the plan tool, beside core TOOL_COMMANDS. The host routes Ctrl+Z and Ctrl+Shift+Z to them. */
export const PLAN_UNDO = 'plan.undo';
export const PLAN_REDO = 'plan.redo';

/** Tuning of the tool itself (interaction only; the buildability limits are the sim's, from estimateAlignment). */
export const PLAN_TUNING = {
  /** Depth of a new waypoint below ground, metres: the Portal reference runs 18 to 26 m down. */
  defaultDepthM: 20,
  minDepthM: 0,
  maxDepthM: 80,
  depthStepM: 1,
  /** A click this close to a handle (CSS pixels) hits it. */
  handlePx: 12,
  /** A click this close to a segment of the draft inserts a waypoint. */
  segmentPx: 8,
  /** The first and last waypoint snap to a scenario anchor within this plan distance, metres. */
  snapM: 60,
  /** How long a one-off message stays in the hint line, seconds. */
  flashSeconds: 4,
  /** A committed change the snapshot has not shown after this long was rejected by the sim, seconds. */
  ackSeconds: 1,
  /** Undo steps kept. */
  historyLimit: 100,
  /** Geology is sampled at the axis, or the first solid voxel within this many metres below it. */
  geologyScanM: 64,
  /** The sim refuses a line with neighbours closer than 1 m, or with more than 512 waypoints (engine.ts). */
  minSpacingM: 1.01,
  maxWaypoints: 512,
  /** Display radius of the smoothed centreline when the sim reports no limit yet, metres. */
  fallbackRadiusM: 150,
} as const;

interface HistoryEntry {
  waypoints: Waypoint[];
  selected: number;
}

interface DragState {
  index: number;
  before: Waypoint[];
  /** Depth of the dragged waypoint below ground when the drag started; kept while it moves. */
  depthM: number;
  /** Waypoint position minus the ground pick under the cursor at the start, so the handle does not jump. */
  dx: number;
  dz: number;
  moved: boolean;
}

function copy(wps: readonly Waypoint[]): Waypoint[] {
  return wps.map((w) => ({ ...w }));
}

/** Geometry signature in millimetres: what "the same line" means when comparing the draft with the snapshot. */
function signature(wps: readonly Waypoint[]): string {
  let s = '';
  for (const w of wps) s += `${Math.round(w.x * 1000)},${Math.round(w.y * 1000)},${Math.round(w.z * 1000)};`;
  return s;
}

export function createAlignmentToolImpl(deps: AlignmentToolDeps = {}): AlignmentTool {
  const geologyOf = deps.geologyOf ?? geologyOfMaterial;
  const T = PLAN_TUNING;

  let projectId = '';
  let waypoints: Waypoint[] = [];
  let selected = -1;
  let hovered = -1;
  let estimate: AlignmentEstimate | null = null;
  /** The sim's vertex issues with the tool's own ('bounds', 'depth') merged in, and every problem line. */
  let vertexIssues: (AlignmentIssue | null)[] = [];
  let problems: string[] = [];
  let depthM: number = T.defaultDepthM;
  let drag: DragState | null = null;
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  /** Signatures of committed lines the snapshot has not shown yet, oldest first, with their age in seconds. */
  let outstanding: { sig: string; age: number }[] = [];
  /** Signature of the project's waypoints in the last snapshot seen ('' when the project does not exist), null before the first. */
  let seen: string | null = null;
  let lastSnapshot: unknown = null;
  let queue: GameCommand[] = [];
  let flash: { text: string; left: number } | null = null;
  let close = false;
  let rev = 0;
  let previewDirty = true;
  let previewCache: PreviewGeometry | null = null;
  let centre: WorldPos[] = [];
  let centreHandle: OverlayHandle | null = null;
  let frozen = false;
  let freeBuild = false;
  let hasProject = false;
  /** Seconds left in which a second click on "Use the official alignment" replaces the line that is drawn. */
  let confirmOfficial = 0;
  /** What the newest undo entry recorded, and for which selection: a run of depth steps is one undo, not a hundred. */
  let lastUndo: { kind: 'depth' | 'other'; selected: number } | null = null;

  function depthOption(key: string, value: ToolOptionValue): number {
    if (typeof value !== 'number' || !(value >= T.minDepthM && value <= T.maxDepthM)) {
      throw new RangeError(`plan tool: ${key} must be a number in [${T.minDepthM}, ${T.maxDepthM}], got ${String(value)}`);
    }
    return value;
  }

  const touch = (): void => {
    rev++;
    previewDirty = true;
  };

  function say(ctx: BayToolContext, text: string, invalid: boolean): void {
    flash = { text, left: T.flashSeconds };
    if (invalid) ctx.services.audio.cue('tool.invalid');
  }

  function projectOf(ctx: BayToolContext): ProjectView | undefined {
    return ctx.snapshot.projects.find((p) => p.id === projectId);
  }

  // ---------------------------------------------------------------- sync with the snapshot

  function adopt(project: ProjectView | undefined, keepHistory: boolean): void {
    waypoints = project === undefined ? [] : copy(project.waypoints);
    selected = -1;
    hovered = -1;
    drag = null;
    outstanding = [];
    if (!keepHistory) {
      undoStack = [];
      redoStack = [];
    }
    touch();
  }

  /** Re-reads the snapshot: follows external changes of the project (official plan, load), notes acknowledged commits. */
  function sync(ctx: BayToolContext): void {
    projectId = ctx.snapshot.mission.planProjectId;
    const project = projectOf(ctx);
    hasProject = project !== undefined;
    frozen = project !== undefined && (project.designFrozen || project.status === 'open');
    freeBuild = ctx.snapshot.mission.freeBuild;
    const sig = project === undefined ? '' : signature(project.waypoints);
    let changed = ctx.snapshot !== lastSnapshot;
    lastSnapshot = ctx.snapshot;
    if (sig !== seen) {
      seen = sig;
      const k = outstanding.findIndex((o) => o.sig === sig);
      if (k >= 0) outstanding.splice(0, k + 1);
      else if (sig !== signature(waypoints) && !(sig === '' && waypoints.length < 2 && outstanding.length === 0)) {
        // Not something this tool sent: the official plan, a load, or the sim normalising the line.
        adopt(project, outstanding.length > 0);
      }
      changed = true;
    }
    if (changed) refreshEstimate(ctx);
  }

  function methodsFor(ctx: BayToolContext, wps: readonly Waypoint[]): Method[] | undefined {
    const project = projectOf(ctx);
    if (project === undefined || project.segments.length === 0 || project.waypoints.length < 2) return undefined;
    // A line built one way needs no methods: the sim keeps its method, and naming methods would reset the
    // player's choice in the design chooser (setAlignment with methods clears the tunnel option).
    const first = project.segments[0].method;
    if (project.segments.every((g) => g.method === first)) return undefined;
    // A mixed line (the official Portal plan): each new segment takes the method of the existing segment
    // nearest to its midpoint, so an insert or a move keeps cut-and-cover where it was and mined where it was.
    const cum = chainages(project.waypoints);
    const out: Method[] = [];
    for (let i = 0; i + 1 < wps.length; i++) {
      const mx = (wps[i].x + wps[i + 1].x) / 2;
      const mz = (wps[i].z + wps[i + 1].z) / 2;
      const s = nearestChainage(project.waypoints, cum, mx, mz).chainageM;
      const seg = project.segments.find((g) => s >= g.fromM && s <= g.toM) ?? project.segments[project.segments.length - 1];
      out.push(seg.method);
    }
    return out;
  }

  function refreshEstimate(ctx: BayToolContext): void {
    if (waypoints.length < 2) {
      estimate = null;
    } else {
      const methods = methodsFor(ctx, waypoints);
      estimate = ctx.services.sim.estimateAlignment({
        ...(hasProject ? { projectId } : {}),
        waypoints: copy(waypoints),
        ...(methods === undefined ? {} : { methods }),
      });
      const n = waypoints.length;
      const c = estimate.checks;
      if (c.segmentIssues.length !== n - 1 || c.vertexIssues.length !== n) {
        throw new Error(
          `plan tool: estimateAlignment returned ${c.segmentIssues.length} segment and ${c.vertexIssues.length} vertex issues for ${n} waypoints`,
        );
      }
    }
    localIssues(ctx);
    touch();
  }

  /**
   * What only the tool can see, because the sim does not know the ground: a waypoint outside the voxel site
   * ('bounds') and a tunnel axis above the surface ('depth'). Merged over the sim's issues in the preview.
   */
  function localIssues(ctx: BayToolContext): void {
    const project = projectOf(ctx);
    vertexIssues = [];
    problems = [];
    for (let i = 0; i < waypoints.length; i++) {
      const depth = depthOf(ctx, waypoints[i]);
      let issue: AlignmentIssue | null = null;
      if (depth === null) {
        issue = 'bounds';
        problems.push(`Waypoint ${i + 1} is outside the site`);
      } else if (depth < 0) {
        // Underground unless both neighbouring segments are surface or viaduct. A line not in the sim yet is a tunnel.
        const near = project === undefined ? [] : [project.segments[i - 1], project.segments[i]].filter((g) => g !== undefined);
        if (near.length === 0 || near.some((g) => isUnderground(g.method))) {
          issue = 'depth';
          problems.push(`Waypoint ${i + 1} is ${(-depth).toFixed(1)} m above ground`);
        }
      }
      vertexIssues.push(estimate?.checks.vertexIssues[i] ?? issue);
    }
    if (estimate !== null) problems = [...estimate.checks.problems, ...problems];
  }

  /** Why the line cannot be sent as it stands, or null: the sim refuses neighbours closer than 1 m and lines over 512 points. */
  function sendProblem(): string | null {
    if (waypoints.length > T.maxWaypoints) return `A line holds at most ${T.maxWaypoints} waypoints.`;
    for (let i = 1; i < waypoints.length; i++) {
      const a = waypoints[i - 1];
      const b = waypoints[i];
      if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < T.minSpacingM) return `Waypoints ${i} and ${i + 1} are on top of each other.`;
    }
    return null;
  }

  // ---------------------------------------------------------------- edits

  function remember(kind: 'depth' | 'other' = 'other'): void {
    // Holding the comma or period key steps the depth many times: the line before the run is what undo returns to.
    // (The first playtest pushed its waypoint edits out of a 100-step history with 240 depth steps.)
    if (kind === 'depth' && lastUndo !== null && lastUndo.kind === 'depth' && lastUndo.selected === selected && undoStack.length > 0) {
      redoStack = [];
      return;
    }
    undoStack.push({ waypoints: copy(waypoints), selected });
    if (undoStack.length > T.historyLimit) undoStack.shift();
    redoStack = [];
    lastUndo = { kind, selected };
  }

  /** Sends the draft to the sim: one setAlignment, or removeProject when fewer than two waypoints remain. */
  function send(ctx: BayToolContext): void {
    if (waypoints.length >= 2) {
      const methods = methodsFor(ctx, waypoints);
      queue.push({
        t: 'setAlignment',
        projectId,
        // A mission's line carries the mission's name; in free build there is no mission to name it after.
        ...(hasProject ? {} : { name: freeBuild ? 'Your line' : ctx.snapshot.mission.title }),
        waypoints: copy(waypoints),
        ...(methods === undefined ? {} : { methods }),
      });
      outstanding.push({ sig: signature(waypoints), age: 0 });
    } else if (hasProject || outstanding.some((o) => o.sig !== '')) {
      queue.push({ t: 'removeProject', projectId });
      outstanding.push({ sig: '', age: 0 });
    }
    refreshEstimate(ctx);
  }

  function refuseIfFrozen(ctx: BayToolContext): boolean {
    if (!frozen) return false;
    say(ctx, 'The design went to tender. The alignment is fixed.', true);
    return true;
  }

  function geologyAt(ctx: BayToolContext, x: number, y: number, z: number): Geology | undefined {
    const vx = Math.floor(x);
    const vz = Math.floor(z);
    const top = Math.floor(y);
    for (let d = 0; d <= T.geologyScanM; d++) {
      const m = ctx.services.world.voxelAt(vx, top - d, vz);
      if (MATERIALS[m]?.solid === true) return geologyOf(m);
    }
    // A void all the way down (an open pit, deep water): leave the ground class to the sim's default.
    return undefined;
  }

  function inSite(ctx: BayToolContext, x: number, z: number): boolean {
    const b = ctx.services.world.siteBounds();
    return x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ;
  }

  function nearestAnchor(ctx: BayToolContext, x: number, z: number): PlanAnchor | null {
    let best: PlanAnchor | null = null;
    let bestD: number = T.snapM;
    for (const a of deps.anchors?.(ctx) ?? []) {
      const d = Math.hypot(a.x - x, a.z - z);
      if (d <= bestD) {
        best = a;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * A waypoint at plan position (x, z), `depth` metres below the ground there. When `end` is set (the point is
   * the first or the last of the line) it snaps to a scenario anchor in range. Null outside the site.
   */
  function makeWaypoint(
    ctx: BayToolContext,
    x: number,
    z: number,
    depth: number,
    end: boolean,
  ): { w: Waypoint; anchor: PlanAnchor | null } | null {
    const anchor = end ? nearestAnchor(ctx, x, z) : null;
    const px = anchor?.x ?? x;
    const pz = anchor?.z ?? z;
    if (!inSite(ctx, px, pz)) return null;
    const y = anchor?.y ?? ctx.services.world.groundAt(px, pz) - depth;
    const w: Waypoint = { x: cm(px), y: cm(y), z: cm(pz) };
    const g = geologyAt(ctx, w.x, w.y, w.z);
    if (g !== undefined) w.geology = g;
    return { w, anchor };
  }

  /** Depth of a waypoint below the ground above it, or null outside the site (the official plan may leave it). */
  function depthOf(ctx: BayToolContext, w: Waypoint): number | null {
    return inSite(ctx, w.x, w.z) ? ctx.services.world.groundAt(w.x, w.z) - w.y : null;
  }

  /** Puts a waypoint `depth` metres below ground. A waypoint outside the site has no ground and stays as it is. */
  function setDepth(ctx: BayToolContext, index: number, depth: number): void {
    const w = waypoints[index];
    if (!inSite(ctx, w.x, w.z)) return;
    const y = cm(ctx.services.world.groundAt(w.x, w.z) - depth);
    const next: Waypoint = { x: w.x, y, z: w.z };
    const g = geologyAt(ctx, next.x, next.y, next.z);
    if (g !== undefined) next.geology = g;
    waypoints[index] = next;
  }

  function removeAt(ctx: BayToolContext, index: number): void {
    remember();
    waypoints.splice(index, 1);
    selected = -1;
    hovered = -1;
    ctx.services.audio.cue('tool.remove');
    send(ctx);
  }

  // ---------------------------------------------------------------- hit tests (screen space)

  function handleAt(ctx: BayToolContext, x: number, y: number): number {
    let best = -1;
    let bestD: number = T.handlePx;
    for (let i = 0; i < waypoints.length; i++) {
      const s = ctx.services.camera.project(waypoints[i]);
      if (s === null) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  function segmentAt(ctx: BayToolContext, x: number, y: number): { index: number; t: number } | null {
    let best: { index: number; t: number } | null = null;
    let bestD: number = T.segmentPx;
    for (let i = 0; i + 1 < waypoints.length; i++) {
      const a = ctx.services.camera.project(waypoints[i]);
      const b = ctx.services.camera.project(waypoints[i + 1]);
      if (a === null || b === null) continue;
      const hit = screenSegment({ x, y }, a, b);
      if (hit.distance <= bestD) {
        best = { index: i, t: hit.t };
        bestD = hit.distance;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- actions

  function primary(ctx: BayToolContext, x: number, y: number): boolean {
    const h = handleAt(ctx, x, y);
    if (h >= 0) {
      selected = h;
      touch();
      return true;
    }
    const seg = segmentAt(ctx, x, y);
    if (seg !== null) {
      if (refuseIfFrozen(ctx)) return true;
      const a = waypoints[seg.index];
      const b = waypoints[seg.index + 1];
      // On the segment itself, elevation included: inserting a point does not change the line.
      const w: Waypoint = {
        x: cm(a.x + (b.x - a.x) * seg.t),
        y: cm(a.y + (b.y - a.y) * seg.t),
        z: cm(a.z + (b.z - a.z) * seg.t),
      };
      const g = geologyAt(ctx, w.x, w.y, w.z);
      if (g !== undefined) w.geology = g;
      remember();
      waypoints.splice(seg.index + 1, 0, w);
      const problem = sendProblem();
      if (problem !== null) {
        waypoints.splice(seg.index + 1, 1);
        undoStack.pop();
        say(ctx, problem, true);
        return true;
      }
      selected = seg.index + 1;
      ctx.services.audio.cue('tool.place');
      send(ctx);
      return true;
    }
    const pick = ctx.services.world.pick(x, y);
    if (pick === null) {
      // A click that hit nothing (the sky, beyond the edge of the map) used to vanish without a word.
      say(ctx, 'That is off the map. Click the ground to place a waypoint.', true);
      return true;
    }
    if (refuseIfFrozen(ctx)) return true;
    const made = makeWaypoint(ctx, pick.point.x, pick.point.z, depthM, true);
    if (made === null) {
      say(ctx, 'That is outside the map.', true);
      return true;
    }
    const prev = waypoints[waypoints.length - 1];
    if (prev !== undefined && Math.hypot(prev.x - made.w.x, prev.z - made.w.z) < 1) {
      say(ctx, 'That is on top of the last waypoint.', true);
      return true;
    }
    if (waypoints.length >= T.maxWaypoints) {
      say(ctx, `A line holds at most ${T.maxWaypoints} waypoints.`, true);
      return true;
    }
    remember();
    waypoints.push(made.w);
    selected = -1;
    if (made.anchor !== null) say(ctx, `Snapped to ${made.anchor.name}.`, false);
    ctx.services.audio.cue('tool.place');
    send(ctx);
    return true;
  }

  function startDrag(ctx: BayToolContext, x: number, y: number): boolean {
    const h = handleAt(ctx, x, y);
    if (h < 0) return false;
    selected = h;
    touch();
    // A frozen line still selects (to read its depth) but does not move. The press is claimed either way.
    if (refuseIfFrozen(ctx)) return true;
    const w = waypoints[h];
    const pick = ctx.services.world.pick(x, y);
    drag = {
      index: h,
      before: copy(waypoints),
      depthM: depthOf(ctx, w) ?? depthM,
      dx: pick === null ? 0 : w.x - pick.point.x,
      dz: pick === null ? 0 : w.z - pick.point.z,
      moved: false,
    };
    return true;
  }

  function moveDrag(ctx: BayToolContext, x: number, y: number): void {
    if (drag === null) return;
    const pick = ctx.services.world.pick(x, y);
    if (pick === null) return;
    const end = drag.index === 0 || drag.index === waypoints.length - 1;
    const made = makeWaypoint(ctx, pick.point.x + drag.dx, pick.point.z + drag.dz, drag.depthM, end);
    if (made === null) return;
    waypoints[drag.index] = made.w;
    if (made.anchor !== null) flash = { text: `Snapped to ${made.anchor.name}.`, left: T.flashSeconds };
    drag.moved = true;
    refreshEstimate(ctx);
  }

  function endDrag(ctx: BayToolContext): void {
    if (drag === null) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    const problem = sendProblem();
    if (problem !== null) {
      waypoints = d.before;
      refreshEstimate(ctx);
      say(ctx, problem, true);
      return;
    }
    undoStack.push({ waypoints: d.before, selected: d.index });
    if (undoStack.length > T.historyLimit) undoStack.shift();
    redoStack = [];
    send(ctx);
  }

  function cancelDrag(ctx: BayToolContext): void {
    if (drag === null) return;
    waypoints = drag.before;
    drag = null;
    refreshEstimate(ctx);
  }

  function adjust(ctx: BayToolContext, delta: number): void {
    const step = Math.sign(delta) * T.depthStepM;
    if (step === 0) return;
    if (waypoints.length === 0) {
      depthM = clamp(depthM + step, T.minDepthM, T.maxDepthM);
      return;
    }
    if (refuseIfFrozen(ctx)) return;
    if (selected >= 0) {
      const depth = depthOf(ctx, waypoints[selected]);
      if (depth === null) {
        say(ctx, `Waypoint ${selected + 1} is outside the site. Drag it onto the map first.`, true);
        return;
      }
      remember('depth');
      setDepth(ctx, selected, clamp(Math.round(depth) + step, T.minDepthM, T.maxDepthM));
    } else {
      // The whole line moves down (or up) by one step, keeping its profile.
      remember('depth');
      depthM = clamp(depthM + step, T.minDepthM, T.maxDepthM);
      for (let i = 0; i < waypoints.length; i++) {
        const depth = depthOf(ctx, waypoints[i]);
        if (depth !== null) setDepth(ctx, i, clamp(depth + step, T.minDepthM, T.maxDepthM));
      }
    }
    send(ctx);
  }

  function restore(ctx: BayToolContext, from: HistoryEntry[], to: HistoryEntry[]): boolean {
    if (drag !== null) cancelDrag(ctx);
    const entry = from.pop();
    if (entry === undefined) return false;
    lastUndo = null;
    if (refuseIfFrozen(ctx)) {
      from.push(entry);
      return true;
    }
    to.push({ waypoints: copy(waypoints), selected });
    waypoints = entry.waypoints;
    selected = entry.selected < waypoints.length ? entry.selected : -1;
    hovered = -1;
    send(ctx);
    return true;
  }

  // ---------------------------------------------------------------- status and preview

  function readouts(): ToolReadout[] {
    if (estimate === null) return [];
    const e = estimate;
    const c = e.checks;
    const out: ToolReadout[] = [
      { id: 'length', label: 'Length', value: formatLength(c.lengthM), bad: c.segmentIssues.includes('short') },
      {
        id: 'radius',
        label: 'Tightest curve',
        value: c.minRadiusM === null ? 'straight' : `R ${Math.round(c.minRadiusM)} m (min ${Math.round(c.limits.minRadiusM)})`,
        bad: c.vertexIssues.includes('radius'),
      },
      {
        id: 'grade',
        label: 'Steepest grade',
        value: `${c.maxGradePct.toFixed(1)}% (max ${c.limits.maxGradePct})`,
        bad: c.segmentIssues.includes('grade'),
      },
      { id: 'cost', label: 'Estimate', value: formatMoney(e.costCents), bad: false },
      { id: 'opens', label: 'Opens', value: monthYear(e.openDate), bad: false },
    ];
    if (!c.ok || problems.length > 0) {
      out.push({ id: 'problem', label: 'Not buildable', value: problems[0] ?? 'the line breaks a limit', bad: true });
    }
    return out;
  }

  function hint(): string {
    if (flash !== null) return flash.text;
    if (frozen) return 'The design went to tender. The alignment is fixed.';
    if (waypoints.length === 0) return 'Click the map to place the first waypoint, or use the official alignment.';
    if (waypoints.length === 1) return 'Click to place the next waypoint. Right-click the handle to delete it.';
    if (drag !== null) return 'Drag to move the waypoint. It keeps its depth. Esc puts it back.';
    if (selected >= 0) return 'Waypoint selected: the comma and period keys change its depth, Delete removes it, Esc deselects.';
    return 'Click to add a waypoint, drag to move, right-click to delete. Comma and period change depth. Enter finishes.';
  }

  function status(): ToolStatus {
    const options: ToolOptionSpec[] = [
      {
        key: TOOL_KEYS.planDepthM,
        label: 'Depth of new waypoints',
        kind: 'range',
        min: T.minDepthM,
        max: T.maxDepthM,
        step: T.depthStepM,
        unit: 'm',
      },
    ];
    const values: Record<string, ToolOptionValue> = { [TOOL_KEYS.planDepthM]: depthM };
    if (selected >= 0 && selected < waypoints.length && selectedDepth !== null) {
      options.push({
        key: TOOL_KEYS.planWaypointDepthM,
        label: `Depth of waypoint ${selected + 1}`,
        kind: 'range',
        min: T.minDepthM,
        max: T.maxDepthM,
        step: T.depthStepM,
        unit: 'm',
      });
      values[TOOL_KEYS.planWaypointDepthM] = selectedDepth;
    }
    const edit = (enabled: boolean, why: string): Pick<ToolCommandSpec, 'enabled' | 'disabledReason'> =>
      frozen
        ? { enabled: false, disabledReason: 'The design is frozen' }
        : enabled
          ? { enabled: true }
          : { enabled: false, disabledReason: why };
    const commands: ToolCommandSpec[] = [
      {
        id: TOOL_COMMANDS.planUseOfficial,
        label: confirmOfficial > 0 ? 'Click again: this replaces your line' : 'Use the official alignment',
        ...edit(!freeBuild, 'Free build has no official plan'),
      },
      { id: TOOL_COMMANDS.planDepthAll, label: 'Set the whole line to this depth', ...edit(waypoints.length > 0, 'No line yet') },
      { id: PLAN_UNDO, label: 'Undo', ...edit(undoStack.length > 0, 'Nothing to undo') },
      { id: PLAN_REDO, label: 'Redo', ...edit(redoStack.length > 0, 'Nothing to redo') },
      { id: TOOL_COMMANDS.planClear, label: 'Clear', ...edit(waypoints.length > 0, 'No line yet') },
      // One waypoint is not a line: finishing would drop it without a word (second playtest).
      {
        id: TOOL_COMMANDS.planFinish,
        label: 'Finish',
        ...(waypoints.length === 1
          ? { enabled: false, disabledReason: 'A line needs two waypoints: click the map again, or Clear' }
          : { enabled: true }),
      },
    ];
    return { id: 'plan', hint: hint(), readouts: readouts(), options, values, commands };
  }

  /** Depth of the selected waypoint, refreshed with the preview (status() has no context to ask the ground). */
  let selectedDepth: number | null = null;

  function rebuild(ctx: BayToolContext): void {
    const depth = selected >= 0 && selected < waypoints.length ? depthOf(ctx, waypoints[selected]) : null;
    selectedDepth = depth === null ? null : Math.round(depth * 10) / 10;
    if (!previewDirty) return;
    previewDirty = false;
    if (waypoints.length === 0) {
      previewCache = null;
      centre = [];
    } else {
      const n = waypoints.length;
      const alignment: AlignmentEntity = {
        id: `${projectId}/preview`,
        points: waypoints.map((w) => ({ x: w.x, y: w.y, z: w.z })),
        rev,
        state: 'preview',
        segmentIssues: estimate?.checks.segmentIssues ?? new Array<null>(Math.max(0, n - 1)).fill(null),
        vertexIssues,
        hoveredVertex: hovered,
        selectedVertex: selected,
      };
      previewCache = { kind: 'alignment', alignment, stations: projectOf(ctx)?.stations ?? [] };
      const limit = estimate?.checks.limits.minRadiusM ?? 0;
      centre = n >= 3 ? smoothCentreline(waypoints, limit > 0 ? limit : T.fallbackRadiusM) : [];
    }
    // The smoothed centreline is the tool's own overlay item: the preview union carries the waypoint polygon only.
    if (centre.length >= 2) {
      const spec = { kind: 'polyline' as const, points: centre, color: ENTITY_COLORS.handle, widthPx: 2, xray: true, dashM: 8 };
      if (centreHandle === null) centreHandle = ctx.services.overlay.add(spec);
      else centreHandle.update(spec);
    } else if (centreHandle !== null) {
      centreHandle.remove();
      centreHandle = null;
    }
  }

  return {
    id: 'plan',

    unavailableReason(): string | null {
      return null;
    },

    activate(ctx: BayToolContext, options?: ToolOptionValues): void {
      seen = null;
      lastSnapshot = null;
      waypoints = [];
      queue = [];
      flash = null;
      close = false;
      confirmOfficial = 0;
      lastUndo = null;
      depthM = T.defaultDepthM;
      projectId = ctx.snapshot.mission.planProjectId;
      adopt(projectOf(ctx), false);
      sync(ctx);
      const d = options?.[TOOL_KEYS.planDepthM];
      if (d !== undefined) depthM = depthOption(TOOL_KEYS.planDepthM, d);
      rebuild(ctx);
    },

    deactivate(ctx: BayToolContext): void {
      // A drag in flight is put back; a single waypoint is not a line and is dropped. What the sim holds stays.
      cancelDrag(ctx);
      waypoints = [];
      selected = -1;
      hovered = -1;
      estimate = null;
      undoStack = [];
      redoStack = [];
      outstanding = [];
      flash = null;
      close = false;
      previewCache = null;
      previewDirty = true;
      centre = [];
      if (centreHandle !== null) {
        centreHandle.remove();
        centreHandle = null;
      }
    },

    onAction(a: ToolAction, ctx: BayToolContext): boolean {
      sync(ctx);
      let consumed = false;
      switch (a.type) {
        case 'pointer.hover': {
          const h = drag === null ? handleAt(ctx, a.x, a.y) : drag.index;
          if (h !== hovered) {
            hovered = h;
            touch();
          }
          break;
        }
        case 'pointer.leave':
          if (hovered !== -1) {
            hovered = -1;
            touch();
          }
          break;
        case 'pointer.down':
          consumed = a.button === 0 && startDrag(ctx, a.x, a.y);
          break;
        case 'pointer.drag':
          moveDrag(ctx, a.x, a.y);
          consumed = true;
          break;
        case 'pointer.up':
          endDrag(ctx);
          consumed = true;
          break;
        case 'tool.primary':
          consumed = primary(ctx, a.x, a.y);
          break;
        case 'tool.secondary': {
          const h = handleAt(ctx, a.x, a.y);
          if (h >= 0) {
            if (!refuseIfFrozen(ctx)) removeAt(ctx, h);
            consumed = true;
          }
          break;
        }
        case 'tool.delete':
          if (selected >= 0) {
            if (!refuseIfFrozen(ctx)) removeAt(ctx, selected);
            consumed = true;
          }
          break;
        case 'tool.adjust':
          adjust(ctx, a.delta);
          touch();
          consumed = true;
          break;
        case 'tool.cancel':
          if (drag !== null) {
            cancelDrag(ctx);
            consumed = true;
          } else if (selected >= 0) {
            selected = -1;
            touch();
            consumed = true;
          }
          break;
        case 'tool.confirm':
          if (waypoints.length === 1) say(ctx, 'A line needs two waypoints: click the map again, or clear it.', true);
          else close = true;
          consumed = true;
          break;
        default:
          break;
      }
      rebuild(ctx);
      return consumed;
    },

    update(dtSeconds: number, ctx: BayToolContext): void {
      sync(ctx);
      if (flash !== null) {
        flash.left -= dtSeconds;
        if (flash.left <= 0) flash = null;
      }
      if (confirmOfficial > 0) {
        confirmOfficial = Math.max(0, confirmOfficial - dtSeconds);
        if (confirmOfficial === 0) touch();
      }
      for (const o of outstanding) o.age += dtSeconds;
      if (outstanding.length > 0 && outstanding[0].age > T.ackSeconds) {
        // The sim never showed the change: it refused the command. Fall back to what it holds and say why.
        const notice = ctx.snapshot.notices[ctx.snapshot.notices.length - 1];
        adopt(projectOf(ctx), false);
        refreshEstimate(ctx);
        say(ctx, `The change was refused${notice === undefined ? '' : `: ${notice.reason}`}.`, true);
      }
      rebuild(ctx);
    },

    preview(): PreviewGeometry | null {
      return previewCache;
    },

    commit(): GameCommand[] {
      const out = queue;
      queue = [];
      return out;
    },

    status,

    setOption(key: string, value: ToolOptionValue, ctx: BayToolContext): void {
      sync(ctx);
      if (key !== TOOL_KEYS.planDepthM && key !== TOOL_KEYS.planWaypointDepthM) throw new RangeError(`plan tool: unknown option ${key}`);
      const depth = depthOption(key, value);
      if (key === TOOL_KEYS.planDepthM) {
        depthM = depth;
      } else {
        if (selected < 0) throw new RangeError(`plan tool: ${key} needs a selected waypoint`);
        if (refuseIfFrozen(ctx)) return;
        if (depthOf(ctx, waypoints[selected]) === null) {
          throw new RangeError(`plan tool: waypoint ${selected + 1} is outside the site and has no depth`);
        }
        remember();
        setDepth(ctx, selected, depth);
        send(ctx);
      }
      rebuild(ctx);
    },

    invoke(commandId: string, ctx: BayToolContext): void {
      sync(ctx);
      const spec = status().commands.find((c) => c.id === commandId);
      if (spec === undefined) throw new RangeError(`plan tool: unknown command ${commandId}`);
      if (!spec.enabled) throw new Error(`plan tool: ${commandId} is disabled: ${spec.disabledReason ?? 'not available now'}`);
      switch (commandId) {
        case TOOL_COMMANDS.planUseOfficial:
          cancelDrag(ctx);
          // A line the player drew is not thrown away on one click: the button asks once.
          if (waypoints.length >= 2 && confirmOfficial <= 0) {
            confirmOfficial = T.flashSeconds;
            say(ctx, 'The official alignment replaces the line you drew, and its stations. Click the button again to do it.', false);
            break;
          }
          confirmOfficial = 0;
          queue.push({ t: 'useOfficialPlan' });
          break;
        case TOOL_COMMANDS.planDepthAll:
          remember();
          for (let i = 0; i < waypoints.length; i++) setDepth(ctx, i, depthM);
          send(ctx);
          break;
        case TOOL_COMMANDS.planClear:
          cancelDrag(ctx);
          remember();
          waypoints = [];
          selected = -1;
          hovered = -1;
          ctx.services.audio.cue('tool.remove');
          send(ctx);
          break;
        case TOOL_COMMANDS.planFinish:
          close = true;
          break;
        case PLAN_UNDO:
          restore(ctx, undoStack, redoStack);
          break;
        case PLAN_REDO:
          restore(ctx, redoStack, undoStack);
          break;
      }
      rebuild(ctx);
    },

    draft(): AlignmentDraft | null {
      if (waypoints.length === 0) return null;
      return { projectId, waypoints: copy(waypoints), selected, estimate };
    },

    centreline(): WorldPos[] {
      return centre;
    },

    undo(ctx: BayToolContext): boolean {
      sync(ctx);
      const done = restore(ctx, undoStack, redoStack);
      rebuild(ctx);
      return done;
    },

    redo(ctx: BayToolContext): boolean {
      sync(ctx);
      const done = restore(ctx, redoStack, undoStack);
      rebuild(ctx);
      return done;
    },

    wantsClose(): boolean {
      return close;
    },
  };
}
