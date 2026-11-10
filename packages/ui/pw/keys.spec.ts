/** Keyboard: Esc closes panels, digits switch tools, Space pauses; handled keys never reach the game's window listener. */
import { expect, type Page, test } from '@playwright/test';
import { calls, lastCall, open, tid } from './helpers.ts';

/** Stands in for packages/input: a bubble-phase keydown listener on the window. */
async function spyGame(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __gameKeys: string[] };
    w.__gameKeys = [];
    window.addEventListener('keydown', (e) => w.__gameKeys.push(e.code));
  });
  return () => page.evaluate(() => (window as unknown as { __gameKeys: string[] }).__gameKeys);
}

test('Escape closes the open panel and stays in the UI; without a panel it goes to the game', async ({ page }) => {
  await open(page, 'reforms');
  const game = await spyGame(page);
  await page.keyboard.press('Escape');
  await expect(tid(page, 'panel-reforms')).toHaveCount(0);
  expect(await game()).toEqual([]);
  await page.keyboard.press('Escape');
  expect(await game()).toEqual(['Escape']);
});

test('digits switch tools, toggle the active one off, and refuse an unavailable tool with its reason', async ({ page }) => {
  await open(page, 'project-draft');
  const game = await spyGame(page);
  await page.keyboard.press('Digit1');
  await expect(tid(page, 'toolpanel-plan')).toBeVisible();
  await page.keyboard.press('Digit3');
  await expect(tid(page, 'toolpanel-dig')).toBeVisible();
  await page.keyboard.press('Digit3');
  expect(await lastCall(page)).toEqual({ name: 'tools.activate', args: [null, undefined] });
  const before = (await calls(page)).length;
  await page.keyboard.press('Digit4');
  expect((await calls(page)).length).toBe(before);
  await expect(tid(page, 'toasts')).toContainText('No machine to drive yet');
  expect(await game()).toEqual([]);
});

test('Space pauses and resumes; while driving it is left to the drive bindings', async ({ page }) => {
  await open(page, 'approvals');
  const game = await spyGame(page);
  await page.keyboard.press('Space');
  expect((await lastCall(page)).name).toBe('time.togglePause');
  await expect(tid(page, 'speed-0')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(tid(page, 'speed-10')).toHaveAttribute('aria-pressed', 'true');
  expect(await game()).toEqual([]);

  await open(page, 'drive');
  const driveGame = await spyGame(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyW');
  expect((await calls(page)).map((c) => c.name)).not.toContain('time.togglePause');
  expect(await driveGame()).toEqual(['Space', 'KeyW']);
});

test('after a mouse click Space still pauses: the clicked button does not keep focus', async ({ page }) => {
  await open(page, 'approvals');
  await tid(page, 'speed-1').click();
  await page.keyboard.press('Space');
  expect((await lastCall(page)).name).toBe('time.togglePause');
});

test('keyboard users can tab to a button and press it; the game does not see that key', async ({ page }) => {
  await open(page, 'approvals');
  const game = await spyGame(page);
  await tid(page, 'speed-100').focus();
  await page.keyboard.press('Enter');
  expect(await lastCall(page)).toEqual({ name: 'time.setSpeed', args: [100] });
  expect(await game()).toEqual([]);
  await expect(tid(page, 'speed-100')).toBeFocused();
});

test('under an event card no key reaches the game and Escape does not dismiss it', async ({ page }) => {
  await open(page, 'event');
  const game = await spyGame(page);
  for (const k of ['Escape', 'Space', 'Digit1', 'KeyW']) await page.keyboard.press(k);
  await expect(tid(page, 'event-card')).toBeVisible();
  expect(await game()).toEqual([]);
  expect(await calls(page)).toEqual([]);
});

test('dispose removes the UI, its style and its key handling', async ({ page }) => {
  await open(page, 'approvals');
  const game = await spyGame(page);
  const left = await page.evaluate(() => {
    const ui = window.__ui;
    if (ui === undefined) throw new Error('window.__ui is missing');
    ui.handle.dispose();
    return { nodes: document.querySelectorAll('.bv, #bayvox-ui-style').length, subs: ui.services.subscriptions() };
  });
  expect(left).toEqual({ nodes: 0, subs: 0 });
  await page.keyboard.press('Space');
  expect(await game()).toEqual(['Space']);
  expect(await calls(page)).toEqual([]);
});
