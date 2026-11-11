/**
 * The reforms, and the cost/time profile they produce.
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
  'distantFish',
] as const;
export type EventId = (typeof EVENT_IDS)[number];

/** Status-quo profile. Reformed targets are in constants.ts; the reforms below are built to reach them exactly. */
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
  /** 1 = the bored tunnels are a 3.7 m single-lane small bore for pods, not a railway (the smallBoreLoop reform). */
  'tbm.smallBore': 0,
  // Event hazards, multipliers on the base annual rate.
  /** SB 131 (the shorter lawsuit record) is law in 2026: doc 07 E4, litigation trigger probability x0.8. It was a reform every mission started with. */
  'event.lawsuit.rate': 0.8,
  'event.lawsuit.delayCapDays': 100000,
  'event.utilitySurprise.rate': 1,
  'event.tbmStuck.rate': 1,
  'event.changeOrder.rate': 1,
  'event.fundingGap.rate': 1,
  'event.contractorBankruptcy.rate': 1,
  /** The cash call is raised by the books, not by a hazard; the key exists so every card has one. */
  'event.cashCall.rate': 1,
  'event.distantFish.rate': 1,
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
  /** Kept for grouping only (the backlash posts, start.tech validation): the Reforms sheet is one list. */
  branch: Branch;
  title: string;
  /** One line, satirical but fair. */
  description: string;
  /** Real-world evidence reference. */
  evidence: string;
  /** Political capital only. `cents` is always 0 and stays for the shape of ReformView.cost. */
  cost: { pc: number; cents: 0 };
  /** Always empty: no reform has a prerequisite. Kept for the shape ReformView and its readers had before the merge. */
  prereqs: string[];
  /** Ids of the 32-node tree of M2 this reform absorbed (its own old id included, where it had one). */
  absorbs: readonly string[];
  effects: ReformEffect[];
  /** True for nodes that go past documented Polish practice; excluded from POLAND_PROFILE. */
  beyondPoland: boolean;
}

const mul = (key: ProfileKey, value: number): ReformEffect => ({ key, op: 'mul', value });
const add = (key: ProfileKey, value: number): ReformEffect => ({ key, op: 'add', value });
const set = (key: ProfileKey, value: number): ReformEffect => ({ key, op: 'set', value });

function node(
  id: string,
  branch: Branch,
  title: string,
  pc: number,
  absorbs: readonly string[],
  effects: ReformEffect[],
  description: string,
  evidence: string,
  beyondPoland = false,
): ReformDef {
  return { id, branch, title, description, evidence, cost: { pc, cents: 0 }, prereqs: [], absorbs, effects, beyondPoland };
}

/**
 * Twelve reforms, none with a prerequisite, each priced in political capital only (owner decision, M3). They are
 * the 32 nodes of the M2 tree merged along its prerequisite chains: every effect of every old node is in exactly
 * one of them (the factor of each profile key is the product, or the sum, of the old ones), so the profile with
 * nothing enacted, with everything enacted and POLAND_PROFILE are the numbers they were. What went is the states
 * in between: half a chain can no longer be bought. The one old node that is not here is the shorter lawsuit
 * record, in force in every mission from day one: it is part of STATUS_QUO_PROFILE now.
 * Capital costs are game tuning, measured by the scripted runs of packages/scenarios (m3.test.ts).
 */
