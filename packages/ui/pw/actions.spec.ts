/** Every button dispatches the right Command or GameServices call, checked on the recording fake. */
import { expect, test } from '@playwright/test';
import { reformList } from '../src/model.ts';
import { FIXTURE_REFORMS } from '../src/testing/index.ts';
import { calls, cues, lastCall, open, tid, title } from './helpers.ts';

test('title: Play and a mission row brief the mission, Continue loads the save, every row is open', async ({ page }) => {
  await open(page, 'title-continue');
  await expect(tid(page, 'mission-dumbarton')).toBeEnabled();
  await tid(page, 'title-continue').click();
  expect(await lastCall(page)).toEqual({ name: 'session.load', args: ['auto'] });
  await open(page, 'title');
  await tid(page, 'title-play').click();
  expect(await lastCall(page)).toEqual({ name: 'session.brief', args: ['the-portal'] });
  await expect(tid(page, 'screen-briefing')).toBeVisible();
  await tid(page, 'brief-back').click();
  expect((await lastCall(page)).name).toBe('session.toTitle');
  await tid(page, 'mission-sandbox').click();
  expect(await lastCall(page)).toEqual({ name: 'session.brief', args: ['sandbox'] });
  await tid(page, 'brief-start').click();
  expect(await lastCall(page)).toEqual({ name: 'session.start', args: ['sandbox'] });
  await expect(tid(page, 'topbar')).toBeVisible();
});

test('title: the credits link opens the credits sheet', async ({ page }) => {
  await open(page, 'title');
  await tid(page, 'title-credits').click();
  await expect(tid(page, 'credits')).toContainText('OpenStreetMap contributors');
  await expect(tid(page, 'credits')).toContainText('Overture Maps Foundation');
  await expect(tid(page, 'credits')).toContainText('U.S. Geological Survey');
});

test('top bar: speed buttons, panel buttons', async ({ page }) => {
  await open(page, 'approvals');
  await expect(tid(page, 'speed-10')).toHaveAttribute('aria-pressed', 'true');
  for (const sp of [0, 1, 100]) {
    await tid(page, `speed-${sp}`).click();
    expect(await lastCall(page)).toEqual({ name: 'time.setSpeed', args: [sp] });
    await expect(tid(page, `speed-${sp}`)).toHaveAttribute('aria-pressed', 'true');
  }
  for (const p of ['reforms', 'receipt', 'menu', 'project']) {
    await tid(page, `nav-${p}`).click();
    await expect(tid(page, `panel-${p}`)).toBeVisible();
  }
  await tid(page, 'nav-project').click();
  await expect(tid(page, 'panel-project')).toHaveCount(0);
  await tid(page, 'nav-menu').click();
  await tid(page, 'panel-close').click();
  await expect(tid(page, 'panel-menu')).toHaveCount(0);
  expect(await cues(page)).toContain('ui.open');
  expect(await cues(page)).toContain('ui.close');
});

test('objective strip: the next-action button sends the command of the snapshot', async ({ page }) => {
  await open(page, 'gate');
  await expect(tid(page, 'next-action')).toHaveText('Go to tender');
  await tid(page, 'next-action').click();
  expect(await lastCall(page)).toEqual({ name: 'sim.command', args: [{ t: 'advancePhase', projectId: 'portal' }] });
  await open(page, 'plan-empty');
  await tid(page, 'next-action').click();
  expect((await lastCall(page)).args[0]).toBe('plan');
  await expect(tid(page, 'toolpanel-plan')).toBeVisible();
});

