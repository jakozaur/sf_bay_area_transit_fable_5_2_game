/**
 * @bayvox/sim: deterministic game sim (doc 10 section 3.1). One tick is one game day, state changes only
 * through commands, money is integer cents, randomness comes from the seeded core PRNG.
 */
export const PACKAGE_NAME = '@bayvox/sim';

export { CONSTANTS, type Constant, type ConstantId, constantsTable, DAYS_PER_YEAR, ESCALATION_DAILY } from './constants.ts';
export { dateAtTick, daysToIso, isoToDays } from './dates.ts';
export { FEEDERS, type Feeder, feederById, type RidershipBreakdown, ridership, ZONES, type Zone } from './demand.ts';
export { autopilotCommands, eventHazardPerYear, expectedAvailability, parseCommand, projectLengthM, projectSpentCents } from './engine.ts';
export { EVENTS, type EventDef, type EventOption, eventById } from './events.ts';
export { comparison, type Forecast, forecastDesign, forecastProject, polandBenchmark } from './forecast.ts';
export { carveCapsules, chainages, nearestChainage, offsetPointAt, pointAt } from './geometry.ts';
export {
  advanceRate,
  carveShape,
  civilPlnPerM,
  designFlags,
  effectiveMethod,
  GEOLOGY,
  hardCost,
  isTbm,
  isUnderground,
  PHASE_LABELS,
  phaseDays,
  sectionAreaM2,
  stationBuildDays,
  stationPln,
  systemsPlnPerM,
} from './model.ts';
export {
  BRANCHES,
  type Branch,
  EVENT_IDS,
  type EventId,
  POLAND_PROFILE,
  type Profile,
  type ProfileKey,
  profileFor,
  profileReforms,
  REFORMS,
  type ReformDef,
  type ReformEffect,
  reformById,
  STATUS_QUO_PROFILE,
  unitFactor,
} from './reforms.ts';
export { evaluateObjectives, validateScenario } from './scenario.ts';
export { createSim, EVENT_CARDS, type GameSim, hashState, loadSim, type SimOptions, type WorldSink } from './sim.ts';
export * from './types.ts';
