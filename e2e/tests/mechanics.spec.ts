import type { CameraBookmark, GameStats, GameViewState } from '@bayvox/core';
import { expect, type Page, test } from '@playwright/test';
import { distinctColours, expectNoErrors, openSynthetic } from './helpers.ts';

const AIR = 0;

function view(page: Page): Promise<GameViewState> {
  return page.evaluate(() => {
    const v = window.__game.view?.();
    if (v === undefined) throw new Error('hook has no view()');
    return v;
  });
}

test('a scripted dig changes the voxel and the quad counters', async ({ page }, testInfo) => {
  const game = await openSynthetic(page, testInfo, 'hud=0');
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  // The centre of the screen looks at the middle of the map.
  const hit = await page.evaluate(
    ([x, y]) => window.__game.pick?.(x as number, y as number) ?? null,
    [viewport.width / 2, viewport.height / 2],
  );
  if (hit === null) throw new Error('pick at the screen centre hit nothing');
  const [x, y, z] = hit.voxel;
  expect(hit.material).not.toBe(AIR);
  expect(await page.evaluate(([vx, vy, vz]) => window.__game.getVoxel?.(vx as number, vy as number, vz as number), [x, y, z])).toBe(
    hit.material,
  );
  const before = await game.stats();
  await game.shot('dig-before');

  const dirty = await page.evaluate(
    ([vx, vy, vz]) => window.__game.dig?.({ x: vx as number, y: vy as number, z: vz as number }, 6),
    [x, y, z],
  );
  expect(dirty).toBeGreaterThan(0);
  await game.settled();
  const after = await game.stats();
  await game.shot('dig-after');

  expect(await page.evaluate(([vx, vy, vz]) => window.__game.getVoxel?.(vx as number, vy as number, vz as number), [x, y, z])).toBe(AIR);
  expect(after.quads).not.toBe(before.quads);
  expect(after.gpuBytes).not.toBe(before.gpuBytes);
  // The pick now lands on the bottom of the pit, deeper along the same ray.
  const again = await page.evaluate(
    ([px, py]) => window.__game.pick?.(px as number, py as number) ?? null,
    [viewport.width / 2, viewport.height / 2],
  );
  if (again === null) throw new Error('pick after the dig hit nothing');
  expect(again.voxel).not.toEqual(hit.voxel);
  expect(again.voxel[1]).toBeLessThan(y);
  expectNoErrors(game);
});

test('with the dig brush in hand a click digs at the cursor; hovering does not', async ({ page }, testInfo) => {
  const game = await openSynthetic(page, testInfo, 'hud=0');
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  const cx = Math.round(viewport.width / 2);
  const cy = Math.round(viewport.height / 2);
  const before = await game.stats();
  await page.mouse.move(cx, cy);
  await game.settled();
  // The hover box adds one draw call and changes no voxels.
  const hovering = await game.stats();
  expect(hovering.quads).toBe(before.quads);
  expect(hovering.drawCalls).toBe(before.drawCalls + 1);
  // Without a tool a click only belongs to the camera.
  await page.mouse.click(cx, cy);
  await game.settled();
  expect((await game.stats()).quads).toBe(before.quads);
  // G picks up the dig brush (packages/input TOOL_HOTKEYS).
  await page.keyboard.press('KeyG');
  await page.mouse.click(cx, cy);
  await game.settled();
  expect((await game.stats()).quads).not.toBe(before.quads);
  await game.shot('click-dig');
  expectNoErrors(game);
});

test('cut plane toggles by hook and shows a cap; no key moves it', async ({ page }, testInfo) => {
  const game = await openSynthetic(page, testInfo, 'hud=0');
  const plain = await game.shot('cut-off');
  const plainStats = await game.stats();
  expect(await view(page)).toMatchObject({ cut: false, xray: false });

  await page.evaluate(() => window.__game.setView?.({ cut: true, cutY: -12, cutRadius: 96 }));
  await game.settled();
  expect(await view(page)).toMatchObject({ cut: true, cutY: -12, cutRadius: 96 });
  const cut = await game.shot('cut-on');
  const cutStats = await game.stats();
  expect(cut.equals(plain)).toBe(false);
  // Exactly two more draws: the cap quad and the wall of the cut. Their textures are counted in GPU bytes.
  expect(cutStats.drawCalls).toBe(plainStats.drawCalls + 2);
  expect(cutStats.gpuBytes).toBeGreaterThan(plainStats.gpuBytes);
  expect(cutStats.quads).toBe(plainStats.quads);
  expect(await distinctColours(page, cut)).toBeGreaterThan(200);

  // The view is the game's to set: the keys that used to move the plane (] [ C) do nothing.
  for (const key of ['BracketRight', 'BracketLeft', 'KeyC']) await page.keyboard.press(key);
  expect(await view(page)).toMatchObject({ cut: true, cutY: -12 });
  await page.evaluate(() => window.__game.setView?.({ cutY: -11 }));
  expect((await view(page)).cutY).toBe(-11);
  await page.evaluate(() => window.__game.setView?.({ cut: false }));
  expect((await view(page)).cut).toBe(false);
  await game.settled();
  expect((await game.shot('cut-off-again')).equals(plain)).toBe(true);
  expect((await game.stats()).drawCalls).toBe(plainStats.drawCalls);

  await expect(page.evaluate(() => window.__game.setView?.({ cutRadius: 100_000 }))).rejects.toThrow(/cutRadius/);
  expectNoErrors(game);
});

