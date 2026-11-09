/**
 * Entry point. The implementations behind the app are chosen in ./seam.ts (world and mesher: one line each);
 * this file only parses the URL, starts the shell and publishes the test hook.
 */
import type { GameTestHook } from '@bayvox/core';
import { startGame } from './game.ts';
import { parseParams } from './params.ts';

declare global {
  interface Window {
    __game: GameTestHook;
  }
}

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('main: canvas #game is missing from index.html');

window.__game = startGame(canvas, parseParams(location.search));
