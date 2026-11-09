import type { GameTestHook } from '@bayvox/core';

declare global {
  interface Window {
    __game: GameTestHook;
  }
}
