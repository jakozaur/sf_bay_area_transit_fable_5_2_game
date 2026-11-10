/**
 * The site world without a browser: every shipped site loads through createSiteWorld, the voxel store is
 * swapped between them, and the ground query, edits and stamps work on the real data.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MATERIALS, Material, SEA_LEVEL_M, type WorldManifest } from '@bayvox/core';
import { SCENARIOS } from '@bayvox/scenarios';
import {
  type ChunkWorldStore,
  createColumnSample,
  type FetchBytes,
  loadManifest,
  loadRailNetwork,
  loadSite,
  TiledSiteSource,
} from '@bayvox/world';
import { beforeAll, describe, expect, test } from 'vitest';
import type { GameWorld } from './game-world.ts';
import { parseParams } from './params.ts';
import { createSiteWorld } from './site-world.ts';

const DATA_DIR = path.resolve(import.meta.dirname, '../public/data');
const fetchBytes: FetchBytes = async (file) => new Uint8Array(await readFile(path.join(DATA_DIR, file)));
const SITES = ['portal', 'googleplex', 'meta', 'oracle'];

let manifest: WorldManifest;
let world: GameWorld;
const store = (): ChunkWorldStore => world.store as ChunkWorldStore;

beforeAll(async () => {
  manifest = await loadManifest(fetchBytes);
  world = await createSiteWorld(parseParams(''), fetchBytes, 'portal');
});

/** Statistics of the pristine voxels on an 8 m grid over a 768 m square: what a screenshot would show. */
function census(
  x0: number,
  z0: number,
): { land: number; water: number; buildings: number; roads: number; maxTop: number; strata: Set<number> } {
  const out = { land: 0, water: 0, buildings: 0, roads: 0, maxTop: -99, strata: new Set<number>() };
  const s = store();
  for (let x = x0; x < x0 + 768; x += 8) {
    for (let z = z0; z < z0 + 768; z += 8) {
      let y = world.max.y - 1;
      while (y > world.min.y && s.get(x, y, z) === Material.AIR) y--;
      const top = s.get(x, y, z);
      if (top === Material.WATER) out.water++;
      else out.land++;
      if (top >= Material.BUILDING_RESIDENTIAL && top <= Material.BUILDING_TRANSIT) out.buildings++;
      if (top === Material.ROAD) out.roads++;
      out.maxTop = Math.max(out.maxTop, y);
      out.strata.add(s.get(x, -40, z));
    }
  }
  return out;
}

