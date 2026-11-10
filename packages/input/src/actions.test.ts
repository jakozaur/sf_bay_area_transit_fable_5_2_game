import { expect, test } from 'vitest';
import { type GameAction, InputMapper } from './actions.ts';

function collect(m: InputMapper): GameAction[] {
  const out: GameAction[] = [];
  m.onAction((a) => out.push(a));
  return out;
}

test('held keys drive axes, opposite keys cancel, blur releases everything', () => {
  const m = new InputMapper();
  m.feed({ kind: 'keydown', code: 'KeyW' });
  m.feed({ kind: 'keydown', code: 'KeyD' });
  expect(m.axes()).toEqual({ panX: 1, panZ: 1, rotate: 0, tilt: 0, zoom: 0 });
  m.feed({ kind: 'keydown', code: 'KeyS' });
  expect(m.axes().panZ).toBe(0);
  m.feed({ kind: 'keyup', code: 'KeyS' });
  m.feed({ kind: 'keydown', code: 'ArrowUp' });
  expect(m.axes().panZ).toBe(1);
  m.feed({ kind: 'blur' });
  expect(m.axes()).toEqual({ panX: 0, panZ: 0, rotate: 0, tilt: 0, zoom: 0 });
});

test('action keys emit once per press, not on auto-repeat', () => {
  const m = new InputMapper();
  const actions = collect(m);
  m.feed({ kind: 'keydown', code: 'KeyC' });
  m.feed({ kind: 'keydown', code: 'KeyC', repeat: true });
  m.feed({ kind: 'keyup', code: 'KeyC' });
  m.feed({ kind: 'keydown', code: 'Digit3' });
  m.feed({ kind: 'keydown', code: 'KeyZ' });
  expect(actions).toEqual([{ type: 'view.toggleCut' }, { type: 'camera.bookmark', index: 2 }]);
});

test('a press and release in place is tool.primary; a drag is not', () => {
  const m = new InputMapper();
  const actions = collect(m);
  m.feed({ kind: 'pointerdown', x: 100, y: 100, button: 0 });
  m.feed({ kind: 'pointerup', x: 102, y: 101, button: 0 });
  expect(actions).toEqual([
    { type: 'pointer.down', x: 100, y: 100, button: 0 },
    { type: 'tool.primary', x: 102, y: 101 },
  ]);
  actions.length = 0;
  m.feed({ kind: 'pointerdown', x: 100, y: 100, button: 0 });
  m.feed({ kind: 'pointermove', x: 140, y: 100 });
  // Returning to the press position does not turn the drag back into a click.
  m.feed({ kind: 'pointermove', x: 100, y: 100 });
  m.feed({ kind: 'pointerup', x: 100, y: 100, button: 0 });
  expect(actions.filter((a) => a.type === 'tool.primary')).toEqual([]);
  expect(actions.filter((a) => a.type === 'pointer.hover')).toHaveLength(2);
});

// Round 2 contract (docs/CONTRACTS.md decision 15): right click is tool.secondary with coordinates, only Escape cancels.
test('right click is tool.secondary, Escape is tool.cancel, pointer up without a press is ignored', () => {
  const m = new InputMapper();
  const actions = collect(m);
  m.feed({ kind: 'pointerup', x: 1, y: 1, button: 0 });
  m.feed({ kind: 'pointerdown', x: 5, y: 5, button: 2 });
  m.feed({ kind: 'pointerup', x: 6, y: 5, button: 2 });
  m.feed({ kind: 'keydown', code: 'Escape' });
  expect(actions).toEqual([
    { type: 'pointer.down', x: 5, y: 5, button: 2 },
    { type: 'tool.secondary', x: 6, y: 5 },
    { type: 'tool.cancel' },
  ]);
  actions.length = 0;
  // A right drag orbits the camera: no delete at the end of it.
  m.feed({ kind: 'pointerdown', x: 5, y: 5, button: 2 });
  m.feed({ kind: 'pointermove', x: 60, y: 5 });
  m.feed({ kind: 'pointerup', x: 60, y: 5, button: 2 });
  expect(actions.filter((a) => a.type === 'tool.secondary')).toEqual([]);
});