test('x-ray shows the tunnel through the terrain', async ({ page }, testInfo) => {
  const game = await openSynthetic(page, testInfo, 'hud=0');
  const plain = await game.shot('xray-off');
  const plainStats = await game.stats();
  // No key for it any more: the game switches it on while a machine bores.
  await page.keyboard.press('KeyX');
  expect((await view(page)).xray).toBe(false);
  await page.evaluate(() => window.__game.setView?.({ xray: true }));
  expect((await view(page)).xray).toBe(true);
  await game.settled();
  const xray = await game.shot('xray-on');
  expect(xray.equals(plain)).toBe(false);
  // Terrain is drawn three times (depth, solids behind the first surface, ghost) and water is hidden.
  expect((await game.stats()).drawCalls).toBeGreaterThan(plainStats.drawCalls);
  await page.evaluate(() => window.__game.setView?.({ xray: false }));
  await game.settled();
  expect((await game.shot('xray-off-again')).equals(plain)).toBe(true);
  expectNoErrors(game);
});

/**
 * Counter budgets per project for the fixed path below on the synthetic world: measured once, with headroom
 * of about 5 percent. chunksLoaded is exact: every near-field slot inside the world, since the chunk store
 * can generate any chunk.
 * Re-measured 2026-11-10, when chunk meshes went from one draw each to batches of 4 x 16 x 4 chunks
 * (packages/render chunk-scene.ts; the second playtest measured 2,398 draw calls in the game against the 500
 * of docs/PLAN.md section 4.6). On this path the gpu project went from 420 budgeted draw calls to 31 measured,
 * and from 116,000 budgeted triangles to 140,275 measured: a batch is culled as a whole, so some of its
 * triangles are off screen. The draw-call budget came down with it; the triangle budget is the new measurement.
 */
const BUDGET: Record<string, { drawCalls: number; triangles: number; chunksLoaded: number; quads: number; gpuBytes: number }> = {
  gpu: { drawCalls: 34, triangles: 147_300, chunksLoaded: 1260, quads: 78_500, gpuBytes: 632_000 },
  swgl: { drawCalls: 17, triangles: 13_800, chunksLoaded: 96, quads: 6_900, gpuBytes: 59_500 },
};

test('a fixed camera path stays within counter budgets and is repeatable', async ({ page }, testInfo) => {
  const game = await openSynthetic(page, testInfo, 'hud=0');
  const budget = BUDGET[testInfo.project.name];
  if (budget === undefined) throw new Error(`no budget for project ${testInfo.project.name}`);
  // Path in world metres around the map centre: the start bookmark's target.
  const centre = await page.evaluate(() => {
    const hit = window.__game.pick?.(innerWidth / 2, innerHeight / 2);
    if (hit == null) throw new Error('no ground under the screen centre');
    return { x: hit.voxel[0], z: hit.voxel[2] };
  });
  const at = (dx: number, dy: number, dz: number, tx = 0, tz = 0): CameraBookmark => ({
    position: { x: centre.x + tx + dx, y: dy, z: centre.z + tz + dz },
    target: { x: centre.x + tx, y: 0, z: centre.z + tz },
  });
  const path: CameraBookmark[] = [
    at(120, 140, 160),
    at(-90, 60, 40, 30, -20),
    at(10, 220, 30, -40, 40),
    at(60, 45, -70, 20, 20),
    at(120, 140, 160),
  ];

  const run = async (label: string): Promise<GameStats[]> => {
    const out: GameStats[] = [];
    for (const [i, b] of path.entries()) {
      await page.evaluate((bm) => window.__game.setCamera?.(bm), b);
      await game.settled();
      out.push(await game.stats());
      if (label === 'first') await game.shot(`path-${i}`);
    }
    return out;
  };
  const first = await run('first');
  const peak = { drawCalls: 0, triangles: 0, chunksLoaded: 0, quads: 0, gpuBytes: 0 };
  for (const s of first) {
    peak.drawCalls = Math.max(peak.drawCalls, s.drawCalls);
    peak.triangles = Math.max(peak.triangles, s.triangles);
    peak.chunksLoaded = Math.max(peak.chunksLoaded, s.chunksLoaded);
    peak.quads = Math.max(peak.quads, s.quads ?? 0);
    peak.gpuBytes = Math.max(peak.gpuBytes, s.gpuBytes);
  }
  console.log(`[${testInfo.project.name}] camera path peak: ${JSON.stringify(peak)}`);
  expect(peak.drawCalls).toBeLessThanOrEqual(budget.drawCalls);
  expect(peak.triangles).toBeLessThanOrEqual(budget.triangles);
  expect(peak.chunksLoaded).toBeLessThanOrEqual(budget.chunksLoaded);
  expect(peak.quads).toBeLessThanOrEqual(budget.quads);
  expect(peak.gpuBytes).toBeLessThanOrEqual(budget.gpuBytes);

  // Frustum culling per batch of chunks: views that see less of the near field draw less (the overlay and sky draws stay).
  const draws = first.map((s) => s.drawCalls);
  expect(Math.min(...draws)).toBeLessThan(peak.drawCalls);
  expect(Math.min(...draws)).toBeGreaterThan(1);
  // The path ends where it started: counters return to the same values, and a second lap repeats the first.
  const pickCounters = (s: GameStats) => ({
    drawCalls: s.drawCalls,
    triangles: s.triangles,
    chunksLoaded: s.chunksLoaded,
    chunksMeshed: s.chunksMeshed,
    quads: s.quads,
    gpuBytes: s.gpuBytes,
  });
  expect(pickCounters(first[4] as GameStats)).toEqual(pickCounters(first[0] as GameStats));
  const second = await run('second');
  expect(second.map(pickCounters)).toEqual(first.map(pickCounters));
  expectNoErrors(game);
});

