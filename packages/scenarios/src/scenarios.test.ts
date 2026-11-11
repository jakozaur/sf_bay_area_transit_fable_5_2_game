import type { WorldEdit } from '@bayvox/core';
import {
  advanceRate,
  autopilotCommands,
  CONSTANTS,
  carveShape,
  createSim,
  DAYS_PER_YEAR,
  EVENTS,
  type GameSim,
  isoToDays,
  loadSim,
  offsetPointAt,
  POLAND_PROFILE,
  type ProfileKey,
  profileFor,
  projectSpentCents,
  REFORMS,
  type ScenarioDef,
  validateScenario,
} from '@bayvox/sim';
import { describe, expect, test } from 'vitest';
import {
  PORTAL_PROJECT_ID,
  playReference,
  SANDBOX,
  SCENARIOS,
  scenarioById,
  THE_PORTAL,
  validateAll,
  withPolandProfile,
  withStartReforms,
  xz,
} from './index.ts';

const MAX_TICKS = DAYS_PER_YEAR * 40;
const TOLERANCE = 0.15;
const usdB = (cents: number) => `$${(cents / 1e11).toFixed(2)}B`;
const usdM = (cents: number) => `$${(cents / 1e8).toFixed(0)}M`;

interface Outcome {
  sim: GameSim;
  costCents: number;
  years: number;
  openDate: string;
}

function playPortal(
  scenario: ScenarioDef,
  seed: number,
  events: boolean,
  world: { applyEdit(e: WorldEdit): unknown } | null = null,
): Outcome {
  const sim = createSim(scenario, seed, world, { events });
  const r = playReference(sim, scenario, MAX_TICKS);
  if (!r.opened) throw new Error(`scenario "${scenario.id}" seed ${seed} did not open within ${MAX_TICKS} ticks`);
  const p = sim.state.projects[0];
  return {
    sim,
    costCents: projectSpentCents(p),
    years: (p.openedTick - p.approvedTick) / DAYS_PER_YEAR,
    openDate: sim.snapshot().projects[0].comparison.openDate,
  };
}

// Calibration runs, done once at collection so the numbers can go into the test names.
const OFFICIAL_COST = CONSTANTS.portalOfficialCostUsd.value * 100;
const OFFICIAL_COST_WITH_BOX = CONSTANTS.portalOfficialCostWithTrainboxUsd.value * 100;
const OFFICIAL_YEARS = (isoToDays(THE_PORTAL.reference?.officialOpenDate ?? '') - isoToDays(THE_PORTAL.start.date)) / DAYS_PER_YEAR;
const WARSAW_PER_KM = (CONSTANTS.warsawM2ExtensionPlnPerKm2026.value / CONSTANTS.plnPerUsdNominal.value) * 100;
const LODZ_PER_KM = (CONSTANTS.lodzTunnelPlnPerKm2026.value / CONSTANTS.plnPerUsdNominal.value) * 100;

