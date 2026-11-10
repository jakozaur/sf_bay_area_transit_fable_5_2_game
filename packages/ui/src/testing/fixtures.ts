/**
 * Fixture snapshots and scenes for UI tests and the dev page. The Portal at each stage of a mission.
 * FIXTURE NUMBERS: cost, date and ratio values here are made up to exercise the layout (they are internally
 * consistent: totals are sums, ratios are divisions). They are not model output and prove nothing about the sim.
 * Reform, event, phase and geology texts are the sim's own (REFORMS, EVENTS, PHASE_LABELS, GEOLOGY).
 */
import {
  type CameraStatus,
  type GameSpeed,
  type GameViewState,
  type MissionCard,
  type SessionState,
  TOOL_COMMANDS,
  TOOL_KEYS,
  type ToolAvailability,
  type ToolId,
  type ToolStatus,
} from '@bayvox/core';
import {
  type DesignOptionView,
  EVENTS,
  type EventView,
  type FeedItem,
  type GameSnapshot,
  GEOLOGY,
  LEDGER_CATEGORIES,
  type LedgerCategory,
  type MissionStage,
  type NextAction,
  PHASE_LABELS,
  PHASES,
  type PhaseId,
  type PhaseView,
  type ProjectView,
  REFORMS,
  type Receipt,
  type ReceiptColumnId,
  type ReceiptGroup,
  type ReceiptLine,
  type ReceiptLineId,
  type ReformView,
  type Scorecard,
  type SocialPost,
  type StationView,
  type TbmView,
} from '@bayvox/sim';
import type { PanelId } from '../contract.ts';
import { money } from '../format.ts';
import { ALL_TOOLS_AVAILABLE, IDLE_TOOL } from './fake-services.ts';

const usd = (dollars: number): number => Math.round(dollars * 100);
const zeroLedger = (): Record<LedgerCategory, number> =>
  Object.fromEntries(LEDGER_CATEGORIES.map((c) => [c, 0])) as Record<LedgerCategory, number>;

const PROJECT_ID = 'portal';
const LENGTH_KM = 2.09;
/** Reforms the fixtures name. Each must be in the sim's list: the check below fails loudly on one that is not. */
const ENACTED = ['inHouseEngineering', 'roundTheClock'];
/** Change nothing on the fixture project: a preview of zero (the folded group of the reforms sheet). */
const QUIET = ['prufrockClass', 'smallBoreLoop'];
/**
 * The sim's reforms have no prerequisites. The fixture gives one reform a prerequisite all the same, so the
 * sheet's "Needs first" line and the locked row stay rendered and tested.
 */
const FIXTURE_PREREQS: Readonly<Record<string, string[]>> = { railSpecustawa: ['utilityStatute'] };
/** The reform that allows the twin bore, and the one that allows the compact station box. */
const TWIN_BORE_REFORM = 'twinBoreStandard';
const COMPACT_BOX_REFORM = 'stationCatalogue';
/** The ids above by what the fixture uses them for, for the specs. */
export const FIXTURE_REFORMS = {
  enacted: ENACTED,
  quiet: QUIET,
  locked: 'railSpecustawa',
  lockedNeeds: 'utilityStatute',
  twinBore: TWIN_BORE_REFORM,
  compactBox: COMPACT_BOX_REFORM,
  /** Not enacted, on a receipt line beside an enacted one. */
  onReceipt: 'bestValueAward',
} as const;

function reformTitle(id: string): string {
  const def = REFORMS.find((r) => r.id === id);
  if (def === undefined) throw new Error(`fixture: the sim has no reform "${id}"`);
  return def.title;
}
for (const id of [...ENACTED, ...QUIET, ...Object.keys(FIXTURE_PREREQS), TWIN_BORE_REFORM, COMPACT_BOX_REFORM]) reformTitle(id);

// ---------------------------------------------------------------- missions

const MISSIONS: MissionCard[] = [
  {
    id: 'the-portal',
    title: 'The Portal',
    pitch: 'The trainbox opened in 2018. Trains: 0. Caltrain stops 2.1 km short.',
    siteId: 'portal',
    freeBuild: false,
    locked: false,
    lockReason: null,
    completed: false,
    bestStars: null,
    briefing: {
      what: 'Caltrain from 4th and King to the Salesforce Transit Center: 2.1 km of tunnel under Townsend and Second, one new station.',
      officialCost: '$6.84 billion',
      officialDate: 'Open for use Q1 2036',
      why: 'The terminal has been waiting for a train since 2018. Every Caltrain rider still walks or transfers the last stretch.',
      source: 'SFCTA memo, January 2026: $7.57B indicative, $6.84B excluding the built trainbox (fixture copy).',
    },
    objectives: ['Run trains from 4th and King to the Salesforce Transit Center', 'Finish within 2x Poland on cost and time'],
  },
  ...(
    [
      ['googleplex', 'Googleplex spur', 'A branch off Caltrain to the campus nobody planned a station for.', 'googleplex'],
      ['dumbarton', 'Dumbarton to Meta', 'The rail bridge has been out of service since 1982.', 'meta'],
    ] as const
  ).map(
    ([id, title, pitch, siteId]): MissionCard => ({
      id,
      title,
      pitch,
      siteId,
      freeBuild: false,
      locked: false,
      lockReason: null,
      completed: false,
      bestStars: null,
      briefing: { what: title, officialCost: 'No official figure', officialDate: 'No official date', why: pitch, source: 'fixture' },
      objectives: ['Open the line'],
    }),
  ),
  {
    id: 'sandbox',
    title: 'Free build',
    pitch: 'The whole Bay. No ghost, no deadline.',
    siteId: 'portal',
    freeBuild: true,
    locked: false,
    lockReason: null,
    completed: false,
    bestStars: null,
    briefing: {
      what: 'Any line, anywhere on the map.',
      officialCost: 'None: nobody planned it',
      officialDate: 'None',
      why: 'Because the money you save has to go somewhere.',
      source: 'fixture',
    },
    objectives: ['Build what you like'],
  },
];

export function session(screen: SessionState['screen'], over: Partial<SessionState> = {}): SessionState {
  return {
    screen,
    missionId: screen === 'title' ? null : 'the-portal',
    loading: screen === 'loading' ? { label: 'Loading downtown San Francisco', progress: 0.62 } : null,
    missions: MISSIONS,
    saves: [],
    error: null,
    ...over,
  };
}

// ---------------------------------------------------------------- receipt and scorecard

interface LineSpec {
  id: ReceiptLineId;
  group: ReceiptGroup;
  label: string;
  /** Millions of dollars: yours, status quo, Poland. */
  m: [number, number, number];
  sq: number;
  reforms: string[];
  evidence: string;
}

