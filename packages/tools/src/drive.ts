/** Drive tool ('drive'): possession of one heading. The contract is DriveTool in ./contract.ts. */
import {
  type GuidanceEntity,
  type PreviewGeometry,
  TOOL_COMMANDS,
  TOOL_KEYS,
  type ToolAction,
  type ToolOptionValue,
  type ToolOptionValues,
  type ToolReadout,
  type ToolStatus,
  type WorldPos,
} from '@bayvox/core';
import { type BayToolContext, chainages, type GameCommand, isDrivable, type ProjectView, pointAt, type TbmView } from '@bayvox/sim';
import type { DriveTool } from './contract.ts';
import { clamp } from './util.ts';

export const DRIVE_TUNING = {
  /** W and S move the thrust lever by this much (docs/CONTRACTS.md decision 4: quarter steps). */
  thrustStep: 0.25,
  /** The guidance line starts this far behind the cutterhead, metres. */
  guidanceBehindM: 20,
} as const;

const STOP_REASONS: Record<NonNullable<TbmView['stopReason']>, string> = {
  breakdown: 'Broken down',
  event: 'Waiting on a decision',
  projectDelay: 'Project on hold',
  zeroThrust: 'Thrust is zero: press W',
  corridor: 'At the edge of the corridor: steer back to the line',
};

