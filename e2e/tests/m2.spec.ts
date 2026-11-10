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

/** The Enact button of a reform in the open sheet: on its row, in the one list or under the folded "No effect" group. */
async function enactButton(page: Page, id: string) {
  const button = page.getByTestId(`enact-${id}`);
  if ((await button.count()) === 0) await page.getByTestId('reforms-noeffect').click();
  return button;
}

async function enact(page: Page, game: Session, id: string): Promise<void> {
  await (await enactButton(page, id)).click();
  await expect.poll(async () => (await game.snapshot()).reforms.find((r) => r.id === id)?.status).toBe('enacted');
}

test('the last mission of the list can be played first on a fresh profile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'mission sites need the hardware renderer');
  const game = await openTitle(page, testInfo);
  await expect(page.locator('.bv-mission:disabled')).toHaveCount(0);
  // The last campaign mission (free build closes the list and was never locked).
  const ids = await page.locator('.bv-mission').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(ids.at(-1)).toBe('mission-sandbox');
  const last = ids.at(-2);
  if (last === null || last === undefined) throw new Error('the mission list has no campaign mission');
  expect(last).not.toContain('oracle');
  await page.getByTestId(last).click();
  await expect(page.getByTestId('screen-briefing')).toBeVisible();
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await game.settled();
  const s = await game.snapshot();
  expect(`mission-${s.mission.id}`).toBe(last);
  expect(s.mission.complete).toBe(false);
  await expect(page.getByTestId('session-error')).toHaveCount(0);
  expectNoErrors(game);
});

test('spending political capital draws a pile-on; a post closes, and close all clears the box', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the reform sheet needs the full-size viewport');
  const game = await openGame(page, testInfo);
  await expect(page.getByTestId('backlash')).toHaveCount(0);
  expect((await game.snapshot()).socialPosts ?? []).toHaveLength(0);
  await page.getByTestId('nav-reforms').click();
  const before = (await game.snapshot()).politicalCapital;
  // One list, no tabs.
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.locator('[data-testid^="branch-"]')).toHaveCount(0);
  await enact(page, game, 'twinBoreStandard');
  const one = await game.snapshot();
  expect(one.politicalCapital).toBe(before - 40);
  // One spend, one pile-on: 2 to 4 posts from different handles, all about that spend.
  const burst = one.socialPosts ?? [];
  expect(burst.length).toBeGreaterThanOrEqual(2);
  expect(burst.length).toBeLessThanOrEqual(4);
  expect(new Set(burst.map((p) => p.handle)).size).toBe(burst.length);
  expect(new Set(burst.map((p) => p.burst)).size).toBe(1);
  for (const p of burst) expect(p.cause).toBe('reform:twinBoreStandard');
  // They arrive one after another; in the end each is on screen with its handle and text.
  for (const p of burst) {
    const post = page.getByTestId(`post-${p.id}`);
    await expect(post).toBeVisible();
    await expect(post).toContainText(p.handle);
    await expect(post).toContainText(p.text);
  }
  await expect(page.getByTestId('backlash-angry')).toContainText(/[\d,]+ people are angry at you/);
  // The box stands beside the open sheet, not under it, and inside the window.
  const box = await page.getByTestId('backlash').boundingBox();
  const sheet = await page.getByTestId('panel-reforms').boundingBox();
  const viewport = page.viewportSize();
  if (box === null || sheet === null || viewport === null) throw new Error('no layout box');
  expect(box.x + box.width <= sheet.x || box.x >= sheet.x + sheet.width).toBe(true);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await shot(page, 'backlash-post');

  // Closing one post takes that post away and leaves the rest.
  const first = burst[0];
  if (first === undefined) throw new Error('no post after spending capital');
  const post = page.getByTestId(`post-${first.id}`);
  await page.getByTestId(`post-close-${first.id}`).click();
  await expect(post).toHaveCount(0);
  await expect(page.getByTestId('backlash').locator('li')).toHaveCount(burst.length - 1);

  // Two more spends, two more pile-ons; the closed post stays closed.
  await enact(page, game, 'stationCatalogue');
  await enact(page, game, 'roundTheClock');
  const three = (await game.snapshot()).socialPosts ?? [];
  expect(new Set(three.map((p) => p.burst)).size).toBe(3);
  expect(three.length).toBeGreaterThanOrEqual(6);
  expect(three.length).toBeLessThanOrEqual(12);
  await expect(page.getByTestId(`post-${three.at(-1)?.id}`)).toBeVisible();
  await expect(post).toHaveCount(0);
  // The posts are people shouting about their own lives: none of them names the game's currency.
  const shown = await page.getByTestId('backlash').locator('li').allTextContents();
  expect(shown.length).toBeGreaterThan(0);
  for (const text of [...shown, ...three.map((p) => `${p.handle} ${p.text}`)]) expect(text).not.toMatch(/political capital|\bPC\b|points/i);
  // Political capital is the only price of a reform: none costs cash.
  expect((await game.snapshot()).reforms.every((r) => r.cost.cents === 0 && r.prereqs.length === 0)).toBe(true);
  expect((await game.snapshot()).politicalCapital).toBe(before - 40 - 30 - 20);

  await page.getByTestId('backlash-close-all').click();
  await expect(page.getByTestId('backlash')).toHaveCount(0);
  // Closing is the player's, not the sim's: the posts are still in the snapshot.
  expect((await game.snapshot()).socialPosts).toHaveLength(three.length);
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
  await expect(page.getByTestId('specustawa-call')).toHaveCount(0);
  await page.getByTestId('reform-head-specustawa').click();
  await expect(page.getByTestId('reform-body-specustawa')).toContainText('planning and permitting take no time');
  // The dearest reform on the list.
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
  const pileOn = (await game.snapshot()).socialPosts ?? [];
  expect(pileOn.length).toBeGreaterThanOrEqual(2);
  expect(pileOn.length).toBeLessThanOrEqual(4);
  for (const p of pileOn) expect(p.cause).toBe('reform:specustawa');
  await expect(page.getByTestId('backlash').locator('li')).toHaveCount(pileOn.length);
  expectNoErrors(game);
});

