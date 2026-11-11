/**
 * Boring Game (2026-11-10), in the real game: the title, gate cards in the centre, the two states of the time
 * controls ("Next decision" before a machine bores; Regular, Faster and Skip to end while one does), the toolbar
 * of four tools, the see-through view the game switches by itself, and a machine per tunnel type.
 * Everything under test is done with the mouse; the hook is read to assert what the screen shows.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { MachineKind } from '@bayvox/core';
import type { GameSnapshot, ProjectView, TbmView } from '@bayvox/sim';
import { expect, type Page, test } from '@playwright/test';
import { answerCard, expectNoErrors, openGame, openTitle, playOn, type Session } from './helpers.ts';

const SHOTS = process.env.BAYVOX_SHOTS;

async function shot(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...(clip === undefined ? {} : { clip }) });
}

const TOP_BAR = { x: 0, y: 0, width: 1280, height: 110 };

// The interface is laid out for a desktop window; the software-GL project runs 320 x 240.
test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'interface tests run on the gpu project');
});

async function project(game: Session): Promise<ProjectView> {
  const p = (await game.snapshot()).projects[0];
  if (p === undefined) throw new Error('no project');
  return p;
}

function xray(page: Page): Promise<boolean | undefined> {
  return page.evaluate(() => window.__game.view?.().xray);
}

/** The official alignment from the plan tool; the tool stays in hand (its panel has the way to the Design sheet). */
async function officialPlan(page: Page): Promise<void> {
  await page.keyboard.press('Digit1');
  await page.getByTestId('cmd-plan.useOfficial').click();
  await expect(page.getByTestId('readout-length')).toContainText('km');
}

async function enact(page: Page, game: Session, id: string): Promise<void> {
  await page.getByTestId('nav-reforms').click();
  const button = page.getByTestId(`enact-${id}`);
  if ((await button.count()) === 0) await page.getByTestId('reforms-noeffect').click();
  await button.click();
  await expect.poll(async () => (await game.snapshot()).reforms.find((r) => r.id === id)?.status).toBe('enacted');
  await page.getByTestId('panel-close').click();
}

/** Through the gate on the card in the centre, and on until the game stands somewhere else. */
async function throughGate(page: Page, game: Session, gate: string): Promise<void> {
  const card = page.getByTestId('gate-card');
  await expect(card).toHaveAttribute('data-gate', gate);
  const before = JSON.stringify((await game.snapshot()).nextAction.command);
  await page.getByTestId('gate-go').click();
  await expect.poll(async () => JSON.stringify((await game.snapshot()).nextAction.command)).not.toBe(before);
}

/** From a drawn plan with no tool in hand to the launch gate: approval, "Next decision" to tender, on to the launch gate. */
async function toLaunchGate(page: Page, game: Session): Promise<void> {
  await throughGate(page, game, 'approveProject');
  await playOn(page, game, (s) => s.clock.hold === 'gate', 60_000);
  await throughGate(page, game, 'advancePhase');
  await playOn(page, game, (s) => s.nextAction.kind === 'launchTBM' && s.clock.hold === 'gate', 90_000);
}

async function launch(page: Page, game: Session): Promise<void> {
  await throughGate(page, game, 'launchTBM');
  await expect.poll(async () => (await project(game)).tbms.length).toBeGreaterThan(0);
  await expect(page.getByTestId('time')).toHaveAttribute('data-mode', 'bore');
}

