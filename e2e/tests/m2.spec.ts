/**
 * M2 (Polish the Public Transport): any mission first, the backlash box, the specustawa, the Silicon branch and
 * the cost-benefit table, all through the interface. The hook is only read.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { GameSnapshot, PhaseView } from '@bayvox/sim';
import { expect, type Page, test } from '@playwright/test';
import { expectNoErrors, openGame, openTitle, type Session } from './helpers.ts';

const SHOTS = process.env.BAYVOX_SHOTS;

/** A screenshot into BAYVOX_SHOTS when that is set (the pictures of the M2 screens), nothing otherwise. */
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `m2-${name}.png`) });
}

function phase(s: GameSnapshot, id: PhaseView['id']): PhaseView {
  const ph = s.projects[0]?.phases.find((x) => x.id === id);
  if (ph === undefined) throw new Error(`the project has no ${id} phase`);
  return ph;
}

/** Draws the official alignment from the next-action button and puts the plan tool away. */
async function drawOfficial(page: Page, game: Session, close = true): Promise<void> {
  await page.getByTestId('next-action').click();
  await expect(page.getByTestId('toolpanel-plan')).toBeVisible();
  await page.getByTestId('cmd-plan.useOfficial').click();
  await expect.poll(async () => (await game.snapshot()).projects.length).toBe(1);
  if (close) await page.getByTestId('tool-close').click();
}

async function enact(page: Page, game: Session, branch: string, id: string): Promise<void> {
  await page.getByTestId(`branch-${branch}`).click();
  await page.getByTestId(`reform-head-${id}`).click();
  await page.getByTestId(`enact-${id}`).click();
  await expect.poll(async () => (await game.snapshot()).reforms.find((r) => r.id === id)?.status).toBe('enacted');
}

test('the last mission of the list can be played first on a fresh profile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'mission sites need the hardware renderer');
  const game = await openTitle(page, testInfo);
  await expect(page.locator('.bv-mission:disabled')).toHaveCount(0);
  // The last campaign mission (free build closes the list and was never locked).
  const ids = await page.locator('.bv-mission').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(ids.at(-1)).toBe('mission-sandbox');
  expect(ids.at(-2)).toBe('mission-oracle-shuttle');
  await page.getByTestId('mission-oracle-shuttle').click();
  await expect(page.getByTestId('screen-briefing')).toBeVisible();
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await game.settled();
  const s = await game.snapshot();
  expect(s.mission.id).toBe('oracle-shuttle');
  expect(s.mission.complete).toBe(false);
  await expect(page.getByTestId('session-error')).toHaveCount(0);
  expectNoErrors(game);
});

test('spending political capital draws a backlash post; a post closes, and close all clears the box', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the reform sheet needs the full-size viewport');
  const game = await openGame(page, testInfo);
  await expect(page.getByTestId('backlash')).toHaveCount(0);
  expect((await game.snapshot()).socialPosts ?? []).toHaveLength(0);
  await page.getByTestId('nav-reforms').click();
  const before = (await game.snapshot()).politicalCapital;
  await enact(page, game, 'design', 'twoTracks');
  const one = await game.snapshot();
  expect(one.politicalCapital).toBe(before - 15);
  expect(one.socialPosts).toHaveLength(1);
  const first = one.socialPosts?.[0];
  if (first === undefined) throw new Error('no post after spending capital');
  expect(first.cause).toBe('reform:twoTracks');
  const post = page.getByTestId(`post-${first.id}`);
  await expect(post).toBeVisible();
  await expect(post).toContainText(first.handle);
  await expect(post).toContainText(first.text);
  // The box stands beside the open sheet, not under it, and inside the window.
  const box = await page.getByTestId('backlash').boundingBox();
  const sheet = await page.getByTestId('panel-reforms').boundingBox();
  const viewport = page.viewportSize();
  if (box === null || sheet === null || viewport === null) throw new Error('no layout box');
  expect(box.x + box.width <= sheet.x || box.x >= sheet.x + sheet.width).toBe(true);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await shot(page, 'backlash-post');

  // Closing one post takes that post away, and the box with it when it was the only one.
  await page.getByTestId(`post-close-${first.id}`).click();
  await expect(post).toHaveCount(0);
  await expect(page.getByTestId('backlash')).toHaveCount(0);

  // Two more spends, two more posts; the closed one stays closed.
  await enact(page, game, 'design', 'twinBoreStandard');
  await enact(page, game, 'design', 'noMezzanines');
  const three = await game.snapshot();
  expect(three.socialPosts).toHaveLength(3);
  await expect(page.getByTestId('backlash').locator('li')).toHaveCount(2);
  await expect(post).toHaveCount(0);
  // A reform paid in cash only is not a spend of political capital: no post.
  await enact(page, game, 'tunnelling', 'groundInvestigation');
  expect((await game.snapshot()).socialPosts).toHaveLength(3);

  await page.getByTestId('backlash-close-all').click();
  await expect(page.getByTestId('backlash')).toHaveCount(0);
  // Closing is the player's, not the sim's: the posts are still in the snapshot.
  expect((await game.snapshot()).socialPosts).toHaveLength(3);
  expectNoErrors(game);
});

