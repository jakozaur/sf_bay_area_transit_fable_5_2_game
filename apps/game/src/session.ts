/**
 * Mission flow (core SessionPort, docs/CONTRACTS.md decision 11): screens, site loading per scenario, the
 * campaign profile, save, load and restart. The sim of the mission in play lives in the SimDriver; this
 * module replaces it and tells the app shell through `hooks` what it must rebuild around a new sim.
 */
import type {
  CameraBookmark,
  CampaignProgress,
  MissionCard,
  MissionResult,
  SaveSlotInfo,
  SessionPort,
  SessionState,
  WorldStore,
} from '@bayvox/core';
import { EMPTY_CAMPAIGN, missionCards } from '@bayvox/scenarios';
import { createSim, type GameSim, type GameSnapshot, type GroundQuery, loadSim, type ScenarioDef } from '@bayvox/sim';
import { Cell } from './cell.ts';
import type { GameWorld } from './game-world.ts';
import type { SimDriver } from './sim-driver.ts';
import { AUTOSAVE_SLOT, type GameStorage, type SaveRecord } from './storage.ts';

/** Real seconds between the mission completing and the scorecard: time to see the banner and the first train. */
export const SCORECARD_DELAY_S = 8;
/** Real seconds of play between periodic autosaves. */
export const AUTOSAVE_INTERVAL_S = 45;

/** Feed kinds worth an autosave: the player has just passed something. */
const AUTOSAVE_KINDS: ReadonlySet<string> = new Set(['projectApproved', 'phaseDone', 'tbmLaunched', 'breakthrough', 'lineOpened']);

export interface SessionHooks {
  /** The world's site was replaced: restream, refresh bookmarks. */
  siteLoaded(): void;
  /** The sim in the driver is about to be replaced: put the active tool away, end the camera follow. */
  simDetaching(): void;
  /** A new sim is attached for `scenario`: drop tools, previews, remembered poses; point the camera. */
  simAttached(scenario: ScenarioDef, reason: 'start' | 'restart' | 'load'): void;
  /** Camera to a pose (animated unless the clock is frozen). */
  fly(pose: CameraBookmark): void;
  /** Camera to the whole-Bay view of the title screen. */
  flyToBay(): void;
}

export interface SessionOptions {
  scenarios: readonly ScenarioDef[];
  seed: number;
  storage: GameStorage;
  driver: SimDriver;
  world: GameWorld;
  hooks: SessionHooks;
}