const LINES: LineSpec[] = [
  {
    id: 'designTunnel',
    group: 'designScope',
    label: 'Tunnel cross-section',
    m: [0, 610, 0],
    sq: 1.42,
    reforms: ['twinBoreStandard'],
    evidence: 'fixture',
  },
  {
    id: 'designStations',
    group: 'designScope',
    label: 'Station boxes and mezzanines',
    m: [420, 420, 0],
    sq: 1.31,
    reforms: ['stationCatalogue'],
    evidence: 'fixture',
  },
  {
    id: 'designSystems',
    group: 'designScope',
    label: 'Track count and systems scope',
    m: [0, 95, 0],
    sq: 1.05,
    reforms: ['twinBoreStandard'],
    evidence: 'fixture',
  },
  {
    id: 'procurement',
    group: 'institutional',
    label: 'Procurement',
    m: [310, 480, 0],
    sq: 1.25,
    reforms: ['inHouseEngineering', 'bestValueAward'],
    evidence: 'fixture',
  },
  {
    id: 'staffing',
    group: 'institutional',
    label: 'Staffing and work rules',
    m: [520, 520, 0],
    sq: 1.35,
    reforms: ['roundTheClock'],
    evidence: 'fixture',
  },
  {
    id: 'utilities',
    group: 'institutional',
    label: 'Utilities and third parties',
    m: [240, 240, 0],
    sq: 1.12,
    reforms: ['utilityStatute'],
    evidence: 'fixture',
  },
  {
    id: 'systemsSupply',
    group: 'institutional',
    label: 'Bespoke systems and Buy America',
    m: [130, 130, 0],
    sq: 1.08,
    reforms: ['emergencyAward'],
    evidence: 'fixture',
  },
  {
    id: 'softCosts',
    group: 'institutional',
    label: 'Consultants and project management',
    m: [760, 760, 31],
    sq: 1.38,
    reforms: ['inHouseEngineering'],
    evidence: 'fixture',
  },
  {
    id: 'contingency',
    group: 'institutional',
    label: 'Contingency',
    m: [540, 720, 12],
    sq: 1.3,
    reforms: ['rightMachine'],
    evidence: 'fixture',
  },
  {
    id: 'escalation',
    group: 'delay',
    label: 'Escalation over the schedule',
    m: [610, 890, 9],
    sq: 1.22,
    reforms: ['railSpecustawa'],
    evidence: 'fixture',
  },
  {
    id: 'overhead',
    group: 'delay',
    label: 'Standing organisation',
    m: [380, 520, 6],
    sq: 1.1,
    reforms: ['railSpecustawa', 'emergencyAward'],
    evidence: 'fixture',
  },
  { id: 'events', group: 'delay', label: 'Event cards', m: [42, 0, 0], sq: 1, reforms: [], evidence: 'fixture' },
  { id: 'offPlan', group: 'delay', label: 'Driving off the plan', m: [0, 0, 0], sq: 1, reforms: [], evidence: 'fixture' },
  { id: 'handDig', group: 'delay', label: 'Hand digging', m: [0, 0, 0], sq: 1, reforms: [], evidence: 'fixture' },
  {
    id: 'priceLevel',
    group: 'priceLevel',
    label: 'Price level gap',
    m: [858, 858, 0],
    sq: 1.61,
    reforms: [],
    evidence: 'fixture: nominal price-level ratio, its own line by owner decision',
  },
];
const GROUP_LABEL: Record<ReceiptGroup, string> = {
  designScope: 'Design scope',
  institutional: 'Institutional levers',
  delay: 'Delay and escalation',
  priceLevel: 'Price level',
};
const BASE_M = 325;

function receipt(final: boolean): Receipt {
  const col = (i: 0 | 1 | 2): number => usd(1e6 * (BASE_M + LINES.reduce((n, l) => n + l.m[i], 0)));
  const cents = (l: LineSpec): Record<ReceiptColumnId, number> => ({
    yours: usd(l.m[0] * 1e6),
    statusQuo: usd(l.m[1] * 1e6),
    poland: usd(l.m[2] * 1e6),
  });
  const lines: ReceiptLine[] = LINES.map((l) => ({
    id: l.id,
    group: l.group,
    label: l.label,
    factor: { yours: l.m[0] === 0 ? 1 : l.sq, statusQuo: l.sq, poland: 1 },
    cents: cents(l),
    reforms: l.reforms.map((id) => ({ id, title: reformTitle(id), enacted: ENACTED.includes(id) })),
    status: l.m[0] === 0 ? 'removed' : l.m[0] < l.m[1] ? 'reduced' : 'paid',
    evidence: l.evidence,
  }));
  const column = (id: ReceiptColumnId, i: 0 | 1 | 2, label: string, basis: string, openDate: string, yearsToOpen: number) => ({
    id,
    label,
    basis,
    kind: id === 'yours' ? (final ? ('actual' as const) : ('forecast' as const)) : ('model' as const),
    lengthKm: LENGTH_KM,
    baseCents: usd(BASE_M * 1e6),
    costCents: col(i),
    costPerKmCents: Math.round(col(i) / LENGTH_KM),
    openDate,
    yearsToOpen,
  });
  const ghostCost = usd(6.84e9);
  const columns = {
    yours: column('yours', 0, 'Your project', 'Twin bore, California station box, three reforms enacted.', '2033-06-30', 6.6),
    statusQuo: column('statusQuo', 1, 'Status quo', 'The official design under today’s rules.', '2036-09-30', 9.9),
    poland: column('poland', 2, 'Poland', 'Twin bore 6.6 m, compact boxes, Polish prices.', '2030-08-31', 3.8),
  };
  const groups = (['designScope', 'institutional', 'delay', 'priceLevel'] as const).map((g) => {
    const mine = LINES.filter((l) => l.group === g);
    const sum = (i: 0 | 1 | 2): number => usd(1e6 * mine.reduce((n, l) => n + l.m[i], 0));
    return {
      id: g,
      label: GROUP_LABEL[g],
      factor: { yours: 1, statusQuo: mine.reduce((n, l) => n * l.sq, 1), poland: 1 },
      cents: { yours: sum(0), statusQuo: sum(1), poland: sum(2) },
    };
  });
  return {
    projectId: PROJECT_ID,
    final,
    columns,
    ghost: {
      label: 'Official plan (TJPA)',
      costCents: ghostCost,
      costPerKmCents: Math.round(ghostCost / LENGTH_KM),
      openDate: '2036-03-31',
      lengthKm: LENGTH_KM,
      source: 'SFCTA memo, January 2026 (fixture copy).',
      unexplainedShare: (ghostCost - columns.statusQuo.costCents) / ghostCost,
    },
    lines,
    groups,
    ratios: {
      yoursToPoland: columns.yours.costCents / columns.poland.costCents,
      statusQuoToPoland: columns.statusQuo.costCents / columns.poland.costCents,
      ghostToPoland: ghostCost / columns.poland.costCents,
      yoursToStatusQuo: columns.yours.costCents / columns.statusQuo.costCents,
    },
  };
}

