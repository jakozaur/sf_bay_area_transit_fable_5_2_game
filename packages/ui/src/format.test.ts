import { expect, test } from 'vitest';
import {
  capital,
  count,
  dateFixed,
  dateLong,
  dateMonth,
  duration,
  durationDelta,
  length,
  money,
  moneyDelta,
  moneyPerKm,
  percent,
  ratio,
} from './format.ts';

test('money is compact with three significant digits', () => {
  expect(money(518_000_000_000)).toBe('$5.18B');
  expect(money(18_300_000_000)).toBe('$183M');
  expect(money(684_000_000_000)).toBe('$6.84B');
  expect(money(1_260_000_000_00)).toBe('$1.26B');
  expect(money(95_000_000_00)).toBe('$95.0M');
  expect(money(31_000_000)).toBe('$310K');
  expect(money(125_000)).toBe('$1,250');
  expect(money(0)).toBe('$0');
  expect(money(-120_000_000_000)).toBe('-$1.20B');
  expect(money(2_500_000_000_000_00)).toBe('$2.50T');
});

test('money never prints 1000M or 1000K at a unit boundary', () => {
  expect(money(99_960_000_000)).toBe('$1.00B');
  expect(money(99_999_900)).toBe('$1.00M');
});

test('per km, deltas and ratios', () => {
  expect(moneyPerKm(18_300_000_000)).toBe('$183M/km');
  expect(moneyDelta(12_000_000_000)).toBe('+$120M');
  expect(moneyDelta(-12_000_000_000)).toBe('-$120M');
  expect(moneyDelta(0)).toBe('no change');
  expect(ratio(13.42)).toBe('13.4x');
  expect(ratio(3.238)).toBe('3.24x');
  expect(ratio(120.4)).toBe('120x');
  expect(percent(0.424)).toBe('42%');
});

test('dates, durations and counts', () => {
  expect(dateLong('2026-11-09')).toBe('9 Nov 2026');
  expect(dateFixed('2031-10-06')).toBe('06 Oct 2031');
  expect(dateFixed('2031-10-17')).toBe('17 Oct 2031');
  expect(dateMonth('2036-03-31')).toBe('Mar 2036');
  expect(duration(1)).toBe('1 day');
  expect(duration(30)).toBe('30 days');
  expect(duration(210)).toBe('7 months');
  expect(duration(1460)).toBe('4.0 years');
  expect(durationDelta(-210)).toBe('7 months sooner');
  expect(durationDelta(400)).toBe('13 months later');
  expect(durationDelta(0)).toBe('no change');
  expect(length(2090)).toBe('2.09 km');
  expect(length(840)).toBe('840 m');
  expect(count(41200)).toBe('41,200');
  expect(capital(40)).toBe('40 PC');
});

test('bad input fails loudly, naming the value', () => {
  expect(() => money(Number.NaN)).toThrow(/money is not a finite number/);
  expect(() => ratio(Number.POSITIVE_INFINITY)).toThrow(/ratio is not a finite number/);
  expect(() => dateLong('next year')).toThrow(/not an ISO date: "next year"/);
});
