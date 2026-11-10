/**
 * Demo and screenshot page of packages/render: the entity layer, the follow cutaway, the cut plane and x-ray
 * on the real downtown site. No sim: a hand-made EntityScene on a tunnel carved straight into the voxel store.
 * Driven by `window.__demo` (see demo/shoot.mjs); `?view=<name>` picks the first view, `?live=1` animates.
 */
import {
  type CameraState,
  CHUNK_SIZE,
  type EntityScene,
  lonLatToWorld,
  PADDED_VOLUME,
  packChunkKey,
  type StationEntity,
  VOXEL_SIZE_M,
  type WorldPos,
} from '@bayvox/core';
import { createMesherScratch, meshChunk } from '@bayvox/mesher';
import {
  ChunkWorldStore,
  createColumnSample,
  type FetchBytes,
  loadManifest,
  loadRailNetwork,
  loadSite,
  TiledSiteSource,
} from '@bayvox/world';
import {
  createEntityLayer,
  type EntityLayerStats,
  MACHINE_DIAMETER_M,
  MACHINE_KINDS,
  type MachineKind,
  VoxelRenderer,
} from '../src/index.ts';

interface Demo {
  ready: Promise<void>;
  views: string[];
  /** Sets up a view and draws it. */
  view(name: string): void;
  stats(): { drawCalls: number; triangles: number; entities: EntityLayerStats };
  /** Draws `frames` frames with gl.finish and returns the mean milliseconds per frame. */
  bench(frames: number): number;
  /** Advances the animation clock and redraws. */
  tick(seconds: number): void;
  flash(): void;
}

declare global {
  interface Window {
    __demo: Demo;
  }
}

const RADIUS_CHUNKS = 7;
const MIN_CY = -3;
const MAX_CY = 10;
const TUBE_R = 3.3;
const LATERALS = [-5.5, 5.5];
const AXIS_Y = -20;
const DRIVE_M = 330;

function fatal(err: unknown): void {
  const box = document.createElement('pre');
  box.id = 'fatal';
  box.textContent = `demo stopped: ${err instanceof Error ? err.message : String(err)}`;
  document.body.append(box);
  console.error(err);
}

