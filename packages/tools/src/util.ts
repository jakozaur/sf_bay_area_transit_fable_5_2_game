/** Small shared pieces of the tools: an observable value, number formatting, plan geometry. */
import type { Readable, WorldPos } from '@bayvox/core';
import type { Waypoint } from '@bayvox/sim';

export interface Value<T> extends Readable<T> {
  /** Stores and notifies. Callers decide whether the value changed. */
  set(value: T): void;
  /** Drops every subscriber. */
  clear(): void;
}

export function createValue<T>(initial: T): Value<T> {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    set(value) {
      current = value;
      for (const cb of [...listeners]) cb(value);
    },
    clear() {
      listeners.clear();
    },
  };
}

/** "$6.84B", "$420M", "$35K", "$120". Money is integer cents. */
export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e7) return `${sign}$${Math.round(abs / 1e6)}M`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** "2.09 km" from a kilometre, "640 m" below it. */
export function formatLength(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Centimetre rounding, so waypoints in commands and saves carry no float noise. */
export function cm(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Signed plan deflection at an interior vertex in radians: 0 is straight on, the magnitude is the turn angle. */
export function deflection(a: Waypoint, v: Waypoint, b: Waypoint): number {
  const ux = v.x - a.x;
  const uz = v.z - a.z;
  const wx = b.x - v.x;
  const wz = b.z - v.z;
  if ((ux === 0 && uz === 0) || (wx === 0 && wz === 0)) return 0;
  return Math.atan2(ux * wz - uz * wx, ux * wx + uz * wz);
}

/**
 * Smoothed centreline of a waypoint polyline, for display: every interior vertex is replaced by a circular
 * arc tangent to both legs. The arc radius is `radiusM`, reduced where a leg is too short to hold the tangent
 * (each arc may use at most half of a leg), so the curve never leaves the polygon and always exists.
 * Elevation eases across the arc. Points are spaced about `stepM` along the arcs; straights are two points.
 */
export function smoothCentreline(wps: readonly Waypoint[], radiusM: number, stepM = 6): WorldPos[] {
  if (!(radiusM > 0) || !(stepM > 0)) {
    throw new RangeError(`smoothCentreline: radius and step must be positive, got ${radiusM} and ${stepM}`);
  }
  const out: WorldPos[] = [];
  if (wps.length === 0) return out;
  out.push({ x: wps[0].x, y: wps[0].y, z: wps[0].z });
  for (let i = 1; i + 1 < wps.length; i++) {
    const a = wps[i - 1];
    const v = wps[i];
    const b = wps[i + 1];
    const la = Math.hypot(v.x - a.x, v.z - a.z);
    const lb = Math.hypot(b.x - v.x, b.z - v.z);
    const half = Math.abs(deflection(a, v, b)) / 2;
    // Straight on, a spike back on itself, or a zero-length leg: keep the vertex.
    if (half < 1e-4 || half > Math.PI / 2 - 1e-4 || la === 0 || lb === 0) {
      out.push({ x: v.x, y: v.y, z: v.z });
      continue;
    }
    const tangent = Math.min(radiusM * Math.tan(half), la / 2, lb / 2);
    const r = tangent / Math.tan(half);
    const ax = (a.x - v.x) / la;
    const az = (a.z - v.z) / la;
    const bx = (b.x - v.x) / lb;
    const bz = (b.z - v.z) / lb;
    // Tangent points on both legs, and the arc centre on the bisector.
    const p0 = { x: v.x + ax * tangent, z: v.z + az * tangent, y: v.y + ((a.y - v.y) * tangent) / la };
    const p1 = { x: v.x + bx * tangent, z: v.z + bz * tangent, y: v.y + ((b.y - v.y) * tangent) / lb };
    const bl = Math.hypot(ax + bx, az + bz);
    const dist = r / Math.cos(half);
    const cx = v.x + ((ax + bx) / bl) * dist;
    const cz = v.z + ((az + bz) / bl) * dist;
    const start = Math.atan2(p0.z - cz, p0.x - cx);
    let sweep = Math.atan2(p1.z - cz, p1.x - cx) - start;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    else if (sweep < -Math.PI) sweep += 2 * Math.PI;
    const n = Math.max(2, Math.ceil((Math.abs(sweep) * r) / stepM));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const ang = start + sweep * u;
      // Quadratic ease of the elevation through the vertex level.
      const y = (1 - u) * (1 - u) * p0.y + 2 * u * (1 - u) * v.y + u * u * p1.y;
      out.push({ x: cx + Math.cos(ang) * r, y, z: cz + Math.sin(ang) * r });
    }
  }
  if (wps.length > 1) {
    const l = wps[wps.length - 1];
    out.push({ x: l.x, y: l.y, z: l.z });
  }
  return out;
}

/** Distance in CSS pixels from point p to the segment a-b, and the parameter 0..1 of the nearest point. */
export function screenSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return { distance: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), t };
}
