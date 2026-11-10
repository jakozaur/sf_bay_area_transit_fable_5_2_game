import { describe, expect, test } from 'vitest';
import { CONSTANTS, constantsTable, ESCALATION_DAILY } from './constants.ts';
import { dateAtTick, daysToIso, isoToDays } from './dates.ts';
import { FEEDERS, ridership, ZONES } from './demand.ts';
import { EVENTS } from './events.ts';
import { chainages } from './geometry.ts';
import { advanceRate, civilPlnPerM, designFlags, sectionAreaM2, stationPln, systemsPlnPerM } from './model.ts';
import { BRANCHES, POLAND_PROFILE, profileFor, REFORMS, reformById, STATUS_QUO_PROFILE, unitFactor } from './reforms.ts';

const EM_DASH = String.fromCharCode(0x2014);

describe('constants', () => {
  test('every constant names its source and no text has an em-dash', () => {
    for (const row of constantsTable()) {
      expect(row.source.length, row.id).toBeGreaterThan(5);
      expect(Number.isFinite(row.value), row.id).toBe(true);
      expect(row.source.includes(EM_DASH), row.id).toBe(false);
    }
  });

  test('daily escalation step compounds to 4 percent a year', () => {
    let x = 1;
    for (let i = 0; i < 365; i++) x *= ESCALATION_DAILY;
    expect(x).toBeCloseTo(1 + CONSTANTS.escalationPerYear.value, 6);
  });
});

describe('reform tree', () => {
  test('has at least 20 nodes in four branches, each with evidence and a one-line description', () => {
    expect(REFORMS.length).toBeGreaterThanOrEqual(20);
    expect(BRANCHES.map((b) => b.id)).toEqual(['permitting', 'procurement', 'design', 'tunnelling']);
    for (const b of BRANCHES) expect(REFORMS.filter((r) => r.branch === b.id).length, b.id).toBeGreaterThanOrEqual(5);
    const ids = new Set<string>();
    for (const r of REFORMS) {
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
      expect(r.description.length, r.id).toBeGreaterThan(20);
      expect(r.description.includes('\n'), r.id).toBe(false);
      expect(r.evidence, r.id).toMatch(/doc \d\d/);
      expect((r.title + r.description + r.evidence).includes(EM_DASH), r.id).toBe(false);
      expect(r.cost.pc > 0 || r.cost.cents > 0, `${r.id} has a cost`).toBe(true);
      expect(r.effects.length, r.id).toBeGreaterThan(0);
      for (const e of r.effects) expect(e.key in STATUS_QUO_PROFILE, `${r.id} ${e.key}`).toBe(true);
    }
  });

  test('prerequisites exist and come earlier in tree order within a branch, so there are no cycles', () => {
    const order = new Map(REFORMS.map((r, i) => [r.id, i]));
    for (const r of REFORMS) {
      for (const pre of r.prereqs) {
        const def = reformById(pre);
        expect(def, `${r.id} needs ${pre}`).toBeDefined();
        if (def && def.branch === r.branch)
          expect(order.get(pre) as number, `${r.id} after ${pre}`).toBeLessThan(order.get(r.id) as number);
      }
    }
    // Cross-branch prerequisites must not loop back.
    const seen = new Set<string>();
    const visit = (id: string, path: string[]): void => {
      if (path.includes(id)) throw new Error(`reform prerequisite cycle: ${[...path, id].join(' > ')}`);
      if (seen.has(id)) return;
      for (const pre of reformById(id)?.prereqs ?? []) visit(pre, [...path, id]);
      seen.add(id);
    };
    for (const r of REFORMS) visit(r.id, []);
  });

  test('the Poland profile lands exactly on the reformed targets', () => {
    const p = profileFor(POLAND_PROFILE);
    expect(unitFactor(p)).toBe(1);
    expect(p['systems.factor']).toBe(1);
    expect(p['soft.fixed']).toBe(CONSTANTS.softFixedReformed.value);
    expect(p['soft.overheadPerYear']).toBe(CONSTANTS.overheadPerYearReformed.value);
    expect(p['soft.contingency']).toBe(CONSTANTS.contingencyReformed.value);
    expect(p['time.planning']).toBe(CONSTANTS.planningMonthsReformed.value);
    expect(p['time.permitting']).toBe(CONSTANTS.permittingMonthsReformed.value);
    expect(p['time.procurement']).toBe(CONSTANTS.procurementMonthsReformed.value);
    expect(p['time.utilities']).toBe(CONSTANTS.utilitiesMonthsReformed.value);
    expect(p['time.constructionFactor']).toBe(1);
    const f = designFlags(p);
    expect(f).toEqual({
      threeTrack: false,
      deepBox: false,
      oversizeStations: false,
      bespoke: false,
      terminalOversize: false,
      twinBoreDefault: true,
    });
    // Speculative machines are not Polish practice.
    expect(POLAND_PROFILE).not.toContain('prufrockClass');
    expect(POLAND_PROFILE).not.toContain('continuousAdvance');
    // Twin-bore TBM pace stays in the Warsaw record of 10 to 12 m/day (doc 06 section 2.1).
    const rate = advanceRate('boredTwin', 'softGround', p, 1000);
    expect(rate).toBeGreaterThanOrEqual(10);
    expect(rate).toBeLessThanOrEqual(12);
  });

  test('profile does not depend on enactment order and rejects unknown ids', () => {
    expect(profileFor(['twoTracks', 'stageGates', 'roundTheClock'])).toEqual(profileFor(['roundTheClock', 'twoTracks', 'stageGates']));
    expect(() => profileFor(['noSuchReform'])).toThrow(/unknown reform id "noSuchReform"/);
  });

  test('status-quo unit factor is the product of its four visible parts', () => {
    const p = profileFor([]);
    expect(unitFactor(p)).toBeCloseTo(1.5 * 1.3 * 1.2 * 1.61, 9);
  });
});

