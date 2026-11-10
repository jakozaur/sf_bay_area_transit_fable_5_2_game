/**
 * Reform and tech tree, and the cost/time profile it produces.
 *
 * A profile is a flat record of numbers. It starts at the Bay Area status quo and each enacted reform
 * applies its effects (multiply, add or set). "Poland" is not a setting: it is the profile with every
 * reform that reflects Polish practice enacted (POLAND_PROFILE). Evidence references point at
 * docs/research/07-red-tape-policy.md section 5 ids (E2, S1, ...) unless another doc is named.
 */
import { CONSTANTS as K } from './constants.ts';

export type Branch = 'permitting' | 'procurement' | 'design' | 'tunnelling';

export const BRANCHES: { id: Branch; title: string }[] = [
  { id: 'permitting', title: 'Permitting and law' },
  { id: 'procurement', title: 'Procurement and staffing' },
  { id: 'design', title: 'Design standards' },
  { id: 'tunnelling', title: 'Tunnelling technology' },
];

export const EVENT_IDS = [
  'lawsuit',
  'utilitySurprise',
  'tbmStuck',
  'changeOrder',
  'fundingGap',
  'contractorBankruptcy',
  'cashCall',
] as const;
export type EventId = (typeof EVENT_IDS)[number];

/** Status-quo profile. Reformed targets are in constants.ts; the tree below is built to reach them exactly. */
export const STATUS_QUO_PROFILE = {
  // Unit prices: the product multiplies every hard cost.
  'unit.procurement': K.procurementFactor.value,
  'unit.labour': K.labourFactor.value,
  'unit.thirdParty': K.thirdPartyFactor.value,
  'unit.priceLevel': K.priceLevelFactor.value,
  /** Extra factor on track, power and signalling only. */
  'systems.factor': K.systemsStandardisationFactor.value * K.buyAmericaFactor.value,
  // Soft costs and contingency.
  'soft.fixed': K.softFixedStatusQuo.value,
  'soft.overheadPerYear': K.overheadPerYearStatusQuo.value,
  'soft.contingency': K.contingencyStatusQuo.value,
  // Design standards: 1 = the mandate is in force.
  'design.threeTrack': 1,
  'design.deepBox': 1,
  'design.oversizeStations': 1,
  'design.bespoke': 1,
  'design.terminalOversize': 1,
  'design.twinBoreDefault': 0,
  // Time, months.
  'time.planning': K.planningMonthsStatusQuo.value,
  'time.permitting': K.permittingMonthsStatusQuo.value,
  'time.procurement': K.procurementMonthsStatusQuo.value,
  'time.utilities': K.utilitiesMonthsStatusQuo.value,
  'time.fitOut': K.fitOutMonths.value,
  'time.constructionFactor': K.constructionTimeFactorStatusQuo.value,
  // Tunnelling.
  'tbm.rate': 1,
  'tbm.breakdown': 1,
  /** 0..1: share of the geology penalty (cost and advance) the machine choice removes. */
  'tbm.geologyRelief': 0,
  // Event hazards, multipliers on the base annual rate.
  'event.lawsuit.rate': 1,
  'event.lawsuit.delayCapDays': 100000,
  'event.utilitySurprise.rate': 1,
  'event.tbmStuck.rate': 1,
  'event.changeOrder.rate': 1,
  'event.fundingGap.rate': 1,
  'event.contractorBankruptcy.rate': 1,
  /** The cash call is raised by the books, not by a hazard; the key exists so every card has one. */
  'event.cashCall.rate': 1,
} as const satisfies Record<string, number>;

export type ProfileKey = keyof typeof STATUS_QUO_PROFILE;
export type Profile = Record<ProfileKey, number>;

export interface ReformEffect {
  key: ProfileKey;
  op: 'mul' | 'add' | 'set';
  value: number;
}

export interface ReformDef {
  id: string;
  branch: Branch;
  title: string;
  /** One line, satirical but fair. */
  description: string;
  /** Real-world evidence reference. */
  evidence: string;
  cost: { pc: number; cents: number };
  prereqs: string[];
  effects: ReformEffect[];
  /** True for nodes that go past documented Polish practice; excluded from POLAND_PROFILE. */
  beyondPoland: boolean;
}

const mul = (key: ProfileKey, value: number): ReformEffect => ({ key, op: 'mul', value });
const add = (key: ProfileKey, value: number): ReformEffect => ({ key, op: 'add', value });
const set = (key: ProfileKey, value: number): ReformEffect => ({ key, op: 'set', value });
const pc = (n: number) => ({ pc: n, cents: 0 });
const usd = (millions: number) => ({ pc: 0, cents: millions * 1e8 });

