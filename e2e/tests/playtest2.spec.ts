/**
 * Regressions from the second playtest of round 2 (2026-11-10), in the real game with real clicks and keys.
 * The hook is read to assert what the screen shows and, where a test needs a state hours of play away, to
 * get there (commands and stepSim); the thing under test is always done with the mouse or the keyboard.
 * The playthrough in play.spec.ts covers the rest of that playtest: the gate cards, the twin-bore standard,
 * price tags that match the click, reforms after tender, the draw-call budget, the dig brush.
 */
import type { GameSnapshot } from '@bayvox/sim';
import { expect, type Page, test } from '@playwright/test';
import { expectNoErrors, openGame, project, type Session } from './helpers.ts';

// The interface is laid out for a desktop window; the software-GL project runs 320 x 240.
test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'interface tests run on the gpu project');
});

function command(page: Page, c: Record<string, unknown>): Promise<void> {
  return page.evaluate((x) => window.__game.command(x as never), c);
}

function stepSim(page: Page, days: number): Promise<void> {
  return page.evaluate((n) => {
    const step = window.__game.stepSim;
    if (step === undefined) throw new Error('hook has no stepSim()');
    step.call(window.__game, n);
  }, days);
}

/** Dollars of a compact figure of the interface: "$3.14B/km" is 3.14e9. */
function dollars(text: string | null): number {
  const m = /\$([\d.]+)([KMBT]?)/.exec(text ?? '');
  if (m === null) throw new Error(`no dollar figure in "${text}"`);
  const scale = { '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2] as '' | 'K' | 'M' | 'B' | 'T'];
  return Number(m[1]) * scale;
}

async function officialPlan(page: Page): Promise<void> {
  await page.keyboard.press('Digit1');
  await page.getByTestId('cmd-plan.useOfficial').click();
  await expect(page.getByTestId('readout-length')).toContainText('km');
}

/** Screen position of the ground over a plan position, for a click that the tools pick as that spot. */
async function onScreen(page: Page, x: number, z: number): Promise<{ x: number; y: number }> {
  const ground = await page.evaluate(([px, pz]) => window.__game.services?.()?.world.groundAt(px as number, pz as number) ?? 0, [x, z]);
  const p = await project(page, { x, y: ground, z });
  const viewport = page.viewportSize();
  if (p === null || viewport === null || p.x < 0 || p.y < 100 || p.x > viewport.width || p.y > viewport.height - 80)
    throw new Error(`(${x}, ${z}) is not on the free part of the screen: ${JSON.stringify(p)}`);
  return p;
}

async function distance(page: Page): Promise<number> {
  const cam = await page.evaluate(() => window.__game.camera?.());
  if (cam === undefined) throw new Error('hook has no camera()');
  return Math.hypot(cam.position.x - cam.target.x, cam.position.y - cam.target.y, cam.position.z - cam.target.z);
}

test('an approved line cannot be clicked into a hairpin, and what goes to tender is buildable', async ({ page }, testInfo) => {
  const game: Session = await openGame(page, testInfo);
  await officialPlan(page);
  await page.keyboard.press('Escape');
  await page.getByTestId('next-action').click();
  await expect.poll(async () => (await game.snapshot()).projects[0]?.status).toBe('active');
  // Approving puts the drawing tools away: their panels have nothing more to say.
  await expect(page.getByTestId('toolpanel-plan')).toHaveCount(0);
  const before = await game.snapshot();
  const wps = before.projects[0]?.waypoints ?? [];
  const last = wps[wps.length - 1];
  const prev = wps[wps.length - 2];
  if (last === undefined || prev === undefined) throw new Error('the official plan has no waypoints');
  // The stray click of the report: a waypoint beside the terminal, doubling back on the line.
  const len = Math.hypot(prev.x - last.x, prev.z - last.z);
  const back = { x: (prev.x - last.x) / len, z: (prev.z - last.z) / len };
  const stray = { x: last.x + back.x * 160 - back.z * 110, z: last.z + back.z * 160 + back.x * 110 };
  await page.keyboard.press('Digit1');
  await expect(page.getByTestId('toolpanel-plan')).toBeVisible();
  const at = await onScreen(page, stray.x, stray.z);
  await page.mouse.click(at.x, at.y);
  // The sim refuses it and the tool says so, with the reason.
  await expect(page.getByTestId('tool-hint')).toContainText(/refused.*approved.*buildable/, { timeout: 5000 });
  const after = await game.snapshot();
  expect(after.projects[0]?.waypoints).toHaveLength(wps.length);
  expect(after.projects[0]?.checks.ok).toBe(true);
  expect(after.projects[0]?.lengthM).toBe(before.projects[0]?.lengthM);
  await expect(page.getByTestId('readout-problem')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Through permitting to the gate (the clock is frozen in this spec: the calendar is stepped through the hook).
  for (let i = 0; i < 60 && (await game.snapshot()).projects[0]?.awaiting !== 'advancePhase'; i++) await stepSim(page, 10);
  await expect(page.getByTestId('next-action')).toHaveText('Go to tender');
  await page.getByTestId('gate-go').click();
  await expect.poll(async () => (await game.snapshot()).projects[0]?.designFrozen).toBe(true);
  const tendered = await game.snapshot();
  expect(tendered.projects[0]?.checks.ok).toBe(true);
  expect(tendered.projects[0]?.waypoints).toHaveLength(wps.length);
  await page.screenshot({ path: testInfo.outputPath('approved-line.png') });
  expectNoErrors(game);
});

test('depth costs money: the whole line at 80 m is dearer than at 20 m, and a trench that deep is refused', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo);
  await officialPlan(page);
  const cost = async (): Promise<number> => (await game.snapshot()).projects[0]?.receipt.columns.yours.costCents ?? 0;
  const poland = async (): Promise<number> => (await game.snapshot()).projects[0]?.receipt.columns.poland.costCents ?? 0;
  const official = await cost();
  const depthAll = async (m: number): Promise<void> => {
    const before = await cost();
    await page.getByTestId('opt-plan.depthM').fill(String(m));
    await page.getByTestId('cmd-plan.depthAll').click();
    await expect.poll(cost).not.toBe(before);
  };
  // The official plan is cut-and-cover at both ends: 80 m down that is not a trench any more, and the panel says so.
  await depthAll(80);
  await expect(page.getByTestId('readout-problem')).toContainText('cut-and-cover');
  await expect(page.getByTestId('readout-problem')).toContainText('bore or mine it');
  expect(await cost()).toBeGreaterThan(official);
  await page.screenshot({ path: testInfo.outputPath('deep-trench.png') });
  // As twin bores (the reforms by command, the design and the depth by mouse): deeper is dearer, for Poland too.
  await command(page, { t: 'enactReform', id: 'twoTracks' });
  await command(page, { t: 'enactReform', id: 'twinBoreStandard' });
  await page.getByTestId('open-design').click();
  await page.getByTestId('design-twinBore').click();
  await expect.poll(async () => (await game.snapshot()).projects[0]?.design.tunnel).toBe('twinBore');
  await page.getByTestId('panel-close').click();
  const at80 = await cost();
  const polandAt80 = await poland();
  await depthAll(20);
  const at20 = await cost();
  expect(at80).toBeGreaterThan(at20 * 1.1);
  expect(polandAt80).toBeGreaterThan(await poland());
  expect(dollars(await page.getByTestId('readout-cost').textContent())).toBeCloseTo(at20 / 100, -8);
  // The stations went down and came back up with the line.
  expect((await game.snapshot()).projects[0]?.stations.every((s) => s.depthM < 40)).toBe(true);
  expectNoErrors(game);
});

