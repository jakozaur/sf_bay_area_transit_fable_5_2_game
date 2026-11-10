/** Sim data model: commands in, state inside, snapshot out. Everything here is JSON-serializable. */
import type {
  AlignmentEntity,
  AlignmentIssue,
  GameServices,
  LaunchPitEntity,
  MissionBriefing,
  MissionResult,
  Objective,
  Scenario,
  SimSnapshot,
  SimStateV,
  StationEntity,
  TbmEntity,
  Tool,
  ToolContext,
  TrainEntity,
  TunnelEntity,
  WorldPos,
} from '@bayvox/core';

export const METHODS = ['boredTwin', 'boredSingleLarge', 'cutAndCover', 'mined', 'atGrade', 'viaduct'] as const;
export type Method = (typeof METHODS)[number];

export const GEOLOGIES = ['softGround', 'bayMud', 'mixedFace', 'rock', 'faultZone'] as const;
export type Geology = (typeof GEOLOGIES)[number];

export const STATION_TEMPLATES = [
  'undergroundStandard',
  'undergroundDeepMined',
  'terminalFitOut',
  'inBore',
  'surface',
  'elevated',
] as const;
export type StationTemplate = (typeof STATION_TEMPLATES)[number];

export const PHASES = ['planning', 'permitting', 'procurement', 'utilities', 'construction', 'fitOut'] as const;
export type PhaseId = (typeof PHASES)[number];

export const SPEEDS = [0, 1, 10, 100] as const;
export type Speed = (typeof SPEEDS)[number];

export const LEDGER_CATEGORIES = ['civil', 'stations', 'systems', 'soft', 'overhead', 'contingency', 'events', 'reforms'] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

/**
 * Tunnel designs the player picks per project in the design chooser (round 2, docs/CONTRACTS.md).
 * twinBore is the Polish baseline (two 6.6 m tubes); singleLargeBore and minedCavern are California
 * overdesign, offered with their price tags.
 */
export const TUNNEL_OPTIONS = ['twinBore', 'singleLargeBore', 'cutAndCover', 'minedCavern'] as const;
export type TunnelOptionId = (typeof TUNNEL_OPTIONS)[number];

/** Construction method each tunnel option applies to the underground segments of a project. */
export const TUNNEL_OPTION_METHOD: Readonly<Record<TunnelOptionId, Method>> = {
  twinBore: 'boredTwin',
  singleLargeBore: 'boredSingleLarge',
  cutAndCover: 'cutAndCover',
  minedCavern: 'mined',
};

/** Station box designs: the compact Polish cut-and-cover box, or the California box with a full mezzanine. */
export const STATION_BOXES = ['compactBox', 'mezzanineBox'] as const;
export type StationBoxId = (typeof STATION_BOXES)[number];

export type DesignOptionId = TunnelOptionId | StationBoxId;

/**
 * One alignment vertex in world metres (core frame: x east, y up, z south).
 * `y` is the elevation of the tunnel axis or track, so depth below ground is surface elevation minus y.
 * `geology` is the ground class of the segment that STARTS at this waypoint.
 */
export interface Waypoint {
  x: number;
  y: number;
  z: number;
  geology?: Geology;
}

// ---------------------------------------------------------------- commands

export type GameCommand =
  /** Restarts the scenario from its initial state, optionally under another cost profile. */
  | { t: 'startScenario'; costProfile?: string; events?: boolean }
  /** Creates the project if needed and replaces its alignment. `methods` has one entry per segment. */
  | { t: 'setAlignment'; projectId: string; name?: string; waypoints: Waypoint[]; methods?: Method[] }
  /** Inserts a waypoint at `index` (default: append). `method` is for the new segment. */
  | { t: 'addWaypoint'; projectId: string; waypoint: Waypoint; index?: number; method?: Method }
  | { t: 'setMethod'; projectId: string; segment: number; method: Method }
  /** Places a station at a chainage, or at the alignment point nearest to `at`. */
  | {
      t: 'addStation';
      projectId: string;
      stationId?: string;
      name: string;
      template: StationTemplate;
      chainageM?: number;
      at?: { x: number; z: number };
      depthM?: number;
    }
  | { t: 'removeStation'; projectId: string; stationId: string }
  /** Draft to active: the phase clock starts. */
  | { t: 'approveProject'; projectId: string }
  /** Player gate after permitting: go to tender. Freezes the design. */
  | { t: 'advancePhase'; projectId: string }
  /** Player gate after utility relocation: start every heading and the station boxes. */
  | { t: 'launchTBM'; projectId: string }
  /** Advisory for the caller: ticks to run per frame. The sim itself always advances one day per step. */
  | { t: 'setSpeed'; speed: Speed }
  | { t: 'enactReform'; id: string }
  | { t: 'resolveEvent'; eventId: number; optionId: string }
  /** Player gate after fit-out and testing. */
  | { t: 'openLine'; projectId: string }
  // ---- round 2 (docs/CONTRACTS.md)
  /** "Use the official alignment": replays the scenario's reference commands. Rejected when there is none or the design is frozen. */
  | { t: 'useOfficialPlan' }
  /** Deletes a draft project (the draw tool removed its last waypoints). Rejected once the project is approved. */
  | { t: 'removeProject'; projectId: string }
  /**
   * Design chooser. `tunnel` rewrites the method of every underground segment (TUNNEL_OPTION_METHOD);
   * `stationBox` sets the box of every underground station. Rejected for a locked option (the notice
   * names the reform) and once the design is frozen at tender.
   */
  | { t: 'setDesign'; projectId: string; tunnel?: TunnelOptionId; stationBox?: StationBoxId }
  /**
   * Driving controls of one heading; they stay in force until the next tbmControl. Omitted fields keep their value.
   * - thrust: 0..1 share of the full advance rate for the ground (0 holds the machine).
   * - steer: -1..1; +1 turns right at the minimum radius (yaw decreases), -1 left.
   * - pitch: -1..1; +1 raises the grade, -1 lowers it, clamped to the grade limit.
   * - autopilot: true hands steering and thrust to the cruise law, which returns to the planned alignment.
   * The first tbmControl with autopilot false puts the heading into the driven regime (sub-step integration).
   */
  | { t: 'tbmControl'; headingId: string; thrust?: number; steer?: number; pitch?: number; autopilot?: boolean }
  /**
   * Charges a hand dig the app already carved: volume times the hand-excavation price (CONSTANTS.handDigPlnPerM3
   * at the current unit factors). `projectId` books it to a project, otherwise it is an unassigned ledger line.
   */
  | { t: 'chargeDig'; volumeM3: number; projectId?: string };