export const REFORMS: readonly ReformDef[] = [
  // ---------------------------------------------------------- permitting and law
  node(
    'railSpecustawa',
    'permitting',
    'One permit, 90 days, local money',
    40,
    ['nepaPageLimits', 'megaprojectCertification', 'railSpecustawa', 'fundLocally'],
    [
      // Page limits, certification and the single decision each halve the review.
      mul('time.planning', 0.5 * 0.5 * 0.5),
      // The single decision, then no federal grant queue.
      mul('time.permitting', 0.6 * (17 / 22.8)),
      mul('event.lawsuit.rate', 0.25),
      set('event.lawsuit.delayCapDays', 270),
      mul('event.fundingGap.rate', 0.3),
    ],
    'A short environmental statement, one permit on a 90-day clock, courts get 270 days, and no waiting for a federal grant. Compensation is paid; vetoes are not.',
    'doc 07 E3 (EIS 3.5 years to 2); doc 07 E2 (SPUR rec. 9: litigation capped at 0.75 years); doc 07 R1 and doc 11 section 1.4 (specustawa: single ZRID decision, 90 days); doc 07 F3 (no 2 to 4 year CIG stage; Madrid regional budget)',
  ),
  node(
    'specustawa',
    'permitting',
    'Specustawa: special zone, no permits',
    60,
    ['specustawa'],
    [set('time.planning', 0), set('time.permitting', 0), mul('time.utilities', 0.5), mul('event.lawsuit.rate', 0)],
    'A special act draws a zone around the line. Inside it planning and permitting take no time, land is handed over by law and nobody may sue. Poland itself still takes 7 months.',
    'doc 11 section 1.4 (specustawa: one ZRID decision, immediately enforceable, title passes by law, no annulment after works start); doc 07 R1 (right-of-way time 2 to 8 years down to 1). Zero months goes past Polish practice, where the decision still takes 7: a game rule, not a measurement',
    true,
  ),
  node(
    'utilityStatute',
    'permitting',
    'Utilities move by law',
    30,
    ['utilityStatute', 'masterPermitting', 'potholeFirst'],
    [
      mul('time.utilities', 13 / 24),
      mul('unit.thirdParty', (1.05 / 1.2) * (1 / 1.05)),
      mul('time.constructionFactor', 1 / 1.2),
      mul('event.utilitySurprise.rate', 0),
    ],
    'Pipes are found by digging small holes first and moved by a date printed in a law. One office issues the street permits.',
    'doc 07 U1 (SB 445 concept; utilities factor 1.2 to 1.05, time -50 percent); doc 07 U2 (CLEE: betterment demands -70 percent); doc 07 U3 (Van Ness grand jury: unmarked utilities)',
  ),
  // ---------------------------------------------------------- procurement and staffing
  node(
    'inHouseEngineering',
    'procurement',
    'In-house engineers, checked estimates',
    40,
    ['stageGates', 'inHouseEngineering', 'payBands', 'leanSupervision'],
    [
      add('soft.fixed', -0.15 - 0.05),
      mul('soft.overheadPerYear', 0.5),
      add('soft.contingency', -0.175),
      mul('time.procurement', 0.72),
      mul('unit.labour', 1.2 / 1.3),
    ],
    'Engineers who work for the agency, paid enough to stay. They check the estimate before it is announced, and consultants stop supervising consultants.',
    'doc 07 S1 (Madrid nine in-house engineers; soft-cost factor 1.3 to 1.05); doc 07 S2 (SPUR p.29: staff attrition halves); doc 07 G2 (SPUR rec. 3 and 4: stage gates); doc 06 section 3.3 (Green Line Extension: 1 supervisor per 1.8 trades workers against 2.5 to 3)',
  ),
  node(
    'bestValueAward',
    'procurement',
    'Open, itemized contracts',
    40,
    ['bestValueAward', 'itemizedContracts', 'openTenders', 'importSupplyChain'],
    [
      // Best-value award (1.2), open tenders (1.1) and itemized change orders take the 1.5 between them.
      mul('unit.procurement', (1 / 1.2) * (1.32 / 1.5) * (1 / 1.1)),
      add('soft.contingency', -0.175),
      mul('time.procurement', 12 / 16.56),
      mul('systems.factor', 1 / 1.15),
      mul('event.changeOrder.rate', 0.5 * 0.5),
      mul('event.contractorBankruptcy.rate', 0.25),
    ],
    'Small lots the world can bid for, half the score for knowing how to build it, changes priced from a list agreed in advance, systems from whoever makes them best.',
    'doc 07 P1 (TCP; Madrid 30/20/50 scoring); doc 07 P2 (itemised change orders save 10 to 20 percent); doc 07 P3 (bid prices -10 percent); doc 07 F1 (Buy America waiver, systems only); doc 06 section 2.2 (Lodz lowest-bid bankruptcy)',
  ),
  node(
    'roundTheClock',
    'procurement',
    'Round-the-clock sites, lean crews',
    20,
    ['roundTheClock'],
    [mul('unit.labour', 1 / 1.2), mul('time.constructionFactor', 0.8)],
    'Same wages, a negotiated premium, three shifts, and a crew sized for the machine rather than for the agreement.',
    'doc 07 L1 (Madrid 24 hours; TCP: 46 per shift on Second Avenue against 30 feasible)',
  ),
  node(
    'emergencyAward',
    'procurement',
    'Fast award, closed street',
    40,
    ['emergencyAward', 'parallelWorks'],
    [mul('time.procurement', 0.5), mul('time.utilities', 0.5)],
    'Three shortlisted firms price the job properly and the award takes half the time. The street shuts once and every utility crew works at the same time.',
    'doc 06 section 2.2 (Lodz: 13 months from tender to contract); doc 07 section 4 (right-of-way and utilities take 2 to 8 years). Both halvings are game ASSUMPTIONS',
    true,
  ),
  // ---------------------------------------------------------- design standards
  node(
    'twinBoreStandard',
    'design',
    'Polish tunnel: two tracks, twin bore',
    40,
    ['twoTracks', 'twinBoreStandard', 'shallowBoxes', 'rightSizeTerminal'],
    [set('design.threeTrack', 0), set('design.deepBox', 0), set('design.terminalOversize', 0), set('design.twinBoreDefault', 1)],
    'Two ordinary 6.6 m tubes one level under the street, as in Warsaw, and a terminal for the trains of this decade. Enacted before tender it redraws your tunnels as twin bore.',
    'doc 05 section 3.1 (3-track tunnel, 6 terminal tracks; "CHSRA may not arrive for decades"); doc 06 sections 2.1 and 3.1 (Warsaw twin 6.3 m EPB); doc 11 sections 6.2 and 6.4 (190 m2 mined section; single bore is a x2.2 design gap)',
  ),
  node(
    'stationCatalogue',
    'design',
    'Standard compact stations',
    30,
    ['noMezzanines', 'stationCatalogue'],
    [set('design.oversizeStations', 0), set('design.bespoke', 0), mul('systems.factor', 1 / 1.15)],
    'The box is as long as the train and every station is the last station again. Each city may pick the tile colour.',
    'doc 06 section 3.3 (TCP station overbuilding 2.06x in New York) and section 7.5 (1.6 for the Bay Area; systems standardisation 1.15); doc 07 S3 (Madrid copy-paste stations)',
  ),
  // ---------------------------------------------------------- tunnelling technology
  node(
    'rightMachine',
    'tunnelling',
    'Know the ground, pick the machine',
    20,
    ['groundInvestigation', 'segmentPlantLogistics', 'rightMachine'],
    [mul('event.tbmStuck.rate', 0.3 * 0.5), mul('tbm.rate', 1.1), mul('tbm.breakdown', 0.6), set('tbm.geologyRelief', 0.5)],
    'Boreholes before the machine finds out what is down there, a machine built for that ground, and a segment plant so it stops waiting for rings.',
    'doc 06 section 2.2 (Lodz: collapse above TBM Katarzyna), sections 6.1 and 7.4 (machine type by ground), section 6.3 (machines bore 20 to 40 percent of the time); doc 11 section 3.3 (S19: 17 months against 9 planned)',
  ),
  node(
    'prufrockClass',
    'tunnelling',
    'Faster machines (claimed)',
    30,
    ['continuousAdvance', 'prufrockClass'],
    [mul('tbm.rate', 1.6 * 2)],
    'Rings go in while the machine keeps pushing, then a mile a week. Both figures are the vendors speaking; the game gives you 3.2x.',
    'doc 06 section 6.6 (Herrenknecht: up to 1.6x daily advance, manufacturer figure) and section 6.5 (Prufrock: 1 mile/week claimed; LVCC bores about 15 m/day with a conventional machine)',
    true,
  ),
  node(
    'smallBoreLoop',
    'tunnelling',
    'The Vegas-style small bore',
    50,
    ['smallBoreLoop'],
    [set('tbm.smallBore', 1)],
    'One 3.7 m single-lane bore instead of two railway tubes, launched from a surface ramp. Much cheaper and faster. The catch: no train fits. Pods only.',
    'Precedent: The Boring Company, Las Vegas Convention Center Loop (twin 3.7 m bores of about 1.3 km each, opened 2021, cars with drivers); doc 06 section 6.5. The cost, speed and capacity factors are game assumptions (constants.ts smallBore*), UNVERIFIED',
    true,
  ),
];