test('the station tool prices every type and proposes the one the official plan builds at the place', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo);
  await officialPlan(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Digit2');
  await expect(page.getByTestId('toolpanel-station')).toBeVisible();
  // A price on every type before anything is clicked: the report was six types and no price.
  for (const t of ['undergroundStandard', 'undergroundDeepMined', 'terminalFitOut', 'inBore', 'surface', 'elevated'])
    await expect(page.getByTestId(`opt-detail-station.template-${t}`)).toContainText(/^\+\$[\d.]+[MB], \d+ months$/);
  await expect(page.getByTestId('readout-price')).toContainText('$');
  // The depth slider shows the depth of the line, not 0 m.
  expect(Number((await game.snapshot()).projects.length)).toBe(1);
  await expect(page.getByTestId('opt-value-station.depthM')).not.toHaveText('0 m');
  // Take the official stations off, then hover the line inside the ring of the Transit Center.
  for (const s of (await game.snapshot()).projects[0]?.stations ?? []) await page.getByTestId(`remove-station-${s.id}`).click();
  await expect.poll(async () => (await game.snapshot()).projects[0]?.stations.length).toBe(0);
  const p = (await game.snapshot()).projects[0];
  const wps = p?.waypoints ?? [];
  const last = wps[wps.length - 1];
  const prev = wps[wps.length - 2];
  if (last === undefined || prev === undefined) throw new Error('no line');
  const len = Math.hypot(prev.x - last.x, prev.z - last.z);
  const spot = await onScreen(page, last.x + ((prev.x - last.x) / len) * 75, last.z + ((prev.z - last.z) / len) * 75);
  await page.mouse.move(spot.x, spot.y);
  await expect(page.getByTestId('opt-station.template-terminalFitOut')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-hint')).toContainText('the type the official plan builds here');
  await page.screenshot({ path: testInfo.outputPath('station-proposal.png') });
  await page.mouse.click(spot.x, spot.y);
  await expect.poll(async () => (await game.snapshot()).projects[0]?.stations.length).toBe(1);
  const placed = (await game.snapshot()).projects[0]?.stations[0];
  expect(placed?.template).toBe('terminalFitOut');
  expect(placed?.name).toBe('Salesforce Transit Center');
  // The cursor has not moved: the panel says "placed", not a red "Too close to" the station just placed.
  await expect(page.getByTestId('tool-hint')).toContainText('Salesforce Transit Center is placed');
  await expect(page.getByTestId('toolpanel-station').locator('.bv-bad')).toHaveCount(0);
  expectNoErrors(game);
});

