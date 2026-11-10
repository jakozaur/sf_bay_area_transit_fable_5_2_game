import { expect, test } from 'vitest';
import {
  BORE_FASTER_FACTOR,
  BORE_REGULAR_SECONDS,
  boreDaysPerSecond,
  boreProgress,
  DECISION_RUN_DEFAULT_DAYS,
  DECISION_RUN_SECONDS,
  daysToNextGate,
  decisionDaysPerSecond,
  isBoring,
  nextDecisionBlocked,
  timeMode,
} from './pace.ts';
import { SCENES } from './testing/index.ts';

const build = SCENES.build.snapshot;
const approvals = SCENES.approvals.snapshot;

test('time is in the bore state while a machine has not broken through, else it waits for decisions', () => {
  expect(timeMode(SCENES['plan-empty'].snapshot)).toBe('decision');
  expect(timeMode(approvals)).toBe('decision');
  expect(timeMode(build)).toBe('bore');
  const p = build.projects[0];
  if (p === undefined) throw new Error('the build fixture has no project');
  const through = { ...build, projects: [{ ...p, tbms: p.tbms.map((t) => ({ ...t, status: 'done' as const })) }] };
  expect(isBoring(through)).toBe(false);
});

test('Regular plays the whole bore in 90 seconds, Faster is four times that, Skip has no limit, pause stands', () => {
  expect(boreProgress(build)).toEqual({ totalDays: 240, doneDays: 98 });
  expect(boreDaysPerSecond(build, 1) * BORE_REGULAR_SECONDS).toBeCloseTo(240, 9);
  expect(boreDaysPerSecond(build, 10)).toBeCloseTo((240 / BORE_REGULAR_SECONDS) * BORE_FASTER_FACTOR, 9);
  expect(boreDaysPerSecond(build, 100)).toBe(Number.POSITIVE_INFINITY);
  expect(boreDaysPerSecond(build, 0)).toBe(0);
  // A machine under the player's hand keeps the sim's drive pace.
  const drive = SCENES.drive.snapshot;
  expect(drive.clock.mode).toBe('drive');
  expect(boreDaysPerSecond(drive, 1)).toBe(drive.clock.daysPerSecond);
  expect(boreDaysPerSecond(drive, 10)).toBe(drive.clock.daysPerSecond * BORE_FASTER_FACTOR);
});

test('the bore length is the active drive of the mission project; none before launch', () => {
  const p = build.projects[0];
  if (p === undefined) throw new Error('the build fixture has no project');
  expect(boreProgress({ ...build, projects: [{ ...p, boreTbmId: null, boreTotalDays: 0, boreDaysDone: 0 }] })).toBeNull();
  expect(boreProgress(approvals)).toBeNull();
  // Without a bore length Regular is the sim's own pace.
  const bare = { ...build, projects: [{ ...p, boreTbmId: null, boreTotalDays: 0, boreDaysDone: 0 }] };
  expect(boreDaysPerSecond(bare, 1)).toBe(build.clock.daysPerSecond);
});

test('a "Next decision" run covers the days to the next gate in a second and a half', () => {
  const phases = approvals.projects[0]?.phases ?? [];
  const current = phases.find((ph) => ph.state === 'current');
  expect(current?.id).toBe('permitting');
  // Permitting ends at the tender gate: the run is what is left of it.
  expect(current?.gate).not.toBeNull();
  expect(daysToNextGate(approvals)).toBe(current?.daysLeft);
  expect(decisionDaysPerSecond(approvals) * DECISION_RUN_SECONDS).toBeCloseTo(current?.daysLeft ?? 0, 9);
  // A phase that hands over by itself is run through: the days of the phases up to the next gate add up.
  const p = approvals.projects[0];
  if (p === undefined || current === undefined) throw new Error('the approvals fixture has no current phase');
  const at = p.phases.indexOf(current);
  const next = p.phases[at + 1];
  if (next === undefined) throw new Error('the approvals fixture has no phase after permitting');
  const chained = p.phases.map((ph, i) => (i === at ? { ...ph, gate: null } : i === at + 1 ? { ...ph, gate: current.gate } : ph));
  expect(daysToNextGate({ ...approvals, projects: [{ ...p, phases: chained }] })).toBe(current.daysLeft + next.plannedDays);
  // No phase under way: a month.
  const empty = SCENES['plan-empty'].snapshot;
  expect(daysToNextGate(empty)).toBeNull();
  expect(decisionDaysPerSecond(empty) * DECISION_RUN_SECONDS).toBeCloseTo(DECISION_RUN_DEFAULT_DAYS, 9);
});

test('"Next decision" says why it cannot run: a card, a gate, nothing under way', () => {
  expect(nextDecisionBlocked({ ...approvals, clock: { ...approvals.clock, daysPerSecond: 20 } })).toBeNull();
  expect(nextDecisionBlocked(SCENES.event.snapshot)).toMatch(/card/);
  expect(nextDecisionBlocked(SCENES['gate-card'].snapshot)).toMatch(/gate/);
  expect(nextDecisionBlocked({ ...approvals, clock: { ...approvals.clock, hold: null, daysPerSecond: 0 } })).toMatch(/Approve/);
});
