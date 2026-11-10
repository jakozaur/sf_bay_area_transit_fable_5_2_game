/**
 * Keyboard policy of the UI, as a pure function so it can be tested without a DOM.
 * The UI listens on the window in the capture phase and stops every key it handles here, so the input
 * mapper (packages/input, bubble phase on the same window) never sees it: no key is handled twice.
 * Everything else (W A S D, C, X, brackets, the drive keys) is left to the input mapper.
 */
import { type GameScreen, TOOL_IDS, type ToolId } from '@bayvox/core';
import type { PanelId } from './contract.ts';

export interface KeyInput {
  /** KeyboardEvent.code. */
  code: string;
  repeat: boolean;
  /** Ctrl, Meta or Alt held: browser shortcuts, never ours. */
  modified: boolean;
  /** What has focus: a button or link (Space and Enter press it), a form control, or nothing of ours. */
  target: 'button' | 'control' | 'other';
}

export interface KeyState {
  screen: GameScreen;
  panel: PanelId | null;
  /** An event card is open: it needs a choice, Escape does not dismiss it. */
  eventOpen: boolean;
  tool: ToolId | null;
}

export type KeyIntent =
  /** Handled by the browser or the UI control itself; only keep it from the game. */
  | { type: 'swallow' }
  | { type: 'closePanel' }
  | { type: 'togglePause' }
  /** Toolbar shortcut. `tool` null puts the active tool away. */
  | { type: 'selectTool'; tool: ToolId | null };

const DIGITS: Readonly<Record<string, number>> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };

/** Null: not ours, let the event through to the game. */
export function resolveKey(k: KeyInput, s: KeyState): KeyIntent | null {
  if (k.modified) return null;
  if (k.code === 'Escape') {
    if (s.panel !== null) return { type: 'closePanel' };
    // No panel: the input mapper turns Escape into tool.cancel.
    return s.screen === 'playing' && !s.eventOpen ? null : { type: 'swallow' };
  }
  // A focused slider owns its arrow keys; a focused button owns Space and Enter.
  if (k.target === 'control') return { type: 'swallow' };
  if (k.target === 'button' && (k.code === 'Space' || k.code === 'Enter')) return { type: 'swallow' };
  // Outside play, and under an event card, no key reaches the game.
  if (s.screen !== 'playing' || s.eventOpen) return { type: 'swallow' };
  if (k.code === 'Space') {
    // While a machine is possessed Space is the autopilot toggle of the drive bindings.
    if (s.tool === 'drive') return null;
    return k.repeat ? { type: 'swallow' } : { type: 'togglePause' };
  }
  const digit = DIGITS[k.code];
  if (digit !== undefined) {
    if (k.repeat) return { type: 'swallow' };
    const tool = TOOL_IDS[digit];
    return { type: 'selectTool', tool: s.tool === tool ? null : tool };
  }
  return null;
}
