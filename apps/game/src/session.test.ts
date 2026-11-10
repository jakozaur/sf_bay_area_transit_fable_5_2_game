import type { CameraBookmark } from '@bayvox/core';
import { PORTAL_PROJECT_ID, playMission, SCENARIOS } from '@bayvox/scenarios';
import { createSim, type ScenarioDef } from '@bayvox/sim';
import { ChunkWorldStore, clearColumnSample } from '@bayvox/world';
import { expect, test } from 'vitest';
import type { GameWorld } from './game-world.ts';
import { createSession, SCORECARD_DELAY_S, type Session } from './session.ts';
import { SimDriver } from './sim-driver.ts';
import { createMemoryStore, GameStorage, type KeyValueStore } from './storage.ts';

const PORTAL = SCENARIOS[0] as ScenarioDef;

interface Rig {
  session: Session;
  driver: SimDriver;
  log: string[];
  sites: string[];
  kv: KeyValueStore;
}

/** Site id the rig's world fails to load, or null. */
let failSite: string | null = null;

/** A session over a flat rock world with two "sites" that only record that they were loaded. */
function rig(kv: KeyValueStore = createMemoryStore()): Rig {
  const store = new ChunkWorldStore({
    voxelSizeM: 1,
    source: {
      sampleColumn(_x, _z, out) {
        clearColumnSample(out);
        out.surfaceM = 10;
      },
    },
  });
  const log: string[] = [];
  const sites: string[] = [];
  let siteId = 'portal';
  const world: GameWorld = {
    store,
    min: { x: 0, y: -96, z: -100_000 },
    max: { x: 100_000, y: 352, z: 0 },
    seaLevel: 0,
    bookmarks: [],
    get siteId() {
      return siteId;
    },
    siteRect: () => [0, -1000, 1000, 0],
    worldVersion: 'test-world',
    async loadSite(id) {
      if (id === failSite) throw new Error(`world data: ${id}.bin is missing`);
      sites.push(id);
      siteId = id;
    },
    decorate() {},
    groundAt: () => 10,
    summary: 'test',
  };
  const driver = new SimDriver(createSim(PORTAL, 1));
  const session = createSession({
    scenarios: SCENARIOS,
    seed: 5,
    storage: new GameStorage(kv),
    driver,
    world,
    hooks: {
      siteLoaded: () => log.push('siteLoaded'),
      simDetaching: () => log.push('detach'),
      simAttached: (s, reason) => log.push(`${reason}:${s.id}`),
      fly: (_pose: CameraBookmark) => log.push('fly'),
      flyToBay: () => log.push('bay'),
    },
  });
  return { session, driver, log, sites, kv };
}

test('title, briefing, start: screens, locks and the hooks in order', async () => {
  const { session, driver, log, sites } = rig();
  const port = session.port;
  expect(port.state.get()).toMatchObject({ screen: 'title', missionId: null, saves: [], error: null });
  expect(port.state.get().missions.map((m) => m.locked)).toEqual([false, true, true, true, false]);
  expect(() => port.brief('googleplex-spur')).toThrow(/locked. Open The Portal first/);
  expect(() => port.brief('nope')).toThrow(/unknown mission "nope"/);
  await expect(port.start('googleplex-spur')).rejects.toThrow(/locked/);

  port.brief('the-portal');
  expect(port.state.get()).toMatchObject({ screen: 'briefing', missionId: 'the-portal' });
  expect(log).toEqual(['fly']);
  await port.start('the-portal');
  expect(port.state.get()).toMatchObject({ screen: 'playing', missionId: 'the-portal', loading: null });
  // The site was already loaded, so no site hook; the old sim is detached before the new one is attached.
  expect(sites).toEqual([]);
  expect(log).toEqual(['fly', 'detach', 'start:the-portal']);
  expect(driver.sim.state.seed).toBe(5);
  expect(session.scenario().id).toBe('the-portal');
  // The deep link ignores the campaign lock and loads the other site.
  await session.startUnlocked('googleplex-spur');
  expect(sites).toEqual(['googleplex']);
  expect(log.slice(-3)).toEqual(['siteLoaded', 'detach', 'start:googleplex-spur']);
});