function scorecard(r: Receipt, final: boolean): Scorecard {
  const g = r.ghost;
  if (g === null) throw new Error('fixture: the Portal receipt has a ghost');
  const y = r.columns.yours;
  const p = r.columns.poland;
  return {
    projectId: PROJECT_ID,
    final,
    yours: {
      label: 'You',
      kind: 'yours',
      costCents: y.costCents,
      costPerKmCents: y.costPerKmCents,
      lengthKm: LENGTH_KM,
      openDate: y.openDate,
      yearsToOpen: y.yearsToOpen,
      source: final ? 'Your ledger, final.' : 'Forecast at completion.',
    },
    ghost: {
      label: g.label,
      kind: 'sponsor',
      costCents: g.costCents,
      costPerKmCents: g.costPerKmCents,
      lengthKm: LENGTH_KM,
      openDate: g.openDate,
      yearsToOpen: 9.4,
      source: g.source,
    },
    poland: {
      label: 'Poland would pay',
      kind: 'poland',
      costCents: p.costCents,
      costPerKmCents: p.costPerKmCents,
      lengthKm: LENGTH_KM,
      openDate: p.openDate,
      yearsToOpen: p.yearsToOpen,
      source: 'Polish design at Polish prices: Warsaw metro, Lodz tunnel (fixture copy).',
    },
    ridersPerDay: 41200,
    costPerRiderCents: Math.round(y.costCents / 41200),
    stars: 2,
    starsReason: 'Time is inside the target, cost is not.',
    verdict: `You opened The Portal for ${money(y.costCents)}, ${money(g.costCents - y.costCents)} under the official plan and 33 months early. Poland would have paid ${money(p.costCents)}.`,
  };
}

// ---------------------------------------------------------------- project pieces

const NO_ACTION: NextAction = { kind: 'none', projectId: PROJECT_ID, objective: '', hint: '', command: null, focus: null };

function phases(current: PhaseId | null, ready: boolean, progress: number): PhaseView[] {
  const days: Record<PhaseId, number> = {
    planning: 1280,
    permitting: 1150,
    procurement: 540,
    utilities: 720,
    construction: 1460,
    fitOut: 540,
  };
  const gates: Partial<Record<PhaseId, { command: 'advancePhase' | 'launchTBM' | 'openLine'; label: string }>> = {
    permitting: { command: 'advancePhase', label: 'Go to tender' },
    utilities: { command: 'launchTBM', label: 'Launch the TBM' },
    fitOut: { command: 'openLine', label: 'Open the line' },
  };
  const at = current === null ? PHASES.length : PHASES.indexOf(current);
  return PHASES.map((id, i) => {
    const state = i < at ? 'done' : i === at ? 'current' : 'todo';
    const gate = gates[id];
    const p = state === 'done' ? 1 : state === 'current' ? (ready ? 1 : progress) : 0;
    return {
      id,
      label: PHASE_LABELS[id],
      state,
      progress: p,
      plannedDays: days[id],
      daysLeft: Math.round(days[id] * (1 - p)),
      gate: gate === undefined ? null : { ...gate, ready: state === 'current' && ready },
    };
  });
}

function designOptions(tunnel: string, box: string, yoursCents: number): DesignOptionView[] {
  const opt = (
    group: 'tunnel' | 'station',
    id: DesignOptionView['id'],
    label: string,
    description: string,
    practice: 'polish' | 'california',
    deltaM: number,
    deltaDays: number,
    lockedBy: string[],
  ): DesignOptionView => {
    const selected = id === tunnel || id === box;
    const cost = yoursCents + (selected ? 0 : usd(deltaM * 1e6));
    return {
      group,
      id,
      label,
      description,
      practice,
      selected,
      lockedBy: lockedBy.map((reformId) => ({ reformId, title: reformTitle(reformId) })),
      costCents: cost,
      costPerKmCents: Math.round(cost / LENGTH_KM),
      deltaCents: selected ? 0 : usd(deltaM * 1e6),
      daysToOpen: 2410 + (selected ? 0 : deltaDays),
      deltaDays: selected ? 0 : deltaDays,
      evidence:
        practice === 'polish'
          ? 'Warsaw metro line 2 and the Lodz cross-city tunnel (fixture copy).'
          : 'Sponsor design documents (fixture copy).',
      // The stations set the date for every tunnel but the mined cavern.
      ...(group === 'tunnel' ? { headingDays: id === 'minedCavern' ? 1240 : 240, stationDays: 1004 } : { applies: true }),
    };
  };
  return [
    opt(
      'tunnel',
      'twinBore',
      'Twin bore, 6.6 m',
      'Two single-track tubes. What Warsaw and Lodz build.',
      'polish',
      -610,
      -200,
      tunnel === 'twinBore' ? [] : [TWIN_BORE_REFORM],
    ),
    opt(
      'tunnel',
      'singleLargeBore',
      'Single large bore',
      'One tube wide enough for both tracks and the platforms.',
      'california',
      480,
      150,
      [],
    ),
    opt('tunnel', 'cutAndCover', 'Cut-and-cover', 'Open the street, build a box, close the street.', 'polish', 210, 90, ['utilityStatute']),
    opt('tunnel', 'minedCavern', 'Three-track mined cavern', 'The official section under Second Street.', 'california', 610, 200, []),
    opt(
      'station',
      'compactBox',
      'Compact Polish box',
      'Platform level and a roof. Stairs go straight to the street.',
      'polish',
      -420,
      -120,
      [COMPACT_BOX_REFORM],
    ),
    opt(
      'station',
      'mezzanineBox',
      'California box with mezzanine',
      'Full-length mezzanine above the platform, back-of-house to match.',
      'california',
      420,
      120,
      [],
    ),
  ];
}

function station(id: string, name: string, x: number, progress: number, fitOut: number, open: boolean): StationView {
  return {
    id,
    name,
    position: { x, y: -16, z: 40 },
    yaw: 0.78,
    style: id === 'transit-center' ? 'terminal' : 'mezzanineBox',
    lengthM: 240,
    widthM: 28,
    heightM: 14,
    progress,
    fitOut,
    open,
    template: id === 'transit-center' ? 'terminalFitOut' : 'undergroundStandard',
    box: id === 'transit-center' ? null : 'mezzanineBox',
    chainageM: id === 'transit-center' ? 2090 : 240,
    depthM: id === 'transit-center' ? 18 : 20,
  };
}

