/**
 * Regressions from the first playtest of round 2 (2026-11-10): three playtesters drove the real game and
 * reported these. Each test names the report it would have caught.
 */
import { createRng, Material, nextFloat } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { CONSTANTS, SUBSTEPS_PER_DAY } from './constants.ts';
import { autopilotCommands } from './engine.ts';
import { eventById } from './events.ts';
import { advanceRate, headingSpans, polishMethods } from './model.ts';
import { POLAND_PROFILE, POLISH_PRICE_LEVEL, profileFor, REFORMS } from './reforms.ts';
import { createSim, type GameSim, type SimOptions } from './sim.ts';
import { TEST_DESIGN, TEST_PROJECT, testScenario } from './test-scenario.ts';
import type { GameCommand, Method, ScenarioDef, Waypoint } from './types.ts';

const A = { x: 20_000, z: -65_000 };
/** 2.0 km twin-bore line with one 20 degree bend, 20 m down. */
const LINE: Waypoint[] = [
  { x: A.x, y: -20, z: A.z, geology: 'softGround' },
  { x: A.x + 1000, y: -21, z: A.z, geology: 'softGround' },
  { x: A.x + 1940, y: -20, z: A.z - 342, geology: 'softGround' },
];
const B = { x: LINE[2].x, z: LINE[2].z };
const DESIGN: GameCommand[] = [
  { t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: LINE, methods: ['boredTwin', 'boredTwin'] },
  { t: 'addStation', projectId: TEST_PROJECT, stationId: 'a', name: 'A', template: 'undergroundStandard', chainageM: 0 },
  { t: 'addStation', projectId: TEST_PROJECT, stationId: 'b', name: 'B', template: 'undergroundStandard', at: B },
];
const HEADING = `${TEST_PROJECT}/f1`;

function scenario(over: Partial<ScenarioDef> = {}): ScenarioDef {
  const s = testScenario();
  return {
    ...s,
    start: { ...s.start, policies: ['twoTracks', 'twinBoreStandard'] },
    objectives: [
      { id: 'connect', title: 'Connect A and B', kind: 'connect', a: { name: 'A', ...A }, b: { name: 'B', ...B }, radiusM: 100 },
    ],
    ...over,
  };
}

function launched(seed: number, opts: SimOptions = { events: false }, design: GameCommand[] = DESIGN): GameSim {
  const sim = createSim(scenario(), seed, null, opts);
  sim.dispatch(design);
  sim.run(365 * 30, (s) => (s.state.projects[0].fronts.length > 0 ? false : autopilotCommands(s.state)));
  expect(sim.state.projects[0].fronts.length).toBeGreaterThan(0);
  return sim;
}

function days(sim: GameSim, n: number): void {
  for (let i = 0; i < n * SUBSTEPS_PER_DAY; i++) sim.substep();
}

