/**
 * World stamps: the structures the sim builds as voxels. A station box (also the destination box a machine
 * breaks through into) is a void lined with concrete: base slab, walls, roof slab, and a platform slab with
 * a track trough per tube. A launch pit is the same lined hole open to the sky.
 *
 * One rule makes a stamp independent of when it is applied relative to the tunnel carves: the void becomes
 * AIR, and concrete only replaces voxels that are not AIR. A tunnel bored through the box before or after
 * the stamp leaves the same voxels (the bore is air either way), and stamping twice changes nothing.
 * A stamp reads the world, so it is turned into one explicit setVoxels edit of the voxels that change; that
 * edit is what the store logs and replays after eviction.
 *
 * Frame: `position`, `yaw` and the box sizes are those of core StationEntity and LaunchPitEntity. Yaw is
 * counter-clockwise seen from above, 0 pointing +z; u runs along the track (sin yaw, cos yaw), v to the
 * left of travel (cos yaw, -sin yaw).
 */
import {
  type ChunkKey,
  type LaunchPitEntity,
  Material,
  type StationEntity,
  type StationStyle,
  type WorldEdit,
  type WorldPos,
} from '@bayvox/core';
import { MANUAL_EDIT_LAYER } from './chunk-store.ts';

const AIR = Material.AIR;
const CONCRETE = Material.CONCRETE_LINING;

/** Thickness of walls and slabs, voxels. */
const SHELL = 1;
/** Excavated radius assumed for the track trough when the caller does not say: half of a 6.6 m bore. */
export const DEFAULT_TRACK_RADIUS_M = 3.3;
/** Height a launch pit is cleared to above the ground around it, metres: whatever stood on the plot goes. */
export const PIT_CLEARANCE_M = 40;
/** Layer the stamps are recorded under in ChunkWorldStore. */
export const STAMP_EDIT_LAYER = 'stamps';
/** Station styles that are built in the ground as a box. The others (in-bore, surface, elevated) leave the voxels alone. */
export const BOX_STATION_STYLES: readonly StationStyle[] = ['compactBox', 'mezzanineBox', 'minedCavern', 'terminal'];

/** The tubes that pass through a box: where the troughs and the openings in the end walls go. */
export interface StampTracks {
  /** Excavated radius of one tube, metres. */
  radiusM: number;
  /** Lateral offset of each tube axis from the box axis, metres to the left of travel. */
  laterals: readonly number[];
}

export interface StationStampSpec {
  /** Centre of the platform level on the track axis: `y` is the elevation of the tunnel axis. */
  position: WorldPos;
  yaw: number;
  /** Outer box: along the track, across it, and from the platform floor up to the roof slab. */
  lengthM: number;
  widthM: number;
  heightM: number;
  tracks?: StampTracks;
}

export interface PitStampSpec {
  /** Pit floor centre on the heading axis. */
  position: WorldPos;
  yaw: number;
  lengthM: number;
  widthM: number;
  /** World y the pit is open up to: the ground around it plus clearance. */
  topM: number;
}

/** What a stamp needs from the world: reads, and edits recorded under a layer (ChunkWorldStore). */
export interface StampWorld {
  get(x: number, y: number, z: number): number;
  applyEdit(e: WorldEdit, layer?: string): ChunkKey[];
}

function assertBox(what: string, p: WorldPos, yaw: number, sizes: readonly number[]): void {
  if (!Number.isFinite(p.x + p.y + p.z + yaw))
    throw new RangeError(`${what}: position or yaw is not finite: (${p.x}, ${p.y}, ${p.z}), yaw ${yaw}`);
  for (const v of sizes)
    if (!(v > 0) || !Number.isFinite(v) || v > 2048)
      throw new RangeError(`${what}: box sizes must be in (0, 2048] m, got ${sizes.join(' x ')}`);
}

/**
 * Collects the voxels of a yawed box that change. `classify(u, v, y)` gets the voxel centre in the box
 * frame (u along, v left, metres from the reference point) and its voxel row y, and returns the wanted
 * material: AIR for void, CONCRETE for structure (applied only over non-AIR voxels), or -1 to leave it.
 */