export type CommandType = GameCommand['t'];

/** Commands added by the round 2 contracts. The name is historical: all of them are implemented. */
export const PENDING_COMMANDS = [
  'useOfficialPlan',
  'removeProject',
  'setDesign',
  'tbmControl',
  'chargeDig',
] as const satisfies readonly CommandType[];

// ---------------------------------------------------------------- scenario

export interface FundingSourceDef {
  id: string;
  name: string;
  amountCents: number;
  /** Released into cash at scenario start, or when any project completes that phase. */
  release: 'start' | PhaseId;
  source: string;
}

export type ObjectiveDef = Objective &
  (
    | { kind: 'connect'; a: { name: string; x: number; z: number }; b: { name: string; x: number; z: number }; radiusM: number }
    | { kind: 'maxCost'; cents: number }
    | { kind: 'openBy'; date: string }
    | { kind: 'maxRatioToPoland'; ratio: number }
    | { kind: 'minRiders'; riders: number }
  ) & { stretch?: boolean };

export interface ScenarioReference {
  title: string;
  /** Label of the sponsor figure on the receipt and the scorecard, for example "Official plan (TJPA, 2025)". */
  ghostLabel?: string;
  /** Route length the official cost covers, when it is not the reference alignment (Dumbarton: the whole corridor). */
  officialLengthKm?: number;
  /** Where the first heading starts and where the last one breaks through, for briefings and tests. World metres. */
  launchPit?: { name: string; x: number; z: number };
  destination?: { name: string; x: number; z: number };
  /** Commands that draw the reference project (alignment, methods, stations). No approvals. */
  commands: GameCommand[];
  projectId: string;
  /** Sponsor figures used as status-quo calibration targets, where they exist. */
  officialCostCents?: number;
  officialOpenDate?: string;
  source: string;
  note?: string;
}

export interface ScenarioDef extends Scenario {
  description: string;
  /** Voxel site the scenario plays on: an id of packages/pipeline/sites.json. The app loads it before creating the sim. */
  siteId: string;
  /** The real project in four sourced lines, for the briefing card. Every shipped scenario has one; missionCards throws without it. */
  briefing?: MissionBriefing;
  start: {
    date: string;
    /** Cash on hand at tick 0. */
    budgetCents: number;
    /** Reform ids already enacted at the start (branches other than tunnelling). */
    policies: string[];
    /** Tunnelling-technology reform ids already enacted at the start. */
    tech: string[];
    politicalCapital: number;
    funding: FundingSourceDef[];
    /** Process already behind the project when the scenario starts (The Portal is mid-permitting). */
    headStart?: { phase: PhaseId; progress: number; source: string };
  };
  objectives: ObjectiveDef[];
  /** Ids of existing lines (demand.ts FEEDERS) new stations can interchange with. */
  feeders: string[];
  reference?: ScenarioReference;
  sandbox?: boolean;
}

// ---------------------------------------------------------------- state

export interface DesignFlags {
  threeTrack: boolean;
  deepBox: boolean;
  oversizeStations: boolean;
  bespoke: boolean;
  terminalOversize: boolean;
  twinBoreDefault: boolean;
}

export interface StationState {
  id: string;
  name: string;
  template: StationTemplate;
  chainageM: number;
  depthM: number;
  /** 0..1 of the station build. */
  progress: number;
  /** Half-length of the box excavated so far, metres each side of the platform centre (underground boxes only). */
  carvedM: number;
}

/**
 * Pose and controls of a heading in the driven regime (docs/CONTRACTS.md decision 1). Integrated once per sub-step
 * with + - * / and sqrt only: the heading is a unit vector, not an angle, so no transcendental call touches state.
 */
