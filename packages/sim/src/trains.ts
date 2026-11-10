/** Trains of a line in service, as a closed-form function of presentation time (docs/CONTRACTS.md decision 5). */
import type { ServiceView, TrainView } from './types.ts';

function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}

/** Point and direction on a polyline at chainage `s` measured from its first point. */
function poseAt(path: ServiceView['path'], s: number): { x: number; y: number; z: number; yaw: number; pitch: number } {
  let left = Math.max(0, s);
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (left <= len || i + 2 === path.length) {
      const t = len > 0 ? Math.min(1, left / len) : 0;
      return {
        x: a.x + dx * t,
        y: a.y + dy * t,
        z: a.z + dz * t,
        yaw: Math.atan2(dx, dz),
        pitch: Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)),
      };
    }
    left -= len;
  }
  throw new Error('sim trainsAt: service path has fewer than two points');
}

/**
 * Trains of a service at presentation time `clockSeconds` (any monotonic real-time clock; it is not sim state).
 * Closed form: trains shuttle between the first and last stop, dwell `dwellS` at each stop, and are spaced
 * evenly over the `cycleS` round trip. Same inputs, same output.
 */
export function trainsAt(service: ServiceView, clockSeconds: number): TrainView[] {
  if (!Number.isFinite(clockSeconds)) throw new Error(`sim trainsAt: clockSeconds must be finite, got ${clockSeconds}`);
  const stops = service.stops;
  if (stops.length < 2 || service.path.length < 2 || !(service.cycleS > 0) || !(service.cruiseMps > 0))
    throw new Error(`sim trainsAt: service "${service.id}" needs two stops, a path and positive kinematics`);
  const half = service.cycleS / 2;
  const out: TrainView[] = [];
  for (let k = 0; k < service.trains; k++) {
    let t = (clockSeconds + (k * service.cycleS) / service.trains) % service.cycleS;
    if (t < 0) t += service.cycleS;
    const direction: 1 | -1 = t < half ? 1 : -1;
    let tau = direction === 1 ? t : t - half;
    // Walk the stops in travel order: dwell, then run to the next one.
    let chainageM = direction === 1 ? stops[0].chainageM : stops[stops.length - 1].chainageM;
    let atStationId: string | null = null;
    for (let i = 0; i + 1 < stops.length; i++) {
      const from = direction === 1 ? stops[i] : stops[stops.length - 1 - i];
      const to = direction === 1 ? stops[i + 1] : stops[stops.length - 2 - i];
      if (tau < service.dwellS) {
        chainageM = from.chainageM;
        atStationId = from.stationId;
        break;
      }
      tau -= service.dwellS;
      const run = Math.abs(to.chainageM - from.chainageM) / service.cruiseMps;
      if (tau < run) {
        chainageM = from.chainageM + (to.chainageM - from.chainageM) * smooth(tau / run);
        atStationId = null;
        break;
      }
      tau -= run;
      chainageM = to.chainageM;
      atStationId = to.stationId;
    }
    const pose = poseAt(service.path, chainageM);
    out.push({
      id: `${service.id}/t${k + 1}`,
      serviceId: service.id,
      position: { x: pose.x, y: pose.y, z: pose.z },
      // The consist points the way it travels.
      yaw: direction === 1 ? pose.yaw : pose.yaw + Math.PI,
      pitch: direction === 1 ? pose.pitch : -pose.pitch,
      cars: service.cars,
      carLengthM: service.carLengthM,
      chainageM,
      direction,
      atStationId,
    });
  }
  return out;
}

/** Round trip of a shuttle over `lengthM` with `stops` stops: out and back, a dwell at every stop passed. */
export function serviceCycleS(lengthM: number, stops: number, cruiseMps: number, dwellS: number): number {
  return 2 * (lengthM / cruiseMps + dwellS * (stops - 1));
}