describe('driving: no dead ends, no daylight, no runaway drift', () => {
  test('from any pose random driving can reach, the autopilot finishes the drive (the soft-lock at the corridor limit)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sim = launched(seed);
      const rng = createRng(seed * 7919);
      const front = sim.state.projects[0].fronts[0];
      // A player who mashes the keys for 150 game days: full thrust, steer and pitch held at random for days at a time.
      for (let block = 0; block < 30 && front.chainageM < front.toM; block++) {
        const steer = Math.round(nextFloat(rng) * 2 - 1);
        const pitch = Math.round(nextFloat(rng) * 2 - 1);
        sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false, thrust: 1, steer, pitch }]);
        days(sim, 5);
      }
      if (front.chainageM >= front.toM) continue;
      // Space. Whatever the pose, the machine gets back to the plan and through.
      sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: true }]);
      const boredAt = front.boredM;
      for (let d = 0; d < 1500 && front.chainageM < front.toM; d++) days(sim, 1);
      expect(front.chainageM, `seed ${seed}: bored ${boredAt.toFixed(0)} m, then ${front.boredM.toFixed(0)} m`).toBe(front.toM);
      expect(sim.snapshot().projects[0].tbms[0].status).toBe('done');
    }
  });

  test('a machine pitched up to the corridor limit and left there is bored back, by hand or by the autopilot', () => {
    for (const way of ['pitchDown', 'autopilot'] as const) {
      const sim = launched(2);
      const front = sim.state.projects[0].fronts[0];
      // W to full thrust, hold R.
      sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false, thrust: 1, pitch: 1 }]);
      let reached = false;
      for (let d = 0; d < 400 && !reached; d++) {
        days(sim, 1);
        reached = front.drive?.blocked === true && (front.drive?.verticalM ?? 0) > CONSTANTS.driveCorridorM.value - 1;
      }
      expect(reached, way).toBe(true);
      const stuckAt = front.boredM;
      sim.dispatch([
        way === 'autopilot' ? { t: 'tbmControl', headingId: HEADING, autopilot: true } : { t: 'tbmControl', headingId: HEADING, pitch: -1 },
      ]);
      days(sim, 60);
      expect(front.boredM, way).toBeGreaterThan(stuckAt + 100);
      expect(Math.abs(front.drive?.verticalM ?? 0), way).toBeLessThan(CONSTANTS.driveCorridorM.value - 5);
    }
  });

  test('a driven machine above its plan does not come out of the ground: with thin cover the shield dives', () => {
    // Flat ground at y = 0: solid below, air above.
    const ground = (_x: number, y: number, _z: number): number => (y < 0 ? Material.SAND : Material.AIR);
    const sim = launched(3, { events: false, ground });
    const front = sim.state.projects[0].fronts[0];
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false, thrust: 1, pitch: 1 }]);
    let top = Number.NEGATIVE_INFINITY;
    for (let d = 0; d < 250 && front.chainageM < front.toM; d++) {
      days(sim, 1);
      top = Math.max(top, front.drive?.y ?? top);
    }
    const crown = top + CONSTANTS.twinBoreRadiusM.value;
    // It climbed off the plan (the plan is 20 m down) and stopped climbing with cover left over the crown.
    expect(top).toBeGreaterThan(-15);
    expect(crown).toBeLessThanOrEqual(-CONSTANTS.driveCoverM.value + 0.5);
    expect(sim.snapshot().feed.some((f) => f.kind === 'tbmOffPlan' && /too close to the surface/.test(f.text))).toBe(true);
  });

  test('letting go of the steering stops the drift: the heading eases back parallel to the plan and holds its offset', () => {
    const sim = launched(4);
    const front = sim.state.projects[0].fronts[0];
    // Past the start-up stretch, on the long straight.
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: true }]);
    while (front.boredM < 200) days(sim, 1);
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false, thrust: 1, steer: 1 }]);
    const from = front.boredM;
    while (front.boredM - from < 30) sim.substep();
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, steer: 0 }]);
    const lateral = (): number => front.drive?.lateralM ?? 0;
    while (front.boredM - from < 90) sim.substep();
    const settled = lateral();
    // To the right of the plan, by metres, not tens of metres.
    expect(settled).toBeGreaterThan(1);
    expect(settled).toBeLessThan(12);
    while (front.boredM - from < 400) sim.substep();
    // 300 m further on with no input the offset is the same: the first playtest saw 0.4 m grow to 30 m.
    expect(Math.abs(lateral() - settled)).toBeLessThan(0.5);
    const t = sim.snapshot().projects[0].tbms[0];
    expect(t.status).toBe('running');
    expect(Math.abs(t.gradePct - -0.1)).toBeLessThan(0.2);
  });
});

