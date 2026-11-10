/**
 * App shell: the composition root. Wires world, mesher pool, streamer, renderer, LOD tiers, camera rig, input,
 * the sim driver, the session (missions, save, load), the tool host, the entity layer, audio and the UI, runs
 * the frame loop of docs/CONTRACTS.md and exposes the test hook.
 */
import { createAudio } from '@bayvox/audio';
import {
  type CameraBookmark,
  type CameraState,
  CHUNK_SIZE,
  type Command,
  type EntityRef,
  type FrameBenchResult,
  type GameServices,
  type GameSpeed,
  type GameStats,
  type GameTestHook,
  type GameViewState,
  type GroundPick,
  type NamedBookmark,
  type OverlayHandle,
  type OverlaySpec,
  type WorldPort,
  type WorldPos,
} from '@bayvox/core';
import {
  attachDom,
  CameraRig,
  contextForTool,
  type GameAction,
  InputMapper,
  linkClaims,
  type PickHit,
  pickGround,
  pickVoxel,
  screenRay,
} from '@bayvox/input';
import { CAP_MAX_RADIUS, createEntityLayer, VoxelRenderer } from '@bayvox/render';
import { costBenefit, SCENARIOS, scenarioById, THE_PORTAL } from '@bayvox/scenarios';
import { type BayServices, createSim, type GameSnapshot, isDrivable, type MissionTarget, type ScenarioDef } from '@bayvox/sim';
import { connectAnchors, createToolHost, type PlanAnchor } from '@bayvox/tools';
import { mountUi, pace } from '@bayvox/ui';
import { Feedback } from './feedback.ts';
import type { GameParams } from './params.ts';
import { SceneBuilder } from './scene.ts';
import { createSyncMesherPool, createWorkerMesherPool, createWorld, type MesherPool } from './seam.ts';
import { createCamera, createGameServices, createOverlay, createTime, createView } from './services.ts';
import { createSession } from './session.ts';
import { SimDriver } from './sim-driver.ts';
import { createIdbStore, GameStorage } from './storage.ts';
import { ChunkStreamer } from './streamer.ts';

/** The floating origin follows the camera focus once it is this many chunks away (512 m). */
const REBASE_CHUNKS = 16;
/** Longest pick ray of the voxel hook pick, metres. */
const PICK_RANGE_M = 6000;
/** Frame time fed to the camera is clamped so a long stall does not fling it. */
const MAX_DT = 0.1;
/**
 * On a slow renderer (software GL, weak GPUs) the picture is not redrawn for every batch of chunks that
 * streams in: while streaming, at most one draw per this many measured frame intervals. No effect when
 * frames are faster than SLOW_FRAME_MS.
 */
const SLOW_FRAME_MS = 50;
const SLOW_DRAW_SPACING = 4;
/** Wall time fed to the sim per frame is clamped separately: a slow frame still buys its game days, a stalled tab does not. */
const MAX_SIM_DT = 0.25;
/** Radius of the largest shield the default chase distance frames well, metres. */
const CHASE_FRAMED_RADIUS_M = 4.5;
/** The x-ray the game switches on at a breakthrough goes off again after this many real seconds. */
const BREAKTHROUGH_XRAY_S = 8;
/** And the one it switches on to show the first train: the ride until the scorecard, and a little after it. */
const OPENING_XRAY_S = 14;
/**
 * Closest map zoom where the focus is outside the voxel site: there are no streets to see there, only the 64 m
 * raster, and from 50 m a patch of it is one flat colour (the second playtest zoomed into the Pacific and took
 * the blue screen for a crash).
 */
const OFFSITE_MIN_DISTANCE_M = 1500;
/** A hand-dug hole narrower than this on screen is not dug: the player could not see what the money bought. CSS pixels. */
const DIG_MIN_HOLE_PX = 10;
/** Ring of a mission target on the map: waiting for a station, and served by one. */
const TARGET_COLOR = 0xff5a1f;
const TARGET_SERVED_COLOR = 0x58d29a;
const TARGET_RING_POINTS = 64;

function createPool(params: GameParams): { pool: MesherPool; continuous: boolean } {
  if (params.workers === 0) return { pool: createSyncMesherPool(), continuous: false };
  if (typeof Worker === 'undefined') {
    console.warn('mesher: this browser has no Worker support, meshing on the main thread');
    return { pool: createSyncMesherPool(), continuous: false };
  }
  return { pool: createWorkerMesherPool(params.workers), continuous: true };
}

/** The official alignment of a scenario as points, for the ghost line under the player's own. */
function referenceLine(scenario: ScenarioDef): WorldPos[] | null {
  for (const c of scenario.reference?.commands ?? []) {
    if (c.t === 'setAlignment') return c.waypoints.map((w) => ({ x: w.x, y: w.y, z: w.z }));
  }
  return null;
}

