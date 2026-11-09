/** Small planar geometry helpers on flat [x0, z0, x1, z1, ...] arrays in world metres. */
import { GRID_ORIGIN_EASTING, GRID_ORIGIN_NORTHING, isInGrid } from '@bayvox/core';

/** UTM 10N (easting, northing) pairs to world (x east, z south) pairs. Same rule as core utm10ToWorld. */
export function utmToWorldFlat(utm: Float64Array): Float64Array {
  const out = new Float64Array(utm.length);
  for (let i = 0; i < utm.length; i += 2) {
    out[i] = (utm[i] as number) - GRID_ORIGIN_EASTING;
    out[i + 1] = GRID_ORIGIN_NORTHING - (utm[i + 1] as number);
  }
  return out;
}

/**
 * Round a part to the quantization lattice and drop repeated points. For a ring the closing point is
 * dropped as well. Returns undefined when fewer than 2 (line) or 3 (ring) distinct points remain.
 */
export function snapPart(part: Float64Array, quantM: number, ring: boolean): Float64Array | undefined {
  const out: number[] = [];
  for (let i = 0; i < part.length; i += 2) {
    // Adding 0 turns -0 into 0.
    const x = Math.round((part[i] as number) / quantM) * quantM + 0;
    const z = Math.round((part[i + 1] as number) / quantM) * quantM + 0;
    const n = out.length;
    if (n >= 2 && out[n - 2] === x && out[n - 1] === z) continue;
    out.push(x, z);
  }
  if (ring) {
    while (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  }
  if (out.length < (ring ? 6 : 4)) return undefined;
  return Float64Array.from(out);
}

export function lineLength(part: Float64Array): number {
  let sum = 0;
  for (let i = 2; i < part.length; i += 2) {
    sum += Math.hypot((part[i] as number) - (part[i - 2] as number), (part[i + 1] as number) - (part[i - 1] as number));
  }
  return sum;
}

export function anyPointInGrid(part: Float64Array): boolean {
  for (let i = 0; i < part.length; i += 2) if (isInGrid(part[i] as number, part[i + 1] as number)) return true;
  return false;
}

/** Douglas-Peucker on an open polyline; keeps both end points. */
export function simplifyLine(part: Float64Array, toleranceM: number): Float64Array {
  const n = part.length / 2;
  if (n <= 2) return part;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  while (stack.length > 0) {
    const b = stack.pop() as number;
    const a = stack.pop() as number;
    const ax = part[a * 2] as number;
    const az = part[a * 2 + 1] as number;
    const dx = (part[b * 2] as number) - ax;
    const dz = (part[b * 2 + 1] as number) - az;
    const len2 = dx * dx + dz * dz;
    let worst = -1;
    let worstD = toleranceM * toleranceM;
    for (let i = a + 1; i < b; i++) {
      const px = (part[i * 2] as number) - ax;
      const pz = (part[i * 2 + 1] as number) - az;
      const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * dx + pz * dz) / len2));
      const ex = px - t * dx;
      const ez = pz - t * dz;
      const d = ex * ex + ez * ez;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push(a, worst, worst, b);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i] === 1) out.push(part[i * 2] as number, part[i * 2 + 1] as number);
  return Float64Array.from(out);
}

/** Z-order key of a world position on an 8 m lattice: nearby features sort together, which helps deflate. */
export function mortonKey(x: number, z: number): number {
  const spread = (v: number): number => {
    let w = Math.max(0, Math.min(0x7fff, Math.floor(v / 8))) | 0;
    w = (w | (w << 8)) & 0x00ff00ff;
    w = (w | (w << 4)) & 0x0f0f0f0f;
    w = (w | (w << 2)) & 0x33333333;
    w = (w | (w << 1)) & 0x55555555;
    return w;
  };
  return spread(x) + spread(0 - z) * 2;
}

/** Stable sort by Z-order of each feature's first point, ties broken by `tie`. */
export function sortSpatially<T extends { parts: Float64Array[] }>(features: T[], tie: (f: T) => number): T[] {
  const keyed = features.map((f) => {
    const p = f.parts[0] as Float64Array;
    return { f, key: mortonKey(p[0] as number, p[1] as number), tie: tie(f) };
  });
  keyed.sort((a, b) => a.key - b.key || a.tie - b.tie);
  return keyed.map((k) => k.f);
}
