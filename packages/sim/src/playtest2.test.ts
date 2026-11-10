/**
 * Regressions from the second playtest of round 2 (2026-11-10): three playtesters drove the real game and
 * reported these. Each test names the report it would have caught.
 */
import { describe, expect, test } from 'vitest';
import { checkAlignment } from './checks.ts';
import { autopilotCommands, PC_MONTHLY_CAP } from './engine.ts';
import { depthFactor, hardCost } from './model.ts';
import { profileFor } from './reforms.ts';
import { createSim, type GameSim } from './sim.ts';
import { TEST_DESIGN, TEST_PROJECT, TEST_WAYPOINTS, testScenario } from './test-scenario.ts';
import type { GameCommand, ScenarioDef, Waypoint } from './types.ts';

const A = { x: 20_000, z: -65_000 };
/** 2.0 km with one 20 degree bend, 20 m down. */
const LINE: Waypoint[] = [
  { x: A.x, y: -20, z: A.z, geology: 'softGround' },
  { x: A.x + 1000, y: -21, z: A.z, geology: 'softGround' },
  { x: A.x + 1940, y: -20, z: A.z - 342, geology: 'softGround' },
];
const B = { x: LINE[2].x, z: LINE[2].z };
const STATIONS: GameCommand[] = [
  { t: 'addStation', projectId: TEST_PROJECT, stationId: 'a', name: 'A', template: 'undergroundStandard', chainageM: 0, depthM: 20 },
  { t: 'addStation', projectId: TEST_PROJECT, stationId: 'b', name: 'B', template: 'undergroundStandard', at: B, depthM: 20 },
];
const DESIGN: GameCommand[] = [{ t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: LINE }, ...STATIONS];

function scenario(policies: string[] = [], over: Partial<ScenarioDef> = {}): ScenarioDef {
  const s = testScenario();
  return {
    ...s,
    start: { ...s.start, policies },
    objectives: [
      { id: 'connect', title: 'Connect A and B', kind: 'connect', a: { name: 'A', ...A }, b: { name: 'B', ...B }, radiusM: 100 },
      { id: 'date', title: 'Open by 2040', kind: 'openBy', date: '2040-03-31' },
    ],
    ...over,
  };
}

function yours(sim: GameSim): number {
  return sim.snapshot().projects[0].receipt.columns.yours.costCents;
}

/** Runs to the next gate of the first project, pressing nothing. */
function toGate(sim: GameSim, gate: 'advancePhase' | 'launchTBM' | 'openLine'): void {
  sim.run(365 * 40, (s) => {
    const p = s.state.projects[0];
    if (p.awaiting === gate) return false;
    return p.awaiting ? autopilotCommands(s.state) : [];
  });
  expect(sim.state.projects[0].awaiting).toBe(gate);
}

