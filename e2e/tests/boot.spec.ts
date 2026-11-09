import type { GameStats } from '@bayvox/core';
import { expect, test } from '@playwright/test';

/** WebGL renderer each project must report; a mismatch means the launch flags did not take effect. */
const EXPECTED_RENDERER: Record<string, RegExp> = {
  gpu: /ANGLE \(Apple, ANGLE Metal Renderer: Apple /,
  swgl: /SwiftShader/,
};

test('app boots, hook reports ready, canvas shows the clear colour', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await page.evaluate(() => window.__game.ready);

  const stats: GameStats = await page.evaluate(() => window.__game.stats());
  testInfo.annotations.push({ type: 'renderer', description: stats.renderer });
  console.log(`[${testInfo.project.name}] renderer: ${stats.renderer}`);
  const expected = EXPECTED_RENDERER[testInfo.project.name];
  if (expected === undefined) throw new Error(`no expected renderer for project ${testInfo.project.name}`);
  expect(stats.renderer).toMatch(expected);
  expect(stats).toMatchObject({ drawCalls: 0, triangles: 0, chunksLoaded: 0, chunksMeshed: 0, gpuBytes: 0, tick: 0, pendingCommands: 0 });

  const hash0 = await page.evaluate(() => window.__game.simHash());
  expect(hash0).toMatch(/^[0-9a-f]{16}$/);
  await page.evaluate(() => window.__game.command({ t: 'noop' }));
  expect(await page.evaluate(() => window.__game.stats().pendingCommands)).toBe(1);
  expect(await page.evaluate(() => window.__game.simHash())).not.toBe(hash0);

  // Centre pixel of the canvas is the clear colour (0.53, 0.72, 0.87) in 8-bit, within rounding.
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  const png = await page.screenshot({ clip: { x: viewport.width / 2, y: viewport.height / 2, width: 1, height: 1 } });
  const pixel = await page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
  }, png.toString('base64'));
  expect(Math.abs((pixel[0] as number) - 135)).toBeLessThanOrEqual(1);
  expect(Math.abs((pixel[1] as number) - 184)).toBeLessThanOrEqual(1);
  expect(Math.abs((pixel[2] as number) - 222)).toBeLessThanOrEqual(1);

  expect(errors).toEqual([]);
});
