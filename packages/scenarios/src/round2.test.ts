/** Round 2: missions, real geography, full playthroughs through the clock contract, calibration on the receipt. */
import type { MissionResult, WorldEdit } from '@bayvox/core';
import {
  CONSTANTS,
  createSim,
  type GameCommand,
  type GameSim,
  type GameSnapshot,
  loadSim,
  PC_BREAKTHROUGH,
  PC_OPENING,
  PC_PER_MONTH,
  PC_PHASE_DONE,
  POLAND_PROFILE,
  type ProjectView,
  playerSource,
  REFORMS,
  type ReceiptLineId,
  type ScenarioDef,
  SUBSTEPS_PER_DAY,
  trainsAt,
} from '@bayvox/sim';
import { describe, expect, test } from 'vitest';
import { BAKED_DUMBARTON_TRACK, BAKED_SITES, BAKED_STATIONS, BAKED_TRAINBOX } from './baked-anchors.ts';
import {
  DUMBARTON_TO_META,
  EMPTY_CAMPAIGN,
  GOOGLEPLEX_SPUR,
  missionCards,
  ORACLE_SHUTTLE,
  PORTAL_PROJECT_ID,
  playMission,
  SANDBOX,
  SCENARIOS,
  THE_PORTAL,
  withPolandProfile,
  withStartReforms,
} from './index.ts';

const EM_DASH = String.fromCharCode(0x2014);
const usdB = (cents: number) => `$${(cents / 1e11).toFixed(2)}B`;
const usdM = (cents: number) => `$${(cents / 1e8).toFixed(0)}M`;

function referenceView(s: ScenarioDef): ProjectView {
  const sim = createSim(s, 1);
  sim.dispatch([{ t: 'useOfficialPlan' }]);
  expect(sim.snapshot().notices).toEqual([]);
  return sim.snapshot().projects[0];
}

describe('missions', () => {
  const result: MissionResult = { stars: 2, costCents: 1, costPerKmCents: 1, openDate: '2033-01-01', ratioToPoland: 4 };

  test('the title screen lists five missions in campaign order; only The Portal and free build start unlocked', () => {
    const cards = missionCards(EMPTY_CAMPAIGN);
    expect(cards.map((c) => c.title)).toEqual([
      'The Portal',
      'Googleplex spur',
      'Dumbarton to Meta',
      'Oracle shuttle tunnel',
      'Free build',
    ]);
    expect(cards.map((c) => c.locked)).toEqual([false, true, true, true, false]);
    expect(cards.map((c) => c.siteId)).toEqual(['portal', 'googleplex', 'meta', 'oracle', 'portal']);
    expect(cards.map((c) => c.freeBuild)).toEqual([false, false, false, false, true]);
    expect(cards[1].lockReason).toBe('Open The Portal first.');
    expect(cards[3].lockReason).toBe('Open Dumbarton to Meta first.');
    expect(cards[0].lockReason).toBeNull();
    for (const c of cards) {
      expect(c.completed).toBe(false);
      expect(c.bestStars).toBeNull();
      expect(c.objectives.length).toBeGreaterThan(0);
      // Four sourced lines, short sentences, no em-dash.
      for (const line of [c.briefing.what, c.briefing.officialCost, c.briefing.officialDate, c.briefing.why, c.briefing.source, c.pitch]) {
        expect(line.length, `${c.id}: ${line}`).toBeGreaterThan(15);
        expect(line.length, `${c.id}: ${line}`).toBeLessThan(260);
        expect(line.includes(EM_DASH)).toBe(false);
      }
      // The data cites the research docs; the player reads the same line without the citations.
      expect(c.briefing.source).toMatch(/doc \d+/);
      const shown = playerSource(c.briefing.source);
      expect(shown, c.id).not.toMatch(/\bdoc \d|section \d|UNVERIFIED|ASSUMED/);
      expect(shown.length, `${c.id}: ${shown}`).toBeGreaterThan(8);
    }
    // Real projects quote their figure; fantasy lines say there is none.
    expect(cards[0].briefing.officialCost).toMatch(/\$6\.84 billion/);
    expect(cards[0].briefing.officialDate).toMatch(/2036/);
    expect(cards[2].briefing.officialCost).toMatch(/\$1\.6 billion/);
    for (const i of [1, 3, 4]) expect(cards[i].briefing.officialCost).toMatch(/^No official figure/);
  });

  test('each mission unlocks when the one before it has been opened, and results show on the card', () => {
    const one = missionCards({ schemaVersion: 1, missions: { 'the-portal': result } });
    expect(one.map((c) => c.locked)).toEqual([false, false, true, true, false]);
    expect(one[0]).toMatchObject({ completed: true, bestStars: 2 });
    // Skipping ahead does not unlock what follows a mission that was never opened.
    const gap = missionCards({ schemaVersion: 1, missions: { 'the-portal': result, 'dumbarton-to-meta': result } });
    expect(gap.map((c) => c.locked)).toEqual([false, false, false, false, false]);
    const two = missionCards({ schemaVersion: 1, missions: { 'the-portal': result, 'googleplex-spur': { ...result, stars: 0 } } });
    expect(two.map((c) => c.locked)).toEqual([false, false, false, true, false]);
    expect(two[1]).toMatchObject({ completed: true, bestStars: 0 });
    expect(() => missionCards({ schemaVersion: 1 } as never)).toThrow(/progress.missions must be an object/);
    expect(() => missionCards(EMPTY_CAMPAIGN, [{ ...THE_PORTAL, briefing: undefined }])).toThrow(/scenario "the-portal" has no briefing/);
  });
});

