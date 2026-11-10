/**
 * M2: the Portal's 2x Poland target, the Silicon branch and the cost-benefit table, on the shipped scenarios.
 * The ratios in the test names are measured by the scripted runs below (seed 1, event cards off unless said).
 */
import { createSim, type GameCommand, type GameSnapshot, type PolandTarget, REFORMS, type ScenarioDef } from '@bayvox/sim';
import { describe, expect, test } from 'vitest';
import { BAKED_SITES, BAKED_STATIONS } from './baked-anchors.ts';
import {
  BENEFIT_DAYS_PER_YEAR,
  BENEFIT_PRESENT_VALUE_YEARS,
  BENEFIT_USD_PER_TRIP,
  costBenefit,
  playMission,
  SCENARIOS,
  SILICON_BRANCH,
  SILICON_PROJECT_ID,
  scenarioById,
  THE_PORTAL,
} from './index.ts';

const EM_DASH = String.fromCharCode(0x2014);

/** Reforms that fix the design and the contract prices: they have to be in force at tender. */
const BEFORE_TENDER = [
  'twoTracks',
  'twinBoreStandard',
  'noMezzanines',
  'shallowBoxes',
  'bestValueAward',
  'inHouseEngineering',
  'itemizedContracts',
  'openTenders',
  'roundTheClock',
  'leanSupervision',
  'utilityStatute',
  'stationCatalogue',
  'rightSizeTerminal',
  'masterPermitting',
];
const AFTER_TENDER = ['stageGates', 'payBands', 'importSupplyChain', 'potholeFirst'];
const FAST = ['parallelWorks', 'emergencyAward'];

interface Played {
  target: PolandTarget;
  snap: GameSnapshot;
}

/** Plays a mission buying the first affordable reform of `order` each frame and choosing the Polish design once it is unlocked. */
function play(scenario: ScenarioDef, order: readonly string[], events = false, seed = 1): Played {
  const sim = createSim(scenario, seed, null, { events });
  const run = playMission(sim, {
    each: (snap) => {
      const out: GameCommand[] = [];
      for (const id of order) {
        const r = snap.reforms.find((x) => x.id === id);
        if (r && r.status !== 'enacted' && r.affordable) {
          out.push({ t: 'enactReform', id });
          break;
        }
      }
      const p = snap.projects[0];
      if (p && !p.designFrozen) {
        for (const o of p.design.options) {
          if ((o.id !== 'twinBore' && o.id !== 'compactBox') || o.selected || o.lockedBy.length > 0) continue;
          out.push(
            o.group === 'tunnel'
              ? { t: 'setDesign', projectId: p.id, tunnel: 'twinBore' }
              : { t: 'setDesign', projectId: p.id, stationBox: 'compactBox' },
          );
        }
      }
      return out;
    },
  });
  expect(run.complete, scenario.id).toBe(true);
  const snap = sim.snapshot();
  expect(snap.notices, scenario.id).toEqual([]);
  const target = snap.projects[0].scorecard.polandTarget;
  if (!target) throw new Error(`${scenario.id}: no polandTarget on the scorecard`);
  expect(snap.projects[0].scorecard.final).toBe(true);
  return { target, snap };
}

const x = (r: number) => `${r.toFixed(2)}x`;

