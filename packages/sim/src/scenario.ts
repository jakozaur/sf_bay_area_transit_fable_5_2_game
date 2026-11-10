/** Scenario validation and objective evaluation. */
import { isInGrid } from '@bayvox/core';
import { dateAtTick, dayMonthYear, isoToDays } from './dates.ts';
import { feederById } from './demand.ts';
import { parseCommand, projectSpentCents } from './engine.ts';
import { planDistance, pointAt } from './geometry.ts';
import { profileReforms, reformById } from './reforms.ts';
import { type GameSnapshot, type ObjectiveDef, PHASES, type ProjectState, type ScenarioDef, type SimState } from './types.ts';

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function cents(v: unknown): boolean {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

function isIso(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  try {
    isoToDays(v);
    return true;
  } catch {
    return false;
  }
}

/** Every problem with a scenario definition, one line each. Empty means valid. */
export function validateScenario(s: ScenarioDef): string[] {
  if (!s || typeof s !== 'object') return ['scenario: not an object'];
  const out: string[] = [];
  const bad = (why: string) => {
    out.push(`scenario "${s.id}": ${why}`);
  };
  if (typeof s.id !== 'string' || !/^[A-Za-z0-9-]+$/.test(s.id)) bad('id must be letters, digits and dashes');
  if (typeof s.title !== 'string' || s.title === '') bad('title is empty');
  if (typeof s.description !== 'string' || s.description === '') bad('description is empty');
  if (typeof s.siteId !== 'string' || !/^[a-z0-9-]+$/.test(s.siteId))
    bad('siteId must name a voxel site (lower-case letters, digits and dashes)');
  try {
    profileReforms(s.costProfile);
  } catch {
    bad(`costProfile "${s.costProfile}" is unknown`);
  }
  const st = s.start;
  if (!st || typeof st !== 'object') {
    bad('start is missing');
    return out;
  }
  if (!isIso(st.date)) bad(`start.date "${st.date}" is not an ISO date`);
  if (!cents(st.budgetCents)) bad(`start.budgetCents ${st.budgetCents} must be a non-negative integer`);
  if (!finite(st.politicalCapital) || st.politicalCapital < 0) bad(`start.politicalCapital ${st.politicalCapital} must be non-negative`);
  for (const id of [...(st.policies ?? []), ...(st.tech ?? [])]) if (!reformById(id)) bad(`start reform "${id}" does not exist`);
  for (const id of st.tech ?? []) {
    const def = reformById(id);
    if (def && def.branch !== 'tunnelling') bad(`start.tech "${id}" is not a tunnelling node`);
  }
  const fundingIds = new Set<string>();
  for (const f of st.funding ?? []) {
    if (fundingIds.has(f.id)) bad(`funding id "${f.id}" is used twice`);
    fundingIds.add(f.id);
    if (!cents(f.amountCents)) bad(`funding "${f.id}" amountCents ${f.amountCents} must be a non-negative integer`);
    if (f.release !== 'start' && !PHASES.includes(f.release)) bad(`funding "${f.id}" release "${f.release}" is not start or a phase`);
    if (typeof f.source !== 'string' || f.source === '') bad(`funding "${f.id}" has no source`);
  }
  if (st.headStart) {
    const h = st.headStart;
    if (!PHASES.includes(h.phase) || h.phase === 'construction' || h.phase === 'fitOut')
      bad(`headStart.phase "${h.phase}" must be a pre-construction phase`);
    if (!finite(h.progress) || h.progress < 0 || h.progress >= 1) bad(`headStart.progress ${h.progress} must be in [0, 1)`);
  }
  const cam = s.camera;
  if (!cam || ![cam.position?.x, cam.position?.y, cam.position?.z, cam.target?.x, cam.target?.y, cam.target?.z].every(finite)) {
    bad('camera needs a finite position and target');
  }
  for (const id of s.feeders ?? []) if (!feederById(id)) bad(`feeder "${id}" does not exist`);
  const objectiveIds = new Set<string>();
  for (const o of s.objectives ?? []) {
    if (objectiveIds.has(o.id)) bad(`objective id "${o.id}" is used twice`);
    objectiveIds.add(o.id);
    if (typeof o.title !== 'string' || o.title === '') bad(`objective "${o.id}" has no title`);
    switch (o.kind) {
      case 'connect':
        for (const end of [o.a, o.b]) {
          if (!end || !finite(end.x) || !finite(end.z) || !isInGrid(end.x, end.z))
            bad(`objective "${o.id}" has an end point outside the world grid`);
        }
        if (!finite(o.radiusM) || o.radiusM <= 0) bad(`objective "${o.id}" radiusM must be positive`);
        break;
      case 'maxCost':
        if (!cents(o.cents)) bad(`objective "${o.id}" cents must be a non-negative integer`);
        break;
      case 'openBy':
        if (!isIso(o.date)) bad(`objective "${o.id}" date "${o.date}" is not an ISO date`);
        break;
      case 'maxRatioToPoland':
        if (!finite(o.ratio) || o.ratio <= 0) bad(`objective "${o.id}" ratio must be positive`);
        break;
      case 'minRiders':
        if (!finite(o.riders) || o.riders <= 0) bad(`objective "${o.id}" riders must be positive`);
        break;
      default:
        bad(`objective "${(o as { id: string }).id}" has unknown kind "${(o as { kind: string }).kind}"`);
    }
  }
  if (!s.sandbox && !(s.objectives ?? []).some((o) => o.kind === 'connect')) bad('a campaign scenario needs a connect objective');
  if (s.reference) {
    const r = s.reference;
    if (!Array.isArray(r.commands) || r.commands.length === 0) bad('reference.commands is empty');
    for (const c of r.commands ?? []) {
      try {
        const cmd = parseCommand(c);
        if ('projectId' in cmd && cmd.projectId !== r.projectId)
          bad(`reference command ${cmd.t} targets "${cmd.projectId}", not "${r.projectId}"`);
      } catch (err) {
        bad(`reference command is malformed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (r.officialCostCents !== undefined && !cents(r.officialCostCents)) bad('reference.officialCostCents must be a non-negative integer');
    if (r.officialOpenDate !== undefined && !isIso(r.officialOpenDate))
      bad(`reference.officialOpenDate "${r.officialOpenDate}" is not an ISO date`);
    if (typeof r.source !== 'string' || r.source === '') bad('reference.source is empty');
  }
  return out;
}

function stationNear(project: ProjectState, x: number, z: number, radiusM: number): boolean {
  for (const s of project.stations) {
    const p = pointAt(project.waypoints, project.cum, s.chainageM);
    if (planDistance(p.x, p.z, x, z) <= radiusM) return true;
  }
  return false;
}

type ConnectObjective = Extract<ObjectiveDef, { kind: 'connect' }>;

function connects(project: ProjectState, o: ConnectObjective): boolean {
  return project.status === 'open' && stationNear(project, o.a.x, o.a.z, o.radiusM) && stationNear(project, o.b.x, o.b.z, o.radiusM);
}

function money(c: number): string {
  return c >= 1e11 ? `$${(c / 1e11).toFixed(2)}B` : `$${(c / 1e8).toFixed(0)}M`;
}

/** Objective status, derived from state alone. */
export function evaluateObjectives(state: SimState): GameSnapshot['objectives'] {
  const defs = state.scenario.objectives;
  const start = state.scenario.start.date;
  const today = dateAtTick(start, state.tick);
  const connectDefs = defs.filter((o): o is ConnectObjective => o.kind === 'connect');
  // The project that delivers the scenario: the first to satisfy a connect objective, else (sandbox) the first to open.
  const open = state.projects.filter((p) => p.status === 'open').sort((a, b) => a.openedTick - b.openedTick);
  const winner = open.find((p) => connectDefs.some((o) => connects(p, o))) ?? (connectDefs.length === 0 ? open[0] : undefined);
  let riders = 0;
  for (const p of open) riders += p.ridersPerDay;

  return defs.map((o) => {
    let status: 'pending' | 'done' | 'failed' = 'pending';
    let detail = '';
    switch (o.kind) {
      case 'connect': {
        const by = open.find((p) => connects(p, o));
        if (by) {
          status = 'done';
          detail = `${by.name} opened ${dayMonthYear(dateAtTick(start, by.openedTick))}`;
        } else detail = `needs an open line with stations within ${o.radiusM} m of ${o.a.name} and ${o.b.name}`;
        break;
      }
      case 'maxCost': {
        let spent = 0;
        if (winner) spent = projectSpentCents(winner);
        else for (const p of state.projects) spent += projectSpentCents(p);
        detail = `${money(spent)} of ${money(o.cents)}`;
        if (spent > o.cents) status = 'failed';
        else if (winner) status = 'done';
        break;
      }
      case 'openBy': {
        if (winner) {
          const opened = dateAtTick(start, winner.openedTick);
          status = opened <= o.date ? 'done' : 'failed';
          detail = `opened ${dayMonthYear(opened)}, target ${dayMonthYear(o.date)}`;
        } else {
          if (today > o.date) status = 'failed';
          detail = `target ${dayMonthYear(o.date)}`;
        }
        break;
      }
      case 'maxRatioToPoland': {
        // The target: the cost and the time of the line that delivers the mission, each against Poland on the same
        // route. The same two ratios as Scorecard.polandTarget.
        if (winner && winner.polandCostCents > 0 && winner.polandDays > 0) {
          const cost = projectSpentCents(winner) / winner.polandCostCents;
          const time = (winner.openedTick - winner.approvedTick) / winner.polandDays;
          status = cost <= o.ratio && time <= o.ratio ? 'done' : 'failed';
          detail = `cost ${cost.toFixed(1)}x Poland, time ${time.toFixed(1)}x, target ${o.ratio}x on both`;
        } else detail = `target ${o.ratio}x what Poland would have paid and taken`;
        break;
      }
      case 'minRiders': {
        detail = `${riders} of ${o.riders} riders per day`;
        if (riders >= o.riders) status = 'done';
        break;
      }
    }
    return { id: o.id, title: o.title, kind: o.kind, stretch: o.stretch === true, status, detail };
  });
}
