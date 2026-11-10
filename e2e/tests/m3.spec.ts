/**
 * M2, second round: the Googleplex spur from San Antonio station, no Oracle mission, housing options that
 * justify a line, the louder backlash box and the Vegas-style small bore. All through the interface; the hook is
 * only read.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { GameSnapshot } from '@bayvox/sim';
import { expect, type Page, test } from '@playwright/test';
import { expectNoErrors, openGame, openTitle, type Session } from './helpers.ts';

const SHOTS = process.env.BAYVOX_SHOTS;

/** A screenshot into BAYVOX_SHOTS when that is set, nothing otherwise. */
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `m3-${name}.png`) });
}

/** San Antonio Caltrain and the old start at Mountain View Caltrain, world metres (googleplex.ts). */
const SAN_ANTONIO = { x: 46529.25, z: -23963.25 };
const MOUNTAIN_VIEW = { x: 49319.3, z: -22540.0 };

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Draws the official alignment from the next-action button and puts the plan tool away. */
async function drawOfficial(page: Page, game: Session): Promise<void> {
  await page.getByTestId('next-action').click();
  await expect(page.getByTestId('toolpanel-plan')).toBeVisible();
  await page.getByTestId('cmd-plan.useOfficial').click();
  await expect.poll(async () => (await game.snapshot()).projects.length).toBe(1);
  await page.getByTestId('tool-close').click();
}

/** Enacts a housing option from the open Project panel and returns the pile-on it drew. */
async function enactHousing(page: Page, game: Session, id: string): Promise<NonNullable<GameSnapshot['socialPosts']>> {
  const before = (await game.snapshot()).socialPosts?.length ?? 0;
  await page.getByTestId(`housing-enact-${id}`).click();
  await expect.poll(async () => (await game.snapshot()).housing?.find((o) => o.id === id)?.enacted).toBe(true);
  await expect(page.getByTestId(`housing-${id}`)).toContainText('Enacted');
  return ((await game.snapshot()).socialPosts ?? []).slice(before);
}

test('the Googleplex spur is briefed and drawn from San Antonio station, not Mountain View', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'mission sites need the hardware renderer');
  const game = await openTitle(page, testInfo);
  await page.getByTestId('mission-googleplex-spur').click();
  await expect(page.getByTestId('screen-briefing')).toBeVisible();
  await expect(page.getByTestId('brief-what')).toContainText('San Antonio Caltrain');
  await expect(page.getByTestId('screen-briefing')).not.toContainText('Mountain View');
  await expect(page.getByTestId('brief-objectives')).toContainText('Connect San Antonio Caltrain to the Googleplex');
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await game.settled();
  await drawOfficial(page, game);
  const p = (await game.snapshot()).projects[0];
  if (p === undefined) throw new Error('no project after the official plan');
  // One end of the line is the station itself; no vertex goes near the old start.
  const points = p.alignment.points;
  const ends = [points[0], points.at(-1)].filter((q) => q !== undefined);
  expect(Math.min(...ends.map((q) => dist(q, SAN_ANTONIO)))).toBeLessThan(5);
  expect(Math.min(...points.map((q) => dist(q, MOUNTAIN_VIEW)))).toBeGreaterThan(1500);
  expect(p.stations.map((s) => s.name)).toContain('San Antonio');
  // Shorter than the 4.3 km it was from Mountain View.
  expect(p.lengthM).toBeGreaterThan(2400);
  expect(p.lengthM).toBeLessThan(2800);
  await expect(page.getByTestId('readout-problem')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await game.settled();
  await shot(page, 'googleplex-from-san-antonio');
  expectNoErrors(game);
});

