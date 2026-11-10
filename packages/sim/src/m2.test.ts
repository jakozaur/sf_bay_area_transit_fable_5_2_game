/** M2: backlash posts, the specustawa and the 2x Poland target, on the synthetic scenario. */
import { describe, expect, test } from 'vitest';
import {
  createSim,
  type GameCommand,
  type GameSim,
  hashState,
  loadSim,
  PHASES,
  POLAND_PROFILE,
  phaseDays,
  profileFor,
  REFORMS,
  type SimState,
  SOCIAL_HANDLES,
  SOCIAL_POSTS_KEPT,
  SOCIAL_TEMPLATE_COUNT,
  SOCIAL_TEMPLATES,
} from './index.ts';
import { TEST_DESIGN, TEST_PROJECT, testScenario } from './test-scenario.ts';

const EM_DASH = String.fromCharCode(0x2014);
const rich = () => testScenario({ start: { ...testScenario().start, politicalCapital: 1000, budgetCents: 1e13 } });
const enact = (id: string): GameCommand => ({ t: 'enactReform', id });

/** Every reform that costs political capital, prerequisites first. */
function spendingSpree(sim: GameSim): number {
  let spends = 0;
  for (let pass = 0; pass < 6; pass++) {
    for (const r of REFORMS) {
      if (sim.state.reforms.includes(r.id) || !r.prereqs.every((p) => sim.state.reforms.includes(p))) continue;
      sim.dispatch([enact(r.id)]);
      if (r.cost.pc > 0) spends++;
    }
  }
  return spends;
}