describe('machines and headings', () => {
  test('no stack of tunnelling reforms takes a machine above 0.9 of its peak rate: 27 m/day in soft ground', () => {
    // The railway machines. The small bore (M2) is another class of machine, with its own factor on top of the cap.
    const all = profileFor(REFORMS.filter((r) => r.id !== 'smallBoreLoop').map((r) => r.id));
    const cap = CONSTANTS.tbmPeakMPerDay.value * CONSTANTS.tbmMaxUtilisation.value;
    expect(advanceRate('boredTwin', 'softGround', all, 10_000)).toBeCloseTo(cap, 9);
    expect(advanceRate('boredTwin', 'softGround', profileFor(REFORMS.map((r) => r.id)), 10_000)).toBeCloseTo(
      cap * CONSTANTS.smallBoreRateFactor.value,
      9,
    );
    expect(cap).toBeCloseTo(27, 9);
    // Tier by tier: the base, the segment plant, continuous advance; the claimed mile-a-week machine hits the cap.
    expect(advanceRate('boredTwin', 'softGround', profileFor([]), 10_000)).toBeCloseTo(10.5, 9);
    expect(advanceRate('boredTwin', 'softGround', profileFor(['segmentPlantLogistics']), 10_000)).toBeCloseTo(11.55, 9);
    expect(advanceRate('boredTwin', 'softGround', profileFor(['segmentPlantLogistics', 'continuousAdvance']), 10_000)).toBeCloseTo(
      18.48,
      9,
    );
    for (const g of ['softGround', 'bayMud', 'mixedFace', 'faultZone'] as const) {
      expect(advanceRate('boredTwin', g, all, 10_000), g).toBeLessThanOrEqual(cap + 1e-9);
      expect(advanceRate('boredSingleLarge', g, all, 10_000), g).toBeLessThanOrEqual(cap + 1e-9);
    }
  });

  test('a long run is built from several headings, so a 60 km line opens in decades, not centuries, and never stops the game', () => {
    // A zigzag across the map, as the free-build crash was drawn: 60 km of whatever the standards give.
    const wps: Waypoint[] = [];
    for (let i = 0; i <= 12; i++) wps.push({ x: 15_000 + (i % 2) * 4_000, y: -20, z: -60_000 + i * 3_000 });
    for (const policies of [[], ['twoTracks', 'twinBoreStandard']]) {
      const sim = createSim(scenario({ sandbox: true, objectives: [], start: { ...testScenario().start, policies } }), 1);
      sim.dispatch([{ t: 'setAlignment', projectId: 'line', waypoints: wps }]);
      const snap = sim.snapshot();
      const p = snap.projects[0];
      expect(p.lengthM).toBeGreaterThan(59_000);
      // The forecast of record runs (it threw "did not open within 29200 days") and gives a sane opening.
      expect(p.receipt.columns.yours.yearsToOpen).toBeLessThan(30);
      expect(p.receipt.ratios.yoursToPoland).toBeLessThan(40);
      const flags = sim.state.projects[0].frozen ?? {
        threeTrack: policies.length === 0,
        deepBox: true,
        oversizeStations: true,
        bespoke: true,
        terminalOversize: true,
        twinBoreDefault: policies.length > 0,
      };
      const spans = headingSpans(sim.state.projects[0], flags);
      const method: Method = policies.length === 0 ? 'mined' : 'boredTwin';
      expect(spans.every((x) => x.method === method)).toBe(true);
      const longest = Math.max(...spans.map((x) => x.toM - x.fromM));
      expect(longest).toBeLessThanOrEqual(
        (method === 'mined' ? CONSTANTS.maxHeadingMinedM.value : CONSTANTS.maxHeadingBoredM.value) + 1e-6,
      );
      // Gap-free: each heading starts where the one before ends.
      for (let i = 1; i < spans.length; i++) expect(spans[i].fromM).toBeCloseTo(spans[i - 1].toM, 9);
      expect(spans[0].fromM).toBe(0);
      expect(spans[spans.length - 1].toM).toBeCloseTo(p.lengthM, 6);
    }
  });

  test('the launch gate says what it starts: a TBM, a mined heading, or surface works', () => {
    const label = (methods: Method[], policies: string[] = []): string => {
      const sim = createSim(scenario({ start: { ...testScenario().start, policies } }), 1);
      sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, waypoints: LINE, methods }]);
      const gate = sim.snapshot().projects[0].phases.find((ph) => ph.id === 'utilities')?.gate;
      return gate?.label ?? '';
    };
    expect(label(['boredTwin', 'boredTwin'], ['twoTracks'])).toBe('Launch the TBM');
    expect(label(['mined', 'cutAndCover'])).toBe('Start mining');
    expect(label(['atGrade', 'atGrade'])).toBe('Start construction');
    // At the gate the stepper is on Build and the hint names the works, not a machine that is not there.
    const sim = createSim(scenario(), 1, null, { events: false });
    sim.dispatch([
      { t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: LINE, methods: ['atGrade', 'atGrade'] },
      { t: 'addStation', projectId: TEST_PROJECT, stationId: 'a', name: 'A', template: 'surface', chainageM: 0 },
      { t: 'addStation', projectId: TEST_PROJECT, stationId: 'b', name: 'B', template: 'surface', at: B },
    ]);
    sim.run(365 * 30, (s) => (s.state.projects[0].awaiting === 'launchTBM' ? false : autopilotCommands(s.state)));
    const at = sim.snapshot();
    expect(at.mission.stage).toBe('build');
    expect(at.nextAction.objective).toBe('Start the works of Line');
    expect(at.nextAction.hint).not.toMatch(/TBM/);
  });
});

