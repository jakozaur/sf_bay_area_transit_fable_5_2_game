/**
 * The game played the way a player plays it: real clicks and key presses on the interface, nothing sent
 * through __game.command. The hook is only read (snapshot, entities, camera) to assert what the screen shows.
 * Screenshots of every step go to the test output directory, and to BAYVOX_SHOTS when that is set.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { GameSnapshot, TbmView } from '@bayvox/sim';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { expectNoErrors, openGame, openTitle, type Session } from './helpers.ts';

const SHOTS = process.env.BAYVOX_SHOTS;

function shooter(page: Page, testInfo: TestInfo, prefix: string): (name: string) => Promise<void> {
  let n = 0;
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true });
  return async (name) => {
    n++;
    const file = `${prefix}-${String(n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: testInfo.outputPath(file) });
    if (SHOTS !== undefined) await page.screenshot({ path: path.join(SHOTS, file) });
  };
}

function entities(page: Page) {
  return page.evaluate(() => {
    const read = window.__game.entities;
    if (read === undefined) throw new Error('hook has no entities()');
    return read.call(window.__game);
  });
}

async function machine(game: Session): Promise<TbmView> {
  const t = (await game.snapshot()).projects[0]?.tbms[0];
  if (t === undefined) throw new Error('the project has no machine');
  return t;
}

/** Answers event cards as they come up (first option that can be afforded) until `done` holds. Returns the card ids answered. */
async function playUntil(page: Page, game: Session, done: (s: GameSnapshot) => boolean, timeoutMs: number): Promise<string[]> {
  const answered: string[] = [];
  const t0 = Date.now();
  for (;;) {
    const s = await game.snapshot();
    if (s.events.length > 0) {
      const card = page.getByTestId('event-card');
      await expect(card).toBeVisible();
      const event = s.events[0];
      if (event === undefined) continue;
      answered.push(event.id);
      await card.locator('button.bv-choice:not([disabled])').first().click();
      // The card is gone (another may follow at once at 100x: it has another uid).
      await expect.poll(async () => (await game.snapshot()).events.some((e) => e.uid === event.uid)).toBe(false);
      continue;
    }
    if (done(s)) return answered;
    if (Date.now() - t0 > timeoutMs)
      throw new Error(`playUntil: not done after ${timeoutMs} ms at ${s.date}: ${s.nextAction.kind}, ${s.nextAction.hint}`);
    await page.waitForTimeout(100);
  }
}

/** Presses a speed button. An event card may be up (it stops the clock and covers the bar): it is answered first. */
async function setSpeed(page: Page, game: Session, speed: 1 | 10 | 100, answered: string[]): Promise<void> {
  answered.push(...(await playUntil(page, game, () => true, 10_000)));
  await page.getByTestId(`speed-${speed}`).click();
}

test('the title screen boots over the whole Bay with the mission list', async ({ page }, testInfo) => {
  const game = await openTitle(page, testInfo);
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Polish the\s*Public Transport/);
  await expect(page.getByTestId('tagline')).toHaveText('Can you build a train to the HQ of the authors of Fable 5.2?');
  await expect(page).toHaveTitle('Polish the Public Transport');
  await expect(page.getByTestId('title-play')).toBeEnabled();
  // Every mission can be picked on a fresh profile: no ordering, no lock.
  for (const id of ['the-portal', 'googleplex-spur', 'dumbarton-to-meta', 'siliconBranch', 'sandbox'])
    await expect(page.getByTestId(`mission-${id}`)).toBeEnabled();
  await expect(page.locator('.bv-mission:disabled')).toHaveCount(0);
  await expect(page.getByTestId('title-continue')).toHaveCount(0);
  // No debug panel by default, and the map behind is the regional view: no voxels shown from that far.
  await expect(page.locator('.lil-gui')).toHaveCount(0);
  expect((await game.stats()).voxelsShown).toBe(false);
  expect((await game.snapshot()).tick).toBe(0);
  await page.getByTestId('title-credits').click();
  await expect(page.getByTestId('credits')).toContainText('OpenStreetMap');
  await shooter(page, testInfo, 'title')('title-credits');
  expectNoErrors(game);
});