describe('cost model against the Polish record', () => {
  test('a Warsaw-like line at Polish prices is within 10 percent of the M2 extension record per km', () => {
    // 4 km twin bore, 3 standard stations (0.75 per km; Warsaw extensions have 0.85), soft costs 10 percent, 2026 money.
    const pl = profileFor(POLAND_PROFILE);
    const f = designFlags(pl);
    const hardPln =
      4000 * civilPlnPerM('boredTwin', 'softGround', f, 0) +
      3 * stationPln('undergroundStandard', 18, f) +
      4000 * systemsPlnPerM('boredTwin', f);
    const perKm = (hardPln * (1 + pl['soft.fixed'])) / 4;
    const record = CONSTANTS.warsawM2ExtensionPlnPerKm2026.value;
    expect(perKm / record).toBeGreaterThan(0.9);
    expect(perKm / record).toBeLessThan(1.1);
  });

  test('cross-sections follow the design standards', () => {
    const sq = designFlags(profileFor([]));
    const pl = designFlags(profileFor(POLAND_PROFILE));
    expect(sectionAreaM2('cutAndCover', sq)).toBe(22 * 18);
    expect(sectionAreaM2('cutAndCover', pl)).toBe(12.5 * 9);
    expect(sectionAreaM2('mined', sq)).toBe(190);
    expect(sectionAreaM2('boredTwin', pl)).toBe(68.4);
    expect(sectionAreaM2('atGrade', sq)).toBe(0);
    // Deeper stations cost more; a mined station costs 1.5x.
    expect(stationPln('undergroundStandard', 30, pl)).toBeCloseTo(290e6 * 1.4, 0);
    expect(stationPln('undergroundDeepMined', 18, pl)).toBeCloseTo(290e6 * 1.5, 0);
    expect(stationPln('undergroundStandard', 18, sq) / stationPln('undergroundStandard', 18, pl)).toBeCloseTo(1.33 * 1.2 * 1.74, 9);
  });

  test('advance rate depends on geology, machine tech and the startup stretch', () => {
    const sq = profileFor([]);
    expect(advanceRate('boredTwin', 'softGround', sq, 1000)).toBeCloseTo(10.5, 9);
    expect(advanceRate('boredTwin', 'bayMud', sq, 1000)).toBeCloseTo(10.5 * 0.8, 9);
    expect(advanceRate('boredTwin', 'rock', sq, 1000)).toBeCloseTo(10.5 * 1.5, 9);
    expect(advanceRate('boredTwin', 'softGround', sq, 10)).toBeCloseTo(10.5 * 0.4, 9);
    expect(advanceRate('boredTwin', 'softGround', profileFor(['segmentPlantLogistics', 'continuousAdvance']), 1000)).toBeCloseTo(
      10.5 * 1.1 * 1.6,
      9,
    );
    // Right machine for the ground removes half of the Bay Mud penalty.
    expect(advanceRate('boredTwin', 'bayMud', profileFor(['groundInvestigation', 'rightMachine']), 1000)).toBeCloseTo(10.5 * 0.9, 9);
    // Status quo slows everything except the metro TBM (doc 11 section 5.3).
    expect(advanceRate('mined', 'softGround', sq, 0)).toBeCloseTo(2.5 / 1.5, 9);
    expect(advanceRate('boredSingleLarge', 'softGround', sq, 1000)).toBeCloseTo(8 / 1.5, 9);
  });
});

