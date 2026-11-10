/** Dig brush ('dig'). The contract is DigTool in ./contract.ts. */
import {
  Material,
  type PreviewGeometry,
  TOOL_KEYS,
  type ToolAction,
  type ToolOptionValue,
  type ToolOptionValues,
  type ToolStatus,
  type WorldPos,
} from '@bayvox/core';
import type { BayToolContext, GameCommand } from '@bayvox/sim';
import type { DigTool } from './contract.ts';
import { clamp, formatMoney } from './util.ts';

export const DIG_TUNING = {
  defaultRadiusM: 3,
  minRadiusM: 1,
  maxRadiusM: 16,
  /** While the button is held the brush bites this often, seconds: about 12 bites a second. */
  repeatSeconds: 0.08,
  /** The dig sound plays at most this often during a stroke, seconds. */
  cueSeconds: 0.2,
} as const;

export function createDigToolImpl(): DigTool {
  const T = DIG_TUNING;
  let radiusM: number = T.defaultRadiusM;
  let cursor: { x: number; y: number } | null = null;
  /** Non-null while the button is held on a claimed stroke. */
  let stroke: { sinceBite: number } | null = null;
  let strokeM3 = 0;
  let sinceCue = Number.POSITIVE_INFINITY;
  let queue: GameCommand[] = [];
  let previewCache: PreviewGeometry | null = null;
  let centsPerM3 = 0;
  let totalCents = 0;
  let totalM3 = 0;
  let broke = false;
  let sinceRefusal = Number.POSITIVE_INFINITY;
  /** Why the brush will not bite where the cursor is, or null. */
  let blocked: string | null = null;

  function radiusOption(value: ToolOptionValue): number {
    if (typeof value !== 'number' || !(value >= T.minRadiusM && value <= T.maxRadiusM)) {
      throw new RangeError(
        `dig tool: ${TOOL_KEYS.digRadiusM} must be a number in [${T.minRadiusM}, ${T.maxRadiusM}], got ${String(value)}`,
      );
    }
    return value;
  }

  /** Brush centre under the cursor: the centre of the picked voxel. */
  function target(ctx: BayToolContext): WorldPos | null {
    if (cursor === null) return null;
    const pick = ctx.services.world.pick(cursor.x, cursor.y);
    if (pick === null) return null;
    return { x: pick.voxel.x + 0.5, y: pick.voxel.y + 0.5, z: pick.voxel.z + 0.5 };
  }

  /**
   * Why a bite at `center` is refused, or null. A hole the player cannot see is not dug and not billed: under
   * water, or where the world says a hole would not be drawn (the second playtest paid $40M for holes in the
   * part of the map that is drawn as 4 m columns).
   */
  function refusal(ctx: BayToolContext, center: WorldPos): string | null {
    const w = ctx.services.world;
    if (w.voxelAt(center.x, center.y, center.z) === Material.WATER || w.voxelAt(center.x, center.y + 1, center.z) === Material.WATER)
      return 'That is under water. The brush digs ground you can see.';
    return w.digBlocked?.(center, radiusM) ?? null;
  }

  /** One bite: carve through the world port (which logs the edit) and charge the sim for what came out. */
  function bite(ctx: BayToolContext): boolean {
    const center = target(ctx);
    if (center === null) return false;
    blocked = refusal(ctx, center);
    if (blocked !== null) {
      if (sinceRefusal >= T.cueSeconds * 4) {
        ctx.services.audio.cue('tool.invalid');
        sinceRefusal = 0;
      }
      return true;
    }
    // Every cubic metre is billed, so an empty account digs nothing. (The first playtest dug the funds to -$374M.)
    if (ctx.snapshot.moneyCents <= 0) {
      if (sinceRefusal >= T.cueSeconds * 4) {
        ctx.services.audio.cue('tool.invalid');
        sinceRefusal = 0;
      }
      return true;
    }
    const res = ctx.services.world.dig(center, radiusM);
    if (!(res.removedM3 >= 0) || !Number.isFinite(res.removedM3)) {
      throw new Error(`dig tool: world.dig returned removedM3 ${res.removedM3} at (${center.x}, ${center.y}, ${center.z})`);
    }
    if (res.removedM3 === 0) return true;
    strokeM3 += res.removedM3;
    const projectId = ctx.snapshot.mission.projectId;
    queue.push({ t: 'chargeDig', volumeM3: res.removedM3, ...(projectId === null ? {} : { projectId }) });
    if (sinceCue >= T.cueSeconds) {
      ctx.services.audio.cue('dig');
      sinceCue = 0;
    }
    return true;
  }

  function refresh(ctx: BayToolContext): void {
    const h = ctx.snapshot.handDig;
    broke = ctx.snapshot.moneyCents <= 0;
    centsPerM3 = h.centsPerM3;
    totalCents = h.cents;
    totalM3 = h.volumeM3;
    const center = target(ctx);
    if (center === null) {
      previewCache = null;
      blocked = null;
      return;
    }
    blocked = refusal(ctx, center);
    const valid = blocked === null && !broke;
    const prev = previewCache?.kind === 'brush' ? previewCache : null;
    if (
      prev !== null &&
      prev.valid === valid &&
      prev.radiusM === radiusM &&
      prev.center.x === center.x &&
      prev.center.y === center.y &&
      prev.center.z === center.z
    ) {
      return;
    }
    previewCache = { kind: 'brush', center, radiusM, valid };
  }

  function status(): ToolStatus {
    return {
      id: 'dig',
      hint: broke
        ? 'No funds: hand digging is billed by the cubic metre, and the account is empty.'
        : blocked !== null
          ? blocked
          : stroke !== null
            ? 'Digging. Release to stop.'
            : 'Hold the left button to dig by hand. The comma and period keys change the brush. Every cubic metre is billed.',
      readouts: [
        { id: 'rate', label: 'Hand excavation', value: `${formatMoney(centsPerM3)}/m3`, bad: false },
        {
          id: 'stroke',
          label: 'This stroke',
          value: `${Math.round(strokeM3)} m3, ${formatMoney(Math.round(strokeM3 * centsPerM3))}`,
          bad: false,
        },
        { id: 'total', label: 'Dug by hand', value: `${Math.round(totalM3)} m3, ${formatMoney(totalCents)}`, bad: false },
      ],
      options: [
        { key: TOOL_KEYS.digRadiusM, label: 'Brush radius', kind: 'range', min: T.minRadiusM, max: T.maxRadiusM, step: 1, unit: 'm' },
      ],
      values: { [TOOL_KEYS.digRadiusM]: radiusM },
      commands: [],
    };
  }

  return {
    id: 'dig',

    unavailableReason(): string | null {
      return null;
    },

    activate(ctx: BayToolContext, options?: ToolOptionValues): void {
      radiusM = T.defaultRadiusM;
      cursor = null;
      stroke = null;
      strokeM3 = 0;
      sinceCue = Number.POSITIVE_INFINITY;
      queue = [];
      previewCache = null;
      for (const [key, value] of Object.entries(options ?? {})) {
        if (key !== TOOL_KEYS.digRadiusM) throw new RangeError(`dig tool: unknown option ${key}`);
        radiusM = radiusOption(value);
      }
      refresh(ctx);
    },

    deactivate(): void {
      cursor = null;
      stroke = null;
      previewCache = null;
    },

    onAction(a: ToolAction, ctx: BayToolContext): boolean {
      let consumed = false;
      switch (a.type) {
        case 'pointer.hover':
          cursor = { x: a.x, y: a.y };
          break;
        case 'pointer.leave':
          cursor = null;
          break;
        case 'pointer.down':
          if (a.button !== 0) break;
          cursor = { x: a.x, y: a.y };
          // Over the sky there is nothing to dig: the press stays with the camera.
          if (target(ctx) === null) break;
          strokeM3 = 0;
          stroke = { sinceBite: 0 };
          bite(ctx);
          consumed = true;
          break;
        case 'pointer.drag':
          if (stroke === null) break;
          cursor = { x: a.x, y: a.y };
          consumed = true;
          break;
        case 'pointer.up':
          if (stroke === null) break;
          stroke = null;
          consumed = true;
          break;
        case 'tool.primary':
          // A click that was not claimed as a stroke (scripted input): one bite.
          cursor = { x: a.x, y: a.y };
          strokeM3 = 0;
          consumed = bite(ctx);
          break;
        case 'tool.adjust':
          radiusM = clamp(radiusM + Math.sign(a.delta), T.minRadiusM, T.maxRadiusM);
          consumed = true;
          break;
        default:
          break;
      }
      refresh(ctx);
      return consumed;
    },

    update(dtSeconds: number, ctx: BayToolContext): void {
      sinceCue += dtSeconds;
      sinceRefusal += dtSeconds;
      if (stroke !== null) {
        stroke.sinceBite += dtSeconds;
        // One bite per frame at most: a long frame does not turn into a burst.
        if (stroke.sinceBite >= T.repeatSeconds) {
          stroke.sinceBite = 0;
          bite(ctx);
        }
      }
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
      if (key !== TOOL_KEYS.digRadiusM) throw new RangeError(`dig tool: unknown option ${key}`);
      radiusM = radiusOption(value);
      refresh(ctx);
    },

    invoke(commandId: string): void {
      throw new RangeError(`dig tool: unknown command ${commandId}`);
    },
  };
}