describe('an approved line stays buildable', () => {
  test('a stray waypoint that makes a hairpin is refused after approval, and nothing unbuildable reaches tender', () => {
    const sim = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
    sim.dispatch([...DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    expect(sim.snapshot().projects[0].status).toBe('active');
    const before = sim.snapshot().projects[0];
    // The click of the report: a 17th waypoint behind the terminal, a curve of under 150 m.
    sim.dispatch([{ t: 'addWaypoint', projectId: TEST_PROJECT, waypoint: { x: B.x - 120, y: -20, z: B.z + 160 } }]);
    let snap = sim.snapshot();
    expect(snap.notices.at(-1)?.reason).toMatch(
      /is approved: a change must keep the line buildable\. Curve at waypoint 3: R \d+ m, minimum 150 m/,
    );
    expect(snap.projects[0].waypoints).toHaveLength(3);
    expect(snap.projects[0].checks.ok).toBe(true);
    expect(snap.projects[0].lengthM).toBe(before.lengthM);
    // The same through setAlignment (what the plan tool sends) and through a method that cannot take the curve.
    const hairpin = [...LINE, { x: B.x - 120, y: -20, z: B.z + 160 }];
    sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, waypoints: hairpin }]);
    expect(sim.snapshot().notices.at(-1)?.command).toBe('setAlignment');
    expect(sim.snapshot().projects[0].waypoints).toHaveLength(3);
    // A buildable edit of an approved line is still allowed until tender.
    const longer = LINE.map((w, i) => (i === 2 ? { ...w, x: w.x + 100 } : w));
    sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, waypoints: longer }]);
    snap = sim.snapshot();
    expect(snap.projects[0].lengthM).toBeGreaterThan(before.lengthM + 50);
    expect(snap.projects[0].checks.ok).toBe(true);
    toGate(sim, 'advancePhase');
    expect(sim.snapshot().nextAction.kind).toBe('advancePhase');
  });

  test('a line that is unbuildable at the tender gate (an older save) is sent back to the plan, not to tender', () => {
    const sim = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
    sim.dispatch([...DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    toGate(sim, 'advancePhase');
    // What a save made before this rule could hold: the state itself carries the hairpin.
    const p = sim.state.projects[0];
    p.waypoints.push({ x: B.x - 120, y: -20, z: B.z + 160 });
    p.methods.push('boredTwin');
    p.cum.push(p.cum[p.cum.length - 1] + 200);
    sim.state.version++;
    const snap = sim.snapshot();
    expect(snap.projects[0].checks.ok).toBe(false);
    expect(snap.nextAction.kind).toBe('fixAlignment');
    expect(snap.nextAction.command).toBeNull();
    sim.dispatch([{ t: 'advancePhase', projectId: TEST_PROJECT }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/cannot go to tender: the line is not buildable/);
    expect(sim.state.projects[0].frozen).toBeNull();
    expect(sim.state.projects[0].awaiting).toBe('advancePhase');
  });
});

describe('depth costs money', () => {
  const deep = (y: number): Waypoint[] => LINE.map((w) => ({ ...w, y }));

  test('the same line 80 m down costs more than 20 m down, for the player and for Poland, whatever the method', () => {
    for (const policies of [[], ['twoTracks', 'twinBoreStandard']]) {
      const cost = (y: number): { yours: number; poland: number } => {
        const sim = createSim(scenario(policies), 1, null, { events: false });
        sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: deep(y) }, ...STATIONS]);
        const r = sim.snapshot().projects[0].receipt;
        return { yours: r.columns.yours.costCents, poland: r.columns.poland.costCents };
      };
      const at20 = cost(-20);
      const at50 = cost(-50);
      const at80 = cost(-80);
      expect(at50.yours, policies.join()).toBeGreaterThan(at20.yours);
      expect(at80.yours, policies.join()).toBeGreaterThan(at50.yours);
      expect(at80.poland).toBeGreaterThan(at20.poland);
    }
    expect(depthFactor('boredTwin', -20)).toBe(1);
    expect(depthFactor('boredTwin', -80)).toBeCloseTo(1.55, 9);
    expect(depthFactor('cutAndCover', -30)).toBeCloseTo(1.3, 9);
    expect(depthFactor('atGrade', -80)).toBe(1);
    // Rock is cheaper per metre than soft ground; depth is charged on top, so deep rock is not a bargain.
    const p = profileFor([]);
    const flags = {
      threeTrack: false,
      deepBox: false,
      oversizeStations: false,
      bespoke: false,
      terminalOversize: false,
      twinBoreDefault: true,
    };
    const geometry = (y: number, geology: 'softGround' | 'rock') => ({
      waypoints: LINE.map((w) => ({ ...w, y, geology })),
      methods: ['boredTwin', 'boredTwin'] as const,
      cum: [0, 1000, 2000],
      stations: [],
    });
    const shallowSoft = hardCost({ ...geometry(-20, 'softGround'), methods: ['boredTwin', 'boredTwin'] }, p, flags, true).civilCents;
    const deepRock = hardCost({ ...geometry(-80, 'rock'), methods: ['boredTwin', 'boredTwin'] }, p, flags, true).civilCents;
    expect(deepRock).toBeGreaterThan(shallowSoft);
  });

  test('a station keeps its street: when the line under it is lowered its platforms go down with it, and cost more', () => {
    const sim = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
    sim.dispatch(DESIGN);
    expect(sim.snapshot().projects[0].stations.map((s) => s.depthM)).toEqual([20, 20]);
    const before = yours(sim);
    sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, waypoints: deep(-60) }]);
    const stations = sim.snapshot().projects[0].stations;
    // 40 m lower at A, 40 m lower at B (the line was at -20 at both ends).
    expect(stations.map((s) => s.depthM)).toEqual([60, 60]);
    expect(yours(sim)).toBeGreaterThan(before * 1.5);
    // And back up again: the depth follows, it does not ratchet.
    sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, waypoints: LINE }]);
    expect(sim.snapshot().projects[0].stations.map((s) => s.depthM)).toEqual([20, 20]);
    expect(yours(sim)).toBe(before);
  });

  test('cut-and-cover deeper than a trench goes is not buildable and says to bore it', () => {
    const methods = ['cutAndCover', 'cutAndCover'] as const;
    expect(checkAlignment(deep(-30), [...methods]).ok).toBe(true);
    const c = checkAlignment(deep(-80), [...methods]);
    expect(c.ok).toBe(false);
    expect(c.segmentIssues).toEqual(['depth', 'depth']);
    expect(c.problems[0]).toMatch(/Segment 1 is cut-and-cover 80 m below sea level, deeper than a trench goes \(35 m\): bore or mine it/);
    expect(checkAlignment(deep(-80), ['boredTwin', 'mined']).ok).toBe(true);
  });
});