test('no Oracle mission in the list or the cost-benefit table; the campus rows show what housing does', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the comparison sheet needs the full-size viewport');
  const game = await openTitle(page, testInfo);
  await expect(page.getByTestId('cost-benefit')).toBeVisible();
  await expect(page.locator('[data-testid*="oracle" i]')).toHaveCount(0);
  await expect(page.getByTestId('screen-title')).not.toContainText(/oracle/i);
  const ids = await page.locator('.bv-mission').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(ids).toEqual([
    'mission-the-portal',
    'mission-googleplex-spur',
    'mission-dumbarton-to-meta',
    'mission-siliconBranch',
    'mission-sandbox',
  ]);
  // With every housing option enacted the ratio is higher than without.
  for (const id of ['googleplex-spur', 'dumbarton-to-meta', 'siliconBranch']) {
    // The ratio is the last cell of the row.
    const plain = Number(await page.getByTestId(`cb-${id}`).locator('td').last().textContent());
    const row = page.getByTestId(`cb-${id}-housing`);
    await expect(row).toContainText(/\+[\d,]+ homes/);
    const withHomes = Number(await row.locator('td').last().textContent());
    expect(plain).toBeGreaterThan(0);
    expect(withHomes).toBeGreaterThan(plain);
  }
  await expect(page.getByTestId('cb-the-portal-housing')).toHaveCount(0);
  // The table still fits beside the list.
  const table = await page.getByTestId('cost-benefit').boundingBox();
  const viewport = page.viewportSize();
  if (table === null || viewport === null) throw new Error('no layout box');
  expect(table.x + table.width).toBeLessThanOrEqual(viewport.width);
  expect(table.y + table.height).toBeLessThanOrEqual(viewport.height);
  await page.waitForTimeout(800);
  await shot(page, 'title-cost-benefit');
  expectNoErrors(game);
});

test('enacting housing spends capital, adds riders and draws a pile-on in a wide box that closes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the project sheet needs the full-size viewport');
  const game = await openGame(page, testInfo, 'mission=googleplex-spur');
  await drawOfficial(page, game);
  const before = await game.snapshot();
  const ridersBefore = before.projects[0]?.scorecard.ridersPerDay ?? 0;
  expect(before.projects[0]?.scorecard.housing).toEqual({ homes: 0, ridersPerDayAdded: 0 });
  await expect(page.getByTestId('backlash')).toHaveCount(0);

  await page.getByTestId('nav-project').click();
  await expect(page.getByTestId('housing')).toBeVisible();
  const option = before.housing?.find((o) => o.id === 'northBayshore');
  if (option === undefined) throw new Error('the Googleplex spur offers no North Bayshore housing');
  await expect(page.getByTestId('housing-northBayshore')).toContainText('Needs a station within');
  await expect(page.getByTestId('housing-enact-northBayshore')).toContainText(`${option.capitalCost}`);
  await shot(page, 'housing-panel');
  const burst = await enactHousing(page, game, 'northBayshore');

  const after = await game.snapshot();
  expect(after.politicalCapital).toBe(before.politicalCapital - option.capitalCost);
  const card = after.projects[0]?.scorecard;
  expect(card?.housing).toEqual({ homes: option.homes, ridersPerDayAdded: option.ridersPerDayAdded });
  expect(card?.ridersPerDay).toBe(ridersBefore + option.ridersPerDayAdded);

  // The pile-on: 2 to 4 posts from different handles, all about this rezoning.
  expect(burst.length).toBeGreaterThanOrEqual(2);
  expect(burst.length).toBeLessThanOrEqual(4);
  expect(new Set(burst.map((p) => p.handle)).size).toBe(burst.length);
  for (const p of burst) {
    expect(p.cause).toBe('housing:northBayshore');
    await expect(page.getByTestId(`post-${p.id}`)).toContainText(p.text);
  }
  await expect(page.getByTestId('backlash-angry')).toContainText(/[\d,]+ people are angry at you/);

  // Wide, inside the window, clear of the toolbar and of the open sheet.
  const box = await page.getByTestId('backlash').boundingBox();
  const toolbar = await page.getByTestId('toolbar').boundingBox();
  const sheet = await page.getByTestId('panel-project').boundingBox();
  const viewport = page.viewportSize();
  if (box === null || toolbar === null || sheet === null || viewport === null) throw new Error('no layout box');
  expect(box.width).toBeGreaterThanOrEqual(500);
  expect(box.y + box.height).toBeLessThanOrEqual(toolbar.y);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(sheet.x);
  await shot(page, 'housing-pile-on');

  // A second rezoning piles on top; with the sheet closed the box is still wide and off the toolbar.
  const second = await enactHousing(page, game, 'sanAntonioCenter');
  await expect(page.getByTestId(`post-${second.at(-1)?.id}`)).toBeVisible();
  await page.getByTestId('panel-close').click();
  const all = burst.length + second.length;
  await expect(page.getByTestId('backlash').locator('li')).toHaveCount(Math.min(4, all));
  if (all > 4) await expect(page.getByTestId('backlash-more')).toHaveText(`+${all - 4} more`);
  const wide = await page.getByTestId('backlash').boundingBox();
  if (wide === null) throw new Error('no layout box');
  expect(wide.width).toBeGreaterThanOrEqual(500);
  expect(wide.y + wide.height).toBeLessThanOrEqual(toolbar.y);
  await shot(page, 'pile-on-full');

  // One post closes; the next one down takes its place. Close all clears the box, not the sim's record.
  const newest = second.at(-1);
  if (newest === undefined) throw new Error('no post after the second rezoning');
  await page.getByTestId(`post-close-${newest.id}`).click();
  await expect(page.getByTestId(`post-${newest.id}`)).toHaveCount(0);
  await expect(page.getByTestId('backlash').locator('li')).toHaveCount(Math.min(4, all - 1));
  await page.getByTestId('backlash-close-all').click();
  await expect(page.getByTestId('backlash')).toHaveCount(0);
  expect((await game.snapshot()).socialPosts).toHaveLength(all);
  expectNoErrors(game);
});