test('a mission that fails to load goes back to where it came from with the reason', async () => {
  const { session, driver, log } = rig();
  const port = session.port;
  // Dumbarton plays on the "meta" site, which this rig's world refuses to load.
  failSite = 'meta';
  port.brief('the-portal');
  await expect(session.startUnlocked('dumbarton-to-meta')).rejects.toThrow(/meta.bin is missing/);
  expect(port.state.get()).toMatchObject({ screen: 'briefing', loading: null });
  expect(port.state.get().error).toMatch(/meta.bin is missing/);
  // Nothing was attached: the sim of before is still the one in the driver.
  expect(log).toEqual(['fly']);
  expect(driver.sim.state.scenario.id).toBe('the-portal');
  failSite = null;
  await port.start('the-portal');
  expect(port.state.get()).toMatchObject({ screen: 'playing', error: null });
});

test('save and load restore the same sim; restart goes back to day one; the title lists the save', async () => {
  const kv = createMemoryStore();
  const a = rig(kv);
  await expect(a.session.port.save()).rejects.toThrow(/no mission in play/);
  await a.session.port.start('the-portal');
  a.driver.command({ t: 'useOfficialPlan' });
  a.driver.command({ t: 'approveProject', projectId: PORTAL_PROJECT_ID });
  a.driver.step(200);
  const info = await a.session.port.save();
  expect(info).toMatchObject({ slot: 'auto', scenarioId: 'the-portal', title: 'The Portal', tick: 200 });
  const hash = a.driver.sim.hash();

  // Another page load: the same storage, a fresh session.
  const b = rig(kv);
  await b.session.restore();
  expect(b.session.port.state.get().saves.map((s) => s.tick)).toEqual([200]);
  await b.session.port.load();
  expect(b.session.port.state.get()).toMatchObject({ screen: 'playing', missionId: 'the-portal' });
  expect(b.driver.sim.hash()).toBe(hash);
  expect(b.log.at(-1)).toBe('load:the-portal');
  await expect(b.session.port.load('nope')).rejects.toThrow(/no save in slot "nope"/);
  expect(b.session.port.state.get().error).toMatch(/nope/);

  await b.session.port.restart();
  expect(b.driver.tick).toBe(0);
  expect(b.driver.sim.state.seed).toBe(5);
  expect(b.driver.snapshot().projects).toEqual([]);
  expect(b.log.at(-1)).toBe('restart:the-portal');

  await b.session.port.toTitle();
  expect(b.session.port.state.get()).toMatchObject({ screen: 'title', missionId: null });
  expect(b.log.at(-1)).toBe('bay');
  // Leaving for the title saved the restarted game over the autosave.
  expect(b.session.port.state.get().saves.map((s) => s.tick)).toEqual([0]);
});

test('opening the line records the result, unlocks the next mission and brings up the scorecard after the delay', async () => {
  const kv = createMemoryStore();
  const { session, driver } = rig(kv);
  const port = session.port;
  await port.start('the-portal');
  const run = playMission(driver.sim);
  expect(run.complete).toBe(true);
  // The sim was played behind the driver's back: one more sub-step makes the driver publish the opened line.
  driver.stepSubsteps(1);
  // The result is in the profile at once; the scorecard waits for the banner and the first train.
  expect(port.state.get().screen).toBe('playing');
  const card = port.state.get().missions[0];
  expect(card).toMatchObject({ id: 'the-portal', completed: true });
  expect(card?.bestStars).toBe(driver.snapshot().mission.result?.stars);
  expect(port.state.get().missions[1]).toMatchObject({ id: 'googleplex-spur', locked: false });
  session.update(SCORECARD_DELAY_S - 0.1);
  expect(port.state.get().screen).toBe('playing');
  session.update(0.2);
  expect(port.state.get().screen).toBe('scorecard');
  port.keepPlaying();
  expect(port.state.get().screen).toBe('playing');
  // It does not come up a second time by itself.
  session.update(60);
  expect(port.state.get().screen).toBe('playing');
  await session.idle();
  expect((await new GameStorage(kv).readCampaign())?.missions['the-portal']).toEqual(driver.snapshot().mission.result);

  // From the scorecard the next mission is briefed; the last campaign mission has none.
  await port.nextMission();
  expect(port.state.get()).toMatchObject({ screen: 'briefing', missionId: 'googleplex-spur' });
  await session.startUnlocked('oracle-shuttle');
  await expect(port.nextMission()).rejects.toThrow(/last mission/);
});
