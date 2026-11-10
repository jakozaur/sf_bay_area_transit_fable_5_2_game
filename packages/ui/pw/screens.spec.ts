/** Every fixture scene renders its screen, fits 1280x720, keeps the map centre free and overlaps nothing. */
import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_REFORMS, SCENE_IDS, type SceneId } from '../src/testing/index.ts';
import { open, tid, title } from './helpers.ts';

/** What must be on screen in each scene (test ids). */
const EXPECT: Record<SceneId, string[]> = {
  title: [
    'screen-title',
    'title-play',
    'mission-the-portal',
    'mission-googleplex',
    'mission-dumbarton',
    'mission-sandbox',
    'title-credits',
  ],
  'title-continue': ['screen-title', 'title-continue', 'title-save'],
  'title-credits': ['screen-title', 'panel-credits', 'credits'],
  briefing: ['screen-briefing', 'brief-what', 'brief-cost', 'brief-why', 'brief-objectives', 'brief-start'],
  loading: ['screen-loading'],
  'plan-empty': ['topbar', 'objective-strip', 'toolbar', 'next-action'],
  plan: ['toolpanel-plan', 'tool-readouts', 'plan-problems', 'cmd-plan.useOfficial', 'opt-plan.depthM', 'open-design'],
  station: ['toolpanel-station', 'opt-station.template-undergroundStandard', 'opt-station.depthM', 'remove-station-fourth-townsend'],
  dig: ['toolpanel-dig', 'opt-dig.radiusM', 'dig-total'],
  design: [
    'panel-design',
    'design-twinBore',
    'design-singleLargeBore',
    'design-cutAndCover',
    'design-minedCavern',
    'design-compactBox',
    'design-mezzanineBox',
  ],
  'project-draft': ['panel-project', 'phases', 'project-action', 'objectives'],
  approvals: ['panel-project', 'phase-permitting', 'speed-10'],
  gate: ['panel-project', 'project-action', 'hud-hold', 'next-action'],
  'gate-card': [
    'gate-card',
    'gate-what',
    'gate-estimate',
    'gate-offers',
    'gate-later',
    'gate-reforms',
    'gate-design',
    'gate-go',
    'next-action',
  ],
  reforms: ['panel-reforms', 'reform-list', 'reform-specustawa', 'reforms-noeffect'],
  event: ['event-card', 'event-title', 'event-option-litigate', 'event-option-settle', 'event-deadline'],
  build: ['panel-project', 'tbm-portal/front-1', 'station-fourth-townsend', 'project-spent'],
  drive: [
    'drive-hud',
    'drive-thrust',
    'drive-speed',
    'drive-depth',
    'drive-geology',
    'drive-needle',
    'drive-autopilot',
    'drive-keys',
    'view-cut-y',
  ],
  'drive-offplan': ['drive-hud', 'drive-deviation'],
  breakthrough: ['banner', 'toasts', 'drive-hud'],
  'breakthrough-event': ['banner', 'drive-hud'],
  receipt: ['panel-receipt', 'receipt-table', 'receipt-ratios', 'perkm-dims', 'receipt-line-priceLevel', 'receipt-ghost'],
  'receipt-no-date': ['panel-receipt', 'receipt-table', 'receipt-ghost'],
  'scorecard-no-date': ['screen-scorecard', 'score-official', 'receipt-table'],
  open: ['panel-project', 'project-action'],
  scorecard: [
    'screen-scorecard',
    'score-verdict',
    'score-stars',
    'score-stars-rule',
    'score-official',
    'score-col-yours',
    'score-col-poland',
    'score-dims',
    'receipt-table',
    'score-next',
    'score-keep',
  ],
  backlash: ['panel-project', 'housing', 'housing-enact-saltPonds', 'backlash', 'backlash-angry', 'backlash-close-all'],
  'backlash-plain': ['backlash', 'backlash-angry', 'backlash-more', 'toolbar'],
  menu: ['panel-menu', 'menu-save', 'menu-restart', 'menu-missions', 'menu-help', 'menu-credits', 'menu-mute'],
  help: ['panel-help'],
  credits: ['panel-credits', 'credits'],
};

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding boxes of the HUD regions present on the page. */
async function regions(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const pick: [string, string][] = [
      ['topbar', '.bv-top'],
      ['strip', '.bv-strip'],
      ['tool panel', '.bv-left .bv-sheet'],
      ['side panel', '.bv-right .bv-sheet'],
      ['drive hud', '.bv-drive'],
      ['toolbar', '.bv-toolbar'],
      ['title', '.bv-title'],
      ['briefing', '.bv-brief .bv-sheet'],
      ['gate card', '.bv-gatecard .bv-sheet'],
      ['notices', '.bv-toasts'],
      ['backlash', '.bv-backlash'],
    ];
    const out: { name: string; x: number; y: number; w: number; h: number }[] = [];
    for (const [name, sel] of pick) {
      const el = document.querySelector(sel);
      if (el === null) continue;
      const r = el.getBoundingClientRect();
      out.push({ name, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return out;
  });
}

const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
/** The middle of the map: a third of the width and height around the screen centre. */
const CENTRE: Box = { name: 'map centre', x: 1280 / 3, y: 720 / 3, w: 1280 / 3, h: 720 / 3 };
/** Scenes that take the centre on purpose: a card that holds time, a screen. */
const MODAL: ReadonlySet<SceneId> = new Set<SceneId>(['event', 'scorecard', 'loading', 'gate-card']);

for (const id of SCENE_IDS) {
  test(`scene ${id} renders, fits and overlaps nothing`, async ({ page }) => {
    await open(page, id);
    for (const t of EXPECT[id]) await expect(tid(page, t), `test id ${t}`).toBeVisible();

    // The page never scrolls and nothing sticks out of the viewport.
    const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    expect(size).toEqual({ w: 1280, h: 720 });
    const boxes = await regions(page);
    for (const b of boxes) {
      expect(b.x, `${b.name} left edge`).toBeGreaterThanOrEqual(0);
      expect(b.y, `${b.name} top edge`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, `${b.name} right edge`).toBeLessThanOrEqual(1280);
      expect(b.y + b.h, `${b.name} bottom edge`).toBeLessThanOrEqual(720);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++)
        expect(overlap(boxes[i], boxes[j]), `${boxes[i].name} overlaps ${boxes[j].name}`).toBe(false);
    }
    // The backlash box is the one exception: a pile-on is meant to be in the way until it is closed.
    if (!MODAL.has(id))
      for (const b of boxes) if (b.name !== 'backlash') expect(overlap(b, CENTRE), `${b.name} covers the map centre`).toBe(false);

    // No text is clipped sideways, except the two lines that are built to truncate with an ellipsis.
    const clipped = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('.bv *')) {
        if (el.matches('.bv-objective .what, .bv-objective .hint, .bv-sr') || el.clientWidth === 0) continue;
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible')
          bad.push(`${el.className || el.tagName}: ${el.textContent?.slice(0, 40)}`);
      }
      return bad;
    });
    expect(clipped).toEqual([]);
  });
}

