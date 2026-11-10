/**
 * A headless player for tests and tools: plays a mission the way the app does, by following the snapshot's
 * next action and spending wall time through the clock contract (docs/CONTRACTS.md frame loop).
 * No rendering, no world unless the caller attaches one to the sim.
 */
import { type GameCommand, type GameSim, type GameSnapshot, SUBSTEPS_PER_DAY } from '@bayvox/sim';

export interface MissionRun {
  /** The mission reported complete. */
  complete: boolean;
  /** Real seconds the calendar ran at speed 1x (time held at gates and event cards is not counted). */
  seconds: number;
  /** Real seconds by clock mode. */
  secondsByMode: Record<'idle' | 'lapse' | 'build' | 'drive', number>;
  /** Longest time-lapse the player sat through inside one phase of the mission project, real seconds. */
  longestLapseSeconds: number;
  frames: number;
  /** Every feed item seen, in order. */
  feed: GameSnapshot['feed'];
}

export interface MissionOptions {
  /** Commands that draw the plan. Default: the one-click official alignment. */
  plan?: readonly GameCommand[];
  /** Called once per frame before time advances; returns extra commands (reforms, design, driving). */
  each?: (snapshot: GameSnapshot, sim: GameSim) => readonly GameCommand[] | undefined;
  /** Seconds of wall time per frame. Default 0.1. */
  frameSeconds?: number;
  /** Give up after this many real seconds of calendar time. Default 3600. */
  maxSeconds?: number;
}

/**
 * Plays the scenario of `sim` until the mission is complete: draws the plan, presses every button the next
 * action offers, takes the default option of every event card, and lets the clock run in between.
 */
export function playMission(sim: GameSim, opts: MissionOptions = {}): MissionRun {
  const dt = opts.frameSeconds ?? 0.1;
  const maxSeconds = opts.maxSeconds ?? 3600;
  sim.dispatch(opts.plan ?? [{ t: 'useOfficialPlan' }]);
  const run: MissionRun = {
    complete: false,
    seconds: 0,
    secondsByMode: { idle: 0, lapse: 0, build: 0, drive: 0 },
    longestLapseSeconds: 0,
    frames: 0,
    feed: [],
  };
  let seenSeq = 0;
  let acc = 0;
  let lapse = 0;
  let lapsePhase = '';
  // A frame budget far beyond any mission, so a stuck game fails instead of hanging.
  const maxFrames = Math.ceil(maxSeconds / dt) + 100_000;
  while (run.frames < maxFrames) {
    run.frames++;
    const snap = sim.snapshot();
    for (const item of snap.feed) {
      if (item.seq > seenSeq) {
        run.feed.push(item);
        seenSeq = item.seq;
      }
    }
    if (snap.mission.complete) {
      run.complete = true;
      break;
    }
    const commands: GameCommand[] = [...(opts.each?.(snap, sim) ?? [])];
    for (const e of snap.events) commands.push({ t: 'resolveEvent', eventId: e.uid, optionId: e.defaultOption });
    if (snap.nextAction.command) commands.push(snap.nextAction.command);
    if (commands.length > 0) sim.dispatch(commands);
    if (snap.clock.hold !== null || commands.some((c) => c.t !== 'tbmControl')) {
      lapse = 0;
      continue;
    }
    if (run.seconds >= maxSeconds) break;
    if (!(snap.clock.daysPerSecond > 0))
      throw new Error(
        `playMission: the clock stands in mode "${snap.clock.mode}" with nothing to press (${snap.nextAction.kind}: ${snap.nextAction.hint})`,
      );
    run.seconds += dt;
    run.secondsByMode[snap.clock.mode] += dt;
    const phase = snap.projects.find((p) => p.id === snap.mission.projectId)?.phase ?? '';
    if (phase !== lapsePhase) {
      lapsePhase = phase;
      lapse = 0;
    }
    if (snap.clock.mode === 'lapse') {
      lapse += dt;
      if (lapse > run.longestLapseSeconds) run.longestLapseSeconds = lapse;
    } else lapse = 0;
    acc += dt * snap.clock.daysPerSecond * SUBSTEPS_PER_DAY;
    while (acc >= SUBSTEPS_PER_DAY && sim.state.subTick === 0) {
      sim.step();
      acc -= SUBSTEPS_PER_DAY;
    }
    while (acc >= 1) {
      sim.substep();
      acc -= 1;
    }
  }
  return run;
}