describe('event cards', () => {
  test('cover the five required kinds, cite evidence and default to a listed option', () => {
    const ids = EVENTS.map((e) => e.id);
    for (const need of ['lawsuit', 'utilitySurprise', 'tbmStuck', 'changeOrder', 'fundingGap']) expect(ids).toContain(need);
    for (const e of EVENTS) {
      expect(e.evidence, e.id).toMatch(/doc \d\d/);
      expect(
        e.options.some((o) => o.id === e.defaultOption),
        e.id,
      ).toBe(true);
      expect(`event.${e.id}.rate` in STATUS_QUO_PROFILE, e.id).toBe(true);
      expect((e.title + e.description + e.evidence).includes(EM_DASH), e.id).toBe(false);
      // Every card can be made rarer by at least one reform. The cash call is raised by the books, not by a hazard:
      // the way to avoid it is to cost less.
      if (e.id === 'cashCall') continue;
      expect(
        REFORMS.some((r) => r.effects.some((x) => x.key === `event.${e.id}.rate` && x.value < 1)),
        `${e.id} is gated`,
      ).toBe(true);
    }
  });
});

describe('dates', () => {
  test('round trip and leap years', () => {
    expect(isoToDays('1970-01-01')).toBe(0);
    expect(daysToIso(0)).toBe('1970-01-01');
    expect(dateAtTick('2026-11-09', 0)).toBe('2026-11-09');
    expect(dateAtTick('2028-02-28', 1)).toBe('2028-02-29');
    expect(dateAtTick('2027-02-28', 1)).toBe('2027-03-01');
    expect(dateAtTick('2026-11-09', 3653)).toBe('2036-11-09');
    for (const d of [-1, 59, 11016, 20766, 40000]) expect(isoToDays(daysToIso(d))).toBe(d);
    expect(() => isoToDays('2026-02-30')).toThrow(/not a calendar date/);
    expect(() => isoToDays('next year')).toThrow(/not an ISO date/);
  });
});

describe('demand v0', () => {
  test('zone table and feeders are consistent', () => {
    const ids = new Set(ZONES.map((z) => z.id));
    expect(ids.size).toBe(ZONES.length);
    for (const f of FEEDERS) for (const id of f.servedZones) expect(ids.has(id), `${f.id} ${id}`).toBe(true);
    for (const z of ZONES) expect(z.population > 0 && z.jobs > 0 && z.radiusKm > 0, z.id).toBe(true);
  });

  test('a line with no stations carries nobody, and stations at job centres attract riders', () => {
    const waypoints = [
      { x: 20_000, y: -20, z: -65_000 },
      { x: 26_000, y: -20, z: -65_000 },
    ];
    const cum = chainages(waypoints);
    expect(ridership({ waypoints, cum, stations: [] }, ['caltrain', 'bart']).ridersPerDay).toBe(0);
    const station = (id: string, chainageM: number) => ({
      id,
      name: id,
      template: 'undergroundStandard' as const,
      chainageM,
      depthM: 18,
      progress: 0,
      carvedM: 0,
    });
    const one = ridership({ waypoints, cum, stations: [station('a', 0)] }, []);
    const two = ridership({ waypoints, cum, stations: [station('a', 0), station('b', 6000)] }, []);
    expect(one.ridersPerDay).toBe(0);
    expect(two.ridersPerDay).toBeGreaterThanOrEqual(one.ridersPerDay);
    for (const c of two.catchment) expect(c.share > 0 && c.share <= 1, c.zoneId).toBe(true);
  });
});