test('the title screen says Boring Game and where the railway goes', async ({ page }, testInfo) => {
  const game = await openTitle(page, testInfo);
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await expect(page).toHaveTitle('Polishing SF Bay Area transit: a Fable 5.2 game from a few prompts');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Boring Game');
  await expect(page.getByTestId('tagline')).toHaveText('Polish SF Bay transit rail to reach the HQ of the authors of Fable 5.2');
  await expect(page.getByTestId('screen-title')).not.toContainText('Polish the Public Transport');
  // A small box in the top right corner says how the game was made.
  await expect(page.getByTestId('title-vibe')).toHaveText('Heavily vibe coded project');
  const vibe = await page.getByTestId('title-vibe').boundingBox();
  if (vibe === null) throw new Error('no layout box for the vibe box');
  expect(vibe.y).toBeLessThan(40);
  expect(1280 - (vibe.x + vibe.width)).toBeLessThan(40);
  // The footer links to the source and says what the build cost at API prices.
  await expect(page.getByTestId('title-github')).toHaveAttribute('href', 'https://github.com/jakozaur/sf_bay_area_transit_fable_5_2_game');
  await expect(page.getByTestId('title-build-cost')).toHaveText(
    /Built by Claude Fable 5\.2 for about \$\d+ at API prices: \d+ prompts, \d+ hours, [\d,]+ lines\./,
  );
  const foot = await page.getByTestId('title-github').boundingBox();
  if (foot === null) throw new Error('no layout box for the GitHub link');
  expect(foot.y + foot.height).toBeLessThanOrEqual(720);
  // The title and its line fit the sign: neither is cut off or runs under the buttons.
  const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
  const line = await page.getByTestId('tagline').boundingBox();
  const play = await page.getByTestId('title-play').boundingBox();
  if (h1 === null || line === null || play === null) throw new Error('no layout box');
  expect(h1.y + h1.height).toBeLessThanOrEqual(line.y + 1);
  expect(line.y + line.height).toBeLessThanOrEqual(play.y);
  await page.waitForTimeout(600);
  await shot(page, 'title');
  expectNoErrors(game);
});

test('the toolbar is Plan, Station, Dig, Drive and nothing else', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo);
  const buttons = page.getByTestId('toolbar').getByRole('button');
  await expect(buttons).toHaveCount(4);
  expect(await buttons.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual([
    'tool-plan',
    'tool-station',
    'tool-dig',
    'tool-drive',
  ]);
  expect(await buttons.allTextContents()).toEqual(['1Plan', '2Station', '3Dig', '4Drive']);
  for (const gone of ['view-xray', 'view-cut', 'views', 'views-menu']) await expect(page.getByTestId(gone)).toHaveCount(0);
  await expect(page.getByTestId('toolbar')).not.toContainText(/X-ray|Cut plane|Views/);
  expectNoErrors(game);
});

test('a sheet that closes on a gate leaves the gate card in the centre of the window', async ({ page }, testInfo) => {
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  const game = await openGame(page, testInfo);
  await officialPlan(page);
  await page.keyboard.press('Escape');
  const card = page.getByTestId('gate-card');
  const centred = async (gate: string): Promise<void> => {
    await expect(card).toHaveAttribute('data-gate', gate);
    const box = await card.getByRole('dialog').boundingBox();
    if (box === null) throw new Error('the gate card has no box');
    const dx = box.x + box.width / 2 - 640;
    const dy = box.y + box.height / 2 - 360;
    expect(Math.hypot(dx, dy), `${gate} card centre is (${dx.toFixed(0)}, ${dy.toFixed(0)}) px off the window centre`).toBeLessThanOrEqual(
      80,
    );
    // Whole on screen, under the top bar and over the toolbar.
    const toolbar = await page.getByTestId('toolbar').boundingBox();
    const top = await page.getByTestId('topbar').boundingBox();
    if (toolbar === null || top === null) throw new Error('no layout box');
    expect(box.y).toBeGreaterThanOrEqual(top.y + top.height);
    expect(box.y + box.height).toBeLessThanOrEqual(toolbar.y);
  };

  // A draft that can be approved is a gate: the Reforms sheet covers its card, and closing the sheet brings it back.
  await centred('approveProject');
  await page.getByTestId('gate-reforms').click();
  await expect(page.getByTestId('panel-reforms')).toBeVisible();
  await expect(card).toHaveCount(0);
  await page.getByTestId('panel-close').click();
  await centred('approveProject');
  await page.getByTestId('gate-go').click();

  // The tender gate (the calendar is stepped through the hook: the clock is frozen in this test).
  for (let i = 0; i < 400 && (await game.snapshot()).clock.hold !== 'gate'; i++) {
    if ((await answerCard(page, game)) === null) await page.evaluate(() => window.__game.stepSim?.(10));
  }
  await centred('advancePhase');
  // Put aside, the card is gone; the top bar's Reforms sheet opened and closed brings it back to the centre.
  await page.getByTestId('gate-later').click();
  await expect(card).toHaveCount(0);
  await page.getByTestId('nav-reforms').click();
  await expect(page.getByTestId('panel-reforms')).toBeVisible();
  await page.getByTestId('panel-close').click();
  await centred('advancePhase');
  await shot(page, 'gate-card-centred');
  expectNoErrors(game);
});