describe('multi-site world on the shipped data', () => {
  test('every site loads, replaces the previous one and voxelizes into a plausible city', async () => {
    expect(world.siteIds).toEqual(SITES);
    const bounds = world.min;
    const bookmarks = world.bookmarks;
    for (const id of [...SITES.slice(1), 'portal']) {
      const previous = world.siteId;
      store().applyEdit({
        t: 'carveCapsule',
        a: { x: world.min.x + 100, y: -5, z: world.min.z + 100 },
        b: { x: world.min.x + 100, y: -5, z: world.min.z + 100 },
        radius: 3,
      });
      await world.loadSite?.(id);
      expect(world.siteId).toBe(id);
      expect(world.siteId).not.toBe(previous);
      const asset = manifest.sites.find((s) => s.id === id);
      expect([world.min.x, world.min.z, world.max.x, world.max.z]).toEqual(asset?.bbox);
      // Same objects, refilled: holders of the bounds and bookmarks see the new site.
      expect(world.min).toBe(bounds);
      expect(world.bookmarks).toBe(bookmarks);
      expect(world.bookmarks).toHaveLength(4);
      for (const b of world.bookmarks.slice(0, 3)) {
        expect(b.target.x).toBeGreaterThan(world.min.x);
        expect(b.target.x).toBeLessThan(world.max.x);
        expect(b.target.z).toBeGreaterThan(world.min.z);
        expect(b.target.z).toBeLessThan(world.max.z);
      }
      // The previous site's chunks and edits are gone.
      expect(store().editLog).toHaveLength(0);
      expect(store().chunkCount).toBe(0);
      // Voxels of the previous site read as empty space now.
      const c = census((world.min.x + world.max.x) / 2 - 384, (world.min.z + world.max.z) / 2 - 384);
      // The middle of a site is not always built up (Googleplex: Shoreline park), but it always has streets.
      expect(c.land, `${id} land`).toBeGreaterThan(2000);
      expect(c.buildings, `${id} buildings`).toBeGreaterThan(10);
      expect(c.roads, `${id} roads`).toBeGreaterThan(100);
      expect(c.maxTop, `${id} roofs`).toBeLessThan(world.max.y - 1);
      for (const m of c.strata) expect(MATERIALS[m]?.solid, `${id} stratum ${m} at -40 m`).toBe(true);
    }
    await expect(world.loadSite?.('atlantis')).rejects.toThrow(/no site "atlantis" \(known: portal, googleplex, meta, oracle\)/);
    expect(world.siteId).toBe('portal');
  });

  test('every scenario names a shipped site; how much of its reference alignment the site covers', () => {
    const coverage: Record<string, string> = {};
    for (const s of SCENARIOS) {
      const asset = manifest.sites.find((x) => x.id === s.siteId);
      expect(asset, `${s.id} site ${s.siteId}`).toBeDefined();
      if (asset === undefined) continue;
      const [minX, minZ, maxX, maxZ] = asset.bbox;
      let inside = 0;
      let total = 0;
      for (const c of s.reference?.commands ?? []) {
        if (c.t !== 'setAlignment') continue;
        for (const w of c.waypoints) {
          total++;
          if (w.x >= minX && w.x < maxX && w.z >= minZ && w.z < maxZ) inside++;
          // In or out of the site, the ground query answers for it: the vector-only fallback.
          expect(world.ground?.contains(w.x, w.z), `${s.id} waypoint in the grid`).toBe(true);
          expect(world.ground?.surfaceM(w.x, w.z)).toBeGreaterThan(-60);
          const surface = world.ground?.surfaceM(w.x, w.z) ?? 0;
          if (w.y < surface - 2)
            expect(MATERIALS[world.ground?.materialAt(w.x, w.y, w.z) ?? 0]?.solid, `${s.id} waypoint at y ${w.y}`).toBe(true);
        }
      }
      coverage[s.id] = `${inside}/${total}`;
    }
    console.info(`reference waypoints inside the scenario's voxel site: ${JSON.stringify(coverage)}`);
    // The Portal is fully inside its site: the first mission is all voxels.
    expect(coverage['the-portal']).toMatch(/^(\d+)\/\1$/);
  });

  test('ground query: site detail inside the site, far raster outside, same answers as the voxels', () => {
    const g = world.ground;
    if (g === undefined) throw new Error('site world has no ground query');
    const x = 21_500.5;
    const z = -64_500.5;
    expect(g.column(x, z).detail).toBe('site');
    for (let y = -60; y < 40; y += 7) {
      const m = store().get(Math.floor(x), y, Math.floor(z));
      const isBuilding = m >= Material.BUILDING_RESIDENTIAL && m <= Material.BUILDING_TRANSIT;
      if (!isBuilding) expect(g.materialAt(x, y + 0.5, z)).toBe(m);
    }
    // Mid-Bay, far from any site: water over Bay Mud.
    const bay = g.column(30_000, -55_000);
    expect(bay.detail).toBe('far');
    expect(bay.waterDepthM).toBeGreaterThan(1);
    expect(g.topM(30_000, -55_000)).toBe(SEA_LEVEL_M);
    expect(g.materialAtDepth(30_000, -55_000, 2)).toBe(Material.BAY_MUD);
    expect(world.groundAt(30_000, -55_000)).toBe(SEA_LEVEL_M);
    // Regional pick: a ray from high above the Bay view comes down on the water.
    const hit = g.raycast({ x: 30_000, y: 20_000, z: -40_000 }, { x: 0, y: -4, z: -3 }, 100_000);
    expect(hit?.water).toBe(true);
    expect(hit?.point.z).toBeCloseTo(-40_000 - (20_000 - SEA_LEVEL_M) * 0.75, 0);
  });

  test('edits: dig, save, restart, load; stamps follow the sim records and are not saved', () => {
    const edits = world.edits;
    const g = world.ground;
    if (edits === undefined || g === undefined) throw new Error('site world has no edits or ground');
    const x = 21_500;
    const z = -64_500;
    const top = Math.round(g.surfaceM(x + 0.5, z + 0.5));
    const region = { min: { x: x - 96, y: -64, z: z - 96 }, max: { x: x + 96, y: 64, z: z + 96 } };
    const pristine = store().hashRegion(region);

    const dug = edits.dig({ x: x + 0.5, y: top - 10, z: z + 0.5 }, 4);
    expect(dug.removedM3).toBe(257);
    expect(dug.dirtyChunks).toBeGreaterThan(0);
    world.simStore?.applyEdit({ t: 'carveCapsule', a: { x: x - 60, y: -20, z }, b: { x: x + 60, y: -20, z }, radius: 3.3 });
    const station = {
      id: 'a',
      name: 'A',
      style: 'compactBox' as const,
      position: { x: x + 0.5, y: -20, z: z + 0.5 },
      yaw: Math.PI / 2,
      lengthM: 60,
      widthM: 18,
      heightM: 8,
      progress: 0.5,
      fitOut: 0,
      open: false,
    };
    const pit = {
      id: 'p',
      tbmId: 't',
      position: { x: x - 60.5, y: -24, z: z + 0.5 },
      yaw: Math.PI / 2,
      lengthM: 20,
      widthM: 12,
      state: 'ready' as const,
    };
    expect(edits.syncStamps({ stations: [station], pits: [pit] })).toBe(2);
    expect(edits.syncStamps({ stations: [station], pits: [pit] })).toBe(0);
    expect(store().get(x + 10, -18, z + 5)).toBe(Material.AIR);
    expect(store().get(x + 10, -13, z + 5)).toBe(Material.CONCRETE_LINING);
    // The pit is open to the sky and lined.
    expect(store().get(x - 60, top + 5, z)).toBe(Material.AIR);
    expect(store().get(x - 60, -25, z)).toBe(Material.CONCRETE_LINING);
    const played = store().hashRegion(region);

    const saved = edits.save();
    expect(saved.edits).toBe(1);
    edits.reset();
    expect(store().hashRegion(region)).toBe(pristine);
    expect(store().editLog).toHaveLength(0);

    // Load order of docs/CONTRACTS.md: site, manual log, sim carves; the stamps follow the snapshot.
    expect(edits.load(saved.text, saved)).toBe(1);
    world.simStore?.applyEdit({ t: 'carveCapsule', a: { x: x - 60, y: -20, z }, b: { x: x + 60, y: -20, z }, radius: 3.3 });
    expect(edits.syncStamps({ stations: [station], pits: [pit] })).toBe(2);
    expect(store().hashRegion(region)).toBe(played);
    expect(() => edits.load(saved.text, { edits: 1, hash: '00' })).toThrow(/the save expects 00/);
    edits.reset();
  });
});

