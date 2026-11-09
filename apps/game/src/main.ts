import type { GameTestHook } from '@bayvox/core';
import { boot } from './boot.ts';

declare global {
  interface Window {
    __game: GameTestHook;
  }
}

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('main: canvas #game is missing from index.html');

window.__game = boot(canvas);
window.__game.ready.catch((err: unknown) => {
  console.error('boot failed:', err);
  document.body.textContent = `Boot failed: ${err instanceof Error ? err.message : String(err)}`;
});