export interface DriveState {
  /** Cutterhead face centre, world metres. */
  x: number;
  y: number;
  z: number;
  /** Horizontal unit heading. Yaw is atan2(dirX, dirZ). */
  dirX: number;
  dirZ: number;
  /** Rise per horizontal metre of the machine axis. */
  grade: number;
  autopilot: boolean;
  thrust: number;
  steer: number;
  pitch: number;
  /** Plan chainage of the alignment point nearest to the face. Never decreases. */
  planM: number;
  /** Signed offsets from the plan: metres right of travel, metres above. */
  lateralM: number;
  verticalM: number;
  /** Ground class at the face, re-sampled every carved metre. */
  geology: Geology;
  /** Where the last carve capsule ended and the heading it had there. */
  carveX: number;
  carveY: number;
  carveZ: number;
  carveDirX: number;
  carveDirZ: number;
  /** As-built axis, flat x, y, z triplets, one point about every TRAIL_STEP_M metres. */
  trail: number[];
  /** Bored metres at the last trail point. */
  trailM: number;
  /** Unescalated civil cost accrued since the last day boundary, and the off-plan surcharge inside it. */
  pendingCents: number;
  pendingOffPlanCents: number;
  /** Beyond the free tolerance. */
  offPlan: boolean;
  /** Ticks of the last off-plan and corridor banners of this heading, so a weaving machine does not flood the feed. */
  offPlanNoticeTick: number;
  corridorNoticeTick: number;
  /** Held at the corridor edge while the shield re-steers towards the plan. */
  blocked: boolean;
}

export interface FrontState {
  id: string;
  /** Machine or heading name, for the UI. */
  name: string;
  /** Effective construction method of this run of segments. */
  method: Method;
  fromM: number;
  toM: number;
  chainageM: number;
  /** Days left of a breakdown or a stuck-machine event. */
  downDays: number;
  /** Why downDays is running. */
  downReason: 'breakdown' | 'event' | null;
  /** Metres bored along the as-built axis. */
  boredM: number;
  /** Tick the heading reached the end of its run, -1 before. */
  breakthroughTick: number;
  /** Null in the planned regime. */
  drive: DriveState | null;
}

export interface ProjectState {
  id: string;
  name: string;
  waypoints: Waypoint[];
  /** One per segment. */
  methods: Method[];
  /** Cumulative chainage at each waypoint (derived from waypoints, kept for speed). */
  cum: number[];
  stations: StationState[];
  status: 'draft' | 'active' | 'open';
  phase: PhaseId;
  phaseProgress: number;
  awaiting: null | 'advancePhase' | 'launchTBM' | 'openLine';
  /** Days the whole project stays frozen (event outcomes). Overhead keeps burning. */
  delayDays: number;
  approvedTick: number;
  approvedEscalation: number;
  openedTick: number;
  /** Design standards frozen at tender; null while the design can still change. */
  frozen: DesignFlags | null;
  fronts: FrontState[];
  systemsProgress: number;
  /** Unescalated hard cost at current unit prices, refreshed when the design or the reforms change. */
  hardEstimateCents: number;
  spent: Record<LedgerCategory, number>;
  escalationCents: number;
  contingencyPoolCents: number;
  contingencyCreditCents: number;
  eventCounts: Record<string, number>;
  ridersPerDay: number;
  /** Stored at opening: the same alignment run through the Poland profile. */
  polandCostCents: number;
  polandDays: number;
  /** Design chooser picks. Null follows the standards in force: the method of each segment as drawn, the box the mandate asks for. */
  tunnelChoice: TunnelOptionId | null;
  stationBox: StationBoxId | null;
  /**
   * Hard spend so far re-priced step by step, unescalated cents: what the same works cost at Polish prices by
   * category, then after each lever of the receipt in turn (see receipt.ts). Accrued as money is spent, at the
   * profile in force that day, so a reform enacted mid-project only changes what is bought after it.
   */
  paid: PaidLedger;
  /** Surcharge paid for metres bored off the planned alignment, riders and escalation included. */
  offPlanCents: number;
  /** Free digging booked to this project through chargeDig. */
  handDigCents: number;
  handDigM3: number;
}

/** Steps of PaidLedger.steps, in receipt order. */
export const PAID_STEPS = [
  'polishPrices',
  'procurement',
  'staffing',
  'utilities',
  'systemsSupply',
  'softCosts',
  'contingency',
  'priceLevel',
] as const;

export interface PaidLedger {
  /** Hard cost at Polish unit prices, before any rider. */
  civil: number;
  stations: number;
  systems: number;
  /** Cumulative value after each PAID_STEPS step; the first includes the Polish soft-cost rider, the last is the actual unescalated spend with riders. */
  steps: number[];
}

export interface PendingEvent {
  uid: number;
  defId: string;
  projectId: string;
  frontId: string | null;
  raisedTick: number;
  deadlineTick: number;
}

export interface ResolvedEvent {
  uid: number;
  defId: string;
  projectId: string;
  optionId: string;
  tick: number;
  byDefault: boolean;
}

export interface Notice {
  tick: number;
  command: string;
  reason: string;
}