describe('The Portal: a train to the authors of Fable 5.2, at no more than 2x Poland', () => {
  const idle = play(THE_PORTAL, []);
  const careful = play(THE_PORTAL, [...BEFORE_TENDER, ...AFTER_TENDER]);
  const zone = play(THE_PORTAL, ['specustawa', ...BEFORE_TENDER, ...AFTER_TENDER, ...FAST]);
  const careless = play(
    THE_PORTAL,
    REFORMS.map((r) => r.id),
  );

  test('the theme and the target are stated up front; ids, the official figures and the place names are the real ones', () => {
    expect(THE_PORTAL.id).toBe('the-portal');
    expect(THE_PORTAL.title).toBe('The Portal');
    expect(THE_PORTAL.description).toMatch(/Can you build a train to the HQ of the authors of Fable 5\.2\?/);
    expect(THE_PORTAL.description).toMatch(/at most 2x Poland on cost and on time/);
    expect(THE_PORTAL.briefing?.what).toMatch(/fictional/);
    expect(THE_PORTAL.briefing?.what).toMatch(/2x the Polish cost and 2x the Polish timeline/);
    expect(THE_PORTAL.briefing?.officialCost).toMatch(/\$6\.84 billion/);
    expect(THE_PORTAL.reference?.officialCostCents).toBe(6.84e11);
    expect(THE_PORTAL.objectives.map((o) => o.id)).toEqual([
      'connect',
      'official-budget',
      'official-date',
      'under-2b',
      'early',
      'near-poland',
    ]);
    const cost = THE_PORTAL.objectives.find((o) => o.id === 'near-poland');
    expect(cost).toMatchObject({ kind: 'maxRatioToPoland', ratio: 2 });
    expect(THE_PORTAL.objectives[0].title).toMatch(/authors of Fable 5\.2/);
    const connect = THE_PORTAL.objectives[0];
    if (connect.kind !== 'connect') throw new Error('first objective is not the connection');
    expect(connect.b.name).toBe('Salesforce Transit Center');
  });

  test(`with no reform the status quo ends at ${x(idle.target.costRatio)} Poland on cost and ${x(idle.target.timeRatio)} on time: the target is missed on cost`, () => {
    expect(idle.target.costRatio).toBeGreaterThan(10);
    expect(idle.target.met).toBe(false);
    expect(idle.snap.socialPosts).toEqual([]);
  });

  test(`a careful player without the new options ends at ${x(careful.target.costRatio)} and ${x(careful.target.timeRatio)}; with the specustawa first at ${x(zone.target.costRatio)} and ${x(zone.target.timeRatio)}: both meet 2x`, () => {
    expect(careful.target.met).toBe(true);
    expect(zone.target.met).toBe(true);
    expect(zone.target.costRatio).toBeLessThanOrEqual(2);
    expect(zone.target.timeRatio).toBeLessThanOrEqual(2);
    // The zone buys time, and pays for it with the capital that would have bought cheaper contracts.
    expect(zone.target.timeRatio).toBeLessThan(careful.target.timeRatio - 0.1);
    expect(zone.target.timeRatio).toBeLessThan(1);
    expect(zone.target.costRatio).toBeGreaterThan(careful.target.costRatio);
    // The objective of the briefing and the scorecard agree.
    expect(zone.snap.objectives.find((o) => o.id === 'near-poland')?.status).toBe('done');
    expect(idle.snap.objectives.find((o) => o.id === 'near-poland')?.status).toBe('failed');
    // Every reform bought with capital drew a post.
    expect(zone.snap.socialPosts?.length).toBe(20);
    expect(zone.snap.socialPosts?.some((p) => p.cause === 'reform:specustawa') || (zone.snap.socialPosts?.[0].id ?? 0) > 1).toBe(true);
  });

  test(`buying down the tree in list order ends at ${x(careless.target.costRatio)} on cost: the capital does not win by itself`, () => {
    expect(careless.target.met).toBe(false);
    expect(careless.target.costRatio).toBeGreaterThan(3);
  });

  test('with event cards on, the unreformed project runs at about 2x Poland on time (seeds 1 and 2: 1.96x and 2.22x); in the zone it does not', () => {
    // Measured over seeds 1 to 5: 1.96x, 2.22x, 1.75x, 1.96x, 2.09x. A lawsuit or a cash call is a year each.
    const idleTimes = [1, 2].map((seed) => play(THE_PORTAL, [], true, seed).target.timeRatio);
    expect(Math.min(...idleTimes)).toBeGreaterThan(1.9);
    expect(Math.max(...idleTimes)).toBeGreaterThan(2);
    const t = play(THE_PORTAL, ['specustawa', ...BEFORE_TENDER, ...AFTER_TENDER, ...FAST], true, 2).target;
    expect(t.timeRatio).toBeLessThan(1);
    expect(t.met).toBe(true);
  });
});