test('the Silicon branch is on the list with its cost-benefit row, and it starts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the comparison sheet needs the full-size viewport');
  const game = await openTitle(page, testInfo);
  await expect(page.getByTestId('cost-benefit')).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, 'title-cost-benefit');
  // One row per campaign mission, each with a length, two prices, riders and a ratio.
  for (const id of ['the-portal', 'googleplex-spur', 'dumbarton-to-meta', 'siliconBranch'])
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
  expect(s.projects[0]?.stations.length).toBe(5);
  expect(s.mission.targets.map((t) => t.name)).toEqual(expect.arrayContaining(['Meta, Menlo Park', 'Googleplex']));
  expect(s.mission.targets.every((t) => t.served)).toBe(true);
  await expect(page.getByTestId('hud-target')).toBeVisible();
  await page.waitForTimeout(1500);
  await game.settled();
  await shot(page, 'silicon-branch');
  expectNoErrors(game);
});

/** The open reforms in the order the sheet shows them, top first, with the saving each row is sorted on. */
async function sheetOrder(page: Page, game: Session): Promise<{ id: string; savedCents: number; affordable: boolean }[]> {
  const ids = await page
    .getByTestId('reform-list')
    .locator('[data-testid^="enact-"]')
    .evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').slice('enact-'.length)));
  const reforms = (await game.snapshot()).reforms;
  return ids.map((id) => {
    const r = reforms.find((x) => x.id === id);
    if (r === undefined) throw new Error(`the sheet lists reform ${id}, the sim does not`);
    return { id, savedCents: -(r.preview?.costDeltaCents ?? 0), affordable: r.affordable };
  });
}

/**
 * Good choices, by clicks in the open reform sheet: the top row that saves money on this line and that the capital
 * in hand pays for, again and again until there is none. `skip` are reforms a careful player leaves alone.
 * Returns the ids enacted.
 */