describe('social media backlash', () => {
  test('at least 30 distinct templates, invented handles, no em-dash', () => {
    const all = Object.values(SOCIAL_TEMPLATES).flat();
    expect(SOCIAL_TEMPLATE_COUNT).toBe(all.length);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(30);
    for (const group of ['specustawa', 'permitting', 'procurement', 'design', 'tunnelling', 'eventSettle', 'eventFunding', 'any'])
      expect(SOCIAL_TEMPLATES[group]?.length, group).toBeGreaterThan(0);
    for (const t of all) {
      expect(t.includes(EM_DASH), t).toBe(false);
      expect(t).toMatch(/dictator|tyrant|despot|autocrat|tsar|ugly|emperor/i);
    }
    expect(new Set(SOCIAL_HANDLES).size).toBe(SOCIAL_HANDLES.length);
    for (const h of SOCIAL_HANDLES) expect(h).toMatch(/^@[A-Za-z0-9_]{12,}$/);
  });

  test('a post appears exactly when political capital is spent, tied to what was done', () => {
    const sim = createSim(rich(), 7);
    expect(sim.snapshot().socialPosts).toEqual([]);
    // Cash only: no capital spent, no post.
    sim.dispatch([enact('potholeFirst')]);
    expect(sim.snapshot().socialPosts).toEqual([]);
    sim.dispatch([enact('stageGates')]);
    const one = sim.snapshot().socialPosts ?? [];
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ id: 1, tick: 0, cause: 'reform:stageGates' });
    expect(SOCIAL_HANDLES).toContain(one[0].handle);
    expect(one[0].text).toContain('Stage gates and business cases');
    expect(one[0].text).not.toContain('{what}');
    // A refused or repeated command spends nothing and says nothing.
    sim.dispatch([enact('stageGates'), enact('railSpecustawa')]);
    expect(sim.snapshot().socialPosts).toHaveLength(1);
    sim.dispatch([enact('specustawa')]);
    const two = sim.snapshot().socialPosts ?? [];
    expect(two).toHaveLength(2);
    expect(two[1]).toMatchObject({ id: 2, cause: 'reform:specustawa' });
    expect(SOCIAL_TEMPLATES.specustawa).toContain(two[1].text);
    expect(two[1].handle).not.toBe(two[0].handle);
  });

  test('the same seed and commands give the same posts; another seed gives others; the event dice are untouched', () => {
    const play = (seed: number) => {
      const sim = createSim(rich(), seed);
      const spends = spendingSpree(sim);
      return { sim, spends };
    };
    const a = play(3);
    const b = play(3);
    const c = play(4);
    expect(a.spends).toBeGreaterThan(SOCIAL_POSTS_KEPT);
    const posts = a.sim.snapshot().socialPosts ?? [];
    expect(posts).toEqual(b.sim.snapshot().socialPosts);
    expect(a.sim.hash()).toBe(b.sim.hash());
    expect(posts.map((p) => p.text + p.handle)).not.toEqual((c.sim.snapshot().socialPosts ?? []).map((p) => p.text + p.handle));
    // The last 20 are kept, ids keep rising, and no two neighbours are the same post or the same account.
    expect(posts).toHaveLength(SOCIAL_POSTS_KEPT);
    expect(posts.at(-1)?.id).toBe(a.spends);
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i].id).toBe(posts[i - 1].id + 1);
      expect(posts[i].handle).not.toBe(posts[i - 1].handle);
      expect(posts[i].text).not.toBe(posts[i - 1].text);
    }
    expect(new Set(posts.map((p) => p.text)).size).toBeGreaterThan(SOCIAL_POSTS_KEPT / 2);
    // Posts come from their own generator: the sim's dice are where a game without reforms has them.
    const quiet = createSim(rich(), 3);
    expect(a.sim.state.rng).toEqual(quiet.state.rng);
  });

  test('posts survive save and load, a restart clears them, and a save from before M2 loads without them', () => {
    const sim = createSim(rich(), 5);
    sim.dispatch([...TEST_DESIGN, enact('twoTracks'), enact('bestValueAward')]);
    sim.run(40);
    const loaded = loadSim(sim.save());
    expect(loaded.snapshot().socialPosts).toEqual(sim.snapshot().socialPosts);
    loaded.dispatch([enact('openTenders')]);
    sim.dispatch([enact('openTenders')]);
    expect(loaded.snapshot().socialPosts).toEqual(sim.snapshot().socialPosts);
    expect(loaded.hash()).toBe(sim.hash());
    const old = createSim(rich(), 5);
    const save = old.save();
    const state = save.sim as unknown as Record<string, unknown>;
    delete state.socialPosts;
    delete state.nextSocialId;
    const before = loadSim({ ...save, stateHash: hashState(save.sim as SimState) });
    expect(before.snapshot().socialPosts).toEqual([]);
    before.dispatch([enact('stageGates')]);
    expect(before.snapshot().socialPosts).toHaveLength(1);
    sim.dispatch([{ t: 'startScenario' }]);
    expect(sim.snapshot().socialPosts).toEqual([]);
    sim.dispatch([enact('stageGates')]);
    expect(sim.snapshot().socialPosts?.[0].id).toBe(1);
  });

  test('capital spent on an event card posts too', () => {
    let sim = createSim(testScenario(), 1);
    for (let seed = 1; seed < 400; seed++) {
      sim = createSim(testScenario(), seed);
      sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
      sim.run(700, (s) => (s.state.pendingEvents.length > 0 ? false : []));
      if (sim.state.pendingEvents[0]?.defId === 'lawsuit') break;
    }
    const card = sim.snapshot().events[0];
    expect(card.id).toBe('lawsuit');
    sim.dispatch([{ t: 'resolveEvent', eventId: card.uid, optionId: 'litigate' }]);
    expect(sim.snapshot().socialPosts).toEqual([]);
    const again = createSim(testScenario(), sim.state.seed);
    again.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    again.run(700, (s) => (s.state.pendingEvents.length > 0 ? false : []));
    again.dispatch([{ t: 'resolveEvent', eventId: again.snapshot().events[0].uid, optionId: 'settle' }]);
    const posts = again.snapshot().socialPosts ?? [];
    expect(posts).toHaveLength(1);
    expect(posts[0].cause).toBe('event:lawsuit:settle');
    expect(posts[0].text).toContain('Settle and redesign the driveway');
  });
});

