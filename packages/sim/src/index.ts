/**
 * @bayvox/sim: deterministic game sim (doc 10 section 3.1). One tick is one game day, state changes only
 * through commands, money is integer cents, randomness comes from the seeded core PRNG.
 */
export const PACKAGE_NAME = '@bayvox/sim';

export { checkAlignment, MIN_SEGMENT_M, minRadiusFor, vertexRadiusM } from './checks.ts';
export {
  CONSTANTS,
  type Constant,
  type ConstantId,
  constantsTable,
  DAYS_PER_YEAR,
  ESCALATION_DAILY,
  SUBSTEPS_PER_DAY,
} from './constants.ts';
export { dateAtTick, daysToIso, isoToDays, monthYear } from './dates.ts';
export { FEEDERS, type Feeder, feederById, type RidershipBreakdown, ridership, ZONES, type Zone } from './demand.ts';
export {
  DESIGN_OPTIONS,
  type DesignOptionDef,
  defaultMethod,
  designOption,
  optionLocks,
  reformUnlocks,
  stationBoxOf,
  stationSize,
  tunnelOf,
} from './design.ts';
export {
  cruiseControls,
  type DriveLimits,
  driveSubstep,
  fixOnPlan,
  holdControls,
  isRecovering,
  type PlanFix,
  type PlanPoint,
  planPointAt,
} from './drive.ts';
export {
  autopilotCommands,
  eventHazardPerYear,
  expectedAvailability,
  handDigCentsPerM3,
  isDrivable,
  PC_BREAKTHROUGH,
  PC_OPENING,
  PC_PER_MONTH,
  PC_PHASE_DONE,
  parseCommand,
  projectLengthM,
  projectSpentCents,
} from './engine.ts';
export {
  plannedConstructionDays,
  plannedHeadingDays,
  plannedStationDays,
  type QuickEstimate,
  quickEstimate,
  quickOption,
  quickProject,
} from './estimate.ts';
export { EVENTS, type EventDef, type EventOption, eventById, eventTitle } from './events.ts';
export {
  comparison,
  type DesignRun,
  designRun,
  type Forecast,
  forecastDesign,
  forecastProject,
  polandBenchmark,
  runDesign,
} from './forecast.ts';
export { capsuleBetween, carveCapsules, chainages, nearestChainage, offsetPointAt, pointAt, subPath } from './geometry.ts';
export { faceGeology, type GroundQuery, geologyOfMaterial } from './ground.ts';
export {
  advanceRate,
  carveShape,
  civilPlnPerM,
  designFlags,
  effectiveMethod,
  GEOLOGY,
  hardCost,
  headingSpans,
  isTbm,
  isUnderground,
  maxHeadingM,
  PHASE_LABELS,
  type ProjectGeometry,
  phaseDays,
  polishGeometry,
  polishMethods,
  projectFlags,
  sectionAreaM2,
  standardsFor,
  stationBuildDays,
  stationPln,
  systemsPlnPerM,
} from './model.ts';
export { RECEIPT_GROUP_LABELS, RECEIPT_LINE_DEFS, reformReceiptLines } from './receipt.ts';
export {
  BRANCHES,
  type Branch,
  EVENT_IDS,
  type EventId,
  POLAND_PROFILE,
  POLISH_PRICE_LEVEL,
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
export { createSim, EVENT_CARDS, type GameSim, hashState, loadSim, type SaveOptions, type SimOptions, type WorldSink } from './sim.ts';
export { playerSource } from './sources.ts';
export { serviceCycleS, trainsAt } from './trains.ts';
export * from './types.ts';