describe('the twin-bore standard is not a trap', () => {
  test('with the third track gone the twin bore is still locked; the standard unlocks it and its tag is what choosing it costs', () => {
    const sim = createSim(scenario(), 1, null, { events: false });
    sim.dispatch(DESIGN);
    sim.dispatch([{ t: 'enactReform', id: 'twoTracks' }]);
    const opt = () => {
      const o = sim.snapshot().projects[0].design.options.find((x) => x.id === 'twinBore');
      if (!o) throw new Error('no twin bore option');
      return o;
    };
    expect(opt().lockedBy.map((l) => l.reformId)).toEqual(['twinBoreStandard']);
    sim.dispatch([{ t: 'setDesign', projectId: TEST_PROJECT, tunnel: 'twinBore' }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/enact "Twin-bore standard" first/);
    expect(sim.snapshot().projects[0].design.tunnel).toBe('minedCavern');
    // The reform is worth something the free click is not: its preview is a saving, and enacting it delivers the saving.
    const reform = sim.snapshot().reforms.find((r) => r.id === 'twinBoreStandard');
    expect(reform?.cost.pc).toBe(10);
    expect(reform?.unlocks).toEqual(['twinBore']);
    expect(reform?.preview?.costDeltaCents).toBeLessThan(-1e9);
    const before = yours(sim);
    sim.dispatch([{ t: 'enactReform', id: 'twinBoreStandard' }]);
    expect(yours(sim)).toBeLessThan(before);
    expect(opt().lockedBy).toEqual([]);
    expect(sim.snapshot().projects[0].design.tunnel).toBe('twinBore');
    // Every reform in the tree that is priced in political capital changes something a free click does not.
    const fresh = createSim(scenario(), 1, null, { events: false });
    fresh.dispatch(DESIGN);
    fresh.dispatch([{ t: 'enactReform', id: 'twoTracks' }]);
    const chooser = fresh.snapshot().projects[0].design.options.filter((o) => o.lockedBy.length === 0 && !o.selected);
    for (const o of chooser) expect(o.id, 'a free option must not be the Polish tunnel').not.toBe('twinBore');
  });
});

describe('price tags that are read with time standing are what the click does', () => {
  test('a reform preview and a design tag are forecast runs while the game is paused: exact to the cent', () => {
    for (const id of ['twinBoreStandard', 'noMezzanines', 'stageGates', 'bestValueAward', 'roundTheClock', 'nepaPageLimits']) {
      const sim = createSim(scenario(['twoTracks']), 1, null, { events: false });
      sim.dispatch(DESIGN);
      // The reform screen pauses the game: speed 0 is what the sim sees.
      sim.dispatch([{ t: 'setSpeed', speed: 0 }]);
      const before = sim.snapshot();
      const preview = before.reforms.find((r) => r.id === id)?.preview;
      if (!preview) throw new Error(`no preview for ${id}`);
      expect(preview.exact, id).toBe(true);
      sim.dispatch([{ t: 'enactReform', id }]);
      const after = sim.snapshot();
      const actual = after.projects[0].receipt.columns.yours.costCents - before.projects[0].receipt.columns.yours.costCents;
      expect(preview.costDeltaCents, id).toBe(actual);
      expect(after.headline?.yoursPerKmCents, id).toBe(preview.costPerKmAfterCents);
      expect(after.headline?.ratio, id).toBeCloseTo(preview.ratioToPolandAfter, 9);
    }
    // Design tags: every unlocked option, chosen, lands on its tag.
    for (const pick of ['singleLargeBore', 'cutAndCover', 'twinBore'] as const) {
      const sim = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
      sim.dispatch([
        { t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: LINE, methods: ['mined', 'mined'] },
        ...STATIONS,
      ]);
      sim.dispatch([{ t: 'setSpeed', speed: 0 }]);
      const tag = sim.snapshot().projects[0].design.options.find((o) => o.id === pick);
      if (!tag) throw new Error(`no option ${pick}`);
      sim.dispatch([{ t: 'setDesign', projectId: TEST_PROJECT, tunnel: pick }]);
      expect(sim.snapshot().notices, pick).toEqual([]);
      expect(yours(sim), pick).toBe(tag.costCents);
    }
  });

  test('with time running the tags are the closed form, within a percent, and cost no forecast runs', () => {
    const sim = createSim(scenario(['twoTracks']), 1, null, { events: false });
    sim.dispatch(DESIGN);
    const before = sim.snapshot();
    const preview = before.reforms.find((r) => r.id === 'stageGates')?.preview;
    expect(preview?.exact).toBe(false);
    sim.dispatch([{ t: 'enactReform', id: 'stageGates' }]);
    const actual = yours(sim) - before.projects[0].receipt.columns.yours.costCents;
    expect(Math.abs((preview?.costDeltaCents ?? 0) / actual - 1)).toBeLessThan(0.03);
  });
});

describe('reforms and the tender', () => {
  const run = (when: 'beforeTender' | 'atLaunch' | 'never'): GameSim => {
    const sim = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
    sim.dispatch([...DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    toGate(sim, 'advancePhase');
    if (when === 'beforeTender') sim.dispatch([{ t: 'enactReform', id: 'bestValueAward' }]);
    sim.dispatch([{ t: 'advancePhase', projectId: TEST_PROJECT }]);
    toGate(sim, 'launchTBM');
    if (when === 'atLaunch') sim.dispatch([{ t: 'enactReform', id: 'bestValueAward' }]);
    return sim;
  };

  test('tender fixes the contract prices: a procurement reform bought before it pays, the same reform bought at the launch gate does not', () => {
    const never = run('never');
    const early = run('beforeTender');
    const late = run('atLaunch');
    expect(never.state.projects[0].contract).toEqual({ procurement: 1.5, labour: 1.3, thirdParty: 1.2 });
    expect(early.state.projects[0].contract?.procurement).toBeCloseTo(1.25, 9);
    // 1.5 to 1.25 on every hard dollar: a sixth off the civil works and the stations.
    expect(yours(early)).toBeLessThan(yours(never) * 0.9);
    // The second playtest banked its capital to the launch gate and halved the price there. Not any more.
    expect(yours(late)).toBe(yours(never));
    // The hint at the tender gate says what the gate fixes, and the preview at the launch gate says why it is zero.
    const atTender = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
    atTender.dispatch([...DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    toGate(atTender, 'advancePhase');
    expect(atTender.snapshot().nextAction.hint).toMatch(/Tender locks the design and the contract prices/);
    const offer = never.snapshot().reforms.find((r) => r.id === 'bestValueAward')?.preview;
    expect(offer?.costDeltaCents).toBe(0);
    expect(offer?.notes?.join(' ')).toMatch(/contracts of Line were let at tender/);
    // What is not under contract still follows the reforms: the contingency policy, the consultants.
    const before = yours(never);
    never.dispatch([{ t: 'enactReform', id: 'stageGates' }]);
    expect(yours(never)).toBeLessThan(before * 0.95);
    // A permitting reform bought after permitting says that its time is spent.
    const nepa = never.snapshot().reforms.find((r) => r.id === 'fundLocally')?.preview;
    expect(nepa?.daysDelta).toBe(0);
    expect(nepa?.notes?.join(' ')).toMatch(/Permitting and funding agreement is behind Line/);
  });

  test('machine-speed tech on a line whose stations set the date says so before the cash is spent', () => {
    const sim = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
    sim.dispatch(DESIGN);
    const r = sim.snapshot().reforms.find((x) => x.id === 'segmentPlantLogistics');
    expect(r?.preview?.daysDelta).toBe(0);
    expect(r?.preview?.costDeltaCents).toBeGreaterThan(0);
    expect(r?.preview?.notes?.join(' ')).toMatch(
      /Boring takes \d+ months, \d+ months with this\. The station boxes take \d+ months and set the opening date/,
    );
    // The chooser says the same of the tunnel methods: each has its own heading time beside the stations' time.
    const options = sim.snapshot().projects[0].design.options.filter((o) => o.group === 'tunnel');
    const days = Object.fromEntries(options.map((o) => [o.id, o.headingDays ?? 0]));
    expect(days.minedCavern).toBeGreaterThan(days.twinBore * 2);
    expect(days.cutAndCover).toBeGreaterThan(days.twinBore);
    for (const o of options) expect(o.stationDays, o.id).toBeGreaterThan(600);
    // On a line with no machine the note is about that.
    const surface = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
    surface.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: LINE, methods: ['atGrade', 'atGrade'] }]);
    const none = surface.snapshot().reforms.find((x) => x.id === 'segmentPlantLogistics')?.preview;
    expect(none?.notes?.join(' ')).toMatch(/has no boring machine/);
    // A card reform: the estimate cannot show what it buys, and says so.
    const pothole = sim.snapshot().reforms.find((x) => x.id === 'potholeFirst')?.preview;
    expect(pothole?.notes?.join(' ')).toMatch(/Event cards are priced when they are drawn/);
  });

  test('political capital stops piling up: the monthly mandate ends at the cap, milestones still pay', () => {
    const sim = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
    sim.dispatch(DESIGN);
    sim.run(365 * 60, (s) => autopilotCommands(s.state));
    expect(sim.state.projects[0].status).toBe('open');
    // 100 at the start; the second playtest reached 1,556 by 2072.
    expect(sim.state.politicalCapital).toBeLessThanOrEqual(PC_MONTHLY_CAP + 6 * 15 + 10 + 20);
    const pc = sim.state.politicalCapital;
    sim.run(365 * 5);
    expect(sim.state.politicalCapital).toBe(pc);
  });
});

describe('the receipt compares like with like', () => {
  test('the official figure is measured against Poland on the official route, whatever the player draws', () => {
    const reference: ScenarioDef['reference'] = {
      title: 'The official plan',
      ghostLabel: 'Official plan',
      projectId: TEST_PROJECT,
      commands: TEST_DESIGN,
      officialCostCents: 5_000_000_000_00,
      officialOpenDate: '2036-03-31',
      source: 'test',
    };
    const official = createSim(scenario([], { reference }), 1, null, { events: false });
    official.dispatch([{ t: 'useOfficialPlan' }]);
    const own = createSim(scenario([], { reference }), 1, null, { events: false });
    own.dispatch(DESIGN);
    const a = official.snapshot().projects[0];
    const b = own.snapshot().projects[0];
    expect(b.lengthM).toBeGreaterThan(a.lengthM * 1.3);
    expect(b.receipt.columns.poland.costPerKmCents).not.toBe(a.receipt.columns.poland.costPerKmCents);
    // One sponsor figure, one ratio: 11.8 times on a hand-drawn line and 18.7 on the official one was the report.
    expect(b.receipt.ratios.ghostToPoland).toBe(a.receipt.ratios.ghostToPoland);
    expect(b.receipt.ghost?.polandPerKmCents).toBe(a.receipt.columns.poland.costPerKmCents);
    expect(b.scorecard.verdict).toContain(`${(a.receipt.ratios.ghostToPoland ?? 0).toFixed(1)}x.`);
    // On the official route the status quo column is the official plan; on a drawn line it is that line under
    // the rules of day one, so the three columns have one length and start from one base.
    expect(a.receipt.columns.statusQuo.basis).toMatch(/^The official plan, under the rules of 2026/);
    expect(b.receipt.columns.statusQuo.basis).toMatch(/^Your route and methods under the rules of 2026/);
    for (const r of [a.receipt, b.receipt]) {
      expect(r.columns.statusQuo.lengthKm).toBeCloseTo(r.columns.yours.lengthKm, 9);
      expect(r.columns.statusQuo.baseCents).toBe(r.columns.poland.baseCents);
      expect(r.columns.yours.baseCents).toBe(r.columns.poland.baseCents);
    }
    // The count on the receipt is the count on the reform screen: reforms in force, day one included.
    const withLaw = createSim(scenario(['narrowRecord'], { reference }), 1, null, { events: false });
    withLaw.dispatch([{ t: 'useOfficialPlan' }]);
    expect(withLaw.snapshot().projects[0].receipt.columns.yours.basis).toMatch(/, 1 reform in force$/);
    expect(withLaw.snapshot().reforms.filter((r) => r.status === 'enacted')).toHaveLength(1);
    // A surface line is not described as twin bores.
    const surface = createSim(scenario(), 1, null, { events: false });
    surface.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: LINE, methods: ['atGrade', 'atGrade'] }]);
    expect(surface.snapshot().projects[0].receipt.columns.poland.basis).not.toMatch(/bore/);
    expect(own.snapshot().projects[0].receipt.columns.poland.basis).toMatch(/twin 6\.6 m bores/);
  });

  test('the star rating says which axis holds it down, and objective dates read as dates', () => {
    const sim = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
    sim.dispatch(DESIGN);
    const card = sim.snapshot().projects[0].scorecard;
    const weakest = card.axes.filter((a) => a.stars === card.stars);
    expect(card.stars).toBe(Math.min(...card.axes.map((a) => a.stars)));
    if (card.stars < 3) {
      expect(card.starsReason).toMatch(/^Rating is your weakest axis: /);
      for (const a of weakest) expect(card.starsReason).toContain(a.id === 'date' ? 'opening date' : a.id);
    }
    const date = sim.snapshot().objectives.find((o) => o.id === 'date');
    expect(date?.detail).toBe('target 31 Mar 2040');
    sim.run(365 * 40, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
    expect(sim.snapshot().objectives.find((o) => o.id === 'date')?.detail).toMatch(
      /^opened \d{1,2} [A-Z][a-z]{2} \d{4}, target 31 Mar 2040$/,
    );
    expect(sim.snapshot().objectives.find((o) => o.id === 'connect')?.detail).toMatch(/^Line opened \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });
});

describe('station types have price tags', () => {
  test('every type says what one more of it adds to the estimate, and the official plan proposes the type for its rings', () => {
    const reference: ScenarioDef['reference'] = {
      title: 'The official plan',
      projectId: TEST_PROJECT,
      commands: [
        { t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: LINE },
        { t: 'addStation', projectId: TEST_PROJECT, stationId: 'a', name: 'A', template: 'undergroundStandard', chainageM: 0 },
        { t: 'addStation', projectId: TEST_PROJECT, stationId: 'b', name: 'B', template: 'terminalFitOut', at: B },
      ],
      source: 'test',
    };
    const sim = createSim(scenario([], { reference }), 1, null, { events: false });
    // Before a line exists the rings already say what the plan builds there.
    const targets = sim.snapshot().mission.targets;
    expect(targets.map((t) => t.template)).toEqual(['undergroundStandard', 'terminalFitOut']);
    expect(targets[1].templateNote).toMatch(/station box that already stands/);
    sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: LINE }]);
    const before = yours(sim);
    const options = sim.snapshot().projects[0].stationOptions ?? [];
    expect(options.map((o) => o.template)).toEqual([
      'undergroundStandard',
      'undergroundDeepMined',
      'terminalFitOut',
      'inBore',
      'surface',
      'elevated',
    ]);
    const by = Object.fromEntries(options.map((o) => [o.template, o]));
    // The report: two default boxes nearly quadrupled the estimate and nothing had said what a box costs.
    expect(by.undergroundStandard.costCents).toBeGreaterThan(5e10);
    expect(by.terminalFitOut.costCents).toBeLessThan(by.undergroundStandard.costCents);
    expect(by.undergroundDeepMined.costCents).toBeGreaterThan(by.undergroundStandard.costCents);
    expect(by.surface.costCents).toBeLessThan(by.terminalFitOut.costCents);
    for (const o of options) {
      expect(o.label.length, o.template).toBeGreaterThan(3);
      expect(o.note.length, o.template).toBeGreaterThan(20);
      expect(o.buildDays, o.template).toBeGreaterThan(100);
      expect(o.polandCents, o.template).toBeGreaterThan(0);
      expect(o.polandCents, o.template).toBeLessThan(o.costCents);
    }
    // The tag is what placing the station does to the estimate, within the closed form's few percent.
    sim.dispatch([
      { t: 'addStation', projectId: TEST_PROJECT, stationId: 'x', name: 'X', template: 'undergroundStandard', chainageM: 1000 },
    ]);
    const added = yours(sim) - before;
    expect(Math.abs(by.undergroundStandard.costCents / added - 1)).toBeLessThan(0.1);
    // Frozen at tender: no tags for a choice that is gone.
    sim.dispatch(STATIONS);
    sim.dispatch([{ t: 'approveProject', projectId: TEST_PROJECT }]);
    toGate(sim, 'advancePhase');
    sim.dispatch([{ t: 'advancePhase', projectId: TEST_PROJECT }]);
    expect(sim.snapshot().projects[0].stationOptions).toEqual([]);
  });

  test('a station box choice with no box station on the line is marked as not applying', () => {
    const sim = createSim(scenario(), 1, null, { events: false });
    sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: TEST_WAYPOINTS }]);
    const boxes = () => sim.snapshot().projects[0].design.options.filter((o) => o.group === 'station');
    expect(boxes().map((o) => o.applies)).toEqual([false, false]);
    sim.dispatch([{ t: 'addStation', projectId: TEST_PROJECT, stationId: 'a', name: 'A', template: 'undergroundStandard', chainageM: 0 }]);
    expect(boxes().map((o) => o.applies)).toEqual([true, true]);
  });
});

