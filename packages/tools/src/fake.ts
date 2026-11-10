/**
 * Test double of BayServices for the tools: a flat site seen straight from above, where one CSS pixel is one
 * metre (screen x is world x, screen y is world z), and a tiny command interpreter standing in for the sim.
 * Commands queue as in the app and reach the snapshot on `apply()`, so tests can exercise the lag between a
 * commit and the snapshot that shows it. Not exported from the package.
 */
import {
  type GroundPick,
  Material,
  type OverlaySpec,
  type PreviewGeometry,
  type ToolPort,
  type WorldPos,
  type WorldStore,
} from '@bayvox/core';
import {
  type AlignmentEstimate,
  type AlignmentEstimateRequest,
  type BayServices,
  chainages,
  type GameCommand,
  type GameSnapshot,
  type Geology,
  type Method,
  nearestChainage,
  type ProjectView,
  pointAt,
  type StationView,
  type TbmView,
  type Waypoint,
} from '@bayvox/sim';
import { createValue, deflection } from './util.ts';

export const GROUND_Y = 10;
export const FAKE_LIMITS = { minRadiusM: 150, maxGradePct: 3 };
/** West of this x the fake ground is rock, east of it Bay Mud. */
export const MUD_FROM_X = 2000;

export interface FakeOverlayItem {
  id: string;
  spec: OverlaySpec;
  removed: boolean;
  updates: number;
}

export interface Fake {
  services: BayServices;
  world: WorldStore;
  /** Every command the tools sent, in order. */
  commands: GameCommand[];
  cues: string[];
  /** Every setPreview call. */
  previews: (PreviewGeometry | null)[];
  overlayItems: FakeOverlayItem[];
  follows: (string | null)[];
  digs: { center: WorldPos; radiusM: number }[];
  /** Runs the queued commands and publishes a new snapshot. */
  apply(): void;
  snapshot(): GameSnapshot;
  project(): ProjectView | undefined;
  /** Edits the snapshot directly (freeze the design, add a machine) and publishes it. */
  mutate(fn: (s: GameSnapshot) => void): void;
  /** When true the fake sim refuses setAlignment and records a notice instead. */
  rejectAlignments: boolean;
  /** Volume the next digs report, cubic metres. */
  digVolumeM3: number;
  /** Screen x below which the cursor is over the sky. */
  skyBelowX: number;
  /** World x from which the top three metres are water (open Bay). Default: no water. */
  waterFromX: number;
  /** What world.digBlocked answers: a reason, or null to allow the dig. */
  digBlocked: string | null;
  estimates: number;
  geologyOf(material: number): Geology;
}

export const OFFICIAL: Waypoint[] = [
  { x: 100, y: -10, z: 100, geology: 'bayMud' },
  { x: 1100, y: -10, z: 100, geology: 'softGround' },
  { x: 2100, y: -12, z: 400, geology: 'softGround' },
];
export const OFFICIAL_METHODS: Method[] = ['cutAndCover', 'mined'];

export function fakeTbm(over: Partial<TbmView> = {}): TbmView {
  return {
    id: 'portal/tbm-1',
    name: 'Anna',
    position: { x: 300, y: -10, z: 100 },
    yaw: Math.PI / 2,
    pitch: 0,
    radiusM: 3.3,
    laterals: [-6, 6],
    machine: 'twinBore',
    diameterM: 6.6,
    boreTotalDays: 200,
    boreDaysDone: 20,
    status: 'running',
    thrust: 1,
    method: 'boredTwin',
    chainageM: 200,
    fromM: 0,
    toM: 2000,
    progress: 0.1,
    rateMPerDay: 10.5,
    maxRateMPerDay: 10.5,
    driven: false,
    autopilot: true,
    steer: 0,
    pitchInput: 0,
    gradePct: 0,
    deviation: { lateralM: 0, verticalM: 0, totalM: 0, planChainageM: 200, limitM: 30, offPlan: false },
    geology: 'softGround',
    geologyLabel: 'Soft ground',
    limits: { ...FAKE_LIMITS },
    boredM: 200,
    stopReason: null,
    downDays: 0,
    breakthroughTick: -1,
    tunnelId: 'portal/tunnel-1',
    pitId: 'portal/pit-1',
    ...over,
  };
}

