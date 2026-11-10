import { PORTAL_PROJECT_ID, THE_PORTAL } from '@bayvox/scenarios';
import { createSim, type GameCommand } from '@bayvox/sim';
import { expect, type Page, test } from '@playwright/test';
import { expectNoErrors, openGame, type Session } from './helpers.ts';

const AIR = 0;
/** The official plan of The Portal: alignment, methods and stations (packages/scenarios). */
const PLAN: GameCommand[] = THE_PORTAL.reference?.commands ?? [];
const ALIGNMENT = PLAN.find((c) => c.t === 'setAlignment');
if (ALIGNMENT === undefined || ALIGNMENT.t !== 'setAlignment') throw new Error('The Portal has no reference alignment');
const WAYPOINTS = ALIGNMENT.waypoints;

function send(page: Page, commands: GameCommand[]): Promise<void> {
  return page.evaluate((list) => {
    for (const c of list) window.__game.command(c);
  }, commands);
}

/** Materials at the tunnel axis: every waypoint and every segment midpoint. */
function axisVoxels(page: Page): Promise<number[]> {
  const points: { x: number; y: number; z: number }[] = [];
  WAYPOINTS.forEach((w, i) => {
    points.push({ x: w.x, y: w.y, z: w.z });
    const next = WAYPOINTS[i + 1];
    if (next !== undefined) points.push({ x: (w.x + next.x) / 2, y: (w.y + next.y) / 2, z: (w.z + next.z) / 2 });
  });
  return page.evaluate((pts) => pts.map((p) => window.__game.getVoxel?.(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) ?? -1), points);
}

async function project(game: Session) {
  const p = (await game.snapshot()).projects.find((x) => x.id === PORTAL_PROJECT_ID);
  if (p === undefined) throw new Error('the sim has no Portal project');
  return p;
}

test('the sim is deterministic behind the hook: commands, stepSim and the state hash match a headless run', async ({ page }, testInfo) => {
  const game = await openGame(page, testInfo, 'hud=0&seed=7');
  // Frozen clock: the calendar does not move by itself.
  expect((await game.snapshot()).tick).toBe(0);
  expect((await game.snapshot()).scenarioId).toBe('the-portal');
  const hash0 = await page.evaluate(() => window.__game.simHash());
  expect(hash0).toMatch(/^[0-9a-f]{16}$/);

  // A malformed command is refused at the door and changes nothing.
  await expect(page.evaluate(() => window.__game.command({ t: 'noop' }))).rejects.toThrow(/noop/);
  expect(await page.evaluate(() => window.__game.simHash())).toBe(hash0);

  // Commands queue until the next frame: counted in the same task that sent them.
  const queued = await page.evaluate(
    (list) => {
      for (const c of list) window.__game.command(c);
      return window.__game.stats().pendingCommands;
    },
    [...PLAN, { t: 'approveProject', projectId: PORTAL_PROJECT_ID }] as GameCommand[],
  );
  expect(queued).toBe(PLAN.length + 1);
  await page.evaluate(() => window.__game.stepSim?.(400));
  const stats = await game.stats();
  expect(stats).toMatchObject({ tick: 400, pendingCommands: 0 });

  // The same seed and commands in Node give the same state.
  const reference = createSim(THE_PORTAL, 7);
  reference.dispatch([...PLAN, { t: 'approveProject', projectId: PORTAL_PROJECT_ID }]);
  reference.run(400);
  expect(await page.evaluate(() => window.__game.simHash())).toBe(reference.hash());
  const snapshot = await game.snapshot();
  expect(snapshot.date).toBe(reference.snapshot().date);
  expect(snapshot.ledger.totalSpentCents).toBe(reference.snapshot().ledger.totalSpentCents);
  expect(snapshot.ledger.totalSpentCents).toBeGreaterThan(0);
  expectNoErrors(game);
});

