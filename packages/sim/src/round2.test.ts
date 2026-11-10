/** Round 2 (docs/CONTRACTS.md): sub-steps, driving, design chooser, estimates, receipt, trains, hand dig, saves. */
import { Material, type SaveFile, type WorldEdit } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { checkAlignment, vertexRadiusM } from './checks.ts';
import { CONSTANTS, SUBSTEPS_PER_DAY } from './constants.ts';
import { autopilotCommands, freeDeviationM, offPlanFactor } from './engine.ts';
import { faceGeology, geologyOfMaterial } from './ground.ts';
import { advanceRate } from './model.ts';
import { starsOf } from './receipt.ts';
import { profileFor } from './reforms.ts';
import { createSim, type GameSim, hashState, loadSim, type SimOptions } from './sim.ts';
import { TEST_DESIGN, TEST_PROJECT, testScenario } from './test-scenario.ts';
import { serviceCycleS, trainsAt } from './trains.ts';
import {
  type GameCommand,
  type GameSnapshot,
  RECEIPT_COLUMNS,
  RECEIPT_GROUPS,
  RECEIPT_LINES,
  type ScenarioDef,
  type SimState,
  type TbmView,
  type Waypoint,
} from './types.ts';

const A = { x: 20_000, z: -65_000 };
/** 1.0 km twin-bore line: 500 m east, a 20 degree bend, 500 m on. Stations at both ends. */
const DRIVE_LINE: Waypoint[] = [
  { x: A.x, y: -20, z: A.z, geology: 'softGround' },
  { x: A.x + 500, y: -22, z: A.z, geology: 'softGround' },
  { x: A.x + 970, y: -20, z: A.z - 171, geology: 'bayMud' },
];
const B = { x: DRIVE_LINE[2].x, z: DRIVE_LINE[2].z };
const DRIVE_DESIGN: GameCommand[] = [
  { t: 'setAlignment', projectId: TEST_PROJECT, name: 'Drive line', waypoints: DRIVE_LINE, methods: ['boredTwin', 'boredTwin'] },
  { t: 'addStation', projectId: TEST_PROJECT, stationId: 'a', name: 'A', template: 'undergroundStandard', chainageM: 0 },
  { t: 'addStation', projectId: TEST_PROJECT, stationId: 'b', name: 'B', template: 'undergroundStandard', at: B },
];

function driveScenario(): ScenarioDef {
  const s = testScenario();
  return {
    ...s,
    // Two tracks and the twin-bore standard, so a twin bore is two tubes and may be chosen.
    start: { ...s.start, policies: ['twinBoreStandard'] },
    objectives: [
      { id: 'connect', title: 'Connect A and B', kind: 'connect', a: { name: 'A', ...A }, b: { name: 'B', ...B }, radiusM: 100 },
    ],
  };
}

/** A sim with the drive line launched: one TBM, one day into its run. */
function launched(seed = 3, world: { applyEdit(e: WorldEdit): unknown } | null = null, opts: SimOptions = { events: false }): GameSim {
  const sim = createSim(driveScenario(), seed, world, opts);
  sim.dispatch(DRIVE_DESIGN);
  sim.run(365 * 30, (s) => (s.state.projects[0].fronts.length > 0 ? false : autopilotCommands(s.state)));
  expect(sim.state.projects[0].fronts).toHaveLength(1);
  return sim;
}

function tbm(sim: GameSim): TbmView {
  return sim.snapshot().projects[0].tbms[0];
}

function substeps(sim: GameSim, n: number, each?: (i: number) => void): void {
  for (let i = 0; i < n; i++) {
    sim.substep();
    each?.(i);
  }
}

const HEADING = `${TEST_PROJECT}/f1`;

describe('alignment checks', () => {
  const flat = (pts: [number, number][], y = -20): Waypoint[] => pts.map(([x, z]) => ({ x: A.x + x, y, z: A.z + z }));

  test('a square corner between two blocks is a curve of half a block and fails; the same turn drawn as an arc passes', () => {
    const corner = checkAlignment(
      flat([
        [0, 0],
        [280, 0],
        [280, -280],
      ]),
    );
    expect(corner.minRadiusM).toBeCloseTo(140, 6);
    expect(corner.vertexIssues).toEqual([null, 'radius', null]);
    expect(corner.ok).toBe(false);
    expect(corner.problems[0]).toMatch(/Curve at waypoint 2: R 140 m, minimum 150 m/);
    // Tangent polygon of an R 200 m quarter circle in three chords.
    const r = 200;
    const reach = r / Math.cos(Math.PI / 12);
    const arc: [number, number][] = [15, 45, 75].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return [300 + reach * Math.sin(a), -r + reach * Math.cos(a)];
    });
    const rounded = checkAlignment(flat([[0, 0], ...arc, [300 + r, -r - 300]]));
    expect(rounded.ok, rounded.problems.join('; ')).toBe(true);
    expect(rounded.minRadiusM).toBeCloseTo(200, 3);
    expect(rounded.lengthM).toBeGreaterThan(900);
  });

  test('grade, short segments, the map edge and the large-bore radius are flagged where they occur', () => {
    const steep = checkAlignment([
      { x: A.x, y: -20, z: A.z },
      { x: A.x + 100, y: -16, z: A.z },
      { x: A.x + 110, y: -16, z: A.z },
    ]);
    expect(steep.segmentIssues).toEqual(['grade', 'short']);
    expect(steep.maxGradePct).toBeCloseTo(4, 6);
    expect(steep.limits).toEqual({ minRadiusM: 150, maxGradePct: 3 });
    expect(
      checkAlignment([
        { x: -50, y: 0, z: A.z },
        { x: 100, y: 0, z: A.z },
      ]).vertexIssues[0],
    ).toBe('bounds');
    // 40 degrees between 250 m legs is R 343 m: fine for a metro tube, too tight for a 16 m machine.
    const bend = flat([
      [0, 0],
      [400, 0],
      [706, -257],
    ]);
    expect(checkAlignment(bend, ['boredTwin', 'boredTwin']).ok).toBe(true);
    const large = checkAlignment(bend, ['boredSingleLarge', 'boredSingleLarge']);
    expect(large.ok).toBe(true);
    expect(large.limits.minRadiusM).toBe(300);
    // The same 40 degrees between 200 m legs is R 275 m.
    const tight = flat([
      [0, 0],
      [200, 0],
      [353, -129],
    ]);
    expect(vertexRadiusM(tight[0], tight[1], tight[2])).toBeGreaterThan(150);
    expect(checkAlignment(tight, ['boredSingleLarge', 'boredSingleLarge']).vertexIssues[1]).toBe('radius');
    expect(() => checkAlignment(bend, ['boredTwin'])).toThrow(/1 methods for 2 segments/);
    // A straight line has no radius at all.
    expect(
      checkAlignment(
        flat([
          [0, 0],
          [300, 0],
          [600, 0],
        ]),
      ).minRadiusM,
    ).toBeNull();
  });

  test('an alignment that fails its checks cannot be approved, and the notice says why', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch([
      {
        t: 'setAlignment',
        projectId: 'bad',
        waypoints: flat([
          [0, 0],
          [280, 0],
          [280, -280],
        ]),
      },
      { t: 'approveProject', projectId: 'bad' },
    ]);
    const s = sim.snapshot();
    expect(s.projects[0].status).toBe('draft');
    expect(s.notices.at(-1)?.reason).toMatch(/not buildable: Curve at waypoint 2/);
    expect(s.projects[0].nextAction.kind).toBe('fixAlignment');
    expect(s.projects[0].alignment.vertexIssues).toEqual([null, 'radius', null]);
  });
});

