/** Sim data model: commands in, state inside, snapshot out. Everything here is JSON-serializable. */
import type { Objective, Scenario, SimSnapshot, SimStateV } from '@bayvox/core';

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
  | { t: 'openLine'; projectId: string };

export type CommandType = GameCommand['t'];

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

export const SCHEMA_VERSION = 1;

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

export interface TbmView {
  id: string;
  name: string;
  method: Method;
  /** World metres on the alignment centreline. */
  position: { x: number; y: number; z: number };
  chainageM: number;
  fromM: number;
  toM: number;
  progress: number;
  status: 'running' | 'stopped' | 'done';
  rateMPerDay: number;
}

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
  phases: { id: PhaseId; state: 'done' | 'current' | 'todo'; progress: number; plannedDays: number }[];
  segments: { index: number; fromM: number; toM: number; method: Method; effectiveMethod: Method; geology: Geology }[];
  stations: {
    id: string;
    name: string;
    template: StationTemplate;
    chainageM: number;
    position: { x: number; y: number; z: number };
    progress: number;
  }[];
  tbms: TbmView[];
  waypoints: Waypoint[];
  spentCents: number;
  spentByCategory: Record<LedgerCategory, number>;
  escalationCents: number;
  comparison: ComparisonView;
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
  options: { id: string; label: string; costCents: number; delayDays: number; pc: number }[];
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
}
