/** Regressions from the second playtest of round 2 (2026-11-10) that need the real scenarios. */
import { autopilotCommands, createSim, type GameSim, type Waypoint } from '@bayvox/sim';
import { describe, expect, test } from 'vitest';
import { DUMBARTON_TO_META, GOOGLEPLEX_SPUR, ORACLE_SHUTTLE, PORTAL_PROJECT_ID, SANDBOX, THE_PORTAL } from './index.ts';

function official(): GameSim {
  const sim = createSim(THE_PORTAL, 1, null, { events: false });
  sim.dispatch([{ t: 'useOfficialPlan' }]);
  return sim;
}

function toGate(sim: GameSim, gate: 'advancePhase' | 'launchTBM' | 'openLine'): void {
  sim.run(365 * 40, (s) => {
    const p = s.state.projects[0];
    if (p.awaiting === gate) return false;
    return p.awaiting ? autopilotCommands(s.state) : [];
  });
  expect(sim.state.projects[0].awaiting).toBe(gate);
}

describe('The Portal briefing says what the game shows', () => {
  test('the Polish figure of the briefing is the Polish figure of the headline, and no superlative the research contradicts', () => {
    const why = THE_PORTAL.briefing?.why ?? '';
    // Doc 06 section 3.2: East Side Access in New York is dearer per km. The briefing no longer says "the most expensive on the continent".
    expect(why).not.toMatch(/most expensive/);
    expect(why).toMatch(/only New York has beaten/);
    // "$140 million per km" is the Warsaw record; the headline's Poland is the model for this route. Both are named,
    // and the second is the number the top bar shows a minute later.
    expect(why).toMatch(/\$140 million per km/);
    const perKm = official().snapshot().headline?.polandPerKmCents ?? 0;
    expect(why).toContain(`about $${Math.round(perKm / 1e8)} million per km`);
  });
});

describe('The Portal: reforms and gates', () => {
  test('the capital banked to the launch gate no longer halves the price: the contract levers are bought before tender', () => {
    const late = official();
    late.dispatch([{ t: 'approveProject', projectId: PORTAL_PROJECT_ID }]);
    toGate(late, 'advancePhase');
    late.dispatch([{ t: 'advancePhase', projectId: PORTAL_PROJECT_ID }]);
    toGate(late, 'launchTBM');
    const atGate = late.snapshot();
    // The second playtest: 13 PC at tender, 90 at the launch gate, four reforms there, 8.14x to 3.90x.
    expect(atGate.politicalCapital).toBeGreaterThan(80);
    const before = atGate.projects[0].receipt.columns.yours.costCents;
    for (const id of ['bestValueAward', 'openTenders', 'roundTheClock', 'leanSupervision', 'utilityStatute'])
      late.dispatch([{ t: 'enactReform', id }]);
    const after = late.snapshot().projects[0].receipt;
    // Round-the-clock sites still shorten the works (escalation, the standing organisation); the unit prices stay.
    expect(after.columns.yours.costCents).toBeGreaterThan(before * 0.85);
    for (const id of ['procurement', 'staffing', 'utilities'] as const) {
      const line = after.lines.find((l) => l.id === id);
      expect(line?.factor.yours, id).toBeCloseTo(line?.factor.statusQuo ?? 0, 6);
      expect(line?.status, id).toBe('paid');
    }

    const early = official();
    early.dispatch([{ t: 'approveProject', projectId: PORTAL_PROJECT_ID }]);
    toGate(early, 'advancePhase');
    // At the tender gate the game says what the gate fixes, and the same capital buys the same reforms where they count.
    expect(early.snapshot().nextAction.hint).toMatch(/Tender fixes the design and the contract prices/);
    early.dispatch([{ t: 'enactReform', id: 'bestValueAward' }]);
    early.dispatch([{ t: 'enactReform', id: 'roundTheClock' }]);
    expect(early.snapshot().notices).toEqual([]);
    early.dispatch([{ t: 'advancePhase', projectId: PORTAL_PROJECT_ID }]);
    const tendered = early.snapshot().projects[0].receipt;
    expect(tendered.columns.yours.costCents).toBeLessThan(before * 0.8);
    expect(tendered.lines.find((l) => l.id === 'procurement')?.factor.yours).toBeLessThan(1.3);
  });

  test('the twin bore of the official redesign costs two reforms, not one and a free click', () => {
    const sim = official();
    sim.dispatch([{ t: 'enactReform', id: 'twoTracks' }]);
    const twin = sim.snapshot().projects[0].design.options.find((o) => o.id === 'twinBore');
    expect(twin?.lockedBy.map((l) => l.reformId)).toEqual(['twinBoreStandard']);
    const standard = sim.snapshot().reforms.find((r) => r.id === 'twinBoreStandard');
    expect(standard?.affordable).toBe(true);
    // 40 PC at the start: two tracks (15) and the standard (10) leave 15 for the mezzanines.
    expect(standard?.cost.pc).toBe(10);
    expect(standard?.preview?.costDeltaCents).toBeLessThan(-2e10);
    sim.dispatch([
      { t: 'enactReform', id: 'twinBoreStandard' },
      { t: 'enactReform', id: 'noMezzanines' },
    ]);
    expect(sim.snapshot().notices).toEqual([]);
    expect(sim.snapshot().politicalCapital).toBe(0);
    sim.dispatch([{ t: 'setDesign', projectId: PORTAL_PROJECT_ID, tunnel: 'twinBore', stationBox: 'compactBox' }]);
    expect(sim.snapshot().projects[0].design).toMatchObject({ tunnel: 'twinBore', stationBox: 'compactBox' });
  });

  test('the campus missions and free build start with the standard their twin-bore plans are drawn to', () => {
    for (const scenario of [GOOGLEPLEX_SPUR, DUMBARTON_TO_META, ORACLE_SHUTTLE, SANDBOX]) {
      expect(scenario.start.policies, scenario.id).toContain('twinBoreStandard');
      if (!scenario.reference) continue;
      const sim = createSim(scenario, 1, null, { events: false });
      sim.dispatch([{ t: 'useOfficialPlan' }]);
      const design = sim.snapshot().projects[0].design;
      for (const o of design.options) if (o.selected) expect(o.lockedBy, `${scenario.id} ${o.id}`).toEqual([]);
    }
  });
});

