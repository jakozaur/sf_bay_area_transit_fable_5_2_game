import type { CameraState, GameStats } from '@bayvox/core';
import type { GameSnapshot } from '@bayvox/sim';
import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * URL parameters per project for the real map data (the default world). The software renderer gets a small
 * near field and coarser LOD tiers that match its 320 x 240 frame; the GPU project runs the defaults.
 * `mission=the-portal` skips the title screen and the briefing: the specs that use these start in play.
 */
const SITE_QUERY: Record<string, string> = {
  gpu: 'freeze=1&radius=8&mission=the-portal',
  swgl: 'freeze=1&radius=2&detail=32&far=512&mission=the-portal',
};

/** The same without a mission: the app boots on its title screen. */
const TITLE_QUERY: Record<string, string> = {
  gpu: 'radius=8',
  // Frozen: the software renderer needs most of a second per frame, and a live clock redraws the water every frame.
  swgl: 'freeze=1&radius=2&detail=32&far=512',
};

/** URL parameters per project for the seeded synthetic world: renderer and input tests that must not depend on map data. */
const SYNTHETIC_QUERY: Record<string, string> = {
  gpu: 'freeze=1&world=synthetic&size=16&radius=8&mission=the-portal',
  // An 8-chunk world with a 4 x 4 chunk near field: room to pan without reaching the edge of the world.
  swgl: 'freeze=1&world=synthetic&size=8&radius=2&mission=the-portal',
};

/** The one console message tolerated: SwiftShader reports every screenshot readback as a performance warning. */
const BROWSER_NOISE = /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/;

export interface Session {
  /** Page and console errors seen so far. Tests assert it is empty at the end. */
  errors: string[];
  stats(): Promise<GameStats>;
  settled(): Promise<void>;
  snapshot(): Promise<GameSnapshot>;
  /** Saves a PNG of the viewport into the test's output directory and returns its bytes. */
  shot(name: string): Promise<Buffer>;
}

async function open(page: Page, testInfo: TestInfo, queries: Record<string, string>, extraQuery: string): Promise<Session> {
  const query = queries[testInfo.project.name];
  if (query === undefined) throw new Error(`no URL parameters defined for project ${testInfo.project.name}`);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    // Chromium's own note about page.screenshot() reading the software-GL canvas back; not from the app.
    if (BROWSER_NOISE.test(m.text())) return;
    errors.push(`${m.type()}: ${m.text()}`);
  });
  // Extra parameters override the project defaults.
  const params = new URLSearchParams(query);
  for (const [k, v] of new URLSearchParams(extraQuery)) params.set(k, v);
  await page.goto(`/?${params}`);
  await page.evaluate(() => window.__game.ready);
  const session: Session = {
    errors,
    stats: () => page.evaluate(() => window.__game.stats()),
    settled: () =>
      page.evaluate(() => {
        const settled = window.__game.settled;
        if (settled === undefined) throw new Error('hook has no settled()');
        return settled.call(window.__game);
      }),
    snapshot: () =>
      page.evaluate(() => {
        const snapshot = window.__game.snapshot;
        if (snapshot === undefined) throw new Error('hook has no snapshot()');
        return snapshot.call(window.__game);
      }) as Promise<GameSnapshot>,
    shot: (name) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) }),
  };
  await session.settled();
  return session;
}

/** Opens the app on the real map data, frozen (fixed time, instant camera, sim clock stopped), and waits for the first full view. */
export function openGame(page: Page, testInfo: TestInfo, extraQuery = ''): Promise<Session> {
  return open(page, testInfo, SITE_QUERY, extraQuery);
}

/** Opens the app the way a player gets it: title screen over the whole-Bay view, live clock (frozen on the software renderer). */
export function openTitle(page: Page, testInfo: TestInfo, extraQuery = ''): Promise<Session> {
  return open(page, testInfo, TITLE_QUERY, extraQuery);
}

/** Same on the synthetic world. */
export function openSynthetic(page: Page, testInfo: TestInfo, extraQuery = ''): Promise<Session> {
  return open(page, testInfo, SYNTHETIC_QUERY, extraQuery);
}

/**
 * Projects a world point (metres) to viewport pixels with the camera the app reports. Returns null when
 * the point is behind the camera. The same pinhole maths as the renderer: y up, vertical field of view.
 */
export async function project(page: Page, world: { x: number; y: number; z: number }): Promise<{ x: number; y: number } | null> {
  const cam: CameraState = await page.evaluate(() => {
    const camera = window.__game.camera;
    if (camera === undefined) throw new Error('hook has no camera()');
    return camera.call(window.__game);
  });
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  const sub = (a: number[], b: number[]): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as number[];
  const cross = (a: number[], b: number[]): number[] =>
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] as number[];
  const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = (a: number[]): number[] => a.map((v) => v / Math.hypot(...a));
  const eye = [cam.position.x, cam.position.y, cam.position.z];
  const forward = unit(sub([cam.target.x, cam.target.y, cam.target.z], eye));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const rel = sub([world.x, world.y, world.z], eye);
  const depth = dot(rel, forward);
  if (depth <= 0) return null;
  const t = Math.tan((cam.fovYDeg * Math.PI) / 360);
  const ndcX = dot(rel, right) / (depth * t * cam.aspect);
  const ndcY = dot(rel, up) / (depth * t);
  return { x: ((ndcX + 1) / 2) * viewport.width, y: ((1 - ndcY) / 2) * viewport.height };
}

