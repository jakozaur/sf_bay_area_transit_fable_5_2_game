import { describe, expect, test } from 'vitest';
import { createRng, nextFloat, nextInt, nextU32 } from './prng.ts';

describe('sfc32 PRNG', () => {
  test('golden sequence for seed 42 is stable', () => {
    const rng = createRng(42);
    const got = Array.from({ length: 4 }, () => nextU32(rng));
    expect(got).toMatchInlineSnapshot(`
      [
        509326843,
        164909939,
        2331740700,
        3951155783,
      ]
    `);
  });

  test('same seed gives the same stream, different seeds differ', () => {
    const a = createRng(7);
    const b = createRng(7);
    const c = createRng(8);
    const d = createRng(7 + 2 ** 32);
    const sa = Array.from({ length: 16 }, () => nextU32(a));
    expect(Array.from({ length: 16 }, () => nextU32(b))).toEqual(sa);
    expect(Array.from({ length: 16 }, () => nextU32(c))).not.toEqual(sa);
    expect(Array.from({ length: 16 }, () => nextU32(d))).not.toEqual(sa);
  });

  test('state is a plain copyable Uint32Array', () => {
    const a = createRng(123);
    nextU32(a);
    const fork = a.slice();
    expect(nextU32(fork)).toBe(nextU32(a));
  });

  test('nextFloat is in [0, 1) with a plausible mean', () => {
    const rng = createRng(1);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const f = nextFloat(rng);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
    }
    expect(sum / 20000).toBeGreaterThan(0.49);
    expect(sum / 20000).toBeLessThan(0.51);
  });

  test('nextInt covers [0, n) roughly uniformly and rejects bad n', () => {
    const rng = createRng(99);
    const hist = new Array<number>(6).fill(0);
    for (let i = 0; i < 60000; i++) {
      const k = nextInt(rng, 6);
      hist[k] = (hist[k] as number) + 1;
    }
    for (const h of hist) {
      expect(h).toBeGreaterThan(9500);
      expect(h).toBeLessThan(10500);
    }
    expect(() => nextInt(rng, 0)).toThrow('got 0');
    expect(() => nextInt(rng, 1.5)).toThrow('got 1.5');
    expect(() => createRng(Number.NaN)).toThrow('NaN');
  });
});
