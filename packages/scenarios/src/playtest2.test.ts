/** Regressions from the second playtest of round 2 (2026-11-10) that need the real scenarios. */
import { autopilotCommands, createSim, type GameSim, type Waypoint } from '@bayvox/sim';
import { describe, expect, test } from 'vitest';
import { DUMBARTON_TO_META, GOOGLEPLEX_SPUR, PORTAL_PROJECT_ID, SANDBOX, SILICON_BRANCH, THE_PORTAL } from './index.ts';

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
    expect(why).toMatch(/Only New York has paid more per km/);
    // One Polish figure: the model for this route, the number the top bar shows a minute later. The Warsaw record
    // ($140 million per km) stood beside it and read as a second Poland.
    expect(why).not.toMatch(/\$140 million/);
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
    const CONTRACT = ['bestValueAward', 'roundTheClock', 'utilityStatute'];
    for (const id of CONTRACT) late.dispatch([{ t: 'enactReform', id }]);
    expect(late.snapshot().notices).toEqual([]);
    const after = late.snapshot().projects[0].receipt;
    // The unit prices stay what the contracts say. What these reforms do outside the contract still applies:
    // shorter works, no contingency policy on the money not yet spent.
    expect(after.columns.yours.costCents).toBeLessThan(before);
    for (const id of ['procurement', 'staffing', 'utilities'] as const) {
      const line = after.lines.find((l) => l.id === id);
      expect(line?.factor.yours, id).toBeCloseTo(line?.factor.statusQuo ?? 0, 6);
      expect(line?.status, id).toBe('paid');
    }

    const early = official();
    early.dispatch([{ t: 'approveProject', projectId: PORTAL_PROJECT_ID }]);
    toGate(early, 'advancePhase');
    // At the tender gate the game says what the gate fixes, and the same capital buys the same reforms where they count.
    expect(early.snapshot().nextAction.hint).toMatch(/Tender locks the design and the contract prices/);
    for (const id of CONTRACT) early.dispatch([{ t: 'enactReform', id }]);
    expect(early.snapshot().notices).toEqual([]);
    early.dispatch([{ t: 'advancePhase', projectId: PORTAL_PROJECT_ID }]);
    const tendered = early.snapshot().projects[0].receipt;
    // The same three reforms, bought five months earlier: the three unit-price lines are gone and the line costs
    // well under what the late buyer pays.
    expect(tendered.columns.yours.costCents).toBeLessThan(after.columns.yours.costCents * 0.7);
    for (const id of ['procurement', 'staffing', 'utilities'] as const) {
      const line = tendered.lines.find((l) => l.id === id);
      expect(line?.factor.yours, id).toBeLessThan(line?.factor.statusQuo ?? 0);
    }
    expect(tendered.lines.find((l) => l.id === 'procurement')?.factor.yours).toBeCloseTo(1, 6);
  });

  test('the twin bore of the official redesign is one reform and no trip to the design sheet', () => {
    const sim = official();
    sim.dispatch([{ t: 'setSpeed', speed: 0 }]);
    const design = () => sim.snapshot().projects[0].design;
    expect(design().tunnel).toBe('mixed');
    expect(
      design()
        .options.find((o) => o.id === 'twinBore')
        ?.lockedBy.map((l) => l.reformId),
    ).toEqual(['twinBoreStandard']);
    const standard = sim.snapshot().reforms.find((r) => r.id === 'twinBoreStandard');
    expect(standard).toMatchObject({ affordable: true, cost: { pc: 40, cents: 0 }, unlocks: ['twinBore'] });
    // The biggest saving on this line, and the first row of a sheet sorted by saving.
    const savings = sim
      .snapshot()
      .reforms.map((r) => ({ id: r.id, saved: -(r.preview?.costDeltaCents ?? 0) }))
      .sort((a, b) => b.saved - a.saved);
    expect(savings[0].id).toBe('twinBoreStandard');
    expect(standard?.preview?.costDeltaCents).toBeLessThan(-2e11);
    const before = sim.snapshot().projects[0].receipt.columns.yours.costCents;
    sim.dispatch([{ t: 'enactReform', id: 'twinBoreStandard' }]);
    expect(sim.snapshot().notices).toEqual([]);
    expect(sim.snapshot().politicalCapital).toBe(THE_PORTAL.start.politicalCapital - 40);
    // The official mined cavern and cut-and-cover boxes are twin bore now, and the preview was the saving to the cent.
    expect(design()).toMatchObject({ tunnel: 'twinBore', frozen: false });
    expect(sim.snapshot().projects[0].segments.every((x) => x.method === 'boredTwin')).toBe(true);
    expect(sim.snapshot().projects[0].receipt.columns.yours.costCents - before).toBe(standard?.preview?.costDeltaCents);
    // The station reform makes the box compact the same way: the mandate goes, the design follows.
    sim.dispatch([{ t: 'enactReform', id: 'stationCatalogue' }]);
    expect(design()).toMatchObject({ tunnel: 'twinBore', stationBox: 'compactBox' });
    // After tender neither reform moves the design.
    const late = official();
    late.dispatch([{ t: 'approveProject', projectId: PORTAL_PROJECT_ID }]);
    toGate(late, 'advancePhase');
    late.dispatch([
      { t: 'advancePhase', projectId: PORTAL_PROJECT_ID },
      { t: 'enactReform', id: 'twinBoreStandard' },
    ]);
    expect(late.state.reforms).toContain('twinBoreStandard');
    expect(late.snapshot().projects[0].design).toMatchObject({ tunnel: 'mixed', frozen: true });
  });

  test('the campus missions and free build start with the standard their twin-bore plans are drawn to', () => {
    for (const scenario of [GOOGLEPLEX_SPUR, DUMBARTON_TO_META, SILICON_BRANCH, SANDBOX]) {
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