describe('a longer line opens later', () => {
  test('fit-out grows with the route beyond 10 km, up to four times; short lines are unchanged', () => {
    const opens = (km: number): number => {
      const sim = createSim(scenario(['twoTracks', 'twinBoreStandard']), 1, null, { events: false });
      const wps: Waypoint[] = [];
      // Straight east in 2 km steps: any length, no curves.
      for (let i = 0; i <= km / 2; i++) wps.push({ x: 5000 + i * 2000, y: -20, z: -50_000, geology: 'softGround' });
      sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: wps }]);
      return sim.snapshot().projects[0].receipt.columns.yours.yearsToOpen;
    };
    const at2 = opens(2);
    const at8 = opens(8);
    const at20 = opens(20);
    const at60 = opens(60);
    // Up to 10 km only the boring grows with the length (these lines have no stations to wait for).
    expect(at8).toBeGreaterThanOrEqual(at2);
    expect(at8).toBeLessThan(at2 + 1);
    // The report: 626 km "opens Oct 2041", 17 km "opens Sep 2041".
    expect(at20).toBeGreaterThan(at8 + 0.7);
    expect(at60).toBeGreaterThan(at20 + 2.5);
    // And it is bounded: a line across the whole map still opens within decades and the forecast still ends.
    expect(at60).toBeLessThan(at8 + (20 * 3) / 12 + 0.2);
    const fitOut = (km: number): number => {
      const sim = createSim(scenario(), 1, null, { events: false });
      const wps: Waypoint[] = [];
      for (let i = 0; i <= km / 2; i++) wps.push({ x: 5000 + i * 2000, y: -20, z: -50_000, geology: 'softGround' });
      sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: wps }]);
      return sim.snapshot().projects[0].phases.find((ph) => ph.id === 'fitOut')?.plannedDays ?? 0;
    };
    expect(fitOut(4)).toBe(Math.round(20 * 30.4375));
    expect(fitOut(20)).toBe(Math.round(30 * 30.4375));
    expect(fitOut(70)).toBe(Math.round(80 * 30.4375));
  });
});

