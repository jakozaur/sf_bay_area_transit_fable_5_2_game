/**
 * A fake BayServices for UI tests and the dev page: every Readable is settable, every call is recorded in `calls`.
 * It imitates just enough behaviour for the UI to be clicked through (speed, panels of tools, view toggles, screens);
 * it never runs a sim. Commands are recorded, not applied.
 */
import type {
  CameraStatus,
  GameSpeed,
  GameViewState,
  Readable,
  SaveSlotInfo,
  SessionState,
  ToolAvailability,
  ToolId,
  ToolStatus,
} from '@bayvox/core';
import type { BayServices, GameSnapshot } from '@bayvox/sim';

export interface FakeCall {
  /** "sim.command", "tools.activate", "session.start", ... */
  name: string;
  args: unknown[];
}

class Cell<T> implements Readable<T> {
  private readonly subs = new Set<(v: T) => void>();
  private value: T;
  constructor(value: T) {
    this.value = value;
  }
  get(): T {
    return this.value;
  }
  set(v: T): void {
    this.value = v;
    for (const cb of [...this.subs]) cb(v);
  }
  subscribe(cb: (v: T) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }
  get subscribers(): number {
    return this.subs.size;
  }
}

export const IDLE_TOOL: ToolStatus = { id: null, hint: '', readouts: [], options: [], values: {}, commands: [] };
export const ALL_TOOLS_AVAILABLE: ToolAvailability = { plan: null, station: null, dig: null, drive: null };

export interface FakeInit {
  snapshot: GameSnapshot;
  session: SessionState;
  speed?: GameSpeed;
  view?: GameViewState;
  tool?: ToolStatus;
  availability?: ToolAvailability;
  camera?: CameraStatus;
  muted?: boolean;
  /** Status the fake publishes when a tool is activated. Tools missing here publish a bare status with their id. */
  toolStatuses?: Partial<Record<ToolId, ToolStatus>>;
}

export interface FakeServices extends BayServices {
  readonly calls: FakeCall[];
  /** Names of the recorded calls, in order. */
  names(): string[];
  /** Arguments of the last call named `name`. Throws when it was never called. */
  last(name: string): unknown[];
  setSnapshot(s: GameSnapshot): void;
  setSession(s: SessionState): void;
  setTool(t: ToolStatus): void;
  setAvailability(a: ToolAvailability): void;
  /** Makes the next call named `name` throw `message`, to test the failure path. */
  failNext(name: string, message: string): void;
  /** Live subscriptions across all Readables, to test dispose. */
  subscriptions(): number;
}