export interface Session {
  readonly port: SessionPort;
  /** Scenario of the sim in the driver. */
  scenario(): ScenarioDef;
  /** Starts a mission whatever the campaign says about its lock: the `mission` deep link of tests and screenshots. */
  startUnlocked(missionId: string): Promise<void>;
  /** Reads the campaign profile and the save list from storage. Storage failures become `state.error`. */
  restore(): Promise<void>;
  /** Once per frame with wall time: schedules the scorecard and the periodic autosave. */
  update(dtSeconds: number): void;
  /** Resolves when no save is being written. */
  idle(): Promise<void>;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A camera pose over the middle of a site, from the south. */
function overSite(rect: readonly [number, number, number, number]): CameraBookmark {
  const x = (rect[0] + rect[2]) / 2;
  const z = (rect[1] + rect[3]) / 2;
  const span = Math.max(rect[2] - rect[0], rect[3] - rect[1]);
  const h = Math.min(4000, Math.max(1200, span * 0.45));
  return { position: { x, y: h, z: z + h * 1.2 }, target: { x, y: 0, z } };
}

export function createSession(o: SessionOptions): Session {
  const { scenarios, storage, driver, world, hooks } = o;
  const byId = (id: string): ScenarioDef => {
    const s = scenarios.find((x) => x.id === id);
    if (s === undefined) throw new Error(`session: unknown mission "${id}" (known: ${scenarios.map((x) => x.id).join(', ')})`);
    return s;
  };
  let campaign: CampaignProgress = { schemaVersion: 1, missions: { ...EMPTY_CAMPAIGN.missions } };
  let current: ScenarioDef = byId(driver.sim.state.scenario.id);
  /** Every mission can be picked at any time (owner decision, M2): the campaign order is a suggestion, never a lock. */
  function openCards(): SessionState['missions'] {
    return missionCards(campaign, scenarios).map((m) => ({ ...m, locked: false, lockReason: null }));
  }
  const state = new Cell<SessionState>({
    screen: 'title',
    missionId: null,
    loading: null,
    missions: openCards(),
    saves: [],
    error: null,
  });
  const patch = (p: Partial<SessionState>): void => state.set({ ...state.get(), ...p });
  const card = (id: string): MissionCard => {
    const c = state.get().missions.find((m) => m.id === id);
    if (c === undefined) throw new Error(`session: unknown mission "${id}"`);
    return c;
  };

  /** Site load in flight, so brief and start share one fetch. */
  let siteLoad: { siteId: string; done: Promise<void> } | null = null;
  function loadSite(siteId: string): Promise<void> {
    if (world.loadSite === undefined) return Promise.resolve();
    if (world.siteId === siteId && siteLoad === null) return Promise.resolve();
    if (siteLoad !== null && siteLoad.siteId === siteId) return siteLoad.done;
    const load = world.loadSite;
    const done = load
      .call(world, siteId)
      .then(() => hooks.siteLoaded())
      .finally(() => {
        if (siteLoad?.done === done) siteLoad = null;
      });
    siteLoad = { siteId, done };
    return done;
  }

  const simWorld = (): WorldStore => world.simStore ?? world.store;
  const ground: GroundQuery | undefined =
    world.ground === undefined ? undefined : (x, y, z) => (world.ground as NonNullable<GameWorld['ground']>).materialAt(x, y, z);
  const simOptions = ground === undefined ? {} : { ground };

  /** Scorecard bookkeeping of the sim in the driver. */
  let completionSeen = false;
  let scorecardIn = Number.POSITIVE_INFINITY;
  let sinceAutosave = 0;
  let autosaveSeq = 0;
  let saving: Promise<unknown> = Promise.resolve();

  function attach(sim: GameSim, scenario: ScenarioDef, reason: 'start' | 'restart' | 'load'): void {
    hooks.simDetaching();
    current = scenario;
    driver.attach(sim);
    const snap = driver.snapshot();
    completionSeen = snap.mission.complete;
    scorecardIn = Number.POSITIVE_INFINITY;
    sinceAutosave = 0;
    autosaveSeq = snap.feed.length > 0 ? (snap.feed[snap.feed.length - 1]?.seq ?? 0) : 0;
    hooks.simAttached(scenario, reason);
  }

  function record(result: MissionResult, missionId: string): void {
    const best = campaign.missions[missionId];
    if (best !== undefined && best.stars > result.stars) return;
    campaign = { schemaVersion: 1, missions: { ...campaign.missions, [missionId]: result } };
    patch({ missions: openCards() });
    storage.writeCampaign(campaign).catch((err) => patch({ error: `The campaign profile was not saved: ${message(err)}` }));
  }

  async function writeSave(slot: string): Promise<SaveSlotInfo> {
    const s = state.get();
    if (s.screen !== 'playing' && s.screen !== 'scorecard') throw new Error('session: there is no mission in play to save');
    const snap = driver.snapshot();
    const log = world.edits?.save() ?? { text: '', edits: 0, hash: '' };
    const save = driver.sim.save({
      worldDataVersion: world.worldVersion ?? 'unversioned',
      ...(log.edits > 0 ? { editLog: { key: `save.${slot}.edits`, edits: log.edits, hash: log.hash } } : {}),
    });
    const info: SaveSlotInfo = {
      slot,
      scenarioId: current.id,
      title: current.title,
      date: snap.date,
      tick: snap.tick,
      savedAt: new Date().toISOString(),
    };
    const rec: SaveRecord = { info, save, editLog: log.text };
    const write = saving.then(
      () => storage.writeSave(rec),
      () => storage.writeSave(rec),
    );
    saving = write.catch(() => undefined);
    await write;
    patch({ saves: await storage.listSaves() });
    return info;
  }

  function autosave(): void {
    sinceAutosave = 0;
    writeSave(AUTOSAVE_SLOT).catch((err) => {
      console.error(`autosave failed: ${message(err)}`);
      patch({ error: `Autosave failed: ${message(err)}` });
    });
  }

  async function begin(
    scenario: ScenarioDef,
    make: () => GameSim,
    reason: 'start' | 'restart' | 'load',
    before?: () => void,
  ): Promise<void> {
    const back = state.get().screen;
    patch({ screen: 'loading', missionId: scenario.id, loading: { label: `Loading ${scenario.title}`, progress: 0.2 }, error: null });
    try {
      await loadSite(scenario.siteId);
      patch({ loading: { label: `Loading ${scenario.title}`, progress: 0.8 } });
      // A site that was already loaded keeps the previous mission's voxel edits: start from the pristine ground.
      world.edits?.reset();
      before?.();
      attach(make(), scenario, reason);
      patch({ screen: 'playing', loading: null });
    } catch (err) {
      const fallback = back === 'loading' ? 'title' : back;
      patch({ screen: fallback, loading: null, error: message(err), missionId: fallback === 'title' ? null : state.get().missionId });
      throw err;
    }
  }

  const startScenario = (scenario: ScenarioDef): Promise<void> =>
    begin(scenario, () => createSim(scenario, o.seed, simWorld(), simOptions), 'start');

  const port: SessionPort = {
    state,
    brief(missionId) {
      card(missionId);
      const scenario = byId(missionId);
      patch({ screen: 'briefing', missionId, error: null });
      const rect = world.siteRect?.(scenario.siteId);
      if (rect !== undefined && !scenario.sandbox) hooks.fly(overSite(rect));
      // Fetch the site while the player reads; start() waits for the same load.
      loadSite(scenario.siteId).catch((err) => patch({ error: message(err) }));
    },
    start(missionId) {
      card(missionId);
      return startScenario(byId(missionId));
    },
    save(slot = AUTOSAVE_SLOT) {
      return writeSave(slot);
    },
    async load(slot) {
      const name = slot ?? state.get().saves[0]?.slot;
      if (name === undefined) throw new Error('session: there is no save to load');
      let rec: SaveRecord;
      try {
        rec = await storage.readSave(name);
      } catch (err) {
        patch({ error: message(err) });
        throw err;
      }
      const scenario = byId(rec.save.scenarioId);
      await begin(
        scenario,
        () => loadSim(rec.save, simWorld(), simOptions),
        'load',
        // Load order (decision 9): site, manual edit log, then the sim replays its own carves.
        () => {
          if (rec.save.editLog !== undefined) {
            if (world.edits === undefined) throw new Error('session: this world cannot replay the hand digs of the save');
            world.edits.load(rec.editLog, rec.save.editLog);
          }
        },
      );
    },
    restart() {
      const s = state.get();
      if (s.screen !== 'playing' && s.screen !== 'scorecard')
        return Promise.reject(new Error('session: there is no mission in play to restart'));
      const scenario = current;
      return begin(scenario, () => createSim(scenario, driver.sim.state.seed, simWorld(), simOptions), 'restart');
    },
    async toTitle() {
      const s = state.get();
      if (s.screen === 'playing' || s.screen === 'scorecard') {
        try {
          await writeSave(AUTOSAVE_SLOT);
        } catch (err) {
          patch({ error: `The game was not saved: ${message(err)}` });
        }
      }
      scorecardIn = Number.POSITIVE_INFINITY;
      patch({ screen: 'title', missionId: null, loading: null });
      hooks.flyToBay();
    },
    nextMission() {
      const campaignOrder = scenarios.filter((x) => x.sandbox !== true);
      const at = campaignOrder.findIndex((x) => x.id === current.id);
      const next = at >= 0 ? campaignOrder[at + 1] : undefined;
      if (next === undefined) return Promise.reject(new Error('session: this was the last mission; free build is open'));
      scorecardIn = Number.POSITIVE_INFINITY;
      port.brief(next.id);
      return Promise.resolve();
    },
    keepPlaying() {
      if (state.get().screen !== 'scorecard') throw new Error('session: keepPlaying is only for the scorecard');
      patch({ screen: 'playing' });
    },
  };

  function onSnapshot(snap: GameSnapshot): void {
    const s = state.get();
    if (s.screen !== 'playing') return;
    if (snap.mission.complete && !completionSeen) {
      completionSeen = true;
      if (snap.mission.result !== null) record(snap.mission.result, current.id);
      scorecardIn = SCORECARD_DELAY_S;
      autosave();
    }
    let wanted = false;
    for (const item of snap.feed) {
      if (item.seq <= autosaveSeq) continue;
      autosaveSeq = item.seq;
      if (AUTOSAVE_KINDS.has(item.kind)) wanted = true;
    }
    if (wanted) autosave();
  }
  driver.readable.subscribe(onSnapshot);

  return {
    port,
    scenario: () => current,
    startUnlocked: (missionId) => startScenario(byId(missionId)),
    async restore() {
      try {
        const stored = await storage.readCampaign();
        if (stored !== null) campaign = stored;
        patch({ missions: openCards(), saves: await storage.listSaves() });
      } catch (err) {
        patch({ error: `Saved games are unavailable: ${message(err)}` });
      }
    },
    update(dtSeconds) {
      const s = state.get();
      if (s.screen !== 'playing') return;
      if (scorecardIn !== Number.POSITIVE_INFINITY) {
        scorecardIn -= dtSeconds;
        if (scorecardIn <= 0) {
          scorecardIn = Number.POSITIVE_INFINITY;
          patch({ screen: 'scorecard' });
        }
      }
      sinceAutosave += dtSeconds;
      if (sinceAutosave >= AUTOSAVE_INTERVAL_S && driver.tick > 0) autosave();
    },
    idle: () => saving.then(() => undefined),
  };
}