describe('numbers that agree', () => {
  test('Poland is the Polish design of the route: the par does not move when the player changes the design', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch([
      ...TEST_DESIGN,
      { t: 'enactReform', id: 'twoTracks' },
      { t: 'enactReform', id: 'twinBoreStandard' },
      { t: 'enactReform', id: 'noMezzanines' },
    ]);
    const before = sim.snapshot().projects[0].receipt;
    const costs: number[] = [];
    for (const tunnel of ['twinBore', 'cutAndCover', 'singleLargeBore', 'minedCavern'] as const) {
      sim.dispatch([
        { t: 'setDesign', projectId: TEST_PROJECT, tunnel, stationBox: tunnel === 'twinBore' ? 'compactBox' : 'mezzanineBox' },
      ]);
      const r = sim.snapshot().projects[0].receipt;
      expect(r.columns.poland.costCents, tunnel).toBe(before.columns.poland.costCents);
      expect(r.columns.poland.openDate, tunnel).toBe(before.columns.poland.openDate);
      expect(r.columns.yours.baseCents, tunnel).toBe(r.columns.poland.baseCents);
      expect(sim.snapshot().headline?.polandPerKmCents, tunnel).toBe(before.columns.poland.costPerKmCents);
      costs.push(r.columns.yours.costCents);
    }
    // The player's own figure does move.
    expect(new Set(costs).size).toBe(4);
    expect(polishMethods(['mined', 'cutAndCover', 'atGrade', 'boredSingleLarge', 'viaduct'])).toEqual([
      'boredTwin',
      'boredTwin',
      'atGrade',
      'boredTwin',
      'viaduct',
    ]);
  });

  test('the price level is its own line, the same dollars whatever is reformed, and no reform removes it', () => {
    for (const r of REFORMS)
      expect(
        r.effects.some((e) => e.key === 'unit.priceLevel'),
        r.id,
      ).toBe(false);
    expect(profileFor(REFORMS.map((r) => r.id))['unit.priceLevel']).toBe(CONSTANTS.priceLevelFactor.value);
    expect(POLAND_PROFILE).toContain(POLISH_PRICE_LEVEL.id);
    expect(profileFor(POLAND_PROFILE)['unit.priceLevel']).toBe(1);
    // Every institutional lever still reaches exactly 1 in Poland.
    const pl = profileFor(POLAND_PROFILE);
    expect([pl['unit.procurement'], pl['unit.labour'], pl['unit.thirdParty'], pl['systems.factor']]).toEqual([1, 1, 1, 1]);

    const sim = createSim(testScenario({ start: { ...testScenario().start, politicalCapital: 1000, budgetCents: 1e13 } }), 1);
    sim.dispatch(TEST_DESIGN);
    const line = () => sim.snapshot().projects[0].receipt.lines.find((l) => l.id === 'priceLevel');
    const sq = line();
    expect(sq?.reforms).toEqual([]);
    expect(sq?.status).toBe('paid');
    // Everything on the tree that reflects Polish practice. Twice: a prerequisite may sit further down the tree.
    const polish = REFORMS.filter((r) => !r.beyondPoland).map((r): GameCommand => ({ t: 'enactReform', id: r.id }));
    sim.dispatch([...polish, ...polish]);
    expect(sim.state.reforms).toHaveLength(REFORMS.filter((r) => !r.beyondPoland).length);
    const reformed = line();
    expect(reformed?.cents.yours).toBe(sq?.cents.yours);
    expect(reformed?.factor.yours).toBeCloseTo(1.61, 6);
    expect(reformed?.status).toBe('paid');
    const r = sim.snapshot().projects[0].receipt;
    // With every lever reformed what is left of the gap is the price level, the design and the delay.
    for (const id of ['procurement', 'staffing', 'utilities', 'systemsSupply', 'softCosts', 'contingency'] as const) {
      expect(r.lines.find((l) => l.id === id)?.cents.yours, id).toBe(0);
    }
    expect(r.ratios.yoursToPoland).toBeGreaterThan(1.5);
    expect(r.ratios.yoursToPoland).toBeLessThan(1.9);
  });

  test('the plan tool, the headline, the design tag and the receipt show one number for the same line', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch(TEST_DESIGN);
    const check = (): void => {
      const snap = sim.snapshot();
      const p = snap.projects[0];
      const est = sim.estimateAlignment({ projectId: TEST_PROJECT, waypoints: p.waypoints, methods: sim.state.projects[0].methods });
      expect(est.costCents).toBe(p.receipt.columns.yours.costCents);
      expect(est.costPerKmCents).toBe(p.receipt.columns.yours.costPerKmCents);
      expect(est.costPerKmCents).toBe(snap.headline?.yoursPerKmCents);
      expect(est.polandCostPerKmCents).toBe(snap.headline?.polandPerKmCents);
      expect(est.ratioToPoland).toBeCloseTo(snap.headline?.ratio ?? 0, 6);
      expect(est.openDate).toBe(p.receipt.columns.yours.openDate);
      for (const o of p.design.options) if (o.selected) expect(o.costCents, o.id).toBe(p.receipt.columns.yours.costCents);
    };
    check();
    sim.dispatch([
      { t: 'enactReform', id: 'twoTracks' },
      { t: 'enactReform', id: 'twinBoreStandard' },
      { t: 'setDesign', projectId: TEST_PROJECT, tunnel: 'twinBore' },
    ]);
    check();
    sim.dispatch([{ t: 'approveProject', projectId: TEST_PROJECT }]);
    sim.run(200);
    check();
    // A drag is priced from the same anchor: a longer line costs more than the record, not a different base.
    const longer = sim.state.projects[0].waypoints.map((w, i, all) => (i === all.length - 1 ? { ...w, x: w.x + 300 } : w));
    const dragged = sim.estimateAlignment({ projectId: TEST_PROJECT, waypoints: longer });
    expect(dragged.costCents).toBeGreaterThan(sim.snapshot().projects[0].receipt.columns.yours.costCents);
  });

  test('a reform preview is what enacting does, to within 3 percent of the change', () => {
    for (const id of ['twoTracks', 'noMezzanines', 'stageGates', 'bestValueAward', 'nepaPageLimits']) {
      const sim = createSim(testScenario(), 1);
      sim.dispatch(TEST_DESIGN);
      const before = sim.snapshot();
      const preview = before.reforms.find((r) => r.id === id)?.preview;
      if (!preview) throw new Error(`no preview for ${id}`);
      sim.dispatch([{ t: 'enactReform', id }]);
      const actual = sim.snapshot().projects[0].receipt.columns.yours.costCents - before.projects[0].receipt.columns.yours.costCents;
      expect(actual, id).toBeLessThan(0);
      expect(Math.abs(preview.costDeltaCents / actual - 1), id).toBeLessThan(0.03);
    }
  });

  test('a sponsor figure without a date has no date on the receipt or the scorecard, and the date axis is scored on the model', () => {
    const s = testScenario();
    const sim = createSim(
      {
        ...s,
        reference: {
          title: 'Study',
          ghostLabel: 'Corridor study',
          projectId: TEST_PROJECT,
          commands: TEST_DESIGN,
          officialCostCents: 1.6e11,
          source: 'test',
        },
      },
      1,
    );
    sim.dispatch([{ t: 'useOfficialPlan' }]);
    const p = sim.snapshot().projects[0];
    expect(p.receipt.ghost?.openDate).toBe('');
    expect(p.scorecard.ghost).toMatchObject({ kind: 'sponsor', openDate: '', yearsToOpen: 0 });
    expect(p.scorecard.axes.find((a) => a.id === 'date')?.reason).toMatch(/the status quo \d/);
  });
});

