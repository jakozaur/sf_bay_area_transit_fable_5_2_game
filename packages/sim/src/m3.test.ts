/**
 * M3 (owner decisions, 2026-11-10): one number to beat, twelve reforms instead of 32, one step to the twin bore.
 * The profile values below were recorded from the 32-node tree before it was merged.
 */
import type { SaveFile } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { autopilotCommands } from './engine.ts';
import { polandTargetOf, starsOf } from './receipt.ts';
import { migrateReformIds, POLAND_PROFILE, type Profile, profileFor, REFORM_MIGRATION, REFORMS, STATUS_QUO_PROFILE } from './reforms.ts';
import { createSim, type GameSim, hashState, loadSim } from './sim.ts';
import { TEST_DESIGN, TEST_PROJECT, testScenario } from './test-scenario.ts';
import type { PolandTarget, ScoreColumn, SimState } from './types.ts';

/** The 32 reform ids of the M2 tree, in tree order. */
const OLD_IDS = [
  'narrowRecord',
  'nepaPageLimits',
  'megaprojectCertification',
  'railSpecustawa',
  'specustawa',
  'fundLocally',
  'utilityStatute',
  'masterPermitting',
  'potholeFirst',
  'stageGates',
  'inHouseEngineering',
  'payBands',
  'bestValueAward',
  'itemizedContracts',
  'openTenders',
  'importSupplyChain',
  'roundTheClock',
  'emergencyAward',
  'parallelWorks',
  'leanSupervision',
  'twoTracks',
  'shallowBoxes',
  'noMezzanines',
  'stationCatalogue',
  'rightSizeTerminal',
  'twinBoreStandard',
  'groundInvestigation',
  'segmentPlantLogistics',
  'rightMachine',
  'continuousAdvance',
  'prufrockClass',
  'smallBoreLoop',
];

/**
 * profileFor of the old tree, recorded before the merge. `none` is the day-one profile of every mission (each
 * started with the shorter lawsuit record enacted), `all` every one of the 32, `poland` the old POLAND_PROFILE.
 * 2026-11-11: the wildlife card came after the merge; its rate key is added here; no reform moves it.
 */
