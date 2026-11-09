/**
 * Parametric cost and rate model (pure functions).
 *
 * hard cost = sum over segments (cross-section x Polish rate per m3 x geology) + stations + systems,
 * priced in 2026 PLN, converted at the market rate, then multiplied by the unit-price factors of the
 * current profile. Soft costs, contingency, overhead and escalation are applied by the engine as money
 * is spent. See constants.ts for every number and its source.
 */
import { CONSTANTS as K } from './constants.ts';
import { type Profile, unitFactor } from './reforms.ts';
import type { DesignFlags, Geology, Method, PhaseId, ProjectState, StationState, StationTemplate } from './types.ts';

const PLN_PER_USD = K.plnPerUsdNominal.value;
/** PLN to USD cents. */
const CENTS_PER_PLN = 100 / PLN_PER_USD;
const BORED = K.boredPlnPerM3.value;
const CUT_COVER = K.cutCoverPlnPerM3.value;
const MINED_ROCK = K.minedRockPlnPerM3.value;
const VIADUCT_PER_M = K.viaductPlnPerKm.value / 1000;
const AT_GRADE_PER_M = K.atGradePlnPerKm.value / 1000;
const SYSTEMS_UNDERGROUND_PER_M = K.systemsUndergroundPlnPerKm.value / 1000;
const SYSTEMS_SURFACE_PER_M = K.systemsSurfacePlnPerKm.value / 1000;
const TWIN_AREA = K.twinBoreAreaM2.value;
const THIRD_BORE = K.thirdBoreFactor.value;
const SINGLE_AREA = K.singleLargeAreaM2.value;
const MINED3 = K.minedThreeTrackAreaM2.value;
const MINED2 = K.minedTwoTrackAreaM2.value;
const CC_WIDE = K.cutCoverWideWidthM.value;
const CC_COMPACT = K.cutCoverCompactWidthM.value;
const CC_DEEP = K.cutCoverDeepDepthM.value;
const CC_SHALLOW = K.cutCoverShallowDepthM.value;
const STATION = K.stationPln.value;
const DAYS_PER_MONTH = K.daysPerMonth.value;

/** Per-metre cost factor and advance-rate factor by ground class. Doc 06 section 7.4; numeric values are tuning, UNVERIFIED there. */
export const GEOLOGY: Record<Geology, { label: string; cost: number; rate: number }> = {
  softGround: { label: 'Soft clay, sand, alluvium', cost: 1.0, rate: 1.0 },
  bayMud: { label: 'Saturated sand or Bay Mud', cost: 1.3, rate: 0.8 },
  mixedFace: { label: 'Mixed face', cost: 1.5, rate: 0.6 },
  rock: { label: 'Competent rock', cost: 0.9, rate: 1.5 },
  faultZone: { label: 'Fault zone or melange', cost: 1.8, rate: 0.4 },
};

export function isUnderground(m: Method): boolean {
  return m !== 'atGrade' && m !== 'viaduct';
}

export function isTbm(m: Method): boolean {
  return m === 'boredTwin' || m === 'boredSingleLarge';
}

export function designFlags(p: Profile): DesignFlags {
  return {
    threeTrack: p['design.threeTrack'] > 0,
    deepBox: p['design.deepBox'] > 0,
    oversizeStations: p['design.oversizeStations'] > 0,
    bespoke: p['design.bespoke'] > 0,
    terminalOversize: p['design.terminalOversize'] > 0,
    twinBoreDefault: p['design.twinBoreDefault'] > 0,
  };
}

/** The method actually built: the twin-bore standard redraws mined caverns and giant single bores as twin tubes. */
export function effectiveMethod(m: Method, f: DesignFlags): Method {
  if (f.twinBoreDefault && (m === 'mined' || m === 'boredSingleLarge')) return 'boredTwin';
  return m;
}

/** Excavated cross-section in m2 for an effective method (0 for surface methods). */
export function sectionAreaM2(m: Method, f: DesignFlags): number {
  switch (m) {
    case 'boredTwin':
      return TWIN_AREA * (f.threeTrack ? THIRD_BORE : 1);
    case 'boredSingleLarge':
      return SINGLE_AREA;
    case 'mined':
      return f.threeTrack ? MINED3 : MINED2;
    case 'cutAndCover':
      return (f.threeTrack ? CC_WIDE : CC_COMPACT) * (f.deepBox ? CC_DEEP : CC_SHALLOW);
    default:
      return 0;
  }
}