function tbm(over: Partial<TbmView>): TbmView {
  return {
    id: 'portal/front-1',
    name: 'TBM Emperor Norton',
    position: { x: 310, y: -18, z: -120 },
    yaw: 2.2,
    pitch: -0.01,
    radiusM: 3.3,
    laterals: [-5, 5],
    status: 'running',
    thrust: 0.75,
    method: 'boredTwin',
    chainageM: 912,
    fromM: 260,
    toM: 1840,
    progress: 0.41,
    rateMPerDay: 11.4,
    maxRateMPerDay: 15.2,
    driven: true,
    autopilot: false,
    steer: 0,
    pitchInput: 0,
    gradePct: -1.2,
    deviation: { lateralM: 0.8, verticalM: -0.3, totalM: 0.85, planChainageM: 912, limitM: 6, offPlan: false },
    geology: 'bayMud',
    geologyLabel: GEOLOGY.bayMud.label,
    limits: { minRadiusM: 250, maxGradePct: 3 },
    boredM: 655,
    stopReason: null,
    downDays: 0,
    breakthroughTick: -1,
    tunnelId: 'portal/tunnel-1',
    pitId: 'portal/pit-1',
    ...over,
  };
}

interface ProjectSpec {
  status: ProjectView['status'];
  phase: PhaseId | null;
  ready?: boolean;
  progress?: number;
  frozen?: boolean;
  problems?: string[];
  tbms?: TbmView[];
  stations?: StationView[];
  next?: Partial<NextAction>;
  final?: boolean;
  spentM?: number;
}

function project(spec: ProjectSpec): ProjectView {
  const r = receipt(spec.final === true);
  const problems = spec.problems ?? [];
  const points = [
    { x: -420, y: -14, z: 380 },
    { x: -180, y: -16, z: 160 },
    { x: 120, y: -20, z: -90 },
    { x: 60, y: -22, z: -420 },
    { x: -130, y: -18, z: -900 },
  ];
  const spent = zeroLedger();
  spent.civil = usd((spec.spentM ?? 0) * 1e6);
  return {
    id: PROJECT_ID,
    name: 'The Portal',
    status: spec.status,
    phase: spec.phase ?? 'fitOut',
    phaseProgress: spec.progress ?? 0,
    // A project that is ready stands at the gate of its phase.
    awaiting:
      spec.ready === true
        ? spec.phase === 'permitting'
          ? 'advancePhase'
          : spec.phase === 'utilities'
            ? 'launchTBM'
            : spec.phase === 'fitOut' || spec.phase === undefined
              ? 'openLine'
              : null
        : null,
    delayDays: 0,
    lengthM: LENGTH_KM * 1000,
    designFrozen: spec.frozen === true,
    phases: phases(
      spec.status === 'draft' ? 'planning' : spec.phase,
      spec.ready === true,
      spec.status === 'draft' ? 0 : (spec.progress ?? 0.4),
    ),
    segments: [],
    stations: spec.stations ?? [
      station('fourth-townsend', '4th and Townsend', -180, 0, 0, false),
      station('transit-center', 'Salesforce Transit Center', -130, 0, 0, false),
    ],
    tbms: spec.tbms ?? [],
    waypoints: points.map((p) => ({ ...p })),
    spentCents: spent.civil,
    spentByCategory: spent,
    escalationCents: Math.round(spent.civil * 0.08),
    comparison: {
      lengthKm: LENGTH_KM,
      costCents: r.columns.yours.costCents,
      costPerKmCents: r.columns.yours.costPerKmCents,
      openDate: r.columns.yours.openDate,
      yearsToOpen: r.columns.yours.yearsToOpen,
      ridersPerDay: 41200,
      costPerRiderCents: 0,
      poland: {
        costCents: r.columns.poland.costCents,
        costPerKmCents: r.columns.poland.costPerKmCents,
        openDate: r.columns.poland.openDate,
        yearsToOpen: 3.8,
        costPerRiderCents: 0,
      },
      ratio: r.ratios.yoursToPoland,
      baseCents: r.columns.poland.baseCents,
      factors: [],
    },
    nextAction: { ...NO_ACTION, ...spec.next },
    design: {
      tunnel: 'twinBore',
      stationBox: 'mezzanineBox',
      frozen: spec.frozen === true,
      options: designOptions('twinBore', 'mezzanineBox', r.columns.yours.costCents),
    },
    checks: {
      lengthM: LENGTH_KM * 1000,
      minRadiusM: problems.length > 0 ? 120 : 310,
      maxGradePct: 2.1,
      limits: { minRadiusM: 250, maxGradePct: 3 },
      segmentIssues: [null, null, null, null],
      vertexIssues: [null, null, problems.length > 0 ? 'radius' : null, null, null],
      problems,
      ok: problems.length === 0,
    },
    alignment: {
      id: 'portal/alignment',
      points,
      rev: 1,
      state: spec.status === 'draft' ? 'draft' : spec.status === 'open' ? 'open' : 'approved',
      segmentIssues: [null, null, null, null],
      vertexIssues: [null, null, null, null, null],
    },
    tunnels: [],
    pits: [],
    receipt: r,
    scorecard: scorecard(r, spec.final === true),
  };
}

// ---------------------------------------------------------------- reforms and events

function reforms(pc: number, projectCents: number): ReformView[] {
  return REFORMS.map((r, i): ReformView => {
    const enacted = ENACTED.includes(r.id);
    const prereqs = FIXTURE_PREREQS[r.id] ?? [];
    const missing = prereqs.filter((p) => !ENACTED.includes(p));
    const status = enacted ? 'enacted' : missing.length > 0 ? 'locked' : 'available';
    const affordable = status === 'available' && r.cost.pc <= pc;
    const blockedReason =
      status === 'locked'
        ? `Needs ${missing.map(reformTitle).join(' and ')} first`
        : status === 'available' && !affordable
          ? `Costs ${r.cost.pc} political capital, you have ${pc}`
          : null;
    // The machine reforms move nothing on the official design, which has no boring machine: a preview of zero.
    const quiet = QUIET.includes(r.id);
    const saveM = quiet ? 0 : 40 + ((i * 97) % 380);
    return {
      id: r.id,
      branch: r.branch,
      title: r.title,
      description: r.description,
      evidence: r.evidence,
      cost: r.cost,
      prereqs,
      effects: r.effects,
      beyondPoland: r.beyondPoland,
      status,
      affordable,
      blockedReason,
      preview: enacted
        ? null
        : {
            projectId: PROJECT_ID,
            costDeltaCents: -usd(saveM * 1e6),
            daysDelta: quiet ? 0 : -((i * 53) % 400),
            costPerKmAfterCents: Math.round((projectCents - usd(saveM * 1e6)) / LENGTH_KM),
            ratioToPolandAfter: (projectCents - usd(saveM * 1e6)) / usd(383e6),
            notes: quiet ? ['Boring takes 8 months, 5 months with this. The station boxes take 33 months and set the opening date.'] : [],
            exact: true,
          },
      receiptLines: LINES.filter((l) => l.reforms.includes(r.id)).map((l) => l.id),
      unlocks: r.id === TWIN_BORE_REFORM ? ['twinBore'] : r.id === COMPACT_BOX_REFORM ? ['compactBox'] : [],
    };
  });
}