test('toolbar: tools toggle, an unavailable tool is disabled with its reason, view toggles, bookmarks', async ({ page }) => {
  await open(page, 'project-draft');
  await expect(tid(page, 'tool-drive')).toBeDisabled();
  await expect(tid(page, 'tool-drive')).toHaveAttribute('title', 'No machine to drive yet. Launch the TBM first.');
  await tid(page, 'tool-dig').click();
  expect((await lastCall(page)).args[0]).toBe('dig');
  await expect(tid(page, 'tool-dig')).toHaveAttribute('aria-pressed', 'true');
  await tid(page, 'tool-dig').click();
  expect(await lastCall(page)).toEqual({ name: 'tools.activate', args: [null, undefined] });
  await tid(page, 'view-xray').click();
  expect(await lastCall(page)).toEqual({ name: 'view.set', args: [{ xray: true }] });
  await tid(page, 'view-cut').click();
  expect(await lastCall(page)).toEqual({ name: 'view.set', args: [{ cut: true }] });
  await tid(page, 'view-cut-down').click();
  expect(await lastCall(page)).toEqual({ name: 'view.set', args: [{ cutY: -1 }] });
  await tid(page, 'view-cut-up').click();
  expect(await lastCall(page)).toEqual({ name: 'view.set', args: [{ cutY: 0 }] });
  await tid(page, 'views').click();
  await tid(page, 'view-bay').click();
  expect(await lastCall(page)).toEqual({ name: 'camera.goTo', args: ['bay'] });
  await expect(tid(page, 'views-menu')).toHaveCount(0);
});

test('plan panel: official alignment, depth slider, disabled Finish with its reason, design link', async ({ page }) => {
  await open(page, 'plan');
  await tid(page, 'cmd-plan.useOfficial').click();
  expect(await lastCall(page)).toEqual({ name: 'tools.invoke', args: ['plan.useOfficial'] });
  await tid(page, 'cmd-plan.clear').click();
  expect(await lastCall(page)).toEqual({ name: 'tools.invoke', args: ['plan.clear'] });
  await tid(page, 'cmd-plan.depthAll').click();
  expect(await lastCall(page)).toEqual({ name: 'tools.invoke', args: ['plan.depthAll'] });
  await expect(tid(page, 'cmd-plan.finish')).toBeDisabled();
  await expect(tid(page, 'cmd-plan.finish')).toHaveAttribute('title', 'Fix the curve at waypoint 3 first');
  await tid(page, 'opt-plan.depthM').fill('31');
  expect(await lastCall(page)).toEqual({ name: 'tools.setOption', args: ['plan.depthM', 31] });
  await expect(tid(page, 'opt-value-plan.depthM')).toHaveText('31 m');
  await tid(page, 'open-design').click();
  await expect(tid(page, 'panel-design')).toBeVisible();
  await tid(page, 'tool-close').click();
  expect(await lastCall(page)).toEqual({ name: 'tools.activate', args: [null, undefined] });
});

test('station and dig panels: template choice, removal, brush radius', async ({ page }) => {
  await open(page, 'station');
  await expect(tid(page, 'opt-station.template-undergroundDeepMined')).toBeDisabled();
  await tid(page, 'opt-station.template-surface').click();
  expect(await lastCall(page)).toEqual({ name: 'tools.setOption', args: ['station.template', 'surface'] });
  await tid(page, 'remove-station-fourth-townsend').click();
  expect(await lastCall(page)).toEqual({
    name: 'sim.command',
    args: [{ t: 'removeStation', projectId: 'portal', stationId: 'fourth-townsend' }],
  });
  await open(page, 'dig');
  await tid(page, 'opt-dig.radiusM').fill('6');
  expect(await lastCall(page)).toEqual({ name: 'tools.setOption', args: ['dig.radiusM', 6] });
});

test('design chooser: an open option sends setDesign, a locked one cannot be picked and links to reforms', async ({ page }) => {
  await open(page, 'design');
  await tid(page, 'design-minedCavern').click();
  expect(await lastCall(page)).toEqual({ name: 'sim.command', args: [{ t: 'setDesign', projectId: 'portal', tunnel: 'minedCavern' }] });
  const before = (await calls(page)).length;
  await tid(page, 'design-compactBox').click({ force: true });
  await tid(page, 'design-twinBore').click({ force: true });
  expect((await calls(page)).length).toBe(before);
  await tid(page, `design-unlock-${FIXTURE_REFORMS.compactBox}`).click();
  // The sheet opens on the reform the link names.
  await expect(tid(page, `reform-body-${FIXTURE_REFORMS.compactBox}`)).toBeVisible();
  await expect(tid(page, 'panel-reforms')).toBeVisible();
});

