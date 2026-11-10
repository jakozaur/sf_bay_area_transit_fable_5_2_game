import { expect, type Page } from '@playwright/test';
import type { FakeCall, SceneId } from '../src/testing/index.ts';

/** Opens a fixture scene on the dev page and fails the test on any page error. */
export async function open(page: Page, scene: SceneId): Promise<void> {
  page.on('pageerror', (e) => {
    throw new Error(`page error in scene ${scene}: ${e.message}`);
  });
  await page.goto(`/dev.html?scene=${scene}`);
  await expect(page.locator('.bv')).toBeVisible();
}

/** Calls the UI made on the fake services since the page loaded, without the audio cues. */
export async function calls(page: Page): Promise<FakeCall[]> {
  const all = await page.evaluate(() => {
    const ui = window.__ui;
    if (ui === undefined) throw new Error('dev page: window.__ui is missing');
    return ui.services.calls;
  });
  return all.filter((c) => !c.name.startsWith('audio.cue'));
}

export async function cues(page: Page): Promise<unknown[]> {
  const all = await page.evaluate(() => window.__ui?.services.calls ?? []);
  return all.filter((c) => c.name === 'audio.cue').map((c) => c.args[0]);
}

export async function lastCall(page: Page): Promise<FakeCall> {
  const all = await calls(page);
  const last = all[all.length - 1];
  if (last === undefined) throw new Error('the UI made no service call');
  return last;
}

export const tid = (page: Page, id: string) => page.getByTestId(id);
