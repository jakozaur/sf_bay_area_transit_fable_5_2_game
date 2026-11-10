/**
 * Tools contract (round 2, docs/CONTRACTS.md): the four pointer tools and the host that runs them.
 * Tools are pure logic over BayToolContext: no DOM, no three, no renderer. They read the snapshot, call
 * ctx.services (pick, groundAt, estimateAlignment, camera, audio, world.dig) and return sim commands.
 * The generic Tool interface is in packages/core/src/sim.ts; option keys and command ids in core TOOL_KEYS, TOOL_COMMANDS.
 */
import type { ToolAction, ToolPort, WorldPos, WorldStore } from '@bayvox/core';
import type { AlignmentEstimate, BayServices, BayTool, BayToolContext, Geology, ScenarioDef, StationTemplate, Waypoint } from '@bayvox/sim';
import { createAlignmentToolImpl } from './alignment.ts';
import { createDigToolImpl } from './dig.ts';
import { createDriveToolImpl } from './drive.ts';
import { createToolHostImpl } from './host.ts';
import { createStationToolImpl } from './station.ts';

/**
 * What the host needs from a tool beyond core Tool (additive, all optional): a tool asks to be put away
 * (Enter in the plan tool, release or breakthrough in the drive tool), and may support undo and redo.
 */
export interface HostedTool extends BayTool {
  /** True when the tool is done: the host deactivates it after the current call. */
  wantsClose?(): boolean;
  /** Undoes the last edit. False when there is nothing to undo. */
  undo?(ctx: BayToolContext): boolean;
  redo?(ctx: BayToolContext): boolean;
}

/**
 * A place the ends of an alignment snap to: the launch site, the destination box. The app supplies them from
 * the scenario (connectAnchors); the snapshot does not carry scenario positions.
 */
export interface PlanAnchor {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Track elevation to take over (an existing box has a fixed level). Default: ground minus the depth option. */
  y?: number;
}

export interface AlignmentToolDeps {
  /** Anchors in force now. Default: none. */
  anchors?: (ctx: BayToolContext) => PlanAnchor[];
  /** Ground class of a solid material. Default: the sim's geologyOfMaterial. */
  geologyOf?: (material: number) => Geology;
}

/** Options of createTools and the host: what the app knows that the snapshot does not. */
export interface ToolsDeps {
  /** Scenario anchors for the plan tool. */
  anchors?: () => PlanAnchor[];
  geologyOf?: (material: number) => Geology;
}

/** The end points of a scenario's connect objectives as plan anchors (The Portal: 4th and King, Salesforce Transit Center). */
export function connectAnchors(scenario: Pick<ScenarioDef, 'objectives'>): PlanAnchor[] {
  const out: PlanAnchor[] = [];
  for (const o of scenario.objectives) {
    if (o.kind !== 'connect') continue;
    out.push({ id: `${o.id}/a`, name: o.a.name, x: o.a.x, z: o.a.z }, { id: `${o.id}/b`, name: o.b.name, x: o.b.x, z: o.b.z });
  }
  return out;
}

/**
 * Draw alignment ('plan').
 * - tool.primary on open ground appends a waypoint; on a segment of the draft it inserts one there.
 *   x and z come from ctx.services.world.pick, y is ground minus the depth option, geology from geologyOfMaterial.
 * - pointer.down on a waypoint handle claims the gesture; pointer.drag moves the waypoint; pointer.up drops it.
 * - tool.secondary on a handle, or tool.delete with a selection, removes the waypoint.
 * - Every change commits one setAlignment for MissionView.planProjectId (removeProject when fewer than two
 *   waypoints remain), so the sim always holds what is on screen. Stations already placed stay on the line.
 * - The preview is kind 'alignment' with the issue arrays of estimateAlignment; readouts are length, minimum
 *   radius, steepest grade, cost, cost per km and the ratio to Poland, `bad` where a check fails.
 * - Refuses to edit (hint says why) once the design is frozen.
 */
export interface AlignmentTool extends HostedTool {
  readonly id: 'plan';
  /** The line being edited, or null before the first waypoint. */
  draft(): AlignmentDraft | null;
  /**
   * The draft with every vertex rounded to an arc of the minimum radius (smaller where the legs are short), as
   * the tool draws it through services.overlay.add beside the preview. Empty below three waypoints.
   */
  centreline(): WorldPos[];
  undo(ctx: BayToolContext): boolean;
  redo(ctx: BayToolContext): boolean;
}