test('the HUD shows the snapshot numbers, compactly formatted', async ({ page }) => {
  await open(page, 'drive');
  await expect(tid(page, 'hud-date')).toHaveText('04 Aug 2031');
  await expect(tid(page, 'hud-funds')).toHaveText('$3.12B');
  await expect(tid(page, 'hud-pc')).toHaveText('22 PC');
  // One number to beat: the cost ratio in the box, the time ratio as the small line beside it, no per-km figures.
  await expect(tid(page, 'headline-ratio')).toHaveText('13.4x');
  await expect(tid(page, 'headline-ratio')).toHaveClass(/is-missed/);
  await expect(tid(page, 'hud-target-time')).toHaveText(/^time \d+(\.\d+)?x$/);
  await expect(tid(page, 'headline')).not.toContainText('/km');
  await expect(tid(page, 'objective')).toHaveText('Bore to the Salesforce Transit Center');
  await expect(tid(page, 'drive-speed')).toContainText('11.4');
  await expect(tid(page, 'drive-depth')).toHaveText('22 m');
  await expect(tid(page, 'drive-geology')).toContainText('Bay Mud');
});

test('violations are red: the bad readout, the problem list, the off-plan needle', async ({ page }) => {
  const red = 'rgb(212, 34, 43)';
  await open(page, 'plan');
  await expect(tid(page, 'readout-radius')).toHaveCSS('color', red);
  await expect(tid(page, 'readout-length')).not.toHaveCSS('color', red);
  await expect(tid(page, 'plan-problems').locator('li')).toHaveCSS('color', red);
  await open(page, 'drive-offplan');
  await expect(tid(page, 'drive-needle')).toHaveClass(/is-off/);
  await expect(tid(page, 'drive-deviation')).toHaveClass(/bv-bad/);
  await expect(tid(page, 'drive-grade')).toHaveClass(/bv-bad/);
});

test('locked design options and reforms say what unlocks them', async ({ page }) => {
  await open(page, 'design');
  await expect(tid(page, 'design-lock-cutAndCover')).toContainText(title('utilityStatute'));
  await expect(tid(page, 'design-price-minedCavern')).toHaveText('$5.75B');
  await open(page, 'reforms');
  // The sim's reforms have no prerequisites; the fixture gives one a prerequisite, and the row still says it.
  await expect(tid(page, `reform-${FIXTURE_REFORMS.locked}`)).toContainText(`Needs ${title(FIXTURE_REFORMS.lockedNeeds)} first`);
});

test('the scorecard decomposes the gap into the four factors and marks enacted reforms', async ({ page }) => {
  await open(page, 'scorecard');
  for (const g of ['designScope', 'institutional', 'delay', 'priceLevel']) await expect(tid(page, `receipt-group-${g}`)).toBeVisible();
  const line = tid(page, 'receipt-line-procurement');
  await expect(line.locator('.bv-chip.is-done')).toHaveText(title(FIXTURE_REFORMS.enacted[0]));
  await expect(tid(page, `receipt-reform-${FIXTURE_REFORMS.onReceipt}`)).toBeVisible();
  await expect(tid(page, 'receipt-line-priceLevel')).toContainText('1.61x');
  await expect(tid(page, 'receipt-total-yours')).toHaveText('$5.13B');
  await expect(tid(page, 'receipt-total-poland')).toHaveText('$383M');
});

test('a snapshot with no project renders the empty states instead of throwing', async ({ page }) => {
  await open(page, 'plan-empty');
  await expect(tid(page, 'headline')).toContainText('Cost against Poland appears once a line is drawn');
  for (const [nav, empty] of [
    ['nav-project', 'project-empty'],
    ['nav-receipt', 'receipt-empty'],
  ]) {
    await tid(page, nav).click();
    await expect(tid(page, empty)).toBeVisible();
  }
});
