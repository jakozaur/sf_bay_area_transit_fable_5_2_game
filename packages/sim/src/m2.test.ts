/** M2: backlash posts, the specustawa and the 2x Poland target, on the synthetic scenario. */
import { describe, expect, test } from 'vitest';
import {
  advanceRate,
  CONSTANTS,
  createSim,
  designFlags,
  fillSocialTemplate,
  type GameCommand,
  type GameSim,
  type HousingOptionDef,
  hardCost,
  hashState,
  housingHomes,
  housingRiders,
  loadSim,
  PHASES,
  POLAND_PROFILE,
  phaseDays,
  profileFor,
  REFORMS,
  type SimState,
  SOCIAL_BURST_MAX,
  SOCIAL_BURST_MIN,
  SOCIAL_HANDLES,
  SOCIAL_POSTS_KEPT,
  SOCIAL_TEMPLATE_COUNT,
  SOCIAL_TEMPLATES,
} from './index.ts';
import { TEST_DESIGN, TEST_PROJECT, TEST_WAYPOINTS, testScenario } from './test-scenario.ts';

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
  test('at least 80 distinct templates in every group a pile-on draws from, invented handles, no em-dash', () => {
    const all = Object.values(SOCIAL_TEMPLATES).flat();
    expect(SOCIAL_TEMPLATE_COUNT).toBe(all.length);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(80);
    for (const group of [
      'specustawa',
      'permitting',
      'procurement',
      'design',
      'tunnelling',
      'smallBore',
      'housing',
      'eventSettle',
      'eventFunding',
      'any',
      'compare',
      'money',
      'personal',
      'pileOn',
    ])
      expect(SOCIAL_TEMPLATES[group]?.length, group).toBeGreaterThanOrEqual(3);
    // Every cost comparison quotes the amount that was spent.
    for (const t of SOCIAL_TEMPLATES.compare) expect(t, t).toMatch(/\{pc\}/);
    for (const t of SOCIAL_TEMPLATES.money) expect(t, t).toMatch(/\{usd\}/);
    expect(SOCIAL_HANDLES.length).toBeGreaterThanOrEqual(30);
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
    // One spend, one pile-on: 2 to 4 posts from different accounts with the same burst id.
    const one = sim.snapshot().socialPosts ?? [];
    expect(one.length).toBeGreaterThanOrEqual(SOCIAL_BURST_MIN);
    expect(one.length).toBeLessThanOrEqual(SOCIAL_BURST_MAX);
    expect(one[0]).toMatchObject({ id: 1, tick: 0, cause: 'reform:stageGates', burst: 1 });
    expect(one.map((p) => p.id)).toEqual(one.map((_, i) => i + 1));
    expect(new Set(one.map((p) => p.handle)).size).toBe(one.length);
    expect(new Set(one.map((p) => p.text)).size).toBe(one.length);
    for (const p of one) {
      expect(SOCIAL_HANDLES).toContain(p.handle);
      expect(p).toMatchObject({ cause: 'reform:stageGates', burst: 1, tick: 0 });
      expect(p.text).not.toMatch(/\{[a-z]+(:\d+)?\}/);
      expect(Number.isInteger(p.likes) && (p.likes ?? 0) > 0, 'likes').toBe(true);
      expect(Number.isInteger(p.reposts) && (p.reposts ?? -1) >= 0 && (p.reposts ?? 0) <= (p.likes ?? 0), 'reposts').toBe(true);
    }
    expect(one[0].text).toContain('Stage gates and business cases');
    // The second post says what it cost: stage gates cost 20 political capital, and the comparison multiplies that.
    const pc = REFORMS.find((r) => r.id === 'stageGates')?.cost.pc ?? 0;
    expect(pc).toBeGreaterThan(0);
    expect(one[1].text).toContain(`${pc} `);
    // A refused or repeated command spends nothing and says nothing.
    sim.dispatch([enact('stageGates'), enact('railSpecustawa')]);
    expect(sim.snapshot().socialPosts).toHaveLength(one.length);
    sim.dispatch([enact('specustawa')]);
    const two = (sim.snapshot().socialPosts ?? []).slice(one.length);
    expect(two.length).toBeGreaterThanOrEqual(SOCIAL_BURST_MIN);
    expect(two[0]).toMatchObject({ id: one.length + 1, cause: 'reform:specustawa', burst: one.length + 1 });
    expect(SOCIAL_TEMPLATES.specustawa).toContain(two[0].text);
    expect(two.every((p) => p.burst === one.length + 1)).toBe(true);
    expect(two[0].handle).not.toBe(one[one.length - 1].handle);
  });

  test('a cost comparison uses the real amount: the capital times the factor of the template, the cash divided by it', () => {
    const why = { cause: 'reform:x', group: 'any', what: 'The thing', pc: 15, cents: 60 * 1e8 };
    expect(fillSocialTemplate('{pc} on "{what}" is {x:12} cuttings', why)).toBe('15 on "The thing" is 180 cuttings');
    expect(fillSocialTemplate('{usd} is {div:12} burritos', why)).toBe('$60M is 5,000,000 burritos');
    // Cash comparisons are only drawn when cash was spent: a capital-only spend never quotes dollars.
    const sim = createSim(rich(), 11);
    spendingSpree(sim);
    for (const p of sim.snapshot().socialPosts ?? []) {
      const reform = REFORMS.find((r) => `reform:${r.id}` === p.cause);
      if (reform && reform.cost.cents === 0) expect(p.text, p.text).not.toMatch(/\$0\b/);
    }
    // The small bore costs capital and cash: over a few seeds both kinds of comparison turn up, with its own numbers.
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = createSim(rich(), seed);
      s.dispatch([enact('smallBoreLoop')]);
      const posts = s.snapshot().socialPosts ?? [];
      expect(posts[0].cause).toBe('reform:smallBoreLoop');
      expect(SOCIAL_TEMPLATES.smallBore).toContain(posts[0].text.replaceAll('The Vegas-style small bore', '{what}'));
      seen.add(
        posts[1].text.includes('$60M')
          ? 'money'
          : posts[1].text.includes('15 political capital') || posts[1].text.includes('15 favours')
            ? 'capital'
            : 'neither',
      );
    }
    expect([...seen].sort()).toEqual(['capital', 'money']);
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
    expect(a.spends * SOCIAL_BURST_MIN).toBeGreaterThan(SOCIAL_POSTS_KEPT);
    const posts = a.sim.snapshot().socialPosts ?? [];
    expect(posts).toEqual(b.sim.snapshot().socialPosts);
    expect(a.sim.hash()).toBe(b.sim.hash());
    expect(posts.map((p) => p.text + p.handle)).not.toEqual((c.sim.snapshot().socialPosts ?? []).map((p) => p.text + p.handle));
    // The last 40 are kept, ids keep rising, and no two neighbours are the same post or the same account.
    expect(posts).toHaveLength(SOCIAL_POSTS_KEPT);
    expect(posts.at(-1)?.id).toBeGreaterThanOrEqual(a.spends * SOCIAL_BURST_MIN);
    expect(posts.at(-1)?.id).toBeLessThanOrEqual(a.spends * SOCIAL_BURST_MAX);
    // Every spend drew its own pile-on.
    const bursts = new Set(posts.map((p) => p.burst));
    expect(bursts.size).toBeGreaterThanOrEqual(SOCIAL_POSTS_KEPT / SOCIAL_BURST_MAX);
    expect(new Set(posts.map((p) => p.text)).size).toBe(posts.length);
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
    expect(before.snapshot().socialPosts?.length).toBeGreaterThanOrEqual(SOCIAL_BURST_MIN);
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
    expect(posts.length).toBeGreaterThanOrEqual(SOCIAL_BURST_MIN);
    expect(posts.every((p) => p.cause === 'event:lawsuit:settle' && p.burst === 1)).toBe(true);
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

describe('housing beside the line', () => {
  // Station B of the test line is at 20900, -65400.
  const NEAR: HousingOptionDef = {
    id: 'near',
    title: 'Homes at B',
    blurb: 'Blocks at station B.',
    hectares: 10,
    homesPerHectare: 100,
    capitalCost: 30,
    at: { x: 21_400, z: -65_400 },
    source: 'test',
  };
  const FAR: HousingOptionDef = { ...NEAR, id: 'far', title: 'Homes far away', capitalCost: 20, at: { x: 30_000, z: -65_400 } };
  const withHousing = (pc = 100) => testScenario({ housing: [NEAR, FAR], start: { ...testScenario().start, politicalCapital: pc } });
  const house = (optionId: string): GameCommand => ({ t: 'enactHousing', optionId });

  test('homes are land times density, riders are homes times trips times share, and the constants are marked as assumptions', () => {
    expect(housingHomes(NEAR)).toBe(1000);
    expect(housingRiders(NEAR)).toBe(Math.round(1000 * CONSTANTS.housingTripsPerHome.value * CONSTANTS.housingTransitShare.value));
    expect(housingRiders(NEAR)).toBe(900);
    for (const k of [CONSTANTS.housingTripsPerHome, CONSTANTS.housingTransitShare, CONSTANTS.housingServedM]) {
      expect(k.verified).toBe(false);
      expect(k.source).toMatch(/assumption/i);
    }
  });

  test('the snapshot lists the options; a mission without any has an empty list and no housing on the scorecard', () => {
    const plain = createSim(testScenario(), 1, null, { events: false });
    plain.dispatch(TEST_DESIGN);
    expect(plain.snapshot().housing).toEqual([]);
    expect(plain.snapshot().projects[0].scorecard.housing).toBeUndefined();
    const sim = createSim(withHousing(), 1, null, { events: false });
    const list = sim.snapshot().housing ?? [];
    expect(list.map((o) => [o.id, o.title, o.homes, o.capitalCost, o.ridersPerDayAdded, o.enacted])).toEqual([
      ['near', 'Homes at B', 1000, 30, 900, false],
      ['far', 'Homes far away', 1000, 20, 900, false],
    ]);
    // The card says how the number follows and that it is assumed.
    expect(list[0].blurb).toMatch(/^Blocks at station B\. Assumptions: 10 ha at 100 homes per hectare, 6 trips a day per home, 15 percent/);
    expect(list[0].blurb.includes(EM_DASH)).toBe(false);
  });

  test('enacting costs political capital, draws a pile-on, and adds exactly the riders of the homes a station serves', () => {
    const sim = createSim(withHousing(), 9, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    const before = sim.snapshot();
    const base = before.projects[0].scorecard.ridersPerDay;
    expect(before.projects[0].scorecard.housing).toEqual({ homes: 0, ridersPerDayAdded: 0 });
    sim.dispatch([house('near')]);
    const after = sim.snapshot();
    expect(after.notices).toEqual([]);
    expect(after.politicalCapital).toBe(before.politicalCapital - 30);
    expect(after.housing?.map((o) => o.enacted)).toEqual([true, false]);
    expect(after.projects[0].scorecard.housing).toEqual({ homes: 1000, ridersPerDayAdded: 900 });
    expect(after.projects[0].scorecard.ridersPerDay).toBe(base + 900);
    expect(after.projects[0].scorecard.costPerRiderCents).toBeLessThan(
      before.projects[0].scorecard.costPerRiderCents || Number.POSITIVE_INFINITY,
    );
    // The cost side does not move: the line does not pay for the homes.
    expect(after.projects[0].receipt.columns.yours.costCents).toBe(before.projects[0].receipt.columns.yours.costCents);
    const posts = after.socialPosts ?? [];
    expect(posts.length).toBeGreaterThanOrEqual(SOCIAL_BURST_MIN);
    expect(posts.every((p) => p.cause === 'housing:near')).toBe(true);
    expect(SOCIAL_TEMPLATES.housing).toContain(posts[0].text.replaceAll('Homes at B', '{what}'));
    expect(posts[1].text).toContain('30 ');
    expect(after.feed.at(-1)).toMatchObject({ kind: 'reformEnacted', subjectId: 'near' });
    // A second click is silent and free.
    sim.dispatch([house('near')]);
    expect(sim.snapshot().politicalCapital).toBe(after.politicalCapital);
    expect(sim.snapshot().socialPosts).toHaveLength(posts.length);
    // Homes no station of the line is near are enacted, shouted about, and bring nobody.
    sim.dispatch([house('far')]);
    const both = sim.snapshot();
    expect(both.housing?.map((o) => o.enacted)).toEqual([true, true]);
    expect(both.projects[0].scorecard.housing).toEqual({ homes: 1000, ridersPerDayAdded: 900 });
    expect(both.socialPosts?.at(-1)?.cause).toBe('housing:far');
  });

  test('an unknown option and an option the player cannot afford are refused in one line each, with nothing spent', () => {
    const sim = createSim(withHousing(25), 1, null, { events: false });
    sim.dispatch([house('atlantis')]);
    expect(sim.snapshot().notices.at(-1)?.reason).toBe('this mission has no housing option "atlantis"');
    sim.dispatch([house('near')]);
    expect(sim.snapshot().notices.at(-1)?.reason).toBe('"Homes at B" costs 30 political capital, you have 25');
    expect(sim.snapshot().politicalCapital).toBe(25);
    expect(sim.snapshot().socialPosts).toEqual([]);
    expect(sim.snapshot().housing?.some((o) => o.enacted)).toBe(false);
    expect(() => sim.dispatch([{ t: 'enactHousing' } as never])).toThrow(/optionId/);
  });

  test('it is in the save and in the hash, a restart clears it, a line already open gains the riders, the dice are untouched', () => {
    const sim = createSim(withHousing(), 4, null, { events: false });
    const twin = createSim(withHousing(), 4, null, { events: false });
    for (const s of [sim, twin]) s.dispatch(TEST_DESIGN);
    sim.dispatch([house('near')]);
    expect(sim.hash()).not.toBe(twin.hash());
    expect(sim.state.rng).toEqual(twin.state.rng);
    const loaded = loadSim(sim.save());
    expect(loaded.hash()).toBe(sim.hash());
    expect(loaded.snapshot().housing).toEqual(sim.snapshot().housing);
    expect(loaded.snapshot().projects[0].scorecard.housing).toEqual({ homes: 1000, ridersPerDayAdded: 900 });
    // A save from before M2 has no list: nothing is enacted.
    const save = twin.save();
    delete (save.sim as unknown as Record<string, unknown>).housing;
    const old = loadSim({ ...save, stateHash: hashState(save.sim as SimState) });
    expect(old.snapshot().housing?.every((o) => !o.enacted)).toBe(true);
    old.dispatch([house('near')]);
    expect(old.snapshot().housing?.[0].enacted).toBe(true);
    sim.dispatch([{ t: 'startScenario' }]);
    expect(sim.snapshot().housing?.some((o) => o.enacted)).toBe(false);
    // Open line: the homes are counted the day they are enacted.
    const open = createSim(withHousing(), 4, null, { events: false });
    open.dispatch(TEST_DESIGN);
    const project = open.state.projects[0];
    project.status = 'open';
    project.ridersPerDay = 1234;
    open.dispatch([house('near')]);
    expect(project.ridersPerDay).toBe(open.snapshot().projects[0].scorecard.ridersPerDay);
    expect(project.ridersPerDay).toBeGreaterThanOrEqual(900);
  });
});

describe('the Vegas-style small bore', () => {
  const def = REFORMS.find((r) => r.id === 'smallBoreLoop');
  if (!def) throw new Error('no smallBoreLoop reform');
  const none = profileFor([]);
  const small = profileFor(['smallBoreLoop']);

  test('a tunnelling option past Polish practice that costs capital, described generically, the precedent credited as fact', () => {
    expect(def).toMatchObject({ branch: 'tunnelling', title: 'The Vegas-style small bore', beyondPoland: true, prereqs: [] });
    expect(def.cost.pc).toBeGreaterThan(0);
    expect(POLAND_PROFILE).not.toContain('smallBoreLoop');
    expect(def.description).toMatch(/3\.7 m single-lane bore/);
    expect(def.description).toMatch(/launch pit/);
    expect(def.description).toMatch(/Caltrain train does not fit/);
    expect(def.evidence).toMatch(/The Boring Company, Las Vegas Convention Center Loop/);
    expect(def.evidence).toMatch(/UNVERIFIED/);
    // Nobody is quoted: no quotation marks, no "said".
    expect(`${def.description} ${def.evidence}`).not.toMatch(/"|\bsaid\b|\bsays\b|Musk/);
    for (const k of [
      CONSTANTS.smallBoreCivilFactor,
      CONSTANTS.smallBoreRateFactor,
      CONSTANTS.smallBoreRiderShare,
      CONSTANTS.smallBoreRidersPerDay,
    ])
      expect(k.verified).toBe(false);
  });

  test('twin-tube drives cost 0.3 of what they did and advance 1.5 times as fast; other methods and the stations do not move', () => {
    expect(small['tbm.smallBore']).toBe(1);
    const sim = createSim(rich(), 1, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    const project = sim.state.projects[0];
    const a = hardCost(project, none, designFlags(none), false);
    const b = hardCost(project, small, designFlags(small), false);
    expect(b.stationsCents).toBe(a.stationsCents);
    expect(b.systemsCents).toBe(a.systemsCents);
    expect(b.civilCents).toBeLessThan(a.civilCents);
    // Only the two bored segments shrink: all bored would be 0.3, this line is part mined and part cut-and-cover.
    const boredOnly = { ...project, methods: project.methods.map(() => 'boredTwin' as const) };
    expect(
      hardCost(boredOnly, small, designFlags(small), false).civilCents / hardCost(boredOnly, none, designFlags(none), false).civilCents,
    ).toBeCloseTo(CONSTANTS.smallBoreCivilFactor.value, 9);
    expect(b.civilCents / a.civilCents).toBeGreaterThan(CONSTANTS.smallBoreCivilFactor.value);
    expect(advanceRate('boredTwin', 'softGround', small, 10_000) / advanceRate('boredTwin', 'softGround', none, 10_000)).toBeCloseTo(
      1.5,
      9,
    );
    for (const m of ['mined', 'cutAndCover', 'boredSingleLarge'] as const)
      expect(advanceRate(m, 'softGround', small, 10_000)).toBe(advanceRate(m, 'softGround', none, 10_000));
  });

  test('the catch: a bored line keeps 60 percent of its riders, at most 8,000 a day, housing included; the card says so', () => {
    const scenario = testScenario({
      housing: [
        {
          id: 'big',
          title: 'Big',
          blurb: 'Big.',
          hectares: 200,
          homesPerHectare: 100,
          capitalCost: 10,
          at: { x: 20_900, z: -65_400 },
          source: 'test',
        },
      ],
      start: { ...testScenario().start, politicalCapital: 1000, budgetCents: 1e13 },
    });
    const sim = createSim(scenario, 1, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    const view = sim.snapshot().reforms.find((r) => r.id === 'smallBoreLoop');
    expect(view?.receiptLines).toContain('designTunnel');
    const base = sim.snapshot().projects[0];
    sim.dispatch([enact('smallBoreLoop')]);
    const cut = sim.snapshot().projects[0];
    expect(sim.snapshot().notices).toEqual([]);
    expect(cut.scorecard.ridersPerDay).toBe(Math.round(base.scorecard.ridersPerDay * CONSTANTS.smallBoreRiderShare.value));
    expect(cut.receipt.columns.yours.costCents).toBeLessThan(base.receipt.columns.yours.costCents);
    // Poland builds a railway: its column does not move.
    expect(cut.receipt.columns.poland.costCents).toBe(base.receipt.columns.poland.costCents);
    // 20,000 homes would bring 18,000 riders: the tube carries 8,000.
    sim.dispatch([{ t: 'enactHousing', optionId: 'big' }]);
    const capped = sim.snapshot().projects[0].scorecard;
    expect(capped.housing).toEqual({ homes: 20_000, ridersPerDayAdded: 18_000 });
    expect(capped.ridersPerDay).toBe(CONSTANTS.smallBoreRidersPerDay.value);
    // The same homes on a railway.
    const rail = createSim(scenario, 1, null, { events: false });
    rail.dispatch([...TEST_DESIGN, { t: 'enactHousing', optionId: 'big' }]);
    expect(rail.snapshot().projects[0].scorecard.ridersPerDay).toBe(base.scorecard.ridersPerDay + 18_000);
    // A surface line has no bore: nothing is cut.
    const surface = createSim(scenario, 1, null, { events: false });
    surface.dispatch([
      {
        t: 'setAlignment',
        projectId: TEST_PROJECT,
        waypoints: TEST_WAYPOINTS.map((w) => ({ ...w, y: 5 })),
        methods: ['atGrade', 'atGrade', 'atGrade', 'atGrade'],
      },
      { t: 'addStation', projectId: TEST_PROJECT, name: 'A', template: 'surface', chainageM: 0 },
      { t: 'addStation', projectId: TEST_PROJECT, name: 'B', template: 'surface', chainageM: 1200 },
    ]);
    const flat = surface.snapshot().projects[0].scorecard.ridersPerDay;
    const note = surface.snapshot().reforms.find((r) => r.id === 'smallBoreLoop')?.preview?.notes ?? [];
    surface.dispatch([enact('smallBoreLoop')]);
    expect(surface.snapshot().projects[0].scorecard.ridersPerDay).toBe(flat);
    expect(note.join(' ')).toMatch(
      /Pods, not trains: a line with a bored tunnel keeps 60 percent of its riders and carries at most 8,000 a day/,
    );
  });
});