test('playthrough of The Portal at 100x: plan, gates, breakthrough, the tunnel is carved out of the city', async ({ page }, testInfo) => {
  // The software project is a boot smoke: a live build with the camera riding the machine is beyond it.
  test.skip(testInfo.project.name !== 'gpu', 'a live playthrough needs the hardware renderer');
  // About ten game years at 100 times the pace of the sim's clock: 10 to 20 s of wall time.
  test.setTimeout(120_000);
  // Live clock: the app loop steps the sim. Event cards stop the clock, so the script answers each with its default option.
  const game = await openGame(page, testInfo, 'freeze=0&hud=0');
  await send(page, [{ t: 'setSpeed', speed: 0 }]);
  await expect.poll(async () => (await game.snapshot()).speed).toBe(0);
  const tick0 = (await game.snapshot()).tick;

  // Before: solid ground all along the tunnel axis.
  const before = await axisVoxels(page);
  expect(before.every((m) => m > 1)).toBe(true);
  await game.shot('portal-before');

  // Draw the official alignment with its stations, approve it, run at full speed.
  await send(page, [...PLAN, { t: 'approveProject', projectId: PORTAL_PROJECT_ID }, { t: 'setSpeed', speed: 100 }]);
  await expect.poll(async () => (await game.snapshot()).tick, { timeout: 10_000 }).toBeGreaterThan(tick0 + 100);
  expect((await project(game)).status).toBe('active');

  // Pass each player gate as it comes up; stop at breakthrough: every heading has reached its end.
  const gates: string[] = [];
  let launched = false;
  await expect
    .poll(
      async () => {
        const p = await project(game);
        const events = (await game.snapshot()).events;
        if (events.length > 0) {
          await send(
            page,
            events.map((e) => ({ t: 'resolveEvent', eventId: e.uid, optionId: e.defaultOption })),
          );
          return false;
        }
        if (p.awaiting !== null && p.awaiting !== 'openLine') {
          gates.push(`${p.awaiting}@${(await game.snapshot()).date}`);
          if (p.awaiting === 'launchTBM') launched = true;
          await send(page, [{ t: p.awaiting, projectId: PORTAL_PROJECT_ID }]);
          return false;
        }
        return launched && p.tbms.length > 0 && p.tbms.every((t) => t.status === 'done');
      },
      { timeout: 90_000, intervals: [250] },
    )
    .toBe(true);
  await send(page, [{ t: 'setSpeed', speed: 0 }]);
  await expect.poll(async () => (await game.snapshot()).speed).toBe(0);

  const snapshot = await game.snapshot();
  const p = await project(game);
  console.log(
    `[${testInfo.project.name}] breakthrough on ${snapshot.date} (tick ${snapshot.tick}), gates ${gates.join(', ')}, ` +
      `spent $${(snapshot.ledger.totalSpentCents / 1e11).toFixed(2)}B, headings ${p.tbms.map((t) => `${t.name} ${t.method} ${Math.round(t.toM - t.fromM)} m`).join('; ')}`,
  );
  expect(gates.map((g) => g.split('@')[0])).toEqual(['advancePhase', 'launchTBM']);
  expect(p.tbms.every((t) => t.progress === 1)).toBe(true);
  // The ledger moved: civil works were paid for, and cash is not what it was.
  expect(snapshot.ledger.totalSpentCents).toBeGreaterThan(1e11);
  expect(snapshot.ledger.byCategory.civil).toBeGreaterThan(0);
  expect(p.spentCents).toBeGreaterThan(0);

  // After: air all along the tunnel axis, in the same world the renderer draws.
  await game.settled();
  const after = await axisVoxels(page);
  expect(after).toEqual(after.map(() => AIR));
  // Seen from above with the cut plane at the track level under 2nd and Harrison.
  const mid = WAYPOINTS[5];
  if (mid === undefined) throw new Error('alignment is shorter than expected');
  await page.evaluate(
    ([x, z]) =>
      window.__game.setCamera?.({
        position: { x: x as number, y: 330, z: (z as number) + 260 },
        target: { x: x as number, y: -20, z: z as number },
      }),
    [mid.x, mid.z],
  );
  await page.evaluate(() => window.__game.setView?.({ cut: true, cutY: -18, cutRadius: 240 }));
  await game.settled();
  await game.shot('portal-tunnel-cut');
  expectNoErrors(game);
});
