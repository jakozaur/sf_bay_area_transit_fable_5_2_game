/**
 * A machine per tunnel type (2026-11-10): every tunnel option of the design chooser names its machine, the
 * heading entity carries it to the renderer, and the receipt of the official Portal plan did not move.
 */
import type { MachineKind } from '@bayvox/core';
import { createSim, type GameSnapshot, type ProjectView, REFORMS, type ScenarioDef, type TbmView, type TunnelOptionId } from '@bayvox/sim';
import { describe, expect, test } from 'vitest';
import { GOOGLEPLEX_SPUR, playMission, THE_PORTAL, withStartReforms } from './index.ts';

const ALL = REFORMS.map((r) => r.id);

function officialPlan(s: ScenarioDef): ProjectView {
  const sim = createSim(s, 1, null, { events: false });
  sim.dispatch([{ t: 'useOfficialPlan' }]);
  const snap = sim.snapshot();
  expect(snap.notices).toEqual([]);
  return snap.projects[0];
}

function machines(p: ProjectView): Record<string, [MachineKind, number, number, number]> {
  const out: Record<string, [MachineKind, number, number, number]> = {};
  for (const o of p.design.options) {
    if (o.group !== 'tunnel') {
      expect(o.machine, o.id).toBeUndefined();
      continue;
    }
    if (!o.machine) throw new Error(`tunnel option ${o.id} has no machine`);
    expect(o.machine.name.length, o.id).toBeGreaterThan(0);
    expect(o.machine.note, o.id).toContain('no separate machine price');
    expect(Number.isInteger(o.machine.priceCents) && o.machine.priceCents > 0, o.id).toBe(true);
    // The price is a part of the option's all-in estimate, not something on top of it.
    expect(o.machine.priceCents, o.id).toBeLessThan(o.costCents);
    out[o.id] = [o.machine.kind, o.machine.diameterM, o.machine.count, o.machine.metresPerDay];
  }
  return out;
}

describe('the design chooser names the machine of each tunnel option', () => {
  test('no reforms: two 6.6 m shields, one 16.2 m shield, a roadheader in the three-track cavern, excavators in the wide trench', () => {
    expect(machines(officialPlan(THE_PORTAL))).toEqual({
      twinBore: ['twinBore', 6.6, 2, 10.5],
      singleLargeBore: ['singleBore', 16.2, 1, 5.33],
      cutAndCover: ['excavator', 22, 1, 2],
      minedCavern: ['roadheader', 15.6, 1, 1.67],
    });
  });

  test('every reform but the small bore: the twin bore stays two 6.6 m shields at the capped rate', () => {
    const p = officialPlan(
      withStartReforms(
        THE_PORTAL,
        ALL.filter((r) => r !== 'smallBoreLoop'),
      ),
    );
    expect(machines(p)).toEqual({
      twinBore: ['twinBore', 6.6, 2, 27],
      singleLargeBore: ['singleBore', 16.2, 1, 20.57],
      cutAndCover: ['excavator', 12.5, 1, 3],
      minedCavern: ['roadheader', 11.3, 1, 2.5],
    });
  });

  test('the small bore exists only with smallBoreLoop, and replaces the twin bore: one 3.7 m shield', () => {
    const p = officialPlan(withStartReforms(THE_PORTAL, ALL));
    expect(machines(p)).toEqual({
      twinBore: ['smallBore', 3.7, 1, 40.5],
      singleLargeBore: ['singleBore', 16.2, 1, 20.57],
      cutAndCover: ['excavator', 12.5, 1, 3],
      minedCavern: ['roadheader', 11.3, 1, 2.5],
    });
    const twin = p.design.options.find((o) => o.id === 'twinBore');
    expect(twin?.machine?.name).toBe('One 3.7 m small-bore machine');
    expect(twin?.machine?.note).toContain('Launched from the surface');
  });
});

/** Plays The Portal with one tunnel option and returns the headings at launch and what the bore clock did. */
function drive(scenario: ScenarioDef, reforms: readonly string[], tunnel: TunnelOptionId) {
  const sim = createSim(withStartReforms(scenario, reforms), 1, null, { events: false });
  let launch: GameSnapshot | null = null;
  let last: ProjectView | null = null;
  let lastDone = -1;
  const run = playMission(sim, {
    each: (snap) => {
      const p = snap.projects[0];
      if (!p) return undefined;
      if (p.tbms.length === 0) {
        expect([p.boreTbmId, p.boreTotalDays, p.boreDaysDone]).toEqual([null, 0, 0]);
        return !p.design.frozen && p.design.tunnel !== tunnel ? [{ t: 'setDesign', projectId: p.id, tunnel }] : undefined;
      }
      if (launch === null) launch = snap;
      const active = p.tbms.find((t) => t.id === p.boreTbmId);
      if (!active) throw new Error('a launched underground line has no active drive');
      expect([p.boreTotalDays, p.boreDaysDone]).toEqual([active.boreTotalDays, active.boreDaysDone]);
      expect(p.boreDaysDone).toBeGreaterThanOrEqual(lastDone);
      expect(p.boreDaysDone).toBeLessThanOrEqual(p.boreTotalDays);
      lastDone = p.boreDaysDone;
      last = p;
      return undefined;
    },
  });
  expect(run.complete).toBe(true);
  if (launch === null || last === null) throw new Error('never launched');
  return { launch: launch as GameSnapshot, last: last as ProjectView };
}