describe('money', () => {
  test('a card option costs what it says: the funds drop by it and the receipt shows it', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    sim.run(365 * 30, (s) =>
      s.state.projects[0].phase === 'construction' && s.state.projects[0].phaseProgress > 0.2 ? false : autopilotCommands(s.state),
    );
    const project = sim.state.projects[0];
    // A change order arrives.
    project.eventCounts.changeOrder = 1;
    sim.state.pendingEvents.push({
      uid: 900,
      defId: 'changeOrder',
      projectId: project.id,
      frontId: null,
      raisedTick: sim.state.tick,
      deadlineTick: sim.state.tick + 30,
    });
    const card = sim.snapshot().events.find((e) => e.uid === 900);
    const pay = card?.options.find((o) => o.id === 'pay');
    expect(card?.title).toBe('Change Order No. 47');
    expect(pay?.costCents).toBeGreaterThan(1e9);
    const cash = sim.state.cashCents;
    const events = project.spent.events;
    sim.dispatch([{ t: 'resolveEvent', eventId: 900, optionId: 'pay' }]);
    expect(cash - sim.state.cashCents).toBe(pay?.costCents);
    expect(project.spent.events - events).toBe(pay?.costCents);
    const line = sim.snapshot().projects[0].receipt.lines.find((l) => l.id === 'events');
    expect(line?.cents.yours).toBe(project.spent.events);
    expect(line?.status).toBe('paid');
    // The next one carries the next number.
    project.eventCounts.changeOrder = 2;
    sim.state.pendingEvents.push({
      uid: 901,
      defId: 'changeOrder',
      projectId: project.id,
      frontId: null,
      raisedTick: sim.state.tick,
      deadlineTick: sim.state.tick + 30,
    });
    expect(sim.snapshot().events.find((e) => e.uid === 901)?.title).toBe('Change Order No. 48');
  });

  test('when the money runs out the work stops at a card: wait, borrow or spend political capital', () => {
    // $1.5B of funding against a status-quo design that costs several times that.
    const sim = createSim(testScenario(), 2);
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    sim.run(365 * 40, (s) => (s.state.pendingEvents.some((e) => e.defId === 'cashCall') ? false : autopilotCommands(s.state)));
    const snap = sim.snapshot();
    const card = snap.events.find((e) => e.id === 'cashCall');
    if (!card) throw new Error('no cash call was raised');
    expect(snap.moneyCents).toBeLessThan(0);
    expect(snap.clock.hold).toBe('event');
    expect(card.description).toMatch(/short by about \$\d+\.\d\d billion/);
    const def = eventById('cashCall');
    expect(card.options.map((o) => o.id)).toEqual(def?.options.map((o) => o.id));
    const raised = card.options[0].gainCents ?? 0;
    expect(raised).toBeGreaterThan(-snap.moneyCents);
    expect(card.options.every((o) => o.gainCents === raised)).toBe(true);
    const bridge = card.options.find((o) => o.id === 'bridge');
    expect(bridge?.costCents).toBe(Math.round(raised * 0.08));
    const spentEvents = sim.state.projects[0].spent.events;
    sim.dispatch([{ t: 'resolveEvent', eventId: card.uid, optionId: 'bridge' }]);
    expect(sim.state.cashCents).toBe(snap.moneyCents + raised - (bridge?.costCents ?? 0));
    expect(sim.state.cashCents).toBeGreaterThan(0);
    expect(sim.state.projects[0].spent.events - spentEvents).toBe(bridge?.costCents);
    expect(sim.snapshot().ledger.raisedCents).toBe(raised);
    expect(sim.snapshot().feed.some((f) => f.kind === 'fundingReleased' && /raised/.test(f.text))).toBe(true);
    // The line still opens, and one call was nearly enough: at most one more.
    sim.run(365 * 40, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
    expect(sim.state.projects[0].status).toBe('open');
    expect(sim.state.projects[0].eventCounts.cashCall).toBeLessThanOrEqual(2);
  });

  test('cash paid for reforms and machines is part of the all-in cost, on its own receipt line', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch(TEST_DESIGN);
    const before = sim.snapshot().projects[0].receipt.columns.yours.costCents;
    // A $20M programme with no effect on this line's estimate: the estimate goes up by what it cost.
    sim.dispatch([{ t: 'enactReform', id: 'groundInvestigation' }]);
    const p = sim.snapshot().projects[0];
    expect(p.spentByCategory.reforms).toBe(20e8);
    expect(p.receipt.lines.find((l) => l.id === 'reformCash')?.cents).toEqual({ yours: 20e8, statusQuo: 0, poland: 0 });
    expect(p.receipt.columns.yours.costCents - before).toBe(20e8);
  });

  test('phase pay: each finished phase brings 15 political capital, so every gate arrives with something to spend', () => {
    const sim = createSim(testScenario({ start: { ...testScenario().start, politicalCapital: 0 } }), 1, null, { events: false });
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    sim.run(365 * 30, (s) => (s.state.projects[0].awaiting === 'advancePhase' ? false : undefined));
    // Two phases done (planning, permitting) and a monthly point for each month of them.
    const months = Math.floor(sim.state.tick / 30);
    expect(sim.state.politicalCapital).toBe(2 * 15 + months);
    const hint = sim.snapshot().nextAction.hint;
    expect(hint).toMatch(new RegExp(`You have ${sim.state.politicalCapital} political capital`));
    // A reform bought with cash alone is not "something to spend capital on".
    const poor = createSim(testScenario({ start: { ...testScenario().start, politicalCapital: 0 } }), 1);
    poor.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    expect(poor.snapshot().nextAction.hint).not.toMatch(/political capital/);
  });
});