/** Radius in metres of the capsule the heading carves, and the lateral offsets of its tubes. */
export function carveShape(m: Method, f: DesignFlags): { radiusM: number; laterals: number[] } {
  switch (m) {
    case 'boredTwin': {
      const half = K.twinBoreSpacingM.value / 2;
      return { radiusM: K.twinBoreRadiusM.value, laterals: f.threeTrack ? [-2 * half, 0, 2 * half] : [-half, half] };
    }
    case 'boredSingleLarge':
    case 'mined':
      return { radiusM: Math.sqrt(sectionAreaM2(m, f) / Math.PI), laterals: [0] };
    case 'cutAndCover':
      return { radiusM: (f.threeTrack ? CC_WIDE : CC_COMPACT) / 2, laterals: [0] };
    default:
      return { radiusM: 0, laterals: [] };
  }
}

function relieved(factor: number, relief: number, penaltyAbove: boolean): number {
  const isPenalty = penaltyAbove ? factor > 1 : factor < 1;
  return isPenalty ? 1 + (factor - 1) * (1 - relief) : factor;
}

/** Civil works per route-metre at Polish prices, in PLN. */
export function civilPlnPerM(m: Method, geology: Geology, f: DesignFlags, geologyRelief: number): number {
  const g = relieved(GEOLOGY[geology].cost, geologyRelief, true);
  switch (m) {
    case 'boredTwin':
    case 'boredSingleLarge':
      return sectionAreaM2(m, f) * BORED * g;
    case 'mined':
      // Doc 11 section 6.2 prices soft-ground mining at the bored soft-ground rate; rock gets the mined rock rate.
      return sectionAreaM2(m, f) * (geology === 'rock' ? MINED_ROCK : BORED * g);
    case 'cutAndCover':
      return sectionAreaM2(m, f) * CUT_COVER;
    case 'viaduct':
      return VIADUCT_PER_M;
    default:
      return AT_GRADE_PER_M;
  }
}

/** Track, power and signalling per route-metre at Polish prices, in PLN. */
export function systemsPlnPerM(m: Method, f: DesignFlags): number {
  if (!isUnderground(m)) return SYSTEMS_SURFACE_PER_M;
  return SYSTEMS_UNDERGROUND_PER_M * (f.threeTrack ? K.threeTrackSystemsFactor.value : 1);
}

/** One station at Polish prices, in PLN. */
export function stationPln(template: StationTemplate, depthM: number, f: DesignFlags): number {
  const bespoke = f.bespoke ? K.stationBespokeFactor.value : 1;
  const depth = 1 + K.stationDepthFactorPerM.value * Math.max(0, depthM - K.stationDepthFreeM.value);
  // A three-track mainline station needs a wider box whatever the mezzanine policy.
  const size = (f.oversizeStations ? K.stationOversizeFactor.value : 1) * (f.threeTrack ? K.mainlineStationFactor.value : 1);
  switch (template) {
    case 'undergroundStandard':
      return STATION * size * bespoke * depth;
    case 'undergroundDeepMined':
      return STATION * size * bespoke * depth * K.stationMinedFactor.value;
    case 'inBore':
      return STATION * bespoke * depth * K.stationInBoreFactor.value;
    case 'terminalFitOut':
      return STATION * K.terminalFitOutShare.value * (f.terminalOversize ? K.terminalOversizeFactor.value : 1) * bespoke;
    case 'elevated':
      return K.elevatedStationPln.value;
    default:
      return K.surfaceStationPln.value;
  }
}

/** Station build time in days at the given construction time factor. */
export function stationBuildDays(template: StationTemplate, f: DesignFlags, constructionFactor: number): number {
  let months: number;
  switch (template) {
    case 'undergroundStandard':
      months = K.stationBuildMonths.value * (f.oversizeStations ? K.stationOversizeTimeFactor.value : 1);
      break;
    case 'undergroundDeepMined':
      months = K.deepMinedStationBuildMonths.value * (f.oversizeStations ? K.stationOversizeTimeFactor.value : 1);
      break;
    case 'inBore':
      months = K.inBoreStationBuildMonths.value;
      break;
    case 'terminalFitOut':
      months = K.terminalFitOutBuildMonths.value;
      break;
    case 'elevated':
      months = K.elevatedStationBuildMonths.value;
      break;
    default:
      months = K.surfaceStationBuildMonths.value;
  }
  return months * DAYS_PER_MONTH * constructionFactor;
}

