import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import proj4 from 'proj4';
import { afterEach, expect, test, vi } from 'vitest';
import { decodeTerrariumPng, loadMosaic, loadTile, lonLatToPixel, Mosaic, tileCachePath } from './terrarium.ts';

/** A terrarium PNG whose elevation at pixel (i, j) is f(i, j), quantized to 1/256 m like the real tiles. */
function makeTilePng(f: (i: number, j: number) => number, size = 256): Uint8Array {
  const png = new PNG({ width: size, height: size });
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const v = Math.round((f(i, j) + 32768) * 256);
      const p = (i + j * size) * 4;
      png.data[p] = v >> 16;
      png.data[p + 1] = (v >> 8) & 0xff;
      png.data[p + 2] = v & 0xff;
      png.data[p + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'terrarium-test-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  vi.unstubAllGlobals();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true });
});

async function cacheTile(dir: string, z: number, x: number, y: number, f: (i: number, j: number) => number): Promise<void> {
  const file = tileCachePath(dir, { z, x, y });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, makeTilePng(f));
}

test('lonLatToPixel matches the slippy-map tile scheme', () => {
  expect(lonLatToPixel(-180, 0, 0).px).toBe(0);
  expect(lonLatToPixel(0, 0, 3)).toEqual({ px: 1024, py: 1024 });
  // Salesforce Transit Center: tile 2621/6331 at z14 by the slippy-map formula, worked by hand.
  const p = lonLatToPixel(-122.3962, 37.7897, 14);
  expect([Math.floor(p.px / 256), Math.floor(p.py / 256)]).toEqual([2621, 6331]);
});

test('lonLatToPixel agrees with proj4 EPSG:3857 across the game box', () => {
  const half = Math.PI * 6378137;
  const size = 256 * 2 ** 14;
  for (let lat = 37.2; lat <= 38.05; lat += 0.17) {
    for (let lon = -122.6; lon <= -121.75; lon += 0.17) {
      const [mx, my] = proj4('EPSG:4326', 'EPSG:3857', [lon, lat]) as [number, number];
      const p = lonLatToPixel(lon, lat, 14);
      expect(p.px).toBeCloseTo(((mx + half) / (2 * half)) * size, 6);
      expect(p.py).toBeCloseTo(((half - my) / (2 * half)) * size, 6);
    }
  }
});

test('decodeTerrariumPng decodes positive, negative and fractional elevations', () => {
  const el = decodeTerrariumPng(
    makeTilePng((i, j) => (i === 0 && j === 0 ? -95.75 : i === 255 && j === 255 ? 1173.5 : i * 0.25)),
    'synthetic',
  );
  expect(el.length).toBe(65536);
  expect(el[0]).toBe(-95.75);
  expect(el[65535]).toBe(1173.5);
  expect(el[3 + 256 * 7]).toBe(0.75);
});

test('decodeTerrariumPng fails loudly on a wrong size or a corrupt file', () => {
  expect(() =>
    decodeTerrariumPng(
      makeTilePng(() => 0, 128),
      'small',
    ),
  ).toThrow(/small is 128 x 128, expected 256 x 256/);
  expect(() => decodeTerrariumPng(new Uint8Array([1, 2, 3, 4]), '14/1/2')).toThrow(/cannot decode PNG 14\/1\/2/);
});

test('Mosaic samples bilinearly at pixel centres and refuses to extrapolate', () => {
  const m = new Mosaic(5, 3, 4, 2, 1);
  const tile = (offset: number): Float32Array =>
    Float32Array.from({ length: 65536 }, (_, k) => offset + (k % 256) + 1000 * Math.floor(k / 256));
  m.setTile({ z: 5, x: 3, y: 4 }, tile(0));
  m.setTile({ z: 5, x: 4, y: 4 }, tile(256));
  const px0 = 3 * 256;
  const py0 = 4 * 256;
  expect(m.sample(px0 + 10.5, py0 + 20.5)).toBe(20010);
  expect(m.sample(px0 + 11, py0 + 21)).toBe(20510.5);
  // Across the tile seam: columns 255 and 256 hold 255 and 256.
  expect(m.sample(px0 + 256, py0 + 0.5)).toBe(255.5);
  expect(() => m.sample(px0 + 0.25, py0 + 5)).toThrow(/outside the loaded mosaic/);
  expect(() => m.setTile({ z: 5, x: 5, y: 4 }, tile(0))).toThrow(/does not belong/);
});