describe('The Portal: the receipt and the map', () => {
  test('a hand-drawn line is compared with itself under the old rules, and the official figure keeps its own ratio', () => {
    const own = createSim(THE_PORTAL, 1, null, { events: false });
    // A straight 1.5 km from 4th and King to the Transit Center, 20 m down: not the official route.
    const wps: Waypoint[] = [
      { x: 20804, y: -20, z: -64695, geology: 'bayMud' },
      { x: 20700, y: -20, z: -65500, geology: 'softGround' },
      { x: 20624.6, y: -20, z: -66108.8, geology: 'bayMud' },
    ];
    own.dispatch([
      { t: 'setAlignment', projectId: PORTAL_PROJECT_ID, name: 'The Portal', waypoints: wps },
      {
        t: 'addStation',
        projectId: PORTAL_PROJECT_ID,
        stationId: 'a',
        name: '4th and King',
        template: 'undergroundStandard',
        chainageM: 80,
      },
      {
        t: 'addStation',
        projectId: PORTAL_PROJECT_ID,
        stationId: 'b',
        name: 'Salesforce Transit Center',
        template: 'terminalFitOut',
        chainageM: 1350,
      },
    ]);
    const r = own.snapshot().projects[0].receipt;
    const ref = official().snapshot().projects[0].receipt;
    expect(r.columns.yours.lengthKm).toBeLessThan(1.6);
    // Three columns, one route: the report had the 2.09 km official plan as the status quo beside a 6.84 km line.
    expect(r.columns.statusQuo.lengthKm).toBeCloseTo(r.columns.yours.lengthKm, 9);
    expect(r.columns.statusQuo.baseCents).toBe(r.columns.yours.baseCents);
    expect(r.columns.statusQuo.basis).toMatch(/^Your route and methods under the rules of 2026/);
    expect(ref.columns.statusQuo.basis).toMatch(/^The official plan, under the rules of 2026/);
    // "Official plan: 11.8 times" on one line and "18.7 times" on another: it is one number now.
    expect(r.ghost?.costCents).toBe(ref.ghost?.costCents);
    expect(r.ratios.ghostToPoland).toBe(ref.ratios.ghostToPoland);
    expect(ref.ratios.ghostToPoland).toBeGreaterThan(18);
    expect(ref.ratios.ghostToPoland).toBeLessThan(19.5);
    // The rings on the map carry the station type the official plan builds there.
    const targets = own.snapshot().mission.targets;
    expect(targets.find((t) => t.name === 'Salesforce Transit Center')?.template).toBe('terminalFitOut');
    expect(targets.find((t) => t.name === '4th and King')?.template).toBe('undergroundStandard');
  });

  test('deeper is dearer on the official line, and its trenches are refused at 80 m', () => {
    const sim = official();
    const p = sim.state.projects[0];
    const at20 = sim.snapshot().projects[0].receipt.columns.yours.costCents;
    const deep = p.waypoints.map((w) => ({ ...w, y: w.y - 60 }));
    sim.dispatch([{ t: 'setAlignment', projectId: PORTAL_PROJECT_ID, waypoints: deep, methods: [...p.methods] }]);
    const snap = sim.snapshot().projects[0];
    // The report: $6.58B at the official depth, $5.74B with the whole line at 80 m.
    expect(snap.receipt.columns.yours.costCents).toBeGreaterThan(at20 * 1.2);
    expect(snap.checks.ok).toBe(false);
    expect(snap.checks.problems.join(' ')).toMatch(/cut-and-cover \d+ m below sea level, deeper than a trench goes/);
    expect(sim.snapshot().nextAction.kind).toBe('fixAlignment');
    // The station under 4th and Townsend went down with its line.
    expect(snap.stations.find((s) => s.template === 'undergroundStandard')?.depthM).toBeGreaterThan(70);
  });
});