test('keys, drag and wheel move the camera; a drag does not dig', async ({ page }, testInfo) => {
  const game = await openSynthetic(page, testInfo, 'hud=0');
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  const cx = Math.round(viewport.width / 2);
  const cy = Math.round(viewport.height / 2);
  /** World voxel under a screen point, once the camera has come to rest. */
  const under = async (x: number, y: number): Promise<[number, number, number]> => {
    await game.settled();
    const hit = await page.evaluate(([px, py]) => window.__game.pick?.(px as number, py as number) ?? null, [x, y]);
    if (hit === null) throw new Error(`nothing under screen point (${x}, ${y})`);
    return hit.voxel;
  };
  const material = (v: [number, number, number]) =>
    page.evaluate(([x, y, z]) => window.__game.getVoxel?.(x as number, y as number, z as number), v);
  const start = await under(cx, cy);

  // W pans forward. The start view looks towards -z, so the ground under the centre moves to smaller z.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  const afterKey = await under(cx, cy);
  expect(afterKey[2]).toBeLessThan(start[2] - 2);

  // Dragging the ground to the right moves the view the other way: smaller x under the centre.
  const grabbed = await material(afterKey);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 6 });
  await page.mouse.up();
  const afterDrag = await under(cx, cy);
  expect(afterDrag[0]).toBeLessThan(afterKey[0] - 2);
  // The press and release were a drag, not a click: the voxel that was under the cursor is still there.
  expect(await material(afterKey)).toBe(grabbed);

  // Wheel up zooms in: two fixed screen points are closer together on the ground.
  const span = async (): Promise<number> => {
    const a = await under(cx - 40, cy);
    const b = await under(cx + 40, cy);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  };
  const wide = await span();
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -300);
  const narrow = await span();
  expect(narrow).toBeLessThan(wide * 0.9);
  await game.shot('after-input');
  expectNoErrors(game);
});

test('live mode: a bookmark key starts a smooth transition that comes to rest', async ({ page }, testInfo) => {
  // No freeze: the clock runs (water animates) and camera moves are animated.
  const game = await openSynthetic(page, testInfo, 'freeze=0&hud=0');
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  const centre = (): Promise<[number, number, number] | undefined> =>
    page.evaluate(([x, y]) => window.__game.pick?.(x as number, y as number)?.voxel, [viewport.width / 2, viewport.height / 2]);
  const start = await centre();
  const frames0 = (await game.stats()).frame ?? 0;
  await page.keyboard.press('Digit2');
  // Soon after the key the camera is on its way: the view centre has moved but has not arrived.
  await expect.poll(centre, { intervals: [20] }).not.toEqual(start);
  const mid = await centre();
  await game.settled();
  const end = await centre();
  expect(mid).not.toEqual(start);
  expect(end).not.toEqual(start);
  expect(mid).not.toEqual(end);
  // The loop kept drawing while the camera moved.
  expect(((await game.stats()).frame ?? 0) - frames0).toBeGreaterThan(3);
  await game.shot('bookmark-2');
  expectNoErrors(game);
});
