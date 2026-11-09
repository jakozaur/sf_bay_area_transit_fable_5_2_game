/**
 * Raw input to semantic actions (doc 10 section 10.4). No DOM types here: `attachDom` (dom.ts) translates
 * DOM events into RawInput, tests feed RawInput directly. Tools and the app consume actions, never events.
 */

/** Device-level event, already stripped of DOM objects. Pointer x/y are CSS pixels relative to the canvas. */
export type RawInput =
  | { kind: 'keydown'; code: string; repeat?: boolean }
  | { kind: 'keyup'; code: string }
  | { kind: 'pointerdown'; x: number; y: number; button: number }
  | { kind: 'pointerup'; x: number; y: number; button: number }
  | { kind: 'pointermove'; x: number; y: number }
  | { kind: 'pointerleave' }
  /** Window blur or tab hidden: every held key is released. */
  | { kind: 'blur' };

/** Semantic action. Structurally compatible with core's InputAction placeholder. */
export type GameAction =
  | { type: 'tool.primary'; x: number; y: number }
  | { type: 'tool.cancel' }
  | { type: 'pointer.hover'; x: number; y: number }
  | { type: 'pointer.leave' }
  | { type: 'view.toggleCut' }
  | { type: 'view.toggleXray' }
  | { type: 'view.cutUp' }
  | { type: 'view.cutDown' }
  | { type: 'camera.bookmark'; index: number };

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
export type Binding = { axis: AxisName; value: 1 | -1 } | { action: Exclude<GameAction, { type: 'tool.primary' | 'pointer.hover' }> };

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
};

/** A press that moves further than this (CSS pixels) is a drag, owned by the camera, not a click. */
export const CLICK_SLOP_PX = 5;

const AXES: readonly AxisName[] = ['panX', 'panZ', 'rotate', 'tilt', 'zoom'];

export class InputMapper {
  private readonly bindings = new Map<string, Binding>();
  private readonly held = new Set<string>();
  private readonly listeners = new Set<(a: GameAction) => void>();
  /** Press position per button while it is down and still a click candidate. */
  private readonly presses = new Map<number, { x: number; y: number }>();

  constructor(bindings: Readonly<Record<string, Binding>> = DEFAULT_BINDINGS) {
    for (const [code, b] of Object.entries(bindings)) this.bindings.set(code, b);
  }

  /** Binds `code` to `binding`, or unbinds it with null. */
  rebind(code: string, binding: Binding | null): void {
    this.held.delete(code);
    if (binding === null) this.bindings.delete(code);
    else this.bindings.set(code, binding);
  }

  /** Subscribes to the action stream. Returns an unsubscribe function. */
  onAction(cb: (a: GameAction) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  feed(e: RawInput): void {
    switch (e.kind) {
      case 'keydown': {
        const b = this.bindings.get(e.code);
        if (b === undefined) return;
        if ('axis' in b) this.held.add(e.code);
        else if (e.repeat !== true) this.emit(b.action);
        return;
      }
      case 'keyup':
        this.held.delete(e.code);
        return;
      case 'pointerdown':
        this.presses.set(e.button, { x: e.x, y: e.y });
        return;
      case 'pointermove':
        for (const [button, p] of this.presses) {
          if (Math.hypot(e.x - p.x, e.y - p.y) > CLICK_SLOP_PX) this.presses.delete(button);
        }
        this.emit({ type: 'pointer.hover', x: e.x, y: e.y });
        return;
      case 'pointerup': {
        const p = this.presses.get(e.button);
        this.presses.delete(e.button);
        if (p === undefined || Math.hypot(e.x - p.x, e.y - p.y) > CLICK_SLOP_PX) return;
        if (e.button === 0) this.emit({ type: 'tool.primary', x: e.x, y: e.y });
        else if (e.button === 2) this.emit({ type: 'tool.cancel' });
        return;
      }
      case 'pointerleave':
        this.emit({ type: 'pointer.leave' });
        return;
      case 'blur':
        this.held.clear();
        this.presses.clear();
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

  private emit(a: GameAction): void {
    for (const cb of this.listeners) cb(a);
  }
}