async function boot(): Promise<Omit<Demo, 'ready'>> {
  const canvas = document.getElementById('view');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('demo: canvas #view is missing');
  const fetchBytes: FetchBytes = async (path) => {
    const response = await fetch(`/data/${path}`);
    if (!response.ok || (response.headers.get('content-type') ?? '').startsWith('text/html')) {
      throw new Error(`demo: world data file ${path} is missing (HTTP ${response.status})`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };
  const manifest = await loadManifest(fetchBytes);
  const rail = await loadRailNetwork(manifest, fetchBytes);
  const site = await loadSite(manifest, 'portal', fetchBytes, rail);
  const source = new TiledSiteSource(site, VOXEL_SIZE_M);
  const store = new ChunkWorldStore({ voxelSizeM: VOXEL_SIZE_M, source, columnCacheSize: 2048 });
  const sample = createColumnSample();
  const groundAt = (x: number, z: number): number => {
    source.sampleColumn(x, z, sample);
    return Math.max(sample.surfaceM, sample.waterLevelM);
  };

  // A straight drive from 4th and King towards the Transit Center.
  const king = lonLatToWorld(-122.3947, 37.7765);
  const tc = lonLatToWorld(-122.3966, 37.7897);
  const len = Math.hypot(tc.x - king.x, tc.z - king.z);
  const dir = { x: (tc.x - king.x) / len, z: (tc.z - king.z) / len };
  const yaw = Math.atan2(dir.x, dir.z);
  const left = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const at = (s: number, lateral = 0, y = AXIS_Y): WorldPos => ({
    x: king.x + dir.x * s + left.x * lateral,
    y,
    z: king.z + dir.z * s + left.z * lateral,
  });
  const voxel = (p: WorldPos): { x: number; y: number; z: number } => ({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });

  // Carve: launch pit, the two tubes, a compact station box and a mezzanine box.
  for (const s of [-8, 2, 12]) store.applyEdit({ t: 'carveCapsule', a: voxel(at(s, 0, AXIS_Y - 1)), b: voxel(at(s, 0, 14)), radius: 11 });
  for (const lateral of LATERALS)
    store.applyEdit({ t: 'carveCapsule', a: voxel(at(0, lateral)), b: voxel(at(DRIVE_M, lateral)), radius: TUBE_R });
  store.applyEdit({ t: 'carveCapsule', a: voxel(at(95, 0, AXIS_Y + 2)), b: voxel(at(205, 0, AXIS_Y + 2)), radius: 10.5 });

  const renderer = new VoxelRenderer({ canvas, world: store, antialias: true });
  const focus = at(160);
  const fcx = Math.floor(focus.x / CHUNK_SIZE);
  const fcz = Math.floor(focus.z / CHUNK_SIZE);
  renderer.setRenderOrigin({ x: fcx, y: 0, z: fcz });
  const scratch = createMesherScratch();
  const padded = new Uint16Array(PADDED_VOLUME);
  const dirty = new Set<number>();
  store.onDirty((keys) => {
    for (const k of keys) dirty.add(k);
  });
  for (let cz = fcz - RADIUS_CHUNKS; cz < fcz + RADIUS_CHUNKS; cz++) {
    for (let cx = fcx - RADIUS_CHUNKS; cx < fcx + RADIUS_CHUNKS; cx++) {
      for (let cy = MIN_CY; cy <= MAX_CY; cy++) dirty.add(packChunkKey(cx, cy, cz));
    }
  }
  /** Meshes and uploads every chunk an edit touched since the last call. */
  const remeshAll = (): void => {
    for (const key of dirty) {
      store.paddedCopy(key, padded);
      renderer.upload(meshChunk({ key, size: CHUNK_SIZE, padded }, scratch));
    }
    dirty.clear();
  };
  remeshAll();

  const layer = createEntityLayer(renderer.overlay, { groundAt });
  const station = (
    id: string,
    s: number,
    style: StationEntity['style'],
    lengthM: number,
    widthM: number,
    heightM: number,
    fitOut: number,
  ): StationEntity => ({
    id,
    name: id,
    position: at(s),
    yaw,
    style,
    lengthM,
    widthM,
    heightM,
    progress: 1,
    fitOut,
    open: fitOut >= 1,
  });
  const face = at(DRIVE_M);
  const driveTbm: EntityScene['tbms'][number] = {
    id: 'tbm',
    position: face,
    yaw,
    pitch: 0,
    radiusM: TUBE_R,
    laterals: LATERALS,
    status: 'running',
    thrust: 0.75,
  };
  const scene: EntityScene = {
    tbms: [driveTbm],
    tunnels: [
      {
        id: 'drive',
        path: [at(0), at(120), at(240), face],
        rev: 1,
        lining: 'ring',
        radiusM: TUBE_R,
        laterals: LATERALS,
        linedM: DRIVE_M - 12,
        ringSpacingM: 1.5,
        trackM: DRIVE_M - 70,
      },
    ],
    stations: [station('compact', 150, 'compactBox', 110, 19, 8, 1)],
    pits: [{ id: 'pit', tbmId: 'tbm', position: at(2, 0, AXIS_Y - 3.4), yaw, lengthM: 30, widthM: 20, state: 'launched' }],
    trains: [{ id: 'emu', position: at(150), yaw, pitch: 0, cars: 4, carLengthM: 22 }],
    alignments: [
      {
        id: 'line',
        points: [at(0), at(120), at(240), at(330), at(420, 30), at(470, 90)],
        rev: 1,
        state: 'building',
        segmentIssues: [null, null, null, null, 'grade'],
        vertexIssues: [null, null, null, null, 'radius', null],
      },
    ],
    preview: null,
    possessedTbmId: null,
    highlight: null,
  };
  layer.setGhost([at(0, 12), at(200, 12), at(420, 50)]);

  let width = 1;
  let height = 1;
  const resize = (): void => {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.resize(width, height, 1);
  };
  resize();
  addEventListener('resize', resize);

  let camera: CameraState = { position: at(0, 0, 300), target: at(160, 0, 0), fovYDeg: 45, aspect: width / height, near: 1, far: 6000 };
  let time = 0;
  const look = (position: WorldPos, target: WorldPos, cutY?: number): void => {
    const d = Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
    camera = { position, target, fovYDeg: 45, aspect: width / height, near: Math.max(0.5, d / 60), far: Math.max(1500, d * 12), cutY };
  };
  const draw = (): void => {
    camera.aspect = width / height;
    renderer.setView({ time });
    layer.sync(scene);
    renderer.draw(camera, 0);
  };

  const mezzanine = station('mezz', 150, 'mezzanineBox', 150, 26, 14, 1);
  const views: Record<string, () => void> = {
    // The chase camera of the drive tool: behind and above the machine, ground cut away around it.
    chase() {
      scene.possessedTbmId = 'tbm';
      look(at(DRIVE_M - 46, 5, AXIS_Y + 24), at(DRIVE_M - 6));
    },
    // Lower and closer: cutterheads against the face, shields, the first rings.
    face() {
      scene.possessedTbmId = 'tbm';
      look(at(DRIVE_M - 24, 9, AXIS_Y + 10), at(DRIVE_M - 2, 0, AXIS_Y - 0.5));
    },
    // Looking back from above the machine along the gantry, the rings and the track.
    back() {
      scene.possessedTbmId = 'tbm';
      look(at(DRIVE_M - 2, -7, AXIS_Y + 16), at(DRIVE_M - 50, 0, AXIS_Y - 2));
    },
    // The compact station box with a train in it, opened by the cut plane.
    station() {
      renderer.setView({ cutRadius: 110 });
      look(at(75, 34, AXIS_Y + 34), at(150, 0, AXIS_Y), AXIS_Y + 9);
    },
    train() {
      renderer.setView({ cutRadius: 80 });
      look(at(112, 10, AXIS_Y + 17), at(150, -5, AXIS_Y - 1), AXIS_Y + 9);
    },
    // The cutterheads from the front, through a cut plane just ahead of the face (no cutaway: crowns stay on).
    head() {
      store.applyEdit({ t: 'carveCapsule', a: voxel(at(DRIVE_M + 9, 0, AXIS_Y)), b: voxel(at(DRIVE_M + 9, 0, AXIS_Y + 30)), radius: 12 });
      remeshAll();
      look(at(DRIVE_M + 16, 7, AXIS_Y + 5), at(DRIVE_M - 2, 0, AXIS_Y));
    },
    // The California box in the same place, same camera as `station`.
    mezzanine() {
      // Room for the larger box (the sim carves the real one).
      for (const lateral of [-4, 4]) {
        for (const y of [AXIS_Y + 2, AXIS_Y + 6]) {
          store.applyEdit({ t: 'carveCapsule', a: voxel(at(82, lateral, y)), b: voxel(at(218, lateral, y)), radius: 10.5 });
        }
      }
      remeshAll();
      scene.stations = [mezzanine];
      renderer.setView({ cutRadius: 110 });
      look(at(75, 34, AXIS_Y + 38), at(150, 0, AXIS_Y), AXIS_Y + 15);
    },
    // Plain cut plane: the ring wall must show strata, not the sky colour.
    cut() {
      renderer.setView({ cutRadius: 160 });
      look(at(160, 60, 100), at(160, 0, 7), -8);
    },
    xray() {
      renderer.setView({ xray: true });
      look(at(-40, 120, 260), at(180, 0, AXIS_Y));
    },
    // From the street: outlines through the ground, pit crane, station entrance, alignment with an error, ghost line.
    city() {
      look(at(-120, 60, 190), at(170, 0, 0));
    },
    pit() {
      look(at(-45, 28, 62), at(6, 0, AXIS_Y + 10));
    },
    preview() {
      scene.preview = {
        kind: 'alignment',
        alignment: {
          id: 'draw',
          points: [at(0, -40), at(160, -60), at(260, -30), at(300, 20)],
          rev: 1,
          state: 'preview',
          segmentIssues: [null, null, 'grade'],
          vertexIssues: [null, null, 'radius', null],
          hoveredVertex: 1,
          selectedVertex: 0,
        },
        stations: [station('ghost', 120, 'compactBox', 110, 19, 8, 0)],
      };
      scene.stations = [];
      look(at(60, -160, 330), at(170, -20, 0));
    },
  };

  // One view per machine kind, each on its own stand beside the drive: the bore (or trench) it works in is
  // carved once, and the cut plane takes the ground off at the axis so the whole machine shows.
  const stands: Record<MachineKind, { s: number; lateral: number }> = {
    twinBore: { s: 250, lateral: -60 },
    singleBore: { s: 250, lateral: -105 },
    smallBore: { s: 110, lateral: 60 },
    roadheader: { s: 180, lateral: 60 },
    excavator: { s: 250, lateral: 60 },
  };
  const carved = new Set<MachineKind>();
  for (const kind of MACHINE_KINDS) {
    views[`machine-${kind}`] = () => {
      const { s, lateral } = stands[kind];
      const d = MACHINE_DIAMETER_M[kind];
      const laterals = kind === 'twinBore' ? LATERALS : [0];
      const trench = kind === 'excavator';
      if (!carved.has(kind)) {
        carved.add(kind);
        for (const l of laterals) {
          // The excavator's trench: its floor 2.6 m below the axis.
          const y = trench ? AXIS_Y + 2.4 : AXIS_Y;
          store.applyEdit({
            t: 'carveCapsule',
            a: voxel(at(s - 80, lateral + l, y)),
            b: voxel(at(s, lateral + l, y)),
            radius: trench ? 5 : d / 2,
          });
        }
        remeshAll();
      }
      const machine = { machine: kind, diameterM: d };
      scene.tbms = [{ ...driveTbm, ...machine, id: kind, position: at(s, lateral), radiusM: trench ? 0 : d / 2, laterals }];
      renderer.setView({ cutRadius: 140 });
      const reach = kind === 'twinBore' || kind === 'singleBore' ? 14 + d * 1.6 : 11;
      look(
        at(s + reach * 0.75, lateral + reach, AXIS_Y + reach * 0.75),
        at(s - reach * 0.45, lateral, AXIS_Y - 1),
        AXIS_Y + (trench ? -0.5 : 0.5),
      );
    };
  }

  const reset = (): void => {
    scene.tbms = [driveTbm];
    scene.possessedTbmId = null;
    scene.preview = null;
    scene.stations = [station('compact', 150, 'compactBox', 110, 19, 8, 1)];
    renderer.setView({ xray: false, cutRadius: 160 });
  };

  return {
    views: Object.keys(views),
    view(name) {
      const v = views[name];
      if (v === undefined) throw new RangeError(`demo: unknown view "${name}"; known: ${Object.keys(views).join(', ')}`);
      reset();
      v();
      draw();
    },
    stats() {
      const s = renderer.stats();
      return { drawCalls: s.drawCalls, triangles: s.triangles, entities: layer.stats() };
    },
    bench(frames) {
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        time += 1 / 60;
        layer.update(1 / 60);
        draw();
        renderer.finish();
      }
      return (performance.now() - t0) / frames;
    },
    tick(seconds) {
      time += seconds;
      layer.update(seconds);
      draw();
    },
    flash() {
      layer.flash(face);
      draw();
    },
  };
}

const booted = boot();
const q = new URLSearchParams(location.search);
window.__demo = {
  ready: booted.then((d) => {
    Object.assign(window.__demo, d);
    d.view(q.get('view') ?? 'chase');
    if (q.get('live') === '1') {
      let last = performance.now();
      const loop = (now: number): void => {
        d.tick(Math.min(0.1, (now - last) / 1000));
        last = now;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }),
  views: [],
  view: () => {
    throw new Error('demo: not booted; await __demo.ready');
  },
  stats: () => {
    throw new Error('demo: not booted; await __demo.ready');
  },
  bench: () => {
    throw new Error('demo: not booted; await __demo.ready');
  },
  tick: () => {
    throw new Error('demo: not booted; await __demo.ready');
  },
  flash: () => {
    throw new Error('demo: not booted; await __demo.ready');
  },
};
window.__demo.ready.catch(fatal);