describe('Silicon branch: Caltrain to Meta and Google in one line', () => {
  const sim = createSim(SILICON_BRANCH, 1, null, { events: false });
  sim.dispatch([{ t: 'useOfficialPlan' }]);
  const view = sim.snapshot().projects[0];

  test('the id of the shared contract, a baked site, and a reference that passes the alignment checks', () => {
    expect(SILICON_BRANCH.id).toBe('siliconBranch');
    expect(scenarioById('siliconBranch')).toBe(SILICON_BRANCH);
    // Between the missions of round 2: the mission after The Portal and the last mission are the ones they were.
    expect(SCENARIOS.indexOf(SILICON_BRANCH)).toBe(3);
    expect(Object.keys(BAKED_SITES)).toContain(SILICON_BRANCH.siteId);
    expect(view.id).toBe(SILICON_PROJECT_ID);
    expect(view.checks.ok, view.checks.problems.join('; ')).toBe(true);
    expect(sim.snapshot().notices).toEqual([]);
    for (const text of [SILICON_BRANCH.description, ...Object.values(SILICON_BRANCH.briefing ?? {})])
      expect(text.includes(EM_DASH)).toBe(false);
    expect(SILICON_BRANCH.briefing?.what).toMatch(/fictional/i);
  });

  test('it leaves Caltrain at Redwood City, calls at Meta and ends under the Googleplex, inside the googleplex voxel site', () => {
    const wps = view.alignment.points;
    const rwc = BAKED_STATIONS.redwoodCity;
    expect(Math.hypot(wps[0].x - rwc.x, wps[0].z - rwc.z)).toBeLessThan(1);
    const site = BAKED_SITES.googleplex;
    const last = wps[wps.length - 1];
    expect(last.x).toBeGreaterThan(site.minX);
    expect(last.x).toBeLessThan(site.maxX);
    expect(last.z).toBeGreaterThan(site.minZ);
    expect(last.z).toBeLessThan(site.maxZ);
    // The Dumbarton leg passes through the meta site on the way.
    const meta = BAKED_SITES.meta;
    expect(wps.some((w) => w.x > meta.minX && w.x < meta.maxX && w.z > meta.minZ && w.z < meta.maxZ)).toBe(true);
    expect(view.stations.map((s) => s.name)).toEqual(['Redwood City', 'Willow Road (Meta)', 'East Palo Alto', 'Googleplex']);
    // Surface track, a viaduct, and a twin bore at the end: there is a machine to drive on the voxels.
    expect(view.lengthM).toBeGreaterThan(15_000);
    expect(view.lengthM).toBeLessThan(19_000);
    const methods = SILICON_BRANCH.reference?.commands[0];
    if (methods?.t !== 'setAlignment' || !methods.methods) throw new Error('no reference alignment');
    expect(new Set(methods.methods)).toEqual(new Set(['atGrade', 'viaduct', 'cutAndCover', 'boredTwin']));
    expect(methods.methods.at(-1)).toBe('boredTwin');
    expect(sim.snapshot().mission.targets.map((t) => t.name)).toEqual(['Redwood City Caltrain', 'Meta, Menlo Park', 'Googleplex']);
  });

  const idle = play(SILICON_BRANCH, []);
  const zone = play(SILICON_BRANCH, ['specustawa', ...BEFORE_TENDER, ...AFTER_TENDER]);

  test(`it plays to the end and serves both campuses; from nothing the status quo takes ${x(idle.target.timeRatio)} Poland's time, in the zone ${x(zone.target.timeRatio)}`, () => {
    for (const run of [idle, zone]) {
      expect(run.snap.mission.complete).toBe(true);
      expect(run.snap.objectives.find((o) => o.id === 'connect')?.status).toBe('done');
      expect(run.snap.objectives.find((o) => o.id === 'connect-google')?.status).toBe('done');
      expect(run.snap.services).toHaveLength(1);
    }
    // No head start here: planning and permits are years, and the specustawa is what takes them out.
    expect(idle.target.timeRatio).toBeGreaterThan(2);
    expect(zone.target.timeRatio).toBeLessThan(1.2);
    expect(zone.snap.ridersPerDay).toBeGreaterThan(5000);
  });
});

