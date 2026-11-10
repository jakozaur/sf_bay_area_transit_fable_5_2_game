/**
 * The tools against the real sim: every command they send must be accepted (no notice), and the snapshot must
 * acknowledge every edit (no roll-back). The world, camera and overlay are stand-ins; the sim is createSim.
 */
import { type GroundPick, Material, type WorldPos, type WorldStore } from '@bayvox/core';
import { autopilotCommands, type BayServices, createSim, type GameCommand, type GameSnapshot } from '@bayvox/sim';
import { expect, test } from 'vitest';
import { TEST_DESIGN, TEST_PROJECT, TEST_WAYPOINTS, testScenario } from '../../sim/src/test-scenario.ts';
import { connectAnchors, createToolHost, type ToolHost } from './contract.ts';
import { createValue } from './util.ts';

const GROUND = 5;
/** Screen pixel (0, 0) is world (19,000, -66,000): one pixel per metre, seen from straight above. */
const X0 = 19_000;
const Z0 = -66_000;

function setup(): { host: ToolHost; frame(dt?: number): void; snap(): GameSnapshot; sent: GameCommand[]; follows: unknown[] } {
  const scenario = testScenario({ reference: { title: 'Official', commands: TEST_DESIGN, projectId: TEST_PROJECT, source: 'test' } });
  const sim = createSim(scenario, 7, null);
  const snapshot = createValue<GameSnapshot>(sim.snapshot());
  const queue: GameCommand[] = [];
  const sent: GameCommand[] = [];
  const follows: unknown[] = [];
  const noop = (): void => {};
  const services = {
    sim: {
      snapshot,
      command(c: GameCommand): void {
        sent.push(c);
        queue.push(c);
      },
      estimateAlignment: sim.estimateAlignment.bind(sim),
    },
    camera: {
      follow: (t: unknown) => follows.push(t),
      project: (p: WorldPos) => ({ x: p.x - X0, y: p.z - Z0 }),
    },
    world: {
      pick(x: number, y: number): GroundPick {
        const p = { x: x + X0, y: GROUND, z: y + Z0 };
        return {
          voxel: { x: Math.floor(p.x), y: GROUND - 1, z: Math.floor(p.z) },
          face: 0,
          material: Material.SAND,
          point: p,
          groundY: GROUND,
        };
      },
      groundAt: () => GROUND,
      voxelAt: (_x: number, y: number) => (y >= GROUND ? Material.AIR : Material.SAND),
      siteBounds: () => ({ minX: X0, minZ: Z0, maxX: X0 + 4000, maxZ: Z0 + 4000 }),
      dig: () => ({ removedM3: 50, dirtyChunks: 1 }),
    },
    overlay: {
      add: () => ({ id: 'o', update: noop, setVisible: noop, remove: noop }),
      setPreview: noop,
    },
    audio: { cue: noop },
  } as unknown as BayServices;
  const host = createToolHost({ world: {} as WorldStore, services: () => services, anchors: () => connectAnchors(scenario) });
  return {
    host,
    sent,
    follows,
    snap: () => snapshot.get(),
    frame(dt = 1 / 60) {
      // As the app does while paused: commands apply without advancing time.
      sim.dispatch(queue.splice(0));
      snapshot.set(sim.snapshot());
      host.update(dt);
    },
  };
}

const at = (x: number, z: number): { x: number; y: number } => ({ x: x - X0, y: z - Z0 });