test('before a machine bores there is one "Next decision" button, and it stops at the next gate or card', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const game = await openGame(page, testInfo, 'freeze=0');
  await officialPlan(page);
  await enact(page, game, 'twinBoreStandard');
  await page.getByTestId('tool-close').click();
  const time = page.getByTestId('time');
  const next = page.getByTestId('time-next');
  await expect(time).toHaveAttribute('data-mode', 'decision');
  await expect(page.locator('[data-testid^="speed-"]')).toHaveCount(0);
  // Nothing is under way on a draft: the button says so.
  await expect(next).toBeDisabled();
  expect(await xray(page)).toBe(false);
  await throughGate(page, game, 'approveProject');

  // Approved, time still stands until the button is pressed.
  await expect(next).toBeEnabled();
  await expect(next).toHaveAttribute('aria-pressed', 'false');
  const t0 = (await game.snapshot()).tick;
  await page.waitForTimeout(800);
  expect((await game.snapshot()).tick).toBe(t0);
  await shot(page, 'topbar-before-boring', TOP_BAR);

  // Every run ends at a decision: an event card or a gate. Then time stands again, and the button is up.
  const stops: string[] = [];
  for (let run = 0; run < 12; run++) {
    const from = (await game.snapshot()).tick;
    await next.click();
    await expect.poll(async () => (await game.snapshot()).clock.hold, { timeout: 20_000 }).not.toBeNull();
    const s = await game.snapshot();
    expect(s.tick).toBeGreaterThan(from);
    await expect(next).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(400);
    expect((await game.snapshot()).tick).toBe(s.tick);
    await expect(page.locator('[data-testid^="speed-"]')).toHaveCount(0);
    stops.push(s.clock.hold === 'event' ? `card:${s.events[0]?.id}` : `gate:${s.nextAction.kind}`);
    if (s.clock.hold === 'event') await answerCard(page, game);
    else if (s.nextAction.kind === 'launchTBM') break;
    else await throughGate(page, game, 'advancePhase');
  }
  console.log(`[boring] Next decision stopped at: ${stops.join(', ')}`);
  expect(stops.at(-1)).toBe('gate:launchTBM');
  expect(stops).toContain('gate:advancePhase');
  // Still no machine: one button, solid ground.
  await expect(time).toHaveAttribute('data-mode', 'decision');
  expect(await xray(page)).toBe(false);
  await shot(page, 'gate-card-launch');
  expectNoErrors(game);
});