export function createDriveToolImpl(): DriveTool {
  const T = DRIVE_TUNING;
  let headingId: string | null = null;
  let thrust = 0;
  let steer = 0;
  let pitch = 0;
  let autopilot = false;
  let close = false;
  let queue: GameCommand[] = [];
  let previewCache: PreviewGeometry | null = null;
  let previewKey = '';
  let view: TbmView | null = null;
  let choices: { value: string; label: string; disabledReason?: string }[] = [];
  let ended = '';

  function headings(ctx: BayToolContext): { project: ProjectView; tbm: TbmView }[] {
    const out: { project: ProjectView; tbm: TbmView }[] = [];
    const mission = ctx.snapshot.mission.projectId;
    // The mission project's machines come first, so the default possession is the one the objective is about.
    const projects = [...ctx.snapshot.projects].sort((a, b) => Number(b.id === mission) - Number(a.id === mission));
    // Only machines that bore or mine a tube take a driver: a cut-and-cover front or a track gang has no controls.
    for (const project of projects) for (const tbm of project.tbms) if (isDrivable(tbm.method)) out.push({ project, tbm });
    return out;
  }

  function find(ctx: BayToolContext, id: string | null): { project: ProjectView; tbm: TbmView } | undefined {
    return id === null ? undefined : headings(ctx).find((h) => h.tbm.id === id);
  }

  function possess(ctx: BayToolContext, id: string): void {
    const h = find(ctx, id);
    if (h === undefined) {
      throw new RangeError(
        `drive tool: no heading ${id} (have: ${
          headings(ctx)
            .map((o) => o.tbm.id)
            .join(', ') || 'none'
        })`,
      );
    }
    if (h.tbm.status === 'done') throw new Error(`drive tool: ${h.tbm.name} has broken through and cannot be driven`);
    headingId = id;
    // The lever starts where the machine is, rounded to the lever's steps, so taking over changes nothing by itself.
    thrust = clamp(Math.round(h.tbm.thrust / T.thrustStep) * T.thrustStep, 0, 1);
    steer = 0;
    pitch = 0;
    autopilot = false;
    ended = '';
    queue.push({ t: 'tbmControl', headingId: id, autopilot: false });
    ctx.services.camera.follow({ entity: { type: 'tbm', id }, mode: 'cutaway' });
  }

  /** Hands the machine back to the cruise law and lets go of the camera. Safe to call twice. */
  function release(ctx: BayToolContext): void {
    if (headingId === null) return;
    const h = find(ctx, headingId);
    if (h !== undefined && h.tbm.status !== 'done') queue.push({ t: 'tbmControl', headingId, autopilot: true });
    headingId = null;
    ctx.services.camera.follow(null);
  }

  function refresh(ctx: BayToolContext): void {
    choices = headings(ctx).map(({ tbm }) => ({
      value: tbm.id,
      label: tbm.name,
      ...(tbm.status === 'done' ? { disabledReason: 'Broke through' } : {}),
    }));
    const h = find(ctx, headingId);
    view = h?.tbm ?? null;
    if (headingId !== null && (h === undefined || h.tbm.status === 'done')) {
      // Breakthrough, or the heading is gone (restart, load): possession ends by itself.
      ended = h === undefined ? 'The machine is gone.' : `${h.tbm.name} broke through.`;
      release(ctx);
      close = true;
    }
    if (h === undefined || headingId === null) {
      previewCache = null;
      previewKey = '';
      return;
    }
    const { project, tbm } = h;
    const dev = tbm.deviation;
    const key = `${tbm.id}|${Math.round(dev.planChainageM)}|${dev.totalM.toFixed(1)}|${dev.limitM}|${project.alignment.rev}`;
    if (key === previewKey) return;
    previewKey = key;
    const wps = project.waypoints;
    if (wps.length < 2) {
      previewCache = null;
      return;
    }
    const cum = chainages(wps);
    const from = clamp(dev.planChainageM - T.guidanceBehindM, tbm.fromM, tbm.toM);
    const path: WorldPos[] = [pointAt(wps, cum, from)];
    for (let i = 1; i + 1 < wps.length; i++) {
      if (cum[i] > from && cum[i] < tbm.toM) path.push({ x: wps[i].x, y: wps[i].y, z: wps[i].z });
    }
    if (tbm.toM > from) path.push(pointAt(wps, cum, tbm.toM));
    const guidance: GuidanceEntity = {
      tbmId: tbm.id,
      path,
      nearest: pointAt(wps, cum, clamp(dev.planChainageM, 0, cum[cum.length - 1])),
      deviationM: dev.totalM,
      limitM: dev.limitM,
    };
    previewCache = { kind: 'guidance', guidance };
  }

  function control(fields: { thrust?: number; steer?: number; pitch?: number; autopilot?: boolean }): void {
    if (headingId === null) return;
    queue.push({ t: 'tbmControl', headingId, ...fields });
  }

  function status(): ToolStatus {
    const readouts: ToolReadout[] = [];
    if (view !== null) {
      const t = view;
      readouts.push(
        { id: 'machine', label: 'Machine', value: t.name, bad: false },
        { id: 'mode', label: 'Control', value: autopilot ? 'Autopilot' : 'Manual', bad: false },
        { id: 'thrust', label: 'Thrust', value: `${Math.round(thrust * 100)}%`, bad: false },
        {
          id: 'rate',
          label: 'Advance',
          value: `${t.rateMPerDay.toFixed(1)} m/day (max ${t.maxRateMPerDay.toFixed(1)} here)`,
          bad: t.status === 'stopped',
        },
        { id: 'ground', label: 'Ground', value: t.geologyLabel, bad: false },
        {
          id: 'grade',
          label: 'Grade',
          value: `${t.gradePct.toFixed(1)}% (max ${t.limits.maxGradePct})`,
          bad: t.limits.maxGradePct > 0 && Math.abs(t.gradePct) > t.limits.maxGradePct + 1e-9,
        },
        {
          id: 'deviation',
          label: 'Off the plan',
          value: `${t.deviation.totalM.toFixed(1)} m (corridor ${t.deviation.limitM} m)`,
          bad: t.deviation.offPlan,
        },
        { id: 'progress', label: 'Bored', value: `${Math.round(t.boredM)} m of ${Math.round(t.toM - t.fromM)} m`, bad: false },
      );
      if (t.stopReason !== null) {
        const days = t.downDays > 0 ? `, ${t.downDays} days` : '';
        readouts.push({ id: 'stopped', label: 'Stopped', value: `${STOP_REASONS[t.stopReason]}${days}`, bad: true });
      }
    }
    const hint =
      headingId === null
        ? ended
        : autopilot
          ? 'Autopilot cruises along the plan. Space takes the controls back. Esc releases the machine.'
          : view?.deviation.offPlan === true
            ? 'Off the plan: every metre here costs more. Steer back to the green line.'
            : 'W S thrust, A D steer, R F pitch, Space autopilot, Esc release.';
    return {
      id: 'drive',
      hint,
      readouts,
      options: choices.length > 0 ? [{ key: TOOL_KEYS.driveHeadingId, label: 'Machine', kind: 'choice', choices }] : [],
      values: headingId === null ? {} : { [TOOL_KEYS.driveHeadingId]: headingId },
      commands: [{ id: TOOL_COMMANDS.driveRelease, label: 'Release the machine', enabled: headingId !== null }],
    };
  }

  function headingOption(value: ToolOptionValue | undefined): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string')
      throw new RangeError(`drive tool: ${TOOL_KEYS.driveHeadingId} must be a heading id, got ${String(value)}`);
    return value;
  }

  return {
    id: 'drive',

    unavailableReason(ctx: BayToolContext): string | null {
      const all = headings(ctx);
      if (all.length === 0) {
        const any = ctx.snapshot.projects.some((p) => p.tbms.length > 0);
        return any ? 'Nothing to drive: this line has no boring machine and no mined heading' : 'No machine to drive yet';
      }
      if (all.every((h) => h.tbm.status === 'done')) return 'Every machine has broken through';
      return null;
    },

    activate(ctx: BayToolContext, options?: ToolOptionValues): void {
      queue = [];
      close = false;
      previewCache = null;
      previewKey = '';
      headingId = null;
      for (const key of Object.keys(options ?? {})) {
        if (key !== TOOL_KEYS.driveHeadingId) throw new RangeError(`drive tool: unknown option ${key}`);
      }
      const all = headings(ctx).filter((h) => h.tbm.status !== 'done');
      const wanted = headingOption(options?.[TOOL_KEYS.driveHeadingId]) ?? (all.find((h) => h.tbm.status === 'running') ?? all[0])?.tbm.id;
      if (wanted === undefined) throw new Error('drive tool: no machine to drive yet');
      possess(ctx, wanted);
      refresh(ctx);
    },

    deactivate(ctx: BayToolContext): void {
      release(ctx);
      previewCache = null;
      previewKey = '';
      view = null;
      close = false;
    },

    onAction(a: ToolAction, ctx: BayToolContext): boolean {
      refresh(ctx);
      if (headingId === null) return false;
      let consumed = true;
      switch (a.type) {
        case 'drive.thrust': {
          const next = clamp(thrust + a.delta * T.thrustStep, 0, 1);
          // The lever takes the controls back from the autopilot, as on a cruise control.
          if (next !== thrust || autopilot) {
            thrust = next;
            control(autopilot ? { thrust, steer, pitch, autopilot: false } : { thrust });
            autopilot = false;
          }
          break;
        }
        case 'drive.axes': {
          if (a.steer === steer && a.pitch === pitch) break;
          steer = a.steer;
          pitch = a.pitch;
          // Letting go of a key under autopilot is not a takeover; pressing one is.
          if (autopilot && steer === 0 && pitch === 0) break;
          control(autopilot ? { thrust, steer, pitch, autopilot: false } : { steer, pitch });
          autopilot = false;
          break;
        }
        case 'drive.autopilot':
          autopilot = !autopilot;
          control(autopilot ? { autopilot: true } : { thrust, steer, pitch, autopilot: false });
          break;
        case 'tool.cancel':
          release(ctx);
          close = true;
          break;
        default:
          consumed = false;
          break;
      }
      refresh(ctx);
      return consumed;
    },

    update(_dtSeconds: number, ctx: BayToolContext): void {
      refresh(ctx);
    },

    preview(): PreviewGeometry | null {
      return previewCache;
    },

    commit(): GameCommand[] {
      const out = queue;
      queue = [];
      return out;
    },

    status,

    setOption(key: string, value: ToolOptionValue, ctx: BayToolContext): void {
      if (key !== TOOL_KEYS.driveHeadingId) throw new RangeError(`drive tool: unknown option ${key}`);
      const id = headingOption(value);
      if (id === undefined || id === headingId) return;
      // Validate before letting go of the current machine.
      const h = find(ctx, id);
      if (h === undefined) {
        throw new RangeError(
          `drive tool: no heading ${id} (have: ${
            headings(ctx)
              .map((o) => o.tbm.id)
              .join(', ') || 'none'
          })`,
        );
      }
      if (h.tbm.status === 'done') throw new Error(`drive tool: ${h.tbm.name} has broken through and cannot be driven`);
      release(ctx);
      possess(ctx, id);
      refresh(ctx);
    },

    invoke(commandId: string, ctx: BayToolContext): void {
      if (commandId !== TOOL_COMMANDS.driveRelease) throw new RangeError(`drive tool: unknown command ${commandId}`);
      if (headingId === null) throw new Error(`drive tool: ${commandId} is disabled: no machine is possessed`);
      release(ctx);
      close = true;
    },

    headingId(): string | null {
      return headingId;
    },

    wantsClose(): boolean {
      return close;
    },
  };
}
