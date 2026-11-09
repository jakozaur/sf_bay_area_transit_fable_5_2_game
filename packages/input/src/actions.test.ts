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
  expect(actions).toEqual([{ type: 'tool.primary', x: 102, y: 101 }]);
  actions.length = 0;
  m.feed({ kind: 'pointerdown', x: 100, y: 100, button: 0 });
  m.feed({ kind: 'pointermove', x: 140, y: 100 });
  // Returning to the press position does not turn the drag back into a click.
  m.feed({ kind: 'pointermove', x: 100, y: 100 });
  m.feed({ kind: 'pointerup', x: 100, y: 100, button: 0 });
  expect(actions.filter((a) => a.type === 'tool.primary')).toEqual([]);
  expect(actions.filter((a) => a.type === 'pointer.hover')).toHaveLength(2);
});

test('right click cancels, pointer up without a press is ignored', () => {
  const m = new InputMapper();
  const actions = collect(m);
  m.feed({ kind: 'pointerup', x: 1, y: 1, button: 0 });
  m.feed({ kind: 'pointerdown', x: 5, y: 5, button: 2 });
  m.feed({ kind: 'pointerup', x: 5, y: 5, button: 2 });
  expect(actions).toEqual([{ type: 'tool.cancel' }]);
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
