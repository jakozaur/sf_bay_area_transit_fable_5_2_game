/**
 * M3 (owner decisions, 2026-11-10) on the shipped missions: one target per mission, twelve reforms priced in
 * political capital, and starting capital that reaches 2x Poland on cost with good choices only.
 * The ratios in the test names are measured by the scripted runs below (seed 1, event cards off).
 */
import { createSim, type GameCommand, type GameSnapshot, type PolandTarget, REFORMS, type ScenarioDef } from '@bayvox/sim';
import { describe, expect, test } from 'vitest';
import {
  DUMBARTON_TO_META,
  GOOGLEPLEX_SPUR,
  missionCards,
  POLAND_TARGET,
  playMission,
  SANDBOX,
  SCENARIOS,
  SILICON_BRANCH,
  THE_PORTAL,
  withStartReforms,
} from './index.ts';

const MISSIONS = [THE_PORTAL, GOOGLEPLEX_SPUR, DUMBARTON_TO_META, SILICON_BRANCH];
const ALL = REFORMS.map((r) => r.id);

/**
 * The receipt of the official plan on day one, recorded on the 32-node tree before the merge: [cost in cents,
 * opening date] of each column, with the mission's own start and with every reform in force from the start.
 */
const BEFORE: Record<string, Record<'none' | 'all', Record<'yours' | 'statusQuo' | 'poland', [number, string]>>> = {
  'the-portal': {
    none: { yours: [657553397070, '2036-02-19'], statusQuo: [657553397070, '2036-02-19'], poland: [36605600491, '2032-09-28'] },
    all: { yours: [42885605129, '2031-02-18'], statusQuo: [42885605129, '2031-02-18'], poland: [36605600491, '2032-09-28'] },
  },
  'googleplex-spur': {
    none: { yours: [592380794111, '2042-08-21'], statusQuo: [592380794111, '2042-08-21'], poland: [50498852238, '2034-05-13'] },
    all: { yours: [49018158712, '2031-02-19'], statusQuo: [49018158712, '2031-02-19'], poland: [50498852238, '2034-05-13'] },
  },
  'dumbarton-to-meta': {
    none: { yours: [162080075391, '2041-02-26'], statusQuo: [162080075391, '2041-02-26'], poland: [16382167477, '2033-07-23'] },
    all: { yours: [22672874471, '2030-05-01'], statusQuo: [22672874471, '2030-05-01'], poland: [16382167477, '2033-07-23'] },
  },
  siliconBranch: {
    none: { yours: [900040404302, '2043-03-24'], statusQuo: [900040404302, '2043-03-24'], poland: [90864486609, '2034-12-14'] },
    all: { yours: [109508860616, '2031-09-22'], statusQuo: [109508860616, '2031-09-22'], poland: [90864486609, '2034-12-14'] },
  },
};

function officialPlan(s: ScenarioDef): GameSnapshot {
  const sim = createSim(s, 1, null, { events: false });
  sim.dispatch([{ t: 'useOfficialPlan' }]);
  const snap = sim.snapshot();
  expect(snap.notices, s.id).toEqual([]);
  return snap;
}

describe('the merge moved nothing at either end', () => {
  test.each(MISSIONS.map((s) => [s.id, s] as const))(
    '%s: the receipt with no reforms and with all reforms is the receipt from before, to the cent and the day',
    (id, s) => {
      for (const [which, scenario] of [
        ['none', s],
        ['all', withStartReforms(s, ALL)],
      ] as const) {
        const columns = officialPlan(scenario).projects[0].receipt.columns;
        for (const col of ['yours', 'statusQuo', 'poland'] as const)
          expect([columns[col].costCents, columns[col].openDate], `${id} ${which} ${col}`).toEqual(BEFORE[id][which][col]);
      }
    },
  );
});

