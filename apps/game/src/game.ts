/**
 * App shell: wires world, mesher pool, streamer, renderer, LOD tiers, camera rig, input, the sim and the debug
 * HUD, runs the frame loop and exposes the test hook.
 */
import {
  type CameraBookmark,
  type CameraState,
  CHUNK_SIZE,
  type Command,
  type FrameBenchResult,
  type GameStats,
  type GameTestHook,
  type GameViewState,
} from '@bayvox/core';
import { attachDom, CameraRig, type GameAction, InputMapper, type PickHit, pickVoxel, screenRay } from '@bayvox/input';
import { CAP_MAX_RADIUS, VoxelRenderer } from '@bayvox/render';
import { THE_PORTAL } from '@bayvox/scenarios';
import { autopilotCommands, type GameSnapshot } from '@bayvox/sim';
import { createHud, type HudSim, type HudStats } from './hud.ts';
import type { GameParams } from './params.ts';
import { createSyncMesherPool, createWorkerMesherPool, createWorld, type MesherPool } from './seam.ts';
import { SimDriver } from './sim-driver.ts';
import { ChunkStreamer } from './streamer.ts';

/** The floating origin follows the camera focus once it is this many chunks away (512 m). */
const REBASE_CHUNKS = 16;
/** Longest pick ray, metres. Beyond it the cursor is treated as pointing at nothing. */
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
const MAX_SIM_DT = 1;

function createPool(params: GameParams): { pool: MesherPool; continuous: boolean } {
  if (params.workers === 0) return { pool: createSyncMesherPool(), continuous: false };
  if (typeof Worker === 'undefined') {
    console.warn('mesher: this browser has no Worker support, meshing on the main thread');
    return { pool: createSyncMesherPool(), continuous: false };
  }
  return { pool: createWorkerMesherPool(params.workers), continuous: true };
}