describe('the specustawa and the aggressive schedule options', () => {
  test('the specustawa is the dearest reform in political capital, needs nothing first, and is not Polish practice', () => {
    const spec = REFORMS.find((r) => r.id === 'specustawa');
    if (!spec) throw new Error('no specustawa');
    expect(spec.cost.pc).toBe(Math.max(...REFORMS.map((r) => r.cost.pc)));
    expect(spec.prereqs).toEqual([]);
    expect(spec.beyondPoland).toBe(true);
    expect(POLAND_PROFILE).not.toContain('specustawa');
    for (const id of ['emergencyAward', 'parallelWorks']) {
      const r = REFORMS.find((x) => x.id === id);
      expect(r?.beyondPoland, id).toBe(true);
      // Honest costs: capital and cash.
      expect(r?.cost.pc, id).toBeGreaterThan(0);
      expect(r?.cost.cents, id).toBeGreaterThan(0);
      expect(POLAND_PROFILE).not.toContain(id);
    }
    for (const r of REFORMS) for (const text of [r.title, r.description, r.evidence]) expect(text.includes(EM_DASH), r.id).toBe(false);
  });

  test('inside the zone the permit phases take no time: one day each, the day the act is signed', () => {
    const p = profileFor(['specustawa']);
    expect(p['time.planning']).toBe(0);
    expect(p['time.permitting']).toBe(0);
    expect(p['event.lawsuit.rate']).toBe(0);
    expect(phaseDays('planning', p)).toBe(1);
    expect(phaseDays('permitting', p)).toBe(1);
    // Whatever else is enacted, and in whatever order.
    const all = profileFor([...REFORMS.map((r) => r.id)].reverse());
    expect(all['time.planning']).toBe(0);
    expect(all['time.permitting']).toBe(0);

    const days = (reforms: string[]) => {
      const sim = createSim(testScenario({ start: { ...testScenario().start, policies: reforms } }), 1, null, { events: false });
      sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
      let tender = -1;
      sim.run(365 * 12, (s) => {
        const project = s.state.projects[0];
        if (PHASES.indexOf(project.phase) >= PHASES.indexOf('procurement') || project.awaiting === 'advancePhase') {
          tender = s.state.tick;
          return false;
        }
        return [];
      });
      return tender;
    };
    // Status quo: 48 months of planning and 38 of permitting before the tender gate. In the zone: two days.
    expect(days([])).toBeGreaterThan(365 * 7);
    expect(days(['specustawa'])).toBeLessThanOrEqual(3);
  });

  test('the clock keeps running through a phase the zone removed', () => {
    const sim = createSim(testScenario({ start: { ...testScenario().start, policies: ['specustawa'] } }), 1, null, { events: false });
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    const clock = sim.clock();
    expect(clock.hold).toBeNull();
    expect(clock.daysPerSecond).toBeGreaterThan(0);
  });
});

describe('the 2x Poland target on the scorecard', () => {
  test('polandTarget is the two ratios of the scorecard columns, with the limit 2', () => {
    const sim = createSim(testScenario(), 1, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    const card = sim.snapshot().projects[0].scorecard;
    const t = card.polandTarget;
    if (!t) throw new Error('no polandTarget');
    expect(t.limit).toBe(2);
    expect(t.costRatio).toBeCloseTo(card.yours.costCents / card.poland.costCents, 12);
    expect(t.timeRatio).toBeCloseTo(card.yours.yearsToOpen / card.poland.yearsToOpen, 12);
    // The status quo is far over on cost.
    expect(t.costRatio).toBeGreaterThan(2);
    expect(t.met).toBe(false);
  });

  test('Poland itself meets it: both ratios are 1 within rounding', () => {
    const sim = createSim(testScenario({ costProfile: 'polishBaseline' }), 1, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    const t = sim.snapshot().projects[0].scorecard.polandTarget;
    expect(t?.costRatio).toBeGreaterThan(0.9);
    expect(t?.costRatio).toBeLessThan(1.1);
    expect(t?.timeRatio).toBeGreaterThan(0.9);
    expect(t?.timeRatio).toBeLessThan(1.1);
    expect(t?.met).toBe(true);
  });
});
