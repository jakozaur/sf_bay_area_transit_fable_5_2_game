/**
 * Entity layer contract (round 2, docs/CONTRACTS.md): draws a core EntityScene (machines, lining rings, track,
 * trains, station boxes, launch pits, alignments with error colouring, the guidance line, tool previews).
 * The layer builds its three objects through OverlayLayer.setObject, so the floating origin and the overlay
 * render layer are handled for it. It never reads sim types: apps/game flattens the snapshot into the scene.
 *
 * Models are box meshes from models.ts. Vertical convention: the scene's track axis is the bore centre; rails
 * sit RAIL_DROP_M below it in lined tunnels and underground stations, and on it at grade.
 */
import {
  type AlignmentEntity,
  ENTITY_COLORS,
  type EntityPose,
  type EntityRef,
  type EntityScene,
  type GuidanceEntity,
  type LaunchPitEntity,
  type PreviewGeometry,
  type StationEntity,
  type TbmEntity,
  type TrainEntity,
  type TunnelEntity,
  type WorldPos,
} from '@bayvox/core';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { hexToLinear, type MeshData } from './mesh-builder.ts';
import {
  buildBoxFrame,
  buildMachine,
  buildPit,
  buildRing,
  buildStation,
  buildSurfaceRig,
  buildTbm,
  buildTrackPanel,
  buildTrainCar,
  deckDropM,
  MACHINE_DIAMETER_M,
  type MachineKind,
  type MachineModel,
  stationLevels,
  TBM_LENGTH_M,
  TRACK_HALF_SPACING_M,
  TRACK_PANEL_M,
  trackOffsets,
} from './models.ts';
import type { OverlayLayer } from './overlay.ts';
import { createPathSample, frameMatrix, PathCursor, type PathSample, pitchOf, rayYawBox, yawOf } from './path.ts';

/** Deterministic counters of what is currently drawn, for tests through the game hook. All integers. */
export interface EntityLayerStats {
  tbms: number;
  tunnels: number;
  /** Lining rings drawn over all tunnels. */
  rings: number;
  /** Whole metres of track drawn over all tunnels. */
  trackM: number;
  trains: number;
  stations: number;
  pits: number;
  alignments: number;
  /** Alignment segments and vertices drawn in the error colour, previews included. */
  errorMarks: number;
  preview: boolean;
}

/** A polyline trains may follow car by car where no tunnel is drawn (surface running, a service path). */
export interface TrackPath {
  points: readonly WorldPos[];
  /** Top of rail below the path, metres: RAIL_DROP_M where the path is a bore centre, 0 at grade. */
  railDropM: number;
}

export interface EntityLayerOptions {
  /**
   * Street level in world metres at a plan position. With it station entrances and pit walls rise to the
   * street; without it they get a fixed height.
   */
  groundAt?: (x: number, z: number) => number;
  /** The follow cutaway opened around the possessed machine. False never opens one. */
  cutaway?: false | { behindM?: number; sideM?: number; aheadM?: number; floorBelowAxisM?: number };
}

export interface EntityLayer {
  /**
   * Brings the drawn entities in line with `scene`. Called once per frame. Entities are matched by id; a tunnel
   * or alignment is rebuilt only when its `rev` changes, a longer `path` only appends rings and rails, and
   * poses (machines, trains) are updated in place. An id missing from the scene is removed.
   */
  sync(scene: EntityScene): void;
  /** Animation that is not sim state: cutterhead spin, ring pop-in, flash decay. `dtSeconds` is wall time. */
  update(dtSeconds: number): void;
  /** Starts the breakthrough flash at a world point. The app calls it when a 'breakthrough' feed item arrives. */
  flash(at: WorldPos): void;
  /** Pose the camera should track for an entity, or null when it is not in the scene. */
  anchor(ref: EntityRef): EntityPose | null;
  /** Nearest entity hit by a ray (origin and unit direction in world metres) within `maxDistanceM`, for click to possess and hover. */
  pick(ray: { origin: WorldPos; dir: WorldPos }, maxDistanceM: number): EntityRef | null;
  stats(): EntityLayerStats;
  /** Removes everything the layer added to the overlay and frees its GPU resources. */
  dispose(): void;
  /** Shows the official alignment as a thin dashed ghost line under the player's own; null or fewer than 2 points hides it. */
  setGhost(points: readonly WorldPos[] | null): void;
  /**
   * Shows or hides the upper half of the lining (ring crowns, arch and box roofs). Hidden, the track and the trains
   * inside a tunnel can be seen from above through the x-ray ground or under a cut plane. Default: shown.
   * Around a possessed machine the crowns are off whatever this says.
   */
  setCrowns(visible: boolean): void;
  /** Extra paths train cars follow where no tunnel is in the scene. Replaces the previous set. */
  setTrackPaths(paths: readonly TrackPath[]): void;
}

const ID = 'ent.';
/** Instances per ring or track batch: one overlay object, two draws. */
const BATCH = 256;
/** Rings added in one sync beyond this are a load, not live building, and do not animate. */
const POP_MAX = 8;
const POP_SECONDS = 0.35;
const FLASH_SECONDS = 1.4;
/** A train follows a path car by car when its centre is within this distance of it, metres. */
const FOLLOW_M = 8;
const WORK_LIGHT = 0xffc27a;

