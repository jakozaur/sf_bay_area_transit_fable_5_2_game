/**
 * How time is paced, as pure functions of the snapshot. The top bar (which buttons to show) and the app's frame
 * loop (how many game days a real second buys) both read it here, so the two cannot disagree.
 *
 * Two states. 'decision': no machine is boring; time stands until the player asks for the next decision, then
 * runs to the next gate or event card in about DECISION_RUN_SECONDS. 'bore': a machine is boring; Regular is
 * paced so the whole bore takes BORE_REGULAR_SECONDS, Faster is BORE_FASTER_FACTOR times that, Skip runs as fast
 * as the frame loop allows. The speeds of the TimePort keep their values: 1 Regular, 10 Faster, 100 Skip, 0 pause.
 */
import type { GameSpeed } from '@bayvox/core';
import type { GameSnapshot } from '@bayvox/sim';
import { missionProject } from './model.ts';

export type TimeMode = 'decision' | 'bore';

/** Real seconds a whole bore takes at Regular, launch to breakthrough, on any mission. */
export const BORE_REGULAR_SECONDS = 90;
export const BORE_FASTER_FACTOR = 4;
/** Real seconds one "Next decision" run is played over. */
export const DECISION_RUN_SECONDS = 1.5;
/** Game days a run covers when no phase is under way to say how far the next decision is (an open line). */
export const DECISION_RUN_DEFAULT_DAYS = 30;

export const SPEED_REGULAR: GameSpeed = 1;
export const SPEED_FASTER: GameSpeed = 10;
export const SPEED_SKIP: GameSpeed = 100;

const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** True while a machine is boring: a heading that is launched and has not broken through. */
export function isBoring(s: GameSnapshot): boolean {
  return s.projects.some((p) => p.tbms.some((t) => t.status !== 'done'));
}

export function timeMode(s: GameSnapshot): TimeMode {
  return isBoring(s) ? 'bore' : 'decision';
}

export interface BoreProgress {
  /** Expected game days of the whole bore, launch to breakthrough. */
  totalDays: number;
  /** Game days of it already done. */
  doneDays: number;
}

/**
 * The expected length of the active drive in game days and the days of it done (sim ProjectView.boreTotalDays
 * and boreDaysDone). Null before launch and on a line with no underground heading.
 */
export function boreProgress(s: GameSnapshot): BoreProgress | null {
  const project = missionProject(s);
  if (project === null || project.boreTbmId === null || !(project.boreTotalDays > 0)) return null;
  return { totalDays: project.boreTotalDays, doneDays: project.boreDaysDone };
}

/**
 * Game days per real second while a machine is boring. Infinity: as fast as the frame loop allows (it still
 * stops at an event card). A machine under the player's hand keeps the sim's drive pace as Regular: a bore
 * steered at 90 seconds a tunnel would not be steerable.
 */
export function boreDaysPerSecond(s: GameSnapshot, speed: GameSpeed): number {
  if (speed === 0) return 0;
  if (speed === SPEED_SKIP) return Number.POSITIVE_INFINITY;
  const bore = boreProgress(s);
  const regular = s.clock.mode === 'drive' || bore === null ? s.clock.daysPerSecond : bore.totalDays / BORE_REGULAR_SECONDS;
  return speed === SPEED_FASTER ? regular * BORE_FASTER_FACTOR : regular;
}

/**
 * Game days from now to the next gate of the mission project: what is left of the current phase, plus every
 * phase after it that starts by itself, up to and including the first one that ends at a gate. Null when no
 * phase is under way (a draft, an open line).
 */
export function daysToNextGate(s: GameSnapshot): number | null {
  const project = missionProject(s);
  if (project === null || project.status !== 'active') return null;
  const from = project.phases.findIndex((ph) => ph.state === 'current');
  if (from < 0) return null;
  let days = 0;
  for (const ph of project.phases.slice(from)) {
    days += ph.state === 'current' ? ph.daysLeft : (positive(ph.daysLeft) ?? ph.plannedDays);
    if (ph.gate !== null) break;
  }
  return days;
}

/**
 * Game days per real second of a "Next decision" run that starts now: the days to the next gate (the next
 * decision unless a card comes first), played over DECISION_RUN_SECONDS.
 */
export function decisionDaysPerSecond(s: GameSnapshot): number {
  const days = positive(daysToNextGate(s)) ?? DECISION_RUN_DEFAULT_DAYS;
  return Math.max(1, days) / DECISION_RUN_SECONDS;
}

/** Why "Next decision" cannot run now, or null when it can. */
export function nextDecisionBlocked(s: GameSnapshot): string | null {
  if (s.clock.hold === 'event') return 'Answer the card first.';
  if (s.clock.hold === 'gate') return 'Your move: the project waits at a gate.';
  if (s.clock.daysPerSecond <= 0) return 'Nothing is under way yet. Approve a project first.';
  return null;
}
