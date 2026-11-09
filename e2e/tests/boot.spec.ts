import { lonLatToWorld } from '@bayvox/core';
import { expect, type Page, test } from '@playwright/test';
import { colourAt, colourStats, expectNoErrors, openGame, project } from './helpers.ts';

/** WebGL renderer each project must report; a mismatch means the launch flags did not take effect. */
const EXPECTED_RENDERER: Record<string, RegExp> = {
  gpu: /ANGLE \(Apple, ANGLE Metal Renderer: Apple /,
  swgl: /SwiftShader/,
};

// Material ids (packages/core materials.ts).
const AIR = 0;
const WATER = 1;
const BAY_MUD = 3;
const ROAD = 10;
const GRASS = 11;
const BUILDING_TOWER = 17;
const BUILDING_TRANSIT = 18;

function voxel(page: Page, x: number, y: number, z: number): Promise<number | undefined> {
  return page.evaluate(([vx, vy, vz]) => window.__game.getVoxel?.(vx as number, vy as number, vz as number), [x, y, z]);
}

test('boots on the real map data: downtown San Francisco is voxels', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo);
  const stats = await game.stats();
  console.log(`[${testInfo.project.name}] renderer: ${stats.renderer}`);
  const expected = EXPECTED_RENDERER[testInfo.project.name];
  if (expected === undefined) throw new Error(`no expected renderer for project ${testInfo.project.name}`);
  expect(stats.renderer).toMatch(expected);

  // Near field of voxel chunks plus the column tiers (far raster and city).
  expect(stats.quads).toBeGreaterThan(1000);
  // The software project runs coarser tiers (helpers.ts): 512 m far cells and 32 m city cells.
  expect(stats.columnQuads).toBeGreaterThan(testInfo.project.name === 'gpu' ? 1_000_000 : 50_000);
  expect(stats.voxelsShown).toBe(true);
  expect(stats.chunksLoaded).toBeGreaterThan(0);
  expect(stats.chunksMeshed).toBeGreaterThan(10);
  expect(stats.chunksMeshed).toBeLessThanOrEqual(stats.chunksLoaded);
  expect(stats.drawCalls).toBeGreaterThan(10);
  expect(stats.triangles).toBeGreaterThan(10_000);
  expect(stats.gpuBytes).toBeGreaterThanOrEqual(((stats.quads ?? 0) + (stats.columnQuads ?? 0)) * 8);
  expect(stats.frame).toBeGreaterThan(0);
  // The clock is frozen: the sim exists and sits at day 0.
  expect(stats).toMatchObject({ tick: 0, pendingCommands: 0 });
  console.log(
    `[${testInfo.project.name}] boot counters: ${JSON.stringify({ ...stats, renderer: undefined })}, first view ${Math.round(await page.evaluate(() => performance.now()))} ms`,
  );

  // Real places, as voxels (world metres, UTM 10N minus the grid origin; y is NAVD88 metres).
  // Salesforce Tower: glass from the street to above 300 m, sky above the 326 m roof.
  expect(await voxel(page, 20609, 150, -66161)).toBe(BUILDING_TOWER);
  expect(await voxel(page, 20609, 310, -66161)).toBe(BUILDING_TOWER);
  expect(await voxel(page, 20609, 345, -66161)).toBe(AIR);
  // Salesforce Transit Center, east end.
  expect(await voxel(page, 20667, 10, -66152)).toBe(BUILDING_TRANSIT);
  // The Bay east of the Embarcadero: water to sea level (1 m), mud on the bed.
  expect(await voxel(page, 22109, 0, -66217)).toBe(WATER);
  expect(await voxel(page, 22109, 1, -66217)).toBe(AIR);
  expect(await voxel(page, 22109, -24, -66217)).toBe(BAY_MUD);
  // Market Street at 4th is asphalt on top; the outfield of the ballpark is grass.
  expect(await voxel(page, 19840, 11, -65736)).toBe(ROAD);
  expect(await voxel(page, 19840, 12, -65736)).toBe(AIR);
  expect(await voxel(page, 21298, 3, -64947)).toBe(GRASS);

  // The debug HUD is up and shows the counters and the sim.
  await expect(page.locator('.lil-gui.lil-root')).toBeVisible();
  await expect(page.locator('.lil-gui .lil-controller', { hasText: 'quads' })).toHaveCount(1);
  await expect(page.locator('.lil-gui .lil-controller', { hasText: 'speed' })).toHaveCount(1);
  expectNoErrors(game);
});

