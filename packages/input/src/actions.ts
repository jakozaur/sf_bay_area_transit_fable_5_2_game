/**
 * Raw input to semantic actions (doc 10 section 10.4). No DOM types here: `attachDom` (dom.ts) translates
 * DOM events into RawInput, tests feed RawInput directly. Tools and the app consume actions, never events.
 */
import type { GameSpeed, ToolAction, ToolId } from '@bayvox/core';

/** Device-level event, already stripped of DOM objects. Pointer x/y are CSS pixels relative to the canvas. */
export type RawInput =
  /** `ctrl` is Control or Command. With it only the undo and redo chords are read (KeyZ, Shift+KeyZ, KeyY). */
  | { kind: 'keydown'; code: string; repeat?: boolean; ctrl?: boolean; shift?: boolean }
  | { kind: 'keyup'; code: string }
  | { kind: 'pointerdown'; x: number; y: number; button: number }
  | { kind: 'pointerup'; x: number; y: number; button: number }
  | { kind: 'pointermove'; x: number; y: number }
  | { kind: 'pointerleave' }
  /** Shift + wheel: one notch steps the active tool's analogue option. Plain wheel belongs to the camera and is never fed. */
  | { kind: 'wheel'; deltaY: number; shift: boolean }
  /** Window blur or tab hidden: every held key is released. */
  | { kind: 'blur' };

/**
 * Semantic action. Every member is structurally a core InputAction; the tool-facing subset is core's closed
 * ToolAction union (round 2, docs/CONTRACTS.md), which packages/tools consumes without importing this package.
 */
export type GameAction =
  | ToolAction
  | { type: 'view.toggleCut' }
  | { type: 'view.toggleXray' }
  | { type: 'view.cutUp' }
  | { type: 'view.cutDown' }
  | { type: 'camera.bookmark'; index: number }
  /** Round 2: Space outside the drive context. */
  | { type: 'time.togglePause' }
  /** Round 2: speed buttons by key. */
  | { type: 'time.setSpeed'; speed: GameSpeed }
  /** Round 2: toolbar shortcuts. null puts the tool away. */
  | { type: 'tool.select'; tool: ToolId | null }
  /** Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y): the app routes them to ToolHost.undo and ToolHost.redo. */
  | { type: 'edit.undo' }
  | { type: 'edit.redo' };

/** Actions that carry pointer coordinates or held-key state: produced by the mapper itself, never bound to a key. */
type DerivedActionType =
  | 'tool.primary'
  | 'tool.secondary'
  | 'tool.adjust'
  | 'pointer.hover'
  | 'pointer.leave'
  | 'pointer.down'
  | 'pointer.drag'
  | 'pointer.up'
  | 'drive.thrust'
  | 'drive.axes'
  | 'edit.undo'
  | 'edit.redo';

/** Actions a key press can emit. */
export type KeyAction = Exclude<GameAction, { type: DerivedActionType }>;

/**
 * Which key table is live. 'map' is the default (DEFAULT_BINDINGS: the camera owns W A S D).
 * 'drive' is on while a machine is possessed: DRIVE_BINDINGS take precedence over DEFAULT_BINDINGS.
 */
export type InputContext = 'map' | 'drive';

/** What a key does while driving: hold an axis, or a press. */
export type DriveBinding = { axis: 'steer' | 'pitch'; value: 1 | -1 } | { press: 'thrustUp' | 'thrustDown' | 'autopilot' | 'release' };

/**
 * Driving keys (round 2 brief), keyed on KeyboardEvent.code. In the drive context the mapper emits:
 * thrustUp and thrustDown as drive.thrust (+1, -1), any change of the held steer and pitch keys as one
 * drive.axes, autopilot as drive.autopilot and release as tool.cancel. Opposite held keys cancel.
 */
export const DRIVE_BINDINGS: Readonly<Record<string, DriveBinding>> = {
  KeyW: { press: 'thrustUp' },
  KeyS: { press: 'thrustDown' },
  KeyA: { axis: 'steer', value: -1 },
  KeyD: { axis: 'steer', value: 1 },
  KeyR: { axis: 'pitch', value: 1 },
  KeyF: { axis: 'pitch', value: -1 },
  Space: { press: 'autopilot' },
  Escape: { press: 'release' },
};

