/**
 * The top bar holds still (owner, playtest 3): the date went from "6 Oct" to "17 Oct" and the whole bar moved with
 * it. Every number now sits in a cell of fixed width, so the buttons beside them never change place.
 */
import { expect, test } from '@playwright/test';
import { open, tid } from './helpers.ts';

/** Ticks driven through the bar, and the days between them: 260 steps of 11 days are 7.8 years, every month and day of month. */
const TICKS = 260;
const STEP_DAYS = 11;

test('nothing in the top bar moves while the date, the funds, the capital and the ratios change', async ({ page }) => {
  await open(page, 'drive');
  const run = await page.evaluate(
    async ({ ticks, stepDays }) => {
      const ui = window.__ui;
      if (ui === undefined) throw new Error('dev page: window.__ui is missing');
      const base = ui.services.sim.snapshot.get();
      const project = base.projects[0];
      if (base.headline === null || project === undefined) throw new Error('the drive scene has no headline to tick');
      const q = (sel: string): HTMLElement => {
        const el = document.querySelector<HTMLElement>(sel);
        if (el === null) throw new Error(`top bar: nothing matches ${sel}`);
        return el;
      };
      const t = (id: string): string => `[data-testid="${id}"]`;
      // Everything that must hold still: the speed buttons, the ratio box, the time line, the panel buttons.
      const fixed = [
        ...[0, 1, 10, 100].map((sp) => t(`speed-${sp}`)),
        t('headline-ratio'),
        t('hud-target'),
        t('hud-target-time'),
        ...['project', 'reforms', 'receipt', 'menu'].map((n) => t(`nav-${n}`)),
        // The cells themselves keep their place and their width too.
        '.bv-top-cell.is-date',
        '.bv-top-cell.is-funds',
        '.bv-top-cell.is-pc',
      ];
      // Each value is drawn inside its cell: a text wider than the cell would hang over its neighbour.
      const values = [t('hud-date'), t('hud-funds'), t('hud-pc'), t('headline-ratio'), t('hud-target-time')];
      const box = (sel: string): string => {
        const r = q(sel).getBoundingClientRect();
        return [r.left, r.top, r.width, r.height].map((n) => n.toFixed(2)).join(' ');
      };
      // The widest and the narrowest texts each cell can hold, mixed with ordinary ones.
      const funds = [3.12e11, -9.99e9, 9.5e7, -1.25e5, 0, 1.888e11, 9.999e12, -8.88e10, 4.44e11, 1.11e8];
      const capital = [22, 0, 7, 100, 999, 48, 111, 888];
      const ratios = [13.4, 0.94, 2.0, 1.11, 18.7, 9.99, 88.8, 183, 4.44];
      const start = Date.UTC(2031, 9, 6);
      const first = new Map(fixed.map((sel) => [sel, box(sel)]));
      const moved: string[] = [];
      const overflowed: string[] = [];
      const dates: string[] = [];
      const holds: (null | 'gate' | 'event')[] = [null, 'gate', 'event'];
      for (let i = 0; i < ticks; i++) {
        const iso = new Date(start + i * stepDays * 86_400_000).toISOString().slice(0, 10);
        const ratio = ratios[i % ratios.length] ?? 1;
        const time = ratios[(i + 4) % ratios.length] ?? 1;
        ui.services.setSnapshot({
          ...base,
          tick: base.tick + i * stepDays,
          date: iso,
          moneyCents: funds[i % funds.length] ?? 0,
          politicalCapital: capital[i % capital.length] ?? 0,
          clock: { ...base.clock, hold: holds[i % holds.length] ?? null },
          headline: { ...base.headline, ratio },
          projects: [
            {
              ...project,
              scorecard: {
                ...project.scorecard,
                polandTarget: { costRatio: ratio, timeRatio: time, limit: 2, met: ratio <= 2 && time <= 2 },
              },
            },
            ...base.projects.slice(1),
          ],
        });
        // The UI renders on the next frame at the latest.
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const shown = q(t('hud-date')).textContent ?? '';
        dates.push(shown);
        for (const sel of fixed) {
          const now = box(sel);
          if (now !== first.get(sel)) moved.push(`${sel} at ${iso}: ${first.get(sel)} -> ${now}`);
        }
        for (const sel of values) {
          const el = q(sel);
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          const cell = el.getBoundingClientRect();
          if (text.left < cell.left - 0.5 || text.right > cell.right + 0.5)
            overflowed.push(
              `${sel} at ${iso}: "${el.textContent}" is ${text.width.toFixed(1)} px in a cell of ${cell.width.toFixed(1)} px`,
            );
        }
      }
      return { moved, overflowed, dates };
    },
    { ticks: TICKS, stepDays: STEP_DAYS },
  );
  // The run really ticked: a new date every step, across month ends and year ends, always in the long form.
  expect(run.dates).toHaveLength(TICKS);
  expect(new Set(run.dates).size).toBe(TICKS);
  for (const d of run.dates) expect(d).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
  expect(new Set(run.dates.map((d) => d.slice(3, 6))).size).toBe(12);
  expect(new Set(run.dates.map((d) => d.slice(7))).size).toBeGreaterThanOrEqual(8);
  expect(run.dates[0]).toBe('06 Oct 2031');
  expect(run.dates[1]).toBe('17 Oct 2031');
  expect(run.moved).toEqual([]);
  expect(run.overflowed).toEqual([]);
});

test('the numbers of the top bar are set in tabular numerals', async ({ page }) => {
  await open(page, 'drive');
  for (const id of ['hud-date', 'hud-funds', 'hud-pc', 'headline-ratio', 'hud-target-time'])
    await expect(tid(page, id)).toHaveCSS('font-variant-numeric', 'tabular-nums');
});
