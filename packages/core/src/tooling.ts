/**
 * Tool contract, shared by packages/input (emits the actions), packages/tools (implements the tools and the
 * tool host), packages/ui (renders the status, sets options) and apps/game (routes between them).
 * The Tool and ToolContext interfaces themselves stay in ./sim.ts.
 */

/** The four tools of the toolbar. Cut plane, x-ray and camera bookmarks are view toggles, not tools. */
export const TOOL_IDS = ['plan', 'station', 'dig', 'drive'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/**
 * Semantic input a tool consumes. Pointer x and y are CSS pixels relative to the canvas.
 * packages/input emits these (its GameAction union contains every member); tools never see DOM events.
 */
export type ToolAction =
  /** Left click that did not turn into a drag. */
  | { type: 'tool.primary'; x: number; y: number }
  /** Right click that did not turn into a drag: delete what is under the cursor. */
  | { type: 'tool.secondary'; x: number; y: number }
  /** Escape: drop the selection, or leave the tool when nothing is selected. */
  | { type: 'tool.cancel' }
  /** Enter: finish (close the alignment being drawn). */
  | { type: 'tool.confirm' }
  /** Delete or Backspace: remove the selected item. */
  | { type: 'tool.delete' }
  /** Step an analogue option of the tool: waypoint depth, brush radius. `delta` is +1 or -1 per key press or wheel notch. */
  | { type: 'tool.adjust'; delta: number }
  | { type: 'pointer.hover'; x: number; y: number }
  | { type: 'pointer.leave' }
  /**
   * Button pressed. A tool that returns true from onAction claims the gesture: the camera rig ignores it and the
   * tool receives pointer.drag and pointer.up until release. Unclaimed presses belong to the camera.
   */
  | { type: 'pointer.down'; x: number; y: number; button: number }
  | { type: 'pointer.drag'; x: number; y: number }
  | { type: 'pointer.up'; x: number; y: number }
  /** Drive context: W (+1) or S (-1) pressed, one thrust level up or down. */
  | { type: 'drive.thrust'; delta: 1 | -1 }
  /** Drive context: the held steer and pitch keys changed. steer +1 is right (D), pitch +1 is up (R). */
  | { type: 'drive.axes'; steer: -1 | 0 | 1; pitch: -1 | 0 | 1 }
  /** Drive context: Space, toggles autopilot. */
  | { type: 'drive.autopilot' };

export type ToolOptionValue = number | string | boolean;
export type ToolOptionValues = Readonly<Record<string, ToolOptionValue>>;

/** One editable option of the active tool, rendered generically by the UI (slider, choice row, toggle). */
export type ToolOptionSpec =
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; unit: string }
  | { key: string; label: string; kind: 'choice'; choices: { value: string; label: string; disabledReason?: string }[] }
  | { key: string; label: string; kind: 'toggle' };

/** One live number of the active tool. `bad` is drawn in red (a violated radius or grade, an unaffordable price). */
export interface ToolReadout {
  id: string;
  label: string;
  /** Already formatted: "2.09 km", "R 140 m (min 150)", "$1.2B". */
  value: string;
  bad: boolean;
}

/** A button the active tool offers ("Use the official alignment", "Finish", "Clear"). */
export interface ToolCommandSpec {
  id: string;
  label: string;
  enabled: boolean;
  /** Why it is disabled, one line. */
  disabledReason?: string;
}

/** What the UI shows for the active tool. Published by the tool host whenever it changes. */
export interface ToolStatus {
  /** Active tool, or null when the pointer only moves the camera. */
  id: ToolId | null;
  /** One line telling the player what the mouse and keys do right now. */
  hint: string;
  readouts: ToolReadout[];
  options: ToolOptionSpec[];
  /** Current value of every option in `options`, by key. */
  values: ToolOptionValues;
  commands: ToolCommandSpec[];
}

/** Per tool: null when it can be activated now, else one line saying why not ("No machine to drive yet"). */
export type ToolAvailability = Readonly<Record<ToolId, string | null>>;

/** Frozen option keys and command ids, so the UI can bind dedicated controls without importing packages/tools. */
export const TOOL_KEYS = {
  /** plan, range: depth below ground in metres applied to new waypoints and, through `plan.depthAll`, to the whole line. */
  planDepthM: 'plan.depthM',
  /** plan, range: depth below ground of the selected waypoint. Absent from `options` when nothing is selected. */
  planWaypointDepthM: 'plan.waypointDepthM',
  /** station, choice: station template id (packages/sim STATION_TEMPLATES). */
  stationTemplate: 'station.template',
  /** station, range: platform depth below ground in metres. */
  stationDepthM: 'station.depthM',
  /** dig, range: brush radius in metres. */
  digRadiusM: 'dig.radiusM',
  /** drive, choice: id of the possessed heading. */
  driveHeadingId: 'drive.headingId',
} as const;

export const TOOL_COMMANDS = {
  /** plan: replace the draft with the scenario's official alignment (sim command useOfficialPlan). */
  planUseOfficial: 'plan.useOfficial',
  /** plan: apply `plan.depthM` to every waypoint. */
  planDepthAll: 'plan.depthAll',
  /** plan: remove the draft alignment. */
  planClear: 'plan.clear',
  /** plan: leave the tool, keeping the draft. */
  planFinish: 'plan.finish',
  /** drive: stop possessing the machine; it continues on autopilot. */
  driveRelease: 'drive.release',
} as const;