test('the Vegas-style small bore is enactable: cheaper and faster, and it says what it cannot carry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the reform sheet needs the full-size viewport');
  const game = await openGame(page, testInfo, 'mission=googleplex-spur');
  await drawOfficial(page, game);
  await page.getByTestId('nav-project').click();
  await enactHousing(page, game, 'northBayshore');
  await page.getByTestId('backlash-close-all').click();
  const before = await game.snapshot();
  const cardBefore = before.projects[0]?.scorecard;
  if (cardBefore === undefined) throw new Error('no scorecard');
  expect(cardBefore.ridersPerDay).toBeGreaterThan(8000);

  await page.getByTestId('nav-reforms').click();
  await expect(page.getByTestId('reform-head-smallBoreLoop')).toContainText('The Vegas-style small bore');
  await page.getByTestId('reform-head-smallBoreLoop').click();
  const note = page.getByTestId('reform-body-smallBoreLoop');
  await expect(note).toContainText('3.7 m');
  await expect(note).toContainText('no train fits');
  await expect(note).toContainText('Pods, not trains');
  await page.getByTestId('reform-effects-smallBoreLoop').scrollIntoViewIfNeeded();
  await shot(page, 'small-bore');
  await page.getByTestId('enact-smallBoreLoop').click();
  await expect.poll(async () => (await game.snapshot()).reforms.find((r) => r.id === 'smallBoreLoop')?.status).toBe('enacted');

  const after = await game.snapshot();
  const cardAfter = after.projects[0]?.scorecard;
  if (cardAfter === undefined) throw new Error('no scorecard');
  // The catch: pods, not trains. And the gain: a cheaper, earlier line.
  expect(cardAfter.ridersPerDay).toBeLessThan(cardBefore.ridersPerDay);
  expect(cardAfter.ridersPerDay).toBeLessThanOrEqual(8000);
  expect(cardAfter.yours.costCents).toBeLessThan(cardBefore.yours.costCents);
  expect(cardAfter.yours.yearsToOpen).toBeLessThanOrEqual(cardBefore.yours.yearsToOpen);
  expect(after.politicalCapital).toBe(before.politicalCapital - 50);
  expect(after.socialPosts?.at(-1)?.cause).toBe('reform:smallBoreLoop');
  await expect(page.getByTestId('backlash')).toBeVisible();
  expectNoErrors(game);
});

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