test('The Portal played start to finish with mouse and keyboard', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the full playthrough needs the hardware renderer');
  test.setTimeout(300_000);
  const game = await openTitle(page, testInfo);
  const shot = shooter(page, testInfo, 'portal');
  const next = page.getByTestId('next-action');

  // ---- title, briefing
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await page.waitForTimeout(600);
  await shot('title');
  await page.getByTestId('mission-the-portal').click();
  await expect(page.getByTestId('screen-briefing')).toBeVisible();
  await expect(page.getByTestId('brief-cost')).toContainText('$6.84 billion');
  await expect(page.getByTestId('brief-objectives').locator('li')).toHaveCount(6);
  await page.waitForTimeout(1500);
  await shot('briefing');
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await expect(page.getByTestId('objective-hint')).toContainText('official alignment');
  await game.settled();
  await shot('mission-start');

  // ---- plan: the official alignment in one click
  await expect(next).toHaveText('Draw the alignment');
  await next.click();
  await expect(page.getByTestId('toolpanel-plan')).toBeVisible();
  await page.getByTestId('cmd-plan.useOfficial').click();
  await expect(page.getByTestId('readout-length')).toContainText('2.09 km');
  await expect(page.getByTestId('headline-ratio')).toContainText(/^\d+(\.\d+)?x$/);
  const statusQuoRatio = (await game.snapshot()).headline?.ratio ?? 0;
  expect(statusQuoRatio).toBeGreaterThan(10);
  await shot('official-alignment');

  // ---- design: twin bore is locked behind a reform and says which
  await page.getByTestId('open-design').click();
  await expect(page.getByTestId('panel-design')).toBeVisible();
  await expect(page.getByTestId('design-lock-twinBore')).toContainText('Two tracks are enough');
  await expect(page.getByTestId('design-price-twinBore')).toContainText('$');
  await shot('design-locked');
  await page.getByTestId('design-unlock-twoTracks').click();
  await expect(page.getByTestId('panel-reforms')).toBeVisible();
  // The link opened the reform tree on the reform that unlocks the design, already expanded.
  await expect(page.getByTestId('branch-design')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('reform-preview-twoTracks')).toBeVisible();
  await shot('reform-two-tracks');
  const pcBefore = (await game.snapshot()).politicalCapital;
  await page.getByTestId('enact-twoTracks').click();
  await expect.poll(async () => (await game.snapshot()).reforms.find((r) => r.id === 'twoTracks')?.status).toBe('enacted');
  expect((await game.snapshot()).politicalCapital).toBeLessThan(pcBefore);
  // The third track is gone, the twin bore is still locked: the standard must allow two small tubes. That reform
  // is the one that buys the Polish tunnel (it was a trap: a free click in the chooser did what it sold for 20).
  await page.getByTestId('reform-head-twinBoreStandard').click();
  await expect(page.getByTestId('reform-preview-twinBoreStandard')).toBeVisible();
  const offered = (await game.snapshot()).reforms.find((r) => r.id === 'twinBoreStandard')?.preview;
  if (offered === null || offered === undefined) throw new Error('the twin-bore standard has no preview');
  // The reform screen holds time, so the preview is a forecast run: what it promises is what enacting does.
  expect(offered.exact).toBe(true);
  expect(offered.costDeltaCents).toBeLessThan(-1e10);
  await page.getByTestId('enact-twinBoreStandard').click();
  await expect.poll(async () => (await game.snapshot()).reforms.find((r) => r.id === 'twinBoreStandard')?.status).toBe('enacted');
  expect((await game.snapshot()).headline?.yoursPerKmCents).toBe(offered.costPerKmAfterCents);
  await page.getByTestId('panel-close').click();
  await page.getByTestId('open-design').click();
  await expect(page.getByTestId('design-lock-twinBore')).toHaveCount(0);
  // Four tunnel methods, one opening date: the chooser says the stations set it.
  await expect(page.getByTestId('design-time-twinBore')).toContainText('they set the date');
  const tag = (await game.snapshot()).projects[0]?.design.options.find((o) => o.id === 'twinBore')?.costCents;
  await page.getByTestId('design-twinBore').click();
  await expect.poll(async () => (await game.snapshot()).projects[0]?.design.tunnel).toBe('twinBore');
  // The price tag of the option was the estimate with it chosen, to the cent.
  expect((await game.snapshot()).projects[0]?.receipt.columns.yours.costCents).toBe(tag);
  // The reform and the Polish design moved the headline: the ratio is computed, not a constant.
  const designedRatio = (await game.snapshot()).headline?.ratio ?? 0;
  expect(designedRatio).toBeLessThan(statusQuoRatio - 1);
  await shot('design-twin-bore');
  await page.getByTestId('panel-close').click();
  await page.getByTestId('tool-close').click();

  // ---- approvals: time-lapse, gates, event cards
  await expect(next).toHaveText('Approve the project');
  await next.click();
  await expect.poll(async () => (await game.snapshot()).mission.stage).toBe('approvals');
  await page.waitForTimeout(700);
  await shot('approvals-lapse');
  const events: string[] = [];
  events.push(...(await playUntil(page, game, (s) => s.clock.hold === 'gate', 30_000)));
  await expect(page.getByTestId('hud-hold')).toBeVisible();
  await expect(next).toHaveText('Go to tender');
  // The gate is a decision with a card: what tender fixes, where the project stands, what the capital in hand buys.
  await expect(page.getByTestId('gate-card')).toBeVisible();
  await expect(page.getByTestId('gate-what')).toContainText('contract prices');
  await expect(page.getByTestId('gate-estimate')).toContainText('$');
  await shot('gate-tender');
  // "Look around first" puts the card away; the button in the strip still goes through the gate.
  await page.getByTestId('gate-later').click();
  await expect(page.getByTestId('gate-card')).toHaveCount(0);
  await next.click();
  await setSpeed(page, game, 10, events);
  events.push(...(await playUntil(page, game, (s) => s.nextAction.kind === 'launchTBM', 60_000)));
  // A gate is not arrived at in fast forward: the game is back at 1x by itself.
  await expect(page.getByTestId('speed-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(next).toHaveText('Launch the TBM');
  await expect(page.getByTestId('gate-card')).toBeVisible();
  // The contracts were let at tender: a procurement reform now changes nothing here, and the screen says why
  // before the capital is spent. (The second playtest halved the price at this gate with banked capital.)
  await page.getByTestId('gate-reforms').click();
  await page.getByTestId('branch-procurement').click();
  await page.getByTestId('reform-head-bestValueAward').click();
  await expect(page.getByTestId('reform-notes-bestValueAward')).toContainText('let at tender');
  expect((await game.snapshot()).reforms.find((r) => r.id === 'bestValueAward')?.preview?.costDeltaCents).toBe(0);
  await page.getByTestId('panel-close').click();
  await page.getByTestId('nav-project').click();
  await expect(page.getByTestId('phase-utilities')).toBeVisible();
  await shot('gate-launch');
  await page.getByTestId('panel-close').click();

  // ---- build: launch from the card, the camera goes to the machine
  await page.getByTestId('gate-go').click();
  await expect.poll(async () => (await game.snapshot()).mission.stage).toBe('build');
  await expect.poll(async () => (await entities(page)).possessedTbmId, { timeout: 10_000 }).not.toBeNull();
  await page.waitForTimeout(2500);
  await shot('launched-watching');
  const launched = await machine(game);
  expect(launched.method).toBe('boredTwin');
  expect(launched.laterals).toHaveLength(2);

  // ---- drive by hand: W for thrust, hold D to steer right, the machine leaves the plan
  await expect(next).toHaveText('Drive the machine');
  await next.click();
  await expect(page.getByTestId('drive-hud')).toBeVisible();
  await expect(page.getByTestId('drive-autopilot')).toHaveText('Manual');
  const start = await machine(game);
  expect(start.driven).toBe(true);
  expect(start.autopilot).toBe(false);
  const stripAtStart = await page.getByTestId('drive-hud').boundingBox();
  const drawnStart = (await entities(page)).tbms[0];
  for (let i = 0; i < 4; i++) await page.keyboard.press('KeyW');
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await machine(game)).steer).toBe(1);
  await page.waitForTimeout(6000);
  await shot('driving-steer-right');
  await page.keyboard.up('KeyD');
  const steered = await machine(game);
  expect(steered.boredM).toBeGreaterThan(start.boredM + 5);
  expect(steered.deviation.lateralM).toBeGreaterThan(0.3);
  expect(steered.yaw).not.toBeCloseTo(start.yaw, 3);
  const drawnSteered = (await entities(page)).tbms[0];
  if (drawnStart === undefined || drawnSteered === undefined) throw new Error('no machine is drawn');
  expect(Math.hypot(drawnSteered.x - drawnStart.x, drawnSteered.z - drawnStart.z)).toBeGreaterThan(5);
  await expect(page.getByTestId('drive-deviation')).not.toHaveText('0.0');
  // The instrument strip does not change width or slide sideways as its numbers change.
  const stripNow = await page.getByTestId('drive-hud').boundingBox();
  expect(stripNow?.x).toBe(stripAtStart?.x);
  expect(stripNow?.width).toBe(stripAtStart?.width);
  // Off the plan the strip says what a metre costs here.
  if ((await machine(game)).deviation.offPlan) await expect(page.getByTestId('drive-price')).toContainText('% per metre');
  // Pitch up with R: the grade rises towards its limit.
  await page.keyboard.down('KeyR');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyR');
  expect((await machine(game)).gradePct).toBeGreaterThan(steered.gradePct);
  // Lining and track follow the machine.
  expect((await entities(page)).rings).toBeGreaterThan(0);

  // ---- autopilot: Space hands it back, the cruise law returns to the plan
  await page.keyboard.press('Space');
  await expect.poll(async () => (await machine(game)).autopilot).toBe(true);
  await expect(page.getByTestId('drive-autopilot')).toHaveText('Autopilot');
  await setSpeed(page, game, 10, events);
  await page.waitForTimeout(5000);
  await shot('autopilot-10x');
  expect(Math.abs((await machine(game)).deviation.lateralM)).toBeLessThan(Math.abs(steered.deviation.lateralM));
  await setSpeed(page, game, 100, events);
  events.push(...(await playUntil(page, game, (s) => (s.projects[0]?.tbms[0]?.progress ?? 0) > 0.5, 120_000)));
  await setSpeed(page, game, 10, events);
  await page.waitForTimeout(1500);
  await shot('half-way');
  await setSpeed(page, game, 100, events);

  // ---- breakthrough
  events.push(...(await playUntil(page, game, (s) => s.projects[0]?.tbms.every((t) => t.status === 'done') === true, 120_000)));
  // The game drops back to 1x by itself for the moment, with the banner up and the ground seen through.
  await expect(page.getByTestId('banner')).toContainText('Breakthrough');
  await expect(page.getByTestId('speed-1')).toHaveAttribute('aria-pressed', 'true');
  expect((await page.evaluate(() => window.__game.view?.()))?.xray).toBe(true);
  // Three terrain passes under x-ray, and still inside the draw-call budget (2,398 were measured here before).
  await game.settled();
  expect((await game.stats()).drawCalls).toBeLessThanOrEqual(500);
  const through = await game.snapshot();
  expect(through.feed.some((f) => f.kind === 'breakthrough')).toBe(true);
  expect(through.projects[0]?.tbms[0]?.breakthroughTick).toBeGreaterThan(0);
  // A card raised on the same day would cover the banner: answer it, then look.
  events.push(...(await playUntil(page, game, () => true, 10_000)));
  await page.waitForTimeout(500);
  await shot('breakthrough');

  // ---- fit-out as a time-lapse, then open the line
  await setSpeed(page, game, 100, events);
  events.push(...(await playUntil(page, game, (s) => s.nextAction.kind === 'openLine', 120_000)));
  await expect(next).toHaveText('Open the line');
  // The x-ray of the breakthrough goes off again by itself, a few real seconds after the banner.
  await expect.poll(async () => (await page.evaluate(() => window.__game.view?.()))?.xray, { timeout: 15_000 }).toBe(false);
  await shot('ready-to-open');
  await next.click();
  await expect(page.getByTestId('banner')).toContainText('Line open');
  // Notices stand below the banner, not over it.
  const bannerBox = await page.getByTestId('banner').boundingBox();
  const toastBox = await page.getByTestId('toasts').boundingBox();
  if (bannerBox !== null && toastBox !== null && toastBox.height > 0)
    expect(toastBox.y).toBeGreaterThanOrEqual(bannerBox.y + bannerBox.height - 1);
  await expect.poll(async () => (await entities(page)).trains.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(2500);
  await shot('line-open-train');
  // A train runs: its drawn position changes.
  const t1 = (await entities(page)).trains[0];
  await page.waitForTimeout(3000);
  const t2 = (await entities(page)).trains[0];
  if (t1 === undefined || t2 === undefined) throw new Error('no train is drawn');
  expect(Math.hypot(t2.x - t1.x, t2.z - t1.z)).toBeGreaterThan(10);
  expect((await game.snapshot()).ridersPerDay).toBeGreaterThan(1000);
  expect((await game.stats()).drawCalls).toBeLessThanOrEqual(500);

  // ---- scorecard
  await expect(page.getByTestId('screen-scorecard')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await shot('scorecard');
  const final = await game.snapshot();
  const p = final.projects[0];
  if (p === undefined) throw new Error('no project in the final snapshot');
  expect(final.mission.complete).toBe(true);
  expect(p.scorecard.final).toBe(true);
  expect(p.scorecard.yours.costCents).toBeGreaterThan(1e11);
  expect(p.scorecard.ghost.costCents).toBe(684_000_000_000);
  expect(p.scorecard.poland.costCents).toBeGreaterThan(1e10);
  await expect(page.getByTestId('score-col-yours')).toContainText(/\$\d+(\.\d+)?B/);
  await expect(page.getByTestId('score-col-poland')).toContainText(/\$\d+M/);
  // The Bay Area vs Poland ratio on the card is the model's: the receipt columns divide to it.
  const ratio = p.receipt.ratios.yoursToPoland;
  expect(ratio).toBeCloseTo(p.receipt.columns.yours.costPerKmCents / p.receipt.columns.poland.costPerKmCents, 6);
  expect(ratio).toBeGreaterThan(1.5);
  expect(ratio).toBeLessThan(statusQuoRatio);
  await expect(page.getByTestId('score-verdict')).toContainText(`${ratio.toFixed(1)} times`);
  await expect(page.getByTestId('receipt-line-priceLevel')).toBeVisible();
  await expect(page.getByTestId('receipt-reform-done-twoTracks').first()).toBeVisible();
  // At least one event card came up on the way and was answered by a click.
  console.log(
    `[${testInfo.project.name}] opened ${final.date}, $${(p.scorecard.yours.costCents / 1e11).toFixed(2)}B, ${ratio.toFixed(1)}x Poland, events: ${events.join(', ')}`,
  );
  expect(events.length).toBeGreaterThan(0);

  // ---- next mission is unlocked; keep playing returns to the open line
  // The rating says which axis holds it down.
  if (p.scorecard.stars < 3) await expect(page.getByTestId('score-stars-reason')).toContainText('weakest of the three');
  await expect(page.getByTestId('score-next')).toBeEnabled();
  await page.getByTestId('score-keep').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  // The x-ray of the train ride is the game's, not the player's for good: it goes off by itself.
  await expect.poll(async () => (await page.evaluate(() => window.__game.view?.()))?.xray, { timeout: 15_000 }).toBe(false);
  await page.waitForTimeout(1000);
  await shot('keep-playing');
  await page.getByTestId('nav-receipt').click();
  await expect(page.getByTestId('receipt-table')).toBeVisible();
  await shot('receipt');
  await page.getByTestId('panel-close').click();
  await page.getByTestId('nav-menu').click();
  await page.getByTestId('menu-missions').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await expect(page.getByTestId('mission-googleplex-spur')).toBeEnabled();
  await expect(page.getByTestId('title-continue')).toBeVisible();
  await page.waitForTimeout(1200);
  await shot('title-unlocked');
  expectNoErrors(game);
});

test('free build: an alignment drawn by clicking on the map gets a cost estimate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'drawing on the map needs the full-size viewport');
  const game = await openTitle(page, testInfo);
  const shot = shooter(page, testInfo, 'free');
  await page.getByTestId('mission-sandbox').click();
  await expect(page.getByTestId('screen-briefing')).toBeVisible();
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await game.settled();
  expect((await game.snapshot()).mission.freeBuild).toBe(true);

  // Key 1 picks up the plan tool; four clicks on the map are four waypoints.
  await page.keyboard.press('Digit1');
  await expect(page.getByTestId('toolpanel-plan')).toBeVisible();
  const clicks: [number, number][] = [
    [620, 300],
    [700, 380],
    [780, 430],
    [860, 520],
  ];
  for (const [x, y] of clicks) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(150);
  }
  await expect.poll(async () => (await game.snapshot()).projects[0]?.waypoints.length).toBe(4);
  const length = await page.getByTestId('readout-length').textContent();
  expect(length).toMatch(/\d+(\.\d+)? km/);
  await expect(page.getByTestId('readout-cost')).toContainText('$');
  await expect(page.getByTestId('readout-ratio')).toContainText(/\d+(\.\d+)?x/);
  await expect(page.getByTestId('headline-ratio')).toContainText(/^\d+(\.\d+)?x$/);
  const drawn = (await game.snapshot()).projects[0];
  if (drawn === undefined) throw new Error('no project after drawing');
  expect(drawn.lengthM).toBeGreaterThan(1000);
  expect(drawn.receipt.columns.yours.costCents).toBeGreaterThan(0);
  expect(drawn.receipt.columns.poland.costCents).toBeGreaterThan(0);
  await shot('drawn');

  // Dragging a handle moves the waypoint; a right click on a handle deletes it.
  const before = drawn.waypoints[1];
  if (before === undefined) throw new Error('waypoint 2 is missing');
  await page.mouse.move(700, 380);
  await page.mouse.down();
  await page.mouse.move(720, 330, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const w = (await game.snapshot()).projects[0]?.waypoints[1];
      return w === undefined ? 0 : Math.hypot(w.x - before.x, w.z - before.z);
    })
    .toBeGreaterThan(100);
  await page.mouse.click(780, 430, { button: 'right' });
  await expect.poll(async () => (await game.snapshot()).projects[0]?.waypoints.length).toBe(3);
  // The depth slider of the line: every waypoint goes down, the estimate follows.
  await page.keyboard.press('Period');
  await shot('edited');
  await page.getByTestId('cmd-plan.finish').click();
  await expect(page.getByTestId('toolpanel-plan')).toHaveCount(0);
  await expect(page.getByTestId('objective-hint')).toContainText('station');
  expectNoErrors(game);
});

