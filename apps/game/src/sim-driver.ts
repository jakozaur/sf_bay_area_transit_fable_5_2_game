/**
 * Runs the deterministic sim (packages/sim) from the app loop: queues and dispatches commands, turns wall
 * time into whole game days at the chosen speed, lets the sim carve the world store, and mirrors projects
 * (alignment, stations, headings) into the overlay layer.
 */
import type { Command, WorldPos, WorldStore } from '@bayvox/core';
import type { OverlayLayer } from '@bayvox/render';
import {
  createSim,
  type GameCommand,
  type GameSim,
  type GameSnapshot,
  type ProjectView,
  parseCommand,
  type ScenarioDef,
} from '@bayvox/sim';

/** Game days per real second at speed 1. Speeds 10 and 100 multiply it. */
export const DAYS_PER_SECOND = 2;
/** Most game days stepped in one frame, so a stalled tab cannot turn into one enormous frame. */
export const MAX_TICKS_PER_FRAME = 200;

const ALIGNMENT_COLOR = 0xff7043;
const STATION_COLOR = 0x1e88e5;
const HEADING_COLOR = 0xffca28;
const PREFIX = 'sim.';

export class SimDriver {
  readonly sim: GameSim;
  private readonly queue: GameCommand[] = [];
  private readonly groundAt: (x: number, z: number) => number;
  /** Fraction of a game day carried between frames. */
  private carry = 0;
  /** Bumped whenever the sim state may have changed; snapshots and overlays are keyed on it. */
  private revision = 0;
  private cached: { revision: number; snapshot: GameSnapshot } | null = null;
  private overlayRevision = -1;
  /** Overlay item ids currently shown, with the content key they were built from. */
  private readonly shown = new Map<string, string>();

  constructor(scenario: ScenarioDef, seed: number, world: WorldStore, groundAt: (x: number, z: number) => number) {
    this.sim = createSim(scenario, seed, world);
    this.groundAt = groundAt;
  }

  get tick(): number {
    return this.sim.state.tick;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Validates a command (a malformed one throws here, naming the problem) and queues it for the next frame. */
  command(c: Command): void {
    this.queue.push(parseCommand(c));
  }

  private flush(): void {
    if (this.queue.length === 0) return;
    this.sim.dispatch(this.queue.splice(0));
    this.revision++;
  }

  /** One frame: applies queued commands, then steps as many game days as `dtSeconds` buys at the sim's speed. */
  advance(dtSeconds: number): void {
    this.flush();
    const speed = this.sim.state.speed;
    if (speed === 0 || !(dtSeconds > 0)) return;
    this.carry += dtSeconds * DAYS_PER_SECOND * speed;
    const ticks = Math.min(MAX_TICKS_PER_FRAME, Math.floor(this.carry));
    // Time beyond the cap is dropped, not owed: the game slows down instead of spiralling.
    this.carry = Math.min(this.carry - ticks, 1);
    this.run(ticks);
  }

  /** Applies queued commands, then steps exactly `ticks` game days whatever the speed (tests, fast-forward). */
  step(ticks: number): void {
    if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError(`SimDriver.step: ticks must be a non-negative integer, got ${ticks}`);
    this.flush();
    this.run(ticks);
  }

  private run(ticks: number): void {
    if (ticks === 0) return;
    this.sim.run(ticks);
    this.revision++;
  }

  snapshot(): GameSnapshot {
    if (this.cached === null || this.cached.revision !== this.revision) {
      this.cached = { revision: this.revision, snapshot: this.sim.snapshot() };
    }
    return this.cached.snapshot;
  }

  /** Brings the overlay in line with the sim: one alignment line, station pins and heading markers per project. */
  syncOverlay(overlay: OverlayLayer): void {
    if (this.overlayRevision === this.revision) return;
    this.overlayRevision = this.revision;
    const wanted = new Set<string>();
    const put = (id: string, key: string, build: () => void): void => {
      wanted.add(id);
      if (this.shown.get(id) === key) return;
      build();
      this.shown.set(id, key);
    };
    for (const project of this.snapshot().projects) this.syncProject(overlay, project, put);
    for (const id of [...this.shown.keys()]) {
      if (wanted.has(id)) continue;
      overlay.remove(id);
      this.shown.delete(id);
    }
  }

  private syncProject(overlay: OverlayLayer, project: ProjectView, put: (id: string, key: string, build: () => void) => void): void {
    const base = `${PREFIX}${project.id}`;
    const points: WorldPos[] = project.waypoints.map((w) => ({ x: w.x, y: w.y, z: w.z }));
    if (points.length >= 2) {
      // Dashed while it is a plan, solid once it is being built.
      const planned = project.status === 'draft' || project.tbms.length === 0;
      put(`${base}.alignment`, `${planned}|${JSON.stringify(points)}`, () =>
        overlay.setPolyline(`${base}.alignment`, points, {
          color: ALIGNMENT_COLOR,
          widthPx: 3,
          xray: true,
          dashM: planned ? 12 : undefined,
        }),
      );
    }
    for (const s of project.stations) {
      const id = `${base}.station.${s.id}`;
      const position = { x: s.position.x, y: this.groundAt(s.position.x, s.position.z), z: s.position.z };
      put(id, JSON.stringify(position), () => overlay.setMarker(id, position, { color: STATION_COLOR, sizeM: 30, minPx: 26, xray: true }));
    }
    for (const t of project.tbms) {
      const id = `${base}.heading.${t.id}`;
      // Yaw along the alignment at the heading: local z is the direction of travel.
      const seg =
        project.segments.find((s) => t.chainageM >= s.fromM && t.chainageM <= s.toM) ?? project.segments[project.segments.length - 1];
      const a = seg === undefined ? undefined : project.waypoints[seg.index];
      const b = seg === undefined ? undefined : project.waypoints[seg.index + 1];
      const yaw = a !== undefined && b !== undefined ? Math.atan2(b.x - a.x, b.z - a.z) : 0;
      const pose = { position: { ...t.position }, yaw };
      put(id, JSON.stringify(pose), () => {
        if (overlay.has(id)) overlay.setPose(id, pose);
        else overlay.setShape(id, { kind: 'cylinder', radius: 3, length: 12, color: HEADING_COLOR }, pose);
      });
    }
  }
}
