import { writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { expectNoErrors, openGame } from './helpers.ts';

/** requestAnimationFrame cadence over one second: what the player sees, capped by the display. */
function rafCadence(page: Page): Promise<{ frames: number; meanMs: number }> {
  return page.evaluate(
    () =>
      new Promise<{ frames: number; meanMs: number }>((resolve) => {
        const start = performance.now();
        let frames = 0;
        const tick = (now: number): void => {
          frames++;
          if (now - start >= 1000) resolve({ frames, meanMs: (now - start) / frames });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

// Wall-clock numbers are reported, never gated (doc 10 section 8.4); software GL timings mean nothing.
test('frame time on the real data: downtown and the whole Bay', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'timing is only meaningful on the hardware GPU project');
  // Live clock, so every animation frame really draws (the water moves) and the cadence below is a drawn one.
  const game = await openGame(page, testInfo, 'freeze=0&hud=0');
  // Navigation start to the first fully streamed and drawn view, through the Vite dev server (unbundled modules).
  const firstViewMs = Math.round(await page.evaluate(() => performance.now()));
  const measure = async () => {
    const stats = await game.stats();
    // Synchronous draw + gl.finish per frame: CPU and driver cost of one frame without vsync.
    const bench = await page.evaluate(() => window.__game.benchFrames?.(300));
    if (bench === undefined) throw new Error('hook has no benchFrames()');
    return {
      chunksLoaded: stats.chunksLoaded,
      chunksMeshed: stats.chunksMeshed,
      quads: stats.quads,
      columnQuads: stats.columnQuads,
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      gpuBytes: stats.gpuBytes,
      bench,
      raf: await rafCadence(page),
    };
  };
  const downtown = await measure();
  await page.keyboard.press('Digit4');
  await game.settled();
  const bay = await measure();
  const report = { renderer: (await game.stats()).renderer, viewport: page.viewportSize(), firstViewMs, downtown, bay };
  writeFileSync(testInfo.outputPath('perf.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[gpu] perf: ${JSON.stringify(report)}`);
  expect(downtown.bench.frames).toBe(300);
  expect(downtown.chunksMeshed).toBeGreaterThan(256);
  expectNoErrors(game);
});