describe('round 2 commands', () => {
  test('malformed round 2 commands throw naming the field', () => {
    const sim = createSim(testScenario(), 1);
    expect(() => sim.dispatch([{ t: 'setDesign', projectId: 'x' }])).toThrow(/one of tunnel or stationBox is required/);
    expect(() => sim.dispatch([{ t: 'setDesign', projectId: 'x', tunnel: 'hyperloop' }])).toThrow(/tunnel must be one of twinBore/);
    expect(() => sim.dispatch([{ t: 'tbmControl', headingId: 'h', thrust: 'full' }])).toThrow(/thrust must be a finite number/);
    expect(() => sim.dispatch([{ t: 'tbmControl', headingId: 'h', autopilot: 1 }])).toThrow(/autopilot must be a boolean/);
    expect(() => sim.dispatch([{ t: 'chargeDig', volumeM3: -1 }])).toThrow(/volumeM3 must not be negative/);
    expect(() => sim.dispatch([{ t: 'removeProject' }])).toThrow(/projectId must be a non-empty string/);
  });

  test('useOfficialPlan draws the reference once, replaces a draft, and is refused without a reference or after approval', () => {
    const bare = createSim(testScenario(), 1);
    bare.dispatch([{ t: 'useOfficialPlan' }]);
    expect(bare.snapshot().notices.at(-1)?.reason).toMatch(/has no official plan/);

    const scenario = testScenario({ reference: { title: 'Plan', projectId: TEST_PROJECT, commands: TEST_DESIGN, source: 'test' } });
    const sim = createSim(scenario, 1);
    expect(sim.snapshot().nextAction.kind).toBe('drawAlignment');
    expect(sim.snapshot().mission).toMatchObject({ stage: 'plan', projectId: null, planProjectId: TEST_PROJECT, complete: false });
    // The player's own line under the mission id, then the official plan over it.
    sim.dispatch([
      { t: 'setAlignment', projectId: TEST_PROJECT, waypoints: DRIVE_LINE },
      { t: 'addStation', projectId: TEST_PROJECT, name: 'Mine', template: 'surface', chainageM: 10 },
      { t: 'useOfficialPlan' },
    ]);
    let p = sim.snapshot().projects[0];
    expect(sim.snapshot().notices).toEqual([]);
    expect(p.waypoints).toHaveLength(5);
    expect(p.stations.map((s) => s.id)).toEqual(['a', 'b']);
    expect(p.design.tunnel).toBe('mixed');
    sim.dispatch([{ t: 'useOfficialPlan' }]);
    expect(sim.snapshot().notices).toEqual([]);
    expect(sim.snapshot().projects).toHaveLength(1);
    // Still allowed in approvals, until the design is frozen at tender.
    sim.dispatch([
      { t: 'approveProject', projectId: TEST_PROJECT },
      { t: 'removeStation', projectId: TEST_PROJECT, stationId: 'b' },
      { t: 'useOfficialPlan' },
    ]);
    p = sim.snapshot().projects[0];
    expect(p.status).toBe('active');
    expect(p.stations.map((s) => s.id)).toEqual(['a', 'b']);
    expect(sim.snapshot().notices).toEqual([]);
    sim.run(365 * 12, (s) => (s.state.projects[0].frozen ? false : autopilotCommands(s.state)));
    sim.dispatch([{ t: 'useOfficialPlan' }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/went to tender; its design is frozen/);
  });

  test('removeProject deletes a draft and nothing else', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch([...TEST_DESIGN, { t: 'removeProject', projectId: TEST_PROJECT }]);
    expect(sim.snapshot().projects).toEqual([]);
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }, { t: 'removeProject', projectId: TEST_PROJECT }]);
    expect(sim.snapshot().projects).toHaveLength(1);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/only a draft can be removed/);
    sim.dispatch([{ t: 'removeProject', projectId: 'nope' }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/no project "nope"/);
  });

  test('chargeDig charges volume times the hand price, to the ledger or to a project', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch(TEST_DESIGN);
    const before = sim.snapshot();
    const perM3 = before.handDig.centsPerM3;
    // 1,450 PLN per m3 at 3.71 PLN/USD times the status-quo unit factors (1.5 x 1.3 x 1.2 x 1.61).
    expect(perM3).toBe(Math.round((1450 / 3.71) * 100 * 1.5 * 1.3 * 1.2 * 1.61));
    sim.dispatch([
      { t: 'chargeDig', volumeM3: 100 },
      { t: 'chargeDig', volumeM3: 50, projectId: TEST_PROJECT },
      { t: 'chargeDig', volumeM3: 0 },
    ]);
    const after = sim.snapshot();
    expect(after.handDig.volumeM3).toBe(150);
    // The snapshot price is rounded to the cent per m3; the charge is not, so they differ by under half a cent per m3.
    expect(Math.abs(after.handDig.cents - 150 * perM3)).toBeLessThanOrEqual(150 * 0.5 + 2);
    expect(before.moneyCents - after.moneyCents).toBe(after.handDig.cents);
    expect(after.ledger.byCategory.civil).toBe(after.handDig.cents);
    const project = after.projects[0];
    expect(Math.abs(project.spentCents - 50 * perM3)).toBeLessThanOrEqual(50 * 0.5 + 1);
    const line = project.receipt.lines.find((l) => l.id === 'handDig');
    expect(line?.cents.yours).toBeGreaterThan(0);
    expect(line?.cents.statusQuo).toBe(0);
    sim.dispatch([{ t: 'chargeDig', volumeM3: 10, projectId: 'nope' }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/no project "nope"/);
    sim.dispatch([{ t: 'chargeDig', volumeM3: 1e9 }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/more than one brush can move/);
    expect(sim.snapshot().handDig.volumeM3).toBe(150);
  });
});

describe('design chooser', () => {
  test('the status quo locks the Polish options behind the reforms that allow them, with price tags on every option', () => {
    const sim = createSim(testScenario(), 1);
    // No methods given: under the three-track mandate a new line is a mined cavern.
    sim.dispatch([
      { t: 'setAlignment', projectId: TEST_PROJECT, waypoints: DRIVE_LINE },
      { t: 'addStation', projectId: TEST_PROJECT, stationId: 'a', name: 'A', template: 'undergroundStandard', chainageM: 0 },
      { t: 'addStation', projectId: TEST_PROJECT, stationId: 'b', name: 'B', template: 'undergroundStandard', at: B },
    ]);
    let d = sim.snapshot().projects[0].design;
    expect(d).toMatchObject({ tunnel: 'minedCavern', stationBox: 'mezzanineBox', frozen: false });
    expect(d.options.map((o) => o.id)).toEqual(['twinBore', 'singleLargeBore', 'cutAndCover', 'minedCavern', 'compactBox', 'mezzanineBox']);
    const opt = (id: string) => {
      const o = d.options.find((x) => x.id === id);
      if (!o) throw new Error(`no option ${id}`);
      return o;
    };
    // One lock each: the reform that takes the third track away and allows two small tubes, and the station reform.
    expect(opt('twinBore').lockedBy).toEqual([{ reformId: 'twinBoreStandard', title: 'Polish tunnel: two tracks, twin bore' }]);
    expect(opt('compactBox').lockedBy).toEqual([{ reformId: 'stationCatalogue', title: 'Standard compact stations' }]);
    for (const id of ['singleLargeBore', 'cutAndCover', 'minedCavern', 'mezzanineBox']) expect(opt(id).lockedBy).toEqual([]);
    expect(opt('minedCavern')).toMatchObject({ selected: true, deltaCents: 0, deltaDays: 0, practice: 'california' });
    expect(opt('mezzanineBox')).toMatchObject({ selected: true, deltaCents: 0 });
    // The Polish options are cheaper, the giant single bore dearer than twin tubes; every tag is an all-in project cost.
    expect(opt('twinBore').deltaCents).toBeLessThan(0);
    expect(opt('compactBox').deltaCents).toBeLessThan(0);
    expect(opt('singleLargeBore').costCents).toBeGreaterThan(opt('twinBore').costCents);
    // On a 1 km line the station boxes take longer than either heading, so the tunnel choice does not move the date.
    expect(opt('twinBore').deltaDays).toBeLessThanOrEqual(0);
    for (const o of d.options) {
      expect(o.costCents, o.id).toBeGreaterThan(0);
      expect(o.costPerKmCents, o.id).toBeGreaterThan(0);
      expect(o.daysToOpen, o.id).toBeGreaterThan(365);
      expect(o.evidence, o.id).toMatch(/doc \d+/);
    }

    // Locked options are refused and the notice names the reform.
    sim.dispatch([{ t: 'setDesign', projectId: TEST_PROJECT, tunnel: 'twinBore' }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(
      /"Twin bore, 6.6 m" is not allowed by the standards in force; enact "Polish tunnel: two tracks, twin bore" first/,
    );
    sim.dispatch([{ t: 'setDesign', projectId: TEST_PROJECT, tunnel: 'singleLargeBore', stationBox: 'compactBox' }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/"Compact box".*"Standard compact stations"/);
    expect(sim.snapshot().projects[0].design.tunnel).toBe('minedCavern');

    // The reforms unlock them; the snapshot says which reform unlocks what.
    const reforms = sim.snapshot().reforms;
    expect(reforms.find((r) => r.id === 'roundTheClock')?.unlocks).toEqual([]);
    expect(reforms.find((r) => r.id === 'twinBoreStandard')?.unlocks).toEqual(['twinBore']);
    expect(reforms.find((r) => r.id === 'stationCatalogue')?.unlocks).toEqual(['compactBox']);
    const predicted = opt('twinBore').costCents;
    const beforeCost = sim.snapshot().projects[0].receipt.columns.yours.costCents;
    // The tunnel reform picks the twin bore itself; the compact box is what a station is once its mandate is gone.
    sim.dispatch([
      { t: 'enactReform', id: 'twinBoreStandard' },
      { t: 'enactReform', id: 'stationCatalogue' },
    ]);
    const after = sim.snapshot();
    expect(after.notices.filter((n) => n.command === 'setDesign')).toHaveLength(2);
    d = after.projects[0].design;
    expect(d).toMatchObject({ tunnel: 'twinBore', stationBox: 'compactBox' });
    expect(opt('twinBore').lockedBy).toEqual([]);
    expect(after.projects[0].segments.every((s) => s.method === 'boredTwin')).toBe(true);
    expect(after.projects[0].stations.every((s) => s.box === 'compactBox' && s.style === 'compactBox' && s.lengthM === 140)).toBe(true);
    const afterCost = after.projects[0].receipt.columns.yours.costCents;
    expect(afterCost).toBeLessThan(beforeCost * 0.6);
    // The tag on the locked twin bore priced it with its unlocking reform; the box reform then took more off.
    expect(afterCost).toBeLessThan(predicted);
    // California options stay on the menu after the reform and still cost more.
    expect(opt('mezzanineBox').deltaCents).toBeGreaterThan(0);
    expect(opt('minedCavern').deltaCents).toBeGreaterThan(0);
    sim.dispatch([{ t: 'setDesign', projectId: TEST_PROJECT, stationBox: 'mezzanineBox' }]);
    expect(sim.snapshot().projects[0].stations[0]).toMatchObject({ box: 'mezzanineBox', lengthM: 200 });
    expect(sim.snapshot().projects[0].receipt.columns.yours.costCents).toBeGreaterThan(afterCost);
  });

  test('an explicit choice survives the twin-bore standard, and the design freezes at tender', () => {
    const sim = createSim(testScenario({ start: { ...testScenario().start, policies: ['twinBoreStandard'] } }), 1, null, {
      events: false,
    });
    sim.dispatch(TEST_DESIGN);
    // Nobody chose: the standard redraws the mined section as twin tubes.
    expect(sim.snapshot().projects[0].segments.map((s) => s.effectiveMethod)).toEqual([
      'boredTwin',
      'boredTwin',
      'boredTwin',
      'cutAndCover',
    ]);
    sim.dispatch([{ t: 'setDesign', projectId: TEST_PROJECT, tunnel: 'minedCavern' }]);
    expect(sim.snapshot().projects[0].design.tunnel).toBe('minedCavern');
    expect(sim.snapshot().projects[0].segments.map((s) => s.effectiveMethod)).toEqual(['mined', 'mined', 'mined', 'mined']);
    sim.dispatch([{ t: 'approveProject', projectId: TEST_PROJECT }]);
    sim.run(365 * 12, (s) => (s.state.projects[0].frozen ? false : autopilotCommands(s.state)));
    const frozen = sim.snapshot().projects[0];
    expect(frozen.design.frozen).toBe(true);
    expect(frozen.design.tunnel).toBe('minedCavern');
    sim.dispatch([{ t: 'setDesign', projectId: TEST_PROJECT, tunnel: 'twinBore' }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/went to tender; its design is frozen/);
  });
});

describe('sub-steps', () => {
  test('a day is 240 sub-steps: stepping by days and by sub-steps gives the same state', () => {
    const byDay = createSim(testScenario(), 9);
    const bySub = createSim(testScenario(), 9);
    byDay.dispatch(TEST_DESIGN);
    bySub.dispatch(TEST_DESIGN);
    for (let day = 0; day < 400; day++) {
      const cmds = autopilotCommands(byDay.state);
      byDay.step(cmds);
      bySub.substep(autopilotCommands(bySub.state));
      for (let i = 1; i < SUBSTEPS_PER_DAY; i++) bySub.substep();
    }
    expect(bySub.state.tick).toBe(400);
    expect(bySub.hash()).toBe(byDay.hash());
    // In between, the calendar does not move and the clock reports the sub-step.
    bySub.substep();
    expect(bySub.snapshot()).toMatchObject({ tick: 400, clock: { subTick: 1 } });
    expect(bySub.hash()).not.toBe(byDay.hash());
  });

  test('with a driven heading, step() is 240 sub-steps, and the same commands at the same sub-steps replay to the same hash', () => {
    const script = (sim: GameSim, bySubstep: boolean) => {
      sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false }]);
      for (let day = 0; day < 30; day++) {
        const cmds: GameCommand[] = day === 10 ? [{ t: 'tbmControl', headingId: HEADING, steer: 0.5, thrust: 0.75 }] : [];
        if (bySubstep) {
          sim.substep(cmds);
          for (let i = 1; i < SUBSTEPS_PER_DAY; i++) sim.substep();
        } else sim.step(cmds);
      }
    };
    const a = launched();
    const b = launched();
    script(a, false);
    script(b, true);
    expect(a.state.tick).toBe(b.state.tick);
    expect(a.hash()).toBe(b.hash());
    expect(a.state.projects[0].fronts[0].drive?.steer).toBe(0.5);
    // The same command half a day later is a different game.
    const c = launched();
    c.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false }]);
    for (let i = 0; i < 30 * SUBSTEPS_PER_DAY; i++)
      c.substep(i === 10 * SUBSTEPS_PER_DAY + 120 ? [{ t: 'tbmControl', headingId: HEADING, steer: 0.5, thrust: 0.75 }] : []);
    expect(c.hash()).not.toBe(a.hash());
  });
});

