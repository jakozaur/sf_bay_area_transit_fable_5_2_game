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

/**
 * Standards a project would be tendered under: the profile's mandates, adjusted by the design chooser.
 * An explicit tunnel choice is built as chosen (the twin-bore standard only redraws designs nobody chose),
 * and an explicit mezzanine box is paid for even after the mandate is gone.
 */
export function standardsFor(project: Pick<ProjectState, 'tunnelChoice' | 'stationBox'>, p: Profile): DesignFlags {
  const f = designFlags(p);
  if (project.tunnelChoice !== null) f.twinBoreDefault = false;
  if (project.stationBox === 'mezzanineBox') f.oversizeStations = true;
  return f;
}

/** Design flags a project is built to: frozen at tender, else the current standards and choices. */
export function projectFlags(project: Pick<ProjectState, 'frozen' | 'tunnelChoice' | 'stationBox'>, p: Profile): DesignFlags {
  return project.frozen ?? standardsFor(project, p);
}

/** The part of a project the cost functions read, so a line that is still being drawn can be priced. */
export type ProjectGeometry = Pick<ProjectState, 'waypoints' | 'methods' | 'cum'> & {
  stations: readonly Pick<StationState, 'template' | 'depthM'>[];
};

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
export function hardCost(project: ProjectGeometry, p: Profile, flags: DesignFlags, polishPrices: boolean): HardBreakdown {
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
export function stationCostCents(s: Pick<StationState, 'template' | 'depthM'>, p: Profile, flags: DesignFlags): number {
  return stationPln(s.template, s.depthM, flags) * CENTS_PER_PLN * unitFactor(p);
}

/** Unescalated civil cost in cents per metre at current prices. */
export function civilCentsPerM(m: Method, geology: Geology, p: Profile, flags: DesignFlags): number {
  return civilPlnPerM(m, geology, flags, p['tbm.geologyRelief']) * CENTS_PER_PLN * unitFactor(p);
}

/** Unescalated systems cost in cents for the whole project at current prices. */
export function systemsCostCents(project: ProjectGeometry, p: Profile, flags: DesignFlags): number {
  return hardCost(project, p, flags, false).systemsCents;
}

const TBM_PEAK = K.tbmPeakMPerDay.value;
const TBM_UTILISATION = K.tbmUtilisation.value;
const TBM_MAX_UTILISATION = K.tbmMaxUtilisation.value;
/** Peak rate of the large-bore class, so that the status-quo utilisation gives its measured mean. */
const LARGE_PEAK = K.largeBoreMPerDay.value / TBM_UTILISATION;

/** Share of the time a machine bores under profile `p`: the base utilisation times the tunnelling reforms, capped (PLAN 6.7). */
export function tbmUtilisation(p: Profile): number {
  return Math.min(TBM_MAX_UTILISATION, TBM_UTILISATION * p['tbm.rate']);
}

/**
 * Advance of a heading in m/day, before breakdowns.
 * Twin-bore metro machines run at the same rate in every profile (doc 11 section 5.3); everything
 * else is slowed by the construction time factor. Tunnelling reforms raise the utilisation of a machine,
 * never above CONSTANTS.tbmMaxUtilisation of its peak rate.
 */
export function advanceRate(m: Method, geology: Geology, p: Profile, doneM: number): number {
  const g = relieved(GEOLOGY[geology].rate, p['tbm.geologyRelief'], false);
  const ctf = p['time.constructionFactor'];
  switch (m) {
    case 'boredTwin':
      return TBM_PEAK * tbmUtilisation(p) * g * (doneM < K.twinBoreStartupM.value ? K.startupRateFactor.value : 1);
    case 'boredSingleLarge':
      return ((LARGE_PEAK * tbmUtilisation(p) * g) / ctf) * (doneM < K.largeBoreStartupM.value ? K.startupRateFactor.value : 1);
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

/** Longest run one heading of a method works: a longer run is split into equal drives, each with its own machine or face. */
export function maxHeadingM(m: Method): number {
  if (m === 'boredTwin' || m === 'boredSingleLarge') return K.maxHeadingBoredM.value;
  if (m === 'mined' || m === 'cutAndCover') return K.maxHeadingMinedM.value;
  return K.maxHeadingSurfaceM.value;
}

export interface HeadingSpan {
  method: Method;
  fromM: number;
  toM: number;
}

/**
 * The headings a line is built in: one per run of segments with the same effective method, and a run longer
 * than maxHeadingM in equal parts. The engine, the pits and the schedule estimate all read this one list.
 */
export function headingSpans(g: Pick<ProjectGeometry, 'methods' | 'cum'>, flags: DesignFlags): HeadingSpan[] {
  const out: HeadingSpan[] = [];
  let i = 0;
  while (i < g.methods.length) {
    const method = effectiveMethod(g.methods[i], flags);
    let j = i;
    while (j + 1 < g.methods.length && effectiveMethod(g.methods[j + 1], flags) === method) j++;
    const from = g.cum[i];
    const to = g.cum[j + 1];
    const parts = Math.max(1, Math.ceil((to - from) / maxHeadingM(method) - 1e-9));
    for (let k = 0; k < parts; k++) {
      out.push({
        method,
        fromM: k === 0 ? from : from + ((to - from) * k) / parts,
        toM: k === parts - 1 ? to : from + ((to - from) * (k + 1)) / parts,
      });
    }
    i = j + 1;
  }
  return out;
}

/**
 * The Polish design of a route (owner decision): every underground segment is a twin 6.6 m bore, every
 * underground station a compact standard box. Surface and viaduct segments stay what they are. This is the
 * par the receipt starts from, and it does not move with the player's design choices.
 */
export function polishMethods(methods: readonly Method[]): Method[] {
  return methods.map((m) => (isUnderground(m) ? 'boredTwin' : m));
}

export function polishTemplate(t: StationTemplate): StationTemplate {
  return t === 'undergroundDeepMined' || t === 'inBore' ? 'undergroundStandard' : t;
}

/** Geometry of the Polish design of a line: same route and station sites, Polish methods and station templates. */
export function polishGeometry(g: ProjectGeometry): ProjectGeometry {
  return {
    waypoints: g.waypoints,
    cum: g.cum,
    methods: polishMethods(g.methods),
    stations: g.stations.map((s) => ({ template: polishTemplate(s.template), depthM: s.depthM })),
  };
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