describe('cost-benefit comparison of the missions', () => {
  const rows = costBenefit();

  test('one row per mission with a reference plan, in list order, computed once', () => {
    expect(rows.map((r) => r.scenarioId)).toEqual([
      'the-portal',
      'googleplex-spur',
      'dumbarton-to-meta',
      'siliconBranch',
      'oracle-shuttle',
    ]);
    expect(costBenefit()).toBe(rows);
    for (const r of rows) {
      expect(r.name).toBe(scenarioById(r.scenarioId).title);
      expect(Number.isSafeInteger(r.polandCostCents), r.scenarioId).toBe(true);
      expect(Number.isSafeInteger(r.officialCostCents), r.scenarioId).toBe(true);
      expect(r.officialCostCents).toBeGreaterThan(r.polandCostCents);
      expect(r.lengthKm).toBeGreaterThan(1);
      expect(r.dailyRiders).toBeGreaterThan(0);
    }
  });

  test('every figure is the one the sim shows for the reference plan', () => {
    for (const r of rows) {
      const s = scenarioById(r.scenarioId);
      const sim = createSim(s, 1, null, { events: false });
      sim.dispatch([{ t: 'useOfficialPlan' }]);
      const p = sim.snapshot().projects[0];
      expect(r.lengthKm).toBe(p.receipt.columns.yours.lengthKm);
      expect(r.polandCostCents).toBe(p.receipt.columns.poland.costCents);
      expect(r.dailyRiders).toBe(p.scorecard.ridersPerDay);
      expect(r.polandCostPerRiderUsd).toBe(Math.round(r.polandCostCents / r.dailyRiders / 100));
      expect(r.officialIsModel).toBe(s.reference?.officialCostCents === undefined);
      if (r.officialIsModel) expect(r.officialCostCents).toBe(p.receipt.columns.statusQuo.costCents);
      const benefit = r.dailyRiders * BENEFIT_DAYS_PER_YEAR * BENEFIT_USD_PER_TRIP * 100 * BENEFIT_PRESENT_VALUE_YEARS;
      expect(r.benefitCostRatio).toBeCloseTo(benefit / r.polandCostCents, 9);
      expect(r.officialBenefitCostRatio).toBeCloseTo(benefit / r.officialCostCents, 9);
    }
  });

  test('the sponsor figures are the real ones: The Portal in full, Dumbarton by its own cost per km', () => {
    const portal = rows[0];
    expect(portal.officialCostCents).toBe(6.84e11);
    expect(portal.officialIsModel).toBe(false);
    const dumbarton = rows[2];
    // $1.6B for 33 km is $48.5M per km; the mission builds 7.5 km of it.
    expect(dumbarton.officialCostCents / dumbarton.lengthKm / 1e8).toBeCloseTo(1600 / 33, 1);
    // At Polish prices The Portal and the surface line on the Dumbarton tracks pay for themselves; no line does at official prices.
    expect(portal.benefitCostRatio).toBeGreaterThan(1);
    expect(dumbarton.benefitCostRatio).toBeGreaterThan(1);
    for (const r of rows) expect(r.officialBenefitCostRatio, r.scenarioId).toBeLessThan(1);
  });
});
