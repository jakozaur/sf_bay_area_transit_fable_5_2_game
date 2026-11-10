import type { FeedItem } from '@bayvox/sim';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createUiStore } from './index.ts';
import {
  actionButton,
  angryCount,
  missionProject,
  polandTarget,
  postKey,
  postStats,
  reformIsQuiet,
  reformList,
  type SocialPost,
  safeRatio,
  selectTool,
  visibleLines,
} from './model.ts';
import { nextMissionToPlay } from './screens.tsx';
import { BANNER_MS, createStore, POST_STAGGER_MS, TOAST_MS } from './store.ts';
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
  store.openPanel('receipt');
  store.openPanel('receipt');
  store.openPanel(null);
  expect(services.calls.map((c) => c.args[0])).toEqual(['ui.open', 'ui.close']);
  store.dispose();
});

test('time waits while the reform tree or the design chooser is open, and comes back at the speed it had', () => {
  const services = fake('approvals');
  const store = createStore(services);
  const time = (): unknown[] => services.calls.filter((c) => c.name.startsWith('time.')).map((c) => [c.name, ...c.args]);
  expect(services.time.speed.get()).toBe(10);
  store.openPanel('reforms');
  expect(services.time.speed.get()).toBe(0);
  // From one deciding panel to the other: still waiting, nothing sent.
  store.openPanel('design');
  expect(time()).toEqual([['time.setSpeed', 0]]);
  store.openPanel(null);
  expect(services.time.speed.get()).toBe(10);
  expect(time()).toEqual([
    ['time.setSpeed', 0],
    ['time.setSpeed', 10],
  ]);
  // A speed the player sets while the panel is open is theirs: closing does not touch it.
  store.openReform('specustawa');
  services.time.setSpeed(1);
  store.openPanel(null);
  expect(services.time.speed.get()).toBe(1);
  // Reading panels (project, receipt, menu) do not stop the clock.
  store.openPanel('project');
  expect(services.time.speed.get()).toBe(1);
  store.dispose();
});

