import { Material } from '@bayvox/core';
import { PORTAL_PROJECT_ID, THE_PORTAL } from '@bayvox/scenarios';
import { createSim, type GameCommand, type GameSnapshot, SUBSTEPS_PER_DAY } from '@bayvox/sim';
import { ChunkWorldStore, clearColumnSample } from '@bayvox/world';
import { expect, test } from 'vitest';
import { MAX_DAYS_PER_FRAME, SimDriver } from './sim-driver.ts';

const PLAN: GameCommand[] = THE_PORTAL.reference?.commands ?? [];
const APPROVE: GameCommand = { t: 'approveProject', projectId: PORTAL_PROJECT_ID };

/** Flat rock at 10 m everywhere: solid ground wherever the alignment runs. */
function flatWorld(): ChunkWorldStore {
  return new ChunkWorldStore({
    voxelSizeM: 1,
    source: {
      sampleColumn(_x, _z, out) {
        clearColumnSample(out);
        out.surfaceM = 10;
      },
    },
  });
}

function driver(world = flatWorld()): SimDriver {
  return new SimDriver(createSim(THE_PORTAL, 3, world));
}

test('commands are validated at once, queued, and applied at the next frame without advancing a paused clock', () => {
  const d = driver();
  expect(() => d.command({ t: 'noop' })).toThrow(/noop/);
  for (const c of PLAN) d.command(c);
  expect(d.pending).toBe(PLAN.length);
  expect(d.snapshot().projects).toEqual([]);
  const seen: GameSnapshot[] = [];
  d.readable.subscribe((s) => seen.push(s));
  d.advance(5, 0);
  expect(d.pending).toBe(0);
  expect(d.tick).toBe(0);
  expect(d.snapshot().projects.map((p) => p.status)).toEqual(['draft']);
  // The dispatch reached subscribers at once, and the Readable holds the same snapshot.
  expect(seen).toHaveLength(1);
  expect(d.readable.get()).toBe(d.snapshot());
});

test('the calendar stands while only a draft exists, runs at the pace of the clock once approved and stops at a gate', () => {
  const d = driver();
  for (const c of PLAN) d.command(c);
  d.advance(1, 1);
  expect(d.clock().daysPerSecond).toBe(0);
  expect(d.tick).toBe(0);
  d.command(APPROVE);
  d.advance(0, 1);
  const pace = d.clock().daysPerSecond;
  expect(d.clock()).toMatchObject({ mode: 'lapse', hold: null });
  expect(pace).toBeGreaterThan(0);
  // One tenth of a second buys a tenth of the pace in days; the fraction carries over.
  d.advance(0.1, 1);
  expect(d.tick).toBe(Math.floor(pace * 0.1));
  expect(d.dayAlpha()).toBeCloseTo((pace * 0.1) % 1, 6);
  // A stalled frame at 100x is capped, the excess is dropped.
  const before = d.tick;
  d.advance(10, 100);
  expect(d.tick - before).toBeLessThanOrEqual(MAX_DAYS_PER_FRAME + 1);
  // Run on: the clock holds at the first gate (go to tender) however much time is offered.
  for (let i = 0; i < 2000 && d.clock().hold === null; i++) d.advance(0.1, 100);
  expect(d.clock().hold).toBe('gate');
  const held = d.tick;
  d.advance(1, 100);
  expect(d.tick).toBe(held);
  expect(d.readable.get().clock.hold).toBe('gate');
});

test('step runs exact days and matches a bare sim; substeps add up to days; the world is carved', () => {
  const world = flatWorld();
  const d = driver(world);
  for (const c of [...PLAN, APPROVE]) d.command(c);
  d.step(0);
  const bare = createSim(THE_PORTAL, 3);
  bare.dispatch([...PLAN, APPROVE]);
  let ticks = 0;
  while (!d.snapshot().projects[0]?.tbms.some((t) => t.progress > 0.5)) {
    for (const p of d.snapshot().projects)
      if (p.awaiting !== null && p.awaiting !== 'openLine') d.command({ t: p.awaiting, projectId: p.id });
    for (const p of bare.snapshot().projects)
      if (p.awaiting !== null && p.awaiting !== 'openLine') bare.dispatch([{ t: p.awaiting, projectId: p.id }]);
    d.step(30);
    bare.run(30);
    ticks += 30;
    if (ticks > 6000) throw new Error('no heading got half way within 6000 days');
  }
  expect(d.tick).toBe(ticks);
  expect(d.sim.hash()).toBe(bare.hash());
  d.stepSubsteps(SUBSTEPS_PER_DAY);
  bare.run(1);
  expect(d.sim.hash()).toBe(bare.hash());

  // The first cut-and-cover front starts at the first waypoint: rock before (checked on an untouched world), air now.
  const first = d.snapshot().projects[0]?.waypoints[0];
  if (first === undefined) throw new Error('project has no waypoints');
  const voxel = { x: Math.floor(first.x), y: Math.floor(first.y), z: Math.floor(first.z) };
  expect(flatWorld().getVoxel(voxel)).toBe(Material.ROCK);
  expect(world.getVoxel(voxel)).toBe(Material.AIR);
  expect(() => d.step(-1)).toThrow(/non-negative integer/);
});

test('attach replaces the sim, drops queued commands and publishes the new snapshot', () => {
  const d = driver();
  for (const c of PLAN) d.command(c);
  const next = createSim(THE_PORTAL, 9);
  d.attach(next);
  expect(d.pending).toBe(0);
  expect(d.sim).toBe(next);
  expect(d.readable.get().seed).toBe(9);
  expect(d.readable.get().projects).toEqual([]);
});