export interface LedgerState {
  total: Record<LedgerCategory, number>;
  today: Record<LedgerCategory, number>;
  /** Part of all spend that is escalation above scenario-start prices. */
  escalationCents: number;
  /** Total spend per 30-day period since the start. */
  monthly: number[];
}

/** 2: sub-steps, driven headings, design choices, feed, hand dig (round 2). Version 1 saves are migrated on load. */
export const SCHEMA_VERSION = 2;

export interface SimState extends SimStateV {
  schemaVersion: number;
  scenario: ScenarioDef;
  seed: number;
  tick: number;
  /** sfc32 words (core prng). */
  rng: number[];
  speed: Speed;
  eventsEnabled: boolean;
  costProfile: string;
  cashCents: number;
  politicalCapital: number;
  /** Price index against scenario start, compounded daily. */
  escalation: number;
  /** Enacted reform ids, in enactment order. */
  reforms: string[];
  projects: ProjectState[];
  fundingReleased: string[];
  pendingEvents: PendingEvent[];
  eventLog: ResolvedEvent[];
  nextEventUid: number;
  nextFrontName: number;
  ledger: LedgerState;
  notices: Notice[];
  /** Bumps whenever something a forecast depends on changes. */
  version: number;
  /** Sub-step inside the current day, 0 .. SUBSTEPS_PER_DAY - 1. */
  subTick: number;
  /** Newest last, at most FEED_LENGTH items. */
  feed: FeedItem[];
  /** Next FeedItem.seq. Survives a restart, so a seq never repeats within one sim. */
  nextFeedSeq: number;
  /** Free digging charged so far. */
  handDig: { volumeM3: number; cents: number };
  /** Objective status at the last day boundary, for the objectiveDone and objectiveFailed feed items. */
  objectiveStatus: Record<string, 'pending' | 'done' | 'failed'>;
  /** Tick the mission was completed, -1 before. */
  missionCompleteTick: number;
  /** Cash is below zero (the cashShort feed item fires on the way down). */
  cashShort: boolean;
}

// ---------------------------------------------------------------- snapshot

export interface FactorView {
  id: 'design' | 'unitPrices' | 'softContingency' | 'delay';
  label: string;
  /** Multiplier of this project against the zero-delay Polish base. */
  value: number;
  /** The same factor in the Poland run (1 except for delay). */
  polandValue: number;
  /** Dollars this factor adds in the waterfall base -> design -> unit prices -> soft -> delay. */
  contributionCents: number;
  /** Sub-factors the player can reform one by one. */
  parts: { id: string; label: string; value: number }[];
}

/** Round 1 comparison. Kept for existing callers; the round 2 UI reads ProjectView.receipt and ProjectView.scorecard. */
export interface ComparisonView {
  lengthKm: number;
  /** Estimate at completion (actual once open). */
  costCents: number;
  costPerKmCents: number;
  openDate: string;
  yearsToOpen: number;
  ridersPerDay: number;
  costPerRiderCents: number;
  poland: { costCents: number; costPerKmCents: number; openDate: string; yearsToOpen: number; costPerRiderCents: number };
  /** costCents / poland.costCents. */
  ratio: number;
  /** Polish zero-delay base the factors multiply. */
  baseCents: number;
  factors: FactorView[];
}

// ---- receipt and scorecard (round 2)

/** The three model columns of the receipt. The sponsor's figure (the ghost) sits beside statusQuo. */
export const RECEIPT_COLUMNS = ['yours', 'statusQuo', 'poland'] as const;
export type ReceiptColumnId = (typeof RECEIPT_COLUMNS)[number];

/** The four factors the gap decomposes into (owner decision). priceLevel is always its own line. */
export const RECEIPT_GROUPS = ['designScope', 'institutional', 'delay', 'priceLevel'] as const;
export type ReceiptGroup = (typeof RECEIPT_GROUPS)[number];

/**
 * Receipt lines in waterfall order. Each belongs to one group:
 * - designScope: designTunnel (cross-section and method), designStations (box size, mezzanine, finish), designSystems (track count).
 * - institutional, by name: procurement, staffing, utilities (third parties), systemsSupply (bespoke and Buy America),
 *   softCosts (consultants, project management), contingency.
 * - delay: escalation (price index over the schedule), overhead (standing organisation per year), events (card overruns),
 *   offPlan (driving off the alignment), handDig (free digging booked to the project).
 * - priceLevel: the nominal price-level gap, CONSTANTS.priceLevelFactor (1.61 under the status quo).
 */
export const RECEIPT_LINES = [
  'designTunnel',
  'designStations',
  'designSystems',
  'procurement',
  'staffing',
  'utilities',
  'systemsSupply',
  'softCosts',
  'contingency',
  'escalation',
  'overhead',
  'events',
  'offPlan',
  'handDig',
  'priceLevel',
] as const;
export type ReceiptLineId = (typeof RECEIPT_LINES)[number];