describe('the heading entity carries its machine', () => {
  // The Portal's curves (200 m and 160 m) are too tight for the large machine, so that one bores the Googleplex spur.
  const CASES: [string, ScenarioDef, readonly string[], TunnelOptionId, MachineKind, number, number[]][] = [
    ['twin bore', THE_PORTAL, ['twinBoreStandard'], 'twinBore', 'twinBore', 6.6, [-5.5, 5.5]],
    ['single large bore', GOOGLEPLEX_SPUR, [], 'singleLargeBore', 'singleBore', 16.2, [0]],
    ['mined cavern', THE_PORTAL, [], 'minedCavern', 'roadheader', 15.6, [0]],
    ['cut-and-cover', THE_PORTAL, [], 'cutAndCover', 'excavator', 22, [0]],
    ['small bore', THE_PORTAL, ['twinBoreStandard', 'smallBoreLoop'], 'twinBore', 'smallBore', 3.7, [0]],
  ];
  test.each(CASES)('%s', (_name, scenario, reforms, tunnel, kind, diameterM, laterals) => {
    const { launch, last } = drive(scenario, reforms, tunnel);
    const p = launch.projects[0];
    expect(p.tbms.length).toBeGreaterThan(0);
    for (const t of p.tbms as TbmView[]) {
      expect([t.machine, t.diameterM, t.laterals], t.id).toEqual([kind, diameterM, laterals]);
      expect(t.radiusM, t.id).toBeCloseTo(diameterM / 2, 1);
      // On launch day nothing is done and the whole drive is ahead.
      expect(t.boreDaysDone, t.id).toBe(0);
      expect(t.boreTotalDays, t.id).toBeGreaterThan(0);
    }
    // The pit and the lining behind the machine are sized for the same tube.
    expect(last.tunnels.map((t) => [t.radiusM, t.laterals])).toEqual(last.tbms.map((t) => [t.radiusM, t.laterals]));
    // Through: the clock of every heading stands at the days it took. The figure at launch counted the expected
    // maintenance stops, the run rolled them, so the two agree to within a few stops.
    for (const t of last.tbms) {
      expect(t.status, t.id).toBe('done');
      expect(t.boreDaysDone, t.id).toBe(t.boreTotalDays);
      const atLaunch = p.tbms.find((x) => x.id === t.id);
      if (!atLaunch) throw new Error(`heading ${t.id} was not there at launch`);
      expect(Math.abs(t.boreTotalDays - atLaunch.boreTotalDays), t.id).toBeLessThanOrEqual(0.15 * atLaunch.boreTotalDays);
    }
  });
});

describe('the receipt of the official Portal plan is the one from before the machines', () => {
  // Recorded on a63f743 before the change: base, all-in and opening date per column, then the group sums of "yours".
  const BEFORE = {
    none: {
      columns: {
        yours: [30628111777, 657553397070, '2036-02-19'],
        statusQuo: [30628111777, 657553397070, '2036-02-19'],
        poland: [30628111777, 36605600491, '2032-09-28'],
      },
      groups: { designScope: 74690553927, institutional: 350664635601, delay: 182886947581, priceLevel: 18683148184 },
    },
    all: {
      columns: {
        yours: [30628111777, 42885605129, '2031-02-18'],
        statusQuo: [30628111777, 42885605129, '2031-02-18'],
        poland: [30628111777, 36605600491, '2032-09-28'],
      },
      groups: { designScope: -10746681571, institutional: 0, delay: 4321026739, priceLevel: 18683148184 },
    },
  } as const;

  test.each([
    ['none', THE_PORTAL],
    ['all', withStartReforms(THE_PORTAL, ALL)],
  ] as const)('%s reforms', (which, scenario) => {
    const r = officialPlan(scenario).receipt;
    for (const col of ['yours', 'statusQuo', 'poland'] as const)
      expect([r.columns[col].baseCents, r.columns[col].costCents, r.columns[col].openDate], col).toEqual(BEFORE[which].columns[col]);
    expect(Object.fromEntries(r.groups.map((g) => [g.id, g.cents.yours]))).toEqual(BEFORE[which].groups);
  });
});