const BEFORE: Record<'none' | 'all' | 'poland', Profile> = {
  none: {
    'unit.procurement': 1.5,
    'unit.labour': 1.3,
    'unit.thirdParty': 1.2,
    'unit.priceLevel': 1.61,
    'systems.factor': 1.3225,
    'soft.fixed': 0.3,
    'soft.overheadPerYear': 0.02,
    'soft.contingency': 0.35,
    'design.threeTrack': 1,
    'design.deepBox': 1,
    'design.oversizeStations': 1,
    'design.bespoke': 1,
    'design.terminalOversize': 1,
    'design.twinBoreDefault': 0,
    'time.planning': 48,
    'time.permitting': 38,
    'time.procurement': 23,
    'time.utilities': 24,
    'time.fitOut': 20,
    'time.constructionFactor': 1.5,
    'tbm.rate': 1,
    'tbm.breakdown': 1,
    'tbm.geologyRelief': 0,
    'tbm.smallBore': 0,
    'event.lawsuit.rate': 0.8,
    'event.lawsuit.delayCapDays': 100000,
    'event.utilitySurprise.rate': 1,
    'event.tbmStuck.rate': 1,
    'event.changeOrder.rate': 1,
    'event.fundingGap.rate': 1,
    'event.contractorBankruptcy.rate': 1,
    'event.cashCall.rate': 1,
    'event.distantFish.rate': 1,
  },
  all: {
    'unit.procurement': 1,
    'unit.labour': 1,
    'unit.thirdParty': 1,
    'unit.priceLevel': 1.61,
    'systems.factor': 1,
    'soft.fixed': 0.1,
    'soft.overheadPerYear': 0.01,
    'soft.contingency': 0,
    'design.threeTrack': 0,
    'design.deepBox': 0,
    'design.oversizeStations': 0,
    'design.bespoke': 0,
    'design.terminalOversize': 0,
    'design.twinBoreDefault': 1,
    'time.planning': 0,
    'time.permitting': 0,
    'time.procurement': 6,
    'time.utilities': 3.25,
    'time.fitOut': 20,
    'time.constructionFactor': 1,
    'tbm.rate': 3.52,
    'tbm.breakdown': 0.6,
    'tbm.geologyRelief': 0.5,
    'tbm.smallBore': 1,
    'event.lawsuit.rate': 0,
    'event.lawsuit.delayCapDays': 270,
    'event.utilitySurprise.rate': 0,
    'event.tbmStuck.rate': 0.15,
    'event.changeOrder.rate': 0.25,
    'event.fundingGap.rate': 0.3,
    'event.contractorBankruptcy.rate': 0.25,
    'event.cashCall.rate': 1,
    'event.distantFish.rate': 1,
  },
  poland: {
    'unit.procurement': 1,
    'unit.labour': 1,
    'unit.thirdParty': 1,
    'unit.priceLevel': 1,
    'systems.factor': 1,
    'soft.fixed': 0.1,
    'soft.overheadPerYear': 0.01,
    'soft.contingency': 0,
    'design.threeTrack': 0,
    'design.deepBox': 0,
    'design.oversizeStations': 0,
    'design.bespoke': 0,
    'design.terminalOversize': 0,
    'design.twinBoreDefault': 1,
    'time.planning': 6,
    'time.permitting': 17,
    'time.procurement': 12,
    'time.utilities': 13,
    'time.fitOut': 20,
    'time.constructionFactor': 1,
    'tbm.rate': 1.1,
    'tbm.breakdown': 0.6,
    'tbm.geologyRelief': 0.5,
    'tbm.smallBore': 0,
    'event.lawsuit.rate': 0.2,
    'event.lawsuit.delayCapDays': 270,
    'event.utilitySurprise.rate': 0,
    'event.tbmStuck.rate': 0.15,
    'event.changeOrder.rate': 0.25,
    'event.fundingGap.rate': 0.3,
    'event.contractorBankruptcy.rate': 0.25,
    'event.cashCall.rate': 1,
    'event.distantFish.rate': 1,
  },
};