function segmentsOf(wps: readonly Waypoint[], methods: readonly Method[]): ProjectView['segments'] {
  const cum = chainages(wps);
  const out: ProjectView['segments'] = [];
  for (let i = 0; i + 1 < wps.length; i++) {
    const method = methods[i] ?? 'boredTwin';
    out.push({ index: i, fromM: cum[i], toM: cum[i + 1], method, effectiveMethod: method, geology: wps[i].geology ?? 'softGround' });
  }
  return out;
}

/** Radius a vertex can hold: the arc tangent may use half of the shorter leg. A stand-in for the sim's rule. */
function fitRadius(a: Waypoint, v: Waypoint, b: Waypoint): number | null {
  const half = Math.abs(deflection(a, v, b)) / 2;
  if (half < 1e-6) return null;
  const leg = Math.min(Math.hypot(v.x - a.x, v.z - a.z), Math.hypot(b.x - v.x, b.z - v.z));
  return leg / 2 / Math.tan(half);
}

export function fakeEstimate(req: AlignmentEstimateRequest): AlignmentEstimate {
  const wps = req.waypoints;
  if (wps.length < 2) throw new RangeError(`estimateAlignment: need at least 2 waypoints, got ${wps.length}`);
  const cum = chainages(wps);
  const lengthM = cum[cum.length - 1];
  const segmentIssues: AlignmentEstimate['checks']['segmentIssues'] = [];
  const vertexIssues: AlignmentEstimate['checks']['vertexIssues'] = [];
  const problems: string[] = [];
  let maxGradePct = 0;
  let minRadiusM: number | null = null;
  for (let i = 0; i + 1 < wps.length; i++) {
    const h = Math.hypot(wps[i + 1].x - wps[i].x, wps[i + 1].z - wps[i].z);
    const grade = h > 0 ? (Math.abs(wps[i + 1].y - wps[i].y) / h) * 100 : 0;
    maxGradePct = Math.max(maxGradePct, grade);
    const bad = grade > FAKE_LIMITS.maxGradePct;
    segmentIssues.push(bad ? 'grade' : null);
    if (bad) problems.push(`Grade on segment ${i + 1}: ${grade.toFixed(1)}%, maximum ${FAKE_LIMITS.maxGradePct}%`);
  }
  for (let i = 0; i < wps.length; i++) {
    const r = i > 0 && i + 1 < wps.length ? fitRadius(wps[i - 1], wps[i], wps[i + 1]) : null;
    if (r !== null) minRadiusM = minRadiusM === null ? r : Math.min(minRadiusM, r);
    const bad = r !== null && r < FAKE_LIMITS.minRadiusM;
    vertexIssues.push(bad ? 'radius' : null);
    if (bad) problems.push(`Curve at waypoint ${i + 1}: R ${Math.round(r)} m, minimum ${FAKE_LIMITS.minRadiusM} m`);
  }
  const lengthKm = lengthM / 1000;
  const costCents = Math.round(lengthM * 1_000_000 * 100);
  const polandCostCents = Math.round(costCents / 8);
  return {
    checks: {
      lengthM,
      minRadiusM,
      maxGradePct,
      limits: { ...FAKE_LIMITS },
      segmentIssues,
      vertexIssues,
      problems,
      ok: problems.length === 0,
    },
    lengthKm,
    costCents,
    costPerKmCents: Math.round(costCents / lengthKm),
    polandCostCents,
    polandCostPerKmCents: Math.round(polandCostCents / lengthKm),
    ratioToPoland: costCents / polandCostCents,
    daysToOpen: 2000,
    openDate: '2032-05-01',
  };
}