test('while a machine bores: Regular takes about 90 seconds for the whole bore, Skip to end reaches the breakthrough and stops at cards', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const game = await openGame(page, testInfo, 'freeze=0');
  await officialPlan(page);
  await enact(page, game, 'twinBoreStandard');
  await page.getByTestId('tool-close').click();
  await toLaunchGate(page, game);
  expect(await xray(page)).toBe(false);
  await launch(page, game);

  // Pause and the three speeds where the one button was; the bore starts at Regular, seen through the ground.
  await expect(page.getByTestId('time-next')).toHaveCount(0);
  for (const [id, label] of [
    ['speed-1', 'Regular'],
    ['speed-10', 'Faster'],
    ['speed-100', 'Skip to end'],
  ] as const)
    await expect(page.getByTestId(id)).toHaveText(label);
  await expect(page.getByTestId('speed-0')).toBeVisible();
  await expect(page.getByTestId('speed-1')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => xray(page)).toBe(true);
  await page.waitForTimeout(2500);
  await shot(page, 'topbar-while-boring', TOP_BAR);

  // Regular: the share of the bore done in a few real seconds projects to 75 to 105 seconds for all of it.
  const sample = (): Promise<{ at: number; done: number; total: number; clear: boolean }> =>
    page.evaluate(() => {
      const s = window.__game.snapshot?.() as unknown as GameSnapshot;
      const p = s.projects[0];
      if (p === undefined) throw new Error('no project');
      return { at: performance.now(), done: p.boreDaysDone, total: p.boreTotalDays, clear: s.events.length === 0 && s.clock.hold === null };
    });
  let projected: number | null = null;
  for (let attempt = 0; attempt < 5 && projected === null; attempt++) {
    await answerCard(page, game);
    const a = await sample();
    await page.waitForTimeout(6000);
    const b = await sample();
    // A card in the window stopped the clock: measure again.
    if (!a.clear || !b.clear) continue;
    const seconds = (b.at - a.at) / 1000;
    projected = b.total / ((b.done - a.done) / seconds);
    console.log(
      `[boring] Regular: ${(b.done - a.done).toFixed(1)} of ${b.total.toFixed(0)} bore days in ${seconds.toFixed(2)} s, the whole bore in ${projected.toFixed(1)} s`,
    );
  }
  if (projected === null) throw new Error('no six seconds of boring without an event card');
  expect(projected).toBeGreaterThanOrEqual(75);
  expect(projected).toBeLessThanOrEqual(105);

  // Faster is four times Regular.
  await answerCard(page, game);
  await page.getByTestId('speed-10').click();
  await expect(page.getByTestId('speed-10')).toHaveAttribute('aria-pressed', 'true');
  const fa = await sample();
  await page.waitForTimeout(3000);
  const fb = await sample();
  if (fa.clear && fb.clear) {
    const faster = fb.total / ((fb.done - fa.done) / ((fb.at - fa.at) / 1000));
    console.log(`[boring] Faster: the whole bore in ${faster.toFixed(1)} s`);
    expect(faster).toBeLessThan(projected / 2);
  }

  // Skip to end: straight to the breakthrough, except that an event card stops it until it is answered.
  await answerCard(page, game);
  await page.getByTestId('speed-100').click();
  const cards: string[] = [];
  const skipFrom = Date.now();
  for (;;) {
    const s = await game.snapshot();
    if (s.projects[0]?.tbms.every((t) => t.status === 'done') === true) break;
    if (Date.now() - skipFrom > 90_000) throw new Error(`Skip to end: no breakthrough after 90 s, at ${s.date}`);
    if (s.events.length > 0) {
      expect(s.clock.hold).toBe('event');
      await expect(page.getByTestId('event-card')).toBeVisible();
      await page.waitForTimeout(400);
      const held = await game.snapshot();
      expect(held.tick).toBe(s.tick);
      expect(held.projects[0]?.boreDaysDone).toBe(s.projects[0]?.boreDaysDone);
      const id = await answerCard(page, game);
      if (id !== null) cards.push(id);
      continue;
    }
    // The button stays down: answered, the skip goes on by itself.
    await page.waitForTimeout(50);
  }
  console.log(
    `[boring] Skip to end: breakthrough ${((Date.now() - skipFrom) / 1000).toFixed(1)} s after the click, cards on the way: ${cards.join(', ') || 'none'}`,
  );
  expect(cards.length).toBeGreaterThan(0);
  await answerCard(page, game);
  await expect(page.getByTestId('banner')).toContainText('Breakthrough');
  const through = await project(game);
  expect(through.boreDaysDone).toBe(through.boreTotalDays);
  // Through: the one button is back, time stands, and the ground closes again a few seconds later.
  await expect(page.getByTestId('time')).toHaveAttribute('data-mode', 'decision');
  await expect(page.locator('[data-testid^="speed-"]')).toHaveCount(0);
  await expect(page.getByTestId('time-next')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => xray(page), { timeout: 20_000 }).toBe(false);
  expectNoErrors(game);
});

interface MachineCase {
  name: string;
  mission: string;
  reforms: readonly string[];
  /** Design option to click in the chooser, and the option whose row shows the machine card. */
  option: string;
  kind: MachineKind;
  diameterM: number;
  tubes: number;
  /** Words of the machine card. */
  card: RegExp;
}

// The Portal's curves (200 m and 160 m) are too tight for the large machine, so that one bores the Googleplex spur.
const MACHINES: readonly MachineCase[] = [
  {
    name: 'twin bore',
    mission: 'the-portal',
    reforms: ['twinBoreStandard'],
    option: 'twinBore',
    kind: 'twinBore',
    diameterM: 6.6,
    tubes: 2,
    card: /Two 6\.6 m EPB machines/,
  },
  {
    name: 'single bore',
    mission: 'googleplex-spur',
    reforms: [],
    option: 'singleLargeBore',
    kind: 'singleBore',
    diameterM: 16.2,
    tubes: 1,
    card: /One 16\.2 m single-bore machine/,
  },
  {
    name: 'small bore',
    mission: 'the-portal',
    reforms: ['twinBoreStandard', 'smallBoreLoop'],
    option: 'twinBore',
    kind: 'smallBore',
    diameterM: 3.7,
    tubes: 1,
    card: /One 3\.7 m small-bore machine/,
  },
  {
    name: 'roadheader',
    mission: 'the-portal',
    reforms: [],
    option: 'minedCavern',
    kind: 'roadheader',
    diameterM: 15.6,
    tubes: 1,
    card: /Roadheader/,
  },
  {
    name: 'excavator',
    mission: 'the-portal',
    reforms: [],
    option: 'cutAndCover',
    kind: 'excavator',
    diameterM: 22,
    tubes: 1,
    card: /Excavators/,
  },
];

