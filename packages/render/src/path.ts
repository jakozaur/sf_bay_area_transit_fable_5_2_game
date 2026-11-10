/**
 * Polyline helpers for things that live on a path (lining rings, track panels, train cars). Pure maths, no three.
 * Angles follow core entities.ts: yaw counter-clockwise seen from above, 0 pointing +z; pitch positive nose up.
 */
import type { WorldPos } from '@bayvox/core';

/** A point on a path with the direction of travel there. */
export interface PathSample {
  x: number;
  y: number;
  z: number;
  /** Unit tangent. */
  tx: number;
  ty: number;
  tz: number;
}

/**
 * A polyline with running lengths that can grow at its end. Zero-length segments are skipped, so every stored
 * segment has a direction.
 */
export class PathCursor {
  readonly points: WorldPos[] = [];
  /** cum[i] is the length from the start to points[i]. */
  readonly cum: number[] = [];
  /** How many points of the source array have been consumed (duplicates included). */
  consumed = 0;

  get lengthM(): number {
    return this.cum.length === 0 ? 0 : (this.cum[this.cum.length - 1] as number);
  }

  /** Appends the points of `path` from index `consumed` on. */
  extend(path: readonly WorldPos[]): void {
    for (let i = this.consumed; i < path.length; i++) {
      const p = path[i] as WorldPos;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        throw new RangeError(`PathCursor: path point ${i} is not finite: (${p.x}, ${p.y}, ${p.z})`);
      }
      const last = this.points[this.points.length - 1];
      if (last === undefined) {
        this.points.push({ x: p.x, y: p.y, z: p.z });
        this.cum.push(0);
      } else {
        const d = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
        if (d > 1e-6) {
          this.points.push({ x: p.x, y: p.y, z: p.z });
          this.cum.push(this.lengthM + d);
        }
      }
    }
    this.consumed = path.length;
  }

  /** True when `path` still starts with the points consumed so far (checked on the last consumed point only). */
  continues(path: readonly WorldPos[]): boolean {
    if (path.length < this.consumed) return false;
    if (this.consumed === 0) return true;
    const a = path[this.consumed - 1] as WorldPos;
    const b = this.points[this.points.length - 1] as WorldPos;
    // The last consumed point is either the last stored point or a duplicate of it.
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= 1e-6;
  }

  /**
   * Point and tangent at a chainage. Chainages before the start or past the end extrapolate along the first
   * or last segment, so a train longer than its path still gets a pose for every car.
   */
  sample(chainageM: number, out: PathSample): PathSample {
    const n = this.points.length;
    if (n < 2) throw new RangeError(`PathCursor.sample: the path has ${n} distinct points, needs 2`);
    let i = this.segmentAt(chainageM);
    if (i > n - 2) i = n - 2;
    const a = this.points[i] as WorldPos;
    const b = this.points[i + 1] as WorldPos;
    const len = (this.cum[i + 1] as number) - (this.cum[i] as number);
    out.tx = (b.x - a.x) / len;
    out.ty = (b.y - a.y) / len;
    out.tz = (b.z - a.z) / len;
    const d = chainageM - (this.cum[i] as number);
    out.x = a.x + out.tx * d;
    out.y = a.y + out.ty * d;
    out.z = a.z + out.tz * d;
    return out;
  }

  /** Index of the segment containing a chainage (binary search), clamped to the first and last segment. */
  segmentAt(chainageM: number): number {
    const cum = this.cum;
    let lo = 0;
    let hi = cum.length - 2;
    if (hi < 0) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((cum[mid] as number) <= chainageM) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Chainage of the point of the path nearest to `p` and its distance, metres. Linear in the number of points. */
  nearest(p: WorldPos): { chainageM: number; distanceM: number } {
    const n = this.points.length;
    if (n < 2) throw new RangeError(`PathCursor.nearest: the path has ${n} distinct points, needs 2`);
    let best = Number.POSITIVE_INFINITY;
    let at = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = this.points[i] as WorldPos;
      const b = this.points[i + 1] as WorldPos;
      const len = (this.cum[i + 1] as number) - (this.cum[i] as number);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / (len * len);
      t = t < 0 ? 0 : Math.min(t, 1);
      const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y, a.z + dz * t - p.z);
      if (d < best) {
        best = d;
        at = (this.cum[i] as number) + t * len;
      }
    }
    return { chainageM: at, distanceM: best };
  }
}

export function createPathSample(): PathSample {
  return { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 1 };
}

/** Yaw of a direction: 0 points +z, counter-clockwise seen from above. */
export function yawOf(tx: number, tz: number): number {
  return Math.atan2(tx, tz);
}

/** Pitch of a unit direction, positive nose up. */
export function pitchOf(ty: number): number {
  return Math.asin(ty < -1 ? -1 : Math.min(ty, 1));
}

/**
 * Column-major 4 x 4 matrix (three's Matrix4.elements order) of a frame on a path: local z along the tangent,
 * local x to the left of travel and level, local y up. `lateralM` shifts to the left, `scale` is uniform, and
 * the translation is relative to `anchor`.
 */
export function frameMatrix(s: PathSample, lateralM: number, anchor: WorldPos, scale: number, out: Float32Array, offset: number): void {
  // left = up x forward, flattened; a vertical tangent falls back to +x.
  let lx = s.tz;
  let lz = -s.tx;
  const ll = Math.hypot(lx, lz);
  if (ll < 1e-9) {
    lx = 1;
    lz = 0;
  } else {
    lx /= ll;
    lz /= ll;
  }
  // up = forward x left
  const ux = s.ty * lz;
  const uy = s.tz * lx - s.tx * lz;
  const uz = -s.ty * lx;
  out[offset] = lx * scale;
  out[offset + 1] = 0;
  out[offset + 2] = lz * scale;
  out[offset + 3] = 0;
  out[offset + 4] = ux * scale;
  out[offset + 5] = uy * scale;
  out[offset + 6] = uz * scale;
  out[offset + 7] = 0;
  out[offset + 8] = s.tx * scale;
  out[offset + 9] = s.ty * scale;
  out[offset + 10] = s.tz * scale;
  out[offset + 11] = 0;
  out[offset + 12] = s.x + lx * lateralM - anchor.x;
  out[offset + 13] = s.y - anchor.y;
  out[offset + 14] = s.z + lz * lateralM - anchor.z;
  out[offset + 15] = 1;
}

/** Ray against a box that is rotated about the vertical axis only. Returns the entry distance or -1. */
export function rayYawBox(
  origin: WorldPos,
  dir: WorldPos,
  center: WorldPos,
  yaw: number,
  halfX: number,
  halfY: number,
  halfZ: number,
): number {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // World to local: local z is (sin yaw, 0, cos yaw), local x is (cos yaw, 0, -sin yaw).
  const rx = origin.x - center.x;
  const ry = origin.y - center.y;
  const rz = origin.z - center.z;
  const o = [rx * c - rz * s, ry, rx * s + rz * c];
  const d = [dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c];
  const h = [halfX, halfY, halfZ];
  let t0 = 0;
  let t1 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const oi = o[i] as number;
    const di = d[i] as number;
    const hi = h[i] as number;
    if (Math.abs(di) < 1e-12) {
      if (Math.abs(oi) > hi) return -1;
      continue;
    }
    let a = (-hi - oi) / di;
    let b = (hi - oi) / di;
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  return t0;
}
