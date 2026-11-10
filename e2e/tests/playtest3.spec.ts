/**
 * Regressions from the third playtest (2026-11-10), in the real game: the top bar that moved with the date, the
 * reforms as one list sorted on the saving, and the Polish tunnel in one step. The hook is read to assert what
 * the screen shows and steps the calendar (stepSim); the thing under test is done with the mouse.
 * The scorecards (two stars for one half of the target, three and confetti for both) are in play.spec.ts and
 * m2.spec.ts, at the end of their playthroughs.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { expectNoErrors, openGame } from './helpers.ts';

const SHOTS = process.env.BAYVOX_SHOTS;

// The interface is laid out for a desktop window; the software-GL project runs 320 x 240.
test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'gpu', 'interface tests run on the gpu project');
});

function command(page: Page, c: Record<string, unknown>): Promise<void> {
  return page.evaluate((x) => window.__game.command(x as never), c);
}

async function officialPlan(page: Page): Promise<void> {
  await page.keyboard.press('Digit1');
  await page.getByTestId('cmd-plan.useOfficial').click();
  await expect(page.getByTestId('readout-length')).toContainText('km');
}

/** Everything in the top bar that must hold still in both states of the clock: the time cell, the ratio box with its caption, the buttons, the number cells. */
const FIXED = [
  '[data-testid="time"]',
  '[data-testid="headline-ratio"]',
  '[data-testid="hud-target"]',
  ...['project', 'reforms', 'receipt', 'menu'].map((n) => `[data-testid="nav-${n}"]`),
  '.bv-top-cell.is-date',
  '.bv-top-cell.is-funds',
  '.bv-top-cell.is-pc',
];
/** What the time cell holds before a machine bores, and while one does. */
const DECISION = ['[data-testid="time-next"]'];
const BORE = [0, 1, 10, 100].map((sp) => `[data-testid="speed-${sp}"]`);