function node(
  id: string,
  branch: Branch,
  title: string,
  cost: { pc: number; cents: number },
  prereqs: string[],
  effects: ReformEffect[],
  description: string,
  evidence: string,
  beyondPoland = false,
): ReformDef {
  return { id, branch, title, description, evidence, cost, prereqs, effects, beyondPoland };
}

export const REFORMS: readonly ReformDef[] = [
  // ---------------------------------------------------------- permitting and law
  node(
    'narrowRecord',
    'permitting',
    'Narrow administrative record',
    pc(10),
    [],
    [mul('event.lawsuit.rate', 0.8)],
    'The lawsuit may no longer cite every email anyone ever sent about the project.',
    'doc 07 E4 (SB 131); litigation trigger probability x0.8',
  ),
  node(
    'nepaPageLimits',
    'permitting',
    'NEPA assignment and page limits',
    pc(15),
    [],
    [mul('time.planning', 0.5)],
    'The environmental statement must now be shorter than the tunnel.',
    'doc 07 E3 (FRA 2023 assignment; EIS 3.5 years to 2)',
  ),
  node(
    'megaprojectCertification',
    'permitting',
    'Megaproject certification',
    pc(30),
    ['stageGates'],
    [mul('time.planning', 0.5), set('event.lawsuit.delayCapDays', 270)],
    'Courts get 270 days to decide whether a railway is bad for the environment.',
    'doc 07 E2 (SPUR rec. 9, AB 900 precedent; litigation capped at 0.75 years)',
  ),
  node(
    'railSpecustawa',
    'permitting',
    'One-permit rail act (the 90-day ZRID)',
    pc(45),
    ['megaprojectCertification'],
    [mul('time.planning', 0.5), mul('time.permitting', 0.6), mul('event.lawsuit.rate', 0.25)],
    'One permit, a 90-day clock, and a fine for the office that misses it. Compensation is paid; vetoes are not.',
    'doc 07 R1; doc 11 section 1.4 (specustawa: single ZRID decision, 90 days, no annulment after works start)',
  ),
  node(
    'specustawa',
    'permitting',
    'Specustawa: special zone, no permits',
    pc(60),
    [],
    [set('time.planning', 0), set('time.permitting', 0), mul('time.utilities', 0.5), mul('event.lawsuit.rate', 0)],
    'A special-purpose act draws a zone around the line. Inside it the act is the permit: planning and permitting take no time, the land and the streets are handed over by law, and nobody may sue. The most expensive thing on this screen, and the internet will have opinions.',
    'doc 11 section 1.4 (specustawa: one ZRID decision, immediately enforceable, title passes by law, no annulment after works start); doc 07 R1 (right-of-way time 2 to 8 years down to 1). Zero months goes past Polish practice, where the decision still takes 7: a game rule, not a measurement',
    true,
  ),
  node(
    'fundLocally',
    'permitting',
    'Skip the federal queue',
    pc(20),
    [],
    [mul('time.permitting', 17 / 22.8), mul('event.fundingGap.rate', 0.3)],
    'Pay for it yourselves and stop waiting for a grant agreement. The federal share is the price; the sim does not yet take it away.',
    'doc 07 F3 (removes the 2 to 4 year CIG stage; Madrid regional budget)',
  ),
  node(
    'utilityStatute',
    'permitting',
    'Utility relocation statute',
    pc(25),
    [],
    [mul('time.utilities', 13 / 24), mul('unit.thirdParty', 1.05 / 1.2)],
    'Utilities must move their pipes by a date printed in a law, not in a letter.',
    'doc 07 U1 (SB 445 concept; utilities factor 1.2 to 1.05, time -50 percent)',
  ),
  node(
    'masterPermitting',
    'permitting',
    'Master permitting authority',
    pc(30),
    ['utilityStatute'],
    [mul('unit.thirdParty', 1 / 1.05), mul('time.constructionFactor', 1 / 1.2)],
    'One office issues the street permits. The city may still ask for a new park, in writing, once.',
    'doc 07 U2 (CLEE recommendation; betterment demands -70 percent)',
  ),
  node(
    'potholeFirst',
    'permitting',
    'Pothole first',
    usd(5),
    [],
    [mul('event.utilitySurprise.rate', 0)],
    'Dig small holes to find the pipes before digging the big hole. Costs money, needs no politics.',
    'doc 07 U3 (Van Ness grand jury: unmarked utilities)',
  ),
  // ---------------------------------------------------------- procurement and staffing
  node(
    'stageGates',
    'procurement',
    'Stage gates and business cases',
    pc(15),
    [],
    [add('soft.contingency', -0.175)],
    'The estimate is checked before it is announced. Half the contingency stops being a spending target.',
    'doc 07 G2 (SPUR rec. 3 and 4); doc 06 section 3.3 ("all money in the budget will be spent")',
  ),
  node(
    'inHouseEngineering',
    'procurement',
    'In-house engineering corps',
    pc(25),
    [],
    [add('soft.fixed', -0.15), mul('soft.overheadPerYear', 0.5), mul('time.procurement', 0.72)],
    'Hire engineers who work for the agency, so consultants stop supervising consultants.',
    'doc 07 S1 (Madrid nine in-house engineers, Milan MM; soft-cost factor 1.3 to 1.05, decisions x3)',
  ),
  node(
    'payBands',
    'procurement',
    'Competitive pay bands',
    pc(20),
    ['inHouseEngineering'],
    [add('soft.fixed', -0.05)],
    'Pay the engineers enough that they stay. A tabloid will notice.',
    'doc 07 S2 (SPUR p.29; staff attrition halves)',
  ),
  node(
    'bestValueAward',
    'procurement',
    'Best-value award',
    pc(20),
    [],
    [mul('unit.procurement', 1 / 1.2), mul('event.changeOrder.rate', 0.5), mul('event.contractorBankruptcy.rate', 0.25)],
    'Half the score is for knowing how to build it. The lowest bidder is no longer the only bidder that matters.',
    'doc 07 P1 (TCP; Madrid 30/20/50 scoring); doc 06 section 2.2 (Lodz lowest-bid bankruptcy)',
  ),
  node(
    'itemizedContracts',
    'procurement',
    'Itemized contracts',
    pc(10),
    ['inHouseEngineering', 'bestValueAward'],
    [
      // Best-value award (1.2) and open tenders (1.1) take the first part of the 1.5; this takes the rest.
      mul('unit.procurement', 1.32 / 1.5),
      add('soft.contingency', -0.175),
      mul('event.changeOrder.rate', 0.5),
      mul('time.procurement', 12 / 16.56),
    ],
    'Changes are priced from a list agreed in advance. Someone at the agency can now read the bill of quantities.',
    'doc 07 P2 (TCP: itemised change orders save 10 to 20 percent; Italy, Spain)',
  ),
  node(
    'openTenders',
    'procurement',
    'Small lots, world bidders',
    pc(25),
    [],
    [mul('unit.procurement', 1 / 1.1)],
    'Split the job so more than three firms on Earth can bid for it.',
    'doc 07 P3 (Madrid, Chile; bid prices -10 percent)',
  ),
  node(
    'importSupplyChain',
    'procurement',
    'Buy at world prices',
    pc(10),
    ['openTenders'],
    [mul('systems.factor', 1 / 1.15)],
    'Track, power and signalling from whoever makes them best. Wages and rents in the Bay Area stay what they are: no reform moves the price level.',
    'doc 07 F1 (Buy America waiver rule; rolling stock and systems only)',
  ),
  node(
    'roundTheClock',
    'procurement',
    'Round-the-clock sites, lean crews',
    pc(25),
    [],
    [mul('unit.labour', 1 / 1.2), mul('time.constructionFactor', 0.8)],
    'Same wages, a negotiated premium, three shifts, and a crew sized for the machine rather than for the agreement.',
    'doc 07 L1 (Madrid 24 hours; TCP: 46 per shift on Second Avenue against 30 feasible)',
  ),
  node(
    'emergencyAward',
    'procurement',
    'Emergency award',
    { pc: 20, cents: 15 * 1e8 },
    [],
    [mul('time.procurement', 0.5)],
    'Shortlist three firms, pay each a stipend to price the job properly, pick one in half the time. Speed is bought, not found: the stipends are the $15M.',
    'doc 06 section 2.2 (Lodz: 13 months from tender to contract); the halving and the size of the stipends are game ASSUMPTIONS',
    true,
  ),
  node(
    'parallelWorks',
    'procurement',
    'Close the street, every crew at once',
    { pc: 30, cents: 40 * 1e8 },
    [],
    [mul('time.utilities', 0.5)],
    'The street is shut once and every utility and site-preparation crew works behind one fence at the same time, instead of block by block around the traffic. Half the time; the shops on the street are compensated, which is the $40M.',
    'doc 07 section 4 (right-of-way and utilities take 2 to 8 years); full closure against staged traffic management, the halving and the size of the compensation are game ASSUMPTIONS',
    true,
  ),
  node(
    'leanSupervision',
    'procurement',
    'Supervision at international ratios',
    pc(15),
    ['inHouseEngineering'],
    [mul('unit.labour', 1.2 / 1.3)],
    'One supervisor per three workers instead of one per two. The workers were consulted and are fine.',
    'doc 06 section 3.3 (Green Line Extension: 1 supervisor per 1.8 trades workers against a 2.5 to 3 norm)',
  ),
  // ---------------------------------------------------------- design standards
  node(
    'twoTracks',
    'design',
    'Two tracks are enough',
    pc(15),
    [],
    [set('design.threeTrack', 0)],
    'A third track for trains that may arrive in a few decades is removed from the tunnel, the box and the systems.',
    'doc 05 section 3.1 (3-track tunnel; "CHSRA may not arrive for decades"); doc 11 section 6.2 (190 m2 mined section)',
  ),
  node(
    'shallowBoxes',
    'design',
    'Shallow, compact boxes',
    pc(10),
    [],
    [set('design.deepBox', 0)],
    'The tunnel goes one level under the street instead of two.',
    'doc 06 section 3.3 (TCP: box depth and length drive station and cut-and-cover cost); doc 11 section 6.2 (22 m by 18 m box)',
  ),
  node(
    'noMezzanines',
    'design',
    'No full-length mezzanines',
    pc(15),
    [],
    [set('design.oversizeStations', 0)],
    'The station box is as long as the train. The concourse the size of the platform is dropped.',
    'doc 06 section 3.3 (TCP station overbuilding 2.06x in New York; boxes 2 to 2.6 platform lengths) and section 7.5 (1.6 for the Bay Area)',
  ),
  node(
    'stationCatalogue',
    'design',
    'Standard station catalogue',
    pc(15),
    [],
    [set('design.bespoke', 0), mul('systems.factor', 1 / 1.15)],
    'Every station is the last station again. Each city may pick the tile colour.',
    'doc 07 S3 (Madrid copy-paste stations); doc 06 section 7.5 (systems standardisation 1.15)',
  ),
  node(
    'rightSizeTerminal',
    'design',
    'Right-size the terminal',
    pc(10),
    [],
    [set('design.terminalOversize', 0)],
    'Fit out the platforms that will see a train this decade.',
    'doc 05 section 3.1 (6 tracks and 3 island platforms at the Transit Center)',
  ),
  node(
    'twinBoreStandard',
    'design',
    'Twin-bore standard',
    pc(10),
    ['twoTracks'],
    [set('design.twinBoreDefault', 1)],
    'Two ordinary 6.6 m tubes become the standard tunnel, the way Warsaw does it: the design chooser may pick them, and caverns and giant bores nobody chose are redrawn as twin tubes.',
    'doc 06 sections 2.1 and 3.1 (Warsaw twin 6.3 m EPB; BART SV II single-bore dispute); doc 11 section 6.4 (single bore is a x2.2 design gap)',
  ),
  // ---------------------------------------------------------- tunnelling technology
  node(
    'groundInvestigation',
    'tunnelling',
    'Ground investigation programme',
    usd(20),
    [],
    [mul('event.tbmStuck.rate', 0.3)],
    'Drill boreholes before the machine finds out what is down there.',
    'doc 06 section 2.2 (Lodz: collapse above TBM Katarzyna, machine idle since Nov 2024); doc 11 section 3.3 (S19: 17 months against 9 planned)',
  ),
  node(
    'segmentPlantLogistics',
    'tunnelling',
    'Segment plant and conveyors',
    usd(30),
    [],
    [mul('tbm.rate', 1.1), mul('tbm.breakdown', 0.6)],
    'The machine stops waiting for rings and muck trucks.',
    'doc 06 section 6.3 (machines bore 20 to 40 percent of the time; Warsaw 10 to 12 m/day)',
  ),
  node(
    'rightMachine',
    'tunnelling',
    'Right machine for the ground',
    usd(25),
    ['groundInvestigation'],
    [set('tbm.geologyRelief', 0.5), mul('event.tbmStuck.rate', 0.5)],
    'Variable-density TBM for Bay Mud and mixed faces. Costs more than hoping.',
    'doc 06 sections 6.1 and 7.4 (machine type by ground; wrong machine: rate x0.3)',
  ),
  node(
    'continuousAdvance',
    'tunnelling',
    'Continuous advance',
    usd(40),
    ['segmentPlantLogistics'],
    [mul('tbm.rate', 1.6)],
    'Rings go in while the machine keeps pushing. The 1.6x is the manufacturer speaking.',
    'doc 06 section 6.6 (Herrenknecht: up to 1.6x daily advance; manufacturer figure, not independently verified)',
    true,
  ),
  node(
    'prufrockClass',
    'tunnelling',
    'Mile-a-week machine (claimed)',
    usd(100),
    ['continuousAdvance'],
    [mul('tbm.rate', 2)],
    'A vendor target with no independent measurement. The game gives you a modest 2x and labels it speculation.',
    'doc 06 section 6.5 (Prufrock: 1 mile/week claimed; LVCC bores about 15 m/day with a conventional machine)',
    true,
  ),
];