test('save, reload the page, continue: the same game comes back', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'covered on the hardware renderer');
  test.setTimeout(120_000);
  const game = await openTitle(page, testInfo);
  const shot = shooter(page, testInfo, 'save');
  await page.getByTestId('title-play').click();
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.getByTestId('next-action').click();
  await page.getByTestId('cmd-plan.useOfficial').click();
  await page.getByTestId('tool-close').click();
  await page.getByTestId('next-action').click();
  // Dig a hole by hand while the approvals run: key 3 is the dig brush.
  await page.keyboard.press('Digit3');
  await expect(page.getByTestId('toolpanel-dig')).toBeVisible();
  await game.settled();
  // From the mission overview a 3 m brush is a few pixels, and most of the map is drawn as 4 m columns that show
  // no hole: the brush refuses, says why, and bills nothing. (The second playtest paid $40M for holes nobody saw.)
  await page.mouse.move(470, 500);
  for (let i = 0; i < 3; i++) await page.mouse.click(470, 500);
  await page.mouse.move(640, 380);
  for (let i = 0; i < 3; i++) await page.mouse.click(640, 380);
  await expect(page.getByTestId('tool-hint')).toContainText(/Zoom in to dig|Too far from the middle of the view/);
  expect((await game.snapshot()).handDig.volumeM3).toBe(0);
  // Zoom in on the spot with the wheel, then dig: the voxels go, the money goes, and the hole is on screen.
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(1200);
  await game.settled();
  const ground = await page.evaluate(() => window.__game.pick?.(640, 380) ?? null);
  if (ground === null) throw new Error('nothing to dig at (640, 380)');
  expect(ground.material).toBeGreaterThan(1);
  const clip = { x: 540, y: 300, width: 200, height: 160 };
  await page.mouse.move(900, 600);
  await game.settled();
  const intact = await page.screenshot({ clip });
  await page.mouse.move(640, 380);
  for (let i = 0; i < 4; i++) {
    await page.mouse.click(640, 380);
    await page.waitForTimeout(150);
  }
  await expect.poll(async () => (await game.snapshot()).handDig.volumeM3).toBeGreaterThan(0);
  await page.mouse.move(900, 600);
  await game.settled();
  await page.waitForTimeout(300);
  const dug = await page.screenshot({ clip });
  expect(dug.equals(intact)).toBe(false);
  await shot('dug');
  const [hx, hy, hz] = ground.voxel;
  const voxelAt = (): Promise<number | undefined> =>
    page.evaluate(([x, y, z]) => window.__game.getVoxel?.(x as number, y as number, z as number), [hx, hy, hz]);
  expect(await voxelAt()).toBe(0);
  await page.keyboard.press('Escape');
  await playUntil(page, game, (s) => s.clock.hold === 'gate', 30_000);
  // At the gate time stands still: what is saved is what is on screen.
  await page.getByTestId('nav-menu').click();
  await page.getByTestId('menu-save').click();
  await expect(page.getByTestId('toasts')).toContainText(/[Ss]aved/);
  const saved = await game.snapshot();
  const hash = await page.evaluate(() => window.__game.simHash());
  await shot('saved');

  await page.reload();
  await page.evaluate(() => window.__game.ready);
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await expect(page.getByTestId('title-save')).toContainText('The Portal');
  // With the Continue button and the save line in the sheet, the last mission of the list is still above the footer.
  const lastMission = await page.getByTestId('mission-sandbox').boundingBox();
  const footer = await page.locator('.bv-title-foot').boundingBox();
  if (lastMission === null || footer === null) throw new Error('the title sheet has no mission list or no footer');
  expect(lastMission.y + lastMission.height).toBeLessThanOrEqual(footer.y + 1);
  await shot('title-continue');
  await page.getByTestId('title-continue').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  const loaded = (await page.evaluate(() => window.__game.snapshot?.())) as GameSnapshot;
  expect(await page.evaluate(() => window.__game.simHash())).toBe(hash);
  expect(loaded.date).toBe(saved.date);
  expect(loaded.moneyCents).toBe(saved.moneyCents);
  expect(loaded.handDig.volumeM3).toBe(saved.handDig.volumeM3);
  expect(loaded.projects[0]?.phase).toBe(saved.projects[0]?.phase);
  await expect(page.getByTestId('next-action')).toHaveText('Go to tender');
  // The hand-dug hole is back in the voxels.
  expect(await voxelAt()).toBe(0);
  await page.evaluate(() => window.__game.settled?.());
  await shot('loaded');

  // Restart from the menu: day one again, the plan is gone.
  await page.getByTestId('nav-menu').click();
  await page.getByTestId('menu-restart').click();
  await page.getByTestId('menu-restart-confirm').click();
  await expect.poll(async () => ((await page.evaluate(() => window.__game.snapshot?.())) as GameSnapshot).projects.length).toBe(0);
  const fresh = (await page.evaluate(() => window.__game.snapshot?.())) as GameSnapshot;
  expect(fresh.tick).toBe(0);
  expect(fresh.handDig.volumeM3).toBe(0);
  // A restart discards the hand digs: the ground is whole again.
  expect(await voxelAt()).toBe(ground.material);
  // And looks at the mission again, not at wherever the camera had been taken (300 m over a hole, or 20 m down beside a machine).
  await expect
    .poll(async () => {
      const cam = await page.evaluate(() => window.__game.camera?.());
      if (cam === undefined) return 0;
      return Math.hypot(cam.position.x - cam.target.x, cam.position.y - cam.target.y, cam.position.z - cam.target.z);
    })
    .toBeGreaterThan(1200);
  expectNoErrors(game);
});

test('deep link: ?mission= starts a mission in play without the title screen', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo);
  await expect(page.getByTestId('topbar')).toBeVisible();
  await expect(page.getByTestId('screen-title')).toHaveCount(0);
  expect((await game.snapshot()).mission.id).toBe('the-portal');
  expectNoErrors(game);
});