test('the top bar holds still for 300 days of the calendar and through a launch: no button moves as the date, the funds, the capital and the time controls change', async ({
  page,
}, testInfo) => {
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  const game = await openGame(page, testInfo);
  await officialPlan(page);
  await page.keyboard.press('Escape');
  const projectId = (await game.snapshot()).projects[0]?.id;
  if (projectId === undefined) throw new Error('no project after the official plan');
  await command(page, { t: 'approveProject', projectId });

  /** One day, one frame, then where everything stands: "x width" per element, and what the cells read. */
  const day = (
    reform: string | null,
    fixed: readonly string[] = [...FIXED, ...DECISION],
  ): Promise<{ boxes: string[]; date: string; funds: string; capital: string; overflow: string[] }> =>
    page.evaluate(
      async ({ fixed, reform }) => {
        const step = window.__game.stepSim;
        if (step === undefined) throw new Error('hook has no stepSim()');
        if (reform !== null) window.__game.command({ t: 'enactReform', id: reform } as never);
        step.call(window.__game, 1);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
        const q = (sel: string): HTMLElement => {
          const el = document.querySelector<HTMLElement>(sel);
          if (el === null) throw new Error(`top bar: nothing matches ${sel}`);
          return el;
        };
        const text = (id: string): string => q(`[data-testid="${id}"]`).textContent ?? '';
        const values = ['hud-date', 'hud-funds', 'hud-pc', 'headline-ratio'];
        return {
          boxes: fixed.map((sel) => {
            const r = q(sel).getBoundingClientRect();
            return `${r.left.toFixed(2)} ${r.width.toFixed(2)}`;
          }),
          date: text('hud-date'),
          funds: text('hud-funds'),
          capital: text('hud-pc'),
          // A text wider than its cell would hang over its neighbour.
          overflow: values.filter((id) => {
            const el = q(`[data-testid="${id}"]`);
            return el.scrollWidth > el.clientWidth + 1;
          }),
        };
      },
      { fixed, reform },
    );

  const shootBar = async (name: string): Promise<void> => {
    if (SHOTS === undefined) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `topbar-${name}.png`), clip: { x: 0, y: 0, width: 1280, height: 110 } });
  };

  const first = await day(null);
  const dates = new Set<string>([first.date]);
  const funds = new Set<string>([first.funds]);
  const capital = new Set<string>([first.capital]);
  const moved: string[] = [];
  await shootBar('day-001');
  for (let i = 1; i < 300; i++) {
    // Two reforms on the way: the capital and the ratio change width (200 to 160, 18.0x to a single digit).
    const now = await day(i === 100 ? 'twinBoreStandard' : i === 200 ? 'bestValueAward' : null);
    expect(now.date, `day ${i}`).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
    expect(now.overflow, `${now.date}: text wider than its cell`).toEqual([]);
    now.boxes.forEach((b, k) => {
      if (b !== first.boxes[k]) moved.push(`${now.date}: ${FIXED[k]} at ${b}, was ${first.boxes[k]}`);
    });
    dates.add(now.date);
    funds.add(now.funds);
    capital.add(now.capital);
    if (i === 150) await shootBar('day-151');
  }
  await shootBar('day-300');
  expect(moved.slice(0, 5)).toEqual([]);
  // The numbers did change under the buttons that stood still.
  expect((await game.snapshot()).tick).toBe(300);
  expect(dates.size).toBe(300);
  expect(funds.size).toBeGreaterThan(1);
  expect(capital.size).toBeGreaterThan(2);

  // ---- the other state of the clock: a machine bores, the one button gives way to pause and three speeds
  await expect(page.getByTestId('time')).toHaveAttribute('data-mode', 'decision');
  await expect(page.locator(BORE.join(', '))).toHaveCount(0);
  for (let i = 0; i < 400 && (await game.snapshot()).projects[0]?.tbms.length === 0; i++) {
    const s = await game.snapshot();
    const card = s.events[0];
    if (card !== undefined) await command(page, { t: 'resolveEvent', eventId: card.uid, optionId: card.defaultOption });
    else if (s.nextAction.command !== null) await command(page, s.nextAction.command as never);
    await page.evaluate((n) => window.__game.stepSim?.(n), card === undefined ? 10 : 1);
  }
  await expect(page.getByTestId('time')).toHaveAttribute('data-mode', 'bore');
  await expect(page.getByTestId('time-next')).toHaveCount(0);
  const boreFixed = [...FIXED, ...BORE];
  const launched = await day(null, boreFixed);
  // Nothing outside the time cell moved when its buttons changed: same x, same width as on day one.
  FIXED.forEach((sel, k) => {
    expect(launched.boxes[k], `${sel} after the launch`).toBe(first.boxes[k]);
  });
  // The four buttons fit inside the cell.
  const cell = await page.getByTestId('time').boundingBox();
  const skip = await page.getByTestId('speed-100').boundingBox();
  if (cell === null || skip === null) throw new Error('the time cell has no box');
  expect(skip.x + skip.width).toBeLessThanOrEqual(cell.x + cell.width);
  await shootBar('boring');
  const movedBoring: string[] = [];
  for (let i = 0; i < 40; i++) {
    const now = await day(null, boreFixed);
    expect(now.overflow, `${now.date}: text wider than its cell`).toEqual([]);
    now.boxes.forEach((b, k) => {
      if (b !== launched.boxes[k]) movedBoring.push(`${now.date}: ${boreFixed[k]} at ${b}, was ${launched.boxes[k]}`);
    });
  }
  expect(movedBoring.slice(0, 5)).toEqual([]);
  expect((await game.snapshot()).projects[0]?.tbms.some((t) => t.status !== 'done')).toBe(true);
  expectNoErrors(game);
});