export interface ReceiptColumn {
  id: ReceiptColumnId;
  /** "Your project", "Status quo", "Poland". */
  label: string;
  /** What the column prices, one line: which design under which rules. */
  basis: string;
  /** 'actual': the line is open and the figure is spend. 'forecast': estimate at completion. 'model': a counterfactual run. */
  kind: 'actual' | 'forecast' | 'model';
  lengthKm: number;
  /** Polish design at Polish prices with no delay, for this column's alignment: where its waterfall starts. */
  baseCents: number;
  /** All-in, nominal USD. baseCents plus this column's cents of every line, exactly. */
  costCents: number;
  costPerKmCents: number;
  openDate: string;
  yearsToOpen: number;
}

/** The sponsor's official figure for the real project. Not decomposed: the model explains it or leaves a residual. */
export interface GhostView {
  /** "Official plan (TJPA, 2025)". */
  label: string;
  costCents: number;
  costPerKmCents: number;
  openDate: string;
  lengthKm: number;
  source: string;
  /** (ghost cost - statusQuo column cost) / ghost cost, both per route-km: the share this model does not explain. */
  unexplainedShare: number;
}

export interface ReceiptLine {
  id: ReceiptLineId;
  group: ReceiptGroup;
  label: string;
  /** Multiplier the line applies in each column (1: no effect there). */
  factor: Record<ReceiptColumnId, number>;
  /** Dollars the line adds in each column, in waterfall order. */
  cents: Record<ReceiptColumnId, number>;
  /** Reforms that shrink or remove the line, and whether the player has enacted each. Empty: no reform touches it. */
  reforms: { id: string; title: string; enacted: boolean }[];
  /** For the player's column: 'paid' in full, 'reduced' by some reforms, 'removed' (factor 1, zero cents). */
  status: 'paid' | 'reduced' | 'removed';
  /** Source of the factor, one line. */
  evidence: string;
}

export interface Receipt {
  projectId: string;
  /** True once the line is open: the player's column is actual spend. */
  final: boolean;
  columns: Record<ReceiptColumnId, ReceiptColumn>;
  /** Null for projects without a real counterpart. */
  ghost: GhostView | null;
  /** RECEIPT_LINES order. A line that does not apply is present with factor 1 and zero cents, so rows line up. */
  lines: ReceiptLine[];
  /** Sum of the lines of each group per column, RECEIPT_GROUPS order. `factor` is the product of the group's line factors. */
  groups: { id: ReceiptGroup; label: string; factor: Record<ReceiptColumnId, number>; cents: Record<ReceiptColumnId, number> }[];
  /** Per route-km ratios computed from the columns above. Never a literal. */
  ratios: {
    yoursToPoland: number;
    statusQuoToPoland: number;
    /** Null without a ghost. */
    ghostToPoland: number | null;
    yoursToStatusQuo: number;
  };
}

/** One column of the scorecard: cost, cost per route-km and opening date. */
export interface ScoreColumn {
  label: string;
  /** 'sponsor': the ghost. 'model': the model's status-quo run, used when there is no ghost. */
  kind: 'yours' | 'sponsor' | 'model' | 'poland';
  costCents: number;
  costPerKmCents: number;
  lengthKm: number;
  openDate: string;
  yearsToOpen: number;
  source: string;
}

export const STAR_AXES = ['cost', 'date', 'riders'] as const;
export type StarAxis = (typeof STAR_AXES)[number];

export interface Scorecard {
  projectId: string;
  /** False while the line is not open: every "yours" figure is then a forecast. */
  final: boolean;
  yours: ScoreColumn;
  /** The sponsor's figure, or the model's status-quo run when the project has no real counterpart. */
  ghost: ScoreColumn;
  poland: ScoreColumn;
  ridersPerDay: number;
  costPerRiderCents: number;
  /** 0 to 3: the minimum of the axes. */
  stars: number;
  axes: { id: StarAxis; stars: number; reason: string }[];
  /** One sentence for the top of the card, numbers from the columns. */
  verdict: string;
}

/** The running HUD number: your cost per route-km against Poland's, for the mission project. */
export interface HeadlineView {
  projectId: string;
  yoursPerKmCents: number;
  polandPerKmCents: number;
  /** yoursPerKmCents / polandPerKmCents. */
  ratio: number;
  /** True once the line is open; before that the figures are estimates at completion. */
  final: boolean;
}

// ---- design chooser, next action, phases (round 2)

/** One choice of the design chooser with its price tag and build time. */
export interface DesignOptionView {
  group: 'tunnel' | 'station';
  id: DesignOptionId;
  label: string;
  /** One line: what gets built. */
  description: string;
  /** 'polish': the Polish baseline design. 'california': overdesign, shown with its price. */
  practice: 'polish' | 'california';
  selected: boolean;
  /** Reforms the status quo requires before this option may be chosen. Empty: available now. */
  lockedBy: { reformId: string; title: string }[];
  /**
   * All-in estimate at completion of the whole project with this option and everything else unchanged.
   * A locked option is priced with the reforms of `lockedBy` enacted: that is the only way to get it.
   */
  costCents: number;
  costPerKmCents: number;
  /** costCents minus the estimate with the current selection. */
  deltaCents: number;
  /** Days from today to opening with this option. */
  daysToOpen: number;
  /** daysToOpen minus the figure for the current selection. */
  deltaDays: number;
  evidence: string;
}