test('project panel: approve, gates, watch and drive a heading', async ({ page }) => {
  await open(page, 'project-draft');
  await tid(page, 'project-action').click();
  expect(await lastCall(page)).toEqual({ name: 'sim.command', args: [{ t: 'approveProject', projectId: 'portal' }] });
  await open(page, 'open');
  await expect(tid(page, 'project-action')).toHaveText('Open the line');
  await tid(page, 'project-action').click();
  expect(await lastCall(page)).toEqual({ name: 'sim.command', args: [{ t: 'openLine', projectId: 'portal' }] });
  await open(page, 'build');
  await tid(page, 'watch-portal/front-1').click();
  expect(await lastCall(page)).toEqual({
    name: 'camera.follow',
    args: [{ entity: { type: 'tbm', id: 'portal/front-1' }, mode: 'cutaway' }],
  });
  await tid(page, 'drive-portal/front-1').click();
  expect(await lastCall(page)).toEqual({ name: 'tools.activate', args: ['drive', { 'drive.headingId': 'portal/front-1' }] });
  await expect(tid(page, 'drive-hud')).toBeVisible();
});

test('reforms: one list sorted by saving, each row says what it saves and costs, Enact sends the command from the row', async ({
  page,
}) => {
  await open(page, 'reforms');
  // No tabs, no call-out: one list.
  await expect(page.locator('[role="tab"]')).toHaveCount(0);
  const reforms = await page.evaluate(() => window.__ui?.services.sim.snapshot.get().reforms ?? []);
  const { list, noEffect } = reformList(reforms);
  const shown = await tid(page, 'reform-list')
    .locator('> li')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(shown).toEqual(list.map((r) => `reform-${r.id}`));
  // The row itself: title, saving, months sooner, capital, Enact.
  const top = list[0];
  if (top === undefined || top.preview === null) throw new Error('the fixture has no open reform with a preview');
  const row = tid(page, `reform-${top.id}`);
  await expect(row).toContainText(top.title);
  await expect(tid(page, `reform-fx-${top.id}`)).toHaveText(/^saves \$[\d.,]+[KMB]?, \d+(\.\d+)? (days?|months|years) sooner$/);
  await expect(tid(page, `reform-cost-${top.id}`)).toHaveText(`costs ${top.cost.pc} PC`);
  // Enact is on the row, without opening it.
  const buy = list.find((r) => r.affordable);
  if (buy === undefined) throw new Error('the fixture has no affordable reform');
  await expect(tid(page, `reform-body-${buy.id}`)).toHaveCount(0);
  await tid(page, `enact-${buy.id}`).click();
  expect(await lastCall(page)).toEqual({ name: 'sim.command', args: [{ t: 'enactReform', id: buy.id }] });
  // The row opens to the fine print: description, effects, preview, no source fragment in the player copy.
  await tid(page, `reform-head-${buy.id}`).click();
  const body = tid(page, `reform-body-${buy.id}`);
  await expect(body).toContainText(buy.description);
  await expect(body.locator('.bv-evidence')).toHaveCount(0);
  await expect(tid(page, `reform-preview-${buy.id}`)).toContainText('Cost');
  await expect(tid(page, `reform-preview-${buy.id}`)).toContainText('Opens');
  await expect(tid(page, `enact-${buy.id}`)).toHaveCount(1);
  // A reform that reports a prerequisite still says so and cannot be enacted.
  const locked = FIXTURE_REFORMS.locked;
  await tid(page, `reform-head-${locked}`).click();
  await expect(tid(page, `enact-${locked}`)).toBeDisabled();
  await expect(tid(page, `reform-blocked-${locked}`)).toHaveText(`Needs ${title(FIXTURE_REFORMS.lockedNeeds)} first`);
  await expect(tid(page, `reform-body-${locked}`)).toContainText(`Needs first: ${title(FIXTURE_REFORMS.lockedNeeds)}.`);
  // One without a prerequisite says nothing about one.
  await tid(page, `reform-head-${buy.id}`).click();
  await expect(tid(page, `reform-body-${buy.id}`)).not.toContainText('Needs');
  // An enacted reform is in the list, marked, with nothing to press.
  const done = FIXTURE_REFORMS.enacted[0];
  await expect(tid(page, `reform-${done}`)).toContainText('Enacted');
  await expect(tid(page, `enact-${done}`)).toHaveCount(0);
  // The reforms of no effect on this line are folded away at the bottom.
  expect(noEffect.map((r) => r.id).sort()).toEqual([...FIXTURE_REFORMS.quiet].sort());
  await expect(tid(page, 'reforms-noeffect')).toHaveText(`No effect on this line (${noEffect.length})`);
  await expect(tid(page, 'reforms-noeffect')).toHaveAttribute('aria-expanded', 'false');
  await expect(tid(page, `reform-${noEffect[0]?.id}`)).toHaveCount(0);
  await tid(page, 'reforms-noeffect').click();
  for (const r of noEffect) await expect(tid(page, `reform-${r.id}`)).toBeVisible();
});

