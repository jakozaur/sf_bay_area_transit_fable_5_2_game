/**
 * The machine each tunnel method is built with: what the design chooser shows per tunnel option and what the
 * heading entity carries to the renderer. Every figure is read from the model (carve shape, advance rate, civil
 * cost per metre); nothing here is a new cost or a new rate.
 */
import type { MachineKind } from '@bayvox/core';
import { CONSTANTS as K } from './constants.ts';
import { expectedAvailability } from './engine.ts';
import { segmentIndexAt } from './geometry.ts';
import {
  advanceRate,
  civilCentsPerM,
  effectiveMethod,
  headingShape,
  isTbm,
  isUnderground,
  type ProjectGeometry,
  sectionAreaM2,
  segmentY,
} from './model.ts';
import type { Profile } from './reforms.ts';
import type { DesignFlags, FrontState, MachineView, Method, ProjectState } from './types.ts';

/** Machine of an effective method under profile `p`; null for surface methods (track gang, viaduct crew). */
export function machineKindOf(m: Method, p: Profile): MachineKind | null {
  switch (m) {
    case 'boredTwin':
      return p['tbm.smallBore'] === 1 ? 'smallBore' : 'twinBore';
    case 'boredSingleLarge':
      return 'singleBore';
    case 'mined':
      return 'roadheader';
    case 'cutAndCover':
      return 'excavator';
    default:
      return null;
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Diameter of one tube of a heading in metres, to 0.1 m: twice the radius it carves. 0 for surface methods. */
export function machineDiameterM(m: Method, flags: DesignFlags, p: Profile): number {
  return round1(2 * headingShape(m, flags, p).radiusM);
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three'];

const PRICE_NOTE =
  'The model has no separate machine price: the figure is the civil cost of the tunnelling on this line at current prices, before soft costs and escalation, and is already inside the estimate.';

/**
 * Civil cost of the underground segments of a line, unescalated cents at current unit prices: the same sum
 * hardCost makes for those segments and the headings spend as they advance.
 */
export function tunnellingCivilCents(g: ProjectGeometry, p: Profile, flags: DesignFlags): number {
  let cents = 0;
  for (let i = 0; i < g.methods.length; i++) {
    if (!isUnderground(g.methods[i])) continue;
    const m = effectiveMethod(g.methods[i], flags);
    cents += (g.cum[i + 1] - g.cum[i]) * civilCentsPerM(m, g.waypoints[i].geology ?? 'softGround', p, flags, segmentY(g.waypoints, i));
  }
  return Math.round(cents);
}

/**
 * The machine of effective method `m` on line `g`, or null for a surface method. `metresPerDay` is the steady
 * advance in soft ground before breakdowns (advanceRate past the start-up metres), `priceCents` the civil cost
 * of the line's underground segments built this way.
 */
export function machineView(m: Method, g: ProjectGeometry, p: Profile, flags: DesignFlags): MachineView | null {
  const kind = machineKindOf(m, p);
  if (kind === null) return null;
  const shape = headingShape(m, flags, p);
  const diameterM = machineDiameterM(m, flags, p);
  const count = kind === 'roadheader' || kind === 'excavator' ? 1 : shape.laterals.length;
  let name: string;
  let what: string;
  switch (kind) {
    case 'twinBore':
      name = `${COUNT_WORDS[count] ?? count} ${diameterM} m EPB machines`;
      what = 'One tube per track, launched side by side from a shaft.';
      break;
    case 'singleBore':
      name = `One ${diameterM} m single-bore machine`;
      what = 'One tube for both tracks and the platforms.';
      break;
    case 'smallBore':
      name = `One ${diameterM} m small-bore machine`;
      what = 'Launched from the surface down a ramp, no shaft. The tube carries pods, not trains.';
      break;
    case 'roadheader':
      name = 'Roadheader, mined cavern';
      what = `A cavern cut in stages and sprayed with concrete. The diameter is the circle of the same area (${Math.round(sectionAreaM2(m, flags))} m2).`;
      break;
    default:
      name = 'Excavators, cut-and-cover trench';
      what = 'A trench dug from the street between walls, then roofed over. The diameter is the width of the trench.';
  }
  return {
    kind,
    name,
    diameterM,
    count,
    metresPerDay: Math.round(advanceRate(m, 'softGround', p, Number.POSITIVE_INFINITY) * 100) / 100,
    priceCents: tunnellingCivilCents(g, p, flags),
    note: `${what} ${PRICE_NOTE}`,
  };
}

function startupM(m: Method): number {
  if (m === 'boredTwin') return K.twinBoreStartupM.value;
  if (m === 'boredSingleLarge') return K.largeBoreStartupM.value;
  return 0;
}

/**
 * Expected game days a heading takes over the plan between two chainages of its run under profile `p`: the
 * advance rate of the ground of each segment, the slow start-up metres, and the expected share of days a boring
 * machine stands for maintenance (what a forecast uses instead of rolling breakdowns).
 */
export function expectedBoreDays(
  project: Pick<ProjectState, 'waypoints' | 'cum'>,
  f: FrontState,
  p: Profile,
  fromM: number,
  toM: number,
): number {
  const share = isTbm(f.method) ? expectedAvailability(p) : 1;
  const slowTo = f.fromM + startupM(f.method);
  let days = 0;
  let s = Math.max(f.fromM, fromM);
  const to = Math.min(f.toM, toM);
  let i = segmentIndexAt(project.cum, s);
  while (s < to - 1e-9 && i < project.cum.length - 1) {
    let end = Math.min(to, project.cum[i + 1]);
    if (s < slowTo && slowTo < end) end = slowTo;
    const rate = advanceRate(f.method, project.waypoints[i].geology ?? 'softGround', p, s - f.fromM) * share;
    days += (end - s) / rate;
    s = end;
    if (s >= project.cum[i + 1] - 1e-9) i++;
  }
  return days;
}

/**
 * Days since the launch of a heading and the days it is expected to take from launch to breakthrough at the
 * settings in force. After the breakthrough both are the days it took (to the end of that day). A heading of a save without a launch
 * day counts the days the plan gives for the metres it has bored.
 */
export function boreDays(project: ProjectState, f: FrontState, p: Profile, tick: number): { boreTotalDays: number; boreDaysDone: number } {
  if (f.breakthroughTick >= 0 && f.launchTick !== undefined) {
    // A planned heading breaks through at the end of day `breakthroughTick`, a driven one during it.
    const took = Math.min(tick, f.breakthroughTick + 1) - f.launchTick;
    return { boreTotalDays: took, boreDaysDone: took };
  }
  const at = Math.min(f.chainageM, f.toM);
  const done = f.launchTick !== undefined ? Math.max(0, tick - f.launchTick) : expectedBoreDays(project, f, p, f.fromM, at);
  if (at >= f.toM) return { boreTotalDays: done, boreDaysDone: done };
  const left = expectedBoreDays(project, f, p, at, f.toM) + f.downDays + project.delayDays;
  return { boreTotalDays: done + left, boreDaysDone: done };
}