function collect(
  world: StampWorld,
  position: WorldPos,
  yaw: number,
  halfU: number,
  halfV: number,
  y0: number,
  y1: number,
  classify: (u: number, v: number, y: number) => number,
): WorldEdit | null {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const reachX = Math.abs(sin) * halfU + Math.abs(cos) * halfV;
  const reachZ = Math.abs(cos) * halfU + Math.abs(sin) * halfV;
  const x0 = Math.floor(position.x - reachX) - 1;
  const x1 = Math.ceil(position.x + reachX) + 1;
  const z0 = Math.floor(position.z - reachZ) - 1;
  const z1 = Math.ceil(position.z + reachZ) + 1;
  const coords: number[] = [];
  const materials: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      const rz = z + 0.5 - position.z;
      for (let x = x0; x < x1; x++) {
        const rx = x + 0.5 - position.x;
        const u = rx * sin + rz * cos;
        const v = rx * cos - rz * sin;
        if (u < -halfU || u >= halfU || v < -halfV || v >= halfV) continue;
        const want = classify(u, v, y);
        if (want < 0) continue;
        const now = world.get(x, y, z);
        if (now === want || (want !== AIR && now === AIR)) continue;
        coords.push(x, y, z);
        materials.push(want);
      }
    }
  }
  return materials.length === 0 ? null : { t: 'setVoxels', coords: Int32Array.from(coords), materials: Uint16Array.from(materials) };
}

/** True when a voxel centre at lateral v and row y lies inside one of the tubes around the axis row `axisY`. */
function inTube(tracks: StampTracks, v: number, y: number, axisY: number): boolean {
  const dy = y - axisY;
  const r2 = tracks.radiusM * tracks.radiusM;
  for (const lateral of tracks.laterals) {
    const dv = v - lateral;
    if (dv * dv + dy * dy <= r2) return true;
  }
  return false;
}

function tracksOf(what: string, tracks: StampTracks | undefined): StampTracks {
  const t = tracks ?? { radiusM: DEFAULT_TRACK_RADIUS_M, laterals: [0] };
  if (!(t.radiusM > 0) || !Number.isFinite(t.radiusM) || t.laterals.some((l) => !Number.isFinite(l))) {
    throw new RangeError(
      `${what}: tracks need a radius > 0 and finite laterals, got radius ${t.radiusM}, laterals [${t.laterals.join(', ')}]`,
    );
  }
  return t;
}

/**
 * Stamps a station box and returns the dirty chunk keys (empty when nothing changed).
 * Rows, with a the voxel row of the tunnel axis and r the whole metres of the tube radius:
 *   a - r - 1                 base slab
 *   a - r .. a - 2            platform slab, with a trough of the tube width along every track
 *   a - 1 .. a - 2 + height   the hall (the platform top is the floor of row a - 1)
 *   a - 1 + height            roof slab
 * Walls are one voxel thick inside the outer box; the end walls stay open where a tube meets them.
 */
export function stampStationBox(world: StampWorld, spec: StationStampSpec, layer: string = STAMP_EDIT_LAYER): ChunkKey[] {
  assertBox('stampStationBox', spec.position, spec.yaw, [spec.lengthM, spec.widthM, spec.heightM]);
  const tracks = tracksOf('stampStationBox', spec.tracks);
  const axisY = Math.floor(spec.position.y);
  const r = Math.floor(tracks.radiusM);
  const halfU = spec.lengthM / 2;
  const halfV = spec.widthM / 2;
  const troughBottom = axisY - r;
  const platformTop = axisY - 1;
  const roof = platformTop + Math.max(1, Math.ceil(spec.heightM));
  const edit = collect(world, spec.position, spec.yaw, halfU, halfV, troughBottom - SHELL, roof + SHELL, (u, v, y) => {
    if (y < troughBottom || y >= roof) return CONCRETE;
    const endWall = u < -halfU + SHELL || u >= halfU - SHELL;
    if (endWall) return inTube(tracks, v, y, axisY) ? -1 : CONCRETE;
    if (v < -halfV + SHELL || v >= halfV - SHELL) return CONCRETE;
    if (y >= platformTop) return AIR;
    for (const lateral of tracks.laterals) if (Math.abs(v - lateral) <= tracks.radiusM) return AIR;
    return CONCRETE;
  });
  return edit === null ? [] : world.applyEdit(edit, layer);
}

/**
 * Stamps a launch pit: a hole from the floor up to `topM`, open to the sky, with a concrete floor slab and
 * walls wherever there is ground beside it. The machine bores out through a wall; the stamp leaves bored
 * voxels alone, so the order of stamp and bore does not matter.
 */
export function stampLaunchPit(world: StampWorld, spec: PitStampSpec, layer: string = STAMP_EDIT_LAYER): ChunkKey[] {
  assertBox('stampLaunchPit', spec.position, spec.yaw, [spec.lengthM, spec.widthM]);
  const floor = Math.floor(spec.position.y);
  const top = Math.ceil(spec.topM);
  if (!Number.isFinite(top) || top <= floor || top - floor > 512) {
    throw new RangeError(`stampLaunchPit: topM ${spec.topM} must be above the floor ${spec.position.y} by at most 512 m`);
  }
  const halfU = spec.lengthM / 2;
  const halfV = spec.widthM / 2;
  const edit = collect(world, spec.position, spec.yaw, halfU, halfV, floor - SHELL, top, (u, v, y) => {
    if (y < floor) return CONCRETE;
    const wall = u < -halfU + SHELL || u >= halfU - SHELL || v < -halfV + SHELL || v >= halfV - SHELL;
    return wall ? CONCRETE : AIR;
  });
  return edit === null ? [] : world.applyEdit(edit, layer);
}