test('tile eviction: a site source limited to one tile gives the same columns as an unlimited one', async () => {
  const site = await loadSite(manifest, 'oracle', fetchBytes, await loadRailNetwork(manifest, fetchBytes));
  const all = new TiledSiteSource(site, 1);
  const one = new TiledSiteSource(site, 1, { maxTiles: 1 });
  const a = createColumnSample();
  const b = createColumnSample();
  const { minX, minZ, maxX, maxZ } = site.bounds;
  // Twelve visits that keep crossing between the four tiles, 400 columns each.
  for (let visit = 0; visit < 12; visit++) {
    const tx = minX + ((visit * 7) % 2) * 2048 + ((visit * 5) % 2) * 0;
    const tz = minZ + ((visit >> 1) % 2) * 2048;
    for (let i = 0; i < 400; i++) {
      const x = tx + ((i * 977 + visit * 131) % 2048) + 0.5;
      const z = tz + ((i * 571 + visit * 17) % 2048) + 0.5;
      all.sampleColumn(x, z, a);
      one.sampleColumn(x, z, b);
      expect(b).toEqual(a);
    }
  }
  expect(maxX - minX).toBe(4096);
  expect(maxZ - minZ).toBe(4096);
  expect(all.tilesResident).toBe(4);
  expect(one.tilesResident).toBe(1);
  expect(one.tilesBuilt).toBeGreaterThan(4);
  expect(() => new TiledSiteSource(site, 1, { maxTiles: 0 })).toThrow(/maxTiles must be at least 1, got 0/);
});