test('the specustawa takes the permit phases off the schedule and costs the most capital', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the reform sheet needs the full-size viewport');
  const game = await openGame(page, testInfo, 'mission=siliconBranch');
  await drawOfficial(page, game);
  const before = await game.snapshot();
  expect(phase(before, 'planning').plannedDays).toBeGreaterThan(300);
  expect(phase(before, 'permitting').plannedDays).toBeGreaterThan(300);
  const yearsBefore = before.projects[0]?.scorecard.yours.yearsToOpen ?? 0;

  await page.getByTestId('nav-reforms').click();
  await page.getByTestId('specustawa-call').click();
  await expect(page.getByTestId('reform-specustawa-note')).toContainText('zero time');
  // The dearest reform on the tree.
  const cost = before.reforms.find((r) => r.id === 'specustawa')?.cost.pc ?? 0;
  expect(cost).toBe(Math.max(...before.reforms.map((r) => r.cost.pc)));
  await page.getByTestId('enact-specustawa').click();
  await expect.poll(async () => (await game.snapshot()).reforms.find((r) => r.id === 'specustawa')?.status).toBe('enacted');

  const after = await game.snapshot();
  expect(after.politicalCapital).toBe(before.politicalCapital - cost);
  // One day each: the phase still ticks through, it takes no time on the calendar.
  expect(phase(after, 'planning').plannedDays).toBeLessThanOrEqual(1);
  expect(phase(after, 'permitting').plannedDays).toBeLessThanOrEqual(1);
  const yearsAfter = after.projects[0]?.scorecard.yours.yearsToOpen ?? 0;
  expect(yearsAfter).toBeLessThan(yearsBefore - 2);
  // Here it is what brings the timeline under the target.
  expect(before.projects[0]?.scorecard.polandTarget?.timeRatio).toBeGreaterThan(2);
  expect(after.projects[0]?.scorecard.polandTarget?.timeRatio).toBeLessThan(2);
  await expect(page.getByTestId('hud-target-time')).toHaveClass(/is-met/);
  // And the internet has opinions.
  await expect(page.getByTestId('backlash').locator('li')).toHaveCount(1);
  expect(after.socialPosts?.at(-1)?.cause).toBe('reform:specustawa');
  expectNoErrors(game);
});