/** A station record as the sim publishes it (core StationEntity; StationView extends it). */
export type StationRecord = Pick<StationEntity, 'id' | 'position' | 'yaw' | 'style' | 'lengthM' | 'widthM' | 'heightM' | 'progress'>;
/** A launch pit record as the sim publishes it (core LaunchPitEntity). */
export type PitRecord = Pick<LaunchPitEntity, 'id' | 'position' | 'yaw' | 'lengthM' | 'widthM' | 'state'>;

export interface StampRecords {
  stations: readonly StationRecord[];
  pits: readonly PitRecord[];
  /** Tubes through the stations of this set (the project's bore). Default: one tube of DEFAULT_TRACK_RADIUS_M on the axis. */
  tracks?: StampTracks;
}

export interface StampSyncWorld extends StampWorld {
  resetEdits(layer?: string): ChunkKey[];
}

/**
 * Keeps the stamps in the world in line with the sim's records. A station box is stamped once its
 * excavation has started (progress above 0) and a launch pit once it is ready. If a stamped record
 * moves, changes size or disappears, the whole stamp layer is removed and the current records are
 * stamped again; the other layers (hand digs, sim carves) are untouched by that.
 */
export class WorldStamps {
  private readonly world: StampSyncWorld;
  private readonly groundAt: (x: number, z: number) => number;
  private readonly layer: string;
  /** Record id to the geometry it was stamped with. */
  private readonly stamped = new Map<string, string>();

  /** `groundAt` gives the ground elevation at a plan position, for the rim of a launch pit. */
  constructor(world: StampSyncWorld, groundAt: (x: number, z: number) => number, layer: string = STAMP_EDIT_LAYER) {
    if (layer === MANUAL_EDIT_LAYER)
      throw new RangeError('WorldStamps: stamps must not share the manual edit layer, a save would store them');
    this.world = world;
    this.groundAt = groundAt;
    this.layer = layer;
  }

  /** Number of records stamped. */
  get count(): number {
    return this.stamped.size;
  }

  /** Call after the world lost its edits (ChunkWorldStore.setSource or resetEdits of every layer): nothing is stamped any more. */
  forget(): void {
    this.stamped.clear();
  }

  /** Brings the world in line with the records. Returns the number of stamps applied by this call. */
  sync(records: StampRecords): number {
    const wanted = new Map<string, { key: string; apply: () => void }>();
    for (const s of records.stations) {
      if (!(s.progress > 0) || !BOX_STATION_STYLES.includes(s.style)) continue;
      const spec: StationStampSpec = {
        position: s.position,
        yaw: s.yaw,
        lengthM: s.lengthM,
        widthM: s.widthM,
        heightM: s.heightM,
        tracks: records.tracks,
      };
      wanted.set(`station.${s.id}`, { key: JSON.stringify(spec), apply: () => void stampStationBox(this.world, spec, this.layer) });
    }
    for (const p of records.pits) {
      if (p.state === 'planned') continue;
      const base = { position: p.position, yaw: p.yaw, lengthM: p.lengthM, widthM: p.widthM };
      wanted.set(`pit.${p.id}`, {
        key: JSON.stringify(base),
        apply: () => void stampLaunchPit(this.world, { ...base, topM: this.rimM(p) + PIT_CLEARANCE_M }, this.layer),
      });
    }
    let stale = false;
    for (const [id, key] of this.stamped) if (wanted.get(id)?.key !== key) stale = true;
    if (stale) {
      this.world.resetEdits(this.layer);
      this.stamped.clear();
    }
    let applied = 0;
    for (const [id, w] of wanted) {
      if (this.stamped.has(id)) continue;
      w.apply();
      this.stamped.set(id, w.key);
      applied++;
    }
    return applied;
  }

  /** Highest ground under the pit's centre and corners. */
  private rimM(p: PitRecord): number {
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    let rim = this.groundAt(p.position.x, p.position.z);
    for (const su of [-0.5, 0.5]) {
      for (const sv of [-0.5, 0.5]) {
        const u = su * p.lengthM;
        const v = sv * p.widthM;
        rim = Math.max(rim, this.groundAt(p.position.x + u * sin + v * cos, p.position.z + u * cos - v * sin));
      }
    }
    if (!Number.isFinite(rim))
      throw new RangeError(`WorldStamps: no ground elevation for launch pit ${p.id} at (${p.position.x}, ${p.position.z})`);
    return rim;
  }
}