test('a claimed pointer.down turns the gesture into drag and up, with no hover and no click', () => {
  const m = new InputMapper();
  const actions = collect(m);
  const claims: boolean[] = [];
  m.onClaim((c) => claims.push(c));
  m.onAction((a) => a.type === 'pointer.down' && a.button === 0);
  m.feed({ kind: 'pointerdown', x: 10, y: 10, button: 0 });
  expect(m.claimed).toBe(true);
  m.feed({ kind: 'pointermove', x: 11, y: 10 });
  m.feed({ kind: 'pointerleave' });
  // Another button during the gesture is ignored, and does not end it.
  m.feed({ kind: 'pointerdown', x: 11, y: 10, button: 2 });
  m.feed({ kind: 'pointerup', x: 11, y: 10, button: 2 });
  expect(m.claimed).toBe(true);
  m.feed({ kind: 'pointerup', x: 11, y: 10, button: 0 });
  expect(m.claimed).toBe(false);
  expect(actions).toEqual([
    { type: 'pointer.down', x: 10, y: 10, button: 0 },
    { type: 'pointer.drag', x: 11, y: 10 },
    { type: 'pointer.up', x: 11, y: 10 },
  ]);
  expect(claims).toEqual([true, false]);
  // The right button was not claimed by this listener: it stays a click.
  actions.length = 0;
  m.feed({ kind: 'pointerdown', x: 3, y: 3, button: 2 });
  m.feed({ kind: 'pointerup', x: 3, y: 3, button: 2 });
  expect(actions.map((a) => a.type)).toEqual(['pointer.down', 'tool.secondary']);
});

test('blur ends a claimed gesture where the pointer was last seen', () => {
  const m = new InputMapper();
  const actions = collect(m);
  m.onAction((a) => a.type === 'pointer.down');
  m.feed({ kind: 'pointerdown', x: 10, y: 10, button: 0 });
  m.feed({ kind: 'pointermove', x: 40, y: 12 });
  m.feed({ kind: 'blur' });
  expect(m.claimed).toBe(false);
  expect(actions.at(-1)).toEqual({ type: 'pointer.up', x: 40, y: 12 });
});

test('the drive context takes W A S D R F Space Escape from the camera', () => {
  const m = new InputMapper();
  const actions = collect(m);
  m.feed({ kind: 'keydown', code: 'KeyW' });
  expect(m.axes().panZ).toBe(1);
  m.setContext('drive');
  expect(m.context).toBe('drive');
  // Entering the drive context releases held camera keys.
  expect(m.axes().panZ).toBe(0);
  m.feed({ kind: 'keydown', code: 'KeyW' });
  m.feed({ kind: 'keydown', code: 'KeyW', repeat: true });
  m.feed({ kind: 'keydown', code: 'KeyS' });
  m.feed({ kind: 'keydown', code: 'KeyD' });
  m.feed({ kind: 'keydown', code: 'KeyD', repeat: true });
  m.feed({ kind: 'keydown', code: 'KeyR' });
  m.feed({ kind: 'keydown', code: 'KeyA' });
  m.feed({ kind: 'keyup', code: 'KeyD' });
  m.feed({ kind: 'keydown', code: 'Space' });
  m.feed({ kind: 'keydown', code: 'Escape' });
  expect(actions).toEqual([
    { type: 'drive.thrust', delta: 1 },
    { type: 'drive.thrust', delta: -1 },
    { type: 'drive.axes', steer: 1, pitch: 0 },
    { type: 'drive.axes', steer: 1, pitch: 1 },
    // A and D together cancel.
    { type: 'drive.axes', steer: 0, pitch: 1 },
    { type: 'drive.axes', steer: -1, pitch: 1 },
    { type: 'drive.autopilot' },
    { type: 'tool.cancel' },
  ]);
  expect(m.axes()).toEqual({ panX: 0, panZ: 0, rotate: 0, tilt: 0, zoom: 0 });
  // Keys the drive table does not name keep their map meaning.
  m.feed({ kind: 'keydown', code: 'KeyQ' });
  expect(m.axes().rotate).toBe(-1);
  actions.length = 0;
  // Leaving the context with keys held zeroes the axes once.
  m.setContext('map');
  expect(actions).toEqual([{ type: 'drive.axes', steer: 0, pitch: 0 }]);
  actions.length = 0;
  m.setContext('map');
  m.feed({ kind: 'keydown', code: 'Space' });
  expect(actions).toEqual([{ type: 'time.togglePause' }]);
});