describe('driving a TBM', () => {
  test('tbmControl is validated: unknown heading, wrong phase, out-of-range values, undrivable headings', () => {
    const draft = createSim(driveScenario(), 1);
    draft.dispatch([...DRIVE_DESIGN, { t: 'tbmControl', headingId: HEADING, autopilot: false }]);
    expect(draft.snapshot().notices.at(-1)?.reason).toMatch(/no heading/);
    const sim = launched();
    const reason = () => sim.snapshot().notices.at(-1)?.reason;
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, thrust: 0.5 }]);
    expect(reason()).toMatch(/is on autopilot; send autopilot false to take the controls/);
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false, thrust: 1.5 }]);
    expect(reason()).toMatch(/thrust 1.5 is outside 0 to 1/);
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false, steer: -2 }]);
    expect(reason()).toMatch(/steer -2 is outside -1 to 1/);
    expect(tbm(sim).driven).toBe(false);
    // Autopilot on an undriven heading is a no-op, not an error.
    const notices = sim.snapshot().notices.length;
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: true }]);
    expect(sim.snapshot().notices).toHaveLength(notices);
    expect(tbm(sim)).toMatchObject({ driven: false, autopilot: true, limits: { minRadiusM: 150, maxGradePct: 3 } });
  });

  test('taking control keeps the machine where it was; thrust sets the rate and zero thrust holds it', () => {
    const sim = launched();
    const before = tbm(sim);
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false }]);
    const taken = tbm(sim);
    expect(taken).toMatchObject({ driven: true, autopilot: false, thrust: 1, steer: 0, status: 'running', stopReason: null });
    expect(taken.position).toEqual(before.position);
    expect(taken.yaw).toBeCloseTo(before.yaw, 9);
    // Start-up stretch in soft ground: 30 m/day peak x 0.35 utilisation x 0.4.
    const full = 30 * 0.35 * 0.4;
    // The start-up is slow in game days, not on screen: the clock runs faster so the face still moves 8 m a second.
    expect(sim.snapshot().clock).toMatchObject({ mode: 'drive', daysPerSecond: CONSTANTS.driveFaceMetresPerSecond.value / full });
    expect(taken.maxRateMPerDay).toBeCloseTo(full, 9);
    substeps(sim, SUBSTEPS_PER_DAY);
    expect(tbm(sim).boredM - before.boredM).toBeCloseTo(full, 6);
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, thrust: 0.25 }]);
    const quarter = tbm(sim).boredM;
    expect(tbm(sim).rateMPerDay).toBeCloseTo(full / 4, 9);
    substeps(sim, SUBSTEPS_PER_DAY);
    expect(tbm(sim).boredM - quarter).toBeCloseTo(full / 4, 6);
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, thrust: 0 }]);
    const held = tbm(sim).boredM;
    substeps(sim, 3 * SUBSTEPS_PER_DAY);
    expect(tbm(sim)).toMatchObject({ boredM: held, status: 'stopped', stopReason: 'zeroThrust', rateMPerDay: 0, thrust: 0 });
    expect(sim.snapshot().projects[0].nextAction).toMatchObject({ kind: 'drive', focus: 'drive' });
    expect(sim.snapshot().projects[0].nextAction.hint).toMatch(/is holding. W for thrust, or Space for autopilot/);
  });

  test('full steer turns at the minimum radius, right lowers the yaw; pitch is clamped at the grade limit', () => {
    const sim = launched();
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false, steer: 1 }]);
    const start = tbm(sim);
    let bored = 0;
    while (bored < 40) {
      sim.substep();
      bored = tbm(sim).boredM - start.boredM;
    }
    const right = tbm(sim);
    // 40 m on a 150 m radius is 40 / 150 rad to the right.
    expect(start.yaw - right.yaw).toBeCloseTo(bored / 150, 3);
    expect(right.deviation.lateralM).toBeGreaterThan(0);
    expect(right.deviation.lateralM).toBeCloseTo(150 * (1 - Math.cos(bored / 150)), 1);
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, steer: -1, pitch: 1 }]);
    const mid = tbm(sim);
    while (tbm(sim).boredM - mid.boredM < 60) sim.substep();
    const left = tbm(sim);
    expect(left.yaw - mid.yaw).toBeCloseTo((left.boredM - mid.boredM) / 150, 3);
    // The plan descends at 0.4 percent here; 60 m of full pitch would add 6 percent, the limit stops it at 3.
    expect(left.gradePct).toBeCloseTo(3, 9);
    expect(left.pitch).toBeCloseTo(Math.atan(0.03), 9);
    expect(left.deviation.verticalM).toBeGreaterThan(0.5);
    expect(left).toMatchObject({ steer: -1, pitchInput: 1 });
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, pitch: -1 }]);
    const top = tbm(sim);
    while (tbm(sim).boredM - top.boredM < 80) sim.substep();
    expect(tbm(sim).gradePct).toBeCloseTo(-3, 9);
  });

  test('the corridor holds a machine that strays, re-steers it, and the drive still reaches the box: no dead end', () => {
    const sim = launched(5);
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false, steer: 1 }]);
    let maxDeviation = 0;
    let blockedAt = -1;
    let boredWhenBlocked = 0;
    const banners: string[] = [];
    let seen = 0;
    // The player holds full right rudder for 60 game days and never lets go.
    substeps(sim, 60 * SUBSTEPS_PER_DAY, (i) => {
      const d = sim.state.projects[0].fronts[0].drive;
      if (!d) return;
      for (const f of sim.state.feed) {
        if (f.seq <= seen) continue;
        seen = f.seq;
        if (f.kind === 'tbmStopped' && /edge of its corridor/.test(f.text)) banners.push('corridor');
        if (f.kind === 'tbmOffPlan') banners.push('offPlan');
      }
      maxDeviation = Math.max(maxDeviation, Math.hypot(d.lateralM, d.verticalM));
      if (d.blocked && blockedAt < 0) {
        blockedAt = i;
        boredWhenBlocked = sim.state.projects[0].fronts[0].boredM;
      }
    });
    const limit = CONSTANTS.driveCorridorM.value;
    expect(blockedAt).toBeGreaterThan(0);
    expect(maxDeviation).toBeLessThanOrEqual(limit + 0.05);
    expect(maxDeviation).toBeGreaterThan(limit - 1);
    expect(banners).toContain('corridor');
    expect(banners).toContain('offPlan');
    // A machine grinding along the edge repeats each banner at most once a month, not every time it touches.
    expect(banners.length).toBeLessThanOrEqual(2 * (60 / 30 + 1));
    // Even so, the shield re-steered and the machine kept boring along the edge of the corridor.
    expect(sim.state.projects[0].fronts[0].boredM).toBeGreaterThan(boredWhenBlocked + 100);
    expect(tbm(sim).status).not.toBe('done');
    // Space: the cruise law brings it back to the plan and through to the reception box.
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: true }]);
    let returned = false;
    for (let i = 0; i < 400 * SUBSTEPS_PER_DAY && tbm(sim).status !== 'done'; i++) {
      sim.substep();
      if (i % 2400 === 0 && tbm(sim).deviation.totalM < 1) returned = true;
    }
    const done = tbm(sim);
    expect(returned).toBe(true);
    expect(done).toMatchObject({ status: 'done', progress: 1, stopReason: null });
    expect(done.breakthroughTick).toBeGreaterThan(0);
    expect(done.position.x).toBeCloseTo(B.x, 6);
    expect(done.position.z).toBeCloseTo(B.z, 6);
    expect(done.boredM).toBeGreaterThan(sim.state.projects[0].cum[2]);
    const breakthroughs = sim.snapshot().feed.filter((f) => f.kind === 'breakthrough');
    expect(breakthroughs).toHaveLength(1);
    expect(breakthroughs[0]).toMatchObject({ subjectId: HEADING, projectId: TEST_PROJECT });
    expect(breakthroughs[0].text).toMatch(/^Breakthrough at B: TBM /);
    // A finished heading takes no more orders.
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false }]);
    expect(sim.snapshot().notices.at(-1)?.reason).toMatch(/has already broken through/);
  });

  test('the cruise law follows the plan through the bend inside the free tolerance, at no surcharge', () => {
    const sim = launched(6);
    // Take the controls and hand them straight back: a driven heading under the cruise law.
    sim.dispatch([
      { t: 'tbmControl', headingId: HEADING, autopilot: false },
      { t: 'tbmControl', headingId: HEADING, autopilot: true },
    ]);
    expect(tbm(sim)).toMatchObject({ driven: true, autopilot: true, steer: 0, pitchInput: 0 });
    let worst = 0;
    let worstOver = Number.NEGATIVE_INFINITY;
    const p = sim.state.projects[0];
    for (let i = 0; i < 400 * SUBSTEPS_PER_DAY && p.fronts[0].chainageM < p.fronts[0].toM; i++) {
      sim.substep();
      const d = p.fronts[0].drive;
      if (!d) continue;
      const dev = Math.hypot(d.lateralM, d.verticalM);
      worst = Math.max(worst, dev);
      worstOver = Math.max(worstOver, dev - freeDeviationM(p.waypoints, p.cum, d.planM, 150));
    }
    expect(tbm(sim).status).toBe('done');
    // It cuts the 20 degree corner by a few metres, which the tolerance allows there, and is on the line elsewhere.
    expect(worst).toBeLessThan(6);
    expect(worstOver).toBeLessThan(0);
    expect(p.offPlanCents).toBe(0);
    expect(sim.snapshot().feed.some((f) => f.kind === 'tbmOffPlan')).toBe(false);
    // As-built length is the plan length within three metres: the curve through the bend is a little shorter than the corner.
    expect(Math.abs(p.fronts[0].boredM - p.cum[2])).toBeLessThan(3);
  });

  test('metres bored off plan cost 25 percent more at the edge of the tolerance, more further out, and show on the receipt', () => {
    const onPlan = launched(7);
    const offPlan = launched(7);
    for (const sim of [onPlan, offPlan]) sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false }]);
    // Ten metres to the right of the plan, then parallel to it: steer out, steer back, straighten.
    const civil = (sim: GameSim) => sim.state.projects[0].spent.civil;
    substeps(offPlan, 1, () => offPlan.dispatch([{ t: 'tbmControl', headingId: HEADING, steer: 1 }]));
    while ((offPlan.state.projects[0].fronts[0].drive?.lateralM ?? 0) < 5) offPlan.substep();
    offPlan.dispatch([{ t: 'tbmControl', headingId: HEADING, steer: -1 }]);
    const p = offPlan.state.projects[0];
    const heading = () => Math.atan2(p.fronts[0].drive?.dirX ?? 0, p.fronts[0].drive?.dirZ ?? 1);
    const planYaw = Math.atan2(1, 0);
    while (heading() < planYaw) offPlan.substep();
    offPlan.dispatch([{ t: 'tbmControl', headingId: HEADING, steer: 0 }]);
    const lateral = offPlan.state.projects[0].fronts[0].drive?.lateralM ?? 0;
    expect(lateral).toBeGreaterThan(8);
    expect(lateral).toBeLessThan(14);
    // Both machines now bore the same 150 m of the straight, one on the line, one beside it.
    const run = (sim: GameSim) => {
      const from = sim.state.projects[0].fronts[0].boredM;
      const spentFrom = civil(sim);
      while (sim.state.projects[0].fronts[0].boredM - from < 150 || sim.state.subTick !== 0) sim.substep();
      return (civil(sim) - spentFrom) / (sim.state.projects[0].fronts[0].boredM - from);
    };
    while (onPlan.state.projects[0].fronts[0].boredM < offPlan.state.projects[0].fronts[0].boredM || onPlan.state.subTick !== 0)
      onPlan.substep();
    while (offPlan.state.subTick !== 0) offPlan.substep();
    const perMOn = run(onPlan);
    const perMOff = run(offPlan);
    // Same ground, same prices: the ratio is the surcharge, within the escalation of a few weeks. It is 25 percent
    // at the 3 m tolerance and 5 points more per metre beyond it (the second playtest drove 30 m off for 3 percent).
    const expected = offPlanFactor({ lateralM: lateral, verticalM: 0 }, 3);
    expect(expected).toBeGreaterThan(1.5);
    expect(perMOff / perMOn).toBeGreaterThan(expected - 0.04);
    expect(perMOff / perMOn).toBeLessThan(expected + 0.04);
    expect(offPlanFactor({ lateralM: 3, verticalM: 0 }, 3)).toBeCloseTo(1.25, 9);
    expect(offPlanFactor({ lateralM: 30, verticalM: 0 }, 3)).toBeCloseTo(2.6, 9);
    expect(tbm(offPlan).deviation).toMatchObject({ offPlan: true, limitM: 30 });
    expect(offPlan.state.projects[0].offPlanCents).toBeGreaterThan(0);
    expect(onPlan.state.projects[0].offPlanCents).toBe(0);
    const line = offPlan.snapshot().projects[0].receipt.lines.find((l) => l.id === 'offPlan');
    expect(line?.cents.yours).toBeGreaterThan(0);
    expect(line?.status).toBe('paid');
    expect(onPlan.snapshot().projects[0].receipt.lines.find((l) => l.id === 'offPlan')?.status).toBe('removed');
  });

  test('a driven heading is priced and paced on the ground of the plan, whatever the voxels at the face are', () => {
    expect(geologyOfMaterial(Material.BAY_MUD)).toBe('bayMud');
    expect(geologyOfMaterial(Material.FILL)).toBe('bayMud');
    expect(geologyOfMaterial(Material.ROCK)).toBe('rock');
    expect(geologyOfMaterial(Material.ALLUVIUM)).toBe('softGround');
    expect(geologyOfMaterial(Material.BUILDING_TOWER)).toBe('mixedFace');
    expect(() => geologyOfMaterial(Material.AIR)).toThrow(/AIR\) is not ground/);
    expect(() => geologyOfMaterial(Material.WATER)).toThrow(/WATER\) is not ground/);
    expect(() => geologyOfMaterial(999)).toThrow(/unknown material id 999/);
    expect(faceGeology(() => Material.ROCK, 0, 0, 0, 3)).toBe('rock');
    expect(faceGeology((_x, y) => (y > 0 ? Material.SAND : Material.ROCK), 0, 0, 0, 3)).toBe('mixedFace');
    expect(faceGeology(() => Material.AIR, 0, 0, 0, 3)).toBeNull();

    // The voxels say rock east of x = A.x + 200; the plan (the ground investigation the estimate was priced on)
    // says soft ground all the way. The second playtest took the controls of a heading whose voxels were rock and
    // paid $478M less than the autopilot did for the same project.
    const ground = (x: number) => (x < A.x + 20 ? Material.AIR : x < A.x + 200 ? Material.ALLUVIUM : Material.ROCK);
    const sim = launched(8, null, { events: false, ground });
    const auto = launched(8, null, { events: false, ground });
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false }]);
    const sq = profileFor(['twinBoreStandard']);
    const seen = new Set<string>();
    while (tbm(sim).boredM < 400 || sim.state.subTick !== 0) {
      sim.substep();
      const t = tbm(sim);
      seen.add(t.geology);
      if (t.boredM > 210 && t.stopReason === null) {
        expect(t.geologyLabel).toBe('Soft clay, sand, alluvium');
        expect(t.maxRateMPerDay).toBeCloseTo(advanceRate('boredTwin', 'softGround', sq, 1000), 9);
      }
    }
    expect([...seen]).toEqual(['softGround']);
    // Hands on the levers at full thrust on the plan, or the autopilot: the same metres cost the same.
    while (auto.state.projects[0].fronts[0].boredM < sim.state.projects[0].fronts[0].boredM) auto.step();
    const perM = (s: GameSim) => s.state.projects[0].spent.civil / s.state.projects[0].fronts[0].boredM;
    expect(sim.state.projects[0].offPlanCents).toBe(0);
    expect(perM(sim) / perM(auto)).toBeGreaterThan(0.98);
    expect(perM(sim) / perM(auto)).toBeLessThan(1.02);
    // Good ground lets a machine bore more of the day, never more than 0.9 of its peak: 27 m/day (PLAN 6.7).
    expect(advanceRate('boredTwin', 'rock', sq, 1000) / advanceRate('boredTwin', 'softGround', sq, 1000)).toBeCloseTo(1.5, 9);
    const fast = profileFor(['twinBoreStandard', 'rightMachine', 'prufrockClass']);
    expect(advanceRate('boredTwin', 'softGround', fast, 1000)).toBeCloseTo(27, 9);
    expect(advanceRate('boredTwin', 'rock', fast, 1000)).toBeCloseTo(27, 9);
  });

  test('a driven tunnel is carved live in a gap-free chain, tube by tube, and replays after a load', () => {
    const edits: WorldEdit[] = [];
    const sim = launched(9, { applyEdit: (e) => edits.push(e) });
    const planned = edits.length;
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: false, steer: 0.3 }]);
    substeps(sim, 20 * SUBSTEPS_PER_DAY);
    sim.dispatch([{ t: 'tbmControl', headingId: HEADING, autopilot: true }]);
    substeps(sim, 20 * SUBSTEPS_PER_DAY + 77);
    const front = sim.state.projects[0].fronts[0];
    const driven = edits.slice(planned).filter((e) => e.t === 'carveCapsule' && e.radius === 3.3);
    expect(driven.length).toBeGreaterThan(100);
    // Two tubes: each capsule starts on the voxel where the previous capsule of its tube ended, and is about a metre long.
    const key = (v: { x: number; y: number; z: number }) => `${v.x},${v.y},${v.z}`;
    const ends = new Set<string>();
    let linked = 0;
    for (const e of driven) {
      if (e.t !== 'carveCapsule') continue;
      expect(Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z)).toBeLessThan(4);
      if (ends.has(key(e.a))) linked++;
      ends.add(key(e.b));
    }
    expect(linked).toBeGreaterThanOrEqual(driven.length - 2);
    // The tunnel entity carries the same axis: append-only points, lining behind the shield, works track behind that.
    const tunnel = sim.snapshot().projects[0].tunnels[0];
    expect(tunnel).toMatchObject({ id: `${HEADING}/tunnel`, lining: 'ring', radiusM: 3.3, laterals: [-5.5, 5.5], ringSpacingM: 1.5 });
    expect(tunnel.path.length).toBeGreaterThan(front.boredM / 5 - 2);
    expect(tunnel.linedM).toBeGreaterThan(0);
    expect(tunnel.linedM).toBeLessThan(front.boredM - 10);
    expect(tunnel.trackM).toBeLessThan(tunnel.linedM);
    const samePath = sim.snapshot().projects[0].tunnels[0].path;
    expect(samePath).toBe(tunnel.path);
    const points = tunnel.path.length;
    substeps(sim, 5 * SUBSTEPS_PER_DAY);
    const later = sim.snapshot().projects[0].tunnels[0];
    expect(later.path).toBe(tunnel.path);
    expect(later.path.length).toBeGreaterThan(points);
    expect(later.rev).toBe(tunnel.rev);

    // Load in the middle of a day: the same state, and the carves of the driven heading come back.
    const replay: WorldEdit[] = [];
    const save = JSON.parse(JSON.stringify(sim.save())) as SaveFile;
    const loaded = loadSim(save, { applyEdit: (e) => replay.push(e) });
    expect(loaded.hash()).toBe(sim.hash());
    expect(loaded.state.subTick).toBe(sim.state.subTick);
    expect(loaded.state.subTick).not.toBe(0);
    expect(replay.filter((e) => e.t === 'carveCapsule' && e.radius === 3.3).length).toBeGreaterThan(40);
    expect(loaded.snapshot().projects[0].tunnels[0].rev).not.toBe(tunnel.rev);
    substeps(sim, 3000);
    substeps(loaded, 3000);
    expect(loaded.hash()).toBe(sim.hash());
  });
});