export interface DesignView {
  /** 'mixed' when the segments use different methods (the official Portal plan). */
  tunnel: TunnelOptionId | 'mixed';
  stationBox: StationBoxId;
  /** The design went to tender and can no longer change. */
  frozen: boolean;
  /** Tunnel options in TUNNEL_OPTIONS order, then station boxes in STATION_BOXES order. */
  options: DesignOptionView[];
}

export const NEXT_ACTIONS = [
  'drawAlignment',
  'fixAlignment',
  'addStation',
  'chooseDesign',
  'approveProject',
  'wait',
  'resolveEvent',
  'advancePhase',
  'launchTBM',
  'drive',
  'openLine',
  'viewScorecard',
  'none',
] as const;
export type NextActionKind = (typeof NEXT_ACTIONS)[number];

/** What the player should do next. One per project, and one for the whole game (the most urgent). */
export interface NextAction {
  kind: NextActionKind;
  projectId: string | null;
  /** Current objective, for the HUD: "Get The Portal through permitting". */
  objective: string;
  /** One line telling the player what to press: "Go to tender when the grant agreement is signed". */
  hint: string;
  /** The command that does it when one click is enough (a gate, an approval); null when a tool or a panel is needed. */
  command: GameCommand | null;
  /** Where the UI should point: a toolbar tool, a panel, or the speed buttons. */
  focus: 'plan' | 'station' | 'drive' | 'design' | 'project' | 'reforms' | 'event' | 'receipt' | 'speed' | null;
}

export interface PhaseView {
  id: PhaseId;
  /** PHASE_LABELS text. */
  label: string;
  state: 'done' | 'current' | 'todo';
  progress: number;
  plannedDays: number;
  /** Planned days still to run, 0 for a finished phase. Includes project delay days while this phase is current. */
  daysLeft: number;
  /** The player gate that closes this phase, or null when the next phase starts by itself. */
  gate: null | {
    command: 'advancePhase' | 'launchTBM' | 'openLine';
    /** Button text: "Go to tender", "Launch the TBM", "Open the line". */
    label: string;
    /** True while the project waits at this gate. */
    ready: boolean;
  };
}

// ---- headings, stations, trains (round 2)

/** Signed offset of a driven machine from the planned alignment. */
export interface TbmDeviation {
  /** Metres to the right of the plan, seen in the direction of travel (negative: left). */
  lateralM: number;
  /** Metres above the plan (negative: below). */
  verticalM: number;
  totalM: number;
  /** Chainage of the plan point nearest to the cutterhead. */
  planChainageM: number;
  /** Corridor half-width: the machine does not advance further away from the plan than this. */
  limitM: number;
  /** Beyond the free tolerance: every metre bored here carries the off-plan surcharge. */
  offPlan: boolean;
}

/**
 * A heading. Extends the render entity: `position` is the cutterhead face centre, `yaw` and `pitch` the machine axis,
 * `thrust` the control value in force. In the planned regime (`driven` false) the pose follows the alignment.
 */
export interface TbmView extends TbmEntity {
  name: string;
  method: Method;
  /** Chainage of the plan point nearest to the cutterhead. Equals the bored length in the planned regime. */
  chainageM: number;
  fromM: number;
  toM: number;
  progress: number;
  /** Advance right now, metres per game day. 0 while stopped or done. */
  rateMPerDay: number;
  /** Advance at thrust 1 in the current ground. */
  maxRateMPerDay: number;
  /** True once the player has taken manual control: the heading integrates in sub-steps along its own path. */
  driven: boolean;
  /** True while the cruise law drives; false while the player's tbmControl values apply. */
  autopilot: boolean;
  /** Steer and pitch inputs in force, -1..1 (0 under autopilot). */
  steer: number;
  pitchInput: number;
  /** Grade of the machine axis in percent, positive climbing. */
  gradePct: number;
  deviation: TbmDeviation;
  /** Ground class at the face and its GEOLOGY label. */
  geology: Geology;
  geologyLabel: string;
  limits: { minRadiusM: number; maxGradePct: number };
  /** Metres bored along the as-built axis. */
  boredM: number;
  /** Why the machine stands, or null while it runs. */
  stopReason: 'breakdown' | 'event' | 'projectDelay' | 'zeroThrust' | 'corridor' | null;
  /** Days of standstill left, 0 when unknown or running. */
  downDays: number;
  /** Tick of the breakthrough into the reception box, -1 before it. */
  breakthroughTick: number;
  /** Id of the TunnelEntity behind this heading (ProjectView.tunnels) and of its LaunchPitEntity (ProjectView.pits). */
  tunnelId: string;
  pitId: string;
}

/** A station. Extends the render entity; `position` is the platform centre on the track axis. */
export interface StationView extends StationEntity {
  template: StationTemplate;
  /** Null for templates without a box (surface, elevated, terminal fit-out, in-bore). */
  box: StationBoxId | null;
  chainageM: number;
  depthM: number;
}

/**
 * A line in service. Train positions are a closed-form function of presentation time (trainsAt), not sim
 * state: a tick is a day and a train crosses the line in minutes, so the app animates them from its own clock.
 */
