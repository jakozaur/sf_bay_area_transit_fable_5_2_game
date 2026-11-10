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

const ui = document.getElementById('ui');
if (ui === null) throw new Error('main: #ui is missing from index.html');
const params = parseParams(location.search);
// The interface carries its own attribution line; the bare canvas keeps the one in the page.
if (params.hud) document.body.classList.add('has-ui');

window.__game = startGame(canvas, params, ui);
