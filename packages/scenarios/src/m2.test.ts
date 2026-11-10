/**
 * M2: the Portal's 2x Poland target, the Silicon branch and the cost-benefit table, on the shipped scenarios.
 * The ratios in the test names are measured by the scripted runs below (seed 1, event cards off unless said).
 */
import { CONSTANTS, createSim, type GameCommand, type GameSnapshot, type PolandTarget, type ScenarioDef } from '@bayvox/sim';
import { describe, expect, test } from 'vitest';
import { BAKED_SITES, BAKED_STATIONS } from './baked-anchors.ts';
import {
  BENEFIT_DAYS_PER_YEAR,
  BENEFIT_PRESENT_VALUE_YEARS,
  BENEFIT_USD_PER_TRIP,
  costBenefit,
  DUMBARTON_TO_META,
  GOOGLEPLEX_SPUR,
  playMission,
  SCENARIOS,
  SILICON_BRANCH,
  SILICON_PROJECT_ID,
  scenarioById,
  THE_PORTAL,
} from './index.ts';

const EM_DASH = String.fromCharCode(0x2014);

/**
 * The order of the Reforms sheet on a line that starts from nothing (biggest saving first), behind the specustawa.
 * The measured runs of every mission against the 2x target are in m3.test.ts.
 */
const ZONE_FIRST = [
  'specustawa',
  'twinBoreStandard',
  'bestValueAward',
  'inHouseEngineering',
  'utilityStatute',
  'roundTheClock',
  'stationCatalogue',
  'emergencyAward',
];

interface Played {
  target: PolandTarget;
  snap: GameSnapshot;
}

/** Plays a mission buying the first affordable reform of `order` each frame. No design command is sent: the tunnel reform picks the twin bore. */
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
  const zone = play(THE_PORTAL, ZONE_FIRST);

  test('the theme and the target are stated up front; ids, the official figures and the place names are the real ones', () => {
    expect(THE_PORTAL.id).toBe('the-portal');
    expect(THE_PORTAL.title).toBe('The Portal');
    // The tagline and the target stand on the title and the briefing screens (ui); the pitch is one line under them.
    expect(THE_PORTAL.description).toMatch(/Official plan: \$6\.84B, 2036/);
    expect(THE_PORTAL.briefing?.what).toMatch(/authors of Fable 5\.2/);
    expect(THE_PORTAL.briefing?.what).toMatch(/fictional/);
    expect(THE_PORTAL.briefing?.officialCost).toMatch(/\$6\.84 billion/);
    expect(THE_PORTAL.reference?.officialCostCents).toBe(6.84e11);
    expect(THE_PORTAL.objectives.map((o) => o.id)).toEqual(['connect', 'near-poland']);
    const target = THE_PORTAL.objectives.find((o) => o.id === 'near-poland');
    expect(target).toMatchObject({ kind: 'maxRatioToPoland', ratio: 2, title: 'Get within 2x Poland on cost and time' });
    expect(THE_PORTAL.objectives[0].title).toMatch(/Salesforce Transit Center/);
    const connect = THE_PORTAL.objectives[0];
    if (connect.kind !== 'connect') throw new Error('first objective is not the connection');
    expect(connect.b.name).toBe('Salesforce Transit Center');
  });

  test(`with no reform the status quo ends at ${x(idle.target.costRatio)} Poland on cost and ${x(idle.target.timeRatio)} on time: the target is missed on cost`, () => {
    expect(idle.target.costRatio).toBeGreaterThan(10);
    expect(idle.target.met).toBe(false);
    expect(idle.snap.socialPosts).toEqual([]);
  });

  test(`with the specustawa bought first the line ends at ${x(zone.target.costRatio)} on cost and ${x(zone.target.timeRatio)} on time: the zone buys time with the capital the cheaper contracts needed`, () => {
    expect(zone.target.timeRatio).toBeLessThan(1);
    expect(zone.target.timeRatio).toBeLessThan(idle.target.timeRatio - 0.5);
    expect(zone.target.costRatio).toBeLessThan(idle.target.costRatio / 4);
    // 60 of the 200 went on the zone, so one of the six reforms that cut the cost was not in force at tender.
    expect(zone.target.costRatio).toBeGreaterThan(2);
    expect(zone.snap.projects[0].scorecard.stars).toBe(2);
    // The objective of the briefing and the scorecard agree.
    expect(zone.snap.objectives.find((o) => o.id === 'near-poland')?.status).toBe('failed');
    expect(idle.snap.objectives.find((o) => o.id === 'near-poland')?.status).toBe('failed');
    // Every reform bought drew a pile-on, the specustawa first.
    expect(zone.snap.socialPosts?.[0]).toMatchObject({ id: 1, cause: 'reform:specustawa' });
    expect(new Set(zone.snap.socialPosts?.map((p) => p.burst)).size).toBe(zone.snap.reforms.filter((r) => r.status === 'enacted').length);
    // The tunnel reform redrew the official design as twin bore with no design command sent.
    expect(zone.snap.projects[0].design.tunnel).toBe('twinBore');
  });

  test('with event cards on, the unreformed project runs at about 2x Poland on time (seeds 1 and 2: 1.96x and 2.22x); in the zone it does not', () => {
    // Measured over seeds 1 to 5: 1.96x, 2.22x, 1.75x, 1.96x, 2.09x. A lawsuit or a cash call is a year each.
    const idleTimes = [1, 2].map((seed) => play(THE_PORTAL, [], true, seed).target.timeRatio);
    expect(Math.min(...idleTimes)).toBeGreaterThan(1.9);
    expect(Math.max(...idleTimes)).toBeGreaterThan(2);
    const t = play(THE_PORTAL, ZONE_FIRST, true, 2).target;
    expect(t.timeRatio).toBeLessThan(1);
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
    expect(view.stations.map((s) => s.name)).toEqual([
      'Redwood City',
      'North Fair Oaks (Marsh Road)',
      'Willow Road (Meta)',
      'East Palo Alto',
      'Googleplex',
    ]);
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
  const zone = play(SILICON_BRANCH, ZONE_FIRST);

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
    // Riders are information on the card, not a condition: the line carries them all the same.
    expect(zone.snap.ridersPerDay).toBeGreaterThan(5000);
    expect(SILICON_BRANCH.objectives.map((o) => o.id)).toEqual(['connect', 'connect-google', 'near-poland']);
  });
});