export function createFake(): Fake {
  let snap = {
    tick: 0,
    date: '2026-11-09',
    budgetCents: 0,
    projects: [] as ProjectView[],
    notices: [] as GameSnapshot['notices'],
    mission: {
      id: 'the-portal',
      title: 'The Portal',
      freeBuild: false,
      stage: 'plan',
      projectId: null,
      planProjectId: 'portal',
      complete: false,
      result: null,
      targets: [],
    },
    moneyCents: 1_000_000_000_00,
    handDig: { volumeM3: 0, cents: 0, centsPerM3: 39_000 },
  } as unknown as GameSnapshot;
  const snapshot = createValue<GameSnapshot>(snap);
  const pending: GameCommand[] = [];
  const noop = (): void => {};

  function buildProject(id: string, name: string, wps: Waypoint[], methods: Method[], old: ProjectView | undefined): ProjectView {
    const cum = chainages(wps);
    const stations = (old?.stations ?? []).map((s) => ({ ...s, position: pointAt(wps, cum, Math.min(s.chainageM, cum[cum.length - 1])) }));
    return {
      id,
      name,
      status: 'draft',
      designFrozen: false,
      lengthM: cum[cum.length - 1],
      waypoints: wps.map((w) => ({ ...w })),
      segments: segmentsOf(wps, methods),
      stations,
      tbms: old?.tbms ?? [],
      design: { tunnel: 'twinBore', stationBox: 'compactBox', frozen: false, options: [] },
      alignment: {
        id: `${id}/alignment`,
        points: wps.map((w) => ({ x: w.x, y: w.y, z: w.z })),
        rev: (old?.alignment.rev ?? 0) + 1,
        state: 'draft',
        segmentIssues: [],
        vertexIssues: [],
      },
    } as unknown as ProjectView;
  }

  function run(c: GameCommand, s: GameSnapshot): void {
    const at = s.projects.findIndex((p) => 'projectId' in c && p.id === c.projectId);
    const old = at >= 0 ? s.projects[at] : undefined;
    const put = (p: ProjectView): void => {
      if (at >= 0) s.projects[at] = p;
      else s.projects.push(p);
      s.mission.projectId = p.id;
    };
    switch (c.t) {
      case 'setAlignment': {
        if (fake.rejectAlignments) {
          s.notices.push({ tick: s.tick, command: c.t, reason: 'the design is frozen' });
          return;
        }
        const methods = c.methods ?? c.waypoints.slice(1).map(() => 'boredTwin' as const);
        put(buildProject(c.projectId, c.name ?? old?.name ?? c.projectId, c.waypoints, methods, old));
        return;
      }
      case 'removeProject':
        if (at >= 0) s.projects.splice(at, 1);
        s.mission.projectId = null;
        return;
      case 'useOfficialPlan':
        s.projects = s.projects.filter((p) => p.id !== 'portal');
        s.projects.push(buildProject('portal', 'The Portal', OFFICIAL, OFFICIAL_METHODS, undefined));
        s.mission.projectId = 'portal';
        return;
      case 'addStation': {
        if (old === undefined) throw new Error(`fake sim: addStation on unknown project ${c.projectId}`);
        const cum = chainages(old.waypoints);
        const chainageM = c.chainageM ?? (c.at ? nearestChainage(old.waypoints, cum, c.at.x, c.at.z).chainageM : 0);
        const station = {
          id: c.stationId ?? `s${old.stations.length + 1}`,
          name: c.name,
          position: pointAt(old.waypoints, cum, chainageM),
          yaw: 0,
          style: 'compactBox',
          lengthM: 154,
          widthM: 22,
          heightM: 14,
          progress: 0,
          fitOut: 0,
          open: false,
          template: c.template,
          box: 'compactBox',
          chainageM,
          depthM: c.depthM ?? 0,
        } as StationView;
        put({ ...old, stations: [...old.stations, station] });
        return;
      }
      case 'removeStation':
        if (old !== undefined) put({ ...old, stations: old.stations.filter((x) => x.id !== c.stationId) });
        return;
      case 'chargeDig': {
        const cents = Math.round(c.volumeM3 * s.handDig.centsPerM3);
        s.handDig = { volumeM3: s.handDig.volumeM3 + c.volumeM3, cents: s.handDig.cents + cents, centsPerM3: s.handDig.centsPerM3 };
        return;
      }
      case 'tbmControl':
        s.projects = s.projects.map((p) => ({
          ...p,
          tbms: p.tbms.map((t) =>
            t.id !== c.headingId
              ? t
              : {
                  ...t,
                  driven: t.driven || c.autopilot === false,
                  autopilot: c.autopilot ?? t.autopilot,
                  thrust: c.thrust ?? t.thrust,
                  steer: c.steer ?? t.steer,
                  pitchInput: c.pitch ?? t.pitchInput,
                },
          ),
        }));
        return;
      default:
        throw new Error(`fake sim: command ${c.t} is not modelled`);
    }
  }

  function publish(next: GameSnapshot): void {
    snap = next;
    snapshot.set(next);
  }

  const tools: ToolPort = {
    status: createValue({ id: null, hint: '', readouts: [], options: [], values: {}, commands: [] }),
    availability: createValue({ plan: null, station: null, dig: null, drive: null }),
    activate: noop,
    setOption: noop,
    invoke: noop,
  };

  const services = {
    sim: {
      snapshot,
      command(c: GameCommand): void {
        fake.commands.push(c);
        pending.push(c);
      },
      estimateAlignment(req: AlignmentEstimateRequest): AlignmentEstimate {
        fake.estimates++;
        return fakeEstimate(req);
      },
    },
    camera: {
      status: createValue({ bookmarks: [], following: null }),
      state: () => ({ position: { x: 0, y: 1000, z: 0 }, target: { x: 0, y: 0, z: 1 }, fovYDeg: 45, aspect: 1, near: 1, far: 5000 }),
      goTo: noop,
      flyTo: noop,
      focusOn: noop,
      follow(t: { entity: { id: string }; mode: string } | null): void {
        fake.follows.push(t === null ? null : `${t.mode}:${t.entity.id}`);
      },
      project: (p: WorldPos) => ({ x: p.x, y: p.z }),
    },
    world: {
      pick(x: number, y: number): GroundPick | null {
        if (x < fake.skyBelowX) return null;
        return {
          voxel: { x: Math.floor(x), y: GROUND_Y - 1, z: Math.floor(y) },
          face: 0,
          material: x >= MUD_FROM_X ? Material.BAY_MUD : Material.ROCK,
          point: { x, y: GROUND_Y, z: y },
          groundY: GROUND_Y,
        };
      },
      groundAt(x: number, z: number): number {
        if (x < 0 || x >= 4000 || z < 0 || z >= 4000) throw new RangeError(`groundAt: (${x}, ${z}) is outside the site`);
        return GROUND_Y;
      },
      voxelAt: (x: number, y: number) =>
        y >= GROUND_Y
          ? Material.AIR
          : x >= fake.waterFromX && y >= GROUND_Y - 3
            ? Material.WATER
            : x >= MUD_FROM_X
              ? Material.BAY_MUD
              : Material.ROCK,
      siteBounds: () => ({ minX: 0, minZ: 0, maxX: 4000, maxZ: 4000 }),
      dig(center: WorldPos, radiusM: number) {
        fake.digs.push({ center, radiusM });
        return { removedM3: fake.digVolumeM3, dirtyChunks: fake.digVolumeM3 > 0 ? 1 : 0 };
      },
      digBlocked: () => fake.digBlocked,
    },
    overlay: {
      add(spec: OverlaySpec) {
        const item: FakeOverlayItem = { id: `o${fake.overlayItems.length}`, spec, removed: false, updates: 0 };
        fake.overlayItems.push(item);
        return {
          id: item.id,
          update(next: OverlaySpec): void {
            if (item.removed) throw new Error('overlay handle used after remove');
            item.spec = next;
            item.updates++;
          },
          setVisible: noop,
          remove(): void {
            if (item.removed) throw new Error('overlay handle removed twice');
            item.removed = true;
          },
        };
      },
      setPreview(p: PreviewGeometry | null): void {
        fake.previews.push(p);
      },
      highlight: noop,
      setLayerVisible: noop,
    },
    audio: {
      cue(id: string): void {
        fake.cues.push(id);
      },
      loop: noop,
      muted: createValue(false),
      setMuted: noop,
    },
    tools,
  } as unknown as BayServices;

  const fake: Fake = {
    services,
    world: {} as WorldStore,
    commands: [],
    cues: [],
    previews: [],
    overlayItems: [],
    follows: [],
    digs: [],
    apply(): void {
      const next = { ...snap, projects: [...snap.projects], notices: [...snap.notices], mission: { ...snap.mission } } as GameSnapshot;
      for (const c of pending.splice(0)) run(c, next);
      publish(next);
    },
    snapshot: () => snap,
    project: () => snap.projects.find((p) => p.id === 'portal'),
    mutate(fn): void {
      const next = { ...snap, projects: snap.projects.map((p) => ({ ...p })), mission: { ...snap.mission } } as GameSnapshot;
      fn(next);
      publish(next);
    },
    rejectAlignments: false,
    digVolumeM3: 100,
    skyBelowX: 0,
    waterFromX: Number.POSITIVE_INFINITY,
    digBlocked: null,
    estimates: 0,
    geologyOf(material: number): Geology {
      if (material === Material.ROCK) return 'rock';
      if (material === Material.BAY_MUD) return 'bayMud';
      throw new RangeError(`fake geologyOf: material ${material} has no ground class`);
    },
  };
  return fake;
}
