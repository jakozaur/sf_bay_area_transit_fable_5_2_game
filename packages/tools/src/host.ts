/** Tool host: owns the active tool, implements GameServices.tools. The contract is ToolHost in ./contract.ts. */
import {
  type PreviewGeometry,
  TOOL_IDS,
  type ToolAction,
  type ToolAvailability,
  type ToolId,
  type ToolOptionValue,
  type ToolOptionValues,
  type ToolPort,
  type ToolStatus,
} from '@bayvox/core';
import type { BayTool, BayToolContext } from '@bayvox/sim';
import { createTools, type HostedTool, type ToolHost, type ToolHostDeps } from './contract.ts';
import { createValue } from './util.ts';

const IDLE: ToolStatus = { id: null, hint: '', readouts: [], options: [], values: {}, commands: [] };

function isToolId(id: string): id is ToolId {
  return (TOOL_IDS as readonly string[]).includes(id);
}

export function createToolHostImpl(deps: ToolHostDeps): ToolHost {
  const list: HostedTool[] = deps.tools ?? createTools(deps.anchors === undefined ? {} : { anchors: deps.anchors });
  const byId = new Map<string, HostedTool>();
  for (const t of list) {
    if (!isToolId(t.id)) throw new RangeError(`tool host: tool id ${t.id} is not one of ${TOOL_IDS.join(', ')}`);
    if (byId.has(t.id)) throw new RangeError(`tool host: two tools with id ${t.id}`);
    byId.set(t.id, t);
  }

  const status = createValue<ToolStatus>(IDLE);
  let statusJson = JSON.stringify(IDLE);
  const none: ToolAvailability = { plan: 'No such tool', station: 'No such tool', dig: 'No such tool', drive: 'No such tool' };
  const availabilityValue = createValue<ToolAvailability>(none);
  // Reading the availability evaluates it against the current snapshot, so the first read is already real.
  const availability = {
    get(): ToolAvailability {
      if (!disposed) refreshAvailability(ctx());
      return availabilityValue.get();
    },
    subscribe: availabilityValue.subscribe,
  };
  let active: HostedTool | null = null;
  let lastPreview: PreviewGeometry | null = null;
  let disposed = false;
  let unsubscribe: (() => void) | null = null;
  let availabilityFor: unknown = null;

  function ctx(): BayToolContext {
    const services = deps.services();
    return { world: deps.world, snapshot: services.sim.snapshot.get(), services };
  }

  function refreshAvailability(c: BayToolContext): void {
    // Lazy: the services object does not exist yet when the host is created (it contains this host's port).
    if (unsubscribe === null) {
      unsubscribe = c.services.sim.snapshot.subscribe(() => {
        if (!disposed) refreshAvailability(ctx());
      });
    }
    if (c.snapshot === availabilityFor) return;
    availabilityFor = c.snapshot;
    const prev = availabilityValue.get();
    const next = { ...none };
    let changed = false;
    for (const id of TOOL_IDS) {
      const tool = byId.get(id);
      if (tool !== undefined) next[id] = tool.unavailableReason(c);
      if (next[id] !== prev[id]) changed = true;
    }
    if (changed) availabilityValue.set(next);
  }

  /** After every call into the tool: commands to the sim, preview to the overlay, status to the UI. */
  function flush(c: BayToolContext, tool: BayTool | null): void {
    if (tool !== null) for (const cmd of tool.commit()) c.services.sim.command(cmd);
    const preview = active === null ? null : active.preview();
    if (preview !== lastPreview) {
      lastPreview = preview;
      c.services.overlay.setPreview(preview);
    }
    const next = active === null ? IDLE : active.status();
    if (next.id !== (active?.id ?? null)) {
      throw new Error(`tool host: tool ${active?.id ?? 'none'} published a status with id ${String(next.id)}`);
    }
    const json = JSON.stringify(next);
    if (json !== statusJson) {
      statusJson = json;
      status.set(next);
    }
  }

  function deactivate(c: BayToolContext): void {
    const tool = active;
    if (tool === null) return;
    tool.deactivate?.(c);
    active = null;
    flush(c, tool);
  }

  function closeIfDone(c: BayToolContext): void {
    if (active?.wantsClose?.() === true) deactivate(c);
  }

  function activate(id: ToolId | null, options?: ToolOptionValues): void {
    if (disposed) throw new Error('tool host: used after dispose');
    const c = ctx();
    refreshAvailability(c);
    if (id === null) {
      deactivate(c);
      return;
    }
    const tool = byId.get(id);
    if (tool === undefined) throw new RangeError(`tool host: unknown tool ${String(id)}`);
    const reason = tool.unavailableReason(c);
    if (reason !== null) throw new Error(`tool host: ${id} is unavailable: ${reason}`);
    if (active === tool && options === undefined) return;
    deactivate(c);
    tool.activate?.(c, options);
    active = tool;
    flush(c, tool);
    closeIfDone(c);
  }

  function requireActive(what: string): HostedTool {
    if (disposed) throw new Error('tool host: used after dispose');
    if (active === null) throw new Error(`tool host: ${what} needs an active tool`);
    return active;
  }

  const port: ToolPort = {
    status,
    availability,
    activate,
    setOption(key: string, value: ToolOptionValue): void {
      const tool = requireActive(`setOption(${key})`);
      const c = ctx();
      tool.setOption(key, value, c);
      flush(c, tool);
      closeIfDone(c);
    },
    invoke(commandId: string): void {
      const tool = requireActive(`invoke(${commandId})`);
      const c = ctx();
      tool.invoke(commandId, c);
      flush(c, tool);
      closeIfDone(c);
    },
  };

  function history(which: 'undo' | 'redo'): boolean {
    if (disposed || active === null) return false;
    const tool = active;
    const fn = tool[which];
    if (fn === undefined) return false;
    const c = ctx();
    const done = fn.call(tool, c);
    flush(c, tool);
    return done;
  }

  return {
    port,

    handle(a: ToolAction): boolean {
      if (disposed || active === null) return false;
      const tool = active;
      const c = ctx();
      let consumed = tool.onAction(a, c) === true;
      flush(c, tool);
      // Escape that the tool had no use for (nothing selected, nothing in flight) puts the tool away.
      if (!consumed && a.type === 'tool.cancel') {
        deactivate(c);
        consumed = true;
      }
      closeIfDone(c);
      return consumed;
    },

    update(dtSeconds: number): void {
      if (disposed) return;
      const c = ctx();
      refreshAvailability(c);
      if (active === null) return;
      const tool = active;
      tool.update?.(dtSeconds, c);
      flush(c, tool);
      closeIfDone(c);
    },

    active(): BayTool | null {
      return active;
    },

    undo: () => history('undo'),
    redo: () => history('redo'),

    dispose(): void {
      if (disposed) return;
      if (active !== null) deactivate(ctx());
      disposed = true;
      unsubscribe?.();
      unsubscribe = null;
      status.clear();
      availabilityValue.clear();
    },
  };
}