test('the Reforms sheet is one list with no tabs, the largest saving on this line first', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo);
  await officialPlan(page);
  await page.getByTestId('nav-reforms').click();
  await expect(page.getByTestId('panel-reforms')).toBeVisible();
  await expect(page.getByTestId('panel-reforms').getByRole('tab')).toHaveCount(0);
  await expect(page.locator('[data-testid^="branch-"]')).toHaveCount(0);
  const reforms = (await game.snapshot()).reforms;
  // About a dozen, each paid in political capital alone, none waiting for another.
  expect(reforms.length).toBeGreaterThanOrEqual(10);
  expect(reforms.length).toBeLessThanOrEqual(12);
  for (const r of reforms) {
    expect(r.prereqs, r.id).toEqual([]);
    expect(r.cost.cents, r.id).toBe(0);
    expect(r.cost.pc, r.id).toBeGreaterThan(0);
    expect(r.status, r.id).not.toBe('locked');
  }
  const saved = (id: string): number => -(reforms.find((r) => r.id === id)?.preview?.costDeltaCents ?? 0);
  const shown = await page
    .getByTestId('reform-list')
    .locator('> li')
    .evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').slice('reform-'.length)));
  expect(shown.length).toBeGreaterThan(3);
  // The first row is the largest saving of all, and every row saves no more than the one above it.
  expect(saved(shown[0] ?? '')).toBe(Math.max(...reforms.map((r) => saved(r.id))));
  expect(saved(shown[0] ?? '')).toBeGreaterThan(1e11);
  for (let i = 1; i < shown.length; i++) expect(saved(shown[i] ?? ''), shown[i]).toBeLessThanOrEqual(saved(shown[i - 1] ?? ''));
  await expect(page.getByTestId(`reform-fx-${shown[0]}`)).toContainText('saves $');
  await expect(page.getByTestId(`reform-cost-${shown[0]}`)).toContainText(/costs \d+ PC/);
  // What changes nothing here is folded away under one line, and every reform is in one place or the other.
  const fold = page.getByTestId('reforms-noeffect');
  let folded = 0;
  if ((await fold.count()) > 0) {
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('reform-list-noeffect')).toHaveCount(0);
    await fold.click();
    folded = await page.getByTestId('reform-list-noeffect').locator('> li').count();
    await expect(fold).toContainText(`No effect on this line (${folded})`);
  }
  expect(shown.length + folded).toBe(reforms.length);
  if (SHOTS !== undefined) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'reforms-one-list.png') });
  }
  expectNoErrors(game);
});

test('the reform that allows the Polish twin bore also builds it: no trip to the Design sheet', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo);
  await officialPlan(page);
  const before = (await game.snapshot()).projects[0];
  if (before === undefined) throw new Error('no project after the official plan');
  expect(before.design.frozen).toBe(false);
  expect(before.design.tunnel).not.toBe('twinBore');
  await page.getByTestId('nav-reforms').click();
  await page.getByTestId('reform-head-twinBoreStandard').click();
  await expect(page.getByTestId('reform-picks-twinBoreStandard')).toContainText('switches this line to');
  await page.getByTestId('enact-twinBoreStandard').click();
  await expect.poll(async () => (await game.snapshot()).projects[0]?.design.tunnel).toBe('twinBore');
  // The Design sheet was never on screen.
  await expect(page.getByTestId('panel-design')).toHaveCount(0);
  const after = (await game.snapshot()).projects[0];
  if (after === undefined) throw new Error('the project is gone');
  expect(after.receipt.columns.yours.costCents).toBeLessThan(before.receipt.columns.yours.costCents - 1e11);
  // Poland's price of this route does not move with the player's design.
  expect(after.receipt.columns.poland.costCents).toBe(before.receipt.columns.poland.costCents);
  // The chooser agrees, and stays open for the other choices.
  await page.getByTestId('panel-close').click();
  await page.getByTestId('open-design').click();
  await expect(page.getByTestId('design-twinBore')).toContainText('Chosen');
  await expect(page.getByTestId('design-lock-twinBore')).toHaveCount(0);
  await expect(page.getByTestId('design-frozen')).toHaveCount(0);
  expectNoErrors(game);
});
