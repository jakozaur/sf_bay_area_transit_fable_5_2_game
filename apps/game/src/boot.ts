/**
 * App boot for M0: a canvas, a WebGL2 clear colour, and the test hook.
 * The render, sim and input packages replace the internals; the hook contract (GameTestHook) stays.
 */
import { type Command, type GameStats, type GameTestHook, stableHashString } from '@bayvox/core';

/** Clear colour, linear 0..1 RGBA. Sky blue so a black canvas is recognisably a failure. */
export const CLEAR_COLOR: readonly [number, number, number, number] = [0.53, 0.72, 0.87, 1];

function rendererString(gl: WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name: unknown = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  if (typeof name !== 'string' || name === '') throw new Error('boot: WebGL returned no renderer string');
  return name;
}

export function boot(canvas: HTMLCanvasElement): GameTestHook {
  const pending: Command[] = [];
  let renderer = '';
  const tick = 0;

  const ready = new Promise<void>((resolve, reject) => {
    try {
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
      if (gl === null) throw new Error('boot: WebGL2 is not available in this browser');
      renderer = rendererString(gl);
      const draw = (): void => {
        const w = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
        const h = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
        gl.clearColor(...CLEAR_COLOR);
        gl.clear(gl.COLOR_BUFFER_BIT);
      };
      draw();
      addEventListener('resize', draw);
      requestAnimationFrame(() => {
        draw();
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });

  return {
    ready,
    stats(): GameStats {
      return {
        drawCalls: 0,
        triangles: 0,
        chunksLoaded: 0,
        chunksMeshed: 0,
        gpuBytes: 0,
        renderer,
        tick,
        pendingCommands: pending.length,
      };
    },
    // M0 has no sim: the hash covers the scenario-less empty state plus the queued commands,
    // so tests can already observe that commands arrive. packages/sim replaces this with Sim.hash().
    simHash(): string {
      return stableHashString(`m0|${tick}|${JSON.stringify(pending)}`);
    },
    command(c: Command): void {
      if (typeof c !== 'object' || c === null || typeof c.t !== 'string') {
        throw new TypeError(`__game.command: not a command: ${JSON.stringify(c)}`);
      }
      pending.push(c);
    },
  };
}