export function startGame(canvas: HTMLCanvasElement, params: GameParams): GameTestHook {
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
    view: GameViewState;
    setView(v: Partial<GameViewState>): void;
    benchFrames(n: number): FrameBenchResult;
    sim: SimDriver;
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
    const world = await createWorld(params);
    if (world.bookmarks.length === 0) throw new Error('boot: the world provides no camera bookmark');
    console.info(`world: ${world.summary}`);
    const renderer = new VoxelRenderer({ canvas, world: world.store, antialias: params.aa });
    world.decorate(renderer.overlay);
    const lod = world.buildLod?.(renderer);
    const rendererName = renderer.rendererString();
    // The first scenario. The sim carves straight into the world store; the overlay mirrors its projects.
    const sim = new SimDriver(THE_PORTAL, params.seed, world.store, world.groundAt);

    const rig = new CameraRig();
    rig.connect(canvas);
    rig.setBounds(
      world.focusMin ?? { x: world.min.x, y: world.min.y, z: world.min.z },
      world.focusMax ?? { x: world.max.x, y: world.max.y, z: world.max.z },
    );
    const startBookmark = world.bookmarks[Math.min(params.cam, world.bookmarks.length - 1)] as CameraBookmark;
    rig.setBookmark(startBookmark, false);

    const { pool, continuous } = createPool(params);
    const streamer = new ChunkStreamer({
      world: world.store,
      mesher: pool,
      renderer,
      radius: params.radius,
      minCy: world.min.y >> 5,
      maxCy: (world.max.y - 1) >> 5,
      bounds: {
        minCx: world.min.x >> 5,
        maxCx: (world.max.x - 1) >> 5,
        minCz: world.min.z >> 5,
        maxCz: (world.max.z - 1) >> 5,
      },
      // The in-thread pool meshes inside the frame: 16 chunks is a few milliseconds.
      maxInFlight: continuous ? undefined : 16,
      continuous,
      onError: fatal,
    });

    const view: GameViewState = {
      cut: false,
      cutY: Math.min(world.max.y, Math.max(world.min.y + 1, world.seaLevel - 8)),
      cutRadius: Math.min(160, CAP_MAX_RADIUS),
      xray: false,
    };
    const tool = { digRadius: 3 };
    const hudStats: HudStats = { fps: 0, frameMs: 0, chunks: 0, queued: 0, quads: 0, drawCalls: 0, triangles: 0, gpuMB: 0 };
    const hudSim: HudSim = {
      date: '',
      speed: sim.sim.state.speed,
      cashMillions: 0,
      spentMillions: 0,
      project: '',
      setSpeed: (speed) => sim.command({ t: 'setSpeed', speed }),
      drawReference() {
        for (const c of THE_PORTAL.reference?.commands ?? []) sim.command(c);
      },
      passGate() {
        for (const c of autopilotCommands(sim.sim.state)) sim.command(c);
      },
    };
    const refreshHudSim = (): void => {
      const s: GameSnapshot = sim.snapshot();
      hudSim.date = s.date;
      hudSim.speed = s.speed;
      hudSim.cashMillions = s.moneyCents / 1e8;
      hudSim.spentMillions = s.ledger.totalSpentCents / 1e8;
      const p = s.projects[0];
      hudSim.project =
        p === undefined
          ? 'no project: draw the plan'
          : p.status === 'active'
            ? `${p.phase} ${Math.round(p.phaseProgress * 100)}%${p.awaiting === null ? '' : `, gate: ${p.awaiting}`}`
            : p.status;
    };

    const goToBookmark = (index: number): void => {
      const b = world.bookmarks[index];
      if (b !== undefined) rig.setBookmark(b, !params.freeze);
    };
    const hud = params.hud
      ? createHud({
          stats: hudStats,
          sim: hudSim,
          view,
          tool,
          cutRange: { min: world.min.y + 1, max: world.max.y, maxRadius: CAP_MAX_RADIUS },
          bookmarks: world.bookmarks.length,
          goToBookmark,
        })
      : null;

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
      if (view.cut) s.cutY = view.cutY;
      return s;
    }

    function pick(x: number, y: number): PickHit | null {
      const cam = cameraState();
      const ray = screenRay(cam, (x / width) * 2 - 1, 1 - (y / height) * 2);
      return pickVoxel(world.store, ray, {
        maxDistance: Math.min(cam.far, PICK_RANGE_M),
        cut: view.cut ? { y: view.cutY, x: cam.target.x, z: cam.target.z, radius: view.cutRadius } : undefined,
      });
    }

    function dig(pos: { x: number; y: number; z: number }, radius: number): number {
      if (!(radius > 0) || radius > 64) throw new RangeError(`dig: radius must be in (0, 64], got ${radius}`);
      const v = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
      if (!Number.isFinite(v.x + v.y + v.z)) throw new RangeError(`dig: position is not finite: (${pos.x}, ${pos.y}, ${pos.z})`);
      return world.store.applyEdit({ t: 'carveCapsule', a: v, b: v, radius }).length;
    }

    function setView(v: Partial<GameViewState>): void {
      const next = { ...view, ...v };
      if (!Number.isInteger(next.cutY)) throw new RangeError(`setView: cutY must be a whole metre, got ${next.cutY}`);
      if (!(next.cutRadius > 0) || next.cutRadius > CAP_MAX_RADIUS) {
        throw new RangeError(`setView: cutRadius must be in (0, ${CAP_MAX_RADIUS}] m, got ${next.cutRadius}`);
      }
      Object.assign(view, next);
    }

    // Input: actions for tools and view toggles, held keys for the camera.
    const mapper = new InputMapper();
    const detachDom = attachDom(canvas, mapper);
    let hover: { x: number; y: number } | null = null;
    mapper.onAction((a: GameAction) => {
      switch (a.type) {
        case 'pointer.hover':
          hover = { x: a.x, y: a.y };
          break;
        case 'pointer.leave':
          hover = null;
          break;
        case 'tool.primary': {
          const hit = pick(a.x, a.y);
          if (hit !== null) dig({ x: hit.voxel.x, y: hit.voxel.y, z: hit.voxel.z }, tool.digRadius);
          break;
        }
        case 'tool.cancel':
          break;
        case 'view.toggleCut':
          view.cut = !view.cut;
          break;
        case 'view.toggleXray':
          view.xray = !view.xray;
          break;
        case 'view.cutUp':
          view.cutY = Math.min(world.max.y, view.cutY + 1);
          break;
        case 'view.cutDown':
          view.cutY = Math.max(world.min.y + 1, view.cutY - 1);
          break;
        case 'camera.bookmark':
          goToBookmark(a.index);
          break;
      }
    });

    let elapsed = 0;
    let voxelsShown = true;
    let drawnKey = '';
    /** Start time of the last frame that drew, and the measured time from such a frame to the next one. */
    let drawnAt = Number.NEGATIVE_INFINITY;
    let drawCostMs = 0;
    let measureNext = false;
    /**
     * One frame: camera, streaming, hover, draw. `dt` in seconds. The draw is skipped when nothing that affects
     * the picture changed since the last one (a frozen or idle scene costs no GPU time) unless `force` is set.
     */
    function step(dt: number, force = false, simDt = 0): void {
      resize();
      // Sim first: its carves reach the streamer in this frame. A frozen clock stops the game calendar too;
      // tests then step it through the hook.
      sim.advance(params.freeze ? 0 : simDt);
      sim.syncOverlay(renderer.overlay);
      rig.update(dt, mapper.axes());
      const cam = cameraState();

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
      streamer.pump();
      lod?.setNearField(streamer.nearBox, streamer.idle);
      world.onZoom?.(renderer.overlay, distance);

      renderer.setHighlight(hover === null ? null : (pick(hover.x, hover.y)?.voxel ?? null));
      if (!params.freeze) elapsed += dt;
      renderer.setView({ cutRadius: view.cutRadius, xray: view.xray, time: elapsed });
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
        tick: sim.tick,
        pendingCommands: sim.pending,
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
          refreshHudSim();
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
      streamer.dispose();
      pool.dispose();
      hud?.dispose();
    });

    game = {
      stats,
      setCamera: (b) => rig.setBookmark(b, false),
      camera: cameraState,
      pick,
      getVoxel: (x, y, z) => world.store.getVoxel({ x, y, z }),
      dig,
      view,
      setView,
      sim,
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

    // First frame before `ready` resolves.
    step(0);
    requestAnimationFrame(loop);
  }

  const ready = boot();
  ready.catch(fatal);

  return {
    ready,
    stats: () => running('stats').stats(),
    simHash: () => running('simHash').sim.sim.hash(),
    // Validated now (a malformed command throws here), applied at the start of the next frame or stepSim.
    command: (c: Command) => running('command').sim.command(c),
    stepSim: (ticks) => running('stepSim').sim.step(ticks),
    snapshot: () => running('snapshot').sim.snapshot(),
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
    view: () => ({ ...running('view').view }),
    setView: (v) => running('setView').setView(v),
    benchFrames: (n) => running('benchFrames').benchFrames(n),
  };
}