export function createFakeServices(init: FakeInit): FakeServices {
  const calls: FakeCall[] = [];
  const failures = new Map<string, string>();
  const rec = (name: string, ...args: unknown[]): void => {
    calls.push({ name, args });
    const failure = failures.get(name);
    if (failure !== undefined) {
      failures.delete(name);
      throw new Error(failure);
    }
  };
  const snapshot = new Cell(init.snapshot);
  const session = new Cell(init.session);
  const speed = new Cell<GameSpeed>(init.speed ?? 1);
  const view = new Cell<GameViewState>(init.view ?? { cut: false, cutY: 0, cutRadius: 96, xray: false });
  const tool = new Cell(init.tool ?? IDLE_TOOL);
  const availability = new Cell(init.availability ?? ALL_TOOLS_AVAILABLE);
  const camera = new Cell<CameraStatus>(init.camera ?? { bookmarks: [], following: null });
  const muted = new Cell(init.muted ?? false);
  let beforePause: GameSpeed = 1;
  const saveInfo = (): SaveSlotInfo => {
    const s = snapshot.get();
    return { slot: 'auto', scenarioId: s.scenarioId, title: s.mission.title, date: s.date, tick: s.tick, savedAt: '2026-11-10T12:00:00Z' };
  };
  const cells = [snapshot, session, speed, view, tool, availability, camera, muted];

  return {
    calls,
    names: () => calls.map((c) => c.name),
    last(name) {
      const hit = calls.findLast((c) => c.name === name);
      if (hit === undefined) throw new Error(`fake services: "${name}" was never called (calls: ${calls.map((c) => c.name).join(', ')})`);
      return hit.args;
    },
    setSnapshot: (s) => snapshot.set(s),
    setSession: (s) => session.set(s),
    setTool: (t) => tool.set(t),
    setAvailability: (a) => availability.set(a),
    failNext: (name, message) => void failures.set(name, message),
    subscriptions: () => cells.reduce((n, c) => n + c.subscribers, 0),

    sim: {
      snapshot,
      command: (c) => rec('sim.command', c),
      estimateAlignment: (req) => {
        rec('sim.estimateAlignment', req);
        throw new Error('fake services: estimateAlignment is not faked');
      },
    },
    time: {
      speed,
      setSpeed(s) {
        rec('time.setSpeed', s);
        if (s !== 0) beforePause = s;
        speed.set(s);
      },
      togglePause() {
        rec('time.togglePause');
        if (speed.get() === 0) speed.set(beforePause);
        else {
          beforePause = speed.get();
          speed.set(0);
        }
      },
    },
    session: {
      state: session,
      brief(id) {
        rec('session.brief', id);
        session.set({ ...session.get(), screen: 'briefing', missionId: id, error: null });
      },
      async start(id) {
        rec('session.start', id);
        session.set({ ...session.get(), screen: 'playing', missionId: id, loading: null, error: null });
      },
      async save(slot) {
        rec('session.save', slot);
        const info = saveInfo();
        session.set({ ...session.get(), saves: [info] });
        return info;
      },
      async load(slot) {
        rec('session.load', slot);
        session.set({ ...session.get(), screen: 'playing', missionId: snapshot.get().mission.id });
      },
      async restart() {
        rec('session.restart');
      },
      async toTitle() {
        rec('session.toTitle');
        session.set({ ...session.get(), screen: 'title', missionId: null });
      },
      async nextMission() {
        rec('session.nextMission');
      },
      keepPlaying() {
        rec('session.keepPlaying');
        session.set({ ...session.get(), screen: 'playing' });
      },
    },
    camera: {
      status: camera,
      state: () => ({ position: { x: 0, y: 500, z: 500 }, target: { x: 0, y: 0, z: 0 }, fovYDeg: 45, aspect: 16 / 9, near: 1, far: 1e5 }),
      goTo: (id) => rec('camera.goTo', id),
      flyTo: (pose) => rec('camera.flyTo', pose),
      focusOn: (target, distanceM) => rec('camera.focusOn', target, distanceM),
      follow(target) {
        rec('camera.follow', target);
        camera.set({ ...camera.get(), following: target });
      },
      project: () => null,
    },
    view: {
      state: view,
      set(v) {
        rec('view.set', v);
        view.set({ ...view.get(), ...v });
      },
    },
    world: {
      pick: () => null,
      groundAt: () => 4,
      voxelAt: () => 0,
      siteBounds: () => ({ minX: -2000, minZ: -2000, maxX: 2000, maxZ: 2000 }),
      dig(center, radiusM) {
        rec('world.dig', center, radiusM);
        return { removedM3: 0, dirtyChunks: 0 };
      },
    },
    overlay: {
      add: () => {
        throw new Error('fake services: overlay.add is not faked');
      },
      setPreview: (p) => rec('overlay.setPreview', p),
      highlight: (ref) => rec('overlay.highlight', ref),
      setLayerVisible: (layer, visible) => rec('overlay.setLayerVisible', layer, visible),
    },
    tools: {
      status: tool,
      availability,
      activate(id, options) {
        rec('tools.activate', id, options);
        if (id === null) tool.set(IDLE_TOOL);
        else tool.set(init.toolStatuses?.[id] ?? { ...IDLE_TOOL, id, values: options ?? {} });
      },
      setOption(key, value) {
        rec('tools.setOption', key, value);
        const t = tool.get();
        tool.set({ ...t, values: { ...t.values, [key]: value } });
      },
      invoke: (id) => rec('tools.invoke', id),
    },
    audio: {
      cue: (id) => rec('audio.cue', id),
      loop: (id, level, pitch) => rec('audio.loop', id, level, pitch),
      muted,
      setMuted(m) {
        rec('audio.setMuted', m);
        muted.set(m);
      },
    },
  };
}
