/** Regressions from the first playtest of round 2 (2026-11-10), against the fixture scenes. */
import { REFORMS } from '@bayvox/sim';
import { expect, test } from '@playwright/test';
import { effectText } from '../src/format.ts';
import { calls, open, tid } from './helpers.ts';

test('a sponsor figure without an opening date draws the receipt and the scorecard: no crash, "no opening date"', async ({ page }) => {
  // The Dumbarton corridor study has a cost and no date. The receipt panel threw "not an ISO date" on it and took the whole interface down.
  await open(page, 'receipt-no-date');
  await expect(tid(page, 'ui-fatal')).toHaveCount(0);
  await expect(tid(page, 'receipt-table')).toBeVisible();
  await expect(tid(page, 'receipt-ghost')).toContainText('Corridor study (2017)');
  await expect(tid(page, 'receipt-ghost')).toContainText('no opening date');
  await expect(tid(page, 'topbar')).toBeVisible();
  await open(page, 'scorecard-no-date');
  await expect(tid(page, 'ui-fatal')).toHaveCount(0);
  await expect(tid(page, 'score-official')).toContainText('Corridor study (2017): $');
  await expect(tid(page, 'score-date-yours')).toContainText('Opens Jun 2033');
});

test('an event card waits for the breakthrough banner instead of covering it', async ({ page }) => {
  await open(page, 'breakthrough-event');
  await expect(tid(page, 'banner')).toBeVisible();
  await expect(tid(page, 'banner')).toContainText('Breakthrough');
  await expect(tid(page, 'event-card')).toHaveCount(0);
  // No second line for the card that is about to open.
  await expect(tid(page, 'toasts')).not.toContainText('One Man and His Parking Spot');
  // The banner has its 4.5 seconds, then the card comes up and holds time as before.
  await expect(tid(page, 'event-card')).toBeVisible({ timeout: 7000 });
  await expect(tid(page, 'banner')).toHaveCount(0);
  await expect(tid(page, 'event-title')).toHaveText('One Man and His Parking Spot');
});

test('a pressed button under the pointer stays readable', async ({ page }) => {
  await open(page, 'receipt');
  const contrast = async (id: string): Promise<number> => {
    const el = tid(page, id);
    await el.hover();
    return el.evaluate((node) => {
      const lum = (rgb: string): number => {
        const m = rgb.match(/[\d.]+/g);
        if (m === null) throw new Error(`not a colour: ${rgb}`);
        const [r, g, b] = m.slice(0, 3).map((v) => {
          const c = Number(v) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
      };
      const css = getComputedStyle(node);
      const a = lum(css.color);
      const b = lum(css.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  };
  // The open panel's button in the top band, a speed button, and a pressed tool.
  expect(await contrast('nav-receipt')).toBeGreaterThan(7);
  expect(await contrast('speed-1')).toBeGreaterThan(7);
  await tid(page, 'tool-dig').click();
  expect(await contrast('tool-dig')).toBeGreaterThan(7);
});

test('the reforms sheet stops the clock while it is read and names the reforms the player can afford', async ({ page }) => {
  await open(page, 'approvals');
  await expect(tid(page, 'strip-reforms')).toContainText('you can afford');
  await tid(page, 'strip-reforms').click();
  await expect(tid(page, 'panel-reforms')).toBeVisible();
  await expect(tid(page, 'panel-reforms')).toContainText('time waits');
  await tid(page, 'panel-close').click();
  const time = (await calls(page)).filter((c) => c.name === 'time.setSpeed').map((c) => c.args[0]);
  expect(time).toEqual([0, 10]);
});

test('a reform says what it does in words, and one that changes nothing on this project says so', async ({ page }) => {
  await open(page, 'reforms');
  // A machine reform on a project whose estimate it does not move: in the folded group at the bottom.
  const id = 'prufrockClass';
  const def = REFORMS.find((r) => r.id === id);
  const first = def?.effects[0];
  if (first === undefined) throw new Error(`the sim has no reform "${id}" with an effect`);
  await tid(page, 'reforms-noeffect').click();
  await expect(tid(page, `reform-fx-${id}`)).toHaveText(`${effectText(first)}: nothing on this project`);
  await tid(page, `reform-head-${id}`).click();
  await expect(tid(page, `reform-effects-${id}`)).toContainText(effectText(first));
  await expect(tid(page, `reform-body-${id}`)).not.toContainText('no change');
  await expect(tid(page, `reform-body-${id}`)).not.toContainText('doc 0');
});

test('the mission targets are named on the map and the hint is not cut off', async ({ page }) => {
  await open(page, 'station');
  await expect(tid(page, 'map-labels')).toBeAttached();
  await expect(tid(page, 'map-label-0')).toContainText('4th and King');
  await expect(tid(page, 'map-label-1')).toContainText('Salesforce Transit Center');
  await expect(tid(page, 'camera-help')).toContainText('Right-drag');
  const hint = tid(page, 'objective-hint');
  expect(await hint.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
});

test('the drive readout always says which side the machine is off, and the dial moves for the first metres', async ({ page }) => {
  await open(page, 'drive-offplan');
  await expect(tid(page, 'drive-where')).toHaveText('4.6 left, 2.2 high');
  // And what a metre bored there costs on top of the planned one.
  await expect(tid(page, 'drive-price')).toHaveText('+36% per metre');
  const offset = await tid(page, 'drive-needle')
    .locator('.dot')
    .evaluate((el) => {
      const dial = (el.parentElement as HTMLElement).getBoundingClientRect();
      const dot = el.getBoundingClientRect();
      return {
        x: (dot.x + dot.width / 2 - (dial.x + dial.width / 2)) / dial.width,
        y: (dot.y + dot.height / 2 - (dial.y + dial.height / 2)) / dial.height,
      };
    });
  // Left and up, well away from the centre mark.
  expect(offset.x).toBeLessThan(-0.2);
  expect(offset.y).toBeLessThan(-0.1);
});