/** Continuous camera axes driven by held keys, each in [-1, 1]. */
export interface CameraAxes {
  /** +1 pans right (east when facing north). */
  panX: number;
  /** +1 pans forward. */
  panZ: number;
  /** +1 rotates the view clockwise seen from above. */
  rotate: number;
  /** +1 tilts towards top-down. */
  tilt: number;
  /** +1 zooms in. */
  zoom: number;
}

export type AxisName = keyof CameraAxes;

/** What a key does: hold to drive an axis, or press to emit an action. */
export type Binding = { axis: AxisName; value: 1 | -1 } | { action: KeyAction };

/** Default table, keyed on KeyboardEvent.code so it is layout independent. */
export const DEFAULT_BINDINGS: Readonly<Record<string, Binding>> = {
  KeyW: { axis: 'panZ', value: 1 },
  ArrowUp: { axis: 'panZ', value: 1 },
  KeyS: { axis: 'panZ', value: -1 },
  ArrowDown: { axis: 'panZ', value: -1 },
  KeyA: { axis: 'panX', value: -1 },
  ArrowLeft: { axis: 'panX', value: -1 },
  KeyD: { axis: 'panX', value: 1 },
  ArrowRight: { axis: 'panX', value: 1 },
  KeyQ: { axis: 'rotate', value: -1 },
  KeyE: { axis: 'rotate', value: 1 },
  KeyR: { axis: 'tilt', value: 1 },
  KeyF: { axis: 'tilt', value: -1 },
  Equal: { axis: 'zoom', value: 1 },
  Minus: { axis: 'zoom', value: -1 },
  KeyC: { action: { type: 'view.toggleCut' } },
  KeyX: { action: { type: 'view.toggleXray' } },
  BracketRight: { action: { type: 'view.cutUp' } },
  BracketLeft: { action: { type: 'view.cutDown' } },
  Escape: { action: { type: 'tool.cancel' } },
  Digit1: { action: { type: 'camera.bookmark', index: 0 } },
  Digit2: { action: { type: 'camera.bookmark', index: 1 } },
  Digit3: { action: { type: 'camera.bookmark', index: 2 } },
  Digit4: { action: { type: 'camera.bookmark', index: 3 } },
  Enter: { action: { type: 'tool.confirm' } },
  NumpadEnter: { action: { type: 'tool.confirm' } },
  Delete: { action: { type: 'tool.delete' } },
  Backspace: { action: { type: 'tool.delete' } },
  Space: { action: { type: 'time.togglePause' } },
  Digit8: { action: { type: 'time.setSpeed', speed: 1 } },
  Digit9: { action: { type: 'time.setSpeed', speed: 10 } },
  Digit0: { action: { type: 'time.setSpeed', speed: 100 } },
  KeyP: { action: { type: 'tool.select', tool: 'plan' } },
  KeyB: { action: { type: 'tool.select', tool: 'station' } },
  KeyG: { action: { type: 'tool.select', tool: 'dig' } },
  KeyT: { action: { type: 'tool.select', tool: 'drive' } },
};

/** Toolbar shortcut of each tool in DEFAULT_BINDINGS, for button tooltips and the help card. */
export const TOOL_HOTKEYS: Readonly<Record<ToolId, string>> = { plan: 'KeyP', station: 'KeyB', dig: 'KeyG', drive: 'KeyT' };

/**
 * Keys that step the active tool's analogue option (tool.adjust): depth of the selected waypoint or of the
 * whole line, brush radius. Auto-repeat counts, so holding the key keeps stepping. Shift + wheel does the same.
 */
export const ADJUST_BINDINGS: Readonly<Record<string, 1 | -1>> = { Period: 1, Comma: -1 };

/** Key table to use while `tool` is active: 'drive' for the drive tool, 'map' for everything else. */
export function contextForTool(tool: ToolId | null): InputContext {
  return tool === 'drive' ? 'drive' : 'map';
}

/** A press that moves further than this (CSS pixels) is a drag, owned by the camera, not a click. */
export const CLICK_SLOP_PX = 5;