describe('what the player is told', () => {
  test('mission targets carry where the stations are wanted and whether one is there', () => {
    const sim = createSim(testScenario(), 1);
    const empty = sim.snapshot().mission.targets;
    expect(empty.map((t) => t.name)).toEqual(['A', 'B']);
    expect(empty.every((t) => !t.served && t.radiusM === 100 && !t.stretch)).toBe(true);
    sim.dispatch(TEST_DESIGN);
    expect(sim.snapshot().mission.targets.map((t) => t.served)).toEqual([true, true]);
    sim.dispatch([{ t: 'removeStation', projectId: TEST_PROJECT, stationId: 'b' }]);
    expect(sim.snapshot().mission.targets.map((t) => t.served)).toEqual([true, false]);
    expect(sim.snapshot().nextAction.hint).toBe('Add a station inside the ring at B (within 100 m).');
  });

  test('a draft shows the phases the real project has behind it as done, and the rest add up to the opening date', () => {
    const s = testScenario();
    const sim = createSim({ ...s, start: { ...s.start, headStart: { phase: 'permitting', progress: 0.75, source: 'test' } } }, 1);
    sim.dispatch(TEST_DESIGN);
    const p = sim.snapshot().projects[0];
    expect(p.phases.map((ph) => ph.state)).toEqual(['done', 'todo', 'todo', 'todo', 'todo', 'todo']);
    const permitting = p.phases[1];
    expect(permitting.progress).toBe(0.75);
    expect(permitting.daysLeft).toBe(Math.round(permitting.plannedDays * 0.25));
    const left = p.phases.reduce((a, ph) => a + ph.daysLeft, 0);
    // Within a month of the forecast of record.
    expect(Math.abs(left - p.receipt.columns.yours.yearsToOpen * 365)).toBeLessThan(45);
  });

  test('dates in sentences read as a month and a year, and a grade over the limit shows the excess', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch(TEST_DESIGN);
    const reason = sim.snapshot().projects[0].scorecard.axes.find((a) => a.id === 'date')?.reason ?? '';
    expect(reason).toMatch(/^Opens [A-Z][a-z]{2} \d{4}, /);
    expect(reason).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    const steep: Waypoint[] = [
      { x: A.x, y: -20, z: A.z },
      { x: A.x + 1000, y: -20 + 30.2, z: A.z },
    ];
    const est = sim.estimateAlignment({ waypoints: steep });
    expect(est.checks.problems[0]).toBe('Segment 1 climbs 3.02 percent, maximum 3 percent');
  });
});