describe('one number to beat', () => {
  test('every mission has its connections and the one target, and nothing else', () => {
    expect(POLAND_TARGET).toEqual({
      id: 'near-poland',
      title: 'Get within 2x Poland on cost and time',
      kind: 'maxRatioToPoland',
      ratio: 2,
    });
    expect(SCENARIOS.map((s) => [s.id, s.objectives.map((o) => o.id)])).toEqual([
      ['the-portal', ['connect', 'near-poland']],
      ['googleplex-spur', ['connect', 'near-poland']],
      ['dumbarton-to-meta', ['connect', 'near-poland']],
      ['siliconBranch', ['connect', 'connect-google', 'near-poland']],
      ['sandbox', ['near-poland']],
    ]);
    for (const s of SCENARIOS) {
      for (const o of s.objectives) {
        expect(o.stretch, `${s.id} ${o.id}`).toBeUndefined();
        expect(['connect', 'maxRatioToPoland'], `${s.id} ${o.id}`).toContain(o.kind);
        expect(o.title, `${s.id} ${o.id}`).not.toMatch(/stretch|riders|budget|official/i);
      }
      expect(s.objectives.at(-1), s.id).toEqual(POLAND_TARGET);
    }
    // The briefing card lists the same titles.
    const cards = missionCards({ schemaVersion: 1, missions: {} });
    expect(cards[0].objectives).toEqual([
      'Run trains from 4th and King to the Salesforce Transit Center',
      'Get within 2x Poland on cost and time',
    ]);
    // The map marks the ends of the connections only.
    expect(officialPlan(GOOGLEPLEX_SPUR).mission.targets.map((t) => t.name)).toEqual(['San Antonio Caltrain', 'Googleplex']);
    expect(officialPlan(DUMBARTON_TO_META).mission.targets.map((t) => t.name)).toEqual(['Redwood City Caltrain', 'Meta, Menlo Park']);
  });

  test('the official plan is one line on the briefing, and its ratio is the one the receipt computes', () => {
    const x = (r: number) => `${r.toFixed(1)}x Poland`;
    const billions = (cents: number) => `$${(cents / 1e11).toFixed(2)} billion`;
    const portal = officialPlan(THE_PORTAL).projects[0];
    expect(THE_PORTAL.briefing?.officialCost).toBe(`$6.84 billion, ${x(portal.receipt.ratios.ghostToPoland ?? 0)} (TJPA, 2025).`);
    expect(portal.scorecard.ghost).toMatchObject({ label: 'Official plan (TJPA, 2025)', costCents: 6.84e11 });
    const dumbarton = officialPlan(DUMBARTON_TO_META).projects[0];
    expect(DUMBARTON_TO_META.briefing?.officialCost).toBe(
      `$1.6 billion for the whole 33 km corridor with a new bridge, ${x(dumbarton.receipt.ratios.ghostToPoland ?? 0)} per km (SamTrans, 2017).`,
    );
    // No sponsor figure: the line is the model's status quo, the ghost column of the scorecard.
    for (const s of [GOOGLEPLEX_SPUR, SILICON_BRANCH]) {
      const p = officialPlan(s).projects[0];
      expect(p.receipt.ghost, s.id).toBeNull();
      expect(p.scorecard.ghost.kind, s.id).toBe('model');
      expect(s.briefing?.officialCost, s.id).toBe(
        `None. The game's estimate under today's rules: ${billions(p.scorecard.ghost.costCents)}, ${x(p.receipt.ratios.statusQuoToPoland)}.`,
      );
    }
    expect(SANDBOX.briefing?.officialCost).toMatch(/^No official figure/);
  });
});

interface Played {
  target: PolandTarget;
  stars: number;
  snap: GameSnapshot;
  /** Political capital in hand when the design and the contract prices were fixed (the tender). */
  capitalAtTender: number;
}

/**
 * Plays a mission to the end, buying one reform a frame. `order` is a list of ids (the first affordable one is
 * bought), or 'sheet': the Reforms sheet as the player reads it, biggest saving on this line first, less the ids
 * of `skip`.
 */
function play(scenario: ScenarioDef, order: readonly string[] | 'sheet', skip: readonly string[] = []): Played {
  const sim = createSim(scenario, 1, null, { events: false });
  let capitalAtTender = -1;
  const run = playMission(sim, {
    each: (snap) => {
      const p = snap.projects[0];
      if (capitalAtTender < 0 && p?.awaiting === 'advancePhase') capitalAtTender = snap.politicalCapital;
      const list =
        order === 'sheet'
          ? snap.reforms
              .filter((r) => r.status !== 'enacted' && !skip.includes(r.id) && (r.preview?.costDeltaCents ?? 0) < -1e8)
              .sort((a, b) => (a.preview?.costDeltaCents ?? 0) - (b.preview?.costDeltaCents ?? 0))
              .map((r) => r.id)
          : order;
      const out: GameCommand[] = [];
      for (const id of list) {
        const r = snap.reforms.find((x) => x.id === id);
        if (r && r.status !== 'enacted' && r.affordable) {
          out.push({ t: 'enactReform', id });
          break;
        }
      }
      return out;
    },
  });
  expect(run.complete, scenario.id).toBe(true);
  const snap = sim.snapshot();
  expect(snap.notices, scenario.id).toEqual([]);
  const card = snap.projects[0].scorecard;
  if (!card.polandTarget) throw new Error(`${scenario.id}: no polandTarget on the scorecard`);
  expect(card.final).toBe(true);
  return { target: card.polandTarget, stars: card.stars, snap, capitalAtTender };
}

const rich = (s: ScenarioDef): ScenarioDef => ({ ...s, start: { ...s.start, politicalCapital: 10_000 } });
const CHEAPEST_FIRST = [...REFORMS].sort((a, b) => a.cost.pc - b.cost.pc).map((r) => r.id);
const x = (t: PolandTarget) => `${t.costRatio.toFixed(2)}x cost, ${t.timeRatio.toFixed(2)}x time`;