// baked-anchors.ts is generated from apps/game/public/data by scripts/baked-anchors.mjs (packages have no Node types,
// so the test cannot read the data itself); `node packages/scenarios/scripts/baked-anchors.mjs --check` re-verifies it.
describe('scenario geography against the baked data', () => {
  const station = (key: string) => {
    const s = BAKED_STATIONS[key];
    if (!s) throw new Error(`no station "${key}" in baked-anchors.ts`);
    return s;
  };
  const inside = (id: string, p: { x: number; z: number }) => {
    const box = BAKED_SITES[id];
    if (!box) throw new Error(`no site "${id}" in baked-anchors.ts`);
    return p.x >= box.minX && p.x < box.maxX && p.z >= box.minZ && p.z < box.maxZ;
  };
  const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  const connect = (s: ScenarioDef, id = 'connect') => {
    const o = s.objectives.find((x) => x.id === id);
    if (o?.kind !== 'connect') throw new Error(`${s.id} has no connect objective "${id}"`);
    return o;
  };
  /** Metres of the reference alignment inside the scenario's voxel site, sampled every 10 m. */
  const insideM = (s: ScenarioDef, v: ProjectView) => {
    let m = 0;
    for (let i = 0; i + 1 < v.waypoints.length; i++) {
      const a = v.waypoints[i];
      const b = v.waypoints[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.round(len / 10));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        if (inside(s.siteId, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) m += len / n;
      }
    }
    return m;
  };

  test('every scenario names a baked site, a launch pit and a destination, and its reference passes the alignment checks', () => {
    for (const s of SCENARIOS) {
      expect(Object.keys(BAKED_SITES), s.id).toContain(s.siteId);
      if (!s.reference) continue;
      const v = referenceView(s);
      expect(v.checks.ok, `${s.id}: ${v.checks.problems.join('; ')}`).toBe(true);
      expect(v.nextAction.kind, `${s.id}: ${v.nextAction.hint}`).toBe('approveProject');
      const pit = s.reference.launchPit;
      const box = s.reference.destination;
      if (!pit || !box) throw new Error(`${s.id} has no launch pit or destination`);
      // The line ends at the destination; the first heading starts at the pit (Dumbarton's track gang starts at the junction).
      const last = v.waypoints[v.waypoints.length - 1];
      expect(near(last, box), s.id).toBeLessThan(1);
      expect(Math.min(...v.waypoints.slice(0, 2).map((w) => near(w, pit))), s.id).toBeLessThan(1);
      expect(
        v.stations.some((st) => near(st.position, box) < 1),
        s.id,
      ).toBe(true);
    }
    // Fantasy lines carry no official figure; real ones name their source.
    expect(GOOGLEPLEX_SPUR.reference?.officialCostCents).toBeUndefined();
    expect(ORACLE_SHUTTLE.reference?.officialCostCents).toBeUndefined();
    expect(THE_PORTAL.reference?.ghostLabel).toBe('Official plan (TJPA, 2025)');
    expect(DUMBARTON_TO_META.reference?.officialLengthKm).toBe(33);
  });

  test('The Portal: 4th and King, 4th and Townsend and the trainbox are where the baked data has them, all inside the site', () => {
    const v = referenceView(THE_PORTAL);
    const o = connect(THE_PORTAL);
    expect(station('fourthAndKing')).toMatchObject({ name: 'San Francisco 4th & King Street', system: 'Caltrain' });
    expect(near(o.a, station('fourthAndKing'))).toBeLessThan(1);
    // The Overture footprint named after the trainbox: the line ends at the centre of its bounding box.
    const box = { x: (BAKED_TRAINBOX.minX + BAKED_TRAINBOX.maxX) / 2, z: (BAKED_TRAINBOX.minZ + BAKED_TRAINBOX.maxZ) / 2 };
    // The trainbox runs about 450 m along Natoma Street, at 45 degrees to the grid: its bounding box is over 300 m both ways.
    expect(BAKED_TRAINBOX.maxX - BAKED_TRAINBOX.minX).toBeGreaterThan(300);
    expect(near(o.b, box)).toBeLessThan(5);
    const fourthTownsend = v.stations[0];
    expect(fourthTownsend.name).toBe('4th and Townsend');
    // One 168 m block from King Street to Townsend Street.
    expect(near(fourthTownsend.position, o.a)).toBeGreaterThan(60);
    expect(near(fourthTownsend.position, o.a)).toBeLessThan(120);
    expect(insideM(THE_PORTAL, v)).toBeCloseTo(v.lengthM, -1);
    for (const st of v.stations) expect(inside('portal', st.position), st.name).toBe(true);
    // Free build plays on the same site.
    expect(SANDBOX.siteId).toBe('portal');
  });

  test('the campus lines start at the real Caltrain stations and say how much of them the voxel sites cover', () => {
    // Googleplex: Mountain View Caltrain is 2 km south of the site; the Bay View launch pit, the curve and the Googleplex station are inside.
    const g = referenceView(GOOGLEPLEX_SPUR);
    expect(near(connect(GOOGLEPLEX_SPUR).a, station('mountainView'))).toBeLessThan(1);
    expect(inside('googleplex', connect(GOOGLEPLEX_SPUR).a)).toBe(false);
    expect(inside('googleplex', GOOGLEPLEX_SPUR.reference?.launchPit ?? { x: 0, z: 0 })).toBe(true);
    expect(g.stations.map((s) => [s.name, inside('googleplex', s.position)])).toEqual([
      ['Bay View', true],
      ['Googleplex', true],
      ['Mountain View', false],
    ]);
    expect(g.lengthM).toBeGreaterThan(4200);
    expect(g.lengthM).toBeLessThan(4400);
    expect(insideM(GOOGLEPLEX_SPUR, g) / g.lengthM).toBeGreaterThan(0.45);
    expect(insideM(GOOGLEPLEX_SPUR, g) / g.lengthM).toBeLessThan(0.55);
    expect(g.checks.minRadiusM).toBeGreaterThan(295);

    // Dumbarton: Redwood City Caltrain to Willow Road on the freight lead; only the Meta end is in the site.
    const d = referenceView(DUMBARTON_TO_META);
    expect(near(connect(DUMBARTON_TO_META).a, station('redwoodCity'))).toBeLessThan(1);
    expect(near(connect(DUMBARTON_TO_META, 'cross-the-bay').b, station('unionCity'))).toBeLessThan(1);
    expect(inside('meta', connect(DUMBARTON_TO_META).b)).toBe(true);
    expect(inside('meta', d.stations[2].position)).toBe(true);
    expect(d.lengthM).toBeGreaterThan(7300);
    expect(d.lengthM).toBeLessThan(7700);
    expect(insideM(DUMBARTON_TO_META, d)).toBeGreaterThan(1600);
    expect(insideM(DUMBARTON_TO_META, d)).toBeLessThan(1800);
    // The line follows the OSM track of the corridor: every vertex east of Redwood Junction is within 15 m of a rail track.
    expect(BAKED_DUMBARTON_TRACK.length).toBeGreaterThan(100);
    for (const w of d.waypoints.slice(1, -1)) {
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < BAKED_DUMBARTON_TRACK.length; i += 2)
        best = Math.min(best, near(w, { x: BAKED_DUMBARTON_TRACK[i], z: BAKED_DUMBARTON_TRACK[i + 1] }));
      expect(best, `${w.x}, ${w.z}`).toBeLessThan(15);
    }
    expect(d.segments.every((s) => s.method === 'atGrade')).toBe(true);

    // Oracle: Belmont Caltrain to the towers, all of it inside the site; San Carlos is the stretch anchor.
    const o = referenceView(ORACLE_SHUTTLE);
    expect(near(connect(ORACLE_SHUTTLE).a, station('belmont'))).toBeLessThan(1);
    expect(near(connect(ORACLE_SHUTTLE, 'from-san-carlos').a, station('sanCarlos'))).toBeLessThan(1);
    expect(insideM(ORACLE_SHUTTLE, o)).toBeCloseTo(o.lengthM, -1);
    expect(o.lengthM).toBeGreaterThan(1300);
    expect(o.lengthM).toBeLessThan(1450);
    expect(near(o.stations[1].position, connect(ORACLE_SHUTTLE).b)).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------- playthroughs

interface Played {
  sim: GameSim;
  run: ReturnType<typeof playMission>;
  snap: GameSnapshot;
  project: ProjectView;
}

function play(
  scenario: ScenarioDef,
  seed: number,
  opts: Parameters<typeof playMission>[1] = {},
  world: { applyEdit(e: WorldEdit): unknown } | null = null,
): Played {
  const sim = createSim(scenario, seed, world);
  const run = playMission(sim, opts);
  const snap = sim.snapshot();
  return { sim, run, snap, project: snap.projects[0] };
}

const autopilot = SCENARIOS.filter((s) => !s.sandbox).map((s) => [s.id, play(s, 2026)] as const);
const byId = (id: string): Played => {
  const hit = autopilot.find(([x]) => x === id);
  if (!hit) throw new Error(`no playthrough of ${id}`);
  return hit[1];
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

describe('every mission plays start to finish on autopilot through the clock contract', () => {
  test.each(autopilot)('%s: official plan, every button pressed, no hands on the machine', (id, { sim, run, snap, project }) => {
    expect(run.complete, `${id} did not complete in ${run.seconds.toFixed(0)} s`).toBe(true);
    expect(snap.notices).toEqual([]);
    expect(snap.mission).toMatchObject({ complete: true, stage: 'done', projectId: project.id });
    expect(snap.objectives.find((o) => o.id === 'connect')?.status).toBe('done');
    expect(project.status).toBe('open');
    // Pace: no phase is a longer time-lapse than about ten seconds, and nobody was driving.
    expect(run.longestLapseSeconds).toBeLessThan(13);
    expect(run.secondsByMode.drive).toBe(0);
    expect(run.secondsByMode.idle).toBeLessThan(1);
    // One breakthrough per machine heading, one opening, one mission complete.
    const count = (kind: string) => run.feed.filter((f) => f.kind === kind).length;
    const machines = sim.state.projects[0].fronts.filter(
      (f) => f.method === 'boredTwin' || f.method === 'boredSingleLarge' || f.method === 'mined',
    );
    expect(count('breakthrough')).toBe(machines.length);
    expect(count('tbmLaunched')).toBe(machines.length);
    expect(count('lineOpened')).toBe(1);
    expect(count('missionComplete')).toBe(1);
    expect(count('projectApproved')).toBe(1);
    for (const f of sim.state.projects[0].fronts) expect(f.breakthroughTick, f.name).toBeGreaterThan(0);
    // The scorecard is final and its columns are the receipt's.
    const card = project.scorecard;
    expect(card.final).toBe(true);
    expect(card.yours.costCents).toBe(project.spentCents);
    expect(snap.mission.result).toEqual({
      stars: card.stars,
      costCents: card.yours.costCents,
      costPerKmCents: card.yours.costPerKmCents,
      openDate: card.yours.openDate,
      ratioToPoland: project.receipt.ratios.yoursToPoland,
    });
    expect(card.stars).toBeGreaterThanOrEqual(0);
    expect(card.stars).toBeLessThanOrEqual(3);
    // Nothing was reformed, so the player paid what the status quo pays plus what this seed's cards cost in full,
    // and a year of standing still where the funding ran out (the cash call, default answer: wait for a ballot measure).
    expect(project.receipt.ratios.yoursToStatusQuo).toBeGreaterThan(0.98);
    expect(project.receipt.ratios.yoursToStatusQuo).toBeLessThan(1.35);
    // Money is a constraint: a status-quo run of a mission ends in the black only because it was called for.
    expect(snap.moneyCents).toBeGreaterThanOrEqual(0);
    expect(project.receipt.ratios.yoursToPoland).toBeGreaterThan(5);
    // A train runs back and forth between the first and the last station, carrying the demand model's riders.
    expect(snap.services).toHaveLength(1);
    const service = snap.services[0];
    expect(service.ridersPerDay).toBe(snap.ridersPerDay);
    expect(service.ridersPerDay).toBeGreaterThan(0);
    expect(service.stops).toHaveLength(project.stations.length);
    expect(service.lengthM).toBeGreaterThan(project.lengthM * 0.8);
    const trains = trainsAt(service, 12.5);
    expect(trains).toHaveLength(service.trains);
    for (const t of trains) {
      expect(t.chainageM).toBeGreaterThanOrEqual(0);
      expect(t.chainageM).toBeLessThanOrEqual(service.lengthM + 1e-6);
    }
    expect(trainsAt(service, 0)[0].atStationId).toBe(service.stops[0].stationId);
  });

  test(`real time at speed 1x with nobody at the controls: ${autopilot.map(([id, p]) => `${id} ${mmss(p.run.seconds)}`).join(', ')}; no mission is over five minutes of watching`, () => {
    const portal = byId('the-portal').run;
    // The first playtest sat through five minutes of autopilot at 1x. Watching is now two minutes of build at most,
    // and the hint names the speed keys; a player who drives spends longer by choice (see the hands-on run below).
    expect(portal.seconds).toBeGreaterThan(120);
    expect(portal.seconds).toBeLessThan(300);
    expect(portal.secondsByMode.build).toBeGreaterThan(60);
    expect(portal.secondsByMode.build).toBeLessThan(CONSTANTS.buildTargetSeconds.value * 1.25);
    expect(portal.secondsByMode.lapse).toBeLessThan(75);
    for (const [id, p] of autopilot) {
      expect(p.run.seconds, id).toBeGreaterThan(90);
      expect(p.run.seconds, id).toBeLessThan(300);
    }
  });

  test('free build: a hand-drawn line with stations opens and completes the mission', () => {
    const a = { x: 20_804, z: -64_695 };
    const b = { x: 20_624.6, z: -66_108.8 };
    const mid = { x: 21_100, z: -65_400 };
    const plan: GameCommand[] = [
      {
        t: 'setAlignment',
        projectId: 'line',
        waypoints: [
          { ...a, y: -18 },
          { ...mid, y: -20 },
          { ...b, y: -16 },
        ],
      },
      { t: 'addStation', projectId: 'line', name: 'South', template: 'undergroundStandard', chainageM: 0 },
      { t: 'addStation', projectId: 'line', name: 'North', template: 'undergroundStandard', at: b },
    ];
    const sim = createSim(SANDBOX, 4);
    expect(sim.snapshot().mission).toMatchObject({ freeBuild: true, planProjectId: 'line', stage: 'plan' });
    expect(sim.snapshot().nextAction).toMatchObject({ kind: 'drawAlignment', focus: 'plan' });
    const run = playMission(sim, { plan });
    expect(run.complete).toBe(true);
    const p = sim.snapshot().projects[0];
    // Free build starts as a two-track metro (the three-track mandate is The Portal's): nobody chose a design, so twin bores.
    expect(p.design.tunnel).toBe('twinBore');
    expect(p.scorecard.ghost.kind).toBe('model');
    expect(sim.snapshot().services).toHaveLength(1);
  });
});

// A first-time player who reforms as political capital allows, builds the Polish design and drives the machine by hand.
const WISH = [
  'twoTracks',
  'twinBoreStandard',
  'noMezzanines',
  'shallowBoxes',
  'potholeFirst',
  'groundInvestigation',
  'segmentPlantLogistics',
  'rightSizeTerminal',
  'stageGates',
  'bestValueAward',
  'stationCatalogue',
  'inHouseEngineering',
  'roundTheClock',
  'itemizedContracts',
  'utilityStatute',
];

function player(log: { reform: string; tick: number; pc: number }[] = []): NonNullable<Parameters<typeof playMission>[1]>['each'] {
  // Scripted hands: straight at full thrust, a weave to the right, back under the cruise law, a slow stretch by hand, then autopilot.
  let phase = 0;
  return (snap) => {
    const out: GameCommand[] = [];
    // Everything on the list that the capital in hand buys, in order, before any gate is pressed: tender fixes
    // the design and the contract prices, so a reform bought one frame later would be a reform bought too late.
    let pc = snap.politicalCapital;
    let cash = snap.moneyCents;
    const have = new Set(snap.reforms.filter((x) => x.status === 'enacted').map((x) => x.id));
    for (const id of WISH) {
      const r = snap.reforms.find((x) => x.id === id);
      if (!r || have.has(id) || !r.prereqs.every((x) => have.has(x)) || r.cost.pc > pc || (r.cost.cents > 0 && r.cost.cents > cash))
        continue;
      out.push({ t: 'enactReform', id });
      log.push({ reform: id, tick: snap.tick, pc });
      pc -= r.cost.pc;
      cash -= r.cost.cents;
      have.add(id);
    }
    const p = snap.projects[0];
    if (!p) return out;
    if (!p.designFrozen) {
      for (const o of p.design.options) {
        if ((o.id !== 'twinBore' && o.id !== 'compactBox') || o.selected || o.lockedBy.length > 0) continue;
        out.push(
          o.group === 'tunnel'
            ? { t: 'setDesign', projectId: p.id, tunnel: 'twinBore' }
            : { t: 'setDesign', projectId: p.id, stationBox: 'compactBox' },
        );
      }
    }
    const t = p.tbms.find((x) => x.status !== 'done' && x.method === 'boredTwin');
    if (!t) return out;
    const control = (c: Omit<Extract<GameCommand, { t: 'tbmControl' }>, 't' | 'headingId'>) =>
      out.push({ t: 'tbmControl', headingId: t.id, ...c });
    if (phase === 0) {
      control({ autopilot: false });
      phase = 1;
    } else if (phase === 1 && t.boredM > 150) {
      control({ steer: 1 });
      phase = 2;
    } else if (phase === 2 && t.deviation.lateralM > 12) {
      control({ steer: 0, autopilot: true });
      phase = 3;
    } else if (phase === 3 && t.boredM > 600 && t.deviation.totalM < 1) {
      control({ autopilot: false, thrust: 0.5, steer: 0, pitch: 0 });
      phase = 4;
    } else if (phase === 4 && t.boredM > 700) {
      control({ autopilot: true });
      phase = 5;
    }
    return out;
  };
}

const reformLog: { reform: string; tick: number; pc: number }[] = [];
const playerEdits: WorldEdit[] = [];
const hands = play(THE_PORTAL, 11, { each: player(reformLog) }, { applyEdit: (e) => playerEdits.push(e) });
const pcTree = REFORMS.reduce((sum, r) => sum + r.cost.pc, 0);

describe('The Portal, played by hand', () => {
  const { sim, run, snap, project } = hands;
  const front = sim.state.projects[0].fronts[0];

  test(`a reforming player who drives the TBM opens it in ${mmss(run.seconds)} of real time for ${usdB(project.spentCents)} (${project.receipt.ratios.yoursToPoland.toFixed(1)}x Poland, ${project.scorecard.stars} stars) against the official ${usdB(project.receipt.ghost?.costCents ?? 0)}`, () => {
    expect(run.complete).toBe(true);
    expect(snap.notices).toEqual([]);
    // Polish design: one twin-bore drive end to end and compact boxes, chosen once the reforms unlocked them.
    expect(project.design).toMatchObject({ tunnel: 'twinBore', stationBox: 'compactBox', frozen: true });
    expect(sim.state.projects[0].fronts).toHaveLength(1);
    expect(front).toMatchObject({ method: 'boredTwin', fromM: 0 });
    expect(front.name).toMatch(/^TBM /);
    // The machine was driven: sub-step integration, time in drive mode, a real as-built axis.
    expect(front.drive).not.toBeNull();
    expect(run.secondsByMode.drive).toBeGreaterThan(180);
    expect(run.secondsByMode.drive).toBeLessThan(330);
    expect(front.boredM).toBeGreaterThan(project.lengthM - 5);
    expect(front.boredM).toBeLessThan(project.lengthM + 40);
    expect(project.tbms[0]).toMatchObject({ status: 'done', driven: true, progress: 1 });
    // Off plan on the weave: a banner, a surcharge, a line on the receipt.
    expect(run.feed.some((f) => f.kind === 'tbmOffPlan')).toBe(true);
    expect(sim.state.projects[0].offPlanCents).toBeGreaterThan(0);
    expect(project.receipt.lines.find((l) => l.id === 'offPlan')?.cents.yours).toBeGreaterThan(0);
    // Breakthrough exactly once, at the trainbox.
    const through = run.feed.filter((f) => f.kind === 'breakthrough');
    expect(through).toHaveLength(1);
    expect(through[0].text).toMatch(/^Breakthrough at Salesforce Transit Center/);
    // Far cheaper and no later than the official plan; not yet Poland.
    expect(project.spentCents).toBeLessThan((project.receipt.ghost?.costCents ?? 0) * 0.4);
    expect(project.receipt.ratios.yoursToPoland).toBeGreaterThan(2);
    expect(project.receipt.ratios.yoursToPoland).toBeLessThan(8);
    expect(project.scorecard.stars).toBeGreaterThanOrEqual(1);
    expect(snap.objectives.find((o) => o.id === 'official-budget')?.status).toBe('done');
    expect(snap.objectives.find((o) => o.id === 'official-date')?.status).toBe('done');
    // Lines the player removed say so, and name the reform that did it.
    const line = (id: ReceiptLineId) => {
      const l = project.receipt.lines.find((x) => x.id === id);
      if (!l) throw new Error(`no line ${id}`);
      return l;
    };
    expect(line('designSystems').status).toBe('removed');
    expect(line('designSystems').reforms).toEqual([{ id: 'twoTracks', title: 'Two tracks are enough', enacted: true }]);
    expect(line('priceLevel').status).toBe('paid');
    expect(line('priceLevel').reforms.every((r) => !r.enacted)).toBe(true);
    expect(line('priceLevel').factor.yours).toBeCloseTo(1.61, 3);
    expect(line('designTunnel').cents.yours).toBeLessThan(line('designTunnel').cents.statusQuo * 0.2);
    expect(line('designStations').cents.yours).toBeLessThan(line('designStations').cents.statusQuo * 0.3);
  });

  test(`political capital: ${THE_PORTAL.start.politicalCapital} at the start buys ${reformLog.filter((r) => r.tick === 0 && (REFORMS.find((x) => x.id === r.reform)?.cost.pc ?? 0) > 0).length} reforms on day one; by opening ${sim.state.reforms.length} of ${REFORMS.length} are enacted`, () => {
    const dayOne = reformLog.filter((r) => r.tick === 0 && (REFORMS.find((x) => x.id === r.reform)?.cost.pc ?? 0) > 0);
    expect(dayOne.length).toBeGreaterThanOrEqual(2);
    expect(dayOne.length).toBeLessThanOrEqual(3);
    // About half the tree by the end of mission 1.
    expect(sim.state.reforms.length / REFORMS.length).toBeGreaterThan(0.4);
    expect(sim.state.reforms.length / REFORMS.length).toBeLessThan(0.65);
    // Earned at milestones and month by month: phases, the breakthrough, and the opening on top.
    const p = sim.state.projects[0];
    const earned = Math.floor(p.openedTick / 30) * PC_PER_MONTH + 5 * PC_PHASE_DONE + PC_BREAKTHROUGH + PC_OPENING;
    const spent = sim.state.reforms.reduce(
      (sum, id) => sum + (THE_PORTAL.start.policies.includes(id) ? 0 : (REFORMS.find((r) => r.id === id)?.cost.pc ?? 0)),
      0,
    );
    const cards = sim.state.eventLog.length * 0;
    expect(snap.politicalCapital).toBeLessThanOrEqual(
      THE_PORTAL.start.politicalCapital + earned - spent - cards + Math.floor((snap.tick - p.openedTick) / 30 + 1) * 4,
    );
    expect(THE_PORTAL.start.politicalCapital + earned).toBeLessThan(pcTree * 0.65);
    expect(THE_PORTAL.start.politicalCapital + earned).toBeGreaterThan(pcTree * 0.35);
  });

  test('the driven tunnel is carved without gaps from the launch pit into the trainbox, and trains follow the as-built axis', () => {
    const capsules = playerEdits.filter((e) => e.t === 'carveCapsule' && e.radius === 3.3);
    expect(capsules.length).toBeGreaterThan(3000);
    const key = (v: { x: number; y: number; z: number }) => `${v.x},${v.y},${v.z}`;
    const ends = new Set<string>();
    let unlinked = 0;
    for (const e of capsules) {
      if (e.t !== 'carveCapsule') continue;
      if (!ends.has(key(e.a))) unlinked++;
      ends.add(key(e.b));
      expect(Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z)).toBeLessThan(15);
    }
    // Two tubes start a chain each; where the heading was taken over the tube offsets switch from the corner bisector to the machine axis.
    expect(unlinked).toBeLessThanOrEqual(6);
    const tunnel = project.tunnels[0];
    const last = tunnel.path[tunnel.path.length - 1];
    const box = THE_PORTAL.reference?.destination ?? { x: 0, z: 0 };
    expect(Math.hypot(last.x - box.x, last.z - box.z)).toBeLessThan(0.01);
    expect(tunnel.linedM).toBeCloseTo(tunnel.trackM, 6);
    // The service runs on the tunnel as built, weave included: longer than the plan between the two stations.
    const service = snap.services[0];
    expect(service.stops.map((s) => s.name)).toEqual(['4th and Townsend', 'Salesforce Transit Center']);
    const planned = project.stations[1].chainageM - project.stations[0].chainageM;
    expect(service.lengthM).toBeGreaterThan(planned - 3);
    expect(service.lengthM).toBeLessThan(planned + 40);
    for (const t of [0, 7, 31, 64]) {
      const train = trainsAt(service, t)[0];
      let best = Number.POSITIVE_INFINITY;
      for (const p of tunnel.path) best = Math.min(best, Math.hypot(p.x - train.position.x, p.z - train.position.z));
      expect(best, `train at ${t} s is on the tunnel axis`).toBeLessThan(4);
    }
  });

  test('the same hands on the same seed replay to the same hash; a save in the middle of the drive resumes into the same game', () => {
    const again = play(THE_PORTAL, 11, { each: player() });
    expect(again.sim.hash()).toBe(sim.hash());
    expect(again.run.frames).toBe(run.frames);
    expect(play(THE_PORTAL, 12, { each: player() }).sim.hash()).not.toBe(sim.hash());

    // Stop a third run while the machine is under manual control, mid-day, and split it in two.
    const first = createSim(THE_PORTAL, 11);
    const each = player();
    let saved: ReturnType<GameSim['save']> | null = null;
    playMission(first, {
      each: (s, live) => {
        const t = s.projects[0]?.tbms[0];
        if (!saved && t?.driven && !t.autopilot && t.boredM > 650 && live.state.subTick !== 0) saved = live.save();
        return each?.(s, live);
      },
    });
    if (!saved) throw new Error('the run never reached the manual stretch at a sub-step inside a day');
    const save = JSON.parse(JSON.stringify(saved)) as ReturnType<GameSim['save']>;
    expect((save.sim as { subTick?: number }).subTick).not.toBe(0);
    // The uninterrupted run is the reference: it must end in the same state as the first full run.
    expect(first.hash()).toBe(sim.hash());
    const replay: WorldEdit[] = [];
    const resumed = loadSim(save, { applyEdit: (e) => replay.push(e) });
    expect(replay.length).toBeGreaterThan(100);
    const a = loadSim(save);
    // Same commands at the same sub-steps on both copies.
    const steps = 40 * SUBSTEPS_PER_DAY + 17;
    for (let i = 0; i < steps; i++) {
      const cmds: GameCommand[] =
        i === 500
          ? [{ t: 'tbmControl', headingId: `${PORTAL_PROJECT_ID}/f1`, steer: -0.5 }]
          : i === 3000
            ? [{ t: 'tbmControl', headingId: `${PORTAL_PROJECT_ID}/f1`, autopilot: true }]
            : [];
      a.substep(cmds);
      resumed.substep(cmds);
    }
    expect(resumed.hash()).toBe(a.hash());
    expect(resumed.snapshot().projects[0].tbms[0].boredM).toBeGreaterThan(700);
  });
});

// ---------------------------------------------------------------- calibration on the receipt

const statusQuoRun = byId('the-portal');
const officialDraft = referenceView(THE_PORTAL);
const polish = (() => {
  // The Polish design under every Polish-practice reform: official route, twin bore, compact boxes.
  const sim = createSim(withPolandProfile(THE_PORTAL), 1, null, { events: false });
  const run = playMission(sim, {
    plan: [{ t: 'useOfficialPlan' }, { t: 'setDesign', projectId: PORTAL_PROJECT_ID, tunnel: 'twinBore', stationBox: 'compactBox' }],
  });
  return { sim, run, project: sim.snapshot().projects[0] };
})();
const WARSAW_PER_KM = (CONSTANTS.warsawM2ExtensionPlnPerKm2026.value / CONSTANTS.plnPerUsdNominal.value) * 100;
const LODZ_PER_KM = (CONSTANTS.lodzTunnelPlnPerKm2026.value / CONSTANTS.plnPerUsdNominal.value) * 100;
const rq = officialDraft.receipt;
const groupLine = (r: ProjectView['receipt'], col: 'yours' | 'statusQuo' | 'poland') =>
  r.groups.map((g) => `${g.id} x${g.factor[col].toFixed(2)} (+${usdM(g.cents[col])})`).join(', ');

describe('The Portal calibration, on the receipt', () => {
  test(`status quo, official alignment, California design: ${usdB(rq.columns.statusQuo.costCents)} (${usdM(rq.columns.statusQuo.costPerKmCents)}/km) against the official ${usdB(rq.ghost?.costCents ?? 0)} (${usdM(rq.ghost?.costPerKmCents ?? 0)}/km): ${((rq.ghost?.unexplainedShare ?? 0) * 100).toFixed(1)} percent unexplained`, () => {
    expect(rq.ghost).toMatchObject({ label: 'Official plan (TJPA, 2025)', costCents: 6.84e11, openDate: '2036-03-31' });
    expect(rq.ghost?.lengthKm).toBeCloseTo(rq.columns.statusQuo.lengthKm, 9);
    expect(Math.abs(rq.ghost?.unexplainedShare ?? 1)).toBeLessThan(0.15);
    expect(Math.abs(rq.columns.statusQuo.costCents / 6.84e11 - 1)).toBeLessThan(0.15);
    expect(rq.columns.statusQuo.basis).toBe('The official plan, under the rules of 2026');
    expect(rq.columns.statusQuo.openDate.slice(0, 4)).toBe('2036');
    // Before any reform the player's forecast is the status quo.
    expect(rq.ratios.yoursToStatusQuo).toBeCloseTo(1, 2);
    // The played status-quo mission (seeded breakdowns and event cards) lands inside the same tolerance.
    expect(Math.abs(statusQuoRun.project.spentCents / 6.84e11 - 1)).toBeLessThan(0.15);
    expect(statusQuoRun.project.scorecard.ghost).toMatchObject({ kind: 'sponsor', costCents: 6.84e11 });
  });

  test(`Polish design, all reforms: ${usdM(polish.project.spentCents)} (${usdM(polish.project.receipt.columns.yours.costPerKmCents)}/km); Warsaw M2 extensions ${usdM(WARSAW_PER_KM)}/km, Lodz tunnel ${usdM(LODZ_PER_KM)}/km; status quo to Poland ${rq.ratios.statusQuoToPoland.toFixed(1)}x, official figure to Poland ${(rq.ratios.ghostToPoland ?? 0).toFixed(1)}x`, () => {
    const r = polish.project.receipt;
    expect(polish.run.complete).toBe(true);
    expect(polish.project.design).toMatchObject({ tunnel: 'twinBore', stationBox: 'compactBox' });
    // At the Polish per-km anchor: between the Lodz tunnel and 25 percent above the Warsaw M2 extensions (the run is paid in 2027 to 2032 dollars).
    expect(r.columns.yours.costPerKmCents).toBeGreaterThan(LODZ_PER_KM);
    expect(r.columns.yours.costPerKmCents).toBeLessThan(WARSAW_PER_KM * 1.25);
    // Without the delay lines the figure is in 2026 money: within 15 percent of the Warsaw M2 extension record.
    const delay = r.groups.find((g) => g.id === 'delay')?.cents.yours ?? 0;
    const perKm2026 = (r.columns.yours.costCents - delay) / r.columns.yours.lengthKm;
    expect(Math.abs(perKm2026 / WARSAW_PER_KM - 1)).toBeLessThan(0.15);
    // The player's column is then Poland's, to within the seeded breakdowns of the played run.
    expect(r.ratios.yoursToPoland).toBeGreaterThan(0.97);
    expect(r.ratios.yoursToPoland).toBeLessThan(1.03);
    for (const l of r.lines) {
      if (l.group === 'delay') continue;
      expect(l.status, l.id).toBe('removed');
      expect(Math.abs(l.factor.yours - 1), l.id).toBeLessThan(1e-3);
    }
    expect(polish.project.scorecard.stars).toBe(3);
    // The ratios are computed, not typed: they are the columns' cost per km.
    expect(rq.ratios.statusQuoToPoland).toBeCloseTo(rq.columns.statusQuo.costPerKmCents / rq.columns.poland.costPerKmCents, 12);
    expect(rq.ratios.ghostToPoland).toBeCloseTo((rq.ghost?.costPerKmCents ?? 0) / rq.columns.poland.costPerKmCents, 12);
    expect(rq.ratios.statusQuoToPoland).toBeGreaterThan(12);
    expect(rq.ratios.statusQuoToPoland).toBeLessThan(24);
  });

  test(`factor contributions, status quo: ${groupLine(rq, 'statusQuo')} on a Polish base of ${usdM(rq.columns.statusQuo.baseCents)}; Poland: ${groupLine(rq, 'poland')}`, () => {
    const g = Object.fromEntries(rq.groups.map((x) => [x.id, x]));
    // Every factor is material and none carries the gap alone.
    for (const id of ['designScope', 'institutional', 'delay', 'priceLevel'] as const) {
      expect(g[id].factor.statusQuo, id).toBeGreaterThan(1.2);
      expect(g[id].factor.statusQuo, id).toBeLessThan(5);
      expect(g[id].cents.statusQuo, id).toBeGreaterThan(0);
    }
    // The price-level gap is its own line, 1.61, and Poland does not pay it.
    expect(g.priceLevel.factor.statusQuo).toBeCloseTo(CONSTANTS.priceLevelFactor.value, 6);
    expect(g.priceLevel.factor.poland).toBeCloseTo(1, 9);
    expect(rq.lines.at(-1)).toMatchObject({ id: 'priceLevel', group: 'priceLevel' });
    expect(rq.lines.at(-1)?.label).toMatch(/Price level/);
    // Poland pays for delay only: escalation over its own schedule and its own standing organisation.
    expect(g.designScope.cents.poland).toBeLessThan(100_000);
    expect(Math.abs(g.institutional.cents.poland)).toBeLessThan(100_000);
    expect(g.delay.cents.poland).toBeGreaterThan(0);
    // The product of the four factors is the status quo's cost over its Polish base.
    const product = rq.groups.reduce((a, x) => a * x.factor.statusQuo, 1);
    expect(product).toBeCloseTo(rq.columns.statusQuo.costCents / rq.columns.statusQuo.baseCents, 4);
    // Institutional levers by name, at their status-quo values.
    const f = Object.fromEntries(rq.lines.map((l) => [l.id, l.factor.statusQuo]));
    expect(f.procurement).toBeCloseTo(1.5, 6);
    expect(f.staffing).toBeCloseTo(1.3, 6);
    expect(f.utilities).toBeCloseTo(1.2, 6);
    expect(f.softCosts).toBeCloseTo(1.3 / 1.1, 6);
    expect(f.contingency).toBeCloseTo(1.35, 6);
  });
});

describe('each reform moves the receipt the documented way', () => {
  // From scratch (no head start, nothing enacted), so planning reforms have something to shorten, with capital for any one reform.
  const scratch: ScenarioDef = {
    ...THE_PORTAL,
    start: { ...THE_PORTAL.start, policies: [], headStart: undefined, politicalCapital: 100, budgetCents: 10_000_000_000_00 },
  };
  /** Everything a reform needs first, so it can be enacted alone by command. */
  const prerequisites = (id: string): string[] => {
    const out: string[] = [];
    const visit = (x: string) => {
      for (const pre of REFORMS.find((r) => r.id === x)?.prereqs ?? []) {
        if (out.includes(pre)) continue;
        visit(pre);
        out.push(pre);
      }
    };
    visit(id);
    return out;
  };
  /** Reforms that only change event hazards or machine rates: nothing on a no-event forecast of the official plan, which has no TBM. */
  const QUIET = [
    'narrowRecord',
    'potholeFirst',
    'groundInvestigation',
    'segmentPlantLogistics',
    'rightMachine',
    'continuousAdvance',
    'prufrockClass',
  ];

  test.each(REFORMS.map((r) => [r.id, r.title] as const))('%s (%s)', (id) => {
    const sim = createSim(withStartReforms(scratch, prerequisites(id)), 1, null, { events: false });
    sim.dispatch([{ t: 'useOfficialPlan' }]);
    const base = sim.snapshot();
    const view = base.reforms.find((r) => r.id === id);
    if (!view) throw new Error(`no reform view ${id}`);
    expect(view.status).toBe('available');
    expect(view.receiptLines.length).toBeGreaterThan(0);
    const baseLines = Object.fromEntries(base.projects[0].receipt.lines.map((l) => [l.id, l.cents.yours]));
    const baseCost = base.projects[0].receipt.columns.yours.costCents;
    // The player buys it.
    sim.dispatch([{ t: 'enactReform', id }]);
    const bought = sim.snapshot();
    expect(bought.notices).toEqual([]);
    expect(bought.reforms.find((r) => r.id === id)?.status).toBe('enacted');
    const after = bought.projects[0].receipt;
    // What the reform cost in cash is paid by the project, on its own line; nothing else gets dearer.
    const price = REFORMS.find((r) => r.id === id)?.cost.cents ?? 0;
    expect(after.lines.find((l) => l.id === 'reformCash')?.cents.yours).toBe(price);
    const cost = after.columns.yours.costCents - price;
    expect(cost).toBeLessThanOrEqual(baseCost);
    let own = 0;
    let ownBefore = 0;
    for (const l of after.lines) {
      if (l.id === 'reformCash') continue;
      expect(l.cents.yours - baseLines[l.id], `${l.id} does not rise`).toBeLessThan(baseCost * 1e-6);
      if (view.receiptLines.includes(l.id)) {
        own += l.cents.yours;
        ownBefore += baseLines[l.id];
        expect(
          l.reforms.some((r) => r.id === id && r.enacted),
          `${l.id} names ${id} as enacted`,
        ).toBe(true);
      }
    }
    // The status quo and Poland columns do not move: they are counterfactuals, not the player's project.
    expect(after.columns.statusQuo.costCents).toBe(base.projects[0].receipt.columns.statusQuo.costCents);
    expect(after.columns.poland.costCents).toBe(base.projects[0].receipt.columns.poland.costCents);
    if (QUIET.includes(id)) {
      expect(cost).toBe(baseCost);
      // Its effect is on hazards or machine rates: the preview invents no saving, and says what the reform costs in cash.
      expect(view.preview?.costDeltaCents).toBe(price);
      return;
    }
    // The lines the reform claims fall, by at least half a percent of the project, and the preview pointed the same way.
    // The Buy America waiver acts on track, power and signalling only, a twentieth of this project: a third of a percent.
    expect(ownBefore - own, 'its own lines fall').toBeGreaterThan(baseCost * (id === 'importSupplyChain' ? 0.003 : 0.005));
    expect(view.preview?.costDeltaCents).toBeLessThan(0);
    // The preview is what enacting did, cash price included, to within 5 percent of the change (the closed form
    // is worst on reforms that change the length of construction: 4 percent on master permitting).
    expect(Math.abs((view.preview?.costDeltaCents ?? 0) / (after.columns.yours.costCents - baseCost) - 1), 'preview').toBeLessThan(0.05);
    expect(after.ratios.yoursToStatusQuo).toBeLessThan(base.projects[0].receipt.ratios.yoursToStatusQuo);
  });

  test('the Polish design under every Polish-practice rule at Polish prices leaves only delay on the receipt', () => {
    const sim = createSim(withStartReforms(scratch, POLAND_PROFILE), 1, null, { events: false });
    sim.dispatch([{ t: 'useOfficialPlan' }]);
    // The official methods under Polish rules come out a little under the par: cut-and-cover below Townsend Street
    // is cheaper than the two bores of the Polish design, and the receipt says so on the tunnel line.
    const official = sim.snapshot().projects[0].receipt;
    expect(official.ratios.yoursToPoland).toBeGreaterThan(0.9);
    expect(official.ratios.yoursToPoland).toBeLessThan(1);
    expect(official.lines.find((l) => l.id === 'designTunnel')?.cents.yours).toBeLessThan(0);
    for (const l of official.lines) if (l.group === 'institutional' || l.group === 'priceLevel') expect(l.status, l.id).toBe('removed');
    sim.dispatch([{ t: 'setDesign', projectId: PORTAL_PROJECT_ID, tunnel: 'twinBore' }]);
    const r = sim.snapshot().projects[0].receipt;
    expect(r.ratios.yoursToPoland).toBeCloseTo(1, 3);
    for (const l of r.lines) if (l.group !== 'delay') expect(l.status, l.id).toBe('removed');
  });

  test('the player can enact everything and the price level is still there: 1.61 times the Polish design, no reform listed', () => {
    const sim = createSim({ ...scratch, start: { ...scratch.start, politicalCapital: 1000 } }, 1, null, { events: false });
    const all = REFORMS.filter((r) => !r.beyondPoland).map((r) => ({ t: 'enactReform' as const, id: r.id }));
    sim.dispatch([{ t: 'useOfficialPlan' }, ...all, ...all, { t: 'setDesign', projectId: PORTAL_PROJECT_ID, tunnel: 'twinBore' }]);
    const r = sim.snapshot().projects[0].receipt;
    const price = r.lines.find((l) => l.id === 'priceLevel');
    expect(price?.factor.yours).toBeCloseTo(1.61, 6);
    expect(price?.reforms).toEqual([]);
    expect(price?.cents.yours).toBe(r.lines.find((l) => l.id === 'priceLevel')?.cents.statusQuo);
    // Every lever is gone; what is left under "institutional" is the cash the reforms themselves cost, to the cent.
    const cash = REFORMS.filter((x) => !x.beyondPoland).reduce((a, x) => a + x.cost.cents, 0);
    for (const l of r.lines) {
      if (l.id === 'reformCash') expect(l.cents.yours).toBe(cash);
      else if (l.group === 'institutional' || l.group === 'designScope') expect(l.cents.yours, l.id).toBe(0);
    }
    // What is left over Poland: the price level (on the escalation and the standing organisation too) and the
    // $80M of surveys and plant bought on a project whose Polish price is $366M.
    expect(r.ratios.yoursToPoland).toBeGreaterThan(1.6);
    expect(r.ratios.yoursToPoland).toBeLessThan(1.9);
  });
});
