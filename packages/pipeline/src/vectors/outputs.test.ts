/**
 * Sanity checks on the real outputs of `pnpm data:build:vectors`. The outputs are gitignored, so
 * this suite is skipped (and reported as skipped) on a checkout that has not built them.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  decodeFarVectors,
  decodeRailNetwork,
  decodeSiteVectorTile,
  FAR_BRIDGES,
  inflateVectorAsset,
  lonLatToWorld,
  type RailNetwork,
  SITE_TILE_SIZE_M,
  type SiteBuilding,
  type VectorAssetRef,
  type VectorManifest,
} from '@bayvox/core';
import { beforeAll, describe, expect, test } from 'vitest';
import { DATA_DIR, VECTOR_MANIFEST_PATH } from './config.ts';
import { loadCuratedPlaces } from './far.ts';
import { lineLength } from './geom.ts';

const built = existsSync(VECTOR_MANIFEST_PATH);

async function load(ref: VectorAssetRef): Promise<Uint8Array> {
  const file = new Uint8Array(readFileSync(path.join(DATA_DIR, ref.file)));
  expect(file.length, ref.file).toBe(ref.bytes);
  expect(createHash('sha256').update(file).digest('hex'), ref.file).toBe(ref.sha256);
  expect(ref.file).toContain(ref.sha256.slice(0, 12));
  const bundle = await inflateVectorAsset(file);
  expect(bundle.length, ref.file).toBe(ref.rawBytes);
  return bundle;
}

const dist = (p: Float64Array, q: { x: number; z: number }): number => Math.hypot((p[0] as number) - q.x, (p[1] as number) - q.z);

describe.skipIf(!built)('built vector assets', () => {
  let manifest: VectorManifest;
  let rail: RailNetwork;

  beforeAll(async () => {
    manifest = JSON.parse(readFileSync(VECTOR_MANIFEST_PATH, 'utf8')) as VectorManifest;
    rail = decodeRailNetwork(await load(manifest.net.rail));
  });

  test('rail file is under 2 MB and matches its manifest counts', () => {
    expect(manifest.net.rail.bytes).toBeLessThan(2_000_000);
    expect(manifest.net.rail.counts).toEqual({
      tracks: rail.tracks.length,
      stations: rail.stations.length,
      routes: rail.routes.length,
      routeStops: rail.routeStops.length,
    });
    const km = rail.tracks.reduce((sum, t) => sum + lineLength(t.parts[0] as Float64Array), 0) / 1000;
    expect(Math.abs(km - manifest.net.rail.trackKm)).toBeLessThan(0.1);
    expect(km).toBeGreaterThan(1500);
    for (const cls of ['rail', 'subway', 'light_rail', 'tram']) expect(rail.tracks.some((t) => t.cls === cls)).toBe(true);
    expect(rail.tracks.some((t) => t.tunnel === 1 && t.cls === 'subway' && t.electrified === 'rail' && t.gaugeMm === 1676)).toBe(true);
  });

  test('a Caltrain station named for 4th and King lies within 150 m of 37.7765 N 122.3947 W', () => {
    const at = lonLatToWorld(-122.3947, 37.7765);
    const near = rail.stations.filter((s) => s.systems.split(';').includes('Caltrain') && dist(s.parts[0] as Float64Array, at) < 150);
    expect(near.map((s) => s.name)).toEqual(['San Francisco 4th & King Street']);
    expect(near[0]?.kind).toBe('station');
  });

  test('every required system has ordered routes with stop lists', () => {
    for (const system of ['Caltrain', 'BART', 'Muni', 'VTA', 'SMART', 'ACE', 'Capitol Corridor']) {
      const routes = rail.routes.filter((r) => r.system === system);
      expect(routes.length, system).toBeGreaterThan(0);
      for (const r of routes) {
        expect(r.parts.length, `${system} route ${r.osmId} parts`).toBe(1);
        expect(r.stopCount, `${system} route ${r.osmId} stops`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(rail.routeStops.length).toBe(rail.routes.reduce((sum, r) => sum + r.stopCount, 0));
  });

  test('a Caltrain express runs from San Jose Diridon to 4th and King, on the track geometry', () => {
    const at = lonLatToWorld(-122.3947, 37.7765);
    const express = rail.routes.find(
      (r) => r.system === 'Caltrain' && r.ref === '5XX' && r.from === 'San Jose Diridon' && r.to === 'San Francisco',
    );
    if (express === undefined) throw new Error('no Caltrain 5XX route from San Jose Diridon to San Francisco');
    const line = express.parts[0] as Float64Array;
    expect(dist(line.subarray(line.length - 2), at)).toBeLessThan(250);
    expect(lineLength(line) / 1000).toBeGreaterThan(70);
    expect(lineLength(line) / 1000).toBeLessThan(85);
    const stops = rail.routeStops.slice(express.stopStart, express.stopStart + express.stopCount);
    expect(stops.every((s) => rail.routes[s.route] === express)).toBe(true);
    expect(stops[0]?.name).toBe('San Jose Diridon');
    expect(stops.at(-1)?.name).toBe('San Francisco 4th & King Street');
    expect(rail.stations[(stops.at(-1)?.stationPlus1 ?? 0) - 1]?.name).toBe('San Francisco 4th & King Street');
    // Every stop sits within 30 m of the simplified route polyline's vertices or segments.
    for (const s of stops) {
      const p = s.parts[0] as Float64Array;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 2; i < line.length; i += 2) {
        const ax = line[i - 2] as number;
        const az = line[i - 1] as number;
        const dx = (line[i] as number) - ax;
        const dz = (line[i + 1] as number) - az;
        const t = Math.min(1, Math.max(0, (((p[0] as number) - ax) * dx + ((p[1] as number) - az) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot((p[0] as number) - ax - t * dx, (p[1] as number) - az - t * dz));
      }
      expect(best, s.name).toBeLessThan(30);
    }
  });

  test('far layers: Bay water, the five crossings, the curated anchors', async () => {
    const far = decodeFarVectors(await load(manifest.net.far));
    expect(far.water.some((w) => w.subtype === 'ocean')).toBe(true);
    for (const bridge of FAR_BRIDGES) {
      const km =
        far.highways.filter((h) => h.crossing === bridge).reduce((sum, h) => sum + lineLength(h.parts[0] as Float64Array), 0) / 1000;
      expect(km, bridge).toBeGreaterThan(2);
      expect(Math.abs(km - (manifest.net.far.crossingKm[bridge] as number)), bridge).toBeLessThan(0.1);
    }
    // The Bay Bridge spans lie between San Francisco and Oakland.
    const mid = lonLatToWorld(-122.35, 37.815);
    expect(far.highways.filter((h) => h.crossing === 'Bay Bridge').every((h) => dist(h.parts[0] as Float64Array, mid) < 6000)).toBe(true);
    for (const c of loadCuratedPlaces()) {
      const place = far.places.find((p) => p.name === c.name && p.kind === c.kind);
      expect(place, c.name).toBeDefined();
      expect(dist(place?.parts[0] as Float64Array, lonLatToWorld(c.lon, c.lat)), c.name).toBeLessThan(500);
    }
    expect(far.places.find((p) => p.kind === 'city' && p.name === 'San Francisco')?.population).toBeGreaterThan(500_000);
  });

  test('site tiles match the manifest, and buildings sit in their tile', async () => {
    expect(manifest.sites.map((s) => [s.id, s.tiles.length])).toEqual([
      ['portal', 9],
      ['googleplex', 4],
      ['meta', 4],
      ['oracle', 4],
    ]);
    for (const site of manifest.sites) {
      let buildings = 0;
      for (const t of site.tiles) {
        const tile = decodeSiteVectorTile(await load(t));
        expect({
          buildings: tile.buildings.length,
          buildingParts: tile.buildingParts.length,
          roads: tile.roads.length,
          water: tile.water.length,
          landuse: tile.landuse.length,
        }).toEqual(t.counts);
        buildings += tile.buildings.length;
        const minX = t.tx * SITE_TILE_SIZE_M;
        const maxZ = 0 - t.ty * SITE_TILE_SIZE_M;
        for (const b of tile.buildings) {
          expect(b.heightDm).toBeGreaterThan(0);
          const p = b.parts[0] as Float64Array;
          // The bounding box centre is inside the tile, so no vertex is farther out than the largest footprint.
          expect((p[0] as number) > minX - 1500 && (p[0] as number) < minX + SITE_TILE_SIZE_M + 1500).toBe(true);
          expect((p[1] as number) < maxZ + 1500 && (p[1] as number) > maxZ - SITE_TILE_SIZE_M - 1500).toBe(true);
        }
        for (const r of tile.roads) {
          const p = r.parts[0] as Float64Array;
          for (let i = 0; i < p.length; i += 2) {
            expect((p[i] as number) >= minX - 0.25 && (p[i] as number) <= minX + SITE_TILE_SIZE_M + 0.25).toBe(true);
            expect((p[i + 1] as number) <= maxZ + 0.25 && (p[i + 1] as number) >= maxZ - SITE_TILE_SIZE_M - 0.25).toBe(true);
          }
        }
      }
      expect(buildings, site.id).toBe(site.counts.buildings);
      expect(buildings, site.id).toBeGreaterThan(1000);
    }
  });

  test('Salesforce Tower is in the portal site, about 326 m tall, next to the transit center', async () => {
    const portal = manifest.sites.find((s) => s.id === 'portal');
    if (portal === undefined) throw new Error('no portal site in the manifest');
    const at = lonLatToWorld(-122.3966, 37.7897);
    const found: SiteBuilding[] = [];
    let transitCenter = 0;
    let bayWater = 0;
    for (const t of portal.tiles) {
      const tile = decodeSiteVectorTile(await load(t));
      found.push(...tile.buildings.filter((b) => b.name === 'Salesforce Tower'));
      transitCenter += tile.buildings.filter((b) => b.name === 'Salesforce Transit Center').length;
      bayWater += tile.water.filter((w) => w.subtype === 'ocean').length;
      if (found.length > 0 && tile.buildings.includes(found[0] as SiteBuilding)) {
        const parts = tile.buildingParts.filter((p) => p.idHash === found[0]?.idHash);
        expect(parts.length).toBeGreaterThan(0);
        expect(Math.max(...parts.map((p) => p.heightDm))).toBe(3260);
        expect(tile.roads.some((r) => r.name === 'Mission Street')).toBe(true);
      }
    }
    expect(found.length).toBe(1);
    expect(found[0]?.heightDm).toBeGreaterThan(3200);
    expect(found[0]?.heightDm).toBeLessThan(3300);
    expect(found[0]?.heightSrc).toBe('height');
    expect(found[0]?.hasParts).toBe(1);
    expect(dist(found[0]?.parts[0] as Float64Array, at)).toBeLessThan(150);
    expect(transitCenter).toBeGreaterThan(0);
    expect(bayWater).toBeGreaterThan(0);
  });
});