function eventView(tick: number, pc: number): EventView {
  const def = EVENTS.find((e) => e.id === 'lawsuit');
  if (def === undefined) throw new Error('fixture: the sim has no lawsuit event');
  return {
    uid: 7,
    id: def.id,
    title: def.title,
    description: def.description,
    evidence: def.evidence,
    projectId: PROJECT_ID,
    deadlineTick: tick + def.deadlineDays,
    defaultOption: def.defaultOption,
    options: def.options.map((o) => ({
      id: o.id,
      label: o.label,
      costCents: usd(o.hardShare * 1.9e9),
      delayDays: o.delayDays,
      pc: o.pc,
      affordable: o.pc <= pc,
    })),
  };
}

// ---------------------------------------------------------------- snapshots

export interface SnapshotSpec {
  stage: MissionStage;
  tick?: number;
  date?: string;
  moneyM?: number;
  pc?: number;
  project?: ProjectSpec | null;
  next?: Partial<NextAction>;
  hold?: 'event' | 'gate' | null;
  mode?: GameSnapshot['clock']['mode'];
  event?: boolean;
  feed?: FeedItem[];
  notices?: GameSnapshot['notices'];
  complete?: boolean;
}

export function snapshot(spec: SnapshotSpec): GameSnapshot {
  const tick = spec.tick ?? 0;
  const pc = spec.pc ?? 40;
  const p = spec.project === null || spec.project === undefined ? null : project(spec.project);
  const next: NextAction = { ...NO_ACTION, projectId: p?.id ?? null, ...spec.next };
  const final = spec.project?.final === true;
  return {
    tick,
    date: spec.date ?? '2026-11-09',
    budgetCents: usd(1.26e9),
    scenarioId: 'the-portal',
    seed: 1,
    costProfile: 'bayAreaStatusQuo',
    speed: 1,
    ticksPerFrame: 1,
    moneyCents: usd((spec.moneyM ?? 1260) * 1e6),
    politicalCapital: pc,
    projects: p === null ? [] : [p],
    ledger: {
      totalSpentCents: p?.spentCents ?? 0,
      byCategory: p?.spentByCategory ?? zeroLedger(),
      today: zeroLedger(),
      escalationCents: p?.escalationCents ?? 0,
      monthly: [],
      funding: [
        {
          id: 'fta-cig',
          name: 'FTA Capital Investment Grant',
          amountCents: usd(3.38e9),
          release: 'permitting',
          released: spec.stage !== 'plan' && spec.stage !== 'approvals',
        },
        {
          id: 'state',
          name: 'State TIRCP and cap-and-invest',
          amountCents: usd(1.05e9),
          release: 'procurement',
          released: spec.stage === 'build' || spec.stage === 'open' || spec.stage === 'done',
        },
      ],
    },
    reforms: reforms(pc, p?.receipt.columns.yours.costCents ?? usd(4.8e9)),
    events: spec.event === true ? [eventView(tick, pc)] : [],
    objectives: [
      {
        id: 'connect',
        title: 'Run trains from 4th and King to the Salesforce Transit Center',
        kind: 'connect',
        stretch: false,
        status: final ? 'done' : 'pending',
        detail: '',
      },
      {
        id: 'poland-target',
        title: 'Finish within 2x Poland on cost and time',
        kind: 'polandTarget',
        stretch: false,
        status: final ? 'failed' : 'pending',
        detail: '',
      },
    ],
    ridersPerDay: final ? 41200 : 0,
    notices: spec.notices ?? [],
    clock: { mode: spec.mode ?? 'idle', daysPerSecond: 2, subTick: 0, hold: spec.hold ?? null },
    mission: {
      id: 'the-portal',
      title: 'The Portal',
      freeBuild: false,
      stage: spec.stage,
      projectId: p?.id ?? null,
      planProjectId: PROJECT_ID,
      complete: spec.complete === true,
      result: null,
      targets: [
        { name: '4th and King', x: 20804, z: -64695, radiusM: 400, stretch: false, served: p !== null && p.stations.length > 0 },
        {
          name: 'Salesforce Transit Center',
          x: 20624.6,
          z: -66108.8,
          radiusM: 400,
          stretch: false,
          served: p !== null && p.stations.length > 1,
        },
      ],
    },
    nextAction: next,
    headline:
      p === null
        ? null
        : {
            projectId: p.id,
            yoursPerKmCents: p.receipt.columns.yours.costPerKmCents,
            polandPerKmCents: p.receipt.columns.poland.costPerKmCents,
            ratio: p.receipt.columns.yours.costPerKmCents / p.receipt.columns.poland.costPerKmCents,
            final,
          },
    services: [],
    feed: spec.feed ?? [],
    handDig: { volumeM3: 1240, cents: usd(310000), centsPerM3: usd(250) },
  };
}

// ---------------------------------------------------------------- tool statuses

export const PLAN_TOOL: ToolStatus = {
  id: 'plan',
  hint: 'Click the map to add a waypoint. Drag one to move it. Right-click deletes. Enter finishes.',
  readouts: [
    { id: 'length', label: 'Length', value: '2.09 km', bad: false },
    { id: 'radius', label: 'Tightest curve', value: 'R 120 m (min 250)', bad: true },
    { id: 'grade', label: 'Steepest grade', value: '2.1% (max 3%)', bad: false },
    { id: 'cost', label: 'Estimate, all-in', value: '$5.13B', bad: false },
    { id: 'perKm', label: 'Per km', value: '$2.46B/km', bad: false },
    { id: 'poland', label: 'Poland, same line', value: '$183M/km', bad: false },
    { id: 'opens', label: 'Opens', value: 'Jun 2033', bad: false },
  ],
  options: [
    { key: TOOL_KEYS.planDepthM, label: 'Depth of the line', kind: 'range', min: 6, max: 60, step: 1, unit: 'm' },
    { key: TOOL_KEYS.planWaypointDepthM, label: 'Depth of waypoint 3', kind: 'range', min: 6, max: 60, step: 1, unit: 'm' },
  ],
  values: { [TOOL_KEYS.planDepthM]: 20, [TOOL_KEYS.planWaypointDepthM]: 24 },
  commands: [
    { id: TOOL_COMMANDS.planUseOfficial, label: 'Use the official alignment', enabled: true },
    { id: TOOL_COMMANDS.planDepthAll, label: 'Set depth for all', enabled: true },
    { id: TOOL_COMMANDS.planClear, label: 'Clear', enabled: true },
    { id: TOOL_COMMANDS.planFinish, label: 'Finish', enabled: false, disabledReason: 'Fix the curve at waypoint 3 first' },
  ],
};