describe('cost-benefit comparison of the missions', () => {
  const rows = costBenefit();

  test('one row per mission with a reference plan, in list order, computed once', () => {
    expect(rows.map((r) => r.scenarioId)).toEqual(['the-portal', 'googleplex-spur', 'dumbarton-to-meta', 'siliconBranch']);
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

describe('housing that justifies the campus lines', () => {
  const rows = costBenefit();
  const TRIPS = CONSTANTS.housingTripsPerHome.value * CONSTANTS.housingTransitShare.value;

  test('the three campus missions offer options, the salt works on both lines that pass it; The Portal and free build offer none', () => {
    const ids = (id: string) => (scenarioById(id).housing ?? []).map((o) => o.id);
    expect(ids('googleplex-spur')).toEqual(['northBayshore', 'sanAntonioCenter']);
    expect(ids('dumbarton-to-meta')).toEqual(['saltWorks', 'metaBayfront']);
    expect(ids('siliconBranch')).toEqual(['saltWorks', 'metaBayfront', 'northBayshore']);
    expect(ids('the-portal')).toEqual([]);
    expect(ids('sandbox')).toEqual([]);
    for (const s of SCENARIOS)
      for (const o of s.housing ?? []) {
        expect(o.capitalCost, o.id).toBeGreaterThan(0);
        // Every number on the card is marked as what it is.
        expect(o.source, o.id).toMatch(/ASSUMPTION/);
        expect(o.source, o.id).toMatch(/UNVERIFIED/);
        expect(`${o.title} ${o.blurb} ${o.source}`.includes(EM_DASH), o.id).toBe(false);
      }
    const salt = scenarioById('dumbarton-to-meta').housing?.[0];
    expect(salt?.title).toBe('Build on the Redwood City salt works');
    expect((salt?.hectares ?? 0) * (salt?.homesPerHectare ?? 0)).toBe(12_000);
  });

  test.each([GOOGLEPLEX_SPUR, DUMBARTON_TO_META, SILICON_BRANCH].map((s) => [s.id, s] as const))(
    '%s: every option is within reach of a station of the reference plan and adds homes x 0.9 riders',
    (_id, s) => {
      const options = s.housing ?? [];
      const sim = createSim({ ...s, start: { ...s.start, politicalCapital: 500 } }, 1, null, { events: false });
      sim.dispatch([{ t: 'useOfficialPlan' }]);
      let riders = sim.snapshot().projects[0].scorecard.ridersPerDay;
      let homes = 0;
      let capital = 500;
      for (const o of options) {
        sim.dispatch([{ t: 'enactHousing', optionId: o.id }]);
        const snap = sim.snapshot();
        expect(snap.notices).toEqual([]);
        const added = Math.round(o.hectares * o.homesPerHectare * TRIPS);
        homes += o.hectares * o.homesPerHectare;
        riders += added;
        capital -= o.capitalCost;
        expect(snap.projects[0].scorecard.ridersPerDay, o.id).toBe(riders);
        expect(snap.projects[0].scorecard.housing, o.id).toEqual({
          homes,
          ridersPerDayAdded: riders - (rows.find((r) => r.scenarioId === s.id)?.dailyRiders ?? 0),
        });
        expect(snap.politicalCapital).toBe(capital);
        expect(snap.socialPosts?.at(-1)?.cause).toBe(`housing:${o.id}`);
      }
      expect(sim.snapshot().housing?.every((o) => o.enacted)).toBe(true);
    },
  );

  test('the cost-benefit table carries the plan with every option enacted: same cost, more riders, a higher ratio', () => {
    expect(rows[0].withHousing).toBeUndefined();
    for (const r of rows.slice(1)) {
      const h = r.withHousing;
      if (!h) throw new Error(`${r.scenarioId} has no withHousing`);
      const options = scenarioById(r.scenarioId).housing ?? [];
      expect(h.homes).toBe(options.reduce((n, o) => n + o.hectares * o.homesPerHectare, 0));
      expect(h.dailyRiders).toBe(r.dailyRiders + options.reduce((n, o) => n + Math.round(o.hectares * o.homesPerHectare * TRIPS), 0));
      const benefit = h.dailyRiders * BENEFIT_DAYS_PER_YEAR * BENEFIT_USD_PER_TRIP * 100 * BENEFIT_PRESENT_VALUE_YEARS;
      expect(h.benefitCostRatio).toBeCloseTo(benefit / r.polandCostCents, 9);
      expect(h.benefitCostRatio).toBeGreaterThan(r.benefitCostRatio);
    }
    // What the homes change: the Googleplex spur and the Silicon branch do not pay for themselves at Polish prices
    // without them and do with them.
    const [, spur, dumbarton, silicon] = rows;
    expect(spur.benefitCostRatio).toBeLessThan(1);
    expect(spur.withHousing?.benefitCostRatio).toBeGreaterThan(1);
    expect(silicon.benefitCostRatio).toBeLessThan(1);
    expect(silicon.withHousing?.benefitCostRatio).toBeGreaterThan(1);
    expect(dumbarton.withHousing?.benefitCostRatio).toBeGreaterThan(5);
    // The spur alone carries under 2,500 riders; one option lifts it over. Information on the card, not an objective.
    expect(spur.dailyRiders).toBeLessThan(2500);
    expect(spur.dailyRiders + Math.round(3000 * TRIPS)).toBeGreaterThan(2500);
    expect(GOOGLEPLEX_SPUR.objectives.some((o) => o.kind === 'minRiders')).toBe(false);
  });

  test('the Googleplex spur from San Antonio is shorter and cheaper than the old one from Mountain View (4.28 km, $0.805B in Poland)', () => {
    const spur = rows[1];
    expect(spur.lengthKm).toBeGreaterThan(2.5);
    expect(spur.lengthKm).toBeLessThan(2.65);
    expect(spur.polandCostCents).toBeLessThan(0.805e11 * 0.7);
    expect(GOOGLEPLEX_SPUR.briefing?.what).toMatch(/2\.6 km/);
    expect(`${GOOGLEPLEX_SPUR.description} ${Object.values(GOOGLEPLEX_SPUR.briefing ?? {}).join(' ')}`).not.toMatch(
      /Mountain View Caltrain|4\.3 km/,
    );
    expect(GOOGLEPLEX_SPUR.objectives[0].title).toBe('Connect San Antonio Caltrain to the Googleplex');
  });

  test('the small bore on the Googleplex spur: a fraction of the tunnel cost, and 60 percent of the riders, homes or no homes', () => {
    const sim = createSim({ ...GOOGLEPLEX_SPUR, start: { ...GOOGLEPLEX_SPUR.start, politicalCapital: 500, budgetCents: 1e12 } }, 1, null, {
      events: false,
    });
    sim.dispatch([{ t: 'useOfficialPlan' }]);
    const rail = sim.snapshot().projects[0];
    sim.dispatch([{ t: 'enactReform', id: 'smallBoreLoop' }]);
    const pods = sim.snapshot().projects[0];
    expect(sim.snapshot().notices).toEqual([]);
    expect(pods.receipt.columns.yours.costCents).toBeLessThan(rail.receipt.columns.yours.costCents * 0.8);
    expect(pods.scorecard.yours.yearsToOpen).toBeLessThanOrEqual(rail.scorecard.yours.yearsToOpen);
    expect(pods.scorecard.ridersPerDay).toBe(Math.round(rail.scorecard.ridersPerDay * CONSTANTS.smallBoreRiderShare.value));
    sim.dispatch([
      { t: 'enactHousing', optionId: 'northBayshore' },
      { t: 'enactHousing', optionId: 'sanAntonioCenter' },
    ]);
    // 13,147 riders on the railway with both options; the pods keep 7,888 of them, just under the 8,000 the tube carries.
    const all = rows[1].withHousing?.dailyRiders ?? 0;
    const kept = sim.snapshot().projects[0].scorecard.ridersPerDay;
    expect(kept).toBe(Math.min(CONSTANTS.smallBoreRidersPerDay.value, Math.round(all * CONSTANTS.smallBoreRiderShare.value)));
    expect(kept).toBeLessThan(all * 0.61);
  });
});
