import type { FeedItem } from '@bayvox/sim';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createUiStore } from './index.ts';
import { actionButton, missionProject, safeRatio, selectTool, visibleLines } from './model.ts';
import { nextMissionToPlay } from './screens.tsx';
import { BANNER_MS, createStore, TOAST_MS } from './store.ts';
import { createFakeServices, SCENES, snapshot } from './testing/index.ts';

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

const feed = (seq: number, kind: FeedItem['kind'], text: string): FeedItem => ({
  seq,
  tick: 1,
  kind,
  projectId: null,
  subjectId: null,
  text,
});
const fake = (id: keyof typeof SCENES) => createFakeServices(SCENES[id]);

test('the store mirrors every Readable and drops its subscriptions on dispose', () => {
  const services = fake('plan');
  const store = createUiStore(services);
  expect(store.snapshot.value).toBe(services.sim.snapshot.get());
  expect(store.tool.value.id).toBe('plan');
  services.time.setSpeed(100);
  expect(store.speed.value).toBe(100);
  services.view.set({ xray: true });
  expect(store.view.value.xray).toBe(true);
  services.setSession({ ...services.session.state.get(), screen: 'scorecard' });
  expect(store.session.value.screen).toBe('scorecard');
  expect(services.subscriptions()).toBeGreaterThan(0);
  store.dispose();
  expect(services.subscriptions()).toBe(0);
});

test('new feed items become toasts once, a breakthrough becomes the banner, and both expire', () => {
  const services = fake('drive');
  const store = createStore(services);
  services.setSnapshot(
    snapshot({ stage: 'build', feed: [feed(1, 'fundingReleased', 'Grant released'), feed(2, 'breakthrough', 'Through')] }),
  );
  expect(store.toasts.value.map((t) => [t.text, t.tone])).toEqual([['Grant released', 'good']]);
  expect(store.banner.value?.text).toBe('Through');
  expect(store.feedSeen.value).toBe(2);
  // The same feed again shows nothing new.
  services.setSnapshot(
    snapshot({ stage: 'build', feed: [feed(1, 'fundingReleased', 'Grant released'), feed(2, 'breakthrough', 'Through')] }),
  );
  expect(store.toasts.value).toHaveLength(1);
  vi.advanceTimersByTime(BANNER_MS);
  expect(store.banner.value).toBeNull();
  vi.advanceTimersByTime(TOAST_MS);
  expect(store.toasts.value).toEqual([]);
  store.dispose();
});

test('feed items present at mount are history; a restart rewinds feedSeen', () => {
  const services = createFakeServices({
    ...SCENES.drive,
    snapshot: snapshot({ stage: 'build', feed: [feed(7, 'tbmLaunched', 'old news')] }),
  });
  const store = createStore(services);
  expect(store.toasts.value).toEqual([]);
  expect(store.feedSeen.value).toBe(7);
  services.setSnapshot(snapshot({ stage: 'plan', feed: [] }));
  expect(store.feedSeen.value).toBe(0);
  services.setSnapshot(snapshot({ stage: 'plan', feed: [feed(1, 'projectApproved', 'Approved')] }));
  expect(store.toasts.value.map((t) => t.text)).toEqual(['Approved']);
  store.dispose();
});

test('a rejected command (snapshot notice) shows once as a red toast', () => {
  const services = fake('reforms');
  const store = createStore(services);
  const notices = [{ tick: 3, command: 'enactReform', reason: 'Costs 30 political capital, you have 12' }];
  services.setSnapshot(snapshot({ stage: 'approvals', notices }));
  services.setSnapshot(snapshot({ stage: 'approvals', notices }));
  expect(store.toasts.value.map((t) => [t.text, t.tone])).toEqual([['Costs 30 political capital, you have 12', 'bad']]);
  store.dispose();
});

test('opening and closing a panel plays the cues', () => {
  const services = fake('plan');
  const store = createStore(services);
  store.openPanel('reforms');
  store.openPanel('reforms');
  store.openPanel(null);
  expect(services.calls.map((c) => c.args[0])).toEqual(['ui.open', 'ui.close']);
  store.dispose();
});

test('selecting an unavailable tool says why and does not call the tool port', () => {
  const services = fake('plan');
  const store = createStore(services);
  selectTool(store, 'drive');
  expect(services.names()).not.toContain('tools.activate');
  expect(store.toasts.value.map((t) => t.text)).toEqual(['No machine to drive yet. Launch the TBM first.']);
  selectTool(store, 'dig');
  expect(services.last('tools.activate')[0]).toBe('dig');
  store.dispose();
});

test('the next-action button: a command dispatches it under the gate label, a focus opens the tool or panel', () => {
  const gate = fake('gate');
  const gateStore = createStore(gate);
  const b = actionButton(gateStore, gateStore.snapshot.value.nextAction);
  expect(b?.label).toBe('Go to tender');
  b?.run();
  expect(gate.last('sim.command')).toEqual([{ t: 'advancePhase', projectId: 'portal' }]);
  gateStore.dispose();

  const plan = fake('plan-empty');
  const planStore = createStore(plan);
  const p = actionButton(planStore, planStore.snapshot.value.nextAction);
  expect(p?.label).toBe('Draw the alignment');
  p?.run();
  expect(plan.last('tools.activate')[0]).toBe('plan');
  // The tool is now active: nothing left to press.
  expect(actionButton(planStore, planStore.snapshot.value.nextAction)).toBeNull();
  planStore.dispose();

  const wait = createFakeServices({ ...SCENES.approvals, speed: 0 });
  const waitStore = createStore(wait);
  const w = actionButton(waitStore, waitStore.snapshot.value.nextAction);
  expect(w?.label).toBe('Resume time');
  w?.run();
  expect(wait.names()).toContain('time.togglePause');
  expect(actionButton(waitStore, waitStore.snapshot.value.nextAction)).toBeNull();
  waitStore.dispose();
});

test('helpers: mission project, visible receipt lines, safe ratio, the mission Play starts', () => {
  const s = SCENES.receipt.snapshot;
  const project = missionProject(s);
  expect(project?.id).toBe('portal');
  expect(missionProject(SCENES['plan-empty'].snapshot)).toBeNull();
  const ids = visibleLines(project?.receipt.lines ?? []).map((l) => l.id);
  expect(ids).toContain('priceLevel');
  expect(ids).not.toContain('offPlan');
  expect(safeRatio(10, 4)).toBe(2.5);
  expect(safeRatio(10, 0)).toBeNull();
  expect(nextMissionToPlay(SCENES.title.session.missions)?.id).toBe('the-portal');
  expect(nextMissionToPlay(SCENES['title-continue'].session.missions)?.id).toBe('googleplex');
  expect(nextMissionToPlay([])).toBeNull();
});

test('fixture receipts obey the contract: base plus lines equals the column total', () => {
  const r = SCENES.receipt.snapshot.projects[0].receipt;
  for (const id of ['yours', 'statusQuo', 'poland'] as const) {
    const sum = r.lines.reduce((n, l) => n + l.cents[id], r.columns[id].baseCents);
    expect(sum).toBe(r.columns[id].costCents);
  }
  expect(r.ratios.yoursToPoland).toBe(r.columns.yours.costCents / r.columns.poland.costCents);
});
