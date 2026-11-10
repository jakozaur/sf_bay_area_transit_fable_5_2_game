/**
 * Regressions from the first playtest of round 2 (2026-11-10), in the real game with real clicks and keys.
 * The hook is read to assert what the screen shows and, where a test needs a state hours of play away, to
 * get there (commands and stepSim); the thing under test is always done with the mouse or the keyboard.
 */
import type { GameSnapshot } from '@bayvox/sim';
import { expect, type Page, test } from '@playwright/test';
import { expectNoErrors, openGame, openTitle, type Session } from './helpers.ts';

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

test('Dumbarton to Meta: the official alignment is buildable and the receipt opens (it took the interface down)', async ({
  page,
}, testInfo) => {
  const game = await openGame(page, testInfo, 'mission=dumbarton-to-meta');
  await page.keyboard.press('Digit1');
  await page.getByTestId('cmd-plan.useOfficial').click();
  await expect(page.getByTestId('readout-length')).toContainText('km');
  // Most of this line lies outside the voxel site. It is still a line the sim builds: no "Not buildable" beside an Approve button.
  await expect(page.getByTestId('readout-problem')).toHaveCount(0);
  await expect(page.getByTestId('next-action')).toHaveText('Approve the project');
  await page.getByTestId('nav-receipt').click();
  await expect(page.getByTestId('receipt-table')).toBeVisible();
  await expect(page.getByTestId('ui-fatal')).toHaveCount(0);
  // The 2017 corridor study has a cost and no opening date.
  await expect(page.getByTestId('receipt-ghost')).toContainText('no opening date');
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('panel-receipt')).toHaveCount(0);
  // Surface track: the gate will say "Start construction", and there is no machine for the drive tool.
  const snap = await game.snapshot();
  expect(snap.projects[0]?.phases.find((ph) => ph.id === 'utilities')?.gate?.label).toBe('Start construction');
  await page.screenshot({ path: testInfo.outputPath('meta-official.png') });
  expectNoErrors(game);
});

test('free build: a line zigzagged across the whole Bay keeps the game running (it stopped on a red screen)', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const game = await openTitle(page, testInfo);
  await page.getByTestId('mission-sandbox').click();
  await page.getByTestId('brief-start').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await game.settled();
  await page.keyboard.press('Digit1');
  // Left and right across the map, working down the screen. A click off the map (open sea, beyond the edge) is
  // refused with a hint and does not count; the playtest's line stopped the game at its eleventh waypoint, 46 km.
  for (let i = 0; i < 30; i++) {
    await page.mouse.click(i % 2 === 0 ? 480 : 1100, 170 + i * 15);
    await page.waitForTimeout(250);
    await expect(page.locator('#fatal')).toHaveCount(0);
  }
  const snap: GameSnapshot = await game.snapshot();
  const p = snap.projects[0];
  if (p === undefined) throw new Error('free build: no line was drawn');
  expect(p.waypoints.length).toBeGreaterThanOrEqual(12);
  expect(p.lengthM).toBeGreaterThan(46_000);
  // Twin bores from several launch shafts: decades, not the year 2100, and a ratio inside what the research gives.
  expect(p.receipt.columns.yours.yearsToOpen).toBeLessThan(25);
  expect(snap.headline?.ratio).toBeGreaterThan(3);
  expect(snap.headline?.ratio).toBeLessThan(15);
  await expect(page.getByTestId('headline-ratio')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('free-build-long.png') });
  expectNoErrors(game);
});