test('the Silicon branch is on the list with its cost-benefit row, and it starts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the comparison sheet needs the full-size viewport');
  const game = await openTitle(page, testInfo);
  await expect(page.getByTestId('cost-benefit')).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, 'title-cost-benefit');
  // One row per campaign mission, each with a length, two prices, riders and a ratio.
  for (const id of ['the-portal', 'googleplex-spur', 'dumbarton-to-meta', 'siliconBranch', 'oracle-shuttle'])
    await expect(page.getByTestId(`cb-${id}`)).toContainText(/\d+\.\d km.*\$.*\$.*\d\.\d\d$/);
  const row = page.getByTestId('cb-siliconBranch');
  await expect(row).toContainText('17.0 km');
  // The table does not cover the mission list.
  const table = await page.getByTestId('cost-benefit').boundingBox();
  const mission = await page.getByTestId('mission-siliconBranch').boundingBox();
  const viewport = page.viewportSize();
  if (table === null || mission === null || viewport === null) throw new Error('no layout box');
  expect(table.x).toBeGreaterThanOrEqual(mission.x + mission.width);
  expect(table.x + table.width).toBeLessThanOrEqual(viewport.width);

  // The name in the table opens the briefing, like the list does.
  await row.getByRole('button').click();
  await expect(page.getByTestId('screen-briefing')).toBeVisible();
  await expect(page.getByTestId('brief-what')).toContainText('Meta');
  await expect(page.getByTestId('brief-what')).toContainText('Google');
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await game.settled();
  expect((await game.snapshot()).mission.id).toBe('siliconBranch');
  await drawOfficial(page, game);
  const s = await game.snapshot();
  expect(s.projects[0]?.lengthM).toBeGreaterThan(16_000);
  expect(s.projects[0]?.stations.length).toBe(4);
  expect(s.mission.targets.map((t) => t.name)).toEqual(expect.arrayContaining(['Meta, Menlo Park', 'Googleplex']));
  expect(s.mission.targets.every((t) => t.served)).toBe(true);
  await expect(page.getByTestId('hud-target')).toBeVisible();
  await page.waitForTimeout(1500);
  await game.settled();
  await shot(page, 'silicon-branch');
  expectNoErrors(game);
});

/** Reforms that fix the design and the contract prices, dearest effect first: they have to be in force at tender. */
const BEFORE_TENDER = [
  'specustawa',
  'twoTracks',
  'twinBoreStandard',
  'noMezzanines',
  'shallowBoxes',
  'bestValueAward',
  'inHouseEngineering',
  'itemizedContracts',
  'openTenders',
  'roundTheClock',
  'leanSupervision',
  'utilityStatute',
  'stationCatalogue',
  'rightSizeTerminal',
  'emergencyAward',
  'parallelWorks',
  'masterPermitting',
];
const AFTER_TENDER = ['stageGates', 'payBands', 'importSupplyChain', 'potholeFirst'];

/** Enacts, by clicks in the open reform sheet, every reform of `order` the capital in hand pays for. Returns the ids enacted. */
async function buy(page: Page, game: Session, order: readonly string[]): Promise<string[]> {
  const bought: string[] = [];
  for (const id of order) {
    const r = (await game.snapshot()).reforms.find((x) => x.id === id);
    if (r === undefined) throw new Error(`no reform ${id}`);
    if (r.status === 'enacted' || !r.affordable || r.status === 'locked') continue;
    await page.getByTestId(`branch-${r.branch}`).click();
    if ((await page.getByTestId(`enact-${id}`).count()) === 0) await page.getByTestId(`reform-head-${id}`).click();
    await page.getByTestId(`enact-${id}`).click();
    await expect.poll(async () => (await game.snapshot()).reforms.find((x) => x.id === id)?.status).toBe('enacted');
    bought.push(id);
  }
  return bought;
}

/** Runs the clock, answering event cards with the first option that can be afforded, until `done` holds. */
async function runUntil(page: Page, game: Session, done: (s: GameSnapshot) => boolean, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    const s = await game.snapshot();
    const event = s.events[0];
    if (event !== undefined) {
      await page.getByTestId('event-card').locator('button.bv-choice:not([disabled])').first().click();
      await expect.poll(async () => (await game.snapshot()).events.some((e) => e.uid === event.uid)).toBe(false);
      continue;
    }
    if (done(s)) return;
    if (Date.now() - t0 > timeoutMs)
      throw new Error(`runUntil: not done after ${timeoutMs} ms at ${s.date}: ${s.nextAction.kind}, ${s.nextAction.hint}`);
    await page.waitForTimeout(100);
  }
}

