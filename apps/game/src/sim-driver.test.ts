import { Material } from '@bayvox/core';
import { OverlayLayer } from '@bayvox/render';
import { PORTAL_PROJECT_ID, THE_PORTAL } from '@bayvox/scenarios';
import { createSim, type GameCommand } from '@bayvox/sim';
import { ChunkWorldStore, clearColumnSample } from '@bayvox/world';
import { expect, test } from 'vitest';
import { DAYS_PER_SECOND, MAX_TICKS_PER_FRAME, SimDriver } from './sim-driver.ts';

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
  return new SimDriver(THE_PORTAL, 3, world, () => 5);
}

test('commands are validated at once, queued, and applied at the next frame without advancing a paused clock', () => {
  const d = driver();
  expect(() => d.command({ t: 'noop' })).toThrow(/noop/);
  d.command({ t: 'setSpeed', speed: 0 });
  for (const c of PLAN) d.command(c);
  expect(d.pending).toBe(PLAN.length + 1);
  expect(d.snapshot().projects).toEqual([]);
  d.advance(5);
  expect(d.pending).toBe(0);
  expect(d.tick).toBe(0);
  expect(d.snapshot().projects.map((p) => p.status)).toEqual(['draft']);
});

test('advance turns wall time into game days at the sim speed, capped per frame', () => {
  const d = driver();
  // Speed 1 at the start: half a second is one day, the remainder carries over.
  d.advance(0.3);
  expect(d.tick).toBe(0);
  d.advance(0.3);
  expect(d.tick).toBe(1);
  d.command({ t: 'setSpeed', speed: 100 });
  d.advance(0.1);
  expect(d.tick).toBe(1 + 0.1 * DAYS_PER_SECOND * 100);
  // A one second stall at 100x would be 200 days: exactly the cap. Ten seconds are still one cap.
  d.advance(10);
  expect(d.tick).toBe(21 + MAX_TICKS_PER_FRAME);
  d.advance(0);
  expect(d.tick).toBe(21 + MAX_TICKS_PER_FRAME);
});

test('step runs exact days and matches a bare sim; the world is carved and the overlay follows', () => {
  const world = flatWorld();
  const d = driver(world);
  const overlay = new OverlayLayer();
  for (const c of [...PLAN, APPROVE]) d.command(c);
  d.step(0);
  d.syncOverlay(overlay);
  // A planned line and two station pins.
  expect(overlay.has(`sim.${PORTAL_PROJECT_ID}.alignment`)).toBe(true);
  expect(overlay.has(`sim.${PORTAL_PROJECT_ID}.station.transit-center`)).toBe(true);
  expect(overlay.size).toBe(3);

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

  // The first cut-and-cover front starts at the first waypoint: rock before (checked on an untouched
  // world), air now.
  const first = d.snapshot().projects[0]?.waypoints[0];
  if (first === undefined) throw new Error('project has no waypoints');
  const voxel = { x: Math.floor(first.x), y: Math.floor(first.y), z: Math.floor(first.z) };
  expect(flatWorld().getVoxel(voxel)).toBe(Material.ROCK);
  expect(world.getVoxel(voxel)).toBe(Material.AIR);
  d.syncOverlay(overlay);
  const headings = d.snapshot().projects[0]?.tbms.length ?? 0;
  expect(headings).toBeGreaterThan(0);
  expect(overlay.size).toBe(3 + headings);
  expect(() => d.step(-1)).toThrow(/non-negative integer/);
});