export const STATION_TOOL: ToolStatus = {
  id: 'station',
  hint: 'Click the alignment to place a station. Right-click a station to remove it.',
  readouts: [
    { id: 'cost', label: 'This station', value: '$412M', bad: false },
    { id: 'spacing', label: 'To the next station', value: '1.85 km', bad: false },
  ],
  options: [
    {
      key: TOOL_KEYS.stationTemplate,
      label: 'Template',
      kind: 'choice',
      choices: [
        {
          value: 'undergroundStandard',
          label: 'Underground box',
          detail: '+$1.13B, 36 months',
          note: 'A new cut-and-cover box under the street.',
        },
        {
          value: 'undergroundDeepMined',
          label: 'Deep mined',
          detail: '+$2.04B, 59 months',
          disabledReason: 'Too shallow here for a mined station',
        },
        {
          value: 'terminalFitOut',
          label: 'Terminal fit-out',
          detail: '+$955M, 18 months',
          note: 'Platforms in a box that already stands.',
        },
        { value: 'surface', label: 'Surface', detail: '+$73.0M, 9 months' },
      ],
    },
    { key: TOOL_KEYS.stationDepthM, label: 'Platform depth', kind: 'range', min: 8, max: 40, step: 1, unit: 'm' },
  ],
  values: { [TOOL_KEYS.stationTemplate]: 'undergroundStandard', [TOOL_KEYS.stationDepthM]: 20 },
  commands: [],
};

export const DIG_TOOL: ToolStatus = {
  id: 'dig',
  hint: 'Click to dig. Hold and drag to keep digging. Every cubic metre is billed at the hand rate.',
  readouts: [{ id: 'price', label: 'This brush, full', value: '$16.4K', bad: false }],
  options: [{ key: TOOL_KEYS.digRadiusM, label: 'Brush radius', kind: 'range', min: 1, max: 12, step: 0.5, unit: 'm' }],
  values: { [TOOL_KEYS.digRadiusM]: 2.5 },
  commands: [],
};

export const DRIVE_TOOL: ToolStatus = {
  id: 'drive',
  hint: 'W S thrust, A D steer, R F pitch, Space autopilot.',
  readouts: [],
  options: [],
  values: { [TOOL_KEYS.driveHeadingId]: 'portal/front-1' },
  commands: [{ id: TOOL_COMMANDS.driveRelease, label: 'Leave the machine', enabled: true }],
};

export const TOOL_STATUSES: Record<ToolId, ToolStatus> = { plan: PLAN_TOOL, station: STATION_TOOL, dig: DIG_TOOL, drive: DRIVE_TOOL };

const CAMERA: CameraStatus = {
  bookmarks: [
    { id: 'site', label: 'The site', hotkey: 'F1', bookmark: { position: { x: 0, y: 900, z: 900 }, target: { x: 0, y: 0, z: 0 } } },
    {
      id: 'pit',
      label: 'Launch pit',
      hotkey: 'F2',
      bookmark: { position: { x: -400, y: 200, z: 500 }, target: { x: -420, y: 0, z: 380 } },
    },
    {
      id: 'terminal',
      label: 'Transit Center',
      hotkey: 'F3',
      bookmark: { position: { x: -100, y: 200, z: -700 }, target: { x: -130, y: 0, z: -900 } },
    },
    { id: 'bay', label: 'Whole Bay', hotkey: 'F4', bookmark: { position: { x: 0, y: 60000, z: 30000 }, target: { x: 0, y: 0, z: 0 } } },
  ],
  following: null,
};

// ---------------------------------------------------------------- scenes

/** Everything a test or the dev page needs to show one state of the UI. */
export interface Scene {
  /** One line for the dev page index. */
  about: string;
  session: SessionState;
  snapshot: GameSnapshot;
  tool: ToolStatus;
  availability: ToolAvailability;
  panel: PanelId | null;
  speed: GameSpeed;
  view: GameViewState;
  camera: CameraStatus;
  /** Published after mount, so its new feed items and notices show as toasts and banners. */
  followUp?: GameSnapshot;
}

/** Two spends of political capital: a pile-on of three, then of four. */
const PILE_ON: SocialPost[] = (
  [
    ['@ParkingFirst94', 'Day 1 of asking who voted for this tunnel tyrant. Nobody. Nobody did.', 412, 88],
    ['@SaveOurLawns', 'For 15 political capital you could have bought every commuter a pony. Ponies do not need permits.', 1890, 240],
    ['@BayAreaDad_Real', 'This person plans railways the way my toddler plans dinner: loudly, and with a shovel.', 96, 12],
    ['@HeronWatchSouthBay', 'Homes on the salt ponds?? The herons had ONE job site and you took it.', 12400, 3100],
    ['@CupertinoKaren7', 'A dictator, but for trains. Worse than a group project with no shared doc.', 733, 150],
    ['@TunnelTruth', 'For that money you could have paved the bay and called it a parking lot. I would have voted for that.', 2210, 310],
    ['@NextdoorNeil', 'I have seen uglier ideas, but only on this same account, yesterday.', 58, 9],
  ] as const
).map(([handle, text, likes, reposts], i) => ({
  id: i + 1,
  tick: i < 3 ? 1700 : 1731,
  handle,
  text,
  cause: i < 3 ? `reform:${TWIN_BORE_REFORM}` : 'housing:saltPonds',
  likes,
  reposts,
  burst: i < 3 ? 1 : 2,
}));

/** The snapshot with two housing options (one enacted) and, optionally, backlash posts. */
function withHousing(s: GameSnapshot, posts: SocialPost[] = []): GameSnapshot {
  const housing = [
    {
      id: 'saltPonds',
      title: 'Homes on the salt works',
      blurb: 'Rezone the Redwood City salt ponds beside the corridor for mid-rise housing. Assumption: 120 homes per hectare.',
      homes: 24_000,
      capitalCost: 30,
      ridersPerDayAdded: 9_600,
      enacted: false,
    },
    {
      id: 'stationUpzone',
      title: 'Upzone around the stations',
      blurb: 'Six storeys within 800 m of every station.',
      homes: 6_000,
      capitalCost: 15,
      ridersPerDayAdded: 2_400,
      enacted: true,
    },
  ];
  return { ...s, socialPosts: posts, housing };
}

const NO_DRIVE: ToolAvailability = { ...ALL_TOOLS_AVAILABLE, drive: 'No machine to drive yet. Launch the TBM first.' };
const VIEW: GameViewState = { cut: false, cutY: 0, cutRadius: 96, xray: false };

function scene(about: string, over: Partial<Scene> & { snapshot: GameSnapshot }): Scene {
  return {
    about,
    session: session('playing'),
    tool: IDLE_TOOL,
    availability: NO_DRIVE,
    panel: null,
    speed: 1,
    view: VIEW,
    camera: CAMERA,
    ...over,
  };
}