test('plan and station tools drive the real sim: every edit is accepted and acknowledged', () => {
  const s = setup();
  s.host.port.activate('plan');
  // Three clicks: the first lands within 60 m of anchor A and snaps to it.
  s.host.handle({ type: 'tool.primary', ...at(20_020, -65_010) });
  s.host.handle({ type: 'tool.primary', ...at(20_600, -65_000) });
  s.host.handle({ type: 'tool.primary', ...at(21_400, -65_300) });
  // Two real seconds of frames: long enough for a refused change to be rolled back.
  for (let i = 0; i < 120; i++) s.frame();
  const id = s.snap().mission.planProjectId;
  let project = s.snap().projects.find((p) => p.id === id);
  expect(s.snap().notices).toEqual([]);
  expect(project?.waypoints.map((w) => [w.x, w.y, w.z])).toEqual([
    [20_000, GROUND - 20, -65_000],
    [20_600, GROUND - 20, -65_000],
    [21_400, GROUND - 20, -65_300],
  ]);
  expect(project?.waypoints[0].geology).toBe('softGround');
  // The readouts carry the sim's own estimate.
  const status = s.host.port.status.get();
  const value = (rid: string): string => status.readouts.find((o) => o.id === rid)?.value ?? '';
  expect(value('length')).toMatch(/^1\.\d\d km$/);
  expect(value('cost')).toMatch(/^\$\d/);
  expect(value('ratio')).toMatch(/^\d+\.\dx /);
  expect(value('radius')).toMatch(/^R \d+ m \(min 150\)$/);
  // Insert on the first segment, drag the new point, lower it, delete it again.
  s.host.handle({ type: 'tool.primary', ...at(20_300, -65_002) });
  s.host.handle({ type: 'pointer.down', ...at(20_300, -65_000), button: 0 });
  s.host.handle({ type: 'pointer.drag', ...at(20_300, -65_060) });
  s.host.handle({ type: 'pointer.up', ...at(20_300, -65_060) });
  s.host.handle({ type: 'tool.adjust', delta: 1 });
  for (let i = 0; i < 120; i++) s.frame();
  project = s.snap().projects.find((p) => p.id === id);
  expect(s.snap().notices).toEqual([]);
  expect(project?.waypoints[1]).toMatchObject({ x: 20_300, y: GROUND - 21, z: -65_060 });
  expect(s.host.undo()).toBe(true);
  expect(s.host.undo()).toBe(true);
  expect(s.host.undo()).toBe(true);
  for (let i = 0; i < 120; i++) s.frame();
  project = s.snap().projects.find((p) => p.id === id);
  expect(project?.waypoints).toHaveLength(3);
  expect(s.snap().notices).toEqual([]);
  // The official plan replaces the draft; editing it keeps its mixed methods.
  s.host.port.invoke('plan.useOfficial');
  s.frame();
  project = s.snap().projects.find((p) => p.id === id);
  expect(project?.waypoints).toEqual(TEST_WAYPOINTS);
  expect(project?.stations).toHaveLength(2);
  s.host.handle({ type: 'tool.primary', ...at(20_125, -65_000) });
  for (let i = 0; i < 120; i++) s.frame();
  project = s.snap().projects.find((p) => p.id === id);
  expect(s.snap().notices).toEqual([]);
  expect(project?.segments.map((g) => g.method)).toEqual(['boredTwin', 'boredTwin', 'boredTwin', 'mined', 'cutAndCover']);
  // Station tool on the real project: place one between the two official stations, then remove it.
  s.host.port.activate('station');
  s.host.handle({ type: 'tool.primary', ...at(20_300, -65_010) });
  s.frame();
  project = s.snap().projects.find((p) => p.id === id);
  expect(s.snap().notices).toEqual([]);
  expect(project?.stations).toHaveLength(3);
  const placed = project?.stations.find((o) => o.id === 'station-3');
  expect(placed?.chainageM).toBeCloseTo(300, 0);
  expect(placed?.depthM).toBeCloseTo(GROUND + 22, 1);
  s.host.handle({ type: 'tool.secondary', ...at(placed?.position.x ?? 0, placed?.position.z ?? 0) });
  s.frame();
  expect(s.snap().projects.find((p) => p.id === id)?.stations).toHaveLength(2);
  expect(s.snap().notices).toEqual([]);
  // Hand digging is charged by the sim at its own price.
  s.host.port.activate('dig');
  s.host.handle({ type: 'tool.primary', ...at(20_300, -65_300) });
  s.frame();
  expect(s.snap().notices).toEqual([]);
  expect(s.snap().handDig.volumeM3).toBe(50);
  expect(s.snap().handDig.cents).toBeGreaterThan(0);
  // Removing the line down to nothing removes the project.
  s.host.port.activate('plan');
  s.host.port.invoke('plan.clear');
  for (let i = 0; i < 120; i++) s.frame();
  expect(s.snap().projects.find((p) => p.id === id)).toBeUndefined();
  expect(s.snap().notices).toEqual([]);
});