export interface AlignmentDraft {
  projectId: string;
  waypoints: Waypoint[];
  /** Index of the selected waypoint, or -1. */
  selected: number;
  /** Last estimate, null while the draft has fewer than two waypoints. */
  estimate: AlignmentEstimate | null;
}

/**
 * Add station ('station'). pointer.hover snaps a ghost box to the nearest point of the mission's alignment
 * (preview kind 'station'; `valid` false away from the line or on top of another station). tool.primary
 * commits addStation; tool.secondary on a station commits removeStation.
 */
export interface StationTool extends HostedTool {
  readonly id: 'station';
  /** Where a click would place the station now, or null when the cursor is not near the line. */
  candidate(): { chainageM: number; template: StationTemplate; valid: boolean; reason: string } | null;
}

/**
 * Dig brush ('dig'). tool.primary, or a claimed drag, carves a sphere of the radius option at the picked voxel
 * through ctx.services.world.dig and commits chargeDig with the removed volume. Preview kind 'brush'.
 * The readouts show the price of the last stroke and the total charged.
 */
export interface DigTool extends HostedTool {
  readonly id: 'dig';
}

/**
 * Drive ('drive'): possession of one heading.
 * - activate: picks the heading (option core TOOL_KEYS.driveHeadingId, default the first running machine), commits
 *   tbmControl { autopilot: false } and calls ctx.services.camera.follow with mode 'cutaway'.
 * - drive.thrust steps the thrust level by a quarter; drive.axes sets steer and pitch; drive.autopilot toggles
 *   autopilot. Each commits one tbmControl. Nothing is sent while the inputs do not change.
 * - The preview is kind 'guidance': the planned axis ahead and the deviation from TbmView.deviation.
 * - deactivate or tool.cancel: commits tbmControl { autopilot: true } and ends the camera follow.
 */
export interface DriveTool extends HostedTool {
  readonly id: 'drive';
  /** The possessed heading, or null. */
  headingId(): string | null;
}

/**
 * Owns the active tool. It is the implementation of GameServices.tools (`port`), and the app feeds it input
 * and frames. After every handle and update it drains the tool's commands into services.sim.command, pushes
 * the tool's preview to services.overlay.setPreview and republishes the tool's status.
 */
export interface ToolHost {
  readonly port: ToolPort;
  /** Routes one action to the active tool. True when the tool consumed it (core Tool.onAction). */
  handle(a: ToolAction): boolean;
  /** Once per rendered frame, before the scene is drawn. */
  update(dtSeconds: number): void;
  active(): BayTool | null;
  /** Ctrl+Z and Ctrl+Shift+Z: undo and redo of the active tool's edits. False when it has none (or no tool is active). */
  undo(): boolean;
  redo(): boolean;
  /** Deactivates the active tool and drops every subscription. */
  dispose(): void;
}

export interface ToolHostDeps {
  world: WorldStore;
  /** Lazy, because the services object contains this host's port. */
  services: () => BayServices;
  /** Default: the four tools of createTools. */
  tools?: BayTool[];
  /** Scenario anchors the ends of a drawn alignment snap to (connectAnchors). Used when `tools` is omitted. */
  anchors?: () => PlanAnchor[];
}

export function createAlignmentTool(deps?: AlignmentToolDeps): AlignmentTool {
  return createAlignmentToolImpl(deps);
}

export function createStationTool(): StationTool {
  return createStationToolImpl();
}

export function createDigTool(): DigTool {
  return createDigToolImpl();
}

export function createDriveTool(): DriveTool {
  return createDriveToolImpl();
}

/** The four tools, in core TOOL_IDS order. */
export function createTools(deps: ToolsDeps = {}): BayTool[] {
  const anchors = deps.anchors;
  return [
    createAlignmentTool({
      ...(anchors === undefined ? {} : { anchors: () => anchors() }),
      ...(deps.geologyOf ? { geologyOf: deps.geologyOf } : {}),
    }),
    createStationTool(),
    createDigTool(),
    createDriveTool(),
  ];
}

export function createToolHost(deps: ToolHostDeps): ToolHost {
  return createToolHostImpl(deps);
}