export interface ServiceView {
  id: string;
  projectId: string;
  name: string;
  /** Track centreline as built, first stop to last, world metres. Shared with the tunnel paths; do not mutate. */
  path: WorldPos[];
  lengthM: number;
  stops: { stationId: string; name: string; chainageM: number }[];
  trains: number;
  /** Presentation kinematics, in real seconds and metres: a round trip lasts `cycleS`. */
  cycleS: number;
  cruiseMps: number;
  dwellS: number;
  cars: number;
  carLengthM: number;
  ridersPerDay: number;
}

/** One train of a service at a moment of presentation time. */
export interface TrainView extends TrainEntity {
  serviceId: string;
  chainageM: number;
  /** +1 towards the last stop, -1 back. */
  direction: 1 | -1;
  /** Station it dwells at, or null while moving. */
  atStationId: string | null;
}

// ---- clock, mission, feed (round 2)

export const MISSION_STAGES = ['plan', 'approvals', 'build', 'open', 'done'] as const;
export type MissionStage = (typeof MISSION_STAGES)[number];

export interface MissionView {
  /** Scenario id. */
  id: string;
  title: string;
  freeBuild: boolean;
  /** Where the mission project stands: drawing, approvals, construction, fit-out and opening, opened. */
  stage: MissionStage;
  /** The project the mission is scored on, null until one exists. */
  projectId: string | null;
  /** Id the draw tool gives the player's line: the reference project's id, so the official plan and a hand-drawn line are one project. */
  planProjectId: string;
  /** The line is open and the connect objective is met. The app then records `result` in the campaign profile. */
  complete: boolean;
  result: MissionResult | null;
}

/** How the frame driver should spend wall time. Advisory, like speed: stepping the sim by hand ignores it. */
export interface ClockView {
  /**
   * 'idle': nothing runs (drafts only). 'lapse': approvals or fit-out, shown as a time-lapse.
   * 'build': headings advance on autopilot. 'drive': a heading is under manual control.
   */
  mode: 'idle' | 'lapse' | 'build' | 'drive';
  /**
   * Game days per real second at speed 1x, chosen so that the current phase lasts at most
   * CONSTANTS.lapseTargetSeconds; in 'drive' mode it is CONSTANTS.driveGameHoursPerSecond / 24.
   */
  daysPerSecond: number;
  /** Sub-step inside the current day, 0 .. SUBSTEPS_PER_DAY - 1. */
  subTick: number;
  /** Non-null: do not advance time until the player acts (an event card is open, a project waits at a gate). */
  hold: 'event' | 'gate' | null;
}

export const FEED_KINDS = [
  'projectApproved',
  'phaseDone',
  'gateReady',
  'fundingReleased',
  'eventRaised',
  'eventResolved',
  'reformEnacted',
  'tbmLaunched',
  'tbmStopped',
  'tbmResumed',
  'tbmOffPlan',
  'breakthrough',
  'stationDone',
  'lineOpened',
  'objectiveDone',
  'objectiveFailed',
  'missionComplete',
  'cashShort',
] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

/**
 * Something that happened, for banners and audio cues. `seq` rises by one per item and never repeats, so a
 * consumer remembers the last seq it handled; the snapshot carries the newest items only.
 */
export interface FeedItem {
  seq: number;
  tick: number;
  kind: FeedKind;
  projectId: string | null;
  /** Heading, station, reform or event id the item is about, when there is one. */
  subjectId: string | null;
  /** Banner text: "Breakthrough at the Salesforce Transit Center". */
  text: string;
}

// ---- alignment checks and the live estimate (round 2)

/** Geometry of an alignment against its limits. */
export interface AlignmentChecks {
  lengthM: number;
  /** Smallest curve radius along the line, metres; null for a line without bends. */
  minRadiusM: number | null;
  /** Steepest segment, percent, absolute value. */
  maxGradePct: number;
  limits: { minRadiusM: number; maxGradePct: number };
  /** One entry per segment and per vertex, as AlignmentEntity carries them. */
  segmentIssues: (AlignmentIssue | null)[];
  vertexIssues: (AlignmentIssue | null)[];
  /** One line per violation: "Curve at waypoint 4: R 120 m, minimum 150 m". */
  problems: string[];
  ok: boolean;
}

export interface AlignmentEstimateRequest {
  /** Existing project whose stations and design carry over. Omit for a line that does not exist yet. */
  projectId?: string;
  waypoints: Waypoint[];
  /** Default: the project's tunnel option, else its methods as drawn, else the standard design (a mined cavern while three tracks are mandated, twin bore after). */
  tunnel?: TunnelOptionId;
  /** One per segment; overrides `tunnel`. */
  methods?: Method[];
  stationBox?: StationBoxId;
}

/** Answer to estimateAlignment: geometry checks and the running cost while drawing. */
export interface AlignmentEstimate {
  checks: AlignmentChecks;
  lengthKm: number;
  /** All-in estimate at completion under the reforms enacted now, stations of the project included. */
  costCents: number;
  costPerKmCents: number;
  /** The same line as Polish design at Polish prices. */
  polandCostCents: number;
  polandCostPerKmCents: number;
  /** costCents / polandCostCents. */
  ratioToPoland: number;
  daysToOpen: number;
  openDate: string;
}

