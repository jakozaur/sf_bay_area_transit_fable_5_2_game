/**
 * Runs the deterministic sim (packages/sim) from the app loop, per the frame loop of docs/CONTRACTS.md:
 * queues and dispatches commands, turns wall time into game days and drive sub-steps at the pace the sim's
 * clock asks for, stops at event cards and gates, and publishes the snapshot. The sim itself is replaceable
 * (a mission start, a restart, a load); everything else holds on to the driver.
 */
import type { Command } from '@bayvox/core';
import { type ClockView, type GameCommand, type GameSim, type GameSnapshot, parseCommand, SUBSTEPS_PER_DAY } from '@bayvox/sim';
import { Cell } from './cell.ts';

/** Most game days stepped in one frame, so a slow frame at 100x cannot turn into one enormous frame. Excess time is dropped. */
export const MAX_DAYS_PER_FRAME = 200;
/** The snapshot reaches subscribers (the UI) at most this often while time runs; commands and holds publish at once. */
export const PUBLISH_INTERVAL_S = 0.1;

export class SimDriver {
  private current: GameSim;
  private readonly queue: GameCommand[] = [];
  /** Sub-steps of wall time bought and not yet run. */
  private acc = 0;
  /** Bumped whenever the sim state may have changed. */
  private revision = 0;
  private cachedRevision = -1;
  private cached: GameSnapshot;
  private readonly cell: Cell<GameSnapshot>;
  private sincePublish = 0;
  private publishedRevision = -1;

  constructor(sim: GameSim) {
    this.current = sim;
    this.cached = sim.snapshot();
    this.cachedRevision = 0;
    this.cell = new Cell(this.cached);
    this.publishedRevision = 0;
  }

  get sim(): GameSim {
    return this.current;
  }

  get tick(): number {
    return this.current.state.tick;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** The snapshot as a Readable: what GameServices.sim.snapshot hands to the UI and the tools. */
  get readable(): Cell<GameSnapshot> {
    return this.cell;
  }

  /** Replaces the sim (mission start, restart, load). Queued commands and bought time belonged to the old one and are dropped. */
  attach(sim: GameSim): void {
    this.current = sim;
    this.queue.length = 0;
    this.acc = 0;
    this.revision++;
    this.publish();
  }

  /** Validates a command (a malformed one throws here, naming the problem) and queues it for the next frame. */
  command(c: Command): void {
    this.queue.push(parseCommand(c));
  }

  private flush(): boolean {
    if (this.queue.length === 0) return false;
    this.current.dispatch(this.queue.splice(0));
    this.revision++;
    return true;
  }

  /**
   * One frame: applies queued commands, then spends `dtSeconds` of wall time at `speed` (0, 1, 10, 100) times
   * the pace of the sim's clock. Time does not move while the clock holds for an event card or a gate.
   */
  advance(dtSeconds: number, speed: number): void {
    const flushed = this.flush();
    const sim = this.current;
    let clock = sim.clock();
    let ran = false;
    if (speed > 0 && dtSeconds > 0 && clock.hold === null && clock.daysPerSecond > 0) {
      this.acc += dtSeconds * speed * clock.daysPerSecond * SUBSTEPS_PER_DAY;
      const budget = MAX_DAYS_PER_FRAME * SUBSTEPS_PER_DAY;
      // Time beyond the cap is dropped, not owed: the game slows down instead of spiralling.
      if (this.acc > budget) this.acc = budget;
      const mode = clock.mode;
      while (this.acc >= 1) {
        if (this.acc >= SUBSTEPS_PER_DAY && sim.state.subTick === 0) {
          sim.step();
          this.acc -= SUBSTEPS_PER_DAY;
        } else {
          sim.substep();
          this.acc -= 1;
        }
        ran = true;
        // A card, a gate or another pace (a machine launched, a phase ended): the rest of the frame's time is not owed.
        if (sim.state.subTick === 0 || mode === 'drive') {
          clock = sim.clock();
          if (clock.hold !== null || clock.mode !== mode) {
            this.acc = 0;
            break;
          }
        }
      }
    } else if (clock.hold !== null || speed === 0) {
      this.acc = Math.min(this.acc, SUBSTEPS_PER_DAY - 1);
    }
    if (ran) this.revision++;
    this.sincePublish += dtSeconds;
    if (this.publishedRevision !== this.revision && (flushed || clock.hold !== null || this.sincePublish >= PUBLISH_INTERVAL_S))
      this.publish();
  }

  /** Applies queued commands, then steps exactly `ticks` game days whatever the speed and the clock (tests, fast-forward). */
  step(ticks: number): void {
    if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError(`SimDriver.step: ticks must be a non-negative integer, got ${ticks}`);
    this.flush();
    if (ticks > 0) {
      this.current.run(ticks);
      this.revision++;
    }
    this.publish();
  }

  /** Applies queued commands, then advances exactly `substeps` drive sub-steps. */
  stepSubsteps(substeps: number): void {
    if (!Number.isInteger(substeps) || substeps < 0)
      throw new RangeError(`SimDriver.stepSubsteps: substeps must be a non-negative integer, got ${substeps}`);
    this.flush();
    for (let i = 0; i < substeps; i++) this.current.substep();
    if (substeps > 0) this.revision++;
    this.publish();
  }

  /** Snapshot of the state as it is now (built at most once per change). The Readable may lag it by PUBLISH_INTERVAL_S. */
  snapshot(): GameSnapshot {
    if (this.cachedRevision !== this.revision) {
      this.cached = this.current.snapshot();
      this.cachedRevision = this.revision;
    }
    return this.cached;
  }

  clock(): ClockView {
    return this.current.clock();
  }

  /**
   * Share of the current game day already bought, 0..1: where between the pose of the last day boundary and the
   * pose now a heading of the planned regime is drawn (docs/CONTRACTS.md decision 2).
   */
  dayAlpha(): number {
    return Math.min(1, (this.current.state.subTick + this.acc) / SUBSTEPS_PER_DAY);
  }

  /** Hands the current snapshot to subscribers now. */
  publish(): void {
    this.sincePublish = 0;
    this.publishedRevision = this.revision;
    this.cell.set(this.snapshot());
  }
}