test('the drive tool possesses a real heading: the sim accepts every control and reports the driven regime', () => {
  const scenario = testScenario({ reference: { title: 'Official', commands: TEST_DESIGN, projectId: TEST_PROJECT, source: 'test' } });
  const sim = createSim(scenario, 7, null);
  sim.dispatch([{ t: 'useOfficialPlan' }, { t: 'approveProject', projectId: TEST_PROJECT }]);
  // Let the sim's own autopilot pass the gates until a tunnelling machine runs.
  let days = 0;
  sim.run(20_000, (g) => {
    days++;
    if (g.snapshot().projects[0].tbms.some((t) => t.status === 'running' && t.radiusM > 0)) return false;
    return autopilotCommands(g.state);
  });
  const tbm = sim.snapshot().projects[0].tbms.find((t) => t.status === 'running' && t.radiusM > 0);
  if (tbm === undefined) throw new Error(`no machine was running after ${days} days`);
  const snapshot = createValue<GameSnapshot>(sim.snapshot());
  const queue: GameCommand[] = [];
  const follows: unknown[] = [];
  const noop = (): void => {};
  const services = {
    sim: { snapshot, command: (c: GameCommand) => queue.push(c), estimateAlignment: sim.estimateAlignment.bind(sim) },
    camera: { follow: (t: unknown) => follows.push(t), project: (p: WorldPos) => ({ x: p.x - X0, y: p.z - Z0 }) },
    overlay: { add: () => ({ id: 'o', update: noop, setVisible: noop, remove: noop }), setPreview: noop },
    audio: { cue: noop },
  } as unknown as BayServices;
  const host = createToolHost({ world: {} as WorldStore, services: () => services });
  const substeps = (n: number): void => {
    for (let i = 0; i < n; i++) sim.substep(queue.splice(0));
    snapshot.set(sim.snapshot());
    host.update(1 / 60);
  };
  const view = (): GameSnapshot['projects'][number]['tbms'][number] => {
    const t = snapshot.get().projects[0].tbms.find((o) => o.id === tbm.id);
    if (t === undefined) throw new Error(`heading ${tbm.id} is gone`);
    return t;
  };
  const before = snapshot.get().notices.length;
  host.port.activate('drive', { 'drive.headingId': tbm.id });
  expect(follows).toEqual([{ entity: { type: 'tbm', id: tbm.id }, mode: 'cutaway' }]);
  substeps(1);
  expect(view().driven).toBe(true);
  expect(view().autopilot).toBe(false);
  // Steer right for a while: yaw decreases (docs/CONTRACTS.md decision 4) and the machine leaves the plan.
  const yaw0 = view().yaw;
  host.handle({ type: 'drive.axes', steer: 1, pitch: 0 });
  substeps(240 * 5);
  expect(view().steer).toBe(1);
  expect(view().yaw).toBeLessThan(yaw0);
  expect(view().deviation.totalM).toBeGreaterThan(0);
  // S twice: half thrust.
  host.handle({ type: 'drive.thrust', delta: -1 });
  host.handle({ type: 'drive.thrust', delta: -1 });
  host.handle({ type: 'drive.axes', steer: 0, pitch: 0 });
  substeps(2);
  expect(view().thrust).toBe(0.5);
  expect(view().steer).toBe(0);
  // Escape: back to the cruise law, camera released, tool put away.
  host.handle({ type: 'tool.cancel' });
  substeps(1);
  expect(view().autopilot).toBe(true);
  expect(host.active()).toBeNull();
  expect(follows[follows.length - 1]).toBeNull();
  expect(snapshot.get().notices.slice(before)).toEqual([]);
});