describe('twelve reforms hold what 32 held', () => {
  test('with nothing enacted, with everything enacted and for Poland the profile is what it was before the merge', () => {
    expect(profileFor([])).toEqual(BEFORE.none);
    expect(STATUS_QUO_PROFILE['event.lawsuit.rate']).toBe(0.8);
    expect(profileFor(REFORMS.map((r) => r.id))).toEqual(BEFORE.all);
    expect(profileFor(POLAND_PROFILE)).toEqual(BEFORE.poland);
    // What Poland does not do is what it did not do: the same six old nodes, in four reforms.
    const beyond = REFORMS.filter((r) => r.beyondPoland);
    expect(beyond.map((r) => r.id)).toEqual(['specustawa', 'emergencyAward', 'prufrockClass', 'smallBoreLoop']);
    expect(beyond.flatMap((r) => [...r.absorbs]).sort()).toEqual(
      ['specustawa', 'emergencyAward', 'parallelWorks', 'continuousAdvance', 'prufrockClass', 'smallBoreLoop'].sort(),
    );
  });

  test('every old id has a successor in the migration table, except the lawsuit record, which is the status quo now', () => {
    expect(Object.keys(REFORM_MIGRATION).sort()).toEqual([...OLD_IDS].sort());
    const current = new Set(REFORMS.map((r) => r.id));
    for (const [old, now] of Object.entries(REFORM_MIGRATION)) {
      if (old === 'narrowRecord') expect(now).toBeNull();
      else expect(current.has(now as string), `${old} -> ${now}`).toBe(true);
    }
    // A current id is an old id that kept its name: migrating a list twice changes nothing.
    for (const r of REFORMS) expect(REFORM_MIGRATION[r.id], r.id).toBe(r.id);
    expect(migrateReformIds(REFORMS.map((r) => r.id))).toEqual(REFORMS.map((r) => r.id));
    expect(REFORM_MIGRATION).toMatchObject({
      nepaPageLimits: 'railSpecustawa',
      megaprojectCertification: 'railSpecustawa',
      fundLocally: 'railSpecustawa',
      masterPermitting: 'utilityStatute',
      potholeFirst: 'utilityStatute',
      stageGates: 'inHouseEngineering',
      payBands: 'inHouseEngineering',
      leanSupervision: 'inHouseEngineering',
      itemizedContracts: 'bestValueAward',
      openTenders: 'bestValueAward',
      importSupplyChain: 'bestValueAward',
      parallelWorks: 'emergencyAward',
      twoTracks: 'twinBoreStandard',
      shallowBoxes: 'twinBoreStandard',
      rightSizeTerminal: 'twinBoreStandard',
      noMezzanines: 'stationCatalogue',
      groundInvestigation: 'rightMachine',
      segmentPlantLogistics: 'rightMachine',
      continuousAdvance: 'prufrockClass',
      specustawa: 'specustawa',
      smallBoreLoop: 'smallBoreLoop',
    });
    // In order, without repeats, the dropped one gone, the price level of a Poland-mode save kept.
    expect(migrateReformIds(['narrowRecord', 'twoTracks', 'stageGates', 'twinBoreStandard', 'payBands', 'specustawa'])).toEqual([
      'twinBoreStandard',
      'inHouseEngineering',
      'specustawa',
    ]);
    expect(migrateReformIds(['polishPriceLevel', 'potholeFirst'])).toEqual(['polishPriceLevel', 'utilityStatute']);
    expect(() => migrateReformIds(['twoTracks', 'abolishGravity'])).toThrow(
      'sim: save names reform "abolishGravity", which no longer exists and has no successor in REFORM_MIGRATION',
    );
  });

  /** What the build before the merge would have written: schema version 2, the old ids. */
  function asVersion2(sim: GameSim, reforms: string[], policies: string[]): SaveFile {
    const st = JSON.parse(JSON.stringify(sim.serialize())) as SimState;
    st.schemaVersion = 2;
    st.reforms = reforms;
    st.scenario.start.policies = policies;
    return { ...sim.save(), schemaVersion: 2, sim: st, stateHash: hashState(st) };
  }

  test('a save from before the merge loads with its reforms renamed, plays on, and an unknown id fails the load in one line', () => {
    const sim = createSim(testScenario(), 3, null, { events: false });
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    sim.run(200);
    const old = asVersion2(sim, ['narrowRecord', 'twoTracks', 'stageGates', 'groundInvestigation'], ['narrowRecord', 'twoTracks']);
    const loaded = loadSim(JSON.parse(JSON.stringify(old)));
    expect(loaded.state.schemaVersion).toBe(3);
    expect(loaded.state.reforms).toEqual(['twinBoreStandard', 'inHouseEngineering', 'rightMachine']);
    expect(loaded.state.scenario.start.policies).toEqual(['twinBoreStandard']);
    expect(loaded.state.politicalCapital).toBe(sim.state.politicalCapital);
    expect(loaded.state.cashCents).toBe(sim.state.cashCents);
    const view = loaded.snapshot();
    expect(view.reforms.filter((r) => r.status === 'enacted').map((r) => r.id)).toEqual([
      'inHouseEngineering',
      'twinBoreStandard',
      'rightMachine',
    ]);
    expect(view.projects[0].receipt.columns.yours.costCents).toBeGreaterThan(0);
    loaded.run(365 * 40, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
    expect(loaded.state.projects[0].status).toBe('open');
    expect(loaded.save().schemaVersion).toBe(3);
    // The save of this build loads as it is.
    expect(loadSim(sim.save()).hash()).toBe(sim.hash());
    const unknown = asVersion2(sim, ['twoTracks', 'abolishGravity'], []);
    expect(() => loadSim(unknown)).toThrow(/^sim: save names reform "abolishGravity", which no longer exists and has no successor/);
    const tampered = asVersion2(sim, ['twoTracks'], []);
    (tampered.sim as unknown as SimState).cashCents += 1;
    expect(() => loadSim(tampered)).toThrow(/save is corrupt: state hash/);
  });
});

describe('stars: one for opening the line, one for each half of the 2x Poland target', () => {
  const target = (costRatio: number, timeRatio: number): PolandTarget => ({
    costRatio,
    timeRatio,
    limit: 2,
    met: costRatio > 0 && timeRatio > 0 && costRatio <= 2 && timeRatio <= 2,
  });

  test('the rule', () => {
    // Not open: no stars, whatever the forecast says.
    expect(starsOf(false, target(1, 1))).toBe(0);
    expect(starsOf(true, target(18, 2.5))).toBe(1);
    expect(starsOf(true, target(2, 2.5))).toBe(2);
    expect(starsOf(true, target(18, 1.6))).toBe(2);
    expect(starsOf(true, target(2, 2))).toBe(3);
    expect(starsOf(true, target(1.2, 0.7))).toBe(3);
    // Just over is over.
    expect(starsOf(true, target(2.001, 2.001))).toBe(1);
    // Without a Polish figure a ratio is 0, and 0 is not a pass.
    expect(starsOf(true, target(0, 0))).toBe(1);
    expect(starsOf(true, target(0, 1))).toBe(2);
  });

  test('the scorecard of a played line carries the stars of its own target, and riders do not move them', () => {
    const play = (policies: string[], housing = false): GameSim => {
      const base = testScenario();
      const sim = createSim(
        {
          ...base,
          start: { ...base.start, policies },
          ...(housing
            ? {
                housing: [
                  {
                    id: 'near',
                    title: 'Homes at B',
                    blurb: 'A synthetic site.',
                    hectares: 100,
                    homesPerHectare: 100,
                    capitalCost: 10,
                    at: { x: 20_900, z: -65_400 },
                    source: 'test',
                  },
                ],
              }
            : {}),
        },
        1,
        null,
        { events: false },
      );
      sim.dispatch([...TEST_DESIGN, ...(housing ? [{ t: 'enactHousing' as const, optionId: 'near' }] : [])]);
      expect(sim.snapshot().projects[0].scorecard).toMatchObject({ final: false, stars: 0 });
      sim.run(365 * 60, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
      expect(sim.state.projects[0].status).toBe('open');
      return sim;
    };
    const idle = play([]).snapshot();
    const card = idle.projects[0].scorecard;
    const t = card.polandTarget;
    if (!t) throw new Error('no polandTarget');
    expect(card.final).toBe(true);
    expect(t).toEqual(polandTargetOf(card.yours, card.poland));
    // The status quo on the test line: far over on cost.
    expect(t.costRatio).toBeGreaterThan(5);
    expect(card.stars).toBe(t.timeRatio <= 2 ? 2 : 1);
    expect(card.stars).toBe(starsOf(true, t));
    expect(idle.mission.result?.stars).toBe(card.stars);
    expect(card.axes).toBeUndefined();
    expect(card.verdict).toBe(`You paid $${(card.yours.costCents / 1e11).toFixed(2)}B: ${t.costRatio.toFixed(1)}x Poland.`);
    expect(card.starsReason).toMatch(/^Open/);
    // Everything Poland does, from day one: both halves, three stars.
    const reformed = play(POLAND_PROFILE.filter((id) => id !== 'polishPriceLevel')).snapshot().projects[0].scorecard;
    expect(reformed.polandTarget).toMatchObject({ met: true });
    expect(reformed.stars).toBe(3);
    expect(reformed.starsReason).toBe('Open, and within 2x Poland on cost and on time.');
    // The same line with ten thousand homes beside it: more riders on the card, the same stars.
    const homes = play([], true).snapshot().projects[0].scorecard;
    expect(homes.ridersPerDay).toBeGreaterThan(card.ridersPerDay);
    expect(homes.housing?.homes).toBe(10_000);
    expect(homes.stars).toBe(card.stars);
  });

  test('a target is met at the limit and missed above it, half by half', () => {
    const col = (costCents: number, yearsToOpen: number): ScoreColumn => ({
      label: '',
      kind: 'yours',
      costCents,
      costPerKmCents: costCents,
      lengthKm: 1,
      openDate: '2030-01-01',
      yearsToOpen,
      source: '',
    });
    expect(polandTargetOf(col(200, 10), col(100, 5))).toEqual({ costRatio: 2, timeRatio: 2, limit: 2, met: true });
    expect(starsOf(true, polandTargetOf(col(201, 10), col(100, 5)))).toBe(2);
    expect(starsOf(true, polandTargetOf(col(200, 10.1), col(100, 5)))).toBe(2);
    expect(starsOf(true, polandTargetOf(col(201, 10.1), col(100, 5)))).toBe(1);
  });
});

describe('one step to the twin bore: the loud path', () => {
  test('on an approved line that is no longer buildable (an older save) the reform is enacted and says the tunnel was not redrawn', () => {
    const sim = createSim(testScenario(), 1, null, { events: false });
    sim.dispatch([...TEST_DESIGN, { t: 'approveProject', projectId: TEST_PROJECT }]);
    const project = sim.state.projects[0];
    const methods = [...project.methods];
    // A grade no check lets through, as a rule that changed since the save would leave it.
    project.waypoints[1] = { ...project.waypoints[1], y: project.waypoints[1].y + 40 };
    const capital = sim.state.politicalCapital;
    sim.dispatch([{ t: 'enactReform', id: 'twinBoreStandard' }]);
    expect(sim.state.reforms).toEqual(['twinBoreStandard']);
    expect(sim.state.politicalCapital).toBe(capital - 40);
    expect(project.methods).toEqual(methods);
    expect(project.tunnelChoice).toBeNull();
    const notice = sim.snapshot().notices.at(-1);
    expect(notice?.command).toBe('enactReform');
    expect(notice?.reason).toMatch(
      /^"Polish tunnel: two tracks, twin bore" is enacted, but the tunnel was not redrawn\. Test line is approved: a change must keep the line buildable\. Segment 1 climbs/,
    );
  });
});

describe('the target objective', () => {
  test('it is pending until the line opens, then met or failed on cost and time together, as the scorecard says', () => {
    const scenario = (policies: string[]) => {
      const base = testScenario();
      return {
        ...base,
        start: { ...base.start, policies },
        objectives: [
          base.objectives[0],
          { id: 'near-poland', title: 'Get within 2x Poland on cost and time', kind: 'maxRatioToPoland' as const, ratio: 2 },
        ],
      };
    };
    const run = (policies: string[]) => {
      const sim = createSim(scenario(policies), 1, null, { events: false });
      sim.dispatch(TEST_DESIGN);
      const pending = sim.snapshot().objectives.find((o) => o.id === 'near-poland');
      expect(pending).toMatchObject({ status: 'pending', stretch: false, detail: 'target 2x what Poland would have paid and taken' });
      sim.run(365 * 60, (s) => (s.state.projects[0].status === 'open' ? false : autopilotCommands(s.state)));
      const snap = sim.snapshot();
      const t = snap.projects[0].scorecard.polandTarget;
      if (!t) throw new Error('no polandTarget');
      const o = snap.objectives.find((x) => x.id === 'near-poland');
      expect(o?.status).toBe(t.met ? 'done' : 'failed');
      expect(o?.detail).toBe(`cost ${t.costRatio.toFixed(1)}x Poland, time ${t.timeRatio.toFixed(1)}x, target 2x on both`);
      // The mission is complete either way: the target moves the stars, not the completion.
      expect(snap.mission.complete).toBe(true);
      return t.met;
    };
    expect(run([])).toBe(false);
    expect(run(POLAND_PROFILE.filter((id) => id !== 'polishPriceLevel'))).toBe(true);
  });
});
