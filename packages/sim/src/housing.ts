/**
 * Housing beside the line (M2): the player allows homes on land near the stations and the homes bring riders.
 * Back-of-envelope on purpose. homes = hectares x homes per hectare (both on the option, scenario data);
 * riders a day = homes x trips per home x share of them on the line (constants.ts housing*). ALL ASSUMPTIONS.
 * The small-bore reform caps what a bored line carries (constants.ts smallBore*): also assumptions.
 */
import { CONSTANTS as K } from './constants.ts';
import { ridership } from './demand.ts';
import { planDistance, pointAt } from './geometry.ts';
import { effectiveMethod, isSmallBore, projectFlags } from './model.ts';
import { profileFor } from './reforms.ts';
import type { HousingOptionDef, HousingView, ProjectState, SimState } from './types.ts';

/** Homes of an option: its land times its density. */
export function housingHomes(o: Pick<HousingOptionDef, 'hectares' | 'homesPerHectare'>): number {
  return Math.round(o.hectares * o.homesPerHectare);
}

/** Riders a day the homes of an option add: homes x trips per home x share on the line. */
export function housingRiders(o: Pick<HousingOptionDef, 'hectares' | 'homesPerHectare'>): number {
  return Math.round(housingHomes(o) * K.housingTripsPerHome.value * K.housingTransitShare.value);
}

function served(project: Pick<ProjectState, 'waypoints' | 'cum' | 'stations'>, o: HousingOptionDef): boolean {
  const reach = K.housingServedM.value;
  return project.stations.some((s) => {
    const p = pointAt(project.waypoints, project.cum, s.chainageM);
    return planDistance(p.x, p.z, o.at.x, o.at.z) <= reach;
  });
}

/** The enacted options a station of `project` serves: homes and the riders they add. */
export function housingServed(
  state: Pick<SimState, 'scenario' | 'housing'>,
  project: Pick<ProjectState, 'waypoints' | 'cum' | 'stations'>,
): { homes: number; ridersPerDayAdded: number } {
  let homes = 0;
  let ridersPerDayAdded = 0;
  const enacted = state.housing ?? [];
  for (const o of state.scenario.housing ?? []) {
    if (!enacted.includes(o.id) || !served(project, o)) continue;
    homes += housingHomes(o);
    ridersPerDayAdded += housingRiders(o);
  }
  return { homes, ridersPerDayAdded };
}

export interface ProjectRiders {
  ridersPerDay: number;
  /** The demand model alone: no housing, no capacity limit. */
  modelRiders: number;
  housing: { homes: number; ridersPerDayAdded: number };
  /** True when the line is a small bore and carries pods: the riders above are already cut and capped. */
  smallBore: boolean;
}

/**
 * Riders a day of a project in the current game: the demand model, plus the enacted housing its stations serve,
 * then the capacity catch of the small bore when one of its tunnels is one (a share of the riders stay away
 * because they must change into pods, and the tube carries no more than CONSTANTS.smallBoreRidersPerDay).
 */
export function projectRiders(state: SimState, project: ProjectState): ProjectRiders {
  const modelRiders = ridership(project, state.scenario.feeders).ridersPerDay;
  const housing = housingServed(state, project);
  const p = profileFor(state.reforms);
  const flags = projectFlags(project, p);
  const smallBore = project.methods.some((m) => isSmallBore(effectiveMethod(m, flags), p));
  let riders = modelRiders + housing.ridersPerDayAdded;
  if (smallBore) riders = Math.min(K.smallBoreRidersPerDay.value, Math.round(riders * K.smallBoreRiderShare.value));
  return { ridersPerDay: riders, modelRiders, housing, smallBore };
}

/** The options of the scenario for the snapshot. The blurb ends with the derivation, assumptions named. */
export function housingViews(state: Pick<SimState, 'scenario' | 'housing'>): HousingView[] {
  const enacted = state.housing ?? [];
  const trips = K.housingTripsPerHome.value;
  const share = Math.round(K.housingTransitShare.value * 100);
  const km = K.housingServedM.value / 1000;
  return (state.scenario.housing ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    blurb: `${o.blurb} Assumptions: ${o.hectares} ha at ${o.homesPerHectare} homes per hectare, ${trips} trips a day per home, ${share} percent of them on the line. Counts once one of your stations is within ${km} km.`,
    homes: housingHomes(o),
    capitalCost: o.capitalCost,
    ridersPerDayAdded: housingRiders(o),
    enacted: enacted.includes(o.id),
  }));
}