for (const c of MACHINES) {
  test(`tunnel type ${c.name}: the Design sheet shows its machine and the heading is bored by it`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const game = await openGame(page, testInfo, `freeze=0&mission=${c.mission}`);
    await officialPlan(page);
    for (const id of c.reforms) await enact(page, game, id);

    // ---- the Design sheet: every tunnel choice says which machine it brings
    await page.getByTestId('open-design').click();
    await expect(page.getByTestId('panel-design')).toBeVisible();
    const options = (await project(game)).design.options.filter((o) => o.group === 'tunnel');
    expect(options.length).toBe(4);
    for (const o of options) {
      const card = page.getByTestId(`machine-${o.id}`);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute('data-kind', o.machine?.kind ?? 'none');
      await expect(card).toContainText(o.machine?.name ?? 'none');
      await expect(card).toContainText(`${o.machine?.count} x ${o.machine?.diameterM.toFixed(1)} m`);
      await expect(card).toContainText('m/day');
    }
    if (!(await page.getByTestId(`design-${c.option}`).textContent())?.includes('Chosen'))
      await page.getByTestId(`design-${c.option}`).click();
    await expect(page.getByTestId(`design-${c.option}`)).toContainText('Chosen');
    const card = page.getByTestId(`machine-${c.option}`);
    await expect(card).toHaveAttribute('data-kind', c.kind);
    await expect(card).toContainText(c.card);
    await expect(card).toContainText(`${c.tubes} x ${c.diameterM.toFixed(1)} m`);
    await card.scrollIntoViewIfNeeded();
    await shot(page, `design-machine-cards-${c.kind}`);
    await page.getByTestId('panel-close').click();
    await page.getByTestId('tool-close').click();

    // ---- to the launch, then the heading on the map
    await toLaunchGate(page, game);
    await launch(page, game);
    const tbms = (await project(game)).tbms;
    const bored = tbms.filter((t: TbmView) => t.machine !== undefined);
    expect(bored.length).toBeGreaterThan(0);
    const ours = bored.filter((t) => t.machine === c.kind);
    expect(ours.length, `machines at launch: ${tbms.map((t) => `${t.id} ${t.machine} ${t.diameterM} m`).join('; ')}`).toBeGreaterThan(0);
    for (const t of ours) {
      expect(t.diameterM, t.id).toBe(c.diameterM);
      expect(t.laterals, t.id).toHaveLength(c.tubes);
    }
    // One entity per heading (a twin bore is one entity with two tubes), drawn where the sim has it.
    const drawn = await page.evaluate(() => window.__game.entities?.());
    expect(drawn?.tbms.map((t) => t.id).sort()).toEqual(tbms.map((t) => t.id).sort());
    await expect.poll(() => xray(page)).toBe(true);

    // ---- mid-drive, from the Drive tool: the machine is on screen in its cutaway
    const drive = ours[0];
    if (drive === undefined) throw new Error('no heading');
    await playOn(page, game, (s) => (s.projects[0]?.tbms.find((t) => t.id === drive.id)?.progress ?? 0) > 0.25, 120_000, 10);
    await answerCard(page, game);
    await page.getByTestId('speed-0').click();
    // The Drive tool where the heading can be driven; a trench has no controls and is watched instead.
    await page.getByTestId('nav-project').click();
    const drivable = await page.getByTestId(`drive-${drive.id}`).isEnabled();
    await page.getByTestId(`${drivable ? 'drive' : 'watch'}-${drive.id}`).click();
    if ((await page.getByTestId('panel-project').count()) > 0) await page.getByTestId('panel-close').click();
    if (drivable) await expect(page.getByTestId('drive-hud')).toBeVisible();
    await expect.poll(async () => (await page.evaluate(() => window.__game.entities?.()))?.possessedTbmId).toBe(drive.id);
    await page.waitForTimeout(3500);
    await game.settled();
    await shot(page, `machine-${c.kind}-mid-drive`);
    const mid = (await project(game)).tbms.find((t) => t.id === drive.id);
    expect(mid?.machine).toBe(c.kind);
    expect(mid?.status).not.toBe('done');
    expectNoErrors(game);
  });
}
