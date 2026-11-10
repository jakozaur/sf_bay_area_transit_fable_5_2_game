/**
 * Every tunable number of the cost, time and demand model, with its source.
 *
 * Currency: nominal USD, all-in, per the owner decision that the headline comparison is per km in
 * nominal USD against Polish urban rail tunnels. Polish unit rates are 2026 PLN divided by the market
 * exchange rate. `verified: false` marks values that are assumptions, tuning, or flagged UNVERIFIED
 * in the research docs. "doc NN" is docs/research/NN-*.md.
 */

export interface Constant {
  value: number;
  unit: string;
  source: string;
  verified: boolean;
}

function c(value: number, unit: string, source: string, verified = true): Constant {
  return { value, unit, source, verified };
}

export const CONSTANTS = {
  // --- Currency ---
  plnPerUsdNominal: c(3.71, 'PLN/USD', 'doc 11 section 3.2 table header and 5.3 (2026 market rate)'),
  plnPerUsdPpp: c(2.3, 'PLN/USD', 'doc 11 section 5.1 rule 2 (civil-engineering PPP); reference only, the sim runs nominal'),

  // --- Polish unit rates, 2026 PLN ---
  boredPlnPerM3: c(
    3000,
    'PLN/m3 bored',
    'doc 11 sections 3.2 and 5.3: road TBM range 1,950 (Swinoujscie structure only) to 5,200 (all-in with road deck, ramps, fans), recommended 4,400; doc 11 section 6.3 calibration note: Warsaw metro record implies 2,340. 3,000 is a CALIBRATION CHOICE inside that range because track and systems are priced separately here; it puts a Warsaw-like line within 10 percent of the M2 extension record (see model.test.ts)',
    false,
  ),
  cutCoverPlnPerM3: c(1450, 'PLN/m3 excavated', 'doc 11 section 5.3 (S2 Ursynow top-down box, structure included)'),
  minedRockPlnPerM3: c(1250, 'PLN/m3', 'doc 11 section 5.3 (S7 Lubon Maly mined rock tunnel)'),
  viaductPlnPerKm: c(88e6, 'PLN/km', 'doc 11 section 5.3 (double-track viaduct, 11 m deck at 8,000 PLN/m2)'),
  atGradePlnPerKm: c(20e6, 'PLN/km', 'doc 11 section 5.3 (double-track formation; the 0.5 width factor is UNVERIFIED there)', false),
  stationPln: c(290e6, 'PLN/station', 'doc 11 section 6.3 (Warsaw M2 extensions, 48 percent of 520 mln PLN/km at 0.85 stations/km)'),
  surfaceStationPln: c(30e6, 'PLN/station', 'doc 11 section 6.3 (assumption there)', false),
  elevatedStationPln: c(60e6, 'PLN/station', 'assumption: twice the surface station; no source', false),
  systemsUndergroundPlnPerKm: c(65e6, 'PLN/route-km', 'doc 11 section 6.3 (metro track, power, signalling: 12 percent of 520 mln PLN/km)'),
  systemsSurfacePlnPerKm: c(
    25e6,
    'PLN/route-km',
    'doc 11 section 6.3 (mainline track, 25 kV, signalling; the 60 percent share is UNVERIFIED)',
    false,
  ),

  // --- Cross-sections ---
  twinBoreAreaM2: c(68.4, 'm2', 'doc 11 section 5.1 (two 6.6 m tubes, 34.2 m2 each)'),
  twinBoreRadiusM: c(3.3, 'm', 'doc 11 section 5.1 (6.6 m excavated diameter)'),
  twinBoreSpacingM: c(11, 'm', 'assumption: tube centres about 1.7 diameters apart', false),
  singleLargeAreaM2: c(205, 'm2', 'doc 11 section 6.2 (BART Silicon Valley Phase II single bore, 16.15 m)'),
  minedThreeTrackAreaM2: c(190, 'm2', 'doc 11 section 6.2 (The Portal mined section, ASSUMED there: 3 tracks, 16.8 m clear width)', false),
  minedTwoTrackAreaM2: c(100, 'm2', 'assumption: two-track mined section, no source', false),
  cutCoverWideWidthM: c(22, 'm', 'doc 11 section 6.2 (The Portal box 22 m wide, ASSUMED there)', false),
  cutCoverCompactWidthM: c(12.5, 'm', 'assumption: two tracks plus walkways and walls', false),
  cutCoverDeepDepthM: c(18, 'm', 'doc 11 section 6.2 (The Portal box 18 m deep, ASSUMED there)', false),
  cutCoverShallowDepthM: c(9, 'm', 'assumption: one level under the street', false),
  thirdBoreFactor: c(1.5, 'x', 'assumption: a three-track mandate on a twin-bore design adds a third tube', false),

  // --- Design and scope factors ---
  threeTrackSystemsFactor: c(1.5, 'x', 'doc 11 section 6.3 ("3-track systems" add-on for The Portal)'),
  stationOversizeFactor: c(
    1.33,
    'x',
    'doc 06 section 7.5 (Bay Area station right-sizing and catalogue lever 1.60 in total, scaled from TCP 2.06 in New York); 1.33 x 1.2 = 1.6, the split between the two is an assumption',
    false,
  ),
  stationBespokeFactor: c(
    1.2,
    'x',
    'doc 06 section 7.5 (see stationOversizeFactor; TCP has 1.35 for unstandardised systems and finishes)',
    false,
  ),
  mainlineStationFactor: c(
    1.74,
    'x',
    'assumption: a three-track mainline station box against a two-track one. With the 1.6 above it makes 4th and Townsend 2.8 standard stations; doc 06 section 7.4 puts a mainline station at 4 to 6',
    false,
  ),
  stationMinedFactor: c(1.5, 'x', 'doc 06 section 7.4 (TCP: mined station 1.5x per volume)'),
  stationInBoreFactor: c(1.2, 'x', 'doc 06 section 7.4 (platforms inside a 16 m bore)', false),
  stationDepthFreeM: c(20, 'm', 'doc 06 section 7.4 (depth factor 1.0 down to 20 m)', false),
  stationDepthFactorPerM: c(0.04, '1/m', 'doc 06 section 7.4 (+4 percent per metre below 20 m; assumption there)', false),
  terminalFitOutShare: c(0.5, 'stations', 'doc 11 section 6.3 (fit-out of the existing trainbox counted as half a station)'),
  terminalOversizeFactor: c(
    2.25,
    'x',
    'assumption from doc 05 section 3.1 scope: 6 tracks and 3 island platforms against a 4-track terminal',
    false,
  ),

  // --- Status-quo unit price factors (reformed value is 1.0 for each) ---
  procurementFactor: c(1.5, 'x', 'doc 06 section 7.5 (TCP 1.85 in New York, scaled); doc 07 section 4 uses 1.6'),
  labourFactor: c(1.3, 'x', 'doc 07 section 4 (site staffing and work hours; TCP 1.5 in New York, discounted)'),
  thirdPartyFactor: c(1.2, 'x', 'doc 07 section 4 (utilities and third parties; TCP agency factor about 20 percent)'),
  priceLevelFactor: c(
    1.61,
    'x',
    'doc 11 sections 4.2 and 5.1: 3.71 / 2.3, market rate over civil-engineering PPP. No reform removes it (doc 11, PLAN 6.8): it is its own receipt line in every column but Poland',
    false,
  ),
  systemsStandardisationFactor: c(1.15, 'x', 'doc 06 section 7.5 (systems standardisation lever)'),
  buyAmericaFactor: c(1.15, 'x', 'doc 07 section 4 (rolling stock and systems only; "no solid premium estimate")', false),

  // --- Soft costs, contingency, delay ---
  softFixedStatusQuo: c(
    0.3,
    'share of hard',
    'doc 06 section 7.5 (soft costs 30 percent); doc 07 section 1 reports about 40 percent for BART SV II once overhead is included',
  ),
  softFixedReformed: c(0.1, 'share of hard', 'doc 06 sections 7.1 and 7.3 (TCP baseline 7 to 10 percent)'),
  overheadPerYearStatusQuo: c(
    0.02,
    'share of hard per year',
    'assumption inside doc 06 section 7.5 ("3 to 4 percent per year" for escalation plus standing army)',
    false,
  ),
  overheadPerYearReformed: c(0.01, 'share of hard per year', 'assumption: lean in-house client team (doc 07 S1)', false),
  contingencyStatusQuo: c(
    0.35,
    'share of hard plus soft',
    'doc 06 sections 3.3 and 7.5 (30 to 40 percent held and always spent; GLX carried 25 plus 7 percent)',
  ),
  contingencyReformed: c(0, 'share', 'doc 11 section 5.2 (Polish rates keep 23 percent VAT as the implicit contingency)'),
  escalationPerYear: c(0.04, '1/year', 'doc 07 section 4 (1.04 per year of delay; SPUR 3 to 5 percent)'),

  // --- Phase durations, months ---
  planningMonthsStatusQuo: c(48, 'months', 'doc 07 section 4 (CEQA plus NEPA 3.5 to 4.5 years)'),
  planningMonthsReformed: c(6, 'months', 'doc 07 section 4 (0.5 years; Madrid about 5 months)'),
  permittingMonthsStatusQuo: c(
    38,
    'months',
    'doc 05 section 3.1 (The Portal: FTA Engineering May 2024 to FFGA target July 2027); inside the 2 to 4 years of doc 07 section 4',
  ),
  permittingMonthsReformed: c(17, 'months', 'doc 11 section 5.3 (10 months design plus 7 months ZRID)'),
  procurementMonthsStatusQuo: c(23, 'months', 'doc 05 section 3.1 and doc 06 section 3.1 (FFGA July 2027 to civil contract award Q2 2029)'),
  procurementMonthsReformed: c(12, 'months', 'doc 06 section 2.2 (Lodz tunnel: tender Nov 2016, contract Dec 2017)'),
  utilitiesMonthsStatusQuo: c(24, 'months', 'doc 07 section 4 (ROW and utilities 2 to 8 years; low end)'),
  utilitiesMonthsReformed: c(13, 'months', 'doc 11 section 5.3 (contract to TBM launch 30 months minus 17 months design and permit)'),
  fitOutMonths: c(
    20,
    'months',
    'doc 11 section 5.3 (breakthrough to opening: Poland 21, Bay Area comparators 15 to 22; no gap, so no reform changes it)',
  ),
  constructionTimeFactorStatusQuo: c(1.5, 'x', 'doc 11 section 5.3 (build x1.5 to x2); doc 07 section 4 has 8 years against 3'),
  daysPerMonth: c(30.4375, 'days', 'calendar arithmetic'),

  // --- Station build durations, months at reformed productivity ---
  stationBuildMonths: c(
    22,
    'months',
    'assumption bounded by Warsaw M2 extension contract-to-opening of 3 to 4 years (doc 06 section 2.1); tuned with the status-quo factor so The Portal plan opens in Q1 2036',
    false,
  ),
  stationOversizeTimeFactor: c(1.1, 'x', 'assumption: a box twice the size takes a little longer', false),
  deepMinedStationBuildMonths: c(36, 'months', 'assumption', false),
  terminalFitOutBuildMonths: c(12, 'months', 'assumption', false),
  inBoreStationBuildMonths: c(18, 'months', 'assumption', false),
  surfaceStationBuildMonths: c(6, 'months', 'assumption', false),
  elevatedStationBuildMonths: c(9, 'months', 'assumption', false),

  // --- Advance rates, m/day ---
  tbmPeakMPerDay: c(30, 'm/day', 'doc 06 section 7.3 (EPB soft ground peak)'),
  tbmUtilisation: c(0.35, 'share', 'doc 06 sections 6.3 and 7.3 (TCP 20 to 40 percent; gives 10.5 m/day, Warsaw 10 to 12)'),
  tbmMaxUtilisation: c(
    0.9,
    'share',
    'docs/PLAN.md section 6.7 and doc 06 section 7.4: no stack of tunnelling reforms takes a machine above 0.90 of its peak rate (27 m/day in dry sand)',
  ),
  largeBoreMPerDay: c(8, 'm/day', 'doc 11 section 5.3 (12 to 15 m road machine, Polish mean; status quo about 5)'),
  minedMPerDay: c(2.5, 'm/day', 'doc 11 section 5.3 (2 to 3 m/day per tube)'),
  cutCoverMPerDay: c(
    3,
    'm/day',
    'assumption from doc 11 section 3.1: S2 Ursynow 2,335 m of 41 m box in about 4 years is 1.6 m/day; a narrower box goes faster',
    false,
  ),
  atGradeMPerDay: c(20, 'm/day', 'doc 11 section 5.3 (1.5 to 2.5 months per km per contract)'),
  viaductMPerDay: c(15, 'm/day', 'assumption: slower than at-grade formation', false),
  twinBoreStartupM: c(150, 'm', 'assumption scaled from doc 11 section 5.3 (road TBM: first 300 m slow)', false),
  largeBoreStartupM: c(300, 'm', 'doc 11 section 5.3 (first 300 m at 2 to 3 m/day)'),
  startupRateFactor: c(0.4, 'x', 'doc 11 sections 3.3 and 5.3 (start-up 1.5 to 3 m/day against about 8)'),
  breakdownPerDay: c(1 / 120, '1/day', 'tuning: one stoppage every four months of boring; no source', false),
  breakdownMinDays: c(3, 'days', 'tuning', false),
  breakdownSpanDays: c(12, 'days', 'tuning: stoppage lasts 3 to 14 days', false),

  // --- Round 2: driving, time-lapse, alignment limits, free digging (docs/CONTRACTS.md; the SIM work package may retune values, not names) ---
  substepsPerDay: c(
    240,
    'sub-steps/day',
    'contract: a driven heading integrates in fixed sub-steps of 6 game minutes (4.4 cm of advance at 10.5 m/day); see SUBSTEPS_PER_DAY',
    false,
  ),
  driveGameHoursPerSecond: c(
    20,
    'game h/s',
    'docs/PLAN.md section 5.3 (possession scale 20: a 2 km drive lasts 3 to 5 real minutes at speed 1x); tuning',
    false,
  ),
  lapseTargetSeconds: c(10, 's', 'round 2 brief: no approval phase lasts longer than about 10 s of real time at speed 1x', false),
  ringLengthM: c(1.5, 'm', 'doc 06 section 2.1 (Warsaw M2: 5,688 m bored with 3,792 rings)'),
  minRadiusTwinBoreM: c(
    150,
    'm',
    'docs/PLAN.md section 5.4 (Metro class; Central Subway drove a 137 m curve, doc 02 section 6); tuning',
    false,
  ),
  minRadiusLargeBoreM: c(
    300,
    'm',
    'docs/PLAN.md section 5.4 (Mainline class; Swinoujscie 13.46 m machine on a curve of about 300 m, doc 11 section 3.1); tuning',
    false,
  ),
  maxGradePct: c(
    3,
    'percent',
    'docs/PLAN.md section 5.4 (Mainline class 3 percent; Central Subway built 7 percent, doc 02 section 6); tuning',
    false,
  ),
  driveCorridorM: c(30, 'm', 'tuning: a driven machine cannot move further than this from the planned alignment', false),
  driveFreeDeviationM: c(3, 'm', 'tuning: deviation from the plan below this carries no surcharge', false),
  driveOffPlanCostFactor: c(1.25, 'x', 'tuning: civil cost factor for metres bored beyond the free deviation; no source', false),
  driveVerticalRadiusM: c(
    1000,
    'm',
    'tuning: full pitch input changes the grade by 0.1 percent per metre bored (3 percent over 30 m)',
    false,
  ),
  driveLookaheadM: c(25, 'm', 'tuning: the cruise law steers at the plan point this far ahead of the cutterhead', false),
  driveResteerFactor: c(
    4,
    'x',
    'tuning: a machine held at the corridor edge re-steers towards the plan this many times faster than it turns while boring, so the hold lasts seconds',
    false,
  ),
  driveFaceMetresPerSecond: c(
    8,
    'm/s',
    'tuning: while a heading is driven the face moves at least this fast in real time at speed 1x (a slow mined heading speeds the clock up); with driveGameHoursPerSecond a 2 km drive lasts about 4 minutes',
    false,
  ),
  buildTargetSeconds: c(
    120,
    's',
    'tuning after the first playtest: the longest heading takes this long at speed 1x when nobody drives (it was 300 s, and nothing happens on screen that needs five minutes)',
    false,
  ),
  maxHeadingBoredM: c(
    6000,
    'm',
    'docs/PLAN.md section 6.7 (a route-km "inside a 6 km drive"): a longer bored run is split into drives of at most this length, each with its own machine and launch shaft',
    false,
  ),
  maxHeadingMinedM: c(
    1200,
    'm',
    'tuning: a mined or cut-and-cover run longer than this is worked from several faces at once; The Portal mines 1.03 km from one',
    false,
  ),
  maxHeadingSurfaceM: c(8000, 'm', 'tuning: one track gang or viaduct crew per this much line', false),
  driveCoverM: c(
    4,
    'm',
    'tuning: a driven machine above its planned level dives when less than this much ground is left over the crown (docs/PLAN.md section 5.4 has cover under 1.5 diameters as a hazard)',
    false,
  ),
  driveAlignM: c(
    12,
    'm',
    'tuning: with no steering input a hand-driven machine eases its heading back parallel to the plan over about this distance',
    false,
  ),
  lapseMinDaysPerSecond: c(20, 'days/s', 'tuning: slowest time-lapse, so a short phase does not take the full lapseTargetSeconds', false),
  trailStepM: c(5, 'm', 'tuning: spacing of the as-built axis points of a tunnel (chord sagitta 2 cm at a 150 m radius)', false),
  stationExcavationShare: c(
    0.1,
    'share',
    'tuning: a station box is excavated during the first tenth of its build; a box a machine reaches earlier is dug out on arrival',
    false,
  ),
  compactBoxLengthM: c(140, 'm', 'assumption: Warsaw M2 station boxes are about 120 to 160 m long; drawn and carved size only', false),
  compactBoxWidthM: c(20, 'm', 'assumption: island platform between two tracks plus walls; drawn size only', false),
  compactBoxHeightM: c(10, 'm', 'assumption: platform level under one slab; drawn size only', false),
  mezzanineBoxLengthM: c(
    200,
    'm',
    'doc 06 section 3.3 (TCP: US boxes run 2 to 2.6 platform lengths); 200 m against 140 m is the drawn size, the price is stationOversizeFactor',
    false,
  ),
  mezzanineBoxWidthM: c(26, 'm', 'assumption; drawn size only', false),
  mezzanineBoxHeightM: c(16, 'm', 'assumption: platform level plus a full-length mezzanine; drawn size only', false),
  launchPitLengthM: c(40, 'm', 'assumption: launch shaft long enough for the shield and the first gantries', false),
  trainCruiseMps: c(30, 'm/s', 'presentation: a train crosses a 2 km line in about a minute of real time', false),
  trainDwellS: c(6, 's', 'presentation', false),
  trainSpacingM: c(2500, 'm', 'presentation: one train per this much line, at least one, at most eight', false),
  trainCars: c(6, 'cars', 'presentation: Caltrain KISS sets run 6 or 7 cars'),
  trainCarLengthM: c(25, 'm', 'presentation: about 25 m per bilevel car'),
  handDigPlnPerM3: c(
    1450,
    'PLN/m3',
    'doc 11 section 5.3 cut-and-cover rate per excavated m3, reused as the price of the free dig brush; the reuse is an assumption',
    false,
  ),

  // --- Calibration targets and Polish reference figures ---
  portalOfficialCostUsd: c(
    6.84e9,
    'USD',
    'doc 05 section 3.1 (July 2025 indicative, excluding the already-built trainbox; 7.57e9 including it)',
  ),
  portalOfficialCostWithTrainboxUsd: c(7.57e9, 'USD', 'doc 05 section 3.1'),
  portalRouteKm: c(2.09, 'km', 'doc 05 section 3.1 (1.3 mi)'),
  warsawM2ExtensionPlnPerKm2026: c(520e6, 'PLN/km', 'doc 11 section 6.3 (338 to 350 mln PLN/km all-in, 2015 to 2022, in 2026 money)'),
  lodzTunnelPlnPerKm2026: c(
    330e6,
    'PLN/km',
    'doc 11 section 5.2 (212 mln PLN/km at 2017 signing, in 2026 money; unfinished, about 1 mld PLN over)',
  ),

  // --- Demand v0 ---
  workersPerResident: c(0.5, 'share', 'assumption', false),
  attendance: c(0.83, 'share', 'doc 09 section 3.1 (1 minus WFH share, Vital Signs 2024)'),
  catchmentKm: c(1.6, 'km', 'doc 09 section 1.1 (rail-addressable market radius)'),
  gravityHalfDistanceKm: c(12, 'km', 'tuning against the 22 km mean straight-line commute of doc 09 section 1.1', false),
  railShareDirect: c(0.35, 'share', 'doc 09 section 5 (rail share 30 to 40 percent of the both-ends market)'),
  railShareTransfer: c(
    0.2,
    'share',
    'calibrated so The Portal lands near the 25,000+ daily riders quoted in doc 08 section 4.6; UNVERIFIED',
    false,
  ),
  nonWorkMultiplier: c(1.3, 'x', 'doc 09 section 3.1 says fit it; 1.3 is a placeholder', false),
  minTripKm: c(2, 'km', 'doc 09 section 1.1 (rail-addressable market counts ends more than 2 km apart)'),
  feederConnectM: c(500, 'm', 'assumption: a station within 500 m of an existing station is an interchange', false),
} as const satisfies Record<string, Constant>;

export type ConstantId = keyof typeof CONSTANTS;

/** Rows for a UI "sources" table. */
export function constantsTable(): { id: string; value: number; unit: string; source: string; verified: boolean }[] {
  return Object.entries(CONSTANTS).map(([id, k]) => ({ id, value: k.value, unit: k.unit, source: k.source, verified: k.verified }));
}

/** 1.04 ^ (1 / 365): daily compounding step for 4 percent a year. A literal so no transcendental call touches sim state. */
export const ESCALATION_DAILY = 1.00010745978;
export const DAYS_PER_YEAR = 365;
/**
 * Sub-steps per game day. Time is counted in sub-steps: GameSim.substep advances one, GameSim.step advances this many.
 * Only headings in the driven regime integrate per sub-step; everything else runs once per day, at the day boundary.
 */
export const SUBSTEPS_PER_DAY = CONSTANTS.substepsPerDay.value;