/** Colour statistics of the square of `halfPx` pixels around a world point's projection. Throws if it is off screen. */
export async function colourAt(page: Page, png: Buffer, world: { x: number; y: number; z: number }, halfPx: number): Promise<ColourStats> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('no viewport');
  const p = await project(page, world);
  if (p === null || p.x < halfPx || p.y < halfPx || p.x > viewport.width - halfPx || p.y > viewport.height - halfPx) {
    throw new Error(`world point (${world.x}, ${world.y}, ${world.z}) projects off screen: ${JSON.stringify(p)}`);
  }
  return colourStats(page, png, [
    (p.x - halfPx) / viewport.width,
    (p.y - halfPx) / viewport.height,
    (p.x + halfPx) / viewport.width,
    (p.y + halfPx) / viewport.height,
  ]);
}

export interface ColourStats {
  /** Distinct colours on a coarse grid: a blank or single-colour frame has one. */
  distinct: number;
  /** Fractions of sampled pixels that are clearly blue (water, sky), clearly green (grass) and near black. */
  blue: number;
  green: number;
  black: number;
}

/** Colour statistics of a PNG, optionally of a sub-rectangle given as fractions of the frame [x0, y0, x1, y1]. */
export async function colourStats(page: Page, png: Buffer, rect: [number, number, number, number] = [0, 0, 1, 1]): Promise<ColourStats> {
  return page.evaluate(
    async ([b64, r]) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (ctx === null) throw new Error('no 2d context');
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const [fx0, fy0, fx1, fy1] = r as [number, number, number, number];
      const seen = new Set<number>();
      let n = 0;
      let blue = 0;
      let green = 0;
      let black = 0;
      for (let y = Math.floor(fy0 * bitmap.height); y < fy1 * bitmap.height; y++) {
        for (let x = Math.floor(fx0 * bitmap.width); x < fx1 * bitmap.width; x++) {
          const i = (y * bitmap.width + x) * 4;
          const red = data[i] as number;
          const g = data[i + 1] as number;
          const b = data[i + 2] as number;
          seen.add((red << 16) | (g << 8) | b);
          n++;
          if (b > red + 30 && b > g + 10) blue++;
          else if (g > red + 20 && g > b + 30) green++;
          if (red + g + b < 40) black++;
        }
      }
      return { distinct: seen.size, blue: blue / n, green: green / n, black: black / n };
    },
    [png.toString('base64'), rect] as const,
  );
}

/** Counts distinct colours on a coarse grid of the screenshot: a blank or single-colour frame has one. */
export async function distinctColours(page: Page, png: Buffer): Promise<number> {
  return (await colourStats(page, png)).distinct;
}

export function expectNoErrors(session: Session): void {
  expect(session.errors).toEqual([]);
}

/** The bore speed buttons of the top bar: Regular, Faster, Skip to end. */
export type BoreSpeed = 1 | 10 | 100;

/** Answers the event card on screen, if any, with the first option that can be afforded. Returns the event id, or null without a card. */
export async function answerCard(page: Page, game: Session): Promise<string | null> {
  const event = (await game.snapshot()).events[0];
  if (event === undefined) return null;
  const card = page.getByTestId('event-card');
  await expect(card).toBeVisible();
  await card.locator('button.bv-choice:not([disabled])').first().click();
  // The card is gone (another may follow at once: it has another uid).
  await expect.poll(async () => (await game.snapshot()).events.some((e) => e.uid === event.uid)).toBe(false);
  return event.id;
}

/**
 * Plays on with the time controls of the top bar until `done` holds, the way a player does: event cards are
 * answered, "Next decision" is pressed whenever time stands with no machine boring, and the `bore` button
 * (Skip to end unless told otherwise) is pressed while one bores. Gates are the caller's decisions: `done`
 * must hold at any gate the run reaches. Returns the ids of the event cards answered.
 */
export async function playOn(
  page: Page,
  game: Session,
  done: (s: GameSnapshot) => boolean,
  timeoutMs: number,
  bore: BoreSpeed = 100,
): Promise<string[]> {
  const answered: string[] = [];
  const t0 = Date.now();
  for (;;) {
    const id = await answerCard(page, game);
    if (id !== null) {
      answered.push(id);
      continue;
    }
    const s = await game.snapshot();
    if (s.events.length > 0) continue;
    if (done(s)) return answered;
    if (s.clock.hold === 'gate') throw new Error(`playOn: at a gate at ${s.date} and not done: ${s.nextAction.kind}, ${s.nextAction.hint}`);
    if (Date.now() - t0 > timeoutMs)
      throw new Error(`playOn: not done after ${timeoutMs} ms at ${s.date}: ${s.nextAction.kind}, ${s.nextAction.hint}`);
    const mode = await page.getByTestId('time').getAttribute('data-mode');
    const button = page.getByTestId(mode === 'bore' ? `speed-${bore}` : 'time-next');
    // A card or a change of state may come between the look and the click: the next round sees it.
    if ((await button.count()) === 1 && (await button.getAttribute('aria-pressed')) !== 'true' && (await button.isEnabled()))
      await button.click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(100);
  }
}
