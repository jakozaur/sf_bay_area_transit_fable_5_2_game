import { Material, type WorldEdit } from '@bayvox/core';
import { MemoryWorldStore } from '@bayvox/testkit';
import { describe, expect, test } from 'vitest';
import { autopilotCommands, eventHazardPerYear, projectSpentCents } from './engine.ts';
import { type EVENTS, eventById } from './events.ts';
import { offsetPointAt, pointAt } from './geometry.ts';
import { carveShape, designFlags } from './model.ts';
import { POLAND_PROFILE, profileFor } from './reforms.ts';
import { createSim, type GameSim, loadSim } from './sim.ts';
import { TEST_DESIGN, TEST_PROJECT, testScenario } from './test-scenario.ts';
import type { GameCommand } from './types.ts';

/** Draws the test line and plays it to opening with the gates passed at once. */
function play(sim: GameSim, maxTicks = 365 * 40): void {
  sim.dispatch(TEST_DESIGN);
  sim.run(maxTicks, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
}

describe('commands', () => {
  test('malformed commands throw naming the field and leave the state untouched', () => {
    const sim = createSim(testScenario(), 1);
    const before = sim.hash();
    expect(() => sim.dispatch([{ t: 'dig' }])).toThrow(/unknown command type "dig"/);
    expect(() => sim.dispatch([{ t: 'setAlignment', projectId: 'x', waypoints: [{ x: 1, y: 2 }] }])).toThrow(/waypoints must have 2 to/);
    expect(() => sim.dispatch([{ t: 'setMethod', projectId: 'x', segment: 0, method: 'teleport' }])).toThrow(/method must be one of/);
    expect(() => sim.dispatch([{ t: 'setSpeed', speed: 7 }])).toThrow(/speed must be one of 0, 1, 10, 100/);
    // A bad command later in a batch must not let the earlier ones through.
    expect(() => sim.dispatch([...TEST_DESIGN, { t: 'enactReform' }])).toThrow(/id must be a non-empty string/);
    expect(sim.state.projects.length).toBe(0);
    expect(sim.hash()).toBe(before);
  });

  test('rule violations are refused with a notice, not an exception', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch([{ t: 'approveProject', projectId: 'nope' }]);
    sim.dispatch([
      {
        t: 'setAlignment',
        projectId: 'far',
        waypoints: [
          { x: -5, y: 0, z: 10 },
          { x: 100, y: 0, z: 10 },
        ],
      },
    ]);
    // An id of the old 32-node tree is not a reform any more; no reform needs another first.
    sim.dispatch([{ t: 'enactReform', id: 'itemizedContracts' }]);
    const poor = createSim({ ...testScenario(), start: { ...testScenario().start, politicalCapital: 5 } }, 1);
    poor.dispatch([{ t: 'enactReform', id: 'railSpecustawa' }]);
    const notices = sim.snapshot().notices.map((n) => n.reason);
    expect(notices[0]).toMatch(/no project "nope"/);
    expect(notices[1]).toMatch(/outside the world grid/);
    expect(notices[2]).toBe('no reform "itemizedContracts"');
    // Notices are read by the player: they name reforms by title, not by id.
    expect(poor.snapshot().notices[0].reason).toBe('"One permit, 90 days, local money" costs 40 political capital, you have 5');
    expect(sim.state.projects.length).toBe(0);
    expect(sim.state.reforms).toEqual([]);
  });

  test('design edits work on a draft and are refused after tender', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch(TEST_DESIGN);
    const p = sim.state.projects[0];
    expect(p.methods).toEqual(['boredTwin', 'boredTwin', 'mined', 'cutAndCover']);
    expect(p.stations.map((s) => s.id)).toEqual(['a', 'b']);
    expect(p.stations[1].chainageM).toBeCloseTo(p.cum[4], 6);
    sim.dispatch([{ t: 'setMethod', projectId: TEST_PROJECT, segment: 2, method: 'boredSingleLarge' }]);
    sim.dispatch([{ t: 'addWaypoint', projectId: TEST_PROJECT, waypoint: { x: 21_100, y: -18, z: -65_500 }, method: 'viaduct' }]);
    sim.dispatch([{ t: 'addStation', projectId: TEST_PROJECT, stationId: 'c', name: 'C', template: 'elevated', chainageM: p.cum[5] }]);
    expect(p.methods).toEqual(['boredTwin', 'boredTwin', 'boredSingleLarge', 'cutAndCover', 'viaduct']);
    expect(p.waypoints.length).toBe(6);
    sim.dispatch([{ t: 'removeStation', projectId: TEST_PROJECT, stationId: 'c' }]);
    expect(p.stations.length).toBe(2);
    const estimateBefore = p.hardEstimateCents;
    sim.dispatch([{ t: 'setMethod', projectId: TEST_PROJECT, segment: 2, method: 'mined' }]);
    expect(p.hardEstimateCents).not.toBe(estimateBefore);

    sim.dispatch([{ t: 'approveProject', projectId: TEST_PROJECT }]);
    sim.run(365 * 10, (s) => (s.state.projects[0].awaiting === 'advancePhase' ? false : undefined));
    expect(p.awaiting).toBe('advancePhase');
    sim.dispatch([{ t: 'launchTBM', projectId: TEST_PROJECT }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/not ready to launch/);
    sim.dispatch([{ t: 'advancePhase', projectId: TEST_PROJECT }]);
    expect(p.phase).toBe('procurement');
    expect(p.frozen).not.toBeNull();
    sim.dispatch([{ t: 'setMethod', projectId: TEST_PROJECT, segment: 0, method: 'mined' }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/design is frozen/);
    expect(p.methods[0]).toBe('boredTwin');
  });

  test('setSpeed is advisory and startScenario restarts under another profile', () => {
    const sim = createSim(testScenario(), 5);
    sim.dispatch([{ t: 'setSpeed', speed: 100 }]);
    expect(sim.snapshot().ticksPerFrame).toBe(100);
    sim.dispatch([{ t: 'setSpeed', speed: 0 }]);
    sim.step();
    expect(sim.state.tick).toBe(1);
    sim.dispatch(TEST_DESIGN);
    sim.dispatch([{ t: 'startScenario', costProfile: 'polishBaseline', events: false }]);
    expect(sim.state.tick).toBe(0);
    expect(sim.state.projects.length).toBe(0);
    expect(sim.state.reforms).toEqual([...POLAND_PROFILE]);
    expect(sim.state.eventsEnabled).toBe(false);
    expect(sim.state.speed).toBe(1);
  });

  test('reforms cost political capital, never money, and change the profile', () => {
    const sim = createSim(testScenario(), 1);
    const cash = sim.state.cashCents;
    sim.dispatch([
      { t: 'enactReform', id: 'inHouseEngineering' },
      { t: 'enactReform', id: 'rightMachine' },
    ]);
    expect(sim.state.politicalCapital).toBe(100 - 40 - 20);
    expect(sim.state.ledger.total.reforms).toBe(0);
    expect(sim.state.cashCents).toBe(cash);
    expect(sim.state.reforms).toEqual(['inHouseEngineering', 'rightMachine']);
    // A second click on Enact before the snapshot caught up: nothing is charged twice and nothing is said.
    sim.dispatch([{ t: 'enactReform', id: 'inHouseEngineering' }]);
    expect(sim.state.politicalCapital).toBe(100 - 40 - 20);
    expect(sim.snapshot().notices).toEqual([]);
    // The Polish price level is part of the Poland profile, not something a player can enact.
    sim.dispatch([{ t: 'enactReform', id: 'polishPriceLevel' }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/No reform changes the price level/);
    expect(sim.state.reforms).toEqual(['inHouseEngineering', 'rightMachine']);
    const view = sim.snapshot().reforms;
    expect(view.find((r) => r.id === 'inHouseEngineering')?.status).toBe('enacted');
    // No reform waits for another: what is not enacted is available, and only its price can block it.
    for (const r of view) {
      expect(r.prereqs, r.id).toEqual([]);
      expect(r.cost.cents, r.id).toBe(0);
      expect(r.status, r.id).not.toBe('locked');
    }
    expect(view.find((r) => r.id === 'railSpecustawa')).toMatchObject({ status: 'available', affordable: true, blockedReason: null });
    expect(view.find((r) => r.id === 'specustawa')).toMatchObject({
      status: 'available',
      affordable: false,
      blockedReason: 'Costs 60 political capital, you have 40',
    });
    // Not enough political capital for everything.
    const poor = createSim({ ...testScenario(), start: { ...testScenario().start, politicalCapital: 5 } }, 1);
    poor.dispatch([{ t: 'enactReform', id: 'inHouseEngineering' }]);
    expect(poor.state.reforms).toEqual([]);
    expect(poor.snapshot().notices[0].reason).toMatch(/costs 40 political capital, you have 5/);
  });

  test('an invalid scenario is refused with every problem listed', () => {
    const broken = testScenario({ costProfile: 'cheap', feeders: ['monorail'] });
    broken.start.policies = ['abolishGravity'];
    expect(() => createSim(broken, 1)).toThrow(
      /costProfile "cheap" is unknown.*start reform "abolishGravity" does not exist.*feeder "monorail" does not exist/,
    );
  });
});

describe('determinism', () => {
  test('same seed and commands give the same hash at every checkpoint; another seed diverges', () => {
    const run = (seed: number): string[] => {
      const sim = createSim(testScenario(), seed);
      sim.dispatch(TEST_DESIGN);
      const hashes: string[] = [];
      for (let i = 0; i < 6000; i++) {
        sim.step(sim.state.projects[0].status === 'open' ? [] : autopilotCommands(sim.state));
        if (i % 750 === 0) hashes.push(sim.hash());
      }
      return hashes;
    };
    const a = run(42);
    expect(run(42)).toEqual(a);
    expect(run(43)).not.toEqual(a);
    expect(new Set(a).size).toBe(a.length);
  });

  test('save, load and continue matches the uninterrupted run, through a JSON round trip', () => {
    const scenario = testScenario();
    const whole = createSim(scenario, 7);
    whole.dispatch(TEST_DESIGN);
    const interrupted = createSim(scenario, 7);
    interrupted.dispatch(TEST_DESIGN);
    const drive = (s: GameSim, ticks: number) => s.run(ticks, (x) => autopilotCommands(x.state));
    drive(whole, 5200);
    drive(interrupted, 4100);
    // Mid-construction: headings are part-way and the PRNG has been used.
    expect(interrupted.state.projects[0].phase).toBe('construction');
    const save = JSON.parse(JSON.stringify(interrupted.save('test-world')));
    const resumed = loadSim(save);
    expect(resumed.hash()).toBe(interrupted.hash());
    drive(resumed, 1100);
    expect(resumed.state.tick).toBe(whole.state.tick);
    expect(resumed.hash()).toBe(whole.hash());
    expect(save.format).toBe('bayvox-save');
    expect(save.scenarioId).toBe('test');
    expect(save.tick).toBe(4100);
  });

  test('load refuses unknown versions and tampered state', () => {
    const sim = createSim(testScenario(), 1);
    sim.run(10);
    const save = sim.save();
    expect(() => loadSim({ ...save, schemaVersion: 99 })).toThrow(/cannot load save schemaVersion 99; this build reads version 3/);
    const tampered = JSON.parse(JSON.stringify(save));
    tampered.sim.cashCents += 1;
    expect(() => loadSim(tampered)).toThrow(/save is corrupt/);
    expect(() => loadSim({ ...save, format: 'other' } as never)).toThrow(/not a bayvox save/);
  });

  test('money stays in integer cents', () => {
    const sim = createSim(testScenario(), 3);
    play(sim);
    const s = sim.state;
    expect(Number.isSafeInteger(s.cashCents)).toBe(true);
    for (const v of Object.values(s.ledger.total)) expect(Number.isSafeInteger(v)).toBe(true);
    for (const v of Object.values(s.projects[0].spent)) expect(Number.isSafeInteger(v)).toBe(true);
    // Cash moved by exactly what the ledger recorded, less released funding and what the cash calls raised.
    const spent = Object.values(s.ledger.total).reduce((a, b) => a + b, 0);
    expect(s.cashRaisedCents).toBeGreaterThan(0);
    expect(s.cashCents).toBe(500_000_000_00 + 1_000_000_000_00 + (s.cashRaisedCents ?? 0) - spent);
    expect(s.ledger.monthly.reduce((a, b) => a + b, 0)).toBe(spent);
  });
});

describe('project lifecycle', () => {
  test('phases run in order, gates wait for the player, and the line opens', () => {
    const sim = createSim(testScenario(), 1, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    sim.run(100);
    expect(sim.state.projects[0].status).toBe('draft');
    expect(sim.state.ledger.total.overhead).toBe(0);
    sim.dispatch([{ t: 'approveProject', projectId: TEST_PROJECT }]);
    const seen: string[] = [];
    sim.run(365 * 40, (s) => {
      const p = s.state.projects[0];
      const tag = p.awaiting ? `${p.phase}:${p.awaiting}` : p.phase;
      if (seen.at(-1) !== tag) seen.push(tag);
      return p.status === 'open' ? false : autopilotCommands(s.state);
    });
    expect(seen).toEqual([
      'planning',
      'permitting',
      'permitting:advancePhase',
      'procurement',
      'utilities',
      'utilities:launchTBM',
      'construction',
      'fitOut',
      'fitOut:openLine',
      'fitOut',
    ]);
    const snap = sim.snapshot();
    const view = snap.projects[0];
    expect(view.status).toBe('open');
    expect(view.phases.every((ph) => ph.state === 'done')).toBe(true);
    expect(view.tbms.every((t) => t.status === 'done' && t.progress === 1)).toBe(true);
    expect(view.stations.every((s) => s.progress === 1)).toBe(true);
    expect(snap.objectives.find((o) => o.id === 'connect')?.status).toBe('done');
    expect(snap.objectives.find((o) => o.id === 'budget')?.status).toBe('done');
    // The grant arrived when permitting completed.
    expect(snap.ledger.funding).toEqual([
      { id: 'grant', name: 'Grant', amountCents: 1_000_000_000_00, release: 'permitting', released: true },
    ]);
    expect(snap.date > '2036-01-01').toBe(true);
  });

  test('a gate left alone stops progress but not the overhead', () => {
    const sim = createSim(testScenario(), 1, null, { events: false });
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    sim.run(365 * 9);
    const p = sim.state.projects[0];
    expect(p.awaiting).toBe('advancePhase');
    const overhead = p.spent.overhead;
    sim.run(365);
    expect(p.awaiting).toBe('advancePhase');
    expect(p.phase).toBe('permitting');
    expect(p.spent.overhead).toBeGreaterThan(overhead);
  });

  test('snapshot reports headings in world metres on the alignment', () => {
    const sim = createSim(testScenario(), 9, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    sim.run(365 * 40, (s) =>
      s.state.projects[0].phase === 'construction' && s.state.projects[0].phaseProgress > 0.2 ? false : autopilotCommands(s.state),
    );
    const view = sim.snapshot().projects[0];
    expect(view.phase).toBe('construction');
    expect(view.tbms.map((t) => t.method)).toEqual(['boredTwin', 'mined', 'cutAndCover']);
    expect(view.tbms[0].name).toMatch(/^TBM /);
    const p = sim.state.projects[0];
    for (const t of view.tbms) {
      expect(t.chainageM).toBeGreaterThan(t.fromM);
      expect(t.position).toEqual(pointAt(p.waypoints, p.cum, t.chainageM));
    }
    expect(view.segments.map((s) => s.geology)).toEqual(['softGround', 'bayMud', 'softGround', 'softGround']);
    expect(view.spentByCategory.civil).toBeGreaterThan(0);
    expect(view.comparison.costCents).toBeGreaterThan(view.spentCents);
  });
});

describe('comparison against Poland', () => {
  test('the four factors multiply to the estimate exactly, and the ratio is their product over the Polish delay', () => {
    const sim = createSim(testScenario(), 1, null, { events: false });
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    const c = sim.snapshot().projects[0].comparison;
    const product = c.factors.reduce((acc, f) => acc * f.value, 1);
    expect((c.baseCents * product) / c.costCents).toBeCloseTo(1, 6);
    const polandDelay = c.factors[3].polandValue;
    expect(product / polandDelay / c.ratio).toBeCloseTo(1, 6);
    expect(c.factors.map((f) => f.id)).toEqual(['design', 'unitPrices', 'softContingency', 'delay']);
    for (const f of c.factors) expect(f.value, f.id).toBeGreaterThan(1);
    expect(c.factors.reduce((acc, f) => acc + f.contributionCents, c.baseCents) / c.costCents).toBeCloseTo(1, 6);
    expect(c.poland.yearsToOpen).toBeLessThan(c.yearsToOpen);
    expect(c.poland.costPerKmCents).toBeLessThan(c.costPerKmCents);
  });

  test('the estimate made at approval matches what an event-free run then spends', () => {
    const sim = createSim(testScenario(), 11, null, { events: false });
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    const estimate = sim.snapshot().projects[0].comparison;
    play(sim);
    const p = sim.state.projects[0];
    // Only the seeded TBM breakdowns differ from the expected-value forecast.
    expect(projectSpentCents(p) / estimate.costCents).toBeGreaterThan(0.98);
    expect(projectSpentCents(p) / estimate.costCents).toBeLessThan(1.02);
    const final = sim.snapshot().projects[0].comparison;
    expect(final.costCents).toBe(projectSpentCents(p));
    expect(final.poland.costCents).toBe(p.polandCostCents);
    expect(final.poland.costCents / estimate.poland.costCents).toBeCloseTo(1, 6);
  });

  test('the Polish design in the Poland profile is its own benchmark', () => {
    const sim = createSim(testScenario({ costProfile: 'polishBaseline' }), 1, null, { events: false });
    // The benchmark is the Polish design of the route (twin bores under ground), whatever the project builds.
    sim.dispatch([
      ...TEST_DESIGN,
      { t: 'setDesign', projectId: TEST_PROJECT, tunnel: 'twinBore' },
      { t: 'approveProject', projectId: TEST_PROJECT },
    ]);
    const c = sim.snapshot().projects[0].comparison;
    expect(c.ratio).toBeCloseTo(1, 9);
    expect(c.factors.slice(0, 3).map((f) => f.value)).toEqual([1, 1, 1]);
  });
});

describe('events', () => {
  test('hazards follow phase, design and reforms', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    const p = sim.state.projects[0];
    const hazard = (id: string, reforms: string[]) => eventHazardPerYear(eventById(id) as (typeof EVENTS)[number], p, profileFor(reforms));
    expect(p.phase).toBe('planning');
    // The shorter lawsuit record (x0.8) is the law of 2026 and part of the status quo.
    expect(hazard('lawsuit', [])).toBeCloseTo(0.12, 9);
    expect(hazard('lawsuit', ['railSpecustawa'])).toBeCloseTo(0.03, 9);
    expect(hazard('tbmStuck', [])).toBe(0);
    p.phase = 'construction';
    expect(hazard('lawsuit', [])).toBe(0);
    expect(hazard('utilitySurprise', [])).toBeCloseTo(0.12, 9);
    expect(hazard('utilitySurprise', ['utilityStatute'])).toBe(0);
    expect(hazard('tbmStuck', ['rightMachine'])).toBeCloseTo(hazard('tbmStuck', []) * 0.15, 9);
    expect(hazard('changeOrder', ['bestValueAward'])).toBeCloseTo(hazard('changeOrder', []) * 0.25, 9);
    p.eventCounts.changeOrder = 3;
    expect(hazard('changeOrder', [])).toBe(0);
  });

  test('a card can be resolved by command or resolves itself by default at the deadline', () => {
    const find = (seed: number): GameSim => {
      const sim = createSim(testScenario(), seed);
      sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
      sim.run(365 * 8, (s) => (s.state.pendingEvents.length > 0 ? false : undefined));
      return sim;
    };
    let seed = 1;
    let sim = find(seed);
    while (sim.state.pendingEvents.length === 0 || sim.state.pendingEvents[0].defId !== 'lawsuit') sim = find(++seed);
    const card = sim.snapshot().events[0];
    expect(card.title).toBe('One Man and His Parking Spot');
    expect(card.options.map((o) => o.id)).toEqual(['litigate', 'settle']);
    expect(card.options[0].delayDays).toBe(365);

    // By command: settle.
    const pcBefore = sim.state.politicalCapital;
    const byCommand = loadSim(sim.save());
    const settle: GameCommand = { t: 'resolveEvent', eventId: card.uid, optionId: 'settle' };
    byCommand.dispatch([settle]);
    expect(byCommand.state.pendingEvents.length).toBe(0);
    expect(byCommand.state.politicalCapital).toBe(pcBefore - 10);
    expect(byCommand.state.projects[0].delayDays).toBe(60);
    expect(byCommand.state.projects[0].spent.events).toBeGreaterThan(0);
    expect(byCommand.state.eventLog.at(-1)).toMatchObject({ defId: 'lawsuit', optionId: 'settle', byDefault: false });
    byCommand.dispatch([settle]);
    expect(byCommand.snapshot().notices.at(-1)?.reason).toMatch(/no pending event/);

    // Left alone: litigate, the default, after 30 days.
    sim.run(31);
    expect(sim.state.pendingEvents.some((e) => e.uid === card.uid)).toBe(false);
    expect(sim.state.eventLog.find((e) => e.uid === card.uid)).toMatchObject({ optionId: 'litigate', byDefault: true });
    expect(sim.state.projects[0].delayDays).toBeGreaterThan(300);
  });

  test('the one-permit reform caps the lawsuit delay at 270 days', () => {
    const scenario = testScenario();
    scenario.start.policies = ['railSpecustawa'];
    let seed = 1;
    let sim: GameSim;
    for (;;) {
      sim = createSim(scenario, seed++);
      sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
      sim.run(365 * 6, (s) => (s.state.pendingEvents.length > 0 ? false : undefined));
      if (sim.state.pendingEvents[0]?.defId === 'lawsuit') break;
    }
    expect(sim.snapshot().events[0].options[0].delayDays).toBe(270);
    sim.dispatch([{ t: 'resolveEvent', eventId: sim.state.pendingEvents[0].uid, optionId: 'litigate' }]);
    expect(sim.state.projects[0].delayDays).toBe(270);
  });
});

describe('carve edits', () => {
  test('every underground heading carves a gap-free chain over its whole run, and the voxels are open end to end', () => {
    // A short line keeps the voxel work small: 150 m twin bore with a vertex inside the run, a bend, 90 m mined, 70 m cut-and-cover.
    const design: GameCommand[] = [
      {
        t: 'setAlignment',
        projectId: TEST_PROJECT,
        waypoints: [
          { x: 20_000, y: -20, z: -65_000 },
          { x: 20_080, y: -22, z: -65_000, geology: 'bayMud' },
          { x: 20_150, y: -22, z: -65_000 },
          // Two 20 degree bends between 70 m segments: R about 200 m, inside the curve and grade limits approval enforces.
          { x: 20_216, y: -23, z: -65_024 },
          { x: 20_270, y: -21.5, z: -65_069 },
        ],
        methods: ['boredTwin', 'boredTwin', 'mined', 'cutAndCover'],
      },
      { t: 'addStation', projectId: TEST_PROJECT, stationId: 'a', name: 'A', template: 'undergroundStandard', chainageM: 0 },
    ];
    // Solid ground around the alignment.
    const GROUND: WorldEdit = {
      t: 'fillBox',
      min: { x: 19_970, y: -40, z: -65_125 },
      max: { x: 20_310, y: -6, z: -64_970 },
      material: Material.ROCK,
    };
    const edits: WorldEdit[] = [];
    const world = new MemoryWorldStore();
    world.applyEdit(GROUND);
    const sim = createSim(testScenario(), 4, {
      applyEdit(e) {
        edits.push(e);
        return world.applyEdit(e);
      },
    });
    sim.dispatch(design);
    sim.run(365 * 40, (x) => (x.state.projects[0].status === 'open' ? false : autopilotCommands(x.state)));
    const p = sim.state.projects[0];
    expect(p.status).toBe('open');
    const flags = p.frozen;
    if (!flags) throw new Error('design was never frozen');
    expect(flags).toEqual(designFlags(profileFor([])));
    const vox = (q: { x: number; y: number; z: number }) => ({ x: Math.floor(q.x), y: Math.floor(q.y), z: Math.floor(q.z) });

    // Chains: group capsules by radius and walk them in emission order.
    for (const front of p.fronts) {
      const shape = carveShape(front.method, flags);
      for (const lateral of shape.laterals) {
        const start = vox(offsetPointAt(p.waypoints, p.cum, front.fromM, lateral));
        const end = vox(offsetPointAt(p.waypoints, p.cum, front.toM, lateral));
        const chain = edits.filter((e) => e.t === 'carveCapsule' && e.radius === shape.radiusM);
        let at = start;
        let reachedEnd = false;
        let links = 0;
        for (const e of chain) {
          if (e.t !== 'carveCapsule') continue;
          if (e.a.x === at.x && e.a.y === at.y && e.a.z === at.z) {
            at = e.b;
            links++;
            if (at.x === end.x && at.y === end.y && at.z === end.z) {
              reachedEnd = true;
              break;
            }
          }
        }
        expect(reachedEnd, `${front.name} lateral ${lateral}: chain of ${links} capsules reaches the end of the run`).toBe(true);
      }
    }

    // Voxels: every metre of every tube axis is air, and the ground beside the tunnel is not.
    let solid = 0;
    let samples = 0;
    for (const front of p.fronts) {
      const shape = carveShape(front.method, flags);
      for (const lateral of shape.laterals) {
        for (let s = front.fromM; s <= front.toM; s += 1) {
          samples++;
          if (world.getVoxel(vox(offsetPointAt(p.waypoints, p.cum, s, lateral))) !== Material.AIR) solid++;
        }
      }
    }
    // Three tubes over the 150 m bored run, then about 70 m mined and 70 m cut-and-cover, one sample per metre.
    expect(samples).toBeGreaterThan(590);
    expect(solid).toBe(0);
    expect(world.getVoxel({ x: 20_100, y: -22, z: -64_975 })).toBe(Material.ROCK);
    // Separate tubes with ground between them: the three-track mandate puts bores at -11, 0 and +11 m.
    expect(carveShape('boredTwin', flags).laterals).toEqual([-11, 0, 11]);
    expect(world.getVoxel(vox(offsetPointAt(p.waypoints, p.cum, 110, 5.5)))).toBe(Material.ROCK);

    // Loading a save replays the same carving into a fresh world.
    const replayed: WorldEdit[] = [];
    loadSim(sim.save(), { applyEdit: (e) => replayed.push(e) });
    const fresh = new MemoryWorldStore();
    fresh.applyEdit(GROUND);
    for (const e of replayed) fresh.applyEdit(e);
    for (let s = 0; s <= p.cum[p.cum.length - 1]; s += 7) {
      for (const lateral of [-5.5, 0, 5.5]) {
        const q = vox(offsetPointAt(p.waypoints, p.cum, s, lateral));
        expect(fresh.getVoxel(q), `chainage ${s} lateral ${lateral}`).toBe(world.getVoxel(q));
      }
    }
  });
});