export function startGame(canvas: HTMLCanvasElement, params: GameParams, uiRoot: HTMLElement | null = null): GameTestHook {
  /** Frames drawn. */
  let frame = 0;
  /** Frame loop iterations, drawn or skipped. */
  let loops = 0;
  let fatalError: Error | null = null;
  const settleWaiters: { minLoop: number; resolve: () => void; reject: (e: Error) => void }[] = [];
  /** Filled in by boot; the hook methods that need the running game go through it. */
  let game: Running | null = null;

  interface Running {
    stats(): GameStats;
    setCamera(b: CameraBookmark): void;
    camera(): CameraState;
    pick(x: number, y: number): PickHit | null;
    getVoxel(x: number, y: number, z: number): number;
    dig(pos: { x: number; y: number; z: number }, radius: number): number;
    view(): GameViewState;
    setView(v: Partial<GameViewState>): void;
    benchFrames(n: number): FrameBenchResult;
    driver: SimDriver;
    entities(): NonNullable<ReturnType<NonNullable<GameTestHook['entities']>>>;
    command(c: Command): void;
    services: BayServices;
  }

  function running(method: string): Running {
    if (fatalError !== null) throw new Error(`__game.${method}: the game stopped: ${fatalError.message}`);
    if (game === null) throw new Error(`__game.${method}: the game has not booted yet; await __game.ready first`);
    return game;
  }

  function fatal(err: unknown): void {
    if (fatalError !== null) return;
    fatalError = err instanceof Error ? err : new Error(String(err));
    console.error('game stopped:', fatalError);
    for (const w of settleWaiters.splice(0)) w.reject(fatalError);
    const box = document.createElement('pre');
    box.id = 'fatal';
    box.textContent = `Game stopped: ${fatalError.message}`;
    document.body.append(box);
  }

  async function boot(): Promise<void> {
    const startScenario = params.mission === null ? null : scenarioById(params.mission);
    const world = await createWorld(params);
    if (world.bookmarks.length === 0) throw new Error('boot: the world provides no camera bookmark');
    /** The site the app booted on: a deep link to a mission on another site needs that mission's camera. */
    const bootSite = world.siteId;
    console.info(`world: ${world.summary}`);
    const renderer = new VoxelRenderer({ canvas, world: world.store, antialias: params.aa });
    world.decorate(renderer.overlay);
    const lod = world.buildLod?.(renderer);
    const rendererName = renderer.rendererString();

    // Until a mission starts the driver holds an idle sim, so there is always a valid snapshot (decision 11).
    const driver = new SimDriver(createSim(THE_PORTAL, params.seed));
    const builder = new SceneBuilder();
    const layer = createEntityLayer(renderer.overlay, { groundAt: world.groundAt });

    const rig = new CameraRig();
    rig.connect(canvas);
    rig.setBounds(
      world.focusMin ?? { x: world.min.x, y: world.min.y, z: world.min.z },
      world.focusMax ?? { x: world.max.x, y: world.max.y, z: world.max.z },
    );
    const worldGround = world.ground;
    // Terrain following on the real map: the focus rides the surface and the camera stays out of the hills.
    if (worldGround !== undefined) rig.setGround((x, z) => (worldGround.contains(x, z) ? worldGround.topM(x, z) : null));
    /**
     * The same view moved sideways so that what it centres on lands in the middle of the part of the screen a
     * left-hand sheet (title, briefing) leaves free. `share` is the sheet's share of the screen width.
     */
    const besideSheet = (b: CameraBookmark, share: number): CameraBookmark => {
      if (uiRoot === null || !params.hud) return b;
      const dx = b.target.x - b.position.x;
      const dy = b.target.y - b.position.y;
      const dz = b.target.z - b.position.z;
      const flat = Math.hypot(dx, dz);
      if (!(flat > 0)) return b;
      const aspect = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
      const widthM = 2 * Math.hypot(dx, dy, dz) * Math.tan((((b.fovYDeg ?? 45) * Math.PI) / 180) * 0.5) * aspect;
      // Camera right in plan is (-dz, dx) / flat; the view moves left by half the sheet's width.
      const shift = (-share / 2) * widthM;
      const ox = (-dz / flat) * shift;
      const oz = (dx / flat) * shift;
      return {
        ...b,
        position: { x: b.position.x + ox, y: b.position.y, z: b.position.z + oz },
        target: { x: b.target.x + ox, y: b.target.y, z: b.target.z + oz },
      };
    };
    const SHEET_SHARE = 0.33;
    const bayPlain = world.bookmarks[world.bookmarks.length - 1] as CameraBookmark;
    const bayView = besideSheet(bayPlain, SHEET_SHARE);
    rig.setBookmark(
      startScenario === null ? bayView : (world.bookmarks[Math.min(params.cam, world.bookmarks.length - 1)] as CameraBookmark),
      false,
    );

    const { pool, continuous } = createPool(params);
    const siteChunkBounds = () => ({
      minCx: world.min.x >> 5,
      maxCx: (world.max.x - 1) >> 5,
      minCz: world.min.z >> 5,
      maxCz: (world.max.z - 1) >> 5,
    });
    const streamer = new ChunkStreamer({
      world: world.store,
      mesher: pool,
      renderer,
      radius: params.radius,
      minCy: world.min.y >> 5,
      maxCy: (world.max.y - 1) >> 5,
      bounds: siteChunkBounds(),
      // The in-thread pool meshes inside the frame: 16 chunks is a few milliseconds.
      maxInFlight: continuous ? undefined : 16,
      continuous,
      onError: fatal,
    });

    const defaultView = (): GameViewState => ({
      cut: false,
      cutY: Math.min(world.max.y, Math.max(world.min.y + 1, world.seaLevel - 8)),
      cutRadius: Math.min(160, CAP_MAX_RADIUS),
      xray: false,
    });
    const view = createView(defaultView(), { minY: world.min.y + 1, maxY: world.max.y, maxRadius: CAP_MAX_RADIUS }, () => {
      // Switching the cut on puts it just above the tunnel nearest to what the camera looks at, if there is one.
      const snap = driver.snapshot();
      const t = rig.target();
      let best: number | null = null;
      let bestD = 1500;
      for (const p of live() ? snap.projects : []) {
        for (const w of p.waypoints) {
          const d = Math.hypot(w.x - t.x, w.z - t.z);
          if (d < bestD) {
            bestD = d;
            best = w.y;
          }
        }
      }
      return best === null ? null : Math.round(best) + 5;
    });

    let width = 0;
    let height = 0;
    function resize(): void {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(devicePixelRatio, 2);
      if (w === width && h === height && ratio === renderer.pixelRatio) return;
      width = w;
      height = h;
      renderer.resize(w, h, ratio);
    }

    function cameraState(): CameraState {
      const s = rig.state(width / height);
      const v = view.state.get();
      if (v.cut) s.cutY = v.cutY;
      return s;
    }

    const cutOf = (cam: CameraState) => {
      const v = view.state.get();
      return v.cut ? { y: v.cutY, x: cam.target.x, z: cam.target.z, radius: v.cutRadius } : undefined;
    };

    /** Voxel pick of the test hook and the hover box: voxels only, short range. */
    function pick(x: number, y: number): PickHit | null {
      const cam = cameraState();
      const ray = screenRay(cam, (x / width) * 2 - 1, 1 - (y / height) * 2);
      // The voxel slab bounds the walk: a ray from a camera far above the map starts where it enters the data.
      return pickVoxel(world.store, ray, {
        maxDistance: Math.min(cam.far, PICK_RANGE_M),
        cut: cutOf(cam),
        minY: world.min.y,
        maxY: world.max.y,
      });
    }

    function dig(pos: { x: number; y: number; z: number }, radius: number): number {
      if (!(radius > 0) || radius > 64) throw new RangeError(`dig: radius must be in (0, 64], got ${radius}`);
      const v = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
      if (!Number.isFinite(v.x + v.y + v.z)) throw new RangeError(`dig: position is not finite: (${pos.x}, ${pos.y}, ${pos.z})`);
      return world.store.applyEdit({ t: 'carveCapsule', a: v, b: v, radius }).length;
    }

    const inSite = (x: number, z: number): boolean => x >= world.min.x && x < world.max.x && z >= world.min.z && z < world.max.z;

    const worldPort: WorldPort = {
      pick(screenX, screenY) {
        const cam = cameraState();
        const hit = pickGround(world.store, cam, screenX, screenY, width, height, {
          minY: world.min.y,
          maxY: world.max.y,
          cut: cutOf(cam),
          groundAt: world.groundAt,
        });
        if (worldGround === undefined) return hit;
        // Outside the voxel site the ground is the far raster. Whichever the ray meets first is the pick.
        const ray = screenRay(cam, (screenX / width) * 2 - 1, 1 - (screenY / height) * 2);
        const far = worldGround.raycast(ray.origin, ray.dir, 400_000);
        if (far === null || inSite(far.point.x, far.point.z)) return hit;
        if (hit !== null) {
          const d = Math.hypot(hit.point.x - ray.origin.x, hit.point.y - ray.origin.y, hit.point.z - ray.origin.z);
          if (d <= far.distanceM) return hit;
        }
        const p = far.point;
        const voxel = { x: Math.floor(p.x), y: Math.floor(far.column.surfaceM) - 1, z: Math.floor(p.z) };
        const pickFar: GroundPick = {
          voxel,
          face: 0,
          material: worldGround.materialAtDepth(p.x, p.z, 0),
          point: p,
          groundY: world.groundAt(p.x, p.z),
        };
        return pickFar;
      },
      groundAt(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError(`world.groundAt: position is not finite: (${x}, ${z})`);
        if (worldGround !== undefined && !worldGround.contains(x, z))
          throw new RangeError(`world.groundAt: (${x}, ${z}) is outside the map`);
        return world.groundAt(x, z);
      },
      voxelAt(x, y, z) {
        if (worldGround !== undefined && !inSite(x, z)) return worldGround.contains(x, z) ? worldGround.materialAt(x, y, z) : 0;
        return world.store.getVoxel({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
      },
      siteBounds() {
        // A line may stand wherever the map has ground: the voxel site is only where that ground is detailed.
        // The official lines of the campus missions leave their sites, and the plan tool called them
        // "not buildable: outside the site" while the sim approved and built them.
        if (worldGround !== undefined) return { ...worldGround.bounds };
        return { minX: world.min.x, minZ: world.min.z, maxX: world.max.x, maxZ: world.max.z };
      },
      dig(center, radiusM) {
        if (world.edits !== undefined) return world.edits.dig(center, radiusM);
        return { removedM3: 0, dirtyChunks: dig(center, radiusM) };
      },
      digBlocked(center, radiusM) {
        // Voxels are drawn in the near field around the view's focus; everything else is 4 m columns and the far
        // raster, which do not show a hole. The second playtest dug $40M of holes there and saw none of them.
        if (lod !== undefined) {
          if (!voxelsShown) return 'Zoom in to dig: from this far the ground is drawn as a map.';
          const box = streamer.nearBox;
          if (box === null || center.x < box[0] || center.x >= box[2] || center.z < box[1] || center.z >= box[3])
            return 'Too far from the middle of the view to dig: move the view over the spot, then dig.';
        }
        const cam = cameraState();
        const d = Math.hypot(center.x - cam.position.x, center.y - cam.position.y, center.z - cam.position.z);
        const metresPerPx = (2 * d * Math.tan((cam.fovYDeg * Math.PI) / 360)) / Math.max(1, height);
        if ((2 * radiusM) / metresPerPx < DIG_MIN_HOLE_PX) return 'Zoom in to dig: from here the hole would be a few pixels wide.';
        return null;
      },
    };

    /** The interface is mounted: time and the see-through view are then the game's to run (on the bare canvas scripts set their own). */
    const withUi = params.hud && uiRoot !== null;
    const audio = createAudio();
    audio.init();
    const feedback = new Feedback(audio);

    const time = createTime((speed) => driver.command({ t: 'setSpeed', speed }));
    const overlayPort = createOverlay(renderer.overlay, () => world.decorationIds?.() ?? []);
    const camera = createCamera({
      rig,
      state: cameraState,
      size: () => ({ width, height }),
      poseOf(ref) {
        const drawn = builder.poseOf(ref);
        if (drawn !== null || ref.type !== 'tbm' || !live()) return drawn;
        // A machine the sim has launched and no frame has drawn yet (the snapshot is published before the next
        // frame builds its scene): its pose in the snapshot is where it will be drawn.
        // Not a machine that broke through and left the scene: a watch of it ends there. (It used to find the
        // finished heading in the snapshot for ever, and the camera stayed underground where the machine had been.)
        for (const p of driver.snapshot().projects) {
          const t = p.tbms.find((x) => x.id === ref.id);
          if (t !== undefined && t.status !== 'done') return { position: t.position, yaw: t.yaw, pitch: t.pitch };
        }
        return null;
      },
      followScale(ref) {
        if (ref.type !== 'tbm') return 1;
        // The chase view is set for a 6.6 m shield. A shield much larger than that (the 16 m single bore) fills
        // the screen from there: it is watched from further back, in proportion to its radius.
        for (const p of driver.snapshot().projects) {
          const t = p.tbms.find((x) => x.id === ref.id);
          if (t !== undefined && t.machine === 'singleBore') return Math.max(1, t.diameterM / 2 / CHASE_FRAMED_RADIUS_M);
        }
        return 1;
      },
      animate: () => !params.freeze,
    });

    const siteBookmarks = (scenario: ScenarioDef | null): NamedBookmark[] => {
      const list: NamedBookmark[] = [];
      const b = world.bookmarks;
      const overview = b[0];
      if (scenario !== null && scenario.sandbox !== true)
        list.push({ id: 'mission', label: 'Mission overview', bookmark: scenario.camera });
      else if (overview !== undefined) list.push({ id: 'site', label: 'Site overview', bookmark: overview });
      const spot = (id: string, label: string, p: { x: number; z: number } | undefined): void => {
        if (p === undefined) return;
        const y = world.groundAt(p.x, p.z);
        list.push({ id, label, bookmark: { position: { x: p.x + 60, y: y + 320, z: p.z + 380 }, target: { x: p.x, y, z: p.z } } });
      };
      const ref = scenario?.reference;
      spot('launch', `Launch pit: ${ref?.launchPit?.name ?? ''}`, ref?.launchPit);
      spot('destination', `Destination: ${ref?.destination?.name ?? ''}`, ref?.destination);
      if (b.length > 1) list.push({ id: 'bay', label: 'Whole Bay', bookmark: b[b.length - 1] as CameraBookmark });
      return list;
    };
    camera.setBookmarks(siteBookmarks(startScenario));

    let anchors: PlanAnchor[] = [];
    /** The rings of the mission targets on the map, one per target, in the order of snapshot.mission.targets. */
    let targetRings: { handle: OverlayHandle; served: boolean; shown: boolean }[] = [];
    const ringSpec = (t: MissionTarget): OverlaySpec => {
      const points: WorldPos[] = [];
      for (let i = 0; i <= TARGET_RING_POINTS; i++) {
        const a = (i / TARGET_RING_POINTS) * Math.PI * 2;
        const x = t.x + Math.cos(a) * t.radiusM;
        const z = t.z + Math.sin(a) * t.radiusM;
        // On the surface where the map has one; over open water the ring lies on the water.
        const y = worldGround === undefined || worldGround.contains(x, z) ? world.groundAt(x, z) : world.seaLevel;
        points.push({ x, y: y + 1.5, z });
      }
      const color = t.served ? TARGET_SERVED_COLOR : TARGET_COLOR;
      // A stretch target is dashed: wanted, not required.
      return { kind: 'polyline', points, color, widthPx: 3, xray: true, ...(t.stretch ? { dashM: 30 } : {}) };
    };
    /** Draws the rings of a new mission, and afterwards keeps their colour and visibility in step with the snapshot. */
    const syncTargets = (all: readonly MissionTarget[], visible: boolean): void => {
      // A target that is not on the loaded map (the synthetic test world has no San Francisco) has no ring to draw.
      const targets = all.filter((t) => (worldGround === undefined ? inSite(t.x, t.z) : worldGround.contains(t.x, t.z)));
      if (targets.length !== targetRings.length) {
        for (const r of targetRings) r.handle.remove();
        targetRings = targets.map((t) => ({ handle: overlayPort.add(ringSpec(t)), served: t.served, shown: true }));
      }
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i] as MissionTarget;
        const r = targetRings[i] as (typeof targetRings)[number];
        if (r.served !== t.served) {
          r.served = t.served;
          r.handle.update(ringSpec(t));
        }
        if (r.shown !== visible) {
          r.shown = visible;
          r.handle.setVisible(visible);
        }
      }
    };
    const session = createSession({
      scenarios: SCENARIOS,
      seed: params.seed,
      storage: new GameStorage(createIdbStore()),
      driver,
      world,
      hooks: {
        siteLoaded() {
          streamer.reset(siteChunkBounds());
        },
        simDetaching() {
          // The tool in hand belongs to the old sim: put it away before its commands could reach the new one.
          host.port.activate(null);
          camera.follow(null);
        },
        simAttached(scenario, reason) {
          builder.reset();
          overlayPort.clear();
          // The overlay was cleared: the rings of the old mission went with it.
          targetRings = [];
          xrayOffIn = 0;
          seeThrough = false;
          timeMode = 'decision';
          decisionRun = null;
          feedback.reset(driver.snapshot());
          anchors = connectAnchors(scenario);
          layer.setGhost(referenceLine(scenario));
          camera.setBookmarks(siteBookmarks(scenario));
          // With the interface up time moves only when asked ("Next decision") until a machine bores.
          time.setSpeed(withUi ? 0 : 1);
          view.set(defaultView());
          stampsFor = null;
          openedProject = null;
          lastStage = driver.snapshot().mission.stage;
          // A deep link (?mission=) keeps the camera the URL asked for, on the site the app booted on. A mission on
          // another site gets its own camera (the boot view is of downtown San Francisco, where a Googleplex spur
          // is not). Every other start, and a restart (the camera may be 20 m down beside a machine), looks at the mission.
          const deepLink = params.mission !== null && frame === 0;
          if (deepLink) {
            if (bootSite !== undefined && scenario.siteId !== bootSite && params.cam === 0) rig.setBookmark(scenario.camera, false);
            else if (bootSite !== undefined && scenario.siteId !== bootSite)
              rig.setBookmark(world.bookmarks[Math.min(params.cam, world.bookmarks.length - 1)] as CameraBookmark, false);
          } else if (reason !== 'restart' || world.siteId !== undefined) rig.setBookmark(scenario.camera, !params.freeze);
        },
        // Off the playing screens the view toggles of the last mission are gone: a cut disc under the briefing is debris.
        fly: (pose) => {
          view.set({ cut: false, xray: false });
          rig.setBookmark(besideSheet(pose, SHEET_SHARE), !params.freeze);
        },
        flyToBay: () => {
          view.set({ cut: false, xray: false });
          rig.setBookmark(bayView, !params.freeze);
        },
      },
    });

    const services: BayServices = createGameServices({
      driver,
      time,
      session: session.port,
      camera,
      view,
      world: worldPort,
      overlay: overlayPort,
      tools: () => host.port,
      audio,
    });
    const host = createToolHost({ world: world.store, services: () => services, anchors: () => anchors });

    const playing = (): boolean => session.port.state.get().screen === 'playing';
    /** The snapshot describes what is on the map (decision 11). */
    const live = (): boolean => {
      const s = session.port.state.get().screen;
      return s === 'playing' || s === 'scorecard';
    };

    // Input: actions for tools and view toggles, held keys for the camera.
    const mapper = new InputMapper();
    const detachDom = attachDom(canvas, mapper);
    const unlinkClaims = linkClaims(mapper, rig);
    let hover: { x: number; y: number } | null = null;
    host.port.status.subscribe((s) => mapper.setContext(contextForTool(s.id)));
    const failed = (what: string, err: unknown): void => {
      console.error(`${what}: ${err instanceof Error ? err.message : String(err)}`);
      audio.cue('ui.error');
    };
    mapper.onAction((a: GameAction): boolean => {
      switch (a.type) {
        case 'view.toggleCut':
          view.set({ cut: !view.state.get().cut });
          return true;
        case 'view.toggleXray':
          view.set({ xray: !view.state.get().xray });
          return true;
        case 'view.cutUp':
          view.set({ cutY: view.state.get().cutY + 1 });
          return true;
        case 'view.cutDown':
          view.set({ cutY: view.state.get().cutY - 1 });
          return true;
        case 'camera.bookmark': {
          // With the interface up the digits pick tools (it takes them first); this is the bare canvas.
          const b = world.bookmarks[a.index];
          if (b !== undefined) camera.flyTo(b);
          return true;
        }
        case 'time.togglePause':
          if (playing()) time.togglePause();
          return true;
        case 'time.setSpeed':
          if (playing()) time.setSpeed(a.speed);
          return true;
        case 'tool.select':
          if (!playing()) return false;
          try {
            host.port.activate(host.active()?.id === a.tool ? null : a.tool);
          } catch (err) {
            failed('tool', err);
          }
          return true;
        case 'edit.undo':
          return host.undo();
        case 'edit.redo':
          return host.redo();
        default:
          if (a.type === 'pointer.hover') hover = { x: a.x, y: a.y };
          else if (a.type === 'pointer.leave') hover = null;
          if (!playing()) return false;
          // Escape with no tool in hand ends a watch: the camera is the player's again.
          if (a.type === 'tool.cancel' && host.active() === null && camera.following() !== null) {
            camera.follow(null);
            return true;
          }
          return host.handle(a);
      }
    });

    const ui = withUi && uiRoot !== null ? mountUi(uiRoot, services, { costBenefit: costBenefit() }) : null;
    const debug = params.debug ? await import('./hud.ts') : null;
    const hudStats = { fps: 0, frameMs: 0, chunks: 0, queued: 0, quads: 0, drawCalls: 0, triangles: 0, gpuMB: 0 };
    const debugView = { ...view.state.get() };
    const hud =
      debug === null
        ? null
        : debug.createHud({
            stats: hudStats,
            view: debugView,
            cutRange: { min: world.min.y + 1, max: world.max.y, maxRadius: CAP_MAX_RADIUS },
            bookmarks: world.bookmarks.length,
            goToBookmark: (i) => {
              const b = world.bookmarks[i];
              if (b !== undefined) camera.flyTo(b);
            },
            onViewChange: () => view.set({ ...debugView }),
          });
    view.state.subscribe((v) => Object.assign(debugView, v));

    let elapsed = 0;
    let trainClock = 0;
    let voxelsShown = true;
    let drawnKey = '';
    /** Start time of the last frame that drew, and the measured time from such a frame to the next one. */
    let drawnAt = Number.NEGATIVE_INFINITY;
    let drawCostMs = 0;
    let measureNext = false;
    /** Snapshot the voxel stamps (station boxes, launch pits) were last brought in line with. */
    let stampsFor: GameSnapshot | null = null;
    /** Project whose line has just opened and whose first train the camera has not gone to yet. */
    let openedProject: string | null = null;
    /** Real seconds the x-ray of a moment (a breakthrough, the first train) still has to run; 0 when there is none. */
    let xrayOffIn = 0;
    /** Whether the game has the see-through view on: while a machine bores, while the drive tool is in hand, and for a moment. */
    let seeThrough = false;
    /** 'bore' while a machine is boring, else 'decision' (packages/ui pace.ts). The speed buttons change with it. */
    let timeMode: pace.TimeMode = 'decision';
    /** The "Next decision" run under way: its pace is set once, at its start, so the date races evenly to the gate. */
    let decisionRun: { daysPerSecond: number; fromTick: number; toGate: boolean } | null = null;
    /** Mission stage of the last frame: leaving the plan stage puts the drawing tools away. */
    let lastStage: GameSnapshot['mission']['stage'] = 'plan';

    /** The machine the camera rides with: the one the drive tool possesses, or one being watched from the cutaway. */
    function possessed(): string | null {
      const tool = host.port.status.get();
      if (tool.id === 'drive') {
        const id = tool.values['drive.headingId'];
        if (typeof id === 'string' && id !== '') return id;
      }
      const f = camera.following();
      return f !== null && f.entity.type === 'tbm' && f.mode !== 'orbit' ? f.entity.id : null;
    }

    function syncStamps(snap: GameSnapshot): void {
      if (world.edits === undefined || snap === stampsFor) return;
      stampsFor = snap;
      for (const p of snap.projects) {
        const bore = p.tbms.find((t) => t.radiusM > 0);
        world.edits.syncStamps({
          stations: p.stations,
          pits: p.pits,
          ...(bore === undefined ? {} : { tracks: { radiusM: bore.radiusM, laterals: bore.laterals } }),
        });
      }
    }

    /**
     * One frame: sim, tools, scene, camera, streaming, draw. `dt` in seconds. The draw is skipped when nothing
     * that affects the picture changed since the last one (a frozen or idle scene costs no GPU time) unless
     * `force` is set.
     */
    function step(dt: number, force = false, simDt = 0): void {
      resize();
      const isPlaying = playing();
      const isLive = live();
      // How fast time runs is the game's call (pace.ts), read from the snapshot of the last frame.
      const before = driver.snapshot();
      const mode = isPlaying ? pace.timeMode(before) : timeMode;
      if (mode !== timeMode) {
        timeMode = mode;
        decisionRun = null;
        // A launch starts the bore at Regular; after the last breakthrough time waits for "Next decision" again.
        if (ui !== null) time.setSpeed(mode === 'bore' ? pace.SPEED_REGULAR : 0);
      }
      const speed: GameSpeed = time.speed.get();
      // On the bare canvas (no interface) the sim's own clock paces time, as scripts expect.
      let daysPerSecond: number | undefined;
      if (ui === null) daysPerSecond = undefined;
      else if (mode === 'bore') daysPerSecond = pace.boreDaysPerSecond(before, speed);
      else if (speed === 0 || before.clock.hold !== null) {
        decisionRun = null;
        daysPerSecond = 0;
      } else {
        decisionRun ??= {
          daysPerSecond: pace.decisionDaysPerSecond(before),
          fromTick: driver.tick,
          toGate: pace.daysToNextGate(before) !== null,
        };
        daysPerSecond = decisionRun.daysPerSecond;
      }
      // Sim first: its carves reach the streamer in this frame. A frozen clock stops the game calendar too;
      // tests then step it through the hook. Commands are flushed whether or not time moves.
      driver.advance(params.freeze || !isPlaying ? 0 : simDt, speed, daysPerSecond);
      session.update(params.freeze ? 0 : simDt);
      const snap = driver.snapshot();
      if (isPlaying) host.update(dt);
      const animate = !params.freeze;
      // Trains are presentation: they run on real time, also while the calendar waits for "Next decision".
      if (animate && (speed > 0 || (ui !== null && timeMode === 'decision'))) trainClock += dt;

      const possessedId = isLive ? possessed() : null;
      const scene = builder.build({
        snapshot: isLive ? snap : withoutProjects(snap),
        alpha: driver.dayAlpha(),
        trainClock,
        preview: isPlaying ? overlayPort.preview() : null,
        possessedTbmId: possessedId,
        highlight: overlayPort.highlighted(),
        live: isLive,
      });
      if (!overlayPort.layerVisible('trains')) scene.trains = [];
      if (!overlayPort.layerVisible('stations')) scene.stations = [];
      if (!overlayPort.layerVisible('alignments')) scene.alignments = [];
      if (!overlayPort.layerVisible('tunnels')) scene.tunnels = [];
      if (isLive) {
        syncStamps(snap);
        for (const item of feedback.feed(snap)) {
          if (item.kind === 'lineOpened' && isPlaying) {
            openedProject = item.projectId;
            // Opening the line is the last decision: the first month of service runs by itself (the mission is
            // counted complete on the first day of it), nobody has to ask for time after the ribbon is cut.
            if (ui !== null && time.speed.get() === 0) time.setSpeed(pace.SPEED_REGULAR);
          }
          if (item.subjectId === null) continue;
          const ref: EntityRef = { type: 'tbm', id: item.subjectId };
          if (item.kind === 'breakthrough') {
            const at = builder.poseOf(ref);
            if (at !== null) layer.flash(at.position);
            // The finished tunnel shows through the ground for a few seconds more. The first playtest was left in
            // x-ray for three game years after the banner. (Time stops by itself when the last machine is through.)
            if (isPlaying) xrayOffIn = Math.max(xrayOffIn, BREAKTHROUGH_XRAY_S);
          } else if (item.kind === 'tbmLaunched' && isPlaying && camera.following() === null && host.active() === null) {
            // The launch happens underground: take the player to the machine. Any map view or pan leaves it again.
            const tbm = snap.projects.flatMap((p) => p.tbms).find((t) => t.id === item.subjectId);
            if (tbm !== undefined && isDrivable(tbm.method) && builder.poseOf(ref) !== null)
              camera.follow({ entity: ref, mode: 'cutaway' });
          }
        }
      }
      if (xrayOffIn > 0 && animate) xrayOffIn = Math.max(0, xrayOffIn - dt);
      if (isLive) {
        const stage = snap.mission.stage;
        if (stage !== lastStage) {
          // The plan is approved: the drawing tools have nothing more to draw and their panels are put away.
          const tool = host.active()?.id;
          if (lastStage === 'plan' && isPlaying && (tool === 'plan' || tool === 'station')) host.port.activate(null);
          lastStage = stage;
        }
      }
      // A "Next decision" run ends at the decision: a gate or an event card. Without a phase under way (an open
      // line) nothing would ever stop it, so it ends after DECISION_RUN_DEFAULT_DAYS.
      // (With the interface up: on the bare canvas there is no card to read, and scripts set their own speed.)
      if (ui !== null && isPlaying && timeMode === 'decision' && time.speed.get() > 0) {
        const overrun = decisionRun !== null && !decisionRun.toGate && driver.tick - decisionRun.fromTick >= pace.DECISION_RUN_DEFAULT_DAYS;
        if (snap.clock.hold !== null || overrun) {
          decisionRun = null;
          time.setSpeed(0);
        }
      }
      // The places the mission is about are ringed on the map while it is on screen; a ring turns green when a station serves it.
      syncTargets(isLive ? snap.mission.targets : [], isLive && possessedId === null);
      // The ground is seen through while a machine bores or is driven, and for the moment after a breakthrough and
      // at the first train; otherwise it is solid. Only the change is applied: a view set through the test hook stays.
      if (ui !== null) {
        const want = isPlaying && (pace.isBoring(snap) || host.active()?.id === 'drive' || xrayOffIn > 0);
        if (want !== seeThrough) {
          seeThrough = want;
          view.set({ xray: want, cut: false });
        }
      }
      // Looking through the ground or under a cut, the tunnels are drawn open at the top: track and trains show.
      const looking = view.state.get();
      layer.setCrowns(!(looking.xray || looking.cut));
      layer.sync(scene);
      layer.update(animate ? dt : 0);
      if (openedProject !== null && scene.trains.length > 0) {
        // The line is open and its trains run underground: look through the ground and ride along with the first one.
        const train = snap.services.find((sv) => sv.projectId === openedProject) === undefined ? undefined : scene.trains[0];
        openedProject = null;
        if (train !== undefined && host.active() === null) {
          // The x-ray is the game's for the ride, not the player's for good: it goes off again by itself.
          xrayOffIn = OPENING_XRAY_S;
          camera.flyTo({
            position: { x: train.position.x + 40, y: train.position.y + 300, z: train.position.z + 260 },
            target: train.position,
          });
          camera.follow({ entity: { type: 'train', id: train.id }, mode: 'orbit' });
        }
      }
      // Panning by hand ends a watch (not a drive: there W A S D steer the machine).
      const axes = mapper.axes();
      if (camera.following() !== null && host.active()?.id !== 'drive' && (axes.panX !== 0 || axes.panZ !== 0)) camera.follow(null);
      camera.track();

      // Street-level zoom is for where there are streets: off the voxel site the map camera stays further out.
      if (worldGround !== undefined) {
        const focus = rig.target();
        rig.setZoomFloor(inSite(focus.x, focus.z) ? null : OFFSITE_MIN_DISTANCE_M);
      }
      rig.update(dt, axes);
      const cam = cameraState();
      if (isLive) {
        feedback.loops({
          snapshot: snap,
          running: isPlaying && speed > 0 && snap.clock.hold === null && animate,
          camera: cam.position,
          possessedTbmId: possessedId,
          trains: scene.trains,
          rings: layer.stats().rings,
        });
      } else feedback.silence();

      const origin = renderer.renderOrigin();
      const tcx = Math.floor(cam.target.x / CHUNK_SIZE);
      const tcy = Math.floor(cam.target.y / CHUNK_SIZE);
      const tcz = Math.floor(cam.target.z / CHUNK_SIZE);
      if (Math.max(Math.abs(tcx - origin.x), Math.abs(tcy - origin.y), Math.abs(tcz - origin.z)) > REBASE_CHUNKS) {
        renderer.setRenderOrigin({ x: tcx, y: tcy, z: tcz });
      }

      // Zoomed out past the city tier the voxel near field is not shown and stays where it was.
      const distance = rig.distance;
      voxelsShown = lod === undefined || lod.setCameraDistance(distance);
      if (voxelsShown) streamer.setFocus(cam.target.x, cam.target.z);
      // The ground around a working machine stays resident, so its carving never lands on evicted chunks.
      const machine = isLive ? (scene.tbms.find((t) => t.id === possessedId) ?? scene.tbms.find((t) => t.status === 'running')) : undefined;
      streamer.setSecondaryFocus(machine === undefined || !inSite(machine.position.x, machine.position.z) ? null : machine.position);
      streamer.pump();
      lod?.setNearField(streamer.nearBox, streamer.idle);
      world.onZoom?.(renderer.overlay, distance);

      // The hover box marks the voxel a dig would start from: with the brush in hand, or on the bare canvas.
      const hoverBox = hover !== null && (ui === null || host.active()?.id === 'dig');
      renderer.setHighlight(hoverBox && hover !== null ? (pick(hover.x, hover.y)?.voxel ?? null) : null);
      if (animate) elapsed += dt;
      const v = view.state.get();
      // X-ray thins the voxel ground. Zoomed out past the voxels there is no such ground, and x-ray would blank the map.
      renderer.setView({ cutRadius: v.cutRadius, xray: v.xray && voxelsShown, time: elapsed });
      const p = cam.position;
      const t = cam.target;
      const key = `${renderer.revision}|${p.x},${p.y},${p.z}|${t.x},${t.y},${t.z}|${cam.fovYDeg},${cam.aspect},${cam.near},${cam.far},${cam.cutY}`;
      loops++;
      const now = performance.now();
      if (measureNext) {
        // The frame after a draw arrives late by what the draw cost, on the GPU or in software.
        drawCostMs = now - drawnAt;
        measureNext = false;
      }
      if (!force) {
        if (key === drawnKey) return;
        if (!streamer.idle && drawCostMs > SLOW_FRAME_MS && now - drawnAt < SLOW_DRAW_SPACING * drawCostMs) return;
        drawnAt = now;
        measureNext = true;
      }
      drawnKey = key;
      renderer.draw(cam, 0);
      frame++;
    }

    function stats(): GameStats {
      return {
        ...renderer.stats(),
        chunksLoaded: streamer.chunksLoaded,
        renderer: rendererName,
        tick: driver.tick,
        pendingCommands: driver.pending,
        quads: renderer.quadCount(),
        columnQuads: renderer.columnQuadCount(),
        voxelsShown,
        frame,
      };
    }

    let last = performance.now();
    let smoothedMs = 16;
    let hudAt = 0;
    function loop(now: number): void {
      if (fatalError !== null) return;
      try {
        const ms = now - last;
        last = now;
        const seconds = Math.max(0, ms / 1000);
        step(Math.min(MAX_DT, seconds), false, Math.min(MAX_SIM_DT, seconds));
        smoothedMs += (ms - smoothedMs) * 0.1;
        if (hud !== null && now - hudAt > 250) {
          hudAt = now;
          const s = stats();
          hudStats.fps = 1000 / smoothedMs;
          hudStats.frameMs = smoothedMs;
          hudStats.chunks = s.chunksMeshed;
          hudStats.queued = streamer.queued;
          hudStats.quads = s.quads ?? 0;
          hudStats.drawCalls = s.drawCalls;
          hudStats.triangles = s.triangles;
          hudStats.gpuMB = s.gpuBytes / 1e6;
          hud.refresh();
        }
        // Settled: everything the current view needs is meshed, uploaded and has been drawn.
        if (settleWaiters.length > 0 && streamer.idle && !rig.isMoving) {
          for (let i = settleWaiters.length - 1; i >= 0; i--) {
            const w = settleWaiters[i];
            if (w !== undefined && loops >= w.minLoop) {
              settleWaiters.splice(i, 1);
              w.resolve();
            }
          }
        }
      } catch (err) {
        fatal(err);
        return;
      }
      requestAnimationFrame(loop);
    }

    addEventListener('pagehide', () => {
      detachDom();
      unlinkClaims();
      ui?.dispose();
      host.dispose();
      layer.dispose();
      streamer.dispose();
      pool.dispose();
      hud?.dispose();
      audio.dispose();
    });

    game = {
      stats,
      setCamera(b) {
        camera.follow(null);
        rig.setBookmark(b, false);
      },
      camera: cameraState,
      pick,
      getVoxel: (x, y, z) => world.store.getVoxel({ x, y, z }),
      dig,
      view: () => view.state.get(),
      setView: (v) => view.set(v),
      driver,
      entities() {
        const sc = builder.current();
        const st = layer.stats();
        return {
          tbms: sc.tbms.map((t) => ({ id: t.id, x: t.position.x, y: t.position.y, z: t.position.z, status: t.status })),
          trains: sc.trains.map((t) => ({ id: t.id, x: t.position.x, y: t.position.y, z: t.position.z })),
          stations: st.stations,
          rings: st.rings,
          trackM: st.trackM,
          possessedTbmId: sc.possessedTbmId,
        };
      },
      command(c) {
        // The speed lives in the time port; a setSpeed command from a test or a script goes through it.
        if (c.t === 'setSpeed' && typeof c.speed === 'number') time.setSpeed(c.speed as GameSpeed);
        else driver.command(c);
      },
      services,
      benchFrames(n) {
        if (!Number.isInteger(n) || n < 1 || n > 10_000)
          throw new RangeError(`benchFrames: frames must be an integer in [1, 10000], got ${n}`);
        const times: number[] = [];
        for (let i = 0; i < n; i++) {
          const t0 = performance.now();
          step(1 / 60, true);
          renderer.finish();
          times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        const at = (q: number): number => times[Math.min(n - 1, Math.floor(q * n))] as number;
        return { frames: n, meanMs: times.reduce((a, b) => a + b, 0) / n, p50Ms: at(0.5), p95Ms: at(0.95), maxMs: times[n - 1] as number };
      },
    };

    await session.restore();
    // A deep link starts its mission before the first frame, so `ready` means "in play".
    if (startScenario !== null) await session.startUnlocked(startScenario.id);
    step(0);
    requestAnimationFrame(loop);
  }

  const ready = boot();
  ready.catch(fatal);

  return {
    ready,
    stats: () => running('stats').stats(),
    simHash: () => running('simHash').driver.sim.hash(),
    // Validated now (a malformed command throws here), applied at the start of the next frame or stepSim.
    command: (c: Command) => running('command').command(c),
    stepSim: (ticks) => running('stepSim').driver.step(ticks),
    stepSubsteps: (substeps) => running('stepSubsteps').driver.stepSubsteps(substeps),
    snapshot: () => running('snapshot').driver.snapshot(),
    services: () => running('services').services as unknown as GameServices,
    entities: () => running('entities').entities(),
    settled() {
      if (fatalError !== null) return Promise.reject(fatalError);
      return new Promise<void>((resolve, reject) => {
        // At least one full loop iteration after the call, so changes made just before it are on screen.
        settleWaiters.push({ minLoop: loops + 1, resolve, reject });
      });
    },
    setCamera: (b) => running('setCamera').setCamera(b),
    camera: () => running('camera').camera(),
    pick(x, y) {
      const hit = running('pick').pick(x, y);
      return hit === null ? null : { voxel: [hit.voxel.x, hit.voxel.y, hit.voxel.z], material: hit.material, face: hit.face };
    },
    getVoxel: (x, y, z) => running('getVoxel').getVoxel(x, y, z),
    dig: (pos, radius) => running('dig').dig(pos, radius),
    view: () => ({ ...running('view').view() }),
    setView: (v) => running('setView').setView(v),
    benchFrames: (n) => running('benchFrames').benchFrames(n),
  };
}

let strippedFrom: GameSnapshot | null = null;
let stripped: GameSnapshot | null = null;
/** Off the playing screens the snapshot does not describe what is on the map: the scene is drawn without its projects. */
function withoutProjects(s: GameSnapshot): GameSnapshot {
  if (s.projects.length === 0 && s.services.length === 0) return s;
  if (strippedFrom !== s || stripped === null) {
    strippedFrom = s;
    stripped = { ...s, projects: [], services: [] };
  }
  return stripped;
}