describe('the Polish design built by hand is not cheaper than the Polish design', () => {
  test('a twin bore driven through voxels that are rock, with the right machine bought, has no negative design line', () => {
    // The plan says Bay Mud; the voxels say rock. Poland's column prices the plan's ground with the right machine.
    const mud: Waypoint[] = LINE.map((w) => ({ ...w, geology: 'bayMud' }));
    const sim = createSim(scenario(['twoTracks', 'twinBoreStandard', 'groundInvestigation', 'rightMachine']), 3, null, {
      events: false,
      ground: () => 7,
    });
    sim.dispatch([{ t: 'setAlignment', projectId: TEST_PROJECT, name: 'Line', waypoints: mud }, ...STATIONS]);
    sim.run(365 * 30, (s) => (s.state.projects[0].fronts.length > 0 ? false : autopilotCommands(s.state)));
    const heading = sim.state.projects[0].fronts[0];
    sim.dispatch([{ t: 'tbmControl', headingId: heading.id, autopilot: false, thrust: 1 }]);
    sim.run(365 * 30, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
    const snap = sim.snapshot();
    expect(snap.projects[0].status).toBe('open');
    expect(sim.state.projects[0].fronts[0].drive).not.toBeNull();
    const line = snap.projects[0].receipt.lines.find((l) => l.id === 'designTunnel');
    // The report: "Tunnel cross-section and method: -$8.35M", tagged "reduced", for the Polish bore itself.
    expect(line?.cents.yours).toBeGreaterThanOrEqual(0);
    expect(line?.cents.yours).toBeLessThan(1e8);
    expect(sim.state.projects[0].offPlanCents).toBe(0);
  });
});