async function buy(page: Page, game: Session, skip: readonly string[] = []): Promise<string[]> {
  const bought: string[] = [];
  for (;;) {
    const order = await sheetOrder(page, game);
    // The sheet is sorted on the saving: the first row is the largest.
    for (let i = 1; i < order.length; i++) expect(order[i]?.savedCents).toBeLessThanOrEqual(order[i - 1]?.savedCents ?? 0);
    const pick = order.find((r) => r.affordable && r.savedCents > 0 && !skip.includes(r.id));
    if (pick === undefined) return bought;
    await page.getByTestId(`enact-${pick.id}`).click();
    await expect.poll(async () => (await game.snapshot()).reforms.find((x) => x.id === pick.id)?.status).toBe('enacted');
    bought.push(pick.id);
  }
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

/** The small bore carries pods, not trains: a player who wants a railway leaves it alone. */
const NOT_A_RAILWAY = ['smallBoreLoop'];

interface Played {
  costRatio: number;
  timeRatio: number;
  stars: number;
  early: string[];
  atTender: string[];
  enacted: number;
  offered: number;
}

/**
 * A mission from the title screen to its scorecard by clicks: the official alignment, the reforms the sheet puts
 * first (at the start and again at the tender gate), the gates, the clock at 100x in between. No trip to the Design sheet.
 */
async function playMission(page: Page, game: Session, mission: string, tag: string): Promise<Played> {
  const next = page.getByTestId('next-action');
  await page.getByTestId(`mission-${mission}`).click();
  await expect(page.getByTestId('screen-briefing')).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, `${tag}-briefing`);
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await game.settled();
  await drawOfficial(page, game, false);
  // With nothing changed the cost is far over the target.
  const start = (await game.snapshot()).projects[0]?.scorecard.polandTarget;
  expect(start?.met).toBe(false);
  expect(start?.costRatio).toBeGreaterThan(9);
  // The cost half of the target is the colour of the big ratio box.
  await expect(page.getByTestId('headline-ratio')).toHaveClass(/is-missed/);
  await shot(page, `${tag}-topbar-start`);

  // ---- reforms before tender: what the sheet puts first, as far as the capital goes
  await page.getByTestId('nav-reforms').click();
  await page.waitForTimeout(300);
  await shot(page, `${tag}-reforms-list`);
  const early = await buy(page, game, NOT_A_RAILWAY);
  await shot(page, `${tag}-reforms-bought`);
  await page.getByTestId('panel-close').click();
  await page.getByTestId('tool-close').click();
  // The Polish tunnel came with its reform (or with the mission): nobody opened the Design sheet.
  const designed = (await game.snapshot()).projects[0];
  expect(designed?.design.tunnel).toBe('twinBore');
  // The estimate still carries its contingency: the reforms brought it most of the way, the final books say the rest.
  expect(designed?.scorecard.polandTarget?.costRatio).toBeLessThan((start?.costRatio ?? 0) / 3);

  // ---- approvals, tender, utilities
  await next.click();
  await runUntil(page, game, (s) => s.clock.hold === 'gate', 60_000);
  // The tender gate: the last moment for the design and the contract prices. The finished phases paid capital.
  await page.getByTestId('gate-reforms').click();
  const atTender = await buy(page, game, NOT_A_RAILWAY);
  await page.getByTestId('panel-close').click();
  await page.getByTestId('gate-go').click();
  await speed(page, game, 100);
  await runUntil(page, game, (s) => s.nextAction.kind === 'launchTBM', 90_000);
  await shot(page, `${tag}-topbar-launch-gate`);

  // ---- build on autopilot, fit-out, open
  await page.getByTestId('gate-go').click();
  await expect.poll(async () => (await game.snapshot()).mission.stage).toBe('build');
  await speed(page, game, 100);
  await runUntil(page, game, (s) => s.nextAction.kind === 'openLine', 200_000);
  await next.click();
  await expect(page.getByTestId('screen-scorecard')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await shot(page, `${tag}-scorecard`);

  const final = await game.snapshot();
  const p = final.projects[0];
  const target = p?.scorecard.polandTarget;
  if (p === undefined || target === undefined) throw new Error('no final scorecard');
  expect(p.scorecard.final).toBe(true);
  const enacted = final.reforms.filter((r) => r.status === 'enacted').length;
  console.log(
    `[m2] ${mission} by clicks: cost ${target.costRatio.toFixed(2)}x, time ${target.timeRatio.toFixed(2)}x Poland, ${p.scorecard.stars} stars; at the start: ${early.join(', ')}; at the tender gate: ${atTender.join(', ') || 'none'}; ${enacted} of ${final.reforms.length} reforms enacted; capital left ${final.politicalCapital}`,
  );
  return {
    costRatio: target.costRatio,
    timeRatio: target.timeRatio,
    stars: p.scorecard.stars,
    early,
    atTender,
    enacted,
    offered: final.reforms.length,
  };
}

/** Both halves of the target met: three stars on the card, the target line passed, the full burst of confetti. */
async function expectThreeStars(page: Page, played: Played): Promise<void> {
  expect(played.costRatio).toBeLessThanOrEqual(2);
  expect(played.timeRatio).toBeLessThanOrEqual(2);
  expect(played.stars).toBe(3);
  await expect(page.getByTestId('score-stars').getByRole('img')).toHaveAttribute('aria-label', '3 of 3 stars');
  await expect(page.getByTestId('score-stars-rule')).toContainText('3 both');
  await expect(page.getByTestId('score-target')).toContainText('2x Poland target: passed');
  await expect(page.getByTestId('confetti')).toHaveAttribute('data-pieces', '120');
  // The official plan is one line on the card, not a column and not a condition.
  await expect(page.getByTestId('score-official')).toContainText(/\$[\d.]+B, [\d.]+x Poland\.$/);
  await expect(page.getByTestId('score-col-sponsor')).toHaveCount(0);
  await expect(page.getByTestId('score-axes')).toHaveCount(0);
}

test('The Portal meets the 2x Poland target with the reforms the sheet puts first, played by clicks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the full playthrough needs the hardware renderer');
  test.setTimeout(300_000);
  const game = await openTitle(page, testInfo);
  await expect(page.getByTestId('title-target')).toContainText('2x');
  const played = await playMission(page, game, 'the-portal', 'portal');
  await expectThreeStars(page, played);
  // Good choices, not everything: the capital did not reach the whole list.
  await expect(page.getByTestId('score-official')).toContainText('Official plan');
  expect(played.early).toContain('twinBoreStandard');
  expect(played.early).not.toContain('specustawa');
  expect(played.enacted).toBeLessThan(played.offered);
  expectNoErrors(game);
});

test('the Googleplex spur meets the 2x Poland target the same way, played by clicks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the full playthrough needs the hardware renderer');
  test.setTimeout(300_000);
  const game = await openTitle(page, testInfo);
  const played = await playMission(page, game, 'googleplex-spur', 'googleplex');
  await expectThreeStars(page, played);
  expect(played.enacted).toBeLessThan(played.offered);
  expectNoErrors(game);
});
