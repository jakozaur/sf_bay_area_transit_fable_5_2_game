import { lonLatToWorld } from '@bayvox/core';
import { expect, test } from 'vitest';
import { loadSites, parseSites, siteBoxBbox, siteTileBox } from './sites.ts';

test('sites.json defines the four named sites with tile-aligned boxes', () => {
  const sites = loadSites();
  const boxes = Object.fromEntries(sites.map((s) => [s.id, siteTileBox(s)]));
  expect(boxes.portal).toEqual({ tx0: 9, ty0: 30, nx: 3, ny: 3 });
  for (const id of ['googleplex', 'meta', 'oracle']) expect(boxes[id]).toMatchObject({ nx: 2, ny: 2 });
  for (const s of sites) {
    const [minX, minZ, maxX, maxZ] = siteBoxBbox(siteTileBox(s));
    const c = lonLatToWorld(s.centerLon, s.centerLat);
    expect(maxX - minX).toBe(s.sizeM);
    expect(maxZ - minZ).toBe(s.sizeM);
    // The centre is within half a site tile of the box centre on both axes.
    expect(Math.abs(c.x - (minX + maxX) / 2)).toBeLessThanOrEqual(1024);
    expect(Math.abs(c.z - (minZ + maxZ) / 2)).toBeLessThanOrEqual(1024);
  }
});

test('the portal box covers 4th and King, Salesforce Transit Center and open Bay water', () => {
  const portal = loadSites().find((s) => s.id === 'portal');
  if (portal === undefined) throw new Error('no portal site');
  const [minX, minZ, maxX, maxZ] = siteBoxBbox(siteTileBox(portal));
  for (const [lat, lon] of [
    [37.7765, -122.3947],
    [37.7897, -122.3962],
    [37.798, -122.377],
  ] as const) {
    const w = lonLatToWorld(lon, lat);
    expect(w.x > minX && w.x < maxX && w.z > minZ && w.z < maxZ).toBe(true);
  }
});

test('parseSites rejects malformed configs naming the problem', () => {
  const site = { id: 'a', title: 'A', centerLat: 37.5, centerLon: -122.2, sizeM: 4096 };
  const doc = (sites: unknown[], siteTileSizeM = 2048): string => JSON.stringify({ siteTileSizeM, sites });
  expect(parseSites(doc([site]), 'f')).toEqual([site]);
  expect(() => parseSites(doc([site], 1024), 'f.json')).toThrow(/f.json: siteTileSizeM is 1024/);
  expect(() => parseSites(doc([]), 'f')).toThrow(/no sites/);
  expect(() => parseSites(doc([site, site]), 'f')).toThrow(/duplicate site id a/);
  expect(() => parseSites(doc([{ ...site, sizeM: 5000 }]), 'f')).toThrow(/sizeM 5000 is not a positive multiple/);
  expect(() => parseSites(doc([{ ...site, id: 'Bad Id' }]), 'f')).toThrow(/invalid id/);
  expect(() => siteTileBox({ ...site, centerLon: -121.0 })).toThrow(/leaves the game grid/);
});
