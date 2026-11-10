import { expect, test } from 'vitest';
import { type KeyInput, type KeyState, resolveKey } from './keys.ts';

const key = (code: string, over: Partial<KeyInput> = {}): KeyInput => ({ code, repeat: false, modified: false, target: 'other', ...over });
const playing: KeyState = { screen: 'playing', panel: null, eventOpen: false, tool: null };

test('Escape closes an open panel, otherwise goes to the game as tool.cancel', () => {
  expect(resolveKey(key('Escape'), { ...playing, panel: 'reforms' })).toEqual({ type: 'closePanel' });
  expect(resolveKey(key('Escape'), playing)).toBeNull();
  expect(resolveKey(key('Escape'), { ...playing, eventOpen: true })).toEqual({ type: 'swallow' });
  expect(resolveKey(key('Escape'), { ...playing, screen: 'title', panel: 'credits' })).toEqual({ type: 'closePanel' });
});

test('digits pick tools and put the active one away', () => {
  expect(resolveKey(key('Digit1'), playing)).toEqual({ type: 'selectTool', tool: 'plan' });
  expect(resolveKey(key('Digit2'), playing)).toEqual({ type: 'selectTool', tool: 'station' });
  expect(resolveKey(key('Digit3'), playing)).toEqual({ type: 'selectTool', tool: 'dig' });
  expect(resolveKey(key('Digit4'), playing)).toEqual({ type: 'selectTool', tool: 'drive' });
  expect(resolveKey(key('Digit3'), { ...playing, tool: 'dig' })).toEqual({ type: 'selectTool', tool: null });
  expect(resolveKey(key('Digit5'), playing)).toBeNull();
});

test('Space pauses, except while driving, where it belongs to the autopilot binding', () => {
  expect(resolveKey(key('Space'), playing)).toEqual({ type: 'togglePause' });
  expect(resolveKey(key('Space'), { ...playing, tool: 'drive' })).toBeNull();
  expect(resolveKey(key('Space', { repeat: true }), playing)).toEqual({ type: 'swallow' });
});

test('a focused button keeps Space and Enter, a focused slider keeps every key', () => {
  expect(resolveKey(key('Space', { target: 'button' }), playing)).toEqual({ type: 'swallow' });
  expect(resolveKey(key('Enter', { target: 'button' }), playing)).toEqual({ type: 'swallow' });
  expect(resolveKey(key('ArrowLeft', { target: 'control' }), playing)).toEqual({ type: 'swallow' });
  expect(resolveKey(key('KeyW', { target: 'button' }), playing)).toBeNull();
});

test('camera and drive keys pass through during play; nothing reaches the game outside play or under an event card', () => {
  for (const code of ['KeyW', 'KeyA', 'KeyC', 'KeyX', 'BracketLeft', 'KeyR']) expect(resolveKey(key(code), playing)).toBeNull();
  expect(resolveKey(key('KeyW'), { ...playing, screen: 'title' })).toEqual({ type: 'swallow' });
  expect(resolveKey(key('Digit1'), { ...playing, screen: 'scorecard' })).toEqual({ type: 'swallow' });
  expect(resolveKey(key('Space'), { ...playing, eventOpen: true })).toEqual({ type: 'swallow' });
});

test('browser shortcuts are never ours', () => {
  expect(resolveKey(key('Digit1', { modified: true }), playing)).toBeNull();
  expect(resolveKey(key('Escape', { modified: true }), { ...playing, panel: 'menu' })).toBeNull();
});
