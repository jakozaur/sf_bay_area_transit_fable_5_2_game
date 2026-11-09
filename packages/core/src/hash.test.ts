import { describe, expect, test } from 'vitest';
import { asBytes, fnv1a32, fnv1a32String, hashCoords, hex32, stableHash, stableHashString } from './hash.ts';

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('hash', () => {
  test('fnv1a32 matches published FNV-1a test vectors', () => {
    expect(fnv1a32(ascii(''))).toBe(0x811c9dc5);
    expect(fnv1a32(ascii('a'))).toBe(0xe40c292c);
    expect(fnv1a32(ascii('foobar'))).toBe(0xbf9cf968);
  });

  test('chaining equals hashing the concatenation', () => {
    expect(fnv1a32(ascii('bar'), fnv1a32(ascii('foo')))).toBe(fnv1a32(ascii('foobar')));
  });

  test('stableHash is 16 hex chars, sensitive to content, and sees typed arrays as bytes', () => {
    const a = stableHash(new Uint16Array([1, 2, 3]));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(stableHash(new Uint16Array([1, 2, 4]))).not.toBe(a);
    expect(stableHash(new Uint8Array([1, 0, 2, 0, 3, 0]))).toBe(a);
    expect(asBytes(new Uint32Array(2)).length).toBe(8);
    const view = new Uint8Array([9, 1, 0, 2, 0, 3, 0, 9]).subarray(1, 7);
    expect(stableHash(view)).toBe(a);
  });

  test('string hashes are stable goldens', () => {
    expect(fnv1a32String('')).toBe(0x811c9dc5);
    expect(stableHashString('The Portal')).toMatchInlineSnapshot(`"f0f70bc040dbf709"`);
    expect(stableHashString('The Portal')).not.toBe(stableHashString('The portal'));
    expect(hex32(255)).toBe('000000ff');
  });

  test('hashCoords is deterministic and spreads over neighbours', () => {
    expect(hashCoords(1, 2, 3, 4)).toBe(hashCoords(1, 2, 3, 4));
    expect(hashCoords(1, 2, 3, 4)).toMatchInlineSnapshot(`4091925203`);
    const seen = new Set<number>();
    for (let x = -8; x < 8; x++) for (let z = -8; z < 8; z++) seen.add(hashCoords(x, 0, z, 1));
    expect(seen.size).toBe(256);
    let ones = 0;
    for (let i = 0; i < 4096; i++) ones += hashCoords(i, 0, 0, 5) & 1;
    expect(ones).toBeGreaterThan(1900);
    expect(ones).toBeLessThan(2200);
  });
});