/**
 * Not a reform: the Polish price level. Wages, rents and materials cost 1.61 times more in the Bay Area at the
 * market exchange rate (doc 11 sections 4.2 and 5.1), and nothing the player can enact changes that. It is part
 * of POLAND_PROFILE so that "what Poland would have paid" is priced in Poland; the tree never offers it and
 * enactReform refuses it.
 */
export const POLISH_PRICE_LEVEL: ReformDef = node(
  'polishPriceLevel',
  'procurement',
  'Polish price level',
  pc(0),
  [],
  [set('unit.priceLevel', 1)],
  'Build it in Poland.',
  'doc 11 sections 4.2 and 5.1 (3.71 PLN/USD market rate over 2.3 construction PPP: 1.61)',
);

const REFORM_BY_ID = new Map<string, ReformDef>([...REFORMS, POLISH_PRICE_LEVEL].map((r) => [r.id, r]));

export function reformById(id: string): ReformDef | undefined {
  return REFORM_BY_ID.get(id);
}

/** "What Poland would do": every reform that reflects documented Polish practice. */
export const POLAND_PROFILE: readonly string[] = [...REFORMS.filter((r) => !r.beyondPoland).map((r) => r.id), POLISH_PRICE_LEVEL.id];

/** Reform ids that start enacted under a named cost profile. Unknown names fail loudly. */
export function profileReforms(costProfile: string): readonly string[] {
  if (costProfile === 'bayAreaStatusQuo') return [];
  if (costProfile === 'polishBaseline') return POLAND_PROFILE;
  throw new Error(`sim: unknown costProfile "${costProfile}" (expected bayAreaStatusQuo or polishBaseline)`);
}