/** Design flags a project is built to: frozen at tender, else the current standards. */
export function projectFlags(project: ProjectState, p: Profile): DesignFlags {
  return project.frozen ?? designFlags(p);
}

export interface HardBreakdown {
  civilCents: number;
  stationsCents: number;
  systemsCents: number;
  totalCents: number;
}

/**
 * Unescalated hard cost of a whole project.
 * `polishPrices` = unit factors forced to 1 (same design, Polish prices).
 */
export function hardCost(project: ProjectState, p: Profile, flags: DesignFlags, polishPrices: boolean): HardBreakdown {
  const relief = p['tbm.geologyRelief'];
  const unit = polishPrices ? 1 : unitFactor(p);
  const sysFactor = polishPrices ? 1 : p['systems.factor'];
  let civil = 0;
  let systems = 0;
  const { waypoints, methods, cum } = project;
  for (let i = 0; i < methods.length; i++) {
    const len = cum[i + 1] - cum[i];
    const m = effectiveMethod(methods[i], flags);
    civil += len * civilPlnPerM(m, waypoints[i].geology ?? 'softGround', flags, relief);
    systems += len * systemsPlnPerM(m, flags);
  }
  let stations = 0;
  for (const s of project.stations) stations += stationPln(s.template, s.depthM, flags);
  const civilCents = civil * CENTS_PER_PLN * unit;
  const stationsCents = stations * CENTS_PER_PLN * unit;
  const systemsCents = systems * CENTS_PER_PLN * unit * sysFactor;
  return { civilCents, stationsCents, systemsCents, totalCents: civilCents + stationsCents + systemsCents };
}

/** Unescalated cost in cents of one station at current prices. */
export function stationCostCents(s: StationState, p: Profile, flags: DesignFlags): number {
  return stationPln(s.template, s.depthM, flags) * CENTS_PER_PLN * unitFactor(p);
}

/** Unescalated civil cost in cents per metre at current prices. */
export function civilCentsPerM(m: Method, geology: Geology, p: Profile, flags: DesignFlags): number {
  return civilPlnPerM(m, geology, flags, p['tbm.geologyRelief']) * CENTS_PER_PLN * unitFactor(p);
}

/** Unescalated systems cost in cents for the whole project at current prices. */
export function systemsCostCents(project: ProjectState, p: Profile, flags: DesignFlags): number {
  return hardCost(project, p, flags, false).systemsCents;
}

const TBM_BASE = K.tbmPeakMPerDay.value * K.tbmUtilisation.value;

/**
 * Advance of a heading in m/day, before breakdowns.
 * Twin-bore metro machines run at the same rate in every profile (doc 11 section 5.3); everything
 * else is slowed by the construction time factor.
 */
export function advanceRate(m: Method, geology: Geology, p: Profile, doneM: number): number {
  const g = relieved(GEOLOGY[geology].rate, p['tbm.geologyRelief'], false);
  const ctf = p['time.constructionFactor'];
  switch (m) {
    case 'boredTwin':
      return TBM_BASE * g * p['tbm.rate'] * (doneM < K.twinBoreStartupM.value ? K.startupRateFactor.value : 1);
    case 'boredSingleLarge':
      return ((K.largeBoreMPerDay.value * g * p['tbm.rate']) / ctf) * (doneM < K.largeBoreStartupM.value ? K.startupRateFactor.value : 1);
    case 'mined':
      return (K.minedMPerDay.value * g) / ctf;
    case 'cutAndCover':
      return K.cutCoverMPerDay.value / ctf;
    case 'viaduct':
      return K.viaductMPerDay.value / ctf;
    default:
      return K.atGradeMPerDay.value / ctf;
  }
}

/** Planned length in days of a clock-driven phase. Construction is driven by headings and stations instead. */
export function phaseDays(phase: Exclude<PhaseId, 'construction'>, p: Profile): number {
  return p[`time.${phase}`] * DAYS_PER_MONTH;
}

export const PHASE_LABELS: Record<PhaseId, string> = {
  planning: 'Planning and environmental review',
  permitting: 'Permitting and funding agreement',
  procurement: 'Procurement',
  utilities: 'Utility relocation and site preparation',
  construction: 'Construction',
  fitOut: 'Fit-out and testing',
};
