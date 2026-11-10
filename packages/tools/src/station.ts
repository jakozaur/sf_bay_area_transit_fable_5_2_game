/** Add station tool ('station'). The contract is StationTool in ./contract.ts. */
import {
  Material,
  type PreviewGeometry,
  type StationEntity,
  type StationStyle,
  TOOL_KEYS,
  type ToolAction,
  type ToolOptionValue,
  type ToolOptionValues,
  type ToolReadout,
  type ToolStatus,
} from '@bayvox/core';
import {
  type BayToolContext,
  chainages,
  type GameCommand,
  nearestChainage,
  type ProjectView,
  pointAt,
  STATION_TEMPLATES,
  type StationTemplate,
  type Waypoint,
} from '@bayvox/sim';
import type { StationTool } from './contract.ts';
import { clamp, deflection, formatMoney } from './util.ts';

/** Interaction and ghost tuning. The platform length is the 140 m metro platform of docs/PLAN.md section 6 (station fit-out row). */
export const STATION_TUNING = {
  platformLengthM: 140,
  /** A cursor within this plan distance of the alignment snaps the ghost onto it, metres. */
  snapM: 80,
  /** A bend sharper than this ends a straight run: platforms are straight. Degrees. */
  straightDeg: 3,
  /** Right-click within this many CSS pixels of a station's centre removes it. */
  hitPx: 24,
  minDepthM: 0,
  maxDepthM: 80,
  flashSeconds: 4,
  /**
   * Ghost box per platform length: 1.1 for the compact box, 1.75 with a full mezzanine (docs/PLAN.md section 5.5).
   * Width and height are for the preview only; the sim decides what gets built.
   */
  boxFactor: { compactBox: 1.1, mezzanineBox: 1.75 },
  ghostWidthM: 22,
  ghostHeightM: 14,
} as const;

const TEMPLATE_LABELS: Record<StationTemplate, string> = {
  undergroundStandard: 'Underground box',
  undergroundDeepMined: 'Deep mined cavern',
  terminalFitOut: 'Terminal fit-out',
  inBore: 'Platforms in the bore',
  surface: 'Surface',
  elevated: 'Elevated',
};

const UNDERGROUND: ReadonlySet<StationTemplate> = new Set(['undergroundStandard', 'undergroundDeepMined', 'terminalFitOut', 'inBore']);

type Candidate = NonNullable<ReturnType<StationTool['candidate']>>;

interface Placement extends Candidate {
  position: { x: number; y: number; z: number };
  yaw: number;
  depthM: number;
}

function isTemplate(v: unknown): v is StationTemplate {
  return typeof v === 'string' && (STATION_TEMPLATES as readonly string[]).includes(v);
}

/** The straight run of the line that contains chainage `s`: between the bends before and after it. */
function straightRun(wps: readonly Waypoint[], cum: readonly number[], s: number, limitRad: number): { from: number; to: number } {
  let from = 0;
  let to = cum[cum.length - 1];
  for (let i = 1; i + 1 < wps.length; i++) {
    if (Math.abs(deflection(wps[i - 1], wps[i], wps[i + 1])) <= limitRad) continue;
    if (cum[i] <= s) from = cum[i];
    else {
      to = cum[i];
      break;
    }
  }
  return { from, to };
}