test('blur in the drive context zeroes the held steer and pitch', () => {
  const m = new InputMapper();
  m.setContext('drive');
  const actions = collect(m);
  m.feed({ kind: 'keydown', code: 'KeyA' });
  m.feed({ kind: 'blur' });
  m.feed({ kind: 'blur' });
  expect(actions).toEqual([
    { type: 'drive.axes', steer: -1, pitch: 0 },
    { type: 'drive.axes', steer: 0, pitch: 0 },
  ]);
  expect(() => m.setContext('fly' as 'map')).toThrow(/unknown context/);
});

test('undo and redo chords, adjust keys and shift wheel, toolbar and speed keys', () => {
  const m = new InputMapper();
  const actions = collect(m);
  m.feed({ kind: 'keydown', code: 'KeyZ', ctrl: true });
  m.feed({ kind: 'keydown', code: 'KeyZ', ctrl: true, shift: true });
  m.feed({ kind: 'keydown', code: 'KeyY', ctrl: true });
  // Any other chord belongs to the browser, and never reaches a plain binding.
  m.feed({ kind: 'keydown', code: 'KeyC', ctrl: true });
  m.feed({ kind: 'keydown', code: 'Period' });
  m.feed({ kind: 'keydown', code: 'Period', repeat: true });
  m.feed({ kind: 'keydown', code: 'Comma' });
  m.feed({ kind: 'wheel', deltaY: -100, shift: true });
  m.feed({ kind: 'wheel', deltaY: 100, shift: true });
  m.feed({ kind: 'wheel', deltaY: 100, shift: false });
  m.feed({ kind: 'keydown', code: 'KeyP' });
  m.feed({ kind: 'keydown', code: 'Digit9' });
  m.feed({ kind: 'keydown', code: 'Enter' });
  m.feed({ kind: 'keydown', code: 'Delete' });
  expect(actions).toEqual([
    { type: 'edit.undo' },
    { type: 'edit.redo' },
    { type: 'edit.redo' },
    { type: 'tool.adjust', delta: 1 },
    { type: 'tool.adjust', delta: 1 },
    { type: 'tool.adjust', delta: -1 },
    { type: 'tool.adjust', delta: 1 },
    { type: 'tool.adjust', delta: -1 },
    { type: 'tool.select', tool: 'plan' },
    { type: 'time.setSpeed', speed: 10 },
    { type: 'tool.confirm' },
    { type: 'tool.delete' },
  ]);
});

test('rebind moves an action to another key and unsubscribe stops delivery', () => {
  const m = new InputMapper();
  const out: GameAction[] = [];
  const off = m.onAction((a) => out.push(a));
  m.rebind('KeyC', null);
  m.rebind('KeyV', { action: { type: 'view.toggleCut' } });
  m.feed({ kind: 'keydown', code: 'KeyC' });
  m.feed({ kind: 'keydown', code: 'KeyV' });
  expect(out).toEqual([{ type: 'view.toggleCut' }]);
  off();
  m.feed({ kind: 'keydown', code: 'KeyX' });
  expect(out).toHaveLength(1);
});