test('The Portal: the plan panel, the headline, the design tag and the receipt say the same numbers, and Poland does not move with the design', async ({
  page,
}, testInfo) => {
  const game = await openGame(page, testInfo);
  // The two places the mission is about are named on the map before anything is drawn.
  await expect(page.getByTestId('map-label-0')).toContainText('4th and King');
  await expect(page.getByTestId('map-label-1')).toContainText('Salesforce Transit Center');
  await expect(page.getByTestId('camera-help')).toBeVisible();
  await page.keyboard.press('Digit1');
  await page.getByTestId('cmd-plan.useOfficial').click();
  await expect(page.getByTestId('readout-cost')).toBeVisible();
  const agree = async (): Promise<{ poland: number; ratio: string }> => {
    const snap = await game.snapshot();
    const r = snap.projects[0]?.receipt;
    if (r === undefined) throw new Error('no project');
    const perKm = await page.getByTestId('readout-costPerKm').textContent();
    const head = await page.getByTestId('headline-yours').textContent();
    // Same figure, same formatting, in the panel and in the top bar.
    expect(dollars(perKm)).toBe(dollars(head));
    expect(dollars(await page.getByTestId('readout-cost').textContent())).toBeCloseTo(r.columns.yours.costCents / 100, -8);
    const panelRatio = (await page.getByTestId('readout-ratio').textContent()) ?? '';
    const headPoland = dollars(await page.getByTestId('headline-poland').textContent());
    expect(dollars(panelRatio.slice(panelRatio.indexOf('(')))).toBe(headPoland);
    expect(panelRatio).toContain(`${r.ratios.yoursToPoland.toFixed(1)}x`);
    // A date like every other date on screen.
    await expect(page.getByTestId('readout-opens')).toContainText(/[A-Z][a-z]{2} \d{4}$/);
    return { poland: r.columns.poland.costCents, ratio: (await page.getByTestId('headline-ratio').textContent()) ?? '' };
  };
  const official = await agree();
  // The Polish design: three reforms (the third track goes, the standard allows twin tubes, the mezzanine goes),
  // then twin bore and the compact box in the chooser, by mouse.
  await page.getByTestId('nav-reforms').click();
  await page.getByTestId('branch-design').click();
  for (const id of ['twoTracks', 'twinBoreStandard', 'noMezzanines']) {
    await page.getByTestId(`reform-head-${id}`).click();
    // A double click on Enact: charged once, no error toast with an internal id.
    await page.getByTestId(`enact-${id}`).dblclick();
    await expect(page.getByTestId(`reform-${id}`)).toContainText('Enacted');
  }
  await expect(page.getByTestId('toasts')).not.toContainText('already enacted');
  expect((await game.snapshot()).politicalCapital).toBe(40 - 15 - 10 - 15);
  await page.getByTestId('panel-close').click();
  await page.getByTestId('open-design').click();
  // The twin-bore standard has redrawn the mined cavern nobody chose as twin tubes; the trenches are still trenches.
  await expect(page.getByTestId('design-now')).toContainText('twin bore');
  await expect(page.getByTestId('design-now')).toContainText('cut-and-cover');
  await page.getByTestId('design-twinBore').click();
  await page.getByTestId('design-compactBox').click();
  await expect(page.getByTestId('design-twinBore')).toContainText('Chosen');
  await page.getByTestId('panel-close').click();
  const polish = await agree();
  expect(polish.poland).toBe(official.poland);
  expect(polish.ratio).not.toBe(official.ratio);
  // The receipt: the three columns start from the same Polish design, Poland pays for no design line, and the
  // price level is the same dollars for the player as for the status quo with no reform listed against it.
  await page.getByTestId('nav-receipt').click();
  const snap = await game.snapshot();
  const r = snap.projects[0]?.receipt;
  if (r === undefined) throw new Error('no project');
  expect(r.columns.yours.baseCents).toBe(r.columns.poland.baseCents);
  expect(r.columns.statusQuo.baseCents).toBe(r.columns.poland.baseCents);
  expect(dollars(await page.getByTestId('receipt-total-yours').textContent())).toBeCloseTo(r.columns.yours.costCents / 100, -8);
  const price = page.getByTestId('receipt-line-priceLevel');
  await price.scrollIntoViewIfNeeded();
  await expect(price).toContainText('Not a lever');
  await expect(price.locator('.bv-chip')).toHaveCount(0);
  // No cents printed as money: every Poland cell of the design and lever rows is a plain 0.
  for (const id of ['designTunnel', 'designStations', 'designSystems', 'procurement', 'softCosts']) {
    await expect(page.getByTestId(`receipt-line-${id}`).locator('td').last()).toHaveText('0');
  }
  await page.screenshot({ path: testInfo.outputPath('portal-receipt.png') });
  expectNoErrors(game);
});