test('a raised event makes no toast of its own: the card is the notice', () => {
  const services = fake('drive');
  const store = createStore(services);
  const base = services.sim.snapshot.get();
  services.setSnapshot({
    ...base,
    feed: [
      { seq: 1, tick: 1, kind: 'eventRaised', projectId: null, subjectId: 'changeOrder', text: 'Change Order No. 47' },
      { seq: 2, tick: 1, kind: 'eventResolved', projectId: null, subjectId: 'changeOrder', text: 'Change Order No. 47: Pay it.' },
    ],
  });
  expect(store.toasts.value.map((t) => t.text)).toEqual(['Change Order No. 47: Pay it.']);
  expect(store.feedSeen.value).toBe(2);
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

test('backlash posts: closing one hides it, close all hides every post, a restart forgets what was closed', () => {
  const services = fake('drive');
  const base = services.sim.snapshot.get();
  const post = (id: number, tick: number): SocialPost => ({ id, tick, handle: `@voter${id}`, text: `post ${id}`, cause: 'reform' });
  const withPosts = (posts: SocialPost[]) => ({ ...base, socialPosts: posts });
  // Posts already there when the UI mounts are history.
  services.setSnapshot(withPosts([post(1, 3)]));
  const store = createStore(services);
  const open = (): number[] =>
    ((store.snapshot.value as { socialPosts?: SocialPost[] }).socialPosts ?? [])
      .filter((p) => !store.postsClosed.value.has(postKey(p)))
      .map((p) => p.id);
  expect(open()).toEqual([]);
  services.setSnapshot(withPosts([post(1, 3), post(2, 9), post(3, 9), post(4, 12)]));
  expect(open()).toEqual([2, 3, 4]);
  store.closePost(postKey(post(3, 9)));
  expect(open()).toEqual([2, 4]);
  store.closeAllPosts();
  expect(open()).toEqual([]);
  services.setSnapshot(withPosts([post(1, 3), post(2, 9), post(3, 9), post(4, 12), post(5, 20)]));
  expect(open()).toEqual([5]);
  // Restart: ids start over, and the same post at the same tick is news again.
  services.setSnapshot(withPosts([post(1, 3)]));
  expect(open()).toEqual([1]);
  store.dispose();
});

test('a pile-on arrives one post after another, the newest is the fresh one, and close all drops the ones still on their way', () => {
  const services = fake('drive');
  const base = services.sim.snapshot.get();
  const post = (id: number): SocialPost => ({ id, tick: 9, handle: `@voter${id}`, text: `post ${id}`, cause: 'reform:x', burst: 1 });
  const store = createStore(services);
  const pending = (): number => store.postsPending.value.size;
  services.setSnapshot({ ...base, socialPosts: [post(1), post(2), post(3)] });
  expect(pending()).toBe(2);
  expect(store.postFresh.value).toBe(postKey(post(1)));
  vi.advanceTimersByTime(POST_STAGGER_MS);
  expect(pending()).toBe(1);
  expect(store.postFresh.value).toBe(postKey(post(2)));
  vi.advanceTimersByTime(POST_STAGGER_MS);
  expect(pending()).toBe(0);
  expect(store.postFresh.value).toBe(postKey(post(3)));
  expect(services.calls.filter((c) => c.name === 'audio.cue' && c.args[0] === 'event.raised')).toHaveLength(3);
  // Three posters and their likes and reposts: everyone counts.
  expect(angryCount([post(1), { ...post(2), likes: 10, reposts: 2 }])).toBe(1 + postStats(post(1)).likes + postStats(post(1)).reposts + 13);
  // Close all while two of the next pile-on are still on their way: they never show.
  services.setSnapshot({ ...base, socialPosts: [post(1), post(2), post(3), post(4), post(5), post(6)] });
  store.closeAllPosts();
  vi.advanceTimersByTime(POST_STAGGER_MS * 3);
  expect(pending()).toBe(0);
  expect(store.postFresh.value).toBe(postKey(post(4)));
  store.dispose();
});

test('the 2x Poland target falls back to the scorecard columns and is met only when both ratios are within the limit', () => {
  const project = missionProject(SCENES.scorecard.snapshot);
  if (project === null) throw new Error('fixture: the scorecard scene has no project');
  const sc = project.scorecard;
  const t = polandTarget(project);
  expect(t?.costRatio).toBe(sc.yours.costCents / sc.poland.costCents);
  expect(t?.timeRatio).toBe(sc.yours.yearsToOpen / sc.poland.yearsToOpen);
  expect(t?.met).toBe((t?.costRatio ?? 9) <= 2 && (t?.timeRatio ?? 9) <= 2);
  const given = { costRatio: 1.5, timeRatio: 1.9, limit: 2, met: true };
  expect(polandTarget({ ...project, scorecard: { ...sc, polandTarget: given } as typeof sc })).toBe(given);
});

test('fixture receipts obey the contract: base plus lines equals the column total', () => {
  const r = SCENES.receipt.snapshot.projects[0].receipt;
  for (const id of ['yours', 'statusQuo', 'poland'] as const) {
    const sum = r.lines.reduce((n, l) => n + l.cents[id], r.columns[id].baseCents);
    expect(sum).toBe(r.columns[id].costCents);
  }
  expect(r.ratios.yoursToPoland).toBe(r.columns.yours.costCents / r.columns.poland.costCents);
});

test('the reforms sheet is one list, biggest saving on this project first, with the reforms of no effect apart', () => {
  const reforms = SCENES.reforms.snapshot.reforms;
  const { list, noEffect } = reformList(reforms);
  // Every reform is in exactly one of the two groups.
  expect([...list, ...noEffect].map((r) => r.id).sort()).toEqual(reforms.map((r) => r.id).sort());
  expect(noEffect.length).toBeGreaterThan(0);
  for (const r of noEffect) expect(reformIsQuiet(r), r.id).toBe(true);
  const open = list.filter((r) => r.status !== 'enacted');
  expect(open.length).toBeGreaterThan(2);
  for (const r of open) expect(reformIsQuiet(r), r.id).toBe(false);
  for (let i = 1; i < open.length; i++) {
    const a = open[i - 1]?.preview;
    const b = open[i]?.preview;
    if (a === null || a === undefined || b === null || b === undefined) throw new Error('an open reform of the fixture has no preview');
    expect(a.costDeltaCents, `${open[i - 1]?.id} before ${open[i]?.id}`).toBeLessThanOrEqual(b.costDeltaCents);
    if (a.costDeltaCents === b.costDeltaCents) expect(a.daysDelta).toBeLessThanOrEqual(b.daysDelta);
  }
  // The enacted ones close the list.
  expect(list.slice(open.length).every((r) => r.status === 'enacted')).toBe(true);
  // A tie on cost goes to the one that opens the line sooner; a full tie keeps the sim's order.
  const base = open[0];
  const preview = base?.preview;
  if (base === undefined || preview === null || preview === undefined) throw new Error('the fixture has no open reform');
  const tie = (id: string, daysDelta: number) => ({ ...base, id, preview: { ...preview, costDeltaCents: -500, daysDelta } });
  expect(reformList([tie('a', -10), tie('b', -90), tie('c', -10)]).list.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  // No project, no preview: nothing can be sorted or set apart.
  const blind = reforms.map((r) => ({ ...r, preview: null }));
  expect(reformList(blind).noEffect).toEqual([]);
  expect(
    reformList(blind)
      .list.filter((r) => r.status !== 'enacted')
      .map((r) => r.id),
  ).toEqual(reforms.filter((r) => r.status !== 'enacted').map((r) => r.id));
});