const statusQuo = playPortal(THE_PORTAL, 1, false);
const reformed = playPortal(withPolandProfile(THE_PORTAL), 1, false);
const sqView = statusQuo.sim.snapshot().projects[0].comparison;
const plView = reformed.sim.snapshot().projects[0].comparison;
const RATIO = statusQuo.costCents / reformed.costCents;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const withEvents = SEEDS.map((seed) => playPortal(THE_PORTAL, seed, true));
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('scenario data', () => {
  test('every scenario validates', () => {
    expect(validateAll()).toEqual([]);
    expect(SCENARIOS.map((s) => s.id)).toEqual(['the-portal', 'googleplex-spur', 'dumbarton-to-meta', 'siliconBranch', 'sandbox']);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    expect(scenarioById('the-portal')).toBe(THE_PORTAL);
    expect(() => scenarioById('atlantis')).toThrow(/no scenario "atlantis" \(known: the-portal/);
    // M2: the Oracle shuttle is gone. An old save or link fails with one line that says so.
    expect(() => scenarioById('oracle-shuttle')).toThrow(
      /^scenarios: no scenario "oracle-shuttle": the Oracle shuttle tunnel was removed in M2/,
    );
    expect(SCENARIOS.some((s) => /oracle/i.test(`${s.id} ${s.title}`))).toBe(false);
    for (const s of SCENARIOS) expect(JSON.parse(JSON.stringify(s)), `${s.id} is plain JSON`).toEqual(s);
  });

  test('validation names what is wrong', () => {
    const broken: ScenarioDef = {
      ...THE_PORTAL,
      id: 'Bad Id',
      objectives: [],
      start: { ...THE_PORTAL.start, date: '2026-13-40', budgetCents: 1.5 },
    };
    const problems = validateScenario(broken).join('\n');
    expect(problems).toMatch(/id must be letters, digits and dashes/);
    expect(problems).toMatch(/start.date "2026-13-40" is not an ISO date/);
    expect(problems).toMatch(/budgetCents 1.5 must be a non-negative integer/);
    expect(problems).toMatch(/needs a connect objective/);
  });

  test('The Portal alignment is the official 1.3 miles between the documented end points', () => {
    const sim = createSim(THE_PORTAL, 1);
    sim.dispatch(THE_PORTAL.reference?.commands ?? []);
    const view = sim.snapshot().projects[0];
    expect(view.lengthM / 1000).toBeGreaterThan(CONSTANTS.portalRouteKm.value * 0.97);
    expect(view.lengthM / 1000).toBeLessThan(CONSTANTS.portalRouteKm.value * 1.03);
    // The line ends at the centre of the trainbox footprint in the baked data, 80 m from the doc 05 anchor (Salesforce Tower).
    const end = view.waypoints.at(-1);
    const anchor = xz(37.7897, -122.3966);
    expect(Math.hypot((end?.x ?? 0) - anchor.x, (end?.z ?? 0) - anchor.z)).toBeLessThan(100);
    expect(end?.x).toBeGreaterThan(20_600);
    expect(end?.x).toBeLessThan(20_700);
    // Cut-and-cover under Townsend, mined through the two curves, a cut-and-cover throat into the trainbox.
    const methods = view.segments.map((s) => s.method);
    expect([...new Set(methods)]).toEqual(['cutAndCover', 'mined']);
    expect(methods.join(' ').replace(/(\w+)( \1)+/g, '$1')).toBe('cutAndCover mined cutAndCover');
    // Both curves are drawn as tangent polygons and check out above the limit.
    expect(view.checks.ok, view.checks.problems.join('; ')).toBe(true);
    expect(view.checks.minRadiusM).toBeGreaterThan(155);
    expect(view.checks.minRadiusM).toBeLessThan(165);
    expect(view.checks.maxGradePct).toBeLessThanOrEqual(view.checks.limits.maxGradePct);
    const mined = view.segments.filter((s) => s.method === 'mined').reduce((sum, s) => sum + s.toM - s.fromM, 0);
    // Doc 02 section 6: about 0.65 mi mined.
    expect(mined).toBeGreaterThan(950);
    expect(mined).toBeLessThan(1150);
    expect(view.stations.map((s) => s.template)).toEqual(['undergroundStandard', 'terminalFitOut']);
    expect(view.comparison.ridersPerDay).toBeGreaterThan(20_000);
    expect(view.comparison.ridersPerDay).toBeLessThan(40_000);
  });

  test.each(SCENARIOS.map((s) => [s.id, s] as const))('%s runs 1,000 ticks headlessly and deterministically', (_id, scenario) => {
    const run = (): GameSim => {
      const sim = createSim(scenario, 2026);
      if (scenario.reference) sim.dispatch(scenario.reference.commands);
      else {
        // Free build: a short twin-bore line between downtown San Francisco zones.
        const a = xz(37.776, -122.395);
        const b = xz(37.791, -122.399);
        sim.dispatch([
          {
            t: 'setAlignment',
            projectId: 'free',
            waypoints: [
              { ...a, y: -20 },
              { ...b, y: -20 },
            ],
          },
          { t: 'addStation', projectId: 'free', name: 'South', template: 'undergroundStandard', chainageM: 0 },
          { t: 'addStation', projectId: 'free', name: 'North', template: 'undergroundStandard', at: b },
          { t: 'enactReform', id: 'inHouseEngineering' },
        ]);
      }
      sim.run(1000, (s) => autopilotCommands(s.state));
      return sim;
    };
    const sim = run();
    const snap = sim.snapshot();
    expect(snap.tick).toBe(1000);
    expect(snap.notices).toEqual([]);
    expect(snap.projects.length).toBe(1);
    expect(snap.projects[0].status).toBe('active');
    expect(snap.ledger.totalSpentCents).toBeGreaterThan(0);
    expect(snap.projects[0].comparison.ratio).toBeGreaterThan(1);
    expect(snap.objectives.length).toBe(scenario.objectives.length);
    expect(run().hash()).toBe(sim.hash());
    // And the reference project can be carried through to opening.
    if (scenario.reference) {
      const full = createSim(scenario, 2026, null, { events: false });
      expect(playReference(full, scenario, MAX_TICKS).opened).toBe(true);
      expect(full.snapshot().objectives.find((o) => o.id === 'connect')?.status).toBe('done');
    }
  });

  test('free build starts with money and political capital for anything', () => {
    const sim = createSim(SANDBOX, 1);
    // Enact in dependency order: a pass over the tree per round until nothing is left.
    for (let round = 0; round < 5; round++) {
      const todo = sim.snapshot().reforms.filter((r) => r.status === 'available' && !r.beyondPoland);
      sim.dispatch(todo.map((r) => ({ t: 'enactReform' as const, id: r.id })));
    }
    expect(sim.snapshot().notices).toEqual([]);
    // Everything Polish practice has, except the Polish price level: that is not on the tree.
    expect([...sim.state.reforms].sort()).toEqual(POLAND_PROFILE.filter((id) => id !== 'polishPriceLevel').sort());
    expect(sim.snapshot().reforms.some((r) => r.id === 'polishPriceLevel')).toBe(false);
  });
});

describe('The Portal calibration', () => {
  test(`status quo plan: ${usdB(statusQuo.costCents)} and ${statusQuo.years.toFixed(1)} years (opens ${statusQuo.openDate}) against the official ${usdB(OFFICIAL_COST)} and ${OFFICIAL_YEARS.toFixed(1)} years`, () => {
    expect(Math.abs(statusQuo.costCents / OFFICIAL_COST - 1)).toBeLessThan(TOLERANCE);
    // Also within tolerance of the $7.57B figure that includes the already-built trainbox.
    expect(Math.abs(statusQuo.costCents / OFFICIAL_COST_WITH_BOX - 1)).toBeLessThan(TOLERANCE);
    expect(Math.abs(statusQuo.years / OFFICIAL_YEARS - 1)).toBeLessThan(TOLERANCE);
    expect(statusQuo.openDate.startsWith('2036')).toBe(true);
    const objectives = statusQuo.sim.snapshot().objectives;
    // The mission has its connection and the one target, and the unreformed plan misses the target on cost.
    expect(objectives.map((o) => [o.id, o.status])).toEqual([
      ['connect', 'done'],
      ['near-poland', 'failed'],
    ]);
  });

  test(`status quo with event cards, seeds 1 to 10: median ${usdB(median(withEvents.map((o) => o.costCents)))} and ${median(withEvents.map((o) => o.years)).toFixed(1)} years; worst ${usdB(Math.max(...withEvents.map((o) => o.costCents)))} and ${Math.max(...withEvents.map((o) => o.years)).toFixed(1)} years`, () => {
    for (const o of withEvents) {
      // Cost stays inside the tolerance on every seed, with every card charged in full.
      expect(Math.abs(o.costCents / OFFICIAL_COST - 1), `seed ${o.sim.state.seed} cost`).toBeLessThan(TOLERANCE);
      // Cards only ever make it later and dearer than the plan.
      expect(o.years).toBeGreaterThanOrEqual(statusQuo.years - 0.01);
      expect(o.costCents).toBeGreaterThanOrEqual(statusQuo.costCents * 0.999);
      // Lawsuits and funding reviews are not in the official schedule, and neither is the year lost when the
      // unidentified $1.15B is finally asked for (the cash call, default answer): a bad seed slips by up to a third.
      expect(o.years / OFFICIAL_YEARS, `seed ${o.sim.state.seed} years`).toBeLessThan(1.35);
    }
    expect(Math.abs(median(withEvents.map((o) => o.years)) / OFFICIAL_YEARS - 1)).toBeLessThan(TOLERANCE);
    expect(withEvents.some((o) => o.sim.state.eventLog.length > 0)).toBe(true);
  });

  test(`all reforms: ${usdM(reformed.costCents)}, ${usdM(plView.costPerKmCents)}/km, ${reformed.years.toFixed(1)} years; Warsaw M2 extensions ${usdM(WARSAW_PER_KM)}/km, Lodz tunnel ${usdM(LODZ_PER_KM)}/km; Bay Area to Poland ratio ${RATIO.toFixed(1)}x`, () => {
    // Near the Polish per-km figure: between the Lodz tunnel and 25 percent above the Warsaw M2 extensions
    // (the run is spent in 2027 to 2032 dollars; the Polish figures are 2026 money).
    expect(plView.costPerKmCents).toBeGreaterThan(LODZ_PER_KM);
    expect(plView.costPerKmCents).toBeLessThan(WARSAW_PER_KM * 1.25);
    // Owner's headline: roughly 12x to 24x, expected about 20x.
    expect(RATIO).toBeGreaterThan(12);
    expect(RATIO).toBeLessThan(24);
    expect(Math.abs(RATIO - 20)).toBeLessThan(3);
    // Polish contract-to-opening for tunnel sections is 57 to 76 months (doc 11 section 5.3); this run also finishes permitting first.
    expect(reformed.years).toBeGreaterThan(4.5);
    expect(reformed.years).toBeLessThan(7);
    expect(reformed.years).toBeLessThan(statusQuo.years - 2.5);
    // The benchmark is the Polish design of the route: twin bores under ground. The official methods under Polish
    // rules come in a little under it (cut-and-cover below Townsend Street is cheaper than two bores).
    expect(plView.ratio).toBeGreaterThan(0.9);
    expect(plView.ratio).toBeLessThan(1);
    // Built as the Polish design in the Poland profile, the project is its own benchmark.
    const twin = createSim(withPolandProfile(THE_PORTAL), 1, null, { events: false });
    twin.dispatch([...(THE_PORTAL.reference?.commands ?? []), { t: 'setDesign', projectId: PORTAL_PROJECT_ID, tunnel: 'twinBore' }]);
    const twinView = twin.snapshot().projects[0].comparison;
    expect(twinView.ratio).toBeCloseTo(1, 6);
    // The live comparison shown during a status-quo game predicted the same Polish outcome.
    expect(sqView.poland.costCents).toBe(twinView.poland.costCents);
    expect(sqView.poland.yearsToOpen).toBeCloseTo(twinView.yearsToOpen, 6);
    // The Polish par per km: within a quarter of the Warsaw M2 extensions in 2026 money (it is spent in 2027 to 2032 dollars).
    expect(twinView.poland.costPerKmCents).toBeGreaterThan(WARSAW_PER_KM);
    expect(twinView.poland.costPerKmCents).toBeLessThan(WARSAW_PER_KM * 1.26);
    const objectives = reformed.sim.snapshot().objectives;
    expect(objectives.map((o) => [o.id, o.status])).toEqual([
      ['connect', 'done'],
      ['near-poland', 'done'],
    ]);
  });

  test(`the gap is a product of four visible factors: ${sqView.factors.map((f) => `${f.id} ${f.value.toFixed(2)}`).join(' x ')}, over the Polish delay ${sqView.factors[3].polandValue.toFixed(2)}`, () => {
    const [design, unit, soft, delay] = sqView.factors;
    expect((design.value * unit.value * soft.value * delay.value) / delay.polandValue / sqView.ratio).toBeCloseTo(1, 6);
    // Every factor is material, none carries the gap alone.
    for (const f of sqView.factors) {
      expect(f.value, f.id).toBeGreaterThan(1.3);
      expect(f.value, f.id).toBeLessThan(4.5);
      expect(f.contributionCents, f.id).toBeGreaterThan(0);
    }
    expect(sqView.baseCents + sqView.factors.reduce((sum, f) => sum + f.contributionCents, 0)).toBeCloseTo(sqView.costCents, -3);
    // Unit prices are themselves a product of the parts the player reforms one by one.
    const parts = Object.fromEntries(unit.parts.map((p) => [p.id, p.value]));
    expect(parts).toMatchObject({ procurement: 1.5, labour: 1.3, thirdParty: 1.2, priceLevel: 1.61 });
    // Scope at Polish prices is about the 2,600 mln PLN of doc 11 section 6.3 (civil works plus add-ons).
    const scopePln = ((sqView.baseCents / 100) * design.value * CONSTANTS.plnPerUsdNominal.value) / (1 + CONSTANTS.softFixedReformed.value);
    expect(scopePln / 2.6e9).toBeGreaterThan(0.9);
    expect(scopePln / 2.6e9).toBeLessThan(1.1);
  });
});

describe('reforms on The Portal', () => {
  // From scratch (no head start, nothing enacted), so planning reforms have something to shorten.
  const scratch: ScenarioDef = { ...THE_PORTAL, start: { ...THE_PORTAL.start, policies: [], headStart: undefined } };
  const base = playPortal(scratch, 1, false);
  const sq = profileFor([]);

  /** What each reform is documented to improve. cost and time are measured on the played project; the rest on the profile. */
  const EXPECT: Record<string, ('cost' | 'time' | 'tbmRate' | `hazard:${string}`)[]> = {
    railSpecustawa: ['time', 'cost', 'hazard:lawsuit', 'hazard:fundingGap'],
    specustawa: ['time', 'cost', 'hazard:lawsuit'],
    utilityStatute: ['time', 'cost', 'hazard:utilitySurprise'],
    inHouseEngineering: ['time', 'cost'],
    bestValueAward: ['time', 'cost', 'hazard:changeOrder', 'hazard:contractorBankruptcy'],
    roundTheClock: ['time', 'cost'],
    emergencyAward: ['time'],
    twinBoreStandard: ['cost'],
    stationCatalogue: ['time', 'cost'],
    rightMachine: ['hazard:tbmStuck', 'tbmRate'],
    prufrockClass: ['tbmRate'],
    smallBoreLoop: ['tbmRate'],
  };

  test('every reform has a documented direction', () => {
    expect(Object.keys(EXPECT).sort()).toEqual(REFORMS.map((r) => r.id).sort());
    expect(EVENTS.length).toBeGreaterThanOrEqual(5);
  });

  test.each(REFORMS.map((r) => [r.id, r.title] as const))(
    '%s (%s) alone moves cost or time the documented way and nothing the wrong way',
    (id) => {
      const one = playPortal(withStartReforms(scratch, [id]), 1, false);
      const p = profileFor([id]);
      // Nothing gets worse.
      expect(one.costCents).toBeLessThanOrEqual(base.costCents);
      expect(one.years).toBeLessThanOrEqual(base.years);
      for (const e of EVENTS) expect(p[`event.${e.id}.rate` as ProfileKey]).toBeLessThanOrEqual(sq[`event.${e.id}.rate` as ProfileKey]);
      for (const what of EXPECT[id]) {
        if (what === 'cost') expect(one.costCents / base.costCents, 'cost falls by at least 0.5 percent').toBeLessThan(0.995);
        else if (what === 'time') expect(base.years - one.years, 'opens at least a month sooner').toBeGreaterThan(1 / 12);
        else if (what === 'tbmRate')
          expect(advanceRate('boredTwin', 'bayMud', p, 1000)).toBeGreaterThan(advanceRate('boredTwin', 'bayMud', sq, 1000));
        else expect(p[`event.${what.slice(7)}.rate` as ProfileKey]).toBeLessThan(sq[`event.${what.slice(7)}.rate` as ProfileKey]);
      }
    },
  );

  test('enacting reforms mid-game by command lowers the live estimate', () => {
    const sim = createSim(THE_PORTAL, 1, null, { events: false });
    sim.dispatch([...(THE_PORTAL.reference?.commands ?? []), { t: 'approveProject', projectId: PORTAL_PROJECT_ID }]);
    const before = sim.snapshot().projects[0].comparison;
    sim.run(60);
    sim.dispatch([
      { t: 'enactReform', id: 'twinBoreStandard' },
      { t: 'enactReform', id: 'inHouseEngineering' },
    ]);
    expect(sim.snapshot().notices).toEqual([]);
    const after = sim.snapshot().projects[0].comparison;
    expect(after.costCents).toBeLessThan(before.costCents * 0.85);
    expect(after.ratio).toBeLessThan(before.ratio);
    expect(after.factors[0].value).toBeLessThan(before.factors[0].value);
    expect(after.factors[2].value).toBeLessThan(before.factors[2].value);
    // The Polish benchmark does not move.
    expect(after.poland.costCents).toBe(before.poland.costCents);
    // Above PC_MONTHLY_CAP the monthly mandate adds nothing: the starting 200 only go down in these two months.
    expect(sim.snapshot().politicalCapital).toBe(THE_PORTAL.start.politicalCapital - 40 - 40);
    // The tunnel reform redrew the approved line as twin bore.
    expect(sim.snapshot().projects[0].design.tunnel).toBe('twinBore');
  });
});

describe('The Portal determinism and saves', () => {
  test('same seed and commands give the same state hash; a different seed does not', () => {
    const a = playPortal(THE_PORTAL, 77, true);
    const b = playPortal(THE_PORTAL, 77, true);
    const c = playPortal(THE_PORTAL, 78, true);
    expect(a.sim.hash()).toBe(b.sim.hash());
    expect(a.sim.state.tick).toBe(b.sim.state.tick);
    expect(a.sim.hash()).not.toBe(c.sim.hash());
  });

  test('save, load and continue gives the same hash as the uninterrupted game', () => {
    const drive = (sim: GameSim, ticks: number) => sim.run(ticks, (s) => autopilotCommands(s.state));
    const whole = createSim(THE_PORTAL, 5);
    whole.dispatch(THE_PORTAL.reference?.commands ?? []);
    drive(whole, 4000);
    const first = createSim(THE_PORTAL, 5);
    first.dispatch(THE_PORTAL.reference?.commands ?? []);
    drive(first, 2600);
    expect(first.state.projects[0].phase).toBe('construction');
    const resumed = loadSim(JSON.parse(JSON.stringify(first.save())));
    drive(resumed, 1400);
    expect(resumed.hash()).toBe(whole.hash());
    expect(resumed.snapshot().projects[0].comparison.costCents).toBe(whole.snapshot().projects[0].comparison.costCents);
  });
});

describe('The Portal carve edits', () => {
  test.each([
    ['status quo: cut-and-cover, mined cavern, cut-and-cover', THE_PORTAL],
    ['Poland profile: compact boxes and a twin-bore TBM drive', withPolandProfile(THE_PORTAL)],
  ] as const)('%s cover the alignment without gaps', (_label, scenario) => {
    const edits: WorldEdit[] = [];
    const { sim } = playPortal(scenario, 3, false, { applyEdit: (e) => edits.push(e) });
    const p = sim.state.projects[0];
    const flags = p.frozen;
    if (!flags) throw new Error('design was never frozen');
    const capsules = edits.filter((e) => e.t === 'carveCapsule');
    expect(capsules.length).toBeGreaterThan(100);
    const vox = (q: { x: number; y: number; z: number }) => `${Math.floor(q.x)},${Math.floor(q.y)},${Math.floor(q.z)}`;
    const key = (q: { x: number; y: number; z: number }) => `${q.x},${q.y},${q.z}`;
    // Fronts tile the whole alignment.
    expect(p.fronts[0].fromM).toBe(0);
    expect(p.fronts.at(-1)?.toM).toBe(p.cum[p.cum.length - 1]);
    for (let i = 1; i < p.fronts.length; i++) expect(p.fronts[i].fromM).toBe(p.fronts[i - 1].toM);
    for (const front of p.fronts) {
      const shape = carveShape(front.method, flags);
      expect(shape.radiusM, front.name).toBeGreaterThan(3);
      for (const lateral of shape.laterals) {
        let at = vox(offsetPointAt(p.waypoints, p.cum, front.fromM, lateral));
        const end = vox(offsetPointAt(p.waypoints, p.cum, front.toM, lateral));
        let links = 0;
        for (const e of capsules) {
          if (e.t !== 'carveCapsule' || e.radius !== shape.radiusM || key(e.a) !== at) continue;
          // Each capsule is shorter than a day of the fastest heading plus rounding: no long jumps.
          expect(Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z)).toBeLessThan(40);
          at = key(e.b);
          links++;
          if (at === end) break;
        }
        expect(at, `${front.name} lateral ${lateral}: ${links} linked capsules reach the end of the run`).toBe(end);
      }
    }
    if (scenario.costProfile === 'polishBaseline') {
      expect(p.fronts.map((f) => f.method)).toEqual(['cutAndCover', 'boredTwin', 'cutAndCover']);
      expect(p.fronts[1].name).toMatch(/^TBM /);
    } else {
      expect(p.fronts.map((f) => f.method)).toEqual(['cutAndCover', 'mined', 'cutAndCover']);
    }
  });
});