const planNext: Partial<NextAction> = {
  kind: 'drawAlignment',
  objective: 'Get a train into the Salesforce Transit Center',
  hint: 'Draw an alignment from 4th and King to the terminal, or use the official one.',
  focus: 'plan',
};
const draft: ProjectSpec = { status: 'draft', phase: 'planning' };
const approveNext: Partial<NextAction> = {
  kind: 'approveProject',
  objective: 'Get The Portal approved',
  hint: 'The line is buildable. Approve it to start the clock.',
  command: { t: 'approveProject', projectId: PROJECT_ID },
  focus: 'project',
};
const gateNext: Partial<NextAction> = {
  kind: 'advancePhase',
  objective: 'Get The Portal through permitting',
  hint: 'The grant agreement is signed. Go to tender. The design freezes.',
  command: { t: 'advancePhase', projectId: PROJECT_ID },
  focus: 'project',
};
const waitNext: Partial<NextAction> = {
  kind: 'wait',
  objective: 'Get The Portal through permitting',
  hint: 'Permitting runs for 7 more months. Spend the wait on reforms.',
  focus: 'speed',
};
const driveNext: Partial<NextAction> = {
  kind: 'drive',
  objective: 'Bore to the Salesforce Transit Center',
  hint: 'Drive the machine yourself, or leave it on autopilot and watch.',
  focus: 'drive',
};
const building: ProjectSpec = {
  status: 'active',
  phase: 'construction',
  progress: 0.41,
  frozen: true,
  spentM: 1930,
  tbms: [tbm({})],
  stations: [
    station('fourth-townsend', '4th and Townsend', -180, 0.72, 0, false),
    station('transit-center', 'Salesforce Transit Center', -130, 1, 0.2, false),
  ],
};
const permitting: ProjectSpec = { status: 'active', phase: 'permitting', progress: 0.82, spentM: 212 };
const opened: ProjectSpec = {
  status: 'open',
  phase: null,
  frozen: true,
  final: true,
  spentM: 4805,
  tbms: [tbm({ status: 'done', progress: 1, rateMPerDay: 0, thrust: 0, chainageM: 1840, autopilot: true })],
  stations: [
    station('fourth-townsend', '4th and Townsend', -180, 1, 1, true),
    station('transit-center', 'Salesforce Transit Center', -130, 1, 1, true),
  ],
};
const buildSnap = (over: Partial<SnapshotSpec> = {}): GameSnapshot =>
  snapshot({
    stage: 'build',
    tick: 1730,
    date: '2031-08-04',
    moneyM: 3120,
    pc: 22,
    mode: 'build',
    project: { ...building, next: driveNext },
    next: driveNext,
    ...over,
  });
/**
 * The same snapshot with a sponsor figure that never had an opening date, as the Dumbarton corridor study:
 * the ghost's date is the empty string on the receipt and on the scorecard.
 */
function withoutGhostDate(s: GameSnapshot): GameSnapshot {
  return {
    ...s,
    projects: s.projects.map((p) => ({
      ...p,
      receipt: {
        ...p.receipt,
        ghost: p.receipt.ghost === null ? null : { ...p.receipt.ghost, label: 'Corridor study (2017)', openDate: '' },
      },
      scorecard: { ...p.scorecard, ghost: { ...p.scorecard.ghost, label: 'Corridor study (2017)', openDate: '', yearsToOpen: 0 } },
    })),
  };
}

const feed = (seq: number, kind: FeedItem['kind'], text: string): FeedItem => ({
  seq,
  tick: 1730,
  kind,
  projectId: PROJECT_ID,
  subjectId: null,
  text,
});