test('Dumbarton to Meta with homes on the salt works, played by clicks to the scorecard', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'the full playthrough needs the hardware renderer');
  test.setTimeout(300_000);
  const game = await openTitle(page, testInfo);
  await page.getByTestId('mission-dumbarton-to-meta').click();
  await expect(page.getByTestId('screen-briefing')).toBeVisible();
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await game.settled();
  await drawOfficial(page, game);
  const plain = (await game.snapshot()).projects[0]?.scorecard.ridersPerDay ?? 0;

  await page.getByTestId('nav-project').click();
  await expect(page.getByTestId('housing-saltWorks')).toContainText('salt works');
  await shot(page, 'dumbarton-housing-panel');
  const burst = await enactHousing(page, game, 'saltWorks');
  const option = (await game.snapshot()).housing?.find((o) => o.id === 'saltWorks');
  if (option === undefined) throw new Error('Dumbarton to Meta offers no salt works housing');
  expect((await game.snapshot()).projects[0]?.scorecard.ridersPerDay).toBe(plain + option.ridersPerDayAdded);
  await expect(page.getByTestId(`post-${burst.at(-1)?.id}`)).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, 'dumbarton-pile-on');
  await page.getByTestId('panel-close').click();

  // Gates and approvals as they come, the clock at 100x in between, until the line is open.
  const next = page.getByTestId('next-action');
  let folded = false;
  for (let step = 0; step < 40; step++) {
    await runUntil(
      page,
      game,
      (s) => s.clock.hold === 'gate' || s.nextAction.command !== null || s.projects[0]?.scorecard.final === true,
      120_000,
    );
    const s = await game.snapshot();
    if (s.projects[0]?.scorecard.final === true) break;
    if (s.clock.hold === 'gate') {
      // Under a gate card the box folds to its header and count: it never covers the decision.
      if (!folded) {
        await expect(page.getByTestId('gate-card')).toBeVisible();
        await expect(page.getByTestId('backlash').locator('li')).toHaveCount(0);
        await expect(page.getByTestId('backlash-more')).toHaveText(`${burst.length} posts`);
        folded = true;
      }
      await page.getByTestId('gate-go').click();
    } else await next.click();
    await expect.poll(async () => (await game.snapshot()).tick, { timeout: 15_000 }).toBeGreaterThan(s.tick);
    const now = await game.snapshot();
    if (now.clock.hold === null && now.events.length === 0 && now.projects[0]?.scorecard.final !== true)
      await page.getByTestId('speed-100').click();
  }
  expect(folded).toBe(true);
  await expect(page.getByTestId('screen-scorecard')).toBeVisible({ timeout: 30_000 });
  const p = (await game.snapshot()).projects[0];
  if (p === undefined) throw new Error('no final scorecard');
  expect(p.scorecard.final).toBe(true);
  expect(p.scorecard.housing).toEqual({ homes: option.homes, ridersPerDayAdded: option.ridersPerDayAdded });
  await expect(page.getByTestId('score-housing')).toContainText('12,000 homes');
  await expect(page.getByTestId('score-backlash')).toContainText('angry at you');
  // Built as California builds it, the line misses the 2x Poland target: no confetti.
  expect(p.scorecard.polandTarget?.met).toBe(false);
  await expect(page.getByTestId('score-target')).toContainText('2x Poland target: failed');
  await expect(page.getByTestId('confetti')).toHaveCount(0);
  // The scorecard sheet stays inside the window with its buttons.
  const foot = await page.getByTestId('score-keep').boundingBox();
  const viewport = page.viewportSize();
  if (foot === null || viewport === null) throw new Error('no layout box');
  expect(foot.y + foot.height).toBeLessThanOrEqual(viewport.height);
  await page.waitForTimeout(500);
  await shot(page, 'dumbarton-scorecard');
  await page.getByTestId('score-backlash').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('score-housing')).toBeInViewport();
  await shot(page, 'dumbarton-scorecard-housing');
  expectNoErrors(game);
});
