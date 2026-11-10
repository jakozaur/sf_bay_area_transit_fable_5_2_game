import type { PreviewGeometry } from '@bayvox/core';
import { PORTAL_PROJECT_ID, playMission, THE_PORTAL } from '@bayvox/scenarios';
import { createSim, type GameSim, type GameSnapshot } from '@bayvox/sim';
import { expect, test } from 'vitest';
import { SceneBuilder, type SceneInput } from './scene.ts';

const input = (snapshot: GameSnapshot, over: Partial<SceneInput> = {}): SceneInput => ({
  snapshot,
  alpha: 1,
  trainClock: 0,
  preview: null,
  possessedTbmId: null,
  highlight: null,
  live: true,
  ...over,
});

/** The Portal on the official plan, run to the day after its headings launched. */
function launched(): GameSim {
  const sim = createSim(THE_PORTAL, 1, null, { events: false });
  sim.dispatch([{ t: 'useOfficialPlan' }, { t: 'approveProject', projectId: PORTAL_PROJECT_ID }]);
  for (let i = 0; i < 20_000 && sim.snapshot().mission.stage !== 'build'; i++) {
    const next = sim.snapshot().nextAction.command;
    if (next !== null) sim.dispatch([next]);
    else sim.step();
  }
  if (sim.snapshot().mission.stage !== 'build') throw new Error('The Portal never reached construction');
  sim.run(3);
  return sim;
}

test('the snapshot flattens into the scene: every heading, tunnel, station, pit and the alignment', () => {
  const sim = launched();
  const snap = sim.snapshot();
  const p = snap.projects[0];
  if (p === undefined) throw new Error('no project');
  const scene = new SceneBuilder().build(input(snap));
  expect(scene.tbms.map((t) => t.id)).toEqual(p.tbms.map((t) => t.id));
  expect(scene.tunnels.map((t) => t.id)).toEqual(p.tunnels.map((t) => t.id));
  expect(scene.stations).toEqual(p.stations);
  expect(scene.pits).toEqual(p.pits);
  expect(scene.alignments).toEqual([p.alignment]);
  expect(scene.trains).toEqual([]);
  expect(scene.tbms.length).toBeGreaterThan(0);
});

test('a heading of the planned regime is drawn between its pose of yesterday and of today', () => {
  const sim = launched();
  const b = new SceneBuilder();
  const before = sim.snapshot();
  b.build(input(before));
  sim.step();
  const after = sim.snapshot();
  const id = after.projects[0]?.tbms.find((t) => t.status === 'running' && t.rateMPerDay > 0)?.id;
  if (id === undefined) throw new Error('no running heading');
  const at = (s: GameSnapshot) => {
    const t = s.projects[0]?.tbms.find((x) => x.id === id);
    if (t === undefined) throw new Error(`heading ${id} is gone`);
    return t.position;
  };
  const a = at(before);
  const c = at(after);
  expect(Math.hypot(c.x - a.x, c.z - a.z)).toBeGreaterThan(0.5);
  const drawn = (alpha: number) => {
    const t = b.build(input(after, { alpha })).tbms.find((x) => x.id === id);
    if (t === undefined) throw new Error('heading not in the scene');
    return t.position;
  };
  expect(drawn(0)).toEqual(a);
  expect(drawn(1)).toEqual(c);
  const mid = drawn(0.5);
  expect(mid.x).toBeCloseTo((a.x + c.x) / 2, 6);
  expect(mid.z).toBeCloseTo((a.z + c.z) / 2, 6);
  // The follow camera asks for the same pose.
  expect(b.poseOf({ type: 'tbm', id })?.position).toEqual(mid);
  expect(b.poseOf({ type: 'tbm', id: 'nope' })).toBeNull();
  // The lining behind it grows at the same rate, never ahead of what the sim has.
  const tunnelNow = after.projects[0]?.tunnels[0];
  const tunnelDrawn = b.build(input(after, { alpha: 0.5 })).tunnels[0];
  if (tunnelNow === undefined || tunnelDrawn === undefined) throw new Error('no tunnel');
  expect(tunnelDrawn.linedM).toBeLessThanOrEqual(tunnelNow.linedM);
  expect(tunnelDrawn.path).toBe(tunnelNow.path);
});

test('the pit of the possessed machine and a draft under the plan preview are left out', () => {
  const sim = launched();
  const snap = sim.snapshot();
  const p = snap.projects[0];
  const pit = p?.pits[0];
  if (p === undefined || pit === undefined) throw new Error('no pit');
  const b = new SceneBuilder();
  expect(b.build(input(snap, { possessedTbmId: pit.tbmId })).pits.map((x) => x.id)).not.toContain(pit.id);
  expect(b.build(input(snap)).pits.map((x) => x.id)).toContain(pit.id);

  const draft = createSim(THE_PORTAL, 1);
  draft.dispatch([{ t: 'useOfficialPlan' }]);
  const d = draft.snapshot();
  const alignment = d.projects[0]?.alignment;
  if (alignment === undefined) throw new Error('no draft alignment');
  const preview: PreviewGeometry = { kind: 'alignment', alignment: { ...alignment, id: 'preview', state: 'preview' }, stations: [] };
  expect(b.build(input(d)).alignments).toHaveLength(1);
  expect(b.build(input(d, { preview })).alignments).toHaveLength(0);
});

test('an open line shows moving trains and no machines or pits', () => {
  const sim = createSim(THE_PORTAL, 1, null, { events: false });
  expect(playMission(sim).complete).toBe(true);
  const snap = sim.snapshot();
  const b = new SceneBuilder();
  const t0 = b.build(input(snap, { trainClock: 10 }));
  expect(t0.trains.length).toBeGreaterThan(0);
  expect(t0.tbms).toEqual([]);
  expect(t0.pits).toEqual([]);
  expect(t0.tunnels.length).toBeGreaterThan(0);
  const t1 = b.build(input(snap, { trainClock: 25 }));
  const a = t0.trains[0];
  const c = t1.trains[0];
  if (a === undefined || c === undefined) throw new Error('no train');
  expect(Math.hypot(c.position.x - a.position.x, c.position.z - a.position.z)).toBeGreaterThan(20);
  // Off the playing screens the trains are not drawn.
  expect(b.build(input(snap, { live: false })).trains).toEqual([]);
});