test('repairVoids fills seam pixels from valid neighbours and rejects widespread voids', () => {
  const m = new Mosaic(1, 0, 0, 1, 1);
  m.data.fill(10);
  // A vertical one-pixel seam like the real defect, plus a 3 x 3 block that needs two passes.
  for (let j = 40; j < 60; j++) m.data[100 + j * 256] = -2967;
  for (let j = 10; j < 13; j++) for (let i = 10; i < 13; i++) m.data[i + j * 256] = -2967;
  expect(m.repairVoids(-200, 0.001)).toBe(29);
  expect(m.data.every((v) => v === 10)).toBe(true);
  expect(m.repairVoids(-200, 0.001)).toBe(0);
  m.data.fill(-500, 0, 1000);
  expect(() => m.repairVoids(-200, 0.001)).toThrow(/1000 pixels below -200 m/);
});

test('loadTile and loadMosaic read cached tiles without touching the network', async () => {
  const fetchSpy = vi.fn(() => Promise.reject(new Error('network must not be used')));
  vi.stubGlobal('fetch', fetchSpy);
  const dir = tempDir();
  for (const [x, y] of [
    [8, 9],
    [9, 9],
  ] as const) {
    await cacheTile(dir, 6, x, y, (i, j) => x * 256 + i + j);
  }
  const one = await loadTile(dir, { z: 6, x: 8, y: 9 });
  expect(one.fetched).toBe(false);
  expect(one.sha256).toMatch(/^[0-9a-f]{64}$/);
  const res = await loadMosaic(dir, 6, { minPx: 8 * 256 + 10, minPy: 9 * 256 + 10, maxPx: 9 * 256 + 200, maxPy: 9 * 256 + 200 });
  expect(res.tileCount).toBe(2);
  expect(res.fetchedCount).toBe(0);
  expect(res.repairedVoids).toBe(0);
  expect(res.mosaic.sample(9 * 256 + 0.5, 9 * 256 + 3.5)).toBe(9 * 256 + 3);
  expect(fetchSpy).not.toHaveBeenCalled();
  const again = await loadMosaic(dir, 6, { minPx: 8 * 256 + 10, minPy: 9 * 256 + 10, maxPx: 9 * 256 + 200, maxPy: 9 * 256 + 200 });
  expect(again.sourceSha256).toBe(res.sourceSha256);
});

test('a tile that is neither cached nor downloadable fails naming the tile', async () => {
  const requests: { url: string; agent: string }[] = [];
  vi.stubGlobal('fetch', (url: string, init: { headers: Record<string, string> }) => {
    requests.push({ url, agent: init.headers['User-Agent'] ?? '' });
    return Promise.resolve(new Response('missing', { status: 404 }));
  });
  const dir = tempDir();
  await expect(loadTile(dir, { z: 12, x: 655, y: 1583 })).rejects.toThrow(/missing tile 12\/655\/1583: HTTP 404/);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toBe('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/655/1583.png');
  expect(requests[0]?.agent).toMatch(/terrain-bake/);
});

test('a downloaded tile is cached only after it decodes', async () => {
  const good = makeTilePng((i) => i);
  let body: Uint8Array = new Uint8Array([9, 9, 9]);
  let calls = 0;
  vi.stubGlobal('fetch', () => {
    calls++;
    return Promise.resolve(new Response(body, { status: 200 }));
  });
  const dir = tempDir();
  await expect(loadTile(dir, { z: 3, x: 1, y: 2 })).rejects.toThrow(/cannot decode PNG 3\/1\/2/);
  body = good;
  const first = await loadTile(dir, { z: 3, x: 1, y: 2 });
  expect(first.fetched).toBe(true);
  expect(first.elevation[7]).toBe(7);
  const second = await loadTile(dir, { z: 3, x: 1, y: 2 });
  expect(second.fetched).toBe(false);
  expect(second.sha256).toBe(first.sha256);
  expect(calls).toBe(2);
});