const AXES: readonly AxisName[] = ['panX', 'panZ', 'rotate', 'tilt', 'zoom'];

export class InputMapper {
  private readonly bindings = new Map<string, Binding>();
  private readonly held = new Set<string>();
  private readonly driveHeld = new Set<string>();
  private readonly listeners = new Set<(a: GameAction) => unknown>();
  private readonly claimListeners = new Set<(claimed: boolean) => void>();
  /** Press position per button while it is down and still a click candidate. */
  private readonly presses = new Map<number, { x: number; y: number }>();
  private ctx: InputContext = 'map';
  /** Button of the gesture a listener claimed on pointer.down, or null. */
  private claimedButton: number | null = null;
  private last = { x: 0, y: 0 };
  private steer: -1 | 0 | 1 = 0;
  private pitch: -1 | 0 | 1 = 0;

  constructor(bindings: Readonly<Record<string, Binding>> = DEFAULT_BINDINGS) {
    for (const [code, b] of Object.entries(bindings)) this.bindings.set(code, b);
  }

  /** Binds `code` to `binding`, or unbinds it with null. */
  rebind(code: string, binding: Binding | null): void {
    this.held.delete(code);
    if (binding === null) this.bindings.delete(code);
    else this.bindings.set(code, binding);
  }

  get context(): InputContext {
    return this.ctx;
  }

  /**
   * Switches the key table (round 2). Entering 'drive' releases every held camera key; leaving it emits a
   * drive.axes with steer 0 and pitch 0 if any drive key was held.
   */
  setContext(context: InputContext): void {
    if (context !== 'map' && context !== 'drive') throw new RangeError(`InputMapper.setContext: unknown context ${String(context)}`);
    if (context === this.ctx) return;
    this.ctx = context;
    if (context === 'drive') this.held.clear();
    else this.releaseDriveKeys();
  }

  /**
   * Subscribes to the action stream. Returns an unsubscribe function.
   * A listener that returns true from a `pointer.down` claims the gesture (see `claimed`).
   */
  onAction(cb: (a: GameAction) => unknown): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * True from a pointer.down a listener claimed until that button is released. While it is true the mapper emits
   * pointer.drag and pointer.up instead of hover and clicks, and the camera rig must ignore the pointer.
   */
  get claimed(): boolean {
    return this.claimedButton !== null;
  }

  /** Called when a gesture is claimed (true) and when it ends (false). Returns an unsubscribe function. */
  onClaim(cb: (claimed: boolean) => void): () => void {
    this.claimListeners.add(cb);
    return () => {
      this.claimListeners.delete(cb);
    };
  }

  feed(e: RawInput): void {
    switch (e.kind) {
      case 'keydown':
        this.keyDown(e.code, e.repeat === true, e.ctrl === true, e.shift === true);
        return;
      case 'keyup':
        this.held.delete(e.code);
        if (this.driveHeld.delete(e.code)) this.emitAxes();
        return;
      case 'pointerdown': {
        this.last = { x: e.x, y: e.y };
        if (this.claimedButton !== null) return;
        this.presses.set(e.button, { x: e.x, y: e.y });
        if (this.emit({ type: 'pointer.down', x: e.x, y: e.y, button: e.button })) {
          this.presses.delete(e.button);
          this.setClaim(e.button);
        }
        return;
      }
      case 'pointermove':
        this.last = { x: e.x, y: e.y };
        if (this.claimedButton !== null) {
          this.emit({ type: 'pointer.drag', x: e.x, y: e.y });
          return;
        }
        for (const [button, p] of this.presses) {
          if (Math.hypot(e.x - p.x, e.y - p.y) > CLICK_SLOP_PX) this.presses.delete(button);
        }
        this.emit({ type: 'pointer.hover', x: e.x, y: e.y });
        return;
      case 'pointerup': {
        this.last = { x: e.x, y: e.y };
        if (this.claimedButton !== null) {
          if (e.button !== this.claimedButton) return;
          this.emit({ type: 'pointer.up', x: e.x, y: e.y });
          this.setClaim(null);
          return;
        }
        const p = this.presses.get(e.button);
        this.presses.delete(e.button);
        if (p === undefined || Math.hypot(e.x - p.x, e.y - p.y) > CLICK_SLOP_PX) return;
        if (e.button === 0) this.emit({ type: 'tool.primary', x: e.x, y: e.y });
        else if (e.button === 2) this.emit({ type: 'tool.secondary', x: e.x, y: e.y });
        return;
      }
      case 'pointerleave':
        // A claimed gesture keeps the pointer (the DOM adapter captures it), so leaving the canvas does not end it.
        if (this.claimedButton === null) this.emit({ type: 'pointer.leave' });
        return;
      case 'wheel':
        if (e.shift && e.deltaY !== 0) this.emit({ type: 'tool.adjust', delta: e.deltaY < 0 ? 1 : -1 });
        return;
      case 'blur':
        this.held.clear();
        this.presses.clear();
        this.releaseDriveKeys();
        if (this.claimedButton !== null) {
          // The release will never arrive: end the gesture where the pointer was last seen.
          this.emit({ type: 'pointer.up', x: this.last.x, y: this.last.y });
          this.setClaim(null);
        }
        return;
    }
  }

