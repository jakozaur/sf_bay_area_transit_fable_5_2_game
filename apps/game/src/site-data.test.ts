/**
 * The real map data, end to end without a browser: the files under public/data (built by `pnpm data:build`
 * and committed) are loaded through the same loader the app uses and voxelized by packages/world.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { lonLatToWorld, Material, SEA_LEVEL_M, type WorldManifest } from '@bayvox/core';
import { createMesherScratch, meshColumnPatch } from '@bayvox/mesher';
import {
  buildingMaterial,
  ChunkWorldStore,
  coarsenFarRaster,
  createColumnPatch,
  createColumnSample,
  type FetchBytes,
  farPatchCounts,
  loadFarRaster,
  loadFarVectors,
  loadManifest,
  loadRailNetwork,
  loadSite,
  PATCH_CELLS,
  type SiteData,
  sampleFarPatch,
  sampleSourcePatch,
  siteGroundM,
  TiledSiteSource,
} from '@bayvox/world';
import { beforeAll, describe, expect, test } from 'vitest';
import { railGroup, simplifyLine } from './network-overlay.ts';

const DATA_DIR = path.resolve(import.meta.dirname, '../public/data');
const fetchBytes: FetchBytes = async (file) => new Uint8Array(await readFile(path.join(DATA_DIR, file)));

let manifest: WorldManifest;
let site: SiteData;

beforeAll(async () => {
  manifest = await loadManifest(fetchBytes);
  site = await loadSite(manifest, 'portal', fetchBytes, await loadRailNetwork(manifest, fetchBytes));
});

describe('site loader on the shipped data', () => {
  test('the manifest lists the portal site as a 3 x 3 tile box and loads completely', () => {
    expect(manifest.sites.map((s) => s.id)).toContain('portal');
    expect(site.tileBox).toEqual({ tx0: 9, ty0: 30, nx: 3, ny: 3 });
    expect(site.bounds).toEqual({ minX: 18_432, minZ: -67_584, maxX: 24_576, maxZ: -61_440 });
    expect(site.dem.length).toBe(9);
    expect(site.counts.buildings).toBeGreaterThan(15_000);
    expect(site.counts.roads).toBeGreaterThan(5_000);
    expect(site.counts.railTracks).toBeGreaterThan(50);
    expect(site.tidalWater.length).toBeGreaterThan(5);
    // Buildings with parts are replaced by their parts.
    expect(site.buildings.length).toBeLessThan(site.counts.buildings + site.counts.buildingParts);
  });

  test('a stale or missing file fails naming it', async () => {
    const short: FetchBytes = async (file) => (await fetchBytes(file)).subarray(0, file.endsWith('.json') ? undefined : 100);
    await expect(loadSite(manifest, 'portal', short)).rejects.toThrow(
      /sites\/portal\/dem_\d+_\d+\.[0-9a-f]+\.bin is 100 bytes, the manifest says \d+; the data directory is stale/,
    );
    await expect(loadSite(manifest, 'atlantis', fetchBytes)).rejects.toThrow(/no site "atlantis" \(known: portal, /);
    await expect(loadManifest(async () => new TextEncoder().encode('<!doctype html>'))).rejects.toThrow(/manifest.json is not JSON/);
    await expect(loadManifest(async () => new TextEncoder().encode(JSON.stringify({ ...manifest, voxelSizeM: 2 })))).rejects.toThrow(
      /data is for 2 m voxels/,
    );
  });

  test('Salesforce Tower is a tower: parts inherit their building, the roof is flat at 326 m above its ground', () => {
    const parts = site.buildings.filter((b) => b.name === 'Salesforce Tower' && b.heightM > 300);
    expect(parts.length).toBeGreaterThanOrEqual(4);
    for (const p of parts) expect(p.material).toBe(Material.BUILDING_TOWER);
    const centre = site.buildings.filter((b) => b.name === 'Salesforce Transit Center');
    expect(centre.length).toBeGreaterThan(5);
    for (const p of centre) expect(p.material).toBe(Material.BUILDING_TRANSIT);

    const source = new TiledSiteSource(site, 1);
    const s = createColumnSample();
    const tops = new Set<number>();
    for (const [x, z] of [
      [20_600, -66_170],
      [20_609, -66_161],
      [20_630, -66_160],
      [20_640, -66_172],
    ] as const) {
      source.sampleColumn(x, z, s);
      expect(s.buildingMaterial).toBe(Material.BUILDING_TOWER);
      tops.add(Math.round(s.buildingTopM));
    }
    // One roof height per part; the parts stand within a metre or two of each other's ground.
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
    const ground = siteGroundM(site, 20_609, -66_161);
    expect(ground).toBeGreaterThan(SEA_LEVEL_M + 1);
    expect(ground).toBeLessThan(12);
    expect(Math.min(...tops)).toBeGreaterThan(326);
    expect(Math.max(...tops)).toBeLessThan(326 + 12);
    expect(source.tilesBuilt).toBe(1);
  });

  test('voxels: the Bay is water over mud, Market Street is asphalt over sand, the ballpark is grass', () => {
    const store = new ChunkWorldStore({ voxelSizeM: 1, source: new TiledSiteSource(site, 1) });
    const column = (x: number, z: number, y0: number, y1: number): number[] => {
      const out: number[] = [];
      for (let y = y0; y >= y1; y--) out.push(store.getVoxel({ x, y, z }));
      return out;
    };
    // East of the Embarcadero: air, then water from sea level down to the bed, then Bay Mud.
    const bay = column(22_109, -66_217, 2, -30);
    expect(bay.slice(0, 3)).toEqual([Material.AIR, Material.AIR, Material.WATER]);
    expect(bay.lastIndexOf(Material.WATER)).toBeGreaterThan(10);
    expect(bay[bay.length - 1]).toBe(Material.BAY_MUD);
    // Market at 4th.
    expect(column(19_840, -65_736, 12, 9)).toEqual([Material.AIR, Material.ROAD, Material.SAND, Material.SAND]);
    // The outfield.
    expect(column(21_298, -64_947, 4, 2)).toEqual([Material.AIR, Material.GRASS, Material.FILL]);
    // The Caltrain yard north-west of 4th and King has ballast somewhere along the platform tracks.
    const king = lonLatToWorld(-122.3947, 37.7765);
    let ballast = 0;
    for (let d = 0; d < 200; d++) {
      for (let y = 6; y >= 0; y--) {
        const m = store.getVoxel({ x: Math.floor(king.x - d * 0.7), y, z: Math.floor(king.z + d * 0.7) });
        if (m === Material.AIR) continue;
        if (m === Material.TRACK_BALLAST) ballast++;
        break;
      }
    }
    expect(ballast).toBeGreaterThan(20);
    // Outside the site there is nothing, and loading it is refused.
    expect(store.getVoxel({ x: 18_000, y: 0, z: -65_000 })).toBe(Material.AIR);
  });

  test('city tier: every 4 m patch of the site meshes, with towers over 300 m of slabs', () => {
    const source = new TiledSiteSource(site, 4);
    const field = { originXM: site.bounds.minX, originZM: site.bounds.minZ, cellM: 4, stepM: 1, baseM: SEA_LEVEL_M };
    const patch = createColumnPatch();
    const scratch = createMesherScratch();
    const input = { key: 0, size: PATCH_CELLS, heights: patch.heights, classes: patch.classes };
    let quads = 0;
    let topSlab = 0;
    for (let pz = 0; pz < 48; pz += 3) {
      for (let px = 0; px < 48; px += 3) {
        expect(sampleSourcePatch(source, field, px, pz, patch), `patch ${px}, ${pz}`).toBe(true);
        for (const { slab, mesh } of meshColumnPatch(input, scratch)) {
          quads += mesh.quads.length / 2;
          topSlab = Math.max(topSlab, slab);
        }
      }
    }
    expect(quads).toBeGreaterThan(20_000);
    expect(topSlab).toBeLessThan(15);
    // The patch holding Salesforce Tower reaches slab 10 (320 m and up).
    sampleSourcePatch(source, field, Math.floor((20_609 - site.bounds.minX) / 128), Math.floor((-66_161 - site.bounds.minZ) / 128), patch);
    expect(Math.max(...meshColumnPatch(input, scratch).map((m) => m.slab))).toBe(10);
  });
});

describe('coarse city tiers', () => {
  test('32 m cells are merged by majority: downtown stays built up, streets and the Bay survive', () => {
    const fine = new TiledSiteSource(site, 4);
    const coarse = new TiledSiteSource(site, 32);
    const s = createColumnSample();
    // Share of built-up columns in the square kilometre around the Transit Center, at both cell sizes.
    const builtShare = (source: TiledSiteSource, stepM: number): number => {
      let built = 0;
      let n = 0;
      for (let z = -66_700; z < -65_700; z += stepM) {
        for (let x = 20_100; x < 21_100; x += stepM) {
          source.sampleColumn(x + stepM / 2, z + stepM / 2, s);
          if (s.buildingMaterial !== Material.AIR) built++;
          n++;
        }
      }
      return built / n;
    };
    const fineShare = builtShare(fine, 4);
    const coarseShare = builtShare(coarse, 32);
    expect(fineShare).toBeGreaterThan(0.35);
    expect(Math.abs(coarseShare - fineShare)).toBeLessThan(0.12);
    // The tower is still the tallest thing around, and the Bay is still water.
    coarse.sampleColumn(20_609, -66_161, s);
    expect(s.buildingMaterial).toBe(Material.BUILDING_TOWER);
    expect(s.buildingTopM).toBeGreaterThan(326);
    coarse.sampleColumn(22_109, -66_217, s);
    expect(s.waterLevelM).toBe(SEA_LEVEL_M);
    expect(s.buildingMaterial).toBe(Material.AIR);
    expect(() => new TiledSiteSource(site, 12).sampleColumn(20_000, -65_000, s)).toThrow(/cellM must divide 2048 m/);
  });
});

describe('far tier and network on the shipped data', () => {
  test('the far raster meshes as 40 x 48 patches; the coarse copy keeps the water share', async () => {
    const far = await loadFarRaster(manifest, fetchBytes);
    expect(farPatchCounts(far)).toEqual({ nx: 40, nz: 48 });
    const share = (r: typeof far): number => r.classes.reduce((n, c) => n + ((c & 7) === 1 ? 1 : 0), 0) / r.classes.length;
    const coarse = coarsenFarRaster(far, 8);
    expect(farPatchCounts(coarse)).toEqual({ nx: 5, nz: 6 });
    expect(Math.abs(share(coarse) - share(far))).toBeLessThan(0.01);
    // The patch over the open Pacific (south-west corner) is one sheet of water: a single quad.
    const patch = createColumnPatch();
    sampleFarPatch(far, 4, 0, 47, patch);
    const meshes = meshColumnPatch({ key: 0, size: PATCH_CELLS, heights: patch.heights, classes: patch.classes }, createMesherScratch());
    expect(meshes.length).toBe(1);
    expect(meshes[0]?.mesh.opaqueCount).toBe(0);
    expect(meshes[0]?.mesh.quads.length).toBe(2);
  });

  test('rail tracks group by system; simplification keeps end points and stays within tolerance', async () => {
    const rail = await loadRailNetwork(manifest, fetchBytes);
    const vectors = await loadFarVectors(manifest, fetchBytes);
    expect(vectors.places.some((p) => p.name === 'San Francisco')).toBe(true);
    const groups = new Set(rail.tracks.filter((t) => t.service === '').map((t) => railGroup(t.systems)));
    expect([...groups].sort()).toEqual(['BART', 'Caltrain', 'Muni', 'SMART', 'VTA', 'intercity', 'other']);
    expect(railGroup('Amtrak;Caltrain;Capitol Corridor')).toBe('Caltrain');
    expect(railGroup('ACE;Amtrak')).toBe('intercity');
    expect(railGroup('')).toBe('other');

    let before = 0;
    let after = 0;
    for (const t of rail.tracks) {
      for (const part of t.parts) {
        const simple = simplifyLine(part, 4);
        before += part.length / 2;
        after += simple.length / 2;
        expect(simple[0]).toBe(part[0]);
        expect(simple[simple.length - 1]).toBe(part[part.length - 1]);
      }
    }
    expect(after).toBeLessThan(before * 0.6);
    // A dog-leg of 3 m is dropped at 4 m tolerance and kept at 2 m.
    const leg = Float64Array.of(0, 0, 50, 3, 100, 0);
    expect(simplifyLine(leg, 4)).toEqual(Float64Array.of(0, 0, 100, 0));
    expect(simplifyLine(leg, 2)).toEqual(leg);
  });

  test('building materials follow use, name and height', () => {
    const b = (heightDm: number, subtype = '', cls = '', name = '') => buildingMaterial({ heightDm, subtype, cls, name });
    expect(b(3260, 'commercial', 'office')).toBe(Material.BUILDING_TOWER);
    expect(b(120, 'transportation')).toBe(Material.BUILDING_TRANSIT);
    expect(b(120, '', '', 'Salesforce Transit Center')).toBe(Material.BUILDING_TRANSIT);
    expect(b(200, 'residential')).toBe(Material.BUILDING_RESIDENTIAL);
    expect(b(200, '', 'apartments')).toBe(Material.BUILDING_RESIDENTIAL);
    expect(b(200, 'education')).toBe(Material.BUILDING_CIVIC);
    expect(b(80, '', 'warehouse')).toBe(Material.BUILDING_INDUSTRIAL);
    expect(b(300, 'commercial')).toBe(Material.BUILDING_COMMERCIAL);
    expect(b(300)).toBe(Material.BUILDING_COMMERCIAL);
    expect(b(90)).toBe(Material.BUILDING_RESIDENTIAL);
  });
});
