/**
 * Seeded PRNG: sfc32 (Chris Doty-Humphrey's Small Fast Counting generator, 32-bit variant).
 * State is four u32 words in a plain Uint32Array so it can live inside sim state and be serialized.
 * Only integer operations and one exact power-of-two division: results are identical on every engine.
 * No Math.random anywhere in sim code (doc 10 section 3.1).
 */

/** Four u32 words: a, b, c, counter. Copy with rng.slice() to fork or snapshot. */
export type Rng = Uint32Array;

/** splitmix32 step, used only to expand a seed into the initial state. */
function splitmix32(x: number): number {
  let z = (x + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** Creates a generator from an integer seed (any safe integer; both 32-bit halves are used). */
export function createRng(seed: number): Rng {
  if (!Number.isSafeInteger(seed)) throw new RangeError(`createRng: seed must be a safe integer, got ${seed}`);
  const lo = seed >>> 0;
  const hi = Math.floor(seed / 0x100000000) >>> 0;
  const rng = new Uint32Array(4);
  const s0 = splitmix32(lo);
  const s1 = splitmix32(s0 ^ hi);
  const s2 = splitmix32(s1);
  rng[0] = s0;
  rng[1] = s1;
  rng[2] = s2;
  rng[3] = 1;
  for (let i = 0; i < 12; i++) nextU32(rng);
  return rng;
}

/** Next uniform u32 in [0, 2^32). Advances the state. */
export function nextU32(rng: Rng): number {
  const a = rng[0] as number;
  const b = rng[1] as number;
  const c = rng[2] as number;
  const d = rng[3] as number;
  const t = (((a + b) | 0) + d) | 0;
  rng[3] = d + 1;
  rng[0] = b ^ (b >>> 9);
  rng[1] = (c + (c << 3)) | 0;
  const c2 = (c << 21) | (c >>> 11);
  rng[2] = (c2 + t) | 0;
  return t >>> 0;
}

/** Next uniform float in [0, 1) with 32 bits of resolution. */
export function nextFloat(rng: Rng): number {
  return nextU32(rng) / 0x100000000;
}

/** Next uniform integer in [0, n). Unbiased (rejection sampling). n must be an integer in [1, 2^32]. */
export function nextInt(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 0x100000000) {
    throw new RangeError(`nextInt: n must be an integer in [1, 2^32], got ${n}`);
  }
  const limit = 0x100000000 - (0x100000000 % n);
  for (;;) {
    const r = nextU32(rng);
    if (r < limit) return r % n;
  }
}