test('The Portal status quo: the launch gate says what it starts, the money runs out and is called for by a card', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const game: Session = await openGame(page, testInfo);
  await page.keyboard.press('Digit1');
  await page.getByTestId('cmd-plan.useOfficial').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('next-action')).toHaveText('Approve the project');
  await page.getByTestId('next-action').click();
  // The clock is frozen in this spec: the calendar is stepped through the hook, every decision is clicked.
  const advance = async (until: (s: GameSnapshot) => boolean, maxDays: number): Promise<GameSnapshot> => {
    for (let d = 0; d < maxDays; d += 10) {
      const s = await game.snapshot();
      if (until(s)) return s;
      if (s.events.length > 0) {
        await expect(page.getByTestId('event-card')).toBeVisible();
        const uid = s.events[0]?.uid;
        await page.getByTestId('event-card').locator('button.bv-choice:not([disabled])').first().click();
        await expect.poll(async () => (await game.snapshot()).events.some((e) => e.uid === uid)).toBe(false);
        continue;
      }
      await stepSim(page, 10);
    }
    throw new Error(`not reached within ${maxDays} game days: ${(await game.snapshot()).nextAction.hint}`);
  };
  await advance((s) => s.projects[0]?.awaiting === 'advancePhase', 2000);
  // At the gate there is political capital to spend, and the strip says so with the way to spend it.
  await expect(page.getByTestId('objective-hint')).toContainText('political capital');
  await expect(page.getByTestId('strip-reforms')).toBeVisible();
  await page.getByTestId('next-action').click();
  await advance((s) => s.projects[0]?.awaiting === 'launchTBM', 4000);
  // The official design has no boring machine: a mined cavern and two cut-and-cover boxes.
  await expect(page.getByTestId('next-action')).toHaveText('Start mining');
  await expect(page.getByTestId('objective')).toContainText('Start the mined heading');
  await page.getByTestId('next-action').click();
  await stepSim(page, 2);
  // The drive tool takes the heading that has controls, not the cut-and-cover front that comes first.
  await page.keyboard.press('Digit4');
  await expect(page.getByTestId('drive-hud')).toContainText('Mined heading');
  await page.keyboard.press('Escape');
  // Run on until the account is empty: the card comes up, with what each way out brings and costs.
  let card: GameSnapshot | null = null;
  for (let d = 0; d < 4000 && card === null; d += 10) {
    const s = await game.snapshot();
    if (s.projects[0]?.status === 'open') break;
    const e = s.events[0];
    if (e !== undefined && e.id === 'cashCall') card = s;
    else if (e !== undefined) {
      await page.getByTestId('event-card').locator('button.bv-choice:not([disabled])').first().click();
      await expect.poll(async () => (await game.snapshot()).events.some((x) => x.uid === e.uid)).toBe(false);
    } else if (s.nextAction.command !== null) await command(page, s.nextAction.command as never);
    else await stepSim(page, 10);
  }
  if (card === null) throw new Error('the status-quo Portal never ran out of money');
  expect(card.moneyCents).toBeLessThan(0);
  await expect(page.getByTestId('event-title')).toHaveText('The Plan of Finance Has a Hole');
  await expect(page.getByTestId('event-option-bridge')).toContainText('funds');
  await expect(page.getByTestId('event-option-bridge')).toContainText('fee');
  await page.screenshot({ path: testInfo.outputPath('cash-call.png') });
  const before = card.moneyCents;
  await page.getByTestId('event-option-bridge').click();
  await expect.poll(async () => (await game.snapshot()).moneyCents).toBeGreaterThan(0);
  const after = await game.snapshot();
  expect(after.moneyCents).toBeGreaterThan(before);
  await expect(page.getByTestId('hud-funds')).not.toContainText('-');
  expectNoErrors(game);
});