test('default view: downtown from the south, the Bay on the right', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo, 'hud=0');
  const png = await game.shot('downtown');
  const all = await colourStats(page, png);
  // A city, not a blank or black canvas.
  expect(all.distinct).toBeGreaterThan(testInfo.project.name === 'gpu' ? 1000 : 150);
  expect(all.black).toBeLessThan(0.02);
  // North is up and the camera looks north: the Bay is east of downtown, so the right edge is water and the
  // left half is city.
  const right = await colourStats(page, png, [0.9, 0.3, 1, 0.7]);
  const left = await colourStats(page, png, [0, 0.3, 0.5, 0.9]);
  expect(right.blue).toBeGreaterThan(0.8);
  expect(left.blue).toBeLessThan(0.3);
  // The Transit Center is north of 4th and King: it projects above it on screen.
  const stc = await project(page, { ...lonLatToWorld(-122.3966, 37.7897), y: 5 });
  const king = await project(page, { ...lonLatToWorld(-122.3947, 37.7765), y: 5 });
  if (stc === null || king === null) throw new Error('the Transit Center or 4th and King is behind the camera');
  expect(stc.y).toBeLessThan(king.y - 20);
  // The screen centre is the ground between 4th and King and the Transit Center, within the voxel near field.
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  const hit = await page.evaluate(
    ([x, y]) => window.__game.pick?.(x as number, y as number) ?? null,
    [viewport.width / 2, viewport.height / 2],
  );
  if (hit === null) throw new Error('pick at the screen centre hit nothing');
  expect(Math.abs(hit.voxel[0] - 20736)).toBeLessThan(150);
  expect(Math.abs(hit.voxel[2] + 65442)).toBeLessThan(150);
  expectNoErrors(game);
});

test('zooming out shows the whole Bay with the rail network, and coming back restores the city', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo, 'hud=0');
  const city = await game.shot('city-before');
  const cityStats = await game.stats();

  const viewportHeight = page.viewportSize()?.height ?? 0;
  // Bookmark 4 is the regional view.
  await page.keyboard.press('Digit4');
  await game.settled();
  const bayStats = await game.stats();
  const png = await game.shot('bay');
  const all = await colourStats(page, png);
  expect(all.black).toBeLessThan(0.02);
  // Known places land where the camera says they should, in the right colour (3 px around each point).
  const at = async (lat: number, lon: number) => colourAt(page, png, { ...lonLatToWorld(lon, lat), y: 0 }, 3);
  // Water: the Pacific off Half Moon Bay, the Bay between San Mateo and Hayward, San Pablo Bay.
  expect((await at(37.45, -122.56)).blue).toBeGreaterThan(0.9);
  expect((await at(37.62, -122.25)).blue).toBeGreaterThan(0.9);
  expect((await at(38.02, -122.4)).blue).toBeGreaterThan(0.9);
  // Hills: the Santa Cruz Mountains west of Palo Alto, the Diablo Range east of Fremont, Marin.
  expect((await at(37.33, -122.25)).green).toBeGreaterThan(0.6);
  expect((await at(37.5, -121.8)).green).toBeGreaterThan(0.6);
  expect((await at(37.93, -122.6)).green).toBeGreaterThan(0.6);
  // The Santa Clara Valley floor around San Jose is neither.
  const valley = await at(37.36, -121.95);
  expect(valley.blue + valley.green).toBeLessThan(0.3);
  // North is up and east is right: Marin projects above and left of San Jose.
  const marin = await project(page, { ...lonLatToWorld(-122.6, 37.93), y: 0 });
  const sanJose = await project(page, { ...lonLatToWorld(-121.89, 37.33), y: 0 });
  if (marin === null || sanJose === null) throw new Error('Marin or San Jose is behind the camera');
  expect(marin.y).toBeLessThan(sanJose.y - viewportHeight / 2);
  expect(marin.x).toBeLessThan(sanJose.x);
  // Voxel chunks and the city tier are not drawn from this far; the data is kept.
  expect(cityStats.voxelsShown).toBe(true);
  expect(bayStats.voxelsShown).toBe(false);
  expect(bayStats.columnQuads).toBe(cityStats.columnQuads);
  expect(bayStats.quads).toBe(cityStats.quads);

  await page.keyboard.press('Digit1');
  await game.settled();
  expect((await game.shot('city-after')).equals(city)).toBe(true);
  expect((await game.stats()).drawCalls).toBe(cityStats.drawCalls);
  expectNoErrors(game);
});

test('frozen frames are pixel-stable', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo, 'hud=0');
  const a = await game.shot('stable-a');
  await page.waitForTimeout(300);
  const b = await game.shot('stable-b');
  expect(a.equals(b)).toBe(true);
  expectNoErrors(game);
});

test('digging works on the real world: the voxel goes, the mesh changes', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo, 'hud=0');
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  const centre = [viewport.width / 2, viewport.height / 2];
  const hit = await page.evaluate(([x, y]) => window.__game.pick?.(x as number, y as number) ?? null, centre);
  if (hit === null) throw new Error('pick at the screen centre hit nothing');
  const [x, y, z] = hit.voxel;
  expect(hit.material).not.toBe(AIR);
  const before = await game.stats();
  await page.evaluate(([vx, vy, vz]) => window.__game.dig?.({ x: vx as number, y: vy as number, z: vz as number }, 6), [x, y, z]);
  await game.settled();
  expect(await voxel(page, x, y, z)).toBe(AIR);
  expect((await game.stats()).quads).not.toBe(before.quads);
  await game.shot('dig');
  expectNoErrors(game);
});