test('the twin bore reform says it switches the line itself: no trip to the design chooser', async ({ page }) => {
  await open(page, 'reforms');
  const id = FIXTURE_REFORMS.twinBore;
  await tid(page, `reform-head-${id}`).click();
  // The fixture line is a twin bore already: nothing to switch, nothing said.
  await expect(tid(page, `reform-body-${id}`)).toBeVisible();
  await expect(tid(page, `reform-picks-${id}`)).toHaveCount(0);
  // The same line drawn as the official cavern, before tender (frozen: false) and after it.
  const cavern = (frozen: boolean): Promise<void> =>
    page.evaluate((isFrozen) => {
      const ui = window.__ui;
      if (ui === undefined) throw new Error('dev page: window.__ui is missing');
      const s = ui.services.sim.snapshot.get();
      ui.services.setSnapshot({
        ...s,
        projects: s.projects.map((p) => ({
          ...p,
          design: {
            ...p.design,
            frozen: isFrozen,
            tunnel: 'minedCavern',
            options: p.design.options.map((o) => (o.group === 'tunnel' ? { ...o, selected: o.id === 'minedCavern' } : o)),
          },
        })),
      });
    }, frozen);
  await cavern(true);
  await expect(tid(page, `reform-body-${id}`)).toBeVisible();
  await expect(tid(page, `reform-picks-${id}`)).toHaveCount(0);
  await cavern(false);
  await expect(tid(page, `reform-picks-${id}`)).toHaveText('Enacting it switches this line to: Twin bore, 6.6 m.');
  await expect(tid(page, `reform-body-${id}`)).not.toContainText('design chooser');
  // Another design reform still points at the chooser, where its option is picked.
  await tid(page, `reform-head-${FIXTURE_REFORMS.compactBox}`).click();
  await expect(tid(page, `reform-body-${FIXTURE_REFORMS.compactBox}`)).toContainText('Unlocks in the design chooser: Compact Polish box.');
});

test('event card: an affordable option resolves the event, an unaffordable one is disabled', async ({ page }) => {
  await open(page, 'event');
  await expect(tid(page, 'event-option-settle')).toBeDisabled();
  await tid(page, 'event-option-litigate').click();
  expect(await lastCall(page)).toEqual({ name: 'sim.command', args: [{ t: 'resolveEvent', eventId: 7, optionId: 'litigate' }] });
});