async function speed(page: Page, game: Session, x: 1 | 10 | 100): Promise<void> {
  await runUntil(page, game, () => true, 10_000);
  await page.getByTestId(`speed-${x}`).click();
}

test('The Portal meets the 2x Poland target with the specustawa and the Polish reforms, played by clicks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the full playthrough needs the hardware renderer');
  test.setTimeout(300_000);
  const game = await openTitle(page, testInfo);
  const next = page.getByTestId('next-action');
  await expect(page.getByTestId('title-target')).toContainText('2x');
  await page.getByTestId('mission-the-portal').click();
  await expect(page.getByTestId('brief-what')).toContainText('Fable 5.2');
  await page.waitForTimeout(1200);
  await shot(page, 'portal-briefing');
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await game.settled();
  await drawOfficial(page, game, false);
  // With nothing changed the cost is far over the target; the head start keeps the timeline inside it.
  const start = (await game.snapshot()).projects[0]?.scorecard.polandTarget;
  expect(start?.met).toBe(false);
  expect(start?.costRatio).toBeGreaterThan(10);
  await expect(page.getByTestId('hud-target-cost')).toHaveClass(/is-missed/);

  // ---- reforms before tender, the Polish design
  await page.getByTestId('nav-reforms').click();
  const early = await buy(page, game, BEFORE_TENDER);
  expect(early).toContain('specustawa');
  await page.getByTestId('panel-close').click();
  await page.getByTestId('open-design').click();
  await page.getByTestId('design-twinBore').click();
  await page.getByTestId('design-compactBox').click();
  await expect.poll(async () => (await game.snapshot()).projects[0]?.design.tunnel).toBe('twinBore');
  await page.getByTestId('panel-close').click();
  await page.getByTestId('tool-close').click();
  await shot(page, 'portal-after-reforms');

  // ---- approvals, tender, utilities
  await next.click();
  await runUntil(page, game, (s) => s.clock.hold === 'gate', 60_000);
  await page.getByTestId('gate-go').click();
  await speed(page, game, 100);
  await runUntil(page, game, (s) => s.nextAction.kind === 'launchTBM', 90_000);
  await page.getByTestId('gate-reforms').click();
  const late = await buy(page, game, [...BEFORE_TENDER, ...AFTER_TENDER]);
  await page.getByTestId('panel-close').click();

  // ---- build on autopilot, fit-out, open
  await page.getByTestId('gate-go').click();
  await expect.poll(async () => (await game.snapshot()).mission.stage).toBe('build');
  await speed(page, game, 100);
  await runUntil(page, game, (s) => s.nextAction.kind === 'openLine', 200_000);
  await next.click();
  await expect(page.getByTestId('screen-scorecard')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await shot(page, 'portal-scorecard');

  const p = (await game.snapshot()).projects[0];
  const target = p?.scorecard.polandTarget;
  if (p === undefined || target === undefined) throw new Error('no final scorecard');
  expect(p.scorecard.final).toBe(true);
  console.log(
    `[m2] Portal by clicks: cost ${target.costRatio.toFixed(2)}x, time ${target.timeRatio.toFixed(2)}x Poland, met ${target.met}; before tender: ${early.join(', ')}; later: ${late.join(', ')}; capital left ${(await game.snapshot()).politicalCapital}`,
  );
  expect(target.costRatio).toBeLessThanOrEqual(2);
  expect(target.timeRatio).toBeLessThanOrEqual(2);
  expect(target.met).toBe(true);
  await expect(page.getByTestId('score-target')).toContainText('2x Poland target: passed');
  expectNoErrors(game);
});