  /** Current axis values from held keys. Opposite keys cancel. */
  axes(): CameraAxes {
    const out: CameraAxes = { panX: 0, panZ: 0, rotate: 0, tilt: 0, zoom: 0 };
    for (const code of this.held) {
      const b = this.bindings.get(code);
      if (b !== undefined && 'axis' in b) out[b.axis] += b.value;
    }
    for (const a of AXES) out[a] = Math.max(-1, Math.min(1, out[a]));
    return out;
  }

  private keyDown(code: string, repeat: boolean, ctrl: boolean, shift: boolean): void {
    if (ctrl) {
      // Chords: only undo and redo. Everything else with Control or Command belongs to the browser.
      if (code === 'KeyZ') this.emit({ type: shift ? 'edit.redo' : 'edit.undo' });
      else if (code === 'KeyY') this.emit({ type: 'edit.redo' });
      return;
    }
    if (this.ctx === 'drive') {
      const d = DRIVE_BINDINGS[code];
      if (d !== undefined) {
        if ('axis' in d) {
          this.driveHeld.add(code);
          this.emitAxes();
        } else if (!repeat) {
          if (d.press === 'thrustUp') this.emit({ type: 'drive.thrust', delta: 1 });
          else if (d.press === 'thrustDown') this.emit({ type: 'drive.thrust', delta: -1 });
          else if (d.press === 'autopilot') this.emit({ type: 'drive.autopilot' });
          else this.emit({ type: 'tool.cancel' });
        }
        return;
      }
    }
    const adjust = ADJUST_BINDINGS[code];
    if (adjust !== undefined) {
      this.emit({ type: 'tool.adjust', delta: adjust });
      return;
    }
    const b = this.bindings.get(code);
    if (b === undefined) return;
    if ('axis' in b) this.held.add(code);
    else if (!repeat) this.emit(b.action);
  }

  /** Emits drive.axes when the held steer and pitch keys give a different pair than the last one sent. */
  private emitAxes(): void {
    let steer = 0;
    let pitch = 0;
    for (const code of this.driveHeld) {
      const d = DRIVE_BINDINGS[code];
      if (d === undefined || !('axis' in d)) continue;
      if (d.axis === 'steer') steer += d.value;
      else pitch += d.value;
    }
    const s = Math.sign(steer) as -1 | 0 | 1;
    const p = Math.sign(pitch) as -1 | 0 | 1;
    if (s === this.steer && p === this.pitch) return;
    this.steer = s;
    this.pitch = p;
    this.emit({ type: 'drive.axes', steer: s, pitch: p });
  }

  private releaseDriveKeys(): void {
    this.driveHeld.clear();
    this.emitAxes();
  }

  private setClaim(button: number | null): void {
    this.claimedButton = button;
    for (const cb of this.claimListeners) cb(button !== null);
  }

  /** Delivers to every listener. True when one of them returned true (consumed). */
  private emit(a: GameAction): boolean {
    let consumed = false;
    for (const cb of this.listeners) if (cb(a) === true) consumed = true;
    return consumed;
  }
}