test('drive hud: autopilot toggle and release', async ({ page }) => {
  await open(page, 'drive');
  await expect(tid(page, 'drive-autopilot')).toHaveText('Manual');
  await tid(page, 'drive-toggle-autopilot').click();
  expect(await lastCall(page)).toEqual({ name: 'sim.command', args: [{ t: 'tbmControl', headingId: 'portal/front-1', autopilot: true }] });
  await tid(page, 'drive-release').click();
  expect(await lastCall(page)).toEqual({ name: 'tools.invoke', args: ['drive.release'] });
});

test('receipt: a reform that is not enacted links to the reform tree', async ({ page }) => {
  await open(page, 'receipt');
  await expect(tid(page, 'ratio-yours')).toHaveText('13.4x');
  await tid(page, `receipt-reform-${FIXTURE_REFORMS.onReceipt}`).click();
  await expect(tid(page, 'panel-reforms')).toBeVisible();
});

test('scorecard: next mission, keep playing, mission select', async ({ page }) => {
  await open(page, 'scorecard');
  await tid(page, 'score-next').click();
  expect((await lastCall(page)).name).toBe('session.nextMission');
  await tid(page, 'score-title').click();
  expect((await lastCall(page)).name).toBe('session.toTitle');
  await open(page, 'scorecard');
  await tid(page, 'score-keep').click();
  expect((await lastCall(page)).name).toBe('session.keepPlaying');
  await expect(tid(page, 'topbar')).toBeVisible();
});

test('menu: save, restart with confirmation, mission select, sound, help, credits', async ({ page }) => {
  await open(page, 'menu');
  await tid(page, 'menu-save').click();
  expect((await lastCall(page)).name).toBe('session.save');
  await expect(tid(page, 'toasts')).toContainText('Saved: The Portal, 4 Aug 2031');
  await tid(page, 'menu-restart').click();
  expect((await calls(page)).map((c) => c.name)).not.toContain('session.restart');
  await tid(page, 'menu-restart-cancel').click();
  await tid(page, 'menu-restart').click();
  await tid(page, 'menu-restart-confirm').click();
  expect((await lastCall(page)).name).toBe('session.restart');
  await tid(page, 'nav-menu').click();
  await tid(page, 'menu-mute').click();
  expect(await lastCall(page)).toEqual({ name: 'audio.setMuted', args: [true] });
  await expect(tid(page, 'menu-mute')).toHaveText('Sound is off');
  await tid(page, 'menu-help').click();
  await expect(tid(page, 'panel-help')).toContainText('autopilot');
  await tid(page, 'help-back').click();
  await tid(page, 'menu-credits').click();
  await expect(tid(page, 'credits')).toBeVisible();
  await tid(page, 'panel-close').click();
  await tid(page, 'nav-menu').click();
  await tid(page, 'menu-missions').click();
  expect((await lastCall(page)).name).toBe('session.toTitle');
  await expect(tid(page, 'screen-title')).toBeVisible();
});

test('a service that throws becomes a red toast with its message', async ({ page }) => {
  await open(page, 'menu');
  await page.evaluate(() => window.__ui?.services.failNext('session.save', 'save failed: storage quota exceeded for slot "auto"'));
  await tid(page, 'menu-save').click();
  await expect(tid(page, 'toasts').locator('.is-bad')).toHaveText('save failed: storage quota exceeded for slot "auto"');
  expect(await cues(page)).toContain('ui.error');
});

test('feed items and rejected commands show as toasts, a breakthrough as the banner', async ({ page }) => {
  await open(page, 'breakthrough');
  await expect(tid(page, 'banner')).toContainText('Breakthrough');
  await expect(tid(page, 'banner')).toContainText('TBM Emperor Norton reached the Salesforce Transit Center');
  const toasts = tid(page, 'toasts').locator('.bv-toast');
  await expect(toasts).toHaveCount(3);
  await expect(toasts.nth(2)).toHaveText('Costs 30 political capital, you have 22');
  await toasts.nth(0).click();
  await expect(toasts).toHaveCount(2);
});