/**
 * Old reform id to the reform that absorbed it, for saves written before the merge (sim.ts migrateV2). `null`: the
 * old reform is part of the status quo now and is dropped. An id that is neither here nor a current reform fails
 * the load.
 */
export const REFORM_MIGRATION: Readonly<Record<string, string | null>> = (() => {
  const table: Record<string, string | null> = { narrowRecord: null };
  for (const r of REFORMS) {
    for (const old of r.absorbs) {
      if (Object.hasOwn(table, old)) throw new Error(`sim: reform "${old}" is absorbed twice (by "${table[old]}" and "${r.id}")`);
      table[old] = r.id;
    }
  }
  return table;
})();

/** Reform ids of an old save as the current ones: mapped, in order, without repeats. Throws on an id nobody absorbed. */
export function migrateReformIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!Object.hasOwn(REFORM_MIGRATION, id)) {
      if (id === POLISH_PRICE_LEVEL.id) {
        if (!out.includes(id)) out.push(id);
        continue;
      }
      throw new Error(`sim: save names reform "${id}", which no longer exists and has no successor in REFORM_MIGRATION`);
    }
    const now = REFORM_MIGRATION[id];
    if (now !== null && !out.includes(now)) out.push(now);
  }
  return out;
}

/**
 * Not a reform: the Polish price level. Wages, rents and materials cost 1.61 times more in the Bay Area at the
 * market exchange rate (doc 11 sections 4.2 and 5.1), and nothing the player can enact changes that. It is part
 * of POLAND_PROFILE so that "what Poland would have paid" is priced in Poland; the list never offers it and
 * enactReform refuses it.
 */
export const POLISH_PRICE_LEVEL: ReformDef = node(
  'polishPriceLevel',
  'procurement',
  'Polish price level',
  0,
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