const profileCache = new Map<string, Profile>();
/**
 * The last profile computed for an array, with the length it had: the engine asks for the profile of the same
 * `state.reforms` array every simulated day, and sorting and joining it each time was a third of a forecast run.
 * Reform lists only grow (enactReform appends), so the same array at the same length is the same set.
 */
const profileByArray = new WeakMap<readonly string[], { n: number; profile: Profile }>();

/** Profile for a set of enacted reforms. Effects apply in tree order, so the result does not depend on enactment order. */
export function profileFor(enacted: readonly string[]): Profile {
  const seen = profileByArray.get(enacted);
  if (seen !== undefined && seen.n === enacted.length) return seen.profile;
  const profile = profileOfSet(enacted);
  profileByArray.set(enacted, { n: enacted.length, profile });
  return profile;
}

function profileOfSet(enacted: readonly string[]): Profile {
  const key = [...enacted].sort().join(',');
  const hit = profileCache.get(key);
  if (hit) return hit;
  const have = new Set(enacted);
  for (const id of have) if (!REFORM_BY_ID.has(id)) throw new Error(`sim: unknown reform id "${id}"`);
  const p: Profile = { ...STATUS_QUO_PROFILE };
  for (const r of [...REFORMS, POLISH_PRICE_LEVEL]) {
    if (!have.has(r.id)) continue;
    for (const e of r.effects) {
      if (e.op === 'mul') p[e.key] *= e.value;
      else if (e.op === 'add') p[e.key] += e.value;
      else p[e.key] = e.value;
    }
  }
  // Kill float dust so "all reforms" lands on exact 1.0 factors and 0 contingency.
  for (const k of Object.keys(p) as ProfileKey[]) p[k] = Math.max(0, Math.round(p[k] * 1e9) / 1e9);
  profileCache.set(key, p);
  return p;
}

/** Product of the four unit-price sub-factors. */
export function unitFactor(p: Profile): number {
  return p['unit.procurement'] * p['unit.labour'] * p['unit.thirdParty'] * p['unit.priceLevel'];
}