function geometryOf(d: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(d.positions, 3));
  g.setAttribute('normal', new BufferAttribute(d.normals, 3));
  g.setAttribute('color', new BufferAttribute(d.colors, 3));
  g.setIndex(new BufferAttribute(d.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function assertUnit(v: number, what: string): void {
  if (!(v >= 0 && v <= 1)) throw new RangeError(`EntityLayer: ${what} must be in [0, 1], got ${v}`);
}

/** What the layer draws for one heading. */
export interface MachineSpec {
  /** null: the heading names no known machine and is drawn as before kinds existed (buildTbm, or the surface rig). */
  kind: MachineKind | null;
  /** Excavated diameter of one tube, metres. */
  diameterM: number;
}

/**
 * The one place the layer reads the machine kind and diameter of a heading (core TbmEntity.machine and
 * TbmEntity.diameterM, both optional). An absent or unknown kind gives `kind: null`; an absent diameter is
 * twice the radius, or the usual size of the kind for a heading without a radius.
 */
export function machineOf(e: TbmEntity): MachineSpec {
  const kind = e.machine ?? null;
  const d = e.diameterM;
  const diameterM = d !== undefined && d > 0 ? d : e.radiusM > 0 ? e.radiusM * 2 : kind === null ? 0 : MACHINE_DIAMETER_M[kind];
  return { kind, diameterM };
}

/** Furthest the bucket is lifted in a dig cycle, radians at the foot of the arm. */
const DIG_SWING = 0.18;

interface TbmEntry {
  e: TbmEntity;
  key: string;
  tilt: Group;
  heads: Mesh[];
  motion: 'spin' | 'dig';
  /** Face to tail, and the furthest the model reaches from the heading axis across and up, metres. */
  lengthM: number;
  halfM: number;
  spin: number;
}

interface Batch {
  id: string;
  anchor: WorldPos;
  lower: InstancedMesh;
  upper: InstancedMesh | null;
  count: number;
}

interface TunnelEntry {
  e: TunnelEntity;
  key: string;
  cursor: PathCursor;
  ringGeometry: { lower: BufferGeometry; upper: BufferGeometry } | null;
  trackGeometry: BufferGeometry;
  rings: Batch[];
  track: Batch[];
  /** Rings and panels placed, per tube. */
  ringCount: number;
  panelCount: number;
}

interface Pop {
  batch: Batch;
  index: number;
  sample: PathSample;
  lateral: number;
  t: number;
}

interface StationEntry {
  key: string;
  poseKey: string;
  e: StationEntity;
}

interface TrainEntry {
  e: TrainEntity;
  key: string;
  cars: Mesh[];
}

interface AlignmentEntry {
  key: string;
  errors: number;
  handles: { mesh: Mesh; world: WorldPos; px: number }[];
}

interface Flash {
  id: string;
  at: WorldPos;
  mesh: Mesh;
  t: number;
}

class Layer implements EntityLayer {
  private readonly overlay: OverlayLayer;
  private readonly options: EntityLayerOptions;
  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  private readonly geometries = new Map<string, BufferGeometry>();
  private readonly tbms = new Map<string, TbmEntry>();
  private readonly machines = new Map<string, MachineModel>();
  private readonly tunnels = new Map<string, TunnelEntry>();
  private readonly stations = new Map<string, StationEntry>();
  private readonly pits = new Map<string, { key: string; e: LaunchPitEntity; depth: number }>();
  private readonly trains = new Map<string, TrainEntry>();
  private readonly alignments = new Map<string, AlignmentEntry>();
  private readonly pops: Pop[] = [];
  private readonly flashes: Flash[] = [];
  private readonly handleGeometry = new BoxGeometry(1, 1, 1);
  /** Objects whose geometry and materials are not shared, by overlay id. */
  private readonly owned = new Map<string, Object3D>();
  private readonly unsubscribe: () => void;
  private trackPaths: { cursor: PathCursor; railDropM: number }[] = [];
  private boxes: { x: number; z: number; sin: number; cos: number; hl: number; hw: number }[] = [];
  private boxKey = '';
  private previewKey = '';
  private previewIds: string[] = [];
  private previewErrors = 0;
  private hasPreview = false;
  private highlightKey = '';
  private possessed: string | null = null;
  private crowns = true;
  private ownsCutaway = false;
  private flashSeq = 0;
  private clock = 0;
  private disposed = false;
  private readonly sample = createPathSample();
  private readonly matrix = new Float32Array(16);

  constructor(overlay: OverlayLayer, options: EntityLayerOptions) {
    this.overlay = overlay;
    this.options = options;
    // Alignment handles keep a constant size on screen.
    this.unsubscribe = overlay.onFrame((camera, pxPerRadian) => {
      for (const a of this.alignments.values()) {
        for (const h of a.handles) {
          const dist = Math.hypot(h.world.x - camera.x, h.world.y - camera.y, h.world.z - camera.z);
          h.mesh.scale.setScalar(Math.max(0.6, (h.px * dist) / pxPerRadian));
        }
      }
    });
  }

  // ---------------------------------------------------------------- sync

  sync(scene: EntityScene): void {
    if (this.disposed) throw new Error('EntityLayer.sync: the layer was disposed');
    this.possessed = scene.possessedTbmId;
    this.syncStationBoxes(scene.stations);
    this.syncTunnels(scene.tunnels);
    this.syncTbms(scene.tbms);
    this.syncStations(scene.stations);
    this.syncPits(scene.pits);
    this.syncTrains(scene.trains);
    this.syncAlignments(scene.alignments);
    this.syncPreview(scene);
    this.syncCutaway(scene);
    this.syncHighlight(scene);
  }

  private geometry(key: string, build: () => MeshData): BufferGeometry {
    let g = this.geometries.get(key);
    if (g === undefined) {
      g = geometryOf(build());
      this.geometries.set(key, g);
    }
    return g;
  }

  private mesh(d: MeshData): Mesh {
    return new Mesh(geometryOf(d), this.material);
  }

  /** Adds an object whose geometry and materials belong to this one item: `drop` frees them. */
  private putOwned(id: string, object: Object3D, pose: { position: WorldPos; yaw?: number }): void {
    this.overlay.setObject(id, object, pose);
    this.owned.set(id, object);
  }

  private drop(id: string): void {
    const had = this.overlay.remove(id);
    if (!had) throw new Error(`EntityLayer: overlay item "${id}" is missing (was it removed by another caller?)`);
    const object = this.owned.get(id);
    if (object === undefined) return;
    this.owned.delete(id);
    object.traverse((c) => {
      const m = c as Partial<Mesh>;
      if (m.geometry !== undefined && m.geometry !== this.handleGeometry) m.geometry.dispose();
      const material = m.material;
      if (material !== undefined && material !== this.material && !Array.isArray(material)) material.dispose();
    });
  }

  /** `drop` for items that may not exist. */
  private release(id: string): void {
    if (this.overlay.has(id)) this.drop(id);
  }

  // ---- machines

  private syncTbms(list: readonly TbmEntity[]): void {
    const seen = new Set<string>();
    for (const e of list) {
      if (seen.has(e.id)) throw new RangeError(`EntityLayer.sync: duplicate tbm id "${e.id}"`);
      seen.add(e.id);
      assertUnit(e.thrust, `tbm "${e.id}" thrust`);
      const id = `${ID}tbm.${e.id}`;
      const spec = machineOf(e);
      const key = `${spec.kind}|${spec.diameterM}|${e.radiusM}|${e.laterals.join(',')}`;
      let entry = this.tbms.get(e.id);
      if (entry === undefined || entry.key !== key) {
        if (entry !== undefined) this.drop(id);
        const root = new Group();
        const tilt = new Group();
        tilt.rotation.order = 'YXZ';
        root.add(tilt);
        const heads: Mesh[] = [];
        let motion: 'spin' | 'dig' = 'spin';
        let lengthM = e.radiusM > 1 ? TBM_LENGTH_M : 12;
        let halfM = Math.max(2, e.radiusM);
        if (spec.kind !== null) {
          const kind = spec.kind;
          const name = `machine.${kind}.${spec.diameterM}`;
          let model = this.machines.get(name);
          if (model === undefined) {
            model = buildMachine(kind, spec.diameterM);
            this.machines.set(name, model);
          }
          const m = model;
          const body = this.geometry(`${name}.body`, () => m.body);
          const tool = this.geometry(`${name}.tool`, () => m.tool);
          // One machine per tube; a heading without tubes (a trench) has one on its axis.
          for (const lateral of e.laterals.length === 0 ? [0] : e.laterals) {
            const b = new Mesh(body, this.material);
            b.position.x = lateral;
            const h = new Mesh(tool, this.material);
            h.position.set(lateral + m.toolAt[0], m.toolAt[1], m.toolAt[2]);
            tilt.add(b, h);
            heads.push(h);
          }
          motion = m.motion;
          lengthM = m.lengthM;
          halfM = 0;
          for (const part of [m.body, m.tool]) {
            const at = part === m.tool ? m.toolAt : [0, 0, 0];
            for (let a = 0; a < 2; a++) {
              halfM = Math.max(
                halfM,
                Math.abs((part.min[a] as number) + (at[a] as number)),
                Math.abs((part.max[a] as number) + (at[a] as number)),
              );
            }
          }
        } else if (e.radiusM > 1) {
          const body = this.geometry(`tbm.body.${e.radiusM}`, () => buildTbm(e.radiusM).body);
          const head = this.geometry(`tbm.head.${e.radiusM}`, () => buildTbm(e.radiusM).head);
          if (e.laterals.length === 0)
            throw new RangeError(`EntityLayer.sync: tbm "${e.id}" has radius ${e.radiusM} m but no tubes (laterals is empty)`);
          for (const lateral of e.laterals) {
            const b = new Mesh(body, this.material);
            b.position.x = lateral;
            const h = new Mesh(head, this.material);
            h.position.x = lateral;
            tilt.add(b, h);
            heads.push(h);
          }
        } else {
          tilt.add(new Mesh(this.geometry('tbm.surface', buildSurfaceRig), this.material));
        }
        entry = { e, key, tilt, heads, motion, lengthM, halfM, spin: entry?.spin ?? 0 };
        this.tbms.set(e.id, entry);
        this.overlay.setObject(id, root, { position: e.position, yaw: e.yaw });
      } else if (
        e.position.x !== entry.e.position.x ||
        e.position.y !== entry.e.position.y ||
        e.position.z !== entry.e.position.z ||
        e.yaw !== entry.e.yaw
      ) {
        this.overlay.setPose(id, { position: e.position, yaw: e.yaw });
      }
      if (entry.tilt.rotation.x !== -e.pitch) {
        entry.tilt.rotation.x = -e.pitch;
        this.overlay.touch();
      }
      entry.e = e;
      // The lamp sits just behind the face, above the axis: it lights the face, the shield and the first rings.
      const lampR = spec.diameterM / 2;
      const up = Math.max(1, lampR * 0.4);
      this.overlay.setLight(id, {
        position: { x: e.position.x - Math.sin(e.yaw) * 3, y: e.position.y + up, z: e.position.z - Math.cos(e.yaw) * 3 },
        radiusM: Math.max(30, lampR * 11),
        color: WORK_LIGHT,
        intensity: e.status === 'running' ? 0.9 : e.status === 'stopped' ? 0.55 : 0.35,
      });
    }
    for (const id of [...this.tbms.keys()]) {
      if (seen.has(id)) continue;
      this.drop(`${ID}tbm.${id}`);
      this.overlay.setLight(`${ID}tbm.${id}`, null);
      this.tbms.delete(id);
    }
  }

  // ---- tunnels

  /**
   * Footprints of the station boxes: a bore that runs through a box gets no lining rings there (the box is the
   * structure), so platforms, track and trains are not buried in a ring tube. A change rebuilds every tunnel.
   */
  private syncStationBoxes(list: readonly StationEntity[]): void {
    const boxes = list.filter(
      (s) => s.style === 'compactBox' || s.style === 'mezzanineBox' || s.style === 'minedCavern' || s.style === 'terminal',
    );
    const key = boxes.map((s) => `${s.position.x},${s.position.z},${s.yaw},${s.lengthM},${s.widthM}`).join(';');
    if (key === this.boxKey) return;
    this.boxKey = key;
    this.boxes = boxes.map((s) => ({
      x: s.position.x,
      z: s.position.z,
      sin: Math.sin(s.yaw),
      cos: Math.cos(s.yaw),
      hl: s.lengthM / 2,
      hw: s.widthM / 2,
    }));
    for (const entry of this.tunnels.values()) this.removeTunnel(entry);
    this.tunnels.clear();
  }

  private insideStationBox(x: number, z: number): boolean {
    for (const b of this.boxes) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (Math.abs(dx * b.sin + dz * b.cos) < b.hl && Math.abs(dx * b.cos - dz * b.sin) < b.hw) return true;
    }
    return false;
  }

  private syncTunnels(list: readonly TunnelEntity[]): void {
    const seen = new Set<string>();
    for (const e of list) {
      if (seen.has(e.id)) throw new RangeError(`EntityLayer.sync: duplicate tunnel id "${e.id}"`);
      seen.add(e.id);
      if (!(e.ringSpacingM > 0)) throw new RangeError(`EntityLayer.sync: tunnel "${e.id}" ringSpacingM must be > 0, got ${e.ringSpacingM}`);
      const key = `${e.rev}|${e.lining}|${e.radiusM}|${e.laterals.join(',')}|${e.ringSpacingM}`;
      let entry = this.tunnels.get(e.id);
      const shrank = entry !== undefined && (e.linedM < entry.e.linedM || e.trackM < entry.e.trackM);
      if (entry === undefined || entry.key !== key || shrank || !entry.cursor.continues(e.path)) {
        if (entry !== undefined) this.removeTunnel(entry);
        let ringGeometry: TunnelEntry['ringGeometry'] = null;
        if (e.lining !== 'none') {
          const k = `ring.${e.lining}.${e.radiusM}.${e.ringSpacingM}`;
          const build = (): { lower: MeshData; upper: MeshData } =>
            e.lining === 'box'
              ? buildBoxFrame(e.radiusM, e.ringSpacingM)
              : buildRing(e.radiusM, e.ringSpacingM, e.lining === 'arch' ? 'arch' : 'ring');
          ringGeometry = { lower: this.geometry(`${k}.lo`, () => build().lower), upper: this.geometry(`${k}.up`, () => build().upper) };
        }
        entry = {
          e,
          key,
          cursor: new PathCursor(),
          ringGeometry,
          trackGeometry: this.geometry(`track.${e.lining}.${e.radiusM}`, () => buildTrackPanel(e.radiusM, e.lining)),
          rings: [],
          track: [],
          ringCount: 0,
          panelCount: 0,
        };
        this.tunnels.set(e.id, entry);
      }
      entry.e = e;
      entry.cursor.extend(e.path);
      if (entry.cursor.points.length < 2) continue;
      const tubes = e.laterals.length === 0 ? [0] : e.laterals;
      const len = entry.cursor.lengthM;
      if (entry.ringGeometry !== null) {
        const want = Math.floor((Math.min(e.linedM, len) + 1e-6) / e.ringSpacingM);
        const animate = want - entry.ringCount <= POP_MAX && entry.ringCount > 0;
        for (let i = entry.ringCount; i < want; i++) {
          for (let t = 0; t < tubes.length; t++) {
            this.place(
              entry,
              entry.rings,
              'r',
              entry.ringGeometry.lower,
              entry.ringGeometry.upper,
              i * tubes.length + t,
              i * e.ringSpacingM,
              tubes[t] as number,
              animate,
            );
          }
        }
        entry.ringCount = Math.max(entry.ringCount, want);
      }
      const panels = Math.floor((Math.min(e.trackM, len) + 1e-6) / TRACK_PANEL_M);
      for (let i = entry.panelCount; i < panels; i++) {
        for (let t = 0; t < tubes.length; t++) {
          this.place(
            entry,
            entry.track,
            't',
            entry.trackGeometry,
            null,
            i * tubes.length + t,
            i * TRACK_PANEL_M,
            tubes[t] as number,
            false,
          );
        }
      }
      entry.panelCount = Math.max(entry.panelCount, panels);
    }
    for (const [id, entry] of [...this.tunnels]) {
      if (seen.has(id)) continue;
      this.removeTunnel(entry);
      this.tunnels.delete(id);
    }
    // While a machine is followed the crowns come off, so the gantry and the track inside stay visible.
    const showUpper = this.possessed === null && this.crowns;
    for (const entry of this.tunnels.values()) {
      for (const b of entry.rings) {
        if (b.upper !== null && b.upper.visible !== showUpper) {
          b.upper.visible = showUpper;
          this.overlay.touch();
        }
      }
    }
  }

  /** Puts instance `n` of a tunnel's rings or track panels at a chainage, opening a new batch when the last one is full. */
  private place(
    entry: TunnelEntry,
    batches: Batch[],
    tag: string,
    lower: BufferGeometry,
    upper: BufferGeometry | null,
    n: number,
    chainageM: number,
    lateral: number,
    animate: boolean,
  ): void {
    const s = entry.cursor.sample(chainageM, this.sample);
    const slot = n % BATCH;
    let batch = batches[Math.floor(n / BATCH)];
    if (batch === undefined) {
      const anchor = { x: s.x, y: s.y, z: s.z };
      const group = new Group();
      const lo = new InstancedMesh(lower, this.material, BATCH);
      lo.count = 0;
      group.add(lo);
      let up: InstancedMesh | null = null;
      if (upper !== null) {
        up = new InstancedMesh(upper, this.material, BATCH);
        up.count = 0;
        up.visible = this.possessed === null && this.crowns;
        group.add(up);
      }
      batch = { id: `${ID}tun.${entry.e.id}.${tag}${batches.length}`, anchor, lower: lo, upper: up, count: 0 };
      batches.push(batch);
      this.overlay.setObject(batch.id, group, { position: anchor });
    }
    // Lining inside a station box is not drawn: scale 0 keeps the instance numbering simple.
    const hidden = upper !== null && this.insideStationBox(s.x, s.z);
    if (hidden) animate = false;
    frameMatrix(s, lateral, batch.anchor, hidden ? 0 : animate ? 0.5 : 1, this.matrix, 0);
    this.writeInstance(batch, slot);
    batch.count = slot + 1;
    for (const m of [batch.lower, batch.upper]) {
      if (m === null) continue;
      m.count = batch.count;
      // Instances moved the bounds: recomputed on the next frustum test.
      m.boundingSphere = null;
    }
    if (animate) this.pops.push({ batch, index: slot, sample: { ...s }, lateral, t: 0 });
    this.overlay.touch();
  }

  private writeInstance(batch: Batch, slot: number): void {
    for (const m of [batch.lower, batch.upper]) {
      if (m === null) continue;
      m.instanceMatrix.array.set(this.matrix, slot * 16);
      m.instanceMatrix.needsUpdate = true;
    }
  }

  private removeTunnel(entry: TunnelEntry): void {
    for (const b of [...entry.rings, ...entry.track]) {
      this.drop(b.id);
      b.lower.dispose();
      b.upper?.dispose();
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      if (entry.rings.includes((this.pops[i] as Pop).batch)) this.pops.splice(i, 1);
    }
  }

  // ---- stations and pits

  private streetAbove(p: WorldPos, fallback: number): number {
    const groundAt = this.options.groundAt;
    if (groundAt === undefined) return fallback;
    const g = groundAt(p.x, p.z);
    if (!Number.isFinite(g)) throw new RangeError(`EntityLayer: groundAt(${p.x}, ${p.z}) returned ${g}`);
    return g - p.y;
  }

  private outline(
    id: string,
    center: WorldPos,
    yaw: number,
    hx: number,
    y0: number,
    y1: number,
    hz: number,
    color: number,
    widthPx: number,
  ): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const corner = (i: number, y: number): [number, number, number] => {
      const lx = i === 0 || i === 3 ? -hx : hx;
      const lz = i < 2 ? -hz : hz;
      return [center.x + lx * c + lz * s, center.y + y, center.z - lx * s + lz * c];
    };
    const seg: number[] = [];
    for (let i = 0; i < 4; i++) {
      seg.push(
        ...corner(i, y0),
        ...corner((i + 1) % 4, y0),
        ...corner(i, y1),
        ...corner((i + 1) % 4, y1),
        ...corner(i, y0),
        ...corner(i, y1),
      );
    }
    this.overlay.setLineSegments(id, seg, { color, widthPx, xray: true, opacity: 0.85 });
  }

  private syncStations(list: readonly StationEntity[]): void {
    const seen = new Set<string>();
    for (const e of list) {
      if (seen.has(e.id)) throw new RangeError(`EntityLayer.sync: duplicate station id "${e.id}"`);
      seen.add(e.id);
      assertUnit(e.progress, `station "${e.id}" progress`);
      assertUnit(e.fitOut, `station "${e.id}" fitOut`);
      const id = `${ID}sta.${e.id}`;
      // Progress in twentieths: a rebuild per visible step, not per frame.
      const key = `${e.style}|${e.lengthM}|${e.widthM}|${e.heightM}|${Math.floor(e.progress * 20)}|${Math.floor(e.fitOut * 20)}|${e.open}`;
      const poseKey = `${e.position.x},${e.position.y},${e.position.z},${e.yaw}`;
      const entry = this.stations.get(e.id);
      const lv = stationLevels(e);
      if (entry === undefined || entry.key !== key || entry.poseKey !== poseKey) {
        if (entry === undefined || entry.key !== key) {
          if (entry !== undefined) this.drop(id);
          const mesh = this.mesh(
            buildStation({
              style: e.style,
              lengthM: e.lengthM,
              widthM: e.widthM,
              heightM: e.heightM,
              progress: e.progress,
              fitOut: e.fitOut,
              open: e.open,
              surfaceAboveM: this.streetAbove(e.position, lv.roof + 4.8),
            }),
          );
          this.putOwned(id, mesh, { position: e.position, yaw: e.yaw });
        } else {
          this.overlay.setPose(id, { position: e.position, yaw: e.yaw });
        }
        // The box outline shows through the ground, so a station can be found from the street.
        const done = e.progress >= 1;
        this.outline(`${id}.o`, e.position, e.yaw, e.widthM / 2, lv.floor, lv.roof, e.lengthM / 2, ENTITY_COLORS.station, done ? 1.5 : 2.5);
        this.stations.set(e.id, { key, poseKey, e });
      } else {
        entry.e = e;
      }
    }
    for (const id of [...this.stations.keys()]) {
      if (seen.has(id)) continue;
      this.drop(`${ID}sta.${id}`);
      this.drop(`${ID}sta.${id}.o`);
      this.stations.delete(id);
    }
  }

  private syncPits(list: readonly LaunchPitEntity[]): void {
    const seen = new Set<string>();
    for (const e of list) {
      if (seen.has(e.id)) throw new RangeError(`EntityLayer.sync: duplicate pit id "${e.id}"`);
      seen.add(e.id);
      const id = `${ID}pit.${e.id}`;
      const key = `${e.state}|${e.lengthM}|${e.widthM}|${e.position.x},${e.position.y},${e.position.z},${e.yaw}`;
      const entry = this.pits.get(e.id);
      if (entry !== undefined && entry.key === key) continue;
      const depth = Math.max(3, this.streetAbove(e.position, 14));
      this.release(id);
      if (e.state !== 'planned') {
        this.putOwned(id, this.mesh(buildPit(e.lengthM, e.widthM, depth, e.state)), { position: e.position, yaw: e.yaw });
      }
      this.outline(
        `${id}.o`,
        e.position,
        e.yaw,
        e.widthM / 2,
        0,
        depth,
        e.lengthM / 2,
        ENTITY_COLORS.pit,
        e.state === 'planned' ? 2.5 : 1.5,
      );
      this.pits.set(e.id, { key, e, depth });
    }
    for (const id of [...this.pits.keys()]) {
      if (seen.has(id)) continue;
      this.release(`${ID}pit.${id}`);
      this.drop(`${ID}pit.${id}.o`);
      this.pits.delete(id);
    }
  }

  // ---- trains

  private syncTrains(list: readonly TrainEntity[]): void {
    const seen = new Set<string>();
    for (const e of list) {
      if (seen.has(e.id)) throw new RangeError(`EntityLayer.sync: duplicate train id "${e.id}"`);
      seen.add(e.id);
      if (!Number.isInteger(e.cars) || e.cars < 1 || e.cars > 16)
        throw new RangeError(`EntityLayer.sync: train "${e.id}" cars must be 1..16, got ${e.cars}`);
      const id = `${ID}train.${e.id}`;
      const key = `${e.cars}|${e.carLengthM}`;
      let entry = this.trains.get(e.id);
      if (entry === undefined || entry.key !== key) {
        if (entry !== undefined) this.drop(id);
        const group = new Group();
        const cars: Mesh[] = [];
        const cab = this.geometry(`car.cab.${e.carLengthM}`, () => buildTrainCar(e.carLengthM, true));
        const mid = this.geometry(`car.mid.${e.carLengthM}`, () => buildTrainCar(e.carLengthM, false));
        for (let k = 0; k < e.cars; k++) {
          const car = new Mesh(k === 0 || k === e.cars - 1 ? cab : mid, this.material);
          car.rotation.order = 'YXZ';
          group.add(car);
          cars.push(car);
        }
        entry = { e, key, cars };
        this.trains.set(e.id, entry);
        this.overlay.setObject(id, group, { position: e.position });
      } else {
        this.overlay.setPose(id, { position: e.position });
      }
      entry.e = e;
      this.poseCars(entry);
    }
    for (const id of [...this.trains.keys()]) {
      if (seen.has(id)) continue;
      this.drop(`${ID}train.${id}`);
      this.trains.delete(id);
    }
  }

  /** The path a train at `p` runs on: the nearest tunnel within reach, else the nearest extra track path. */
  private trackFor(p: WorldPos): { cursor: PathCursor; chainageM: number; railDropM: number; tubes: number[] } | null {
    let best: { cursor: PathCursor; chainageM: number; railDropM: number; tubes: number[] } | null = null;
    let bestD = FOLLOW_M;
    for (const t of this.tunnels.values()) {
      if (t.cursor.points.length < 2) continue;
      const n = t.cursor.nearest(p);
      if (n.distanceM >= bestD) continue;
      bestD = n.distanceM;
      const tubes = t.e.laterals.length > 1 ? t.e.laterals : trackOffsets(t.e.radiusM).map((o) => o + (t.e.laterals[0] ?? 0));
      best = { cursor: t.cursor, chainageM: n.chainageM, railDropM: deckDropM(t.e.radiusM, t.e.lining), tubes };
    }
    for (const t of this.trackPaths) {
      const n = t.cursor.nearest(p);
      if (n.distanceM >= bestD) continue;
      bestD = n.distanceM;
      best = { cursor: t.cursor, chainageM: n.chainageM, railDropM: t.railDropM, tubes: [0] };
    }
    return best;
  }

  /** Places every car: along the track it runs on (each car with its own heading and grade), or rigidly along the train's pose. */
  private poseCars(entry: TrainEntry): void {
    const e = entry.e;
    const fx = Math.sin(e.yaw) * Math.cos(e.pitch);
    const fy = Math.sin(e.pitch);
    const fz = Math.cos(e.yaw) * Math.cos(e.pitch);
    const track = this.trackFor(e.position);
    const s = this.sample;
    let sign = 1;
    let lateral = 0;
    if (track !== null) {
      track.cursor.sample(track.chainageM, s);
      sign = s.tx * fx + s.ty * fy + s.tz * fz >= 0 ? 1 : -1;
      // Right-hand running: with the path direction the train takes the rightmost track (the most negative lateral).
      if (track.tubes.length > 1) lateral = sign > 0 ? Math.min(...track.tubes) : Math.max(...track.tubes);
      else lateral = track.tubes[0] ?? 0;
    }
    const n = entry.cars.length;
    for (let k = 0; k < n; k++) {
      const car = entry.cars[k] as Mesh;
      const d = (k - (n - 1) / 2) * e.carLengthM;
      // The last car is a cab car facing backwards.
      const flip = n > 1 && k === 0;
      let yaw: number;
      let pitch: number;
      if (track === null) {
        car.position.set(fx * d, fy * d, fz * d);
        yaw = e.yaw;
        pitch = e.pitch;
      } else {
        track.cursor.sample(track.chainageM + sign * d, s);
        const flat = Math.hypot(s.tx, s.tz);
        const lx = flat < 1e-9 ? 1 : s.tz / flat;
        const lz = flat < 1e-9 ? 0 : -s.tx / flat;
        car.position.set(s.x + lx * lateral - e.position.x, s.y - track.railDropM - e.position.y, s.z + lz * lateral - e.position.z);
        yaw = yawOf(s.tx * sign, s.tz * sign);
        pitch = pitchOf(s.ty * sign);
      }
      car.rotation.set(flip ? pitch : -pitch, flip ? yaw + Math.PI : yaw, 0);
    }
    this.overlay.touch();
  }

  // ---- alignments

  private syncAlignments(list: readonly AlignmentEntity[]): void {
    const seen = new Set<string>();
    for (const e of list) {
      if (seen.has(e.id)) throw new RangeError(`EntityLayer.sync: duplicate alignment id "${e.id}"`);
      seen.add(e.id);
      this.putAlignment(`${ID}al.${e.id}`, e);
    }
    for (const id of [...this.alignments.keys()]) {
      if (id.startsWith(`${ID}al.`) && !seen.has(id.slice(ID.length + 3))) this.removeAlignment(id);
    }
  }

  private putAlignment(id: string, e: AlignmentEntity): void {
    const key = `${e.rev}|${e.state}|${e.points.length}|${e.hoveredVertex ?? -1}|${e.selectedVertex ?? -1}`;
    const old = this.alignments.get(id);
    if (old !== undefined && old.key === key) return;
    if (old !== undefined) this.removeAlignment(id);
    const n = e.points.length;
    if (e.segmentIssues.length !== Math.max(0, n - 1) || e.vertexIssues.length !== n) {
      throw new RangeError(
        `EntityLayer.sync: alignment "${e.id}" has ${n} points but ${e.segmentIssues.length} segment issues and ${e.vertexIssues.length} vertex issues`,
      );
    }
    const entry: AlignmentEntry = { key, errors: 0, handles: [] };
    this.alignments.set(id, entry);
    if (n === 0) return;
    const anchor = e.points[0] as WorldPos;
    const group = new Group();
    if (n >= 2) {
      const positions = new Float32Array((n - 1) * 6);
      const colors = new Float32Array((n - 1) * 6);
      const ok = hexToLinear(ENTITY_COLORS.alignment);
      const bad = hexToLinear(ENTITY_COLORS.error);
      for (let i = 0; i < n - 1; i++) {
        const a = e.points[i] as WorldPos;
        const b = e.points[i + 1] as WorldPos;
        if (!Number.isFinite(a.x + a.y + a.z + b.x + b.y + b.z))
          throw new RangeError(`EntityLayer.sync: alignment "${e.id}" has a non-finite point near index ${i}`);
        positions.set([a.x - anchor.x, a.y - anchor.y, a.z - anchor.z, b.x - anchor.x, b.y - anchor.y, b.z - anchor.z], i * 6);
        const c = e.segmentIssues[i] === null ? ok : bad;
        if (e.segmentIssues[i] !== null) entry.errors++;
        colors.set([...c, ...c], i * 6);
      }
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      const dashed = e.state === 'draft';
      const material = new LineMaterial({
        vertexColors: true,
        linewidth: e.state === 'preview' ? 5 : e.state === 'draft' ? 4 : e.state === 'open' ? 2 : 3,
        worldUnits: false,
        dashed,
        dashSize: 10,
        gapSize: 7,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      const line = new LineSegments2(geometry, material);
      if (dashed) line.computeLineDistances();
      line.renderOrder = 20;
      line.frustumCulled = false;
      group.add(line);
    }
    // Handles: every vertex of a preview, and every vertex that breaks a rule in any state.
    for (let i = 0; i < n; i++) {
      const issue = e.vertexIssues[i] !== null;
      if (issue) entry.errors++;
      if (e.state !== 'preview' && !issue) continue;
      const p = e.points[i] as WorldPos;
      const selected = e.selectedVertex === i;
      const hovered = e.hoveredVertex === i;
      const color = issue ? ENTITY_COLORS.error : selected ? ENTITY_COLORS.handleSelected : ENTITY_COLORS.handle;
      const material = new MeshBasicMaterial({ color, depthTest: false, transparent: true });
      const mesh = new Mesh(this.handleGeometry, material);
      mesh.position.set(p.x - anchor.x, p.y - anchor.y, p.z - anchor.z);
      mesh.rotation.y = Math.PI / 4;
      mesh.renderOrder = 22;
      group.add(mesh);
      entry.handles.push({ mesh, world: { x: p.x, y: p.y, z: p.z }, px: hovered || selected ? 16 : 11 });
    }
    this.putOwned(id, group, { position: anchor });
  }

  private removeAlignment(id: string): void {
    if (!this.alignments.delete(id)) return;
    this.release(id);
  }

  setCrowns(visible: boolean): void {
    if (this.crowns === visible) return;
    this.crowns = visible;
    const showUpper = this.possessed === null && visible;
    for (const entry of this.tunnels.values()) {
      for (const b of entry.rings) if (b.upper !== null) b.upper.visible = showUpper;
    }
    this.overlay.touch();
  }

  setGhost(points: readonly WorldPos[] | null): void {
    const id = `${ID}ghost`;
    if (points === null || points.length < 2) {
      this.overlay.remove(id);
      return;
    }
    this.overlay.setPolyline(id, points, { color: ENTITY_COLORS.ghost, widthPx: 2.5, xray: true, dashM: 14 });
  }

  setTrackPaths(paths: readonly TrackPath[]): void {
    this.trackPaths = paths
      .filter((p) => p.points.length >= 2)
      .map((p) => {
        if (!(p.railDropM >= 0)) throw new RangeError(`EntityLayer.setTrackPaths: railDropM must be >= 0, got ${p.railDropM}`);
        const cursor = new PathCursor();
        cursor.extend(p.points);
        return { cursor, railDropM: p.railDropM };
      })
      .filter((p) => p.cursor.points.length >= 2);
  }

  // ---- preview, cutaway, highlight

  private ghostBox(id: string, s: StationEntity, color: number): void {
    const lv = stationLevels(s);
    const h = lv.roof - lv.floor;
    const box = new BoxGeometry(s.widthM, h, s.lengthM);
    box.translate(0, lv.floor + h / 2, 0);
    const group = new Group();
    const fill = new Mesh(box, new MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false }));
    fill.renderOrder = 21;
    const edges = new LineSegments(new EdgesGeometry(box), new LineBasicMaterial({ color, depthTest: false, transparent: true }));
    edges.renderOrder = 22;
    group.add(fill, edges);
    this.putOwned(id, group, { position: s.position, yaw: s.yaw });
  }

  private syncPreview(scene: EntityScene): void {
    const pv = scene.preview;
    const key = pv === null ? '' : this.previewKeyOf(pv, scene);
    if (key === this.previewKey) return;
    this.previewKey = key;
    for (const id of this.previewIds) {
      if (this.alignments.has(id)) this.removeAlignment(id);
      else this.release(id);
    }
    this.previewIds = [];
    this.previewErrors = 0;
    this.hasPreview = pv !== null;
    if (pv === null) return;
    const add = (id: string): string => {
      this.previewIds.push(id);
      return id;
    };
    switch (pv.kind) {
      case 'alignment': {
        this.putAlignment(add(`${ID}pv.al`), { ...pv.alignment, state: 'preview' });
        pv.stations.forEach((s, i) => {
          this.ghostBox(add(`${ID}pv.st${i}`), s, ENTITY_COLORS.station);
        });
        break;
      }
      case 'station':
        this.ghostBox(add(`${ID}pv.st`), pv.station, pv.valid ? ENTITY_COLORS.station : ENTITY_COLORS.error);
        if (!pv.valid) this.previewErrors++;
        break;
      case 'brush': {
        if (!(pv.radiusM > 0)) throw new RangeError(`EntityLayer.sync: brush radius must be > 0, got ${pv.radiusM}`);
        const seg: number[] = [];
        const N = 40;
        for (let axis = 0; axis < 3; axis++) {
          for (let i = 0; i < N; i++) {
            for (const j of [i, i + 1]) {
              const a = (j / N) * 2 * Math.PI;
              const u = Math.cos(a) * pv.radiusM;
              const v = Math.sin(a) * pv.radiusM;
              seg.push(
                pv.center.x + (axis === 0 ? 0 : u),
                pv.center.y + (axis === 1 ? 0 : axis === 0 ? u : v),
                pv.center.z + (axis === 2 ? 0 : v),
              );
            }
          }
        }
        this.overlay.setLineSegments(add(`${ID}pv.brush`), seg, {
          color: pv.valid ? ENTITY_COLORS.brush : ENTITY_COLORS.error,
          widthPx: 2,
          xray: true,
        });
        if (!pv.valid) this.previewErrors++;
        break;
      }
      case 'guidance':
        this.putGuidance(pv.guidance, scene, add);
        break;
    }
  }

  private previewKeyOf(pv: PreviewGeometry, scene: EntityScene): string {
    switch (pv.kind) {
      case 'alignment': {
        const a = pv.alignment;
        const st = pv.stations
          .map((s) => `${s.id}:${s.position.x},${s.position.y},${s.position.z},${s.yaw},${s.lengthM},${s.widthM},${s.heightM}`)
          .join(';');
        return `a|${a.id}|${a.rev}|${a.points.length}|${a.hoveredVertex ?? -1}|${a.selectedVertex ?? -1}|${st}`;
      }
      case 'station': {
        const s = pv.station;
        return `s|${s.position.x},${s.position.y},${s.position.z},${s.yaw},${s.lengthM},${s.widthM},${s.heightM},${s.style}|${pv.valid}`;
      }
      case 'brush':
        return `b|${pv.center.x},${pv.center.y},${pv.center.z}|${pv.radiusM}|${pv.valid}`;
      case 'guidance': {
        const g = pv.guidance;
        const first = g.path[0];
        const last = g.path[g.path.length - 1];
        const tbm = scene.tbms.find((t) => t.id === g.tbmId);
        const tick = g.ticks?.[0];
        return (
          `g|${g.tbmId}|${g.path.length}|${first?.x},${first?.y},${first?.z}|${last?.x},${last?.y},${last?.z}|` +
          `${g.ticks?.length ?? 0}|${tick?.x},${tick?.z}|` +
          `${g.nearest.x},${g.nearest.y},${g.nearest.z}|${g.deviationM > g.limitM}|${tbm?.position.x},${tbm?.position.y},${tbm?.position.z}`
        );
      }
    }
  }

  private putGuidance(g: GuidanceEntity, scene: EntityScene, add: (id: string) => string): void {
    const over = g.deviationM > g.limitM;
    if (over) this.previewErrors++;
    if (g.path.length >= 2) {
      this.overlay.setPolyline(add(`${ID}pv.g`), g.path, { color: ENTITY_COLORS.guidance, widthPx: 3, xray: true, dashM: 4 });
    }
    // Chainage marks across the plan: fixed in the ground, so they slide past the machine as it advances.
    const ticks = g.ticks;
    if (ticks !== undefined && ticks.length >= 2) {
      if (ticks.length % 2 !== 0) throw new RangeError(`EntityLayer.sync: guidance ticks come in pairs of points, got ${ticks.length}`);
      const seg: number[] = [];
      for (const p of ticks) seg.push(p.x, p.y, p.z);
      this.overlay.setLineSegments(add(`${ID}pv.gt`), seg, { color: ENTITY_COLORS.guidance, widthPx: 2, xray: true, opacity: 0.7 });
    }
    // The tie from the machine to the plan: green inside the corridor, red outside.
    const tbm = scene.tbms.find((t) => t.id === g.tbmId);
    if (tbm !== undefined && Math.hypot(tbm.position.x - g.nearest.x, tbm.position.y - g.nearest.y, tbm.position.z - g.nearest.z) > 0.05) {
      this.overlay.setPolyline(add(`${ID}pv.gd`), [tbm.position, g.nearest], {
        color: over ? ENTITY_COLORS.error : ENTITY_COLORS.guidance,
        widthPx: over ? 5 : 3,
        xray: true,
      });
    }
    this.overlay.setMarker(add(`${ID}pv.gn`), g.nearest, {
      color: over ? ENTITY_COLORS.error : ENTITY_COLORS.guidance,
      sizeM: 3,
      minPx: 14,
      xray: true,
    });
  }

  private syncCutaway(scene: EntityScene): void {
    const opt = this.options.cutaway;
    const tbm = opt === false || scene.possessedTbmId === null ? undefined : scene.tbms.find((t) => t.id === scene.possessedTbmId);
    // A heading with a machine kind opens the trench whatever its radius: an excavator's trench has none.
    const spec = tbm === undefined ? null : machineOf(tbm);
    const entry = tbm === undefined ? undefined : this.tbms.get(tbm.id);
    if (tbm === undefined || spec === null || entry === undefined || (spec.kind === null && !(tbm.radiusM > 1))) {
      if (this.ownsCutaway) this.overlay.setCutaway(null);
      this.ownsCutaway = false;
      return;
    }
    const o = opt === undefined || opt === false ? {} : opt;
    let reach = 0;
    for (const l of tbm.laterals) reach = Math.max(reach, Math.abs(l));
    this.overlay.setCutaway({
      position: tbm.position,
      yaw: tbm.yaw,
      // The ground is cut at the level of the machine axis, not under the invert: the bores show as two grooves
      // in a floor of solid ground, with the shields in them, the lined tunnel behind and uncut ground ahead of
      // the faces. Cut to the invert (as it was) the machines stood in an open pit and nothing said "tunnel".
      aheadM: o.aheadM ?? 28,
      // The whole machine and 34 m of lined tunnel behind it: 14 m for a roadheader, 95 m for a single bore.
      behindM: o.behindM ?? (spec.kind === null ? TBM_LENGTH_M : entry.lengthM) + 34,
      halfWidthM: reach + Math.max(tbm.radiusM, spec.diameterM / 2) + (o.sideM ?? 9),
      floorY: Math.floor(tbm.position.y - (o.floorBelowAxisM ?? 0)),
    });
    this.ownsCutaway = true;
  }

  /** Bounds of an entity as a yawed box: centre, yaw and half extents (x across, y up, z along). */
  private bounds(ref: EntityRef): { center: WorldPos; yaw: number; hx: number; hy: number; hz: number } | null {
    switch (ref.type) {
      case 'tbm': {
        const t = this.tbms.get(ref.id)?.e;
        if (t === undefined) return null;
        let reach = 0;
        for (const l of t.laterals) reach = Math.max(reach, Math.abs(l));
        const entry = this.tbms.get(ref.id) as TbmEntry;
        const r = entry.halfM;
        const len = entry.lengthM;
        return {
          center: { x: t.position.x - (Math.sin(t.yaw) * len) / 2, y: t.position.y, z: t.position.z - (Math.cos(t.yaw) * len) / 2 },
          yaw: t.yaw,
          hx: reach + r,
          hy: r,
          hz: len / 2,
        };
      }
      case 'train': {
        const t = this.trains.get(ref.id)?.e;
        if (t === undefined) return null;
        // Generous across and down: the cars sit on a track that may be offset from the reported centre line.
        return { center: t.position, yaw: t.yaw, hx: 1.8 + TRACK_HALF_SPACING_M * 3, hy: 4.2, hz: (t.cars * t.carLengthM) / 2 };
      }
      case 'station': {
        const s = this.stations.get(ref.id)?.e;
        if (s === undefined) return null;
        const lv = stationLevels(s);
        return {
          center: { x: s.position.x, y: s.position.y + (lv.floor + lv.roof) / 2, z: s.position.z },
          yaw: s.yaw,
          hx: s.widthM / 2,
          hy: (lv.roof - lv.floor) / 2,
          hz: s.lengthM / 2,
        };
      }
      case 'pit': {
        const p = this.pits.get(ref.id);
        if (p === undefined) return null;
        return {
          center: { x: p.e.position.x, y: p.e.position.y + p.depth / 2, z: p.e.position.z },
          yaw: p.e.yaw,
          hx: p.e.widthM / 2 + 1,
          hy: p.depth / 2,
          hz: p.e.lengthM / 2 + 1,
        };
      }
      default:
        return null;
    }
  }

  private syncHighlight(scene: EntityScene): void {
    const ref = scene.highlight;
    const b = ref === null ? null : this.bounds(ref);
    const key = b === null ? '' : `${b.center.x},${b.center.y},${b.center.z},${b.yaw},${b.hx},${b.hy},${b.hz}`;
    if (key === this.highlightKey) return;
    this.highlightKey = key;
    const id = `${ID}hl`;
    if (b === null) {
      this.overlay.remove(id);
      return;
    }
    this.outline(id, b.center, b.yaw, b.hx, -b.hy, b.hy, b.hz, ENTITY_COLORS.handleSelected, 3);
  }

  // ---------------------------------------------------------------- animation

  update(dtSeconds: number): void {
    if (!(dtSeconds >= 0) || !Number.isFinite(dtSeconds))
      throw new RangeError(`EntityLayer.update: dtSeconds must be finite and >= 0, got ${dtSeconds}`);
    if (dtSeconds === 0) return;
    this.clock += dtSeconds;
    let changed = false;
    for (const t of this.tbms.values()) {
      if (t.e.status !== 'running' || t.heads.length === 0) continue;
      // A third of a turn per second at full thrust, a slow idle turn at none.
      t.spin = (t.spin + dtSeconds * (0.35 + 1.75 * t.e.thrust)) % (2 * Math.PI);
      for (let i = 0; i < t.heads.length; i++) {
        const head = t.heads[i] as Mesh;
        // A digging arm lifts its bucket off the floor and lowers it again, once per turn of the same clock.
        if (t.motion === 'dig') head.rotation.x = -DIG_SWING * 0.5 * (1 - Math.cos(t.spin));
        else head.rotation.z = i % 2 === 0 ? t.spin : -t.spin;
      }
      changed = true;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i] as Pop;
      p.t += dtSeconds / POP_SECONDS;
      const k = Math.min(1, p.t);
      // Ease out with a small overshoot: the ring snaps into place.
      const scale = k >= 1 ? 1 : 0.5 + 0.5 * (1 - (1 - k) * (1 - k)) + 0.08 * Math.sin(k * Math.PI);
      frameMatrix(p.sample, p.lateral, p.batch.anchor, scale, this.matrix, 0);
      this.writeInstance(p.batch, p.index);
      if (k >= 1) this.pops.splice(i, 1);
      changed = true;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i] as Flash;
      f.t += dtSeconds / FLASH_SECONDS;
      if (f.t >= 1) {
        this.drop(f.id);
        this.overlay.setLight(f.id, null);
        this.flashes.splice(i, 1);
      } else {
        this.poseFlash(f);
      }
      changed = true;
    }
    if (changed) this.overlay.touch();
  }

  private poseFlash(f: Flash): void {
    const k = f.t;
    f.mesh.scale.setScalar(3 + 38 * (1 - (1 - k) * (1 - k)));
    (f.mesh.material as MeshBasicMaterial).opacity = 0.7 * (1 - k) * (1 - k);
    this.overlay.setLight(f.id, { position: f.at, radiusM: 90, color: 0xfff1c8, intensity: 3.2 * (1 - k) });
  }

  flash(at: WorldPos): void {
    if (!Number.isFinite(at.x + at.y + at.z))
      throw new RangeError(`EntityLayer.flash: position is not finite: (${at.x}, ${at.y}, ${at.z})`);
    const id = `${ID}flash.${this.flashSeq++}`;
    const material = new MeshBasicMaterial({
      color: 0xfff4d0,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(new IcosahedronGeometry(1, 1), material);
    mesh.renderOrder = 30;
    const f: Flash = { id, at: { x: at.x, y: at.y, z: at.z }, mesh, t: 0 };
    this.flashes.push(f);
    this.putOwned(id, mesh, { position: at });
    this.poseFlash(f);
  }

  // ---------------------------------------------------------------- queries

  anchor(ref: EntityRef): EntityPose | null {
    switch (ref.type) {
      case 'tbm': {
        const t = this.tbms.get(ref.id)?.e;
        return t === undefined ? null : { position: { ...t.position }, yaw: t.yaw, pitch: t.pitch };
      }
      case 'train': {
        const t = this.trains.get(ref.id)?.e;
        return t === undefined ? null : { position: { ...t.position }, yaw: t.yaw, pitch: t.pitch };
      }
      case 'station': {
        const s = this.stations.get(ref.id)?.e;
        return s === undefined ? null : { position: { ...s.position }, yaw: s.yaw, pitch: 0 };
      }
      case 'pit': {
        const p = this.pits.get(ref.id)?.e;
        return p === undefined ? null : { position: { ...p.position }, yaw: p.yaw, pitch: 0 };
      }
      case 'tunnel': {
        // The working end: where the lining and the machine are.
        const t = this.tunnels.get(ref.id);
        if (t === undefined || t.cursor.points.length < 2) return null;
        const s = t.cursor.sample(t.cursor.lengthM, createPathSample());
        return { position: { x: s.x, y: s.y, z: s.z }, yaw: yawOf(s.tx, s.tz), pitch: pitchOf(s.ty) };
      }
      default:
        // Alignments and projects have no single pose; the app frames them from their points.
        return null;
    }
  }

  pick(ray: { origin: WorldPos; dir: WorldPos }, maxDistanceM: number): EntityRef | null {
    const len = Math.hypot(ray.dir.x, ray.dir.y, ray.dir.z);
    if (!(Math.abs(len - 1) < 1e-3)) throw new RangeError(`EntityLayer.pick: ray direction must be a unit vector, its length is ${len}`);
    let best: EntityRef | null = null;
    let bestT = maxDistanceM;
    const test = (type: EntityRef['type'], ids: Iterable<string>): void => {
      for (const id of ids) {
        const b = this.bounds({ type, id });
        if (b === null) continue;
        const t = rayYawBox(ray.origin, ray.dir, b.center, b.yaw, b.hx, b.hy, b.hz);
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = { type, id };
        }
      }
    };
    // Machines and trains first: on a tie the moving thing inside a station box wins.
    test('tbm', this.tbms.keys());
    test('train', this.trains.keys());
    test('station', this.stations.keys());
    test('pit', this.pits.keys());
    return best;
  }

  stats(): EntityLayerStats {
    let rings = 0;
    let trackM = 0;
    for (const t of this.tunnels.values()) {
      rings += t.ringCount * Math.max(1, t.e.laterals.length);
      trackM += t.panelCount * TRACK_PANEL_M;
    }
    let errors = this.previewErrors;
    let alignments = 0;
    for (const [id, a] of this.alignments) {
      errors += a.errors;
      if (id.startsWith(`${ID}al.`)) alignments++;
    }
    return {
      tbms: this.tbms.size,
      tunnels: this.tunnels.size,
      rings,
      trackM,
      trains: this.trains.size,
      stations: this.stations.size,
      pits: this.pits.size,
      alignments,
      errorMarks: errors,
      preview: this.hasPreview,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    for (const id of this.tbms.keys()) {
      this.release(`${ID}tbm.${id}`);
      this.overlay.setLight(`${ID}tbm.${id}`, null);
    }
    for (const t of this.tunnels.values()) {
      for (const b of [...t.rings, ...t.track]) {
        this.release(b.id);
        b.lower.dispose();
        b.upper?.dispose();
      }
    }
    for (const id of this.stations.keys()) {
      this.release(`${ID}sta.${id}`);
      this.release(`${ID}sta.${id}.o`);
    }
    for (const id of this.pits.keys()) {
      this.release(`${ID}pit.${id}`);
      this.release(`${ID}pit.${id}.o`);
    }
    for (const id of this.trains.keys()) this.release(`${ID}train.${id}`);
    for (const id of [...this.alignments.keys()]) this.removeAlignment(id);
    for (const id of this.previewIds) this.release(id);
    for (const f of this.flashes) {
      this.release(f.id);
      this.overlay.setLight(f.id, null);
    }
    this.release(`${ID}ghost`);
    this.release(`${ID}hl`);
    if (this.ownsCutaway) this.overlay.setCutaway(null);
    for (const g of this.geometries.values()) g.dispose();
    this.geometries.clear();
    this.machines.clear();
    this.handleGeometry.dispose();
    this.material.dispose();
    this.tbms.clear();
    this.tunnels.clear();
    this.stations.clear();
    this.pits.clear();
    this.trains.clear();
    this.pops.length = 0;
    this.flashes.length = 0;
    this.previewIds = [];
  }
}

/**
 * Creates the entity layer on top of a renderer's overlay (VoxelRenderer.overlay). `options.groundAt` lets
 * station entrances and pit walls reach the street.
 */
export function createEntityLayer(overlay: OverlayLayer, options: EntityLayerOptions = {}): EntityLayer {
  return new Layer(overlay, options);
}