export const SCENES = {
  title: scene('Title screen, first run', { session: session('title'), snapshot: snapshot({ stage: 'plan' }) }),
  'title-continue': scene('Title screen with a save, The Portal opened with 2 stars', {
    session: session('title', {
      saves: [
        { slot: 'auto', scenarioId: 'the-portal', title: 'The Portal', date: '2031-08-04', tick: 1730, savedAt: '2026-11-10T12:00:00Z' },
      ],
      missions: MISSIONS.map((m, i) => (i === 0 ? { ...m, completed: true, bestStars: 2 } : m)),
    }),
    snapshot: snapshot({ stage: 'plan' }),
  }),
  'title-credits': scene('Title screen with credits open', {
    session: session('title'),
    snapshot: snapshot({ stage: 'plan' }),
    panel: 'credits',
  }),
  briefing: scene('Mission briefing card', { session: session('briefing'), snapshot: snapshot({ stage: 'plan' }) }),
  loading: scene('Loading a site', { session: session('loading'), snapshot: snapshot({ stage: 'plan' }) }),
  'plan-empty': scene('Plan stage, nothing drawn', { snapshot: snapshot({ stage: 'plan', project: null, next: planNext }) }),
  plan: scene('Plan tool with a curve violation', {
    snapshot: snapshot({
      stage: 'plan',
      project: { ...draft, problems: ['Curve at waypoint 3: R 120 m, minimum 250 m'], next: { ...planNext, kind: 'fixAlignment' } },
      next: { ...planNext, kind: 'fixAlignment', hint: 'The curve at waypoint 3 is too tight. Drag it out.' },
    }),
    tool: PLAN_TOOL,
  }),
  station: scene('Station tool', {
    snapshot: snapshot({
      stage: 'plan',
      project: draft,
      next: {
        kind: 'addStation',
        objective: 'Get a train into the Salesforce Transit Center',
        hint: 'Place a station at 4th and Townsend.',
        focus: 'station',
      },
    }),
    tool: STATION_TOOL,
  }),
  dig: scene('Dig brush', { snapshot: snapshot({ stage: 'plan', project: draft, next: approveNext }), tool: DIG_TOOL }),
  design: scene('Design chooser', {
    snapshot: snapshot({ stage: 'plan', project: { ...draft, next: approveNext }, next: approveNext }),
    panel: 'design',
  }),
  'project-draft': scene('Project panel, ready to approve', {
    snapshot: snapshot({ stage: 'plan', project: { ...draft, next: approveNext }, next: approveNext }),
    panel: 'project',
  }),
  approvals: scene('Approvals time-lapse at 10x', {
    snapshot: snapshot({
      stage: 'approvals',
      tick: 205,
      date: '2027-06-02',
      moneyM: 1048,
      mode: 'lapse',
      project: { ...permitting, next: waitNext },
      next: waitNext,
    }),
    panel: 'project',
    speed: 10,
  }),
  gate: scene('Project waits at the tender gate', {
    snapshot: snapshot({
      stage: 'approvals',
      tick: 262,
      date: '2027-07-29',
      moneyM: 4410,
      mode: 'lapse',
      hold: 'gate',
      project: { ...permitting, ready: true, next: gateNext },
      next: gateNext,
    }),
    panel: 'project',
  }),
  'gate-card': scene('The tender gate as a decision card', {
    snapshot: snapshot({
      stage: 'approvals',
      tick: 262,
      date: '2027-07-29',
      moneyM: 4410,
      mode: 'lapse',
      hold: 'gate',
      project: { ...permitting, ready: true, next: gateNext },
      next: gateNext,
    }),
  }),
  reforms: scene('Reforms sheet', {
    snapshot: snapshot({
      stage: 'approvals',
      tick: 205,
      date: '2027-06-02',
      moneyM: 1048,
      mode: 'lapse',
      project: { ...permitting, next: waitNext },
      next: waitNext,
    }),
    panel: 'reforms',
  }),
  event: scene('Event card', {
    snapshot: snapshot({
      stage: 'approvals',
      tick: 205,
      date: '2027-06-02',
      moneyM: 1048,
      pc: 6,
      mode: 'lapse',
      hold: 'event',
      event: true,
      project: { ...permitting, next: waitNext },
      next: { kind: 'resolveEvent', objective: 'Answer the lawsuit', hint: 'Pick an option on the card.', focus: 'event' },
    }),
  }),
  build: scene('Build stage, machine on autopilot, project panel', {
    snapshot: buildSnap({ project: { ...building, tbms: [tbm({ autopilot: true, driven: false })], next: driveNext } }),
    panel: 'project',
    availability: ALL_TOOLS_AVAILABLE,
    camera: { ...CAMERA, following: { entity: { type: 'tbm', id: 'portal/front-1' }, mode: 'cutaway' } },
  }),
  drive: scene('Driving the machine', {
    snapshot: buildSnap({ mode: 'drive' }),
    tool: DRIVE_TOOL,
    availability: ALL_TOOLS_AVAILABLE,
    view: { ...VIEW, cut: true, cutY: -12 },
  }),
  'drive-offplan': scene('Driving off the plan, in a fault zone', {
    snapshot: buildSnap({
      mode: 'drive',
      project: {
        ...building,
        tbms: [
          tbm({
            thrust: 0.5,
            rateMPerDay: 3.0,
            maxRateMPerDay: 6.1,
            gradePct: 3.4,
            geology: 'faultZone',
            geologyLabel: GEOLOGY.faultZone.label,
            deviation: {
              lateralM: -4.6,
              verticalM: 2.2,
              totalM: 5.1,
              planChainageM: 930,
              limitM: 6,
              offPlan: true,
              freeM: 3,
              surchargePct: 36,
            },
          }),
        ],
        next: driveNext,
      },
    }),
    tool: DRIVE_TOOL,
    availability: ALL_TOOLS_AVAILABLE,
  }),
  breakthrough: scene('Breakthrough banner and toasts', {
    snapshot: buildSnap({ mode: 'drive' }),
    tool: DRIVE_TOOL,
    availability: ALL_TOOLS_AVAILABLE,
    followUp: buildSnap({
      mode: 'drive',
      feed: [
        feed(1, 'fundingReleased', 'State TIRCP released: $1.05B'),
        feed(2, 'tbmOffPlan', 'TBM Emperor Norton is off the plan. Every metre here costs extra.'),
        feed(3, 'breakthrough', 'TBM Emperor Norton reached the Salesforce Transit Center'),
      ],
      notices: [{ tick: 1730, command: 'enactReform', reason: 'Costs 30 political capital, you have 22' }],
    }),
  }),
  'breakthrough-event': scene('Breakthrough with an event card raised in the same instant', {
    snapshot: buildSnap({ mode: 'drive' }),
    tool: DRIVE_TOOL,
    availability: ALL_TOOLS_AVAILABLE,
    followUp: buildSnap({
      mode: 'drive',
      hold: 'event',
      event: true,
      feed: [
        feed(1, 'breakthrough', 'Breakthrough at Salesforce Transit Center: TBM Emperor Norton is through'),
        feed(2, 'eventRaised', 'One Man and His Parking Spot'),
      ],
    }),
  }),
  receipt: scene('Receipt panel', { snapshot: buildSnap(), panel: 'receipt', availability: ALL_TOOLS_AVAILABLE }),
  'receipt-no-date': scene('Receipt panel, sponsor figure without an opening date', {
    snapshot: withoutGhostDate(buildSnap()),
    panel: 'receipt',
    availability: ALL_TOOLS_AVAILABLE,
  }),
  open: scene('Fit-out done, open the line', {
    snapshot: snapshot({
      stage: 'open',
      tick: 2405,
      date: '2033-06-10',
      moneyM: 1790,
      mode: 'lapse',
      hold: 'gate',
      project: {
        ...opened,
        status: 'active',
        phase: 'fitOut',
        ready: true,
        final: false,
        next: {
          kind: 'openLine',
          objective: 'Open The Portal',
          hint: 'Testing is done. Cut the ribbon.',
          command: { t: 'openLine', projectId: PROJECT_ID },
          focus: 'project',
        },
      },
      next: {
        kind: 'openLine',
        objective: 'Open The Portal',
        hint: 'Testing is done. Cut the ribbon.',
        command: { t: 'openLine', projectId: PROJECT_ID },
        focus: 'project',
      },
    }),
    panel: 'project',
    availability: ALL_TOOLS_AVAILABLE,
  }),
  scorecard: scene('Scorecard', {
    session: session('scorecard'),
    snapshot: snapshot({
      stage: 'done',
      tick: 2420,
      date: '2033-06-30',
      moneyM: 1790,
      project: opened,
      complete: true,
      next: { kind: 'viewScorecard', objective: 'The Portal is open', hint: 'See how you did.', focus: 'receipt' },
    }),
  }),
  'scorecard-no-date': scene('Scorecard, sponsor figure without an opening date', {
    session: session('scorecard'),
    snapshot: withoutGhostDate(
      snapshot({
        stage: 'done',
        tick: 2420,
        date: '2033-06-30',
        moneyM: 1790,
        project: opened,
        complete: true,
        next: { kind: 'viewScorecard', objective: 'The line is open', hint: 'See how you did.', focus: 'receipt' },
      }),
    ),
  }),
  backlash: scene('Backlash pile-on beside the project sheet with housing options', {
    snapshot: withHousing(buildSnap()),
    panel: 'project',
    availability: ALL_TOOLS_AVAILABLE,
    followUp: withHousing(buildSnap(), PILE_ON),
  }),
  'backlash-plain': scene('Backlash pile-on over the map', {
    snapshot: buildSnap(),
    availability: ALL_TOOLS_AVAILABLE,
    followUp: { ...buildSnap(), socialPosts: PILE_ON },
  }),
  menu: scene('Menu', { snapshot: buildSnap(), panel: 'menu', availability: ALL_TOOLS_AVAILABLE }),
  help: scene('Controls help', { snapshot: buildSnap(), panel: 'help', availability: ALL_TOOLS_AVAILABLE }),
  credits: scene('Credits', { snapshot: buildSnap(), panel: 'credits', availability: ALL_TOOLS_AVAILABLE }),
} satisfies Record<string, Scene>;

export type SceneId = keyof typeof SCENES;
export const SCENE_IDS = Object.keys(SCENES) as SceneId[];
