/**
 * Screenshots of every fixture scene, for looking at, not for comparing: written to UI_SHOTS (a directory)
 * and skipped when it is not set. Run: UI_SHOTS=/some/dir pnpm --filter @bayvox/ui pw shots
 */
import { expect, test } from '@playwright/test';
import { SCENE_IDS } from '../src/testing/index.ts';

const dir = process.env.UI_SHOTS;

for (const id of SCENE_IDS) {
  test(`shot ${id}`, async ({ page }) => {
    test.skip(dir === undefined, 'UI_SHOTS is not set');
    await page.goto(`/dev.html?scene=${id}`);
    await expect(page.locator('.bv')).toBeVisible();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/${id}.png` });
  });
}