describe('gates, events and the clock', () => {
  test('nothing moves while the player draws; approvals run as a time-lapse of at most ten seconds a phase; gates and cards hold the clock', () => {
    const sim = createSim(testScenario(), 1, null, { events: true });
    expect(sim.snapshot().clock).toEqual({ mode: 'idle', daysPerSecond: 0, subTick: 0, hold: null });
    sim.dispatch(TEST_DESIGN);
    expect(sim.snapshot().clock).toMatchObject({ mode: 'idle', daysPerSecond: 0, hold: null });
    expect(sim.snapshot().nextAction).toMatchObject({ kind: 'approveProject', command: { t: 'approveProject', projectId: TEST_PROJECT } });
    sim.dispatch([{ t: 'approveProject', projectId: TEST_PROJECT }]);
    const target = CONSTANTS.lapseTargetSeconds.value;
    let sawGate = 0;
    let sawEvent = 0;
    for (let day = 0; day < 365 * 40 && sim.state.projects[0].status !== 'open'; day++) {
      const s = sim.snapshot();
      const p = s.projects[0];
      if (s.events.length > 0) {
        expect(s.clock.hold).toBe('event');
        expect(s.nextAction).toMatchObject({ kind: 'resolveEvent', focus: 'event', command: null });
        sawEvent++;
        sim.dispatch([{ t: 'resolveEvent', eventId: s.events[0].uid, optionId: s.events[0].options[0].id }]);
        continue;
      }
      if (p.awaiting) {
        expect(s.clock.hold).toBe('gate');
        expect(s.nextAction.command).toEqual({ t: p.awaiting, projectId: TEST_PROJECT });
        expect(p.phases.find((ph) => ph.gate?.ready)?.gate?.command).toBe(p.awaiting);
        sawGate++;
        sim.dispatch([{ t: p.awaiting, projectId: TEST_PROJECT }]);
        continue;
      }
      expect(s.clock.hold).toBeNull();
      if (p.phase !== 'construction') {
        const current = p.phases.find((ph) => ph.state === 'current');
        expect(s.clock.mode).toBe('lapse');
        // The whole phase at this pace takes at most the target.
        expect((current?.plannedDays ?? 0) / s.clock.daysPerSecond).toBeLessThanOrEqual(target + 0.01);
        expect(s.nextAction.kind).toBe('wait');
      } else expect(['build', 'lapse']).toContain(s.clock.mode);
      sim.step();
    }
    expect(sim.state.projects[0].status).toBe('open');
    expect(sawGate).toBe(3);
    expect(sawEvent).toBeGreaterThan(0);
    const kinds = sim.state.eventLog.map((e) => e.defId);
    expect(sim.state.eventLog.every((e) => !e.byDefault)).toBe(true);
    expect(kinds.length).toBe(sawEvent);
    // Open and nothing else in hand: the calendar ticks on slowly.
    expect(sim.snapshot().clock).toMatchObject({ mode: 'idle', daysPerSecond: 2, hold: null });
    expect(sim.snapshot().nextAction).toMatchObject({ kind: 'viewScorecard', focus: 'receipt' });
  });

  test('the feed records what happened once each, with rising seq, and survives a restart without reusing one', () => {
    const sim = createSim(testScenario(), 2, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    const all: GameSnapshot['feed'] = [];
    let seen = 0;
    const collect = () => {
      for (const f of sim.snapshot().feed) {
        if (f.seq > seen) {
          all.push(f);
          seen = f.seq;
        }
      }
    };
    sim.run(365 * 40, (s) => {
      collect();
      return s.state.projects[0].status === 'open' && s.state.missionCompleteTick >= 0 ? false : autopilotCommands(s.state);
    });
    collect();
    expect(sim.snapshot().feed.length).toBeLessThanOrEqual(32);
    for (let i = 1; i < all.length; i++) expect(all[i].seq).toBe(all[i - 1].seq + 1);
    const count = (kind: string) => all.filter((f) => f.kind === kind).length;
    expect(count('projectApproved')).toBe(1);
    expect(count('phaseDone')).toBe(6);
    expect(count('gateReady')).toBe(3);
    expect(count('fundingReleased')).toBe(1);
    // One TBM and one mined heading are machines; the cut-and-cover front is not.
    expect(count('tbmLaunched')).toBe(2);
    expect(count('breakthrough')).toBe(2);
    expect(count('stationDone')).toBe(2);
    expect(count('lineOpened')).toBe(1);
    expect(count('missionComplete')).toBe(1);
    expect(all.find((f) => f.kind === 'objectiveDone')?.text).toBe('Objective met: Connect A and B');
    expect(sim.snapshot().mission).toMatchObject({ complete: true, stage: 'done', projectId: TEST_PROJECT });
    expect(sim.snapshot().mission.result?.stars).toBe(sim.snapshot().projects[0].scorecard.stars);
    const last = seen;
    sim.dispatch([{ t: 'startScenario' }, ...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    const restarted = sim.snapshot();
    expect(restarted.tick).toBe(0);
    expect(restarted.mission).toMatchObject({ complete: false, result: null });
    expect(restarted.feed).toHaveLength(1);
    expect(restarted.feed[0]).toMatchObject({ kind: 'projectApproved', seq: last + 1 });
  });
});

describe('estimate while drawing', () => {
  test('estimateAlignment prices a line that does not exist yet, agrees with the forecast, and changes no state', () => {
    const sim = createSim(testScenario(), 1);
    const before = sim.hash();
    const methods = ['boredTwin', 'boredTwin', 'mined', 'cutAndCover'] as const;
    const waypoints = (TEST_DESIGN[0] as Extract<GameCommand, { t: 'setAlignment' }>).waypoints;
    const fresh = sim.estimateAlignment({ projectId: TEST_PROJECT, waypoints, methods: [...methods] });
    expect(sim.hash()).toBe(before);
    expect(fresh.checks.ok).toBe(true);
    expect(fresh.lengthKm).toBeCloseTo(1.066, 2);
    expect(fresh.ratioToPoland).toBeCloseTo(fresh.costCents / fresh.polandCostCents, 9);
    expect(fresh.costPerKmCents).toBe(Math.round(fresh.costCents / fresh.lengthKm));
    expect(fresh.openDate > '2035-01-01').toBe(true);
    // No stations yet: with the two of the design the estimate rises by their price.
    sim.dispatch(TEST_DESIGN);
    const drawn = sim.estimateAlignment({ projectId: TEST_PROJECT, waypoints });
    expect(drawn.costCents).toBeGreaterThan(fresh.costCents * 1.2);
    // Closed form against the day-by-day forecast of the same project: within 5 percent in cost, a month in time.
    const view = sim.snapshot().projects[0];
    expect(Math.abs(drawn.costCents / view.receipt.columns.yours.costCents - 1)).toBeLessThan(0.05);
    expect(Math.abs(drawn.polandCostCents / view.receipt.columns.poland.costCents - 1)).toBeLessThan(0.05);
    expect(Math.abs(drawn.daysToOpen - view.receipt.columns.yours.yearsToOpen * 365)).toBeLessThan(45);
    // Options: the tunnel and box of the request override the project's.
    const twin = sim.estimateAlignment({ projectId: TEST_PROJECT, waypoints, tunnel: 'twinBore' });
    const large = sim.estimateAlignment({ projectId: TEST_PROJECT, waypoints, tunnel: 'singleLargeBore' });
    expect(twin.costCents).toBeLessThan(large.costCents);
    const compact = sim.estimateAlignment({ projectId: TEST_PROJECT, waypoints, stationBox: 'compactBox' });
    expect(compact.costCents).toBeLessThan(drawn.costCents);
    // A longer line costs more; a kinked one reports its problem and is still priced.
    const longer = sim.estimateAlignment({ waypoints: [...waypoints, { x: waypoints[4].x + 400, y: -20, z: waypoints[4].z - 400 }] });
    expect(longer.costCents).toBeGreaterThan(fresh.costCents);
    const kinked = sim.estimateAlignment({
      waypoints: [waypoints[0], waypoints[1], { x: waypoints[1].x, y: -22, z: waypoints[1].z - 250 }],
    });
    expect(kinked.checks.ok).toBe(false);
    expect(kinked.costCents).toBeGreaterThan(0);
  });

  test('bad requests throw naming the input, and 64 waypoints are priced well inside the 2 ms budget', () => {
    const sim = createSim(testScenario(), 1);
    expect(() => sim.estimateAlignment({ waypoints: [{ x: 1, y: 2, z: 3 }] })).toThrow(/needs 2 to 512 waypoints, got 1/);
    expect(() =>
      sim.estimateAlignment({
        waypoints: [
          { x: 1, y: 2, z: 3 },
          { x: Number.NaN, y: 0, z: 0 },
        ],
      }),
    ).toThrow(/waypoints\[1\] must have finite x, y and z/);
    expect(() => sim.estimateAlignment({ waypoints: DRIVE_LINE, methods: ['boredTwin'] })).toThrow(/1 methods for 2 segments/);
    const many: Waypoint[] = [];
    for (let i = 0; i < 64; i++) many.push({ x: A.x + i * 120, y: -20 - (i % 3), z: A.z - (i % 5) * 4 });
    sim.estimateAlignment({ waypoints: many });
    const t0 = Date.now();
    const n = 200;
    for (let i = 0; i < n; i++) sim.estimateAlignment({ waypoints: many });
    expect((Date.now() - t0) / n).toBeLessThan(2);
  });

  test('every reform that is not enacted shows what it would do to the mission project before it is bought', () => {
    const sim = createSim(testScenario(), 1);
    expect(sim.snapshot().reforms.every((r) => r.preview === null)).toBe(true);
    sim.dispatch(TEST_DESIGN);
    const s = sim.snapshot();
    const by = (id: string) => {
      const r = s.reforms.find((x) => x.id === id);
      if (!r?.preview) throw new Error(`no preview for ${id}`);
      return r;
    };
    // Every reform has a preview with a cost and a days figure: the Reforms sheet sorts on the cost saved.
    for (const r of s.reforms) {
      expect(r.preview, r.id).not.toBeNull();
      expect(Number.isFinite(r.preview?.costDeltaCents), r.id).toBe(true);
      expect(Number.isFinite(r.preview?.daysDelta), r.id).toBe(true);
    }
    expect(by('twinBoreStandard').preview?.costDeltaCents).toBeLessThan(0);
    expect(by('twinBoreStandard').receiptLines).toEqual(['designTunnel', 'designStations', 'designSystems']);
    expect(by('railSpecustawa').preview?.daysDelta).toBeLessThan(-300);
    expect(by('railSpecustawa').receiptLines).toEqual(['escalation', 'overhead', 'events']);
    expect(by('roundTheClock').receiptLines).toEqual(['staffing', 'escalation', 'overhead']);
    // No reform touches the price level.
    expect(s.reforms.some((r) => r.receiptLines.includes('priceLevel'))).toBe(false);
    expect(by('bestValueAward').receiptLines).toEqual(['procurement', 'systemsSupply', 'contingency', 'escalation', 'overhead', 'events']);
    expect(by('stationCatalogue').preview).toMatchObject({ projectId: TEST_PROJECT });
    const before = s.projects[0].receipt.columns.yours.costCents;
    const predicted = by('inHouseEngineering').preview?.costDeltaCents ?? 0;
    expect(by('inHouseEngineering').preview?.ratioToPolandAfter).toBeLessThan(s.projects[0].receipt.ratios.yoursToPoland);
    sim.dispatch([{ t: 'enactReform', id: 'inHouseEngineering' }]);
    const after = sim.snapshot();
    expect(after.reforms.find((r) => r.id === 'inHouseEngineering')?.preview).toBeNull();
    // The preview was the closed form; the forecast after buying agrees within 10 percent of the change.
    const actual = after.projects[0].receipt.columns.yours.costCents - before;
    expect(actual).toBeLessThan(0);
    expect(Math.abs(predicted / actual - 1)).toBeLessThan(0.1);
  });
});

describe('receipt and scorecard', () => {
  test('every column adds up to the cent, the groups are the four owner factors, and the ratios come from the columns', () => {
    const sim = createSim(testScenario(), 4, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    const check = () => {
      const r = sim.snapshot().projects[0].receipt;
      expect(r.lines.map((l) => l.id)).toEqual([...RECEIPT_LINES]);
      expect(r.groups.map((g) => g.id)).toEqual([...RECEIPT_GROUPS]);
      for (const col of RECEIPT_COLUMNS) {
        const c = r.columns[col];
        let sum = c.baseCents;
        for (const l of r.lines) {
          expect(Number.isSafeInteger(l.cents[col]), `${col} ${l.id}`).toBe(true);
          sum += l.cents[col];
        }
        expect(sum, col).toBe(c.costCents);
        expect(
          r.groups.reduce((a, g) => a + g.cents[col], c.baseCents),
          col,
        ).toBe(c.costCents);
        expect(c.costPerKmCents).toBe(Math.round(c.costCents / c.lengthKm));
        // The line factors multiply base into cost.
        const product = r.lines.reduce((a, l) => a * l.factor[col], c.baseCents);
        expect(product / c.costCents).toBeCloseTo(1, 6);
      }
      expect(r.ratios.yoursToPoland).toBeCloseTo(r.columns.yours.costPerKmCents / r.columns.poland.costPerKmCents, 12);
      expect(r.ratios.statusQuoToPoland).toBeCloseTo(r.columns.statusQuo.costPerKmCents / r.columns.poland.costPerKmCents, 12);
      expect(r.ratios.yoursToStatusQuo).toBeCloseTo(r.columns.yours.costPerKmCents / r.columns.statusQuo.costPerKmCents, 12);
      return r;
    };
    const draft = check();
    expect(draft.final).toBe(false);
    expect(draft.columns.yours.kind).toBe('forecast');
    expect(draft.ghost).toBeNull();
    expect(draft.ratios.ghostToPoland).toBeNull();
    // Nothing enacted yet: your column is the status quo, and Poland pays for neither design nor levers.
    expect(draft.ratios.yoursToStatusQuo).toBeCloseTo(1, 3);
    for (const l of draft.lines) {
      // Nothing was bought with cash yet.
      if (l.id === 'reformCash') {
        expect(l.cents).toEqual({ yours: 0, statusQuo: 0, poland: 0 });
        continue;
      }
      if (l.group === 'designScope' || l.group === 'institutional' || l.group === 'priceLevel') {
        // Residue under a thousand dollars is not printed as money: a line Poland does not pay is exactly zero.
        expect(l.cents.poland, l.id).toBe(0);
        expect(l.factor.poland, l.id).toBe(1);
        expect(l.cents.yours, l.id).toBeGreaterThan(0);
        expect(l.status, l.id).toBe('paid');
        if (l.id !== 'priceLevel') expect(l.reforms.length, l.id).toBeGreaterThan(0);
      }
    }
    // The price level is its own line, applied first, and no reform is listed against it.
    const price = draft.lines.find((l) => l.id === 'priceLevel');
    expect(price?.group).toBe('priceLevel');
    expect(price?.factor.yours).toBeCloseTo(1.61, 6);
    expect(price?.factor.poland).toBe(1);
    expect(price?.reforms).toEqual([]);
    expect(price?.cents.yours).toBe(Math.round(draft.columns.yours.baseCents * 1.61) - draft.columns.yours.baseCents);
    // Same route: every column starts from the same Polish design at Polish prices.
    expect(draft.columns.yours.baseCents).toBe(draft.columns.poland.baseCents);
    expect(draft.columns.statusQuo.baseCents).toBe(draft.columns.poland.baseCents);
    expect(draft.lines.find((l) => l.id === 'procurement')?.factor.yours).toBeCloseTo(1.5, 6);
    expect(draft.lines.find((l) => l.id === 'escalation')?.cents.poland).toBeGreaterThan(0);

    // A reform enacted half way through construction only shrinks its line for the money spent after it.
    sim.dispatch([{ t: 'approveProject', projectId: TEST_PROJECT }]);
    sim.run(365 * 30, (s) =>
      s.state.projects[0].phase === 'construction' && s.state.projects[0].phaseProgress > 0.5 ? false : autopilotCommands(s.state),
    );
    const mid = check();
    const contingencyBefore = mid.lines.find((l) => l.id === 'contingency');
    sim.dispatch([{ t: 'enactReform', id: 'inHouseEngineering' }]);
    const reformed = check();
    const contingency = reformed.lines.find((l) => l.id === 'contingency');
    expect(contingency?.status).toBe('reduced');
    expect(contingency?.reforms.find((r) => r.id === 'inHouseEngineering')?.enacted).toBe(true);
    expect(contingency?.cents.yours).toBeLessThan(contingencyBefore?.cents.yours ?? 0);
    // Spend-weighted: between the old factor and the new one.
    expect(contingency?.factor.yours).toBeLessThan(1.35);
    expect(contingency?.factor.yours).toBeGreaterThan(1.175);
    // The contracts were let at tender: the contract reform bought now does not change the procurement price of
    // this project, the preview said so before it was bought, and the receipt does not call the line reduced.
    const procurementBefore = reformed.lines.find((l) => l.id === 'procurement');
    const offer = sim.snapshot().reforms.find((r) => r.id === 'bestValueAward')?.preview;
    expect(offer?.notes?.[0]).toMatch(/contracts of .* were let at tender/);
    sim.dispatch([{ t: 'enactReform', id: 'bestValueAward' }]);
    const late = check();
    const procurement = late.lines.find((l) => l.id === 'procurement');
    // To the dollar: the line is rounded from running totals that the reform's other effects move by cents.
    expect(Math.abs((procurement?.cents.yours ?? 0) - (procurementBefore?.cents.yours ?? 0))).toBeLessThan(100_000);
    expect(procurement?.factor.yours).toBeCloseTo(1.5, 6);
    expect(procurement?.status).toBe('paid');
    expect(procurement?.reforms.find((r) => r.id === 'bestValueAward')?.enacted).toBe(true);
    // What that reform does outside the contract (the contingency, the systems supply) still applies to the money not yet spent.
    expect(late.columns.yours.costCents).toBeLessThan(reformed.columns.yours.costCents);
    sim.run(365 * 30, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
    const final = check();
    expect(final.final).toBe(true);
    expect(final.columns.yours.kind).toBe('actual');
    expect(final.columns.yours.costCents).toBe(sim.snapshot().projects[0].spentCents);
    const card = sim.snapshot().projects[0].scorecard;
    expect(card.final).toBe(true);
    expect(card.yours.costCents).toBe(final.columns.yours.costCents);
    expect(card.ghost.kind).toBe('model');
    expect(card.ghost.source).toMatch(/No official figure exists/);
    expect(card.poland.costCents).toBe(final.columns.poland.costCents);
    expect(card.axes).toBeUndefined();
    if (!card.polandTarget) throw new Error('no polandTarget on the scorecard');
    expect(card.stars).toBe(starsOf(true, card.polandTarget));
    expect(card.stars).toBeGreaterThanOrEqual(1);
    expect(card.verdict).toMatch(/^You paid \$\d+(\.\d+)?[BM]: \d+\.\dx Poland\.$/);
    expect(sim.snapshot().headline).toMatchObject({ projectId: TEST_PROJECT, final: true, ratio: final.ratios.yoursToPoland });
  });

  test('a project without an alignment has a receipt of zeros, not a crash', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch([{ t: 'setAlignment', projectId: 'p', waypoints: DRIVE_LINE }]);
    sim.state.projects[0].methods = [];
    sim.state.projects[0].waypoints = [];
    sim.state.projects[0].cum = [0];
    const p = sim.snapshot().projects[0];
    expect(p.receipt.lines).toHaveLength(RECEIPT_LINES.length);
    expect(p.receipt.columns.yours.costCents).toBe(0);
    expect(p.scorecard.stars).toBe(0);
    expect(sim.snapshot().headline).toBeNull();
  });
});

describe('stations, pits and trains', () => {
  test('pits appear on approval, boxes are dug early in the station build, and trains shuttle once the line is open', () => {
    const edits: WorldEdit[] = [];
    const sim = createSim(driveScenario(), 11, { applyEdit: (e) => edits.push(e) }, { events: false });
    sim.dispatch(DRIVE_DESIGN);
    expect(sim.snapshot().projects[0].pits).toEqual([]);
    expect(sim.snapshot().services).toEqual([]);
    sim.dispatch([{ t: 'approveProject', projectId: TEST_PROJECT }]);
    let pit = sim.snapshot().projects[0].pits[0];
    expect(pit).toMatchObject({ id: `${HEADING}/pit`, tbmId: HEADING, state: 'planned', lengthM: 40, widthM: 2 * (5.5 + 3.3) + 2 });
    // Behind the face, on the axis, at invert level.
    expect(pit.position.x).toBeCloseTo(A.x - 20, 1);
    expect(pit.position.y).toBeCloseTo(-20 - 3.3, 1);
    expect(pit.yaw).toBeCloseTo(Math.PI / 2, 2);
    sim.run(365 * 30, (s) => (s.state.projects[0].awaiting === 'launchTBM' ? false : autopilotCommands(s.state)));
    expect(sim.snapshot().projects[0].pits[0].state).toBe('ready');
    sim.dispatch([{ t: 'launchTBM', projectId: TEST_PROJECT }]);
    pit = sim.snapshot().projects[0].pits[0];
    expect(pit.state).toBe('launched');
    expect(sim.snapshot().projects[0].tbms[0].pitId).toBe(pit.id);

    // A box is dug out during the first tenth of its build, in 5 m slices; the reception box is open when the machine arrives.
    // The mezzanine mandate is in force: a 200 m by 26 m box, carved with a 10.4 m radius.
    const stationCapsules = () => edits.filter((e) => e.t === 'carveCapsule' && e.radius === 10.4).length;
    expect(stationCapsules()).toBe(0);
    sim.run(365 * 30, (s) => (s.state.projects[0].stations[1].progress >= 0.05 ? false : autopilotCommands(s.state)));
    const partly = sim.state.projects[0].stations[1].carvedM;
    expect(partly).toBeGreaterThanOrEqual(45);
    expect(partly).toBeLessThan(60);
    expect(partly % 5).toBe(0);
    sim.run(365 * 30, (s) => (s.state.projects[0].fronts[0].breakthroughTick >= 0 ? false : autopilotCommands(s.state)));
    // The machine is through before the box would have been finished on this short line, and the box was opened for it.
    expect(sim.state.projects[0].stations[1].progress).toBeLessThan(0.2);
    const st = sim.snapshot().projects[0].stations[1];
    expect(st).toMatchObject({
      id: 'b',
      style: 'mezzanineBox',
      box: 'mezzanineBox',
      lengthM: 200,
      widthM: 26,
      heightM: 16,
      open: false,
      fitOut: 0,
    });
    expect(sim.state.projects[0].stations[1].carvedM).toBe(100);
    expect(stationCapsules()).toBeGreaterThan(10);
    expect(st.yaw).toBeCloseTo(Math.atan2(470, -171), 6);

    sim.run(365 * 30, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
    const snap = sim.snapshot();
    expect(snap.projects[0].stations.every((s) => s.open && s.fitOut === 1 && s.progress === 1)).toBe(true);
    const tunnel = snap.projects[0].tunnels[0];
    expect(tunnel.linedM).toBeCloseTo(tunnel.trackM, 6);
    expect(snap.services).toHaveLength(1);
    const service = snap.services[0];
    const length = sim.state.projects[0].cum[2];
    expect(service).toMatchObject({
      id: `${TEST_PROJECT}/service`,
      projectId: TEST_PROJECT,
      trains: 1,
      cars: 6,
      carLengthM: 25,
      dwellS: 6,
      cruiseMps: 30,
    });
    expect(service.lengthM).toBeCloseTo(length, 3);
    expect(service.ridersPerDay).toBe(snap.ridersPerDay);
    expect(service.stops.map((s) => s.stationId)).toEqual(['a', 'b']);
    expect(service.cycleS).toBeCloseTo(serviceCycleS(length, 2, 30, 6), 6);
    expect(sim.snapshot().services[0]).toBe(service);

    // Closed form: at t = 0 the train dwells at A, half a cycle later at B, and a cycle later it is back.
    const at = (t: number) => trainsAt(service, t)[0];
    expect(at(0)).toMatchObject({ id: `${TEST_PROJECT}/service/t1`, serviceId: service.id, chainageM: 0, direction: 1, atStationId: 'a' });
    expect(at(0).position.x).toBeCloseTo(A.x, 6);
    const half = service.cycleS / 2;
    expect(at(half + 1)).toMatchObject({ direction: -1, atStationId: 'b' });
    expect(at(half + 1).chainageM).toBeCloseTo(length, 3);
    expect(at(service.cycleS + 3)).toEqual(at(3));
    expect(at(-service.cycleS + 3)).toEqual(at(3));
    // Mid-run: moving, between the stops, pointing along the track; the return trip points the other way.
    const out = at(6 + length / 30 / 2);
    expect(out.atStationId).toBeNull();
    expect(out.chainageM).toBeCloseTo(length / 2, 3);
    const back = at(half + 6 + length / 30 / 2);
    expect(back.chainageM).toBeCloseTo(length / 2, 3);
    expect(Math.cos(back.yaw - out.yaw)).toBeCloseTo(-1, 6);
    // Speed is continuous and never above 1.5 times cruise (smoothstep).
    for (let t = 0; t < service.cycleS; t += 0.25)
      expect(Math.abs(at(t + 0.25).chainageM - at(t).chainageM)).toBeLessThanOrEqual(30 * 1.5 * 0.25 + 1e-6);
    expect(() => trainsAt(service, Number.NaN)).toThrow(/clockSeconds must be finite/);
    expect(() => trainsAt({ ...service, stops: [service.stops[0]] }, 0)).toThrow(/needs two stops/);
    // More trains are spaced evenly round the cycle.
    const three = trainsAt({ ...service, trains: 3 }, 10);
    expect(three.map((t) => t.id)).toEqual([`${service.id}/t1`, `${service.id}/t2`, `${service.id}/t3`]);
    expect(three[1]).toEqual({ ...trainsAt(service, 10 + service.cycleS / 3)[0], id: `${service.id}/t2` });
  });
});

describe('saves across versions', () => {
  /** What a round 1 build would have written for this state. */
  function asVersion1(sim: GameSim): SaveFile {
    const st = JSON.parse(JSON.stringify(sim.serialize())) as SimState & Record<string, unknown>;
    st.schemaVersion = 1;
    for (const key of ['subTick', 'feed', 'nextFeedSeq', 'handDig', 'objectiveStatus', 'missionCompleteTick', 'cashShort']) delete st[key];
    for (const p of st.projects as unknown as Record<string, unknown>[]) {
      for (const key of ['tunnelChoice', 'stationBox', 'paid', 'offPlanCents', 'handDigCents', 'handDigM3']) delete p[key];
      for (const s of p.stations as Record<string, unknown>[]) delete s.carvedM;
      for (const f of p.fronts as Record<string, unknown>[])
        for (const key of ['downReason', 'boredM', 'breakthroughTick', 'drive']) delete f[key];
    }
    return { ...sim.save(), schemaVersion: 1, sim: st, stateHash: hashState(st) };
  }

  test('a version 1 save is migrated, plays on to opening, and a tampered one is still refused', () => {
    const sim = createSim(testScenario(), 12, null, { events: false });
    sim.dispatch(TEST_DESIGN);
    sim.run(365 * 30, (s) =>
      s.state.projects[0].phase === 'construction' && s.state.projects[0].phaseProgress > 0.3 ? false : autopilotCommands(s.state),
    );
    const old = asVersion1(sim);
    expect(old.schemaVersion).toBe(1);
    const edits: WorldEdit[] = [];
    const loaded = loadSim(JSON.parse(JSON.stringify(old)), { applyEdit: (e) => edits.push(e) });
    expect(loaded.state.schemaVersion).toBe(3);
    expect(loaded.state.tick).toBe(sim.state.tick);
    expect(loaded.state.cashCents).toBe(sim.state.cashCents);
    expect(loaded.state.projects[0].fronts.every((f) => f.drive === null && f.boredM === f.chainageM - f.fromM)).toBe(true);
    expect(loaded.state.projects[0].paid.steps[7]).toBeGreaterThan(0);
    expect(edits.length).toBeGreaterThan(0);
    const snap = loaded.snapshot();
    expect(snap.projects[0].receipt.columns.yours.costCents).toBeGreaterThan(0);
    loaded.run(365 * 30, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
    expect(loaded.state.projects[0].status).toBe('open');
    expect(loaded.save().schemaVersion).toBe(3);
    const tampered = JSON.parse(JSON.stringify(old)) as SaveFile;
    (tampered.sim as unknown as SimState).cashCents += 1;
    expect(() => loadSim(tampered)).toThrow(/save is corrupt: state hash/);
    expect(() => loadSim({ ...old, schemaVersion: 0 })).toThrow(/cannot load save schemaVersion 0; this build reads version 3/);
  });

  test('save options travel in the container and stay out of the hash', () => {
    const sim = createSim(testScenario(), 1);
    sim.dispatch(TEST_DESIGN);
    sim.run(5);
    const ref = { key: 'slot-1/edits', edits: 3, hash: 'abc' };
    const save = sim.save({ worldDataVersion: 'w1', editLog: ref });
    expect(save).toMatchObject({ format: 'bayvox-save', schemaVersion: 3, worldDataVersion: 'w1', editLog: ref, stateHash: sim.hash() });
    expect(sim.save('w2').worldDataVersion).toBe('w2');
    expect(sim.save().editLog).toBeUndefined();
    expect(loadSim(save).hash()).toBe(sim.hash());
  });
});