describe.each(MISSIONS.map((s) => [s.title, s] as const))('%s against the 2x Poland target', (_title, s) => {
  const idle = play(s, []);
  const sheet = play(s, 'sheet');
  const rail = play(s, 'sheet', ['smallBoreLoop']);
  const listOrder = play(s, ALL);
  const cheapest = play(s, CHEAPEST_FIRST);
  const everything = play(rich(s), ALL);

  test(`no reforms: ${x(idle.target)}, ${idle.stars} of 3 stars`, () => {
    expect(idle.target.costRatio).toBeGreaterThan(9);
    expect(idle.target.met).toBe(false);
    // Open, and nothing more unless the status quo happens to be inside 2x on time.
    expect(idle.stars).toBe(idle.target.timeRatio <= 2 ? 2 : 1);
    expect(idle.snap.objectives.find((o) => o.id === 'near-poland')?.status).toBe('failed');
  });

  test(`${s.start.politicalCapital} political capital, bought from the top of the sheet: ${x(sheet.target)}; the same keeping the railway a railway: ${x(rail.target)}`, () => {
    for (const run of [sheet, rail]) {
      expect(run.target.costRatio).toBeLessThanOrEqual(2);
      expect(run.target.met).toBe(true);
      expect(run.stars).toBe(3);
      expect(run.snap.objectives.every((o) => o.status === 'done')).toBe(true);
    }
    expect(rail.snap.reforms.find((r) => r.id === 'smallBoreLoop')?.status).toBe('available');
  });

  test(`the same capital in list order: ${x(listOrder.target)}; cheapest first: ${x(cheapest.target)}: the capital does not win by itself`, () => {
    for (const run of [listOrder, cheapest]) {
      expect(run.target.costRatio).toBeGreaterThan(2);
      expect(run.stars).toBeLessThan(3);
      expect(run.snap.objectives.find((o) => o.id === 'near-poland')?.status).toBe('failed');
    }
  });

  test(`everything (capital topped up): ${x(everything.target)}`, () => {
    expect(everything.snap.reforms.every((r) => r.status === 'enacted')).toBe(true);
    expect(everything.target.costRatio).toBeLessThan(1.5);
    expect(everything.target.costRatio).toBeLessThan(sheet.target.costRatio);
    expect(everything.stars).toBe(3);
  });

  test('the starting capital does not buy everything on offer by the time the contracts are let', () => {
    const onOffer = REFORMS.filter((r) => !s.start.policies.includes(r.id)).reduce((sum, r) => sum + r.cost.pc, 0);
    expect(idle.capitalAtTender).toBeGreaterThanOrEqual(s.start.politicalCapital);
    expect(idle.capitalAtTender).toBeLessThan(onOffer);
  });
});

describe('The Portal: 200 political capital is the six reforms that cut the cost, and nothing else', () => {
  test('the six at the top of the sheet cost 200 of the 440 the twelve cost, and an idle player reaches tender with 215', () => {
    const top = officialPlan({ ...THE_PORTAL, start: { ...THE_PORTAL.start } })
      .reforms.filter((r) => (r.preview?.costDeltaCents ?? 0) < -1e8)
      .sort((a, b) => (a.preview?.costDeltaCents ?? 0) - (b.preview?.costDeltaCents ?? 0));
    expect(top.slice(0, 6).map((r) => r.id)).toEqual([
      'twinBoreStandard',
      'bestValueAward',
      'inHouseEngineering',
      'utilityStatute',
      'roundTheClock',
      'stationCatalogue',
    ]);
    expect(top.slice(0, 6).reduce((sum, r) => sum + r.cost.pc, 0)).toBe(200);
    expect(REFORMS.reduce((sum, r) => sum + r.cost.pc, 0)).toBe(440);
    expect(THE_PORTAL.start.politicalCapital).toBe(200);
    // Five months of permitting are left. The finished phase pays 15; the monthly mandate adds nothing above 150.
    expect(play(THE_PORTAL, []).capitalAtTender).toBe(215);
  });

  test('every other mission starts with 160, and free build with enough for all of it', () => {
    expect([GOOGLEPLEX_SPUR, DUMBARTON_TO_META, SILICON_BRANCH].map((s) => s.start.politicalCapital)).toEqual([160, 160, 160]);
    expect(SANDBOX.start.politicalCapital).toBeGreaterThan(REFORMS.reduce((sum, r) => sum + r.cost.pc, 0));
    // They start with the Polish tunnel standard their plans are drawn to, The Portal with nothing.
    expect(THE_PORTAL.start.policies).toEqual([]);
    for (const s of [GOOGLEPLEX_SPUR, DUMBARTON_TO_META, SILICON_BRANCH, SANDBOX])
      expect(s.start.policies, s.id).toEqual(['twinBoreStandard']);
  });
});
