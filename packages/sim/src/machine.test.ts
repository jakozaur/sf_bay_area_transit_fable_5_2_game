/** machine.ts: the machine of each method and its figures are the model's own (carve shape, advance rate, civil cost). */
import { describe, expect, test } from 'vitest';
import { CONSTANTS } from './constants.ts';
import { chainages } from './geometry.ts';
import { expectedBoreDays, machineDiameterM, machineKindOf, machineView, tunnellingCivilCents } from './machine.ts';
import { advanceRate, carveShape, designFlags, hardCost, headingShape, type ProjectGeometry } from './model.ts';
import { profileFor, STATUS_QUO_PROFILE } from './reforms.ts';
import { TEST_WAYPOINTS } from './test-scenario.ts';
import { type FrontState, METHODS, type Method } from './types.ts';

const SQ = STATUS_QUO_PROFILE;
const SMALL = profileFor(['twinBoreStandard', 'smallBoreLoop']);
const cum = chainages(TEST_WAYPOINTS);

function line(methods: Method[]): ProjectGeometry {
  return { waypoints: TEST_WAYPOINTS, methods, cum, stations: [] };
}

describe('machine of a method', () => {
  test('kind per method; the small bore only under smallBoreLoop and only in place of the twin bore', () => {
    expect(METHODS.map((m) => [m, machineKindOf(m, SQ)])).toEqual([
      ['boredTwin', 'twinBore'],
      ['boredSingleLarge', 'singleBore'],
      ['cutAndCover', 'excavator'],
      ['mined', 'roadheader'],
      ['atGrade', null],
      ['viaduct', null],
    ]);
    expect(METHODS.map((m) => machineKindOf(m, SMALL))).toEqual(['smallBore', 'singleBore', 'excavator', 'roadheader', null, null]);
  });

  test('the diameter is the tube the heading carves', () => {
    const f = designFlags(profileFor(['twinBoreStandard']));
    expect(machineDiameterM('boredTwin', f, SQ)).toBe(6.6);
    expect(machineDiameterM('boredTwin', f, SMALL)).toBe(3.7);
    expect(headingShape('boredTwin', f, SMALL)).toEqual({ radiusM: CONSTANTS.smallBoreRadiusM.value, laterals: [0] });
    for (const m of METHODS) {
      expect(headingShape(m, f, SQ), m).toEqual(carveShape(m, f));
      expect(machineDiameterM(m, f, SQ), m).toBeCloseTo(2 * carveShape(m, f).radiusM, 1);
      if (m !== 'boredTwin') expect(headingShape(m, f, SMALL), m).toEqual(carveShape(m, f));
    }
    expect(machineView('atGrade', line(['atGrade', 'atGrade', 'atGrade', 'atGrade']), SQ, f)).toBeNull();
  });

  test('metres per day is advanceRate, the price is the civil cost of the underground segments: no new figure', () => {
    for (const p of [SQ, profileFor(['twinBoreStandard']), SMALL]) {
      const f = designFlags(p);
      for (const m of ['boredTwin', 'boredSingleLarge', 'cutAndCover', 'mined'] as const) {
        const g = line([m, m, m, m]);
        const v = machineView(m, g, p, f);
        if (!v) throw new Error(`no machine for ${m}`);
        expect(v.metresPerDay, m).toBeCloseTo(advanceRate(m, 'softGround', p, Number.POSITIVE_INFINITY), 2);
        expect(v.priceCents, m).toBe(Math.round(hardCost(g, p, f, false).civilCents));
        // Two shields, or three while three tracks are mandated (the status quo).
        expect(v.count, m).toBe(v.kind === 'twinBore' ? (f.threeTrack ? 3 : 2) : 1);
      }
      // Surface segments are not the machine's.
      const mixed = line(['boredTwin', 'atGrade', 'boredTwin', 'viaduct']);
      expect(tunnellingCivilCents(mixed, p, f)).toBeLessThan(Math.round(hardCost(mixed, p, f, false).civilCents));
    }
    // Three tracks on a twin-bore design is a third tube, and the name says so.
    const three = machineView('boredTwin', line(['boredTwin', 'boredTwin', 'boredTwin', 'boredTwin']), SQ, designFlags(SQ));
    expect([three?.count, three?.name]).toEqual([3, 'Three 6.6 m EPB machines']);
  });

  test('expected days of a drive add up over its parts and count the slow start', () => {
    const f: FrontState = {
      id: 'f',
      name: 'TBM',
      method: 'boredTwin',
      fromM: 0,
      toM: cum[cum.length - 1],
      chainageM: 0,
      downDays: 0,
      downReason: null,
      boredM: 0,
      breakthroughTick: -1,
      drive: null,
    };
    const g = { waypoints: TEST_WAYPOINTS, cum };
    const whole = expectedBoreDays(g, f, SQ, f.fromM, f.toM);
    expect(expectedBoreDays(g, f, SQ, 0, 400) + expectedBoreDays(g, f, SQ, 400, f.toM)).toBeCloseTo(whole, 9);
    const startup = CONSTANTS.twinBoreStartupM.value;
    const slow = expectedBoreDays(g, f, SQ, 0, 100);
    const steady = expectedBoreDays(g, f, SQ, startup, startup + 100);
    // Same ground (the first 250 m are soft ground): the first metres go at the start-up rate.
    expect(steady / slow).toBeCloseTo(CONSTANTS.startupRateFactor.value, 9);
  });
});
