/** Regressions from the first playtest of round 2 (2026-11-10) that need the real scenarios. */
import { autopilotCommands, createSim, SUBSTEPS_PER_DAY } from '@bayvox/sim';
import { describe, expect, test } from 'vitest';
import { DUMBARTON_TO_META, GOOGLEPLEX_SPUR, SANDBOX, SCENARIOS, THE_PORTAL } from './index.ts';

describe('driving The Portal', () => {
  test('no pose reached by holding the keys is a dead end: the autopilot always finishes the mined drive', () => {
    // On the code the playtest ran, seed 10 of this sequence ended 28.7 m left and 8.7 m above the plan on the
    // Townsend curve, held at the corridor edge, and 3,000 game days of autopilot bored 0.00 m: the shield
    // re-steered in place onto a heading from which the next step still led away from the plan.
    for (let seed = 1; seed <= 40; seed++) {
      const sim = createSim(THE_PORTAL, 1, null, { events: false });
      sim.dispatch(THE_PORTAL.reference?.commands ?? []);
      sim.run(365 * 30, (s) => (s.state.projects[0].fronts.length > 0 ? false : autopilotCommands(s.state)));
      const front = sim.state.projects[0].fronts.find((x) => x.method === 'mined');
      if (!front) throw new Error('The Portal has no mined heading');
      let r = seed * 2654435761;
      const rnd = (): number => {
        r = (r * 1664525 + 1013904223) >>> 0;
        return r / 2 ** 32;
      };
      // Pitch mostly held up, the steering changed every 20 to 120 game days.
      for (let block = 0; block < 12 && front.chainageM < front.toM; block++) {
        const steer = Math.round(rnd() * 2 - 1);
        const pitch = rnd() < 0.7 ? 1 : Math.round(rnd() * 2 - 1);
        sim.dispatch([{ t: 'tbmControl', headingId: front.id, autopilot: false, thrust: 1, steer, pitch }]);
        const days = 20 + Math.floor(rnd() * 100);
        for (let i = 0; i < days * SUBSTEPS_PER_DAY && front.chainageM < front.toM; i++) sim.substep();
      }
      if (front.chainageM >= front.toM) continue;
      const d = front.drive;
      const at = `seed ${seed}: bored ${front.boredM.toFixed(1)} m, ${d?.lateralM.toFixed(1)} m right, ${d?.verticalM.toFixed(1)} m high`;
      sim.dispatch([{ t: 'tbmControl', headingId: front.id, autopilot: true }]);
      for (let i = 0; i < 1500 * SUBSTEPS_PER_DAY && front.chainageM < front.toM; i++) sim.substep();
      expect(front.chainageM, at).toBe(front.toM);
    }
  });
});

describe('missions beyond The Portal', () => {
  test('the official alignments price, check and open without a crash: Dumbarton has a sponsor cost and no sponsor date', () => {
    for (const scenario of SCENARIOS.filter((s) => s.reference)) {
      const sim = createSim(scenario, 1);
      sim.dispatch([{ t: 'useOfficialPlan' }]);
      const p = sim.snapshot().projects[0];
      expect(p.checks.ok, scenario.id).toBe(true);
      expect(p.receipt.columns.poland.costCents, scenario.id).toBeGreaterThan(0);
      // The gate button says what the mission launches.
      const gate = p.phases.find((ph) => ph.id === 'utilities')?.gate?.label;
      expect(gate, scenario.id).toBe(
        scenario.id === 'dumbarton-to-meta' ? 'Start construction' : scenario.id === 'the-portal' ? 'Start mining' : 'Launch the TBM',
      );
    }
    const meta = createSim(DUMBARTON_TO_META, 1);
    meta.dispatch([{ t: 'useOfficialPlan' }]);
    const m = meta.snapshot().projects[0];
    expect(m.receipt.ghost).toMatchObject({ label: 'Corridor study (SamTrans, 2017)', openDate: '' });
    expect(m.scorecard.ghost).toMatchObject({ kind: 'sponsor', openDate: '', yearsToOpen: 0 });
    // Surface track: nothing to drive, and the hint at the gate does not mention a machine.
    expect(m.segments.every((g) => g.method === 'atGrade')).toBe(true);
  });

  test('free build starts as a metro: a line across the Bay is priced inside the range the research gives, and opens within decades', () => {
    const sim = createSim(SANDBOX, 1);
    // 34 km in four clicks on the whole-Bay view, as the playtest drew it (127x Poland and an opening in 2100 then).
    sim.dispatch([
      {
        t: 'setAlignment',
        projectId: 'line',
        waypoints: [
          { x: 20_000, y: -20, z: -60_000 },
          { x: 28_000, y: -20, z: -52_000 },
          { x: 36_000, y: -20, z: -47_000 },
          { x: 44_000, y: -20, z: -38_000 },
        ],
      },
    ]);
    const snap = sim.snapshot();
    const p = snap.projects[0];
    expect(p.lengthM).toBeGreaterThan(30_000);
    expect(p.design.tunnel).toBe('twinBore');
    // Doc 11 section 6.5: nominal ratios of 3 to 15 for scope-matched projects.
    expect(snap.headline?.ratio).toBeGreaterThan(3);
    expect(snap.headline?.ratio).toBeLessThan(15);
    expect(p.receipt.columns.yours.yearsToOpen).toBeLessThan(20);
    expect(p.receipt.lines.find((l) => l.id === 'escalation')?.factor.yours).toBeLessThan(2);
  });

  test('money is a constraint on every mission: the status-quo plan runs out and is called for, and ends in the black', () => {
    for (const scenario of [THE_PORTAL, GOOGLEPLEX_SPUR]) {
      const sim = createSim(scenario, 7);
      sim.dispatch([{ t: 'useOfficialPlan' }]);
      let lowest = Number.POSITIVE_INFINITY;
      let calls = 0;
      sim.run(365 * 60, (s) => {
        lowest = Math.min(lowest, s.state.cashCents);
        if (s.state.projects[0].status === 'open') return false;
        const card = s.state.pendingEvents.find((e) => e.defId === 'cashCall');
        if (card) {
          calls++;
          return [{ t: 'resolveEvent', eventId: card.uid, optionId: 'bridge' }];
        }
        return autopilotCommands(s.state);
      });
      expect(sim.state.projects[0].status, scenario.id).toBe('open');
      expect(calls, scenario.id).toBeGreaterThan(0);
      // The overdraft is at most a day's spending deep, and the line opens with money in the account.
      expect(lowest, scenario.id).toBeGreaterThan(-2e10);
      expect(sim.state.cashCents, scenario.id).toBeGreaterThanOrEqual(0);
      expect(sim.snapshot().projects[0].receipt.lines.find((l) => l.id === 'events')?.cents.yours, scenario.id).toBeGreaterThan(0);
    }
  });
});