test('a deep link to a mission on another site looks at that mission, and a place has its plate clear of the bars', async ({
  page,
}, testInfo) => {
  const game = await openGame(page, testInfo, 'mission=googleplex-spur');
  await officialPlan(page);
  const snap: GameSnapshot = await game.snapshot();
  const first = snap.projects[0]?.waypoints[0];
  if (first === undefined) throw new Error('no official line');
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  // The start of the line (Mountain View station) is on screen: the boot view was of downtown San Francisco.
  const at = await project(page, { x: first.x, y: 0, z: first.z });
  expect(at).not.toBeNull();
  expect(at?.x).toBeGreaterThan(0);
  expect(at?.x).toBeLessThan(viewport.width);
  expect(at?.y).toBeGreaterThan(0);
  expect(at?.y).toBeLessThan(viewport.height);
  await page.screenshot({ path: testInfo.outputPath('googleplex-deep-link.png') });
  expectNoErrors(game);
});

test('names on the map stay readable: clear of the toolbar, and of the notices when they come', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo, 'freeze=0');
  await expect(page.getByTestId('map-label-0')).toBeVisible();
  const toolbar = await page.getByTestId('toolbar').boundingBox();
  if (toolbar === null) throw new Error('no toolbar');
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const id of ['map-label-0', 'map-label-1']) {
    const plate = await page.getByTestId(id).boundingBox();
    if (plate === null) throw new Error(`${id} has no box`);
    // "4th and King" used to sit half under the toolbar in this view.
    expect(overlap(plate, toolbar), `${id} under the toolbar`).toBe(false);
    expect(plate.y).toBeGreaterThan(96);
  }
  // Three reforms at once: three notices. They stand in one column and none of them covers a plate.
  await officialPlan(page);
  await page.keyboard.press('Escape');
  for (const id of ['twoTracks', 'twinBoreStandard', 'shallowBoxes']) await command(page, { t: 'enactReform', id });
  await expect(page.locator('.bv-toast')).toHaveCount(3);
  await page.waitForTimeout(400);
  const toasts = await page.locator('.bv-toast').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  expect(new Set(toasts.map((t) => Math.round(t.x))).size).toBe(1);
  expect(new Set(toasts.map((t) => Math.round(t.width))).size).toBe(1);
  for (const id of ['map-label-0', 'map-label-1']) {
    const plate = await page.getByTestId(id).boundingBox();
    if (plate === null) continue;
    for (const t of toasts) expect(overlap(plate, t), `${id} under a notice`).toBe(false);
  }
  await page.screenshot({ path: testInfo.outputPath('labels-and-notices.png') });
  expectNoErrors(game);
});

test('the Views menu closes like a menu, and the wheel does not take the map camera into empty sea', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo, 'freeze=0');
  await page.getByTestId('views').click();
  await expect(page.getByTestId('views-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('views-menu')).toHaveCount(0);
  // Picking up a tool closes it too, and so does a click on the map.
  await page.getByTestId('views').click();
  await page.keyboard.press('Digit3');
  await expect(page.getByTestId('views-menu')).toHaveCount(0);
  await expect(page.getByTestId('toolpanel-dig')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('views').click();
  await page.mouse.click(300, 400);
  await expect(page.getByTestId('views-menu')).toHaveCount(0);
  // Over the Pacific, in the south-west corner of the map: no voxel site, nothing to see from 50 m.
  await page.evaluate(() =>
    window.__game.setCamera?.({ position: { x: 3000, y: 6000, z: -90_000 }, target: { x: 3000, y: 0, z: -94_000 } }),
  );
  await page.mouse.move(640, 400);
  for (let i = 0; i < 16; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(1500);
  expect(await distance(page)).toBeGreaterThanOrEqual(1499);
  // Back over the site the street-level zoom is there again.
  await page.getByTestId('views').click();
  await page.getByTestId('view-mission').click();
  await page.waitForTimeout(1500);
  await page.mouse.move(640, 400);
  for (let i = 0; i < 16; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(1500);
  expect(await distance(page)).toBeLessThan(200);
  expectNoErrors(game);
});