/** Queries the sim answers without changing state. GameSim implements them; BayServices exposes them on `sim`. */
export interface SimQueries {
  /**
   * Checks and prices an alignment that may not exist in the sim yet. Pure: no state change, no random draw.
   * Cheap enough to call on every pointer move (budget: 2 ms for 64 waypoints), so it prices in closed form
   * and does not run a forecast. Throws on fewer than 2 waypoints or a malformed request.
   */
  estimateAlignment(req: AlignmentEstimateRequest): AlignmentEstimate;
}

/** The closed instances of the core generics: what packages/ui, packages/tools and apps/game import. */
export type BayServices = GameServices<GameSnapshot, GameCommand, SimQueries>;
export type BayToolContext = ToolContext<GameSnapshot, GameCommand, SimQueries>;
export type BayTool = Tool<GameSnapshot, GameCommand, SimQueries>;

// ---- project, reform, event and game views

export interface ProjectView {
  id: string;
  name: string;
  status: ProjectState['status'];
  phase: PhaseId;
  phaseProgress: number;
  awaiting: ProjectState['awaiting'];
  delayDays: number;
  lengthM: number;
  designFrozen: boolean;
  phases: PhaseView[];
  segments: { index: number; fromM: number; toM: number; method: Method; effectiveMethod: Method; geology: Geology }[];
  stations: StationView[];
  tbms: TbmView[];
  waypoints: Waypoint[];
  spentCents: number;
  spentByCategory: Record<LedgerCategory, number>;
  escalationCents: number;
  comparison: ComparisonView;
  // ---- round 2
  /** What the player must do next on this project. */
  nextAction: NextAction;
  design: DesignView;
  checks: AlignmentChecks;
  /** The alignment as the renderer draws it: waypoints, state and the issue arrays of `checks`. */
  alignment: AlignmentEntity;
  /** One per heading that has started: the excavation as built, with lining and track progress. */
  tunnels: TunnelEntity[];
  /** One per underground heading, from approval on. Surface headings (track gangs, viaduct crews) have no pit. */
  pits: LaunchPitEntity[];
  receipt: Receipt;
  scorecard: Scorecard;
}

/** What enacting a reform would change for the mission project, shown before the player buys it. */
export interface ReformPreview {
  projectId: string;
  /** Change of the estimate at completion; negative saves money. */
  costDeltaCents: number;
  /** Change of the opening date in days; negative opens earlier. */
  daysDelta: number;
  costPerKmAfterCents: number;
  ratioToPolandAfter: number;
}

export interface ReformView {
  id: string;
  branch: string;
  title: string;
  description: string;
  evidence: string;
  cost: { pc: number; cents: number };
  prereqs: string[];
  effects: { key: string; op: 'mul' | 'add' | 'set'; value: number }[];
  beyondPoland: boolean;
  status: 'enacted' | 'available' | 'locked';
  // ---- round 2
  /** Available and the player has the political capital and cash. */
  affordable: boolean;
  /** Why it cannot be enacted now ("Needs Stage gates first", "Costs 30 political capital, you have 12"), or null. */
  blockedReason: string | null;
  /** Effect on the mission project. Null when enacted, or when there is no project to measure against. */
  preview: ReformPreview | null;
  /** Receipt lines this reform shrinks or removes. */
  receiptLines: ReceiptLineId[];
  /** Design options this reform unlocks. */
  unlocks: DesignOptionId[];
}

export interface EventView {
  uid: number;
  id: string;
  title: string;
  description: string;
  evidence: string;
  projectId: string;
  deadlineTick: number;
  defaultOption: string;
  options: { id: string; label: string; costCents: number; delayDays: number; pc: number; affordable: boolean }[];
}

export interface GameSnapshot extends SimSnapshot {
  scenarioId: string;
  seed: number;
  costProfile: string;
  speed: Speed;
  /** Same as speed: how many step() calls the caller should make per frame. */
  ticksPerFrame: number;
  /** Cash on hand; negative means the plan of finance has a hole. */
  moneyCents: number;
  politicalCapital: number;
  projects: ProjectView[];
  ledger: {
    totalSpentCents: number;
    byCategory: Record<LedgerCategory, number>;
    today: Record<LedgerCategory, number>;
    escalationCents: number;
    monthly: number[];
    funding: { id: string; name: string; amountCents: number; release: string; released: boolean }[];
  };
  reforms: ReformView[];
  events: EventView[];
  objectives: { id: string; title: string; kind: string; stretch: boolean; status: 'pending' | 'done' | 'failed'; detail: string }[];
  ridersPerDay: number;
  notices: Notice[];
  // ---- round 2
  clock: ClockView;
  mission: MissionView;
  /** The single most urgent thing to do, for the HUD objective line. */
  nextAction: NextAction;
  /** Null until the mission has a project with an alignment. */
  headline: HeadlineView | null;
  /** Lines in service. Feed each to trainsAt for the trains to draw. */
  services: ServiceView[];
  /** Newest last, at most FEED_LENGTH items. */
  feed: FeedItem[];
  /** Free digging charged so far through chargeDig. */
  handDig: { volumeM3: number; cents: number; centsPerM3: number };
}

/** How many feed items a snapshot carries. */
export const FEED_LENGTH = 32;