export function createStationToolImpl(): StationTool {
  const T = STATION_TUNING;
  let template: StationTemplate = 'undergroundStandard';
  /** True once the player picked a type by hand in this activation: the tool then stops proposing one. */
  let templatePicked = false;
  /** The mission place the cursor is in whose official station type the tool proposed, for the hint. */
  let proposal: { place: string; note: string } | null = null;
  /** Cursor position of the last placement and the station's name: until the cursor moves, the panel says "placed", not "too close". */
  let placed: { x: number; y: number; name: string } | null = null;
  /** Depth of the line where a station would typically go, shown before the cursor is on the line. */
  let typicalDepthM = 0;
  /** Price tags of the types, from the snapshot. */
  let prices: readonly { template: StationTemplate; costCents: number; buildDays: number; note: string }[] = [];
  /** Platform depth the player set by hand; null takes it from the alignment at the station. */
  let depthOverride: number | null = null;
  let cursor: { x: number; y: number } | null = null;
  let placement: Placement | null = null;
  let previewCache: PreviewGeometry | null = null;
  let queue: GameCommand[] = [];
  let flash: { text: string; left: number } | null = null;
  let frozen = false;

  function projectOf(ctx: BayToolContext): ProjectView | undefined {
    const m = ctx.snapshot.mission;
    return ctx.snapshot.projects.find((p) => p.id === m.planProjectId) ?? ctx.snapshot.projects.find((p) => p.id === m.projectId);
  }

  function reasonNoLine(ctx: BayToolContext): string | null {
    const p = projectOf(ctx);
    if (p === undefined || p.waypoints.length < 2) return 'Draw an alignment first';
    if (p.designFrozen || p.status === 'open') return 'The design went to tender. Stations are fixed.';
    return null;
  }

  /**
   * Id and name of the next station. A station placed inside the ring of a mission target takes that place's
   * name ("4th and King"); anywhere else it is "Station n".
   */
  function nextName(ctx: BayToolContext, p: ProjectView, at: { x: number; z: number } | null): { id: string; name: string } {
    let place: string | null = null;
    if (at !== null) {
      let best = Number.POSITIVE_INFINITY;
      for (const t of ctx.snapshot.mission.targets) {
        const d = Math.hypot(t.x - at.x, t.z - at.z);
        if (d <= t.radiusM && d < best && !p.stations.some((s) => s.name === t.name)) {
          best = d;
          place = t.name;
        }
      }
    }
    for (let n = p.stations.length + 1; ; n++) {
      const id = `station-${n}`;
      const name = place ?? `Station ${n}`;
      if (!p.stations.some((s) => s.id === id || s.name === name)) return { id, name };
    }
  }

  function styleOf(p: ProjectView): StationStyle {
    switch (template) {
      case 'undergroundStandard':
        return p.design.stationBox;
      case 'undergroundDeepMined':
        return 'minedCavern';
      case 'terminalFitOut':
        return 'terminal';
      default:
        return template;
    }
  }

  /** Where a click at the cursor would put the station: snapped onto the line and into a straight run that holds the platform. */
  function place(ctx: BayToolContext, x: number, y: number): Placement | null {
    const p = projectOf(ctx);
    if (p === undefined || p.waypoints.length < 2) return null;
    const pick = ctx.services.world.pick(x, y);
    if (pick === null) return null;
    const wps = p.waypoints;
    const cum = chainages(wps);
    const near = nearestChainage(wps, cum, pick.point.x, pick.point.z);
    if (near.distanceM > T.snapM) return null;
    const L = T.platformLengthM;
    const total = cum[cum.length - 1];
    const run = straightRun(wps, cum, near.chainageM, (T.straightDeg * Math.PI) / 180);
    let chainageM = near.chainageM;
    let reason = '';
    if (p.designFrozen || p.status === 'open') {
      reason = 'The design went to tender. Stations are fixed.';
    } else if (total < L) {
      reason = `The line is ${Math.round(total)} m long, shorter than a ${L} m platform.`;
    } else if (template !== 'terminalFitOut' && run.to - run.from < L) {
      reason = `Platforms are straight: this run is ${Math.round(run.to - run.from)} m, the platform needs ${L} m.`;
    } else {
      // A terminal fit-out uses platforms that stand already (the trainbox): the line may curve into them.
      const straight = template === 'terminalFitOut' && run.to - run.from < L ? { from: 0, to: total } : run;
      chainageM = clamp(near.chainageM, straight.from + L / 2, straight.to - L / 2);
      const clash = p.stations.find((s) => Math.abs(s.chainageM - chainageM) < L);
      if (clash !== undefined) reason = `Too close to ${clash.name}: platforms would overlap.`;
    }
    const position = pointAt(wps, cum, chainageM);
    // A station needs a street above it. The second playtest built three boxes in the open Bay.
    if (reason === '' && isWater(ctx, position.x, position.z)) reason = 'That is open water. A station needs ground above it.';
    const ahead = pointAt(wps, cum, Math.min(total, chainageM + 1));
    const behind = pointAt(wps, cum, Math.max(0, chainageM - 1));
    const yaw = Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
    const natural = ctx.services.world.groundAt(position.x, position.z) - position.y;
    const depthM = Math.round((depthOverride ?? Math.max(0, natural)) * 10) / 10;
    return { chainageM, template, valid: reason === '', reason, position, yaw, depthM };
  }

  /** True where the surface at a plan position is water (the Bay, the ocean). False where the map has no answer. */
  function isWater(ctx: BayToolContext, x: number, z: number): boolean {
    try {
      const top = ctx.services.world.groundAt(x, z);
      return ctx.services.world.voxelAt(x, top - 0.5, z) === Material.WATER;
    } catch {
      // groundAt throws off the map; the line itself is refused there by the plan tool.
      return false;
    }
  }

  /** The mission target whose ring holds a point, if the official plan has a station type for it. */
  function targetAt(ctx: BayToolContext, at: { x: number; z: number }): { name: string; template: StationTemplate; note: string } | null {
    let best: { name: string; template: StationTemplate; note: string } | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const t of ctx.snapshot.mission.targets) {
      if (t.template === undefined) continue;
      const d = Math.hypot(t.x - at.x, t.z - at.z);
      if (d <= t.radiusM && d < bestD) {
        bestD = d;
        best = { name: t.name, template: t.template, note: t.templateNote ?? '' };
      }
    }
    return best;
  }

  function refresh(ctx: BayToolContext): void {
    const p = projectOf(ctx);
    frozen = p !== undefined && (p.designFrozen || p.status === 'open');
    prices = p?.stationOptions ?? [];
    if (p !== undefined && p.waypoints.length >= 2) {
      // Depth of the line at its middle: what the slider shows before the cursor is on the line.
      const cum = chainages(p.waypoints);
      const mid = pointAt(p.waypoints, cum, cum[cum.length - 1] / 2);
      try {
        typicalDepthM = Math.max(0, Math.round(ctx.services.world.groundAt(mid.x, mid.z) - mid.y));
      } catch {
        typicalDepthM = 0;
      }
    }
    placement = cursor === null ? null : place(ctx, cursor.x, cursor.y);
    // Inside the ring of a mission place the tool proposes the type the official plan builds there, until the
    // player picks one by hand. The second playtest put a new box where the trainbox already stands.
    proposal = null;
    if (placement !== null && !templatePicked && cursor !== null) {
      const t = targetAt(ctx, placement.position);
      if (t !== null) {
        if (t.template !== template) {
          template = t.template;
          placement = place(ctx, cursor.x, cursor.y);
        }
        proposal = { place: t.name, note: t.note };
      }
    }
    if (placed !== null && (cursor === null || cursor.x !== placed.x || cursor.y !== placed.y)) placed = null;
    if (placement === null || p === undefined || placed !== null) {
      previewCache = null;
      return;
    }
    const prev = previewCache?.kind === 'station' ? previewCache : null;
    const style = styleOf(p);
    const factor = style === 'compactBox' || style === 'mezzanineBox' ? T.boxFactor[style] : 1;
    const like = p.stations.find((s) => s.style === style);
    const station: StationEntity = {
      id: 'station-ghost',
      name: nextName(ctx, p, placement.position).name,
      position: placement.position,
      yaw: placement.yaw,
      style,
      lengthM: like?.lengthM ?? T.platformLengthM * factor,
      widthM: like?.widthM ?? T.ghostWidthM,
      heightM: like?.heightM ?? T.ghostHeightM,
      progress: 0,
      fitOut: 0,
      open: false,
    };
    // Keep the object while nothing moved, so the host does not push an identical preview every frame.
    if (
      prev !== null &&
      prev.valid === placement.valid &&
      prev.station.style === style &&
      prev.station.yaw === station.yaw &&
      prev.station.position.x === station.position.x &&
      prev.station.position.y === station.position.y &&
      prev.station.position.z === station.position.z
    ) {
      return;
    }
    previewCache = { kind: 'station', station, valid: placement.valid };
  }

  function say(ctx: BayToolContext, text: string): void {
    flash = { text, left: T.flashSeconds };
    ctx.services.audio.cue('tool.invalid');
  }

  function stationUnder(ctx: BayToolContext, p: ProjectView, x: number, y: number): ProjectView['stations'][number] | undefined {
    let best: ProjectView['stations'][number] | undefined;
    let bestD: number = T.hitPx;
    for (const s of p.stations) {
      const at = ctx.services.camera.project(s.position);
      if (at === null) continue;
      const d = Math.hypot(at.x - x, at.y - y);
      if (d <= bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best !== undefined) return best;
    // Not on the marker: accept a click on the ground over the box.
    const pick = ctx.services.world.pick(x, y);
    if (pick === null) return undefined;
    return p.stations.find((s) => Math.hypot(s.position.x - pick.point.x, s.position.z - pick.point.z) <= s.lengthM / 2);
  }

  function priceOf(t: StationTemplate): { costCents: number; buildDays: number; note: string } | undefined {
    return prices.find((x) => x.template === t);
  }

  function priceText(t: StationTemplate): string | undefined {
    const price = priceOf(t);
    if (price === undefined) return undefined;
    return `+${formatMoney(price.costCents)}, ${Math.round(price.buildDays / 30.44)} months`;
  }

  function status(): ToolStatus {
    const readouts: ToolReadout[] = [];
    const price = priceOf(template);
    if (placed !== null) {
      readouts.push({ id: 'platform', label: 'Placed', value: placed.name, bad: false });
    } else if (placement !== null) {
      readouts.push({ id: 'chainage', label: 'At', value: `${Math.round(placement.chainageM)} m along the line`, bad: false });
      if (UNDERGROUND.has(template)) readouts.push({ id: 'depth', label: 'Platform depth', value: `${placement.depthM} m`, bad: false });
      readouts.push({
        id: 'platform',
        label: 'Platform',
        value: placement.valid ? `${T.platformLengthM} m, fits` : placement.reason,
        bad: !placement.valid,
      });
    }
    if (price !== undefined)
      readouts.push({
        id: 'price',
        label: `One ${TEMPLATE_LABELS[template].toLowerCase()} adds`,
        value: `${formatMoney(price.costCents)}`,
        bad: false,
      });
    const what = TEMPLATE_LABELS[template].toLowerCase();
    const hint =
      flash !== null
        ? flash.text
        : frozen
          ? 'The design went to tender. Stations are fixed.'
          : placed !== null
            ? `${placed.name} is placed. Move the cursor along the line to place another, or put the tool away.`
            : placement === null
              ? 'Move the cursor over the alignment to place a station. Each type has its price below. Right-click a station to remove it.'
              : !placement.valid
                ? placement.reason
                : proposal !== null
                  ? `Click to place a ${what} at ${proposal.place}: the type the official plan builds here. ${proposal.note}`
                  : `Click to place a ${what}. Right-click a station to remove it.`;
    return {
      id: 'station',
      hint,
      readouts,
      options: [
        {
          key: TOOL_KEYS.stationTemplate,
          label: 'Station type',
          kind: 'choice',
          choices: STATION_TEMPLATES.map((t) => {
            const detail = priceText(t);
            const note = priceOf(t)?.note;
            return {
              value: t,
              label: TEMPLATE_LABELS[t],
              ...(detail === undefined ? {} : { detail }),
              ...(note === undefined ? {} : { note }),
            };
          }),
        },
        {
          key: TOOL_KEYS.stationDepthM,
          label: 'Platform depth',
          kind: 'range',
          min: T.minDepthM,
          max: T.maxDepthM,
          step: 1,
          unit: 'm',
        },
      ],
      values: { [TOOL_KEYS.stationTemplate]: template, [TOOL_KEYS.stationDepthM]: depthOverride ?? placement?.depthM ?? typicalDepthM },
      commands: [],
    };
  }

  function setOption(key: string, value: ToolOptionValue, ctx: BayToolContext): void {
    if (key === TOOL_KEYS.stationTemplate) {
      if (!isTemplate(value))
        throw new RangeError(`station tool: ${key} must be one of ${STATION_TEMPLATES.join(', ')}, got ${String(value)}`);
      template = value;
      templatePicked = true;
    } else if (key === TOOL_KEYS.stationDepthM) {
      if (typeof value !== 'number' || !(value >= T.minDepthM && value <= T.maxDepthM)) {
        throw new RangeError(`station tool: ${key} must be a number in [${T.minDepthM}, ${T.maxDepthM}], got ${String(value)}`);
      }
      depthOverride = value;
    } else {
      throw new RangeError(`station tool: unknown option ${key}`);
    }
    refresh(ctx);
  }

  return {
    id: 'station',

    unavailableReason(ctx: BayToolContext): string | null {
      return reasonNoLine(ctx);
    },

    activate(ctx: BayToolContext, options?: ToolOptionValues): void {
      template = 'undergroundStandard';
      templatePicked = false;
      proposal = null;
      placed = null;
      depthOverride = null;
      cursor = null;
      placement = null;
      previewCache = null;
      queue = [];
      flash = null;
      for (const [key, value] of Object.entries(options ?? {})) setOption(key, value, ctx);
      refresh(ctx);
    },

    deactivate(): void {
      cursor = null;
      placement = null;
      previewCache = null;
      flash = null;
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
        case 'tool.primary': {
          cursor = { x: a.x, y: a.y };
          // The click may land where the cursor never hovered (a touchpad tap): propose the type for the place first.
          refresh(ctx);
          const p = projectOf(ctx);
          // A second click where a station was just placed is not a second station.
          if (placed !== null) {
            consumed = true;
            break;
          }
          const at = place(ctx, a.x, a.y);
          if (p === undefined || at === null) break;
          consumed = true;
          if (!at.valid) {
            say(ctx, at.reason);
            break;
          }
          const { id, name } = nextName(ctx, p, at.position);
          queue.push({
            t: 'addStation',
            projectId: p.id,
            stationId: id,
            name,
            template,
            chainageM: Math.round(at.chainageM * 100) / 100,
            ...(UNDERGROUND.has(template) ? { depthM: at.depthM } : {}),
          });
          placed = { x: a.x, y: a.y, name };
          ctx.services.audio.cue('tool.place');
          break;
        }
        case 'tool.secondary': {
          const p = projectOf(ctx);
          if (p === undefined) break;
          const s = stationUnder(ctx, p, a.x, a.y);
          if (s === undefined) break;
          consumed = true;
          if (p.designFrozen || p.status === 'open') {
            say(ctx, 'The design went to tender. Stations are fixed.');
            break;
          }
          queue.push({ t: 'removeStation', projectId: p.id, stationId: s.id });
          ctx.services.audio.cue('tool.remove');
          break;
        }
        case 'tool.adjust': {
          const base = depthOverride ?? placement?.depthM;
          if (base !== undefined) depthOverride = clamp(Math.round(base) + Math.sign(a.delta), T.minDepthM, T.maxDepthM);
          consumed = true;
          break;
        }
        default:
          break;
      }
      refresh(ctx);
      return consumed;
    },

    update(dtSeconds: number, ctx: BayToolContext): void {
      if (flash !== null) {
        flash.left -= dtSeconds;
        if (flash.left <= 0) flash = null;
      }
      // The line or the stations may have changed under a resting cursor.
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
    setOption,

    invoke(commandId: string): void {
      throw new RangeError(`station tool: unknown command ${commandId}`);
    },

    candidate(): Candidate | null {
      if (placement === null) return null;
      return { chainageM: placement.chainageM, template: placement.template, valid: placement.valid, reason: placement.reason };
    },
  };
}
