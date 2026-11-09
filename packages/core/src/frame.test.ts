import { describe, expect, test } from 'vitest';
import {
  GAME_BOX,
  GRID_HEIGHT_M,
  GRID_ORIGIN_EASTING,
  GRID_ORIGIN_NORTHING,
  GRID_WIDTH_M,
  isInGrid,
  lonLatToUtm10,
  lonLatToWorld,
  TILE_SIZE_M,
  tileBounds,
  utm10ToLonLat,
  worldToLonLat,
  worldToTile,
  worldToUtm10,
} from './frame.ts';

// Reference UTM 10N coordinates computed with proj4 2.22.0 (EPSG:4326 to EPSG:32610).
// packages/pipeline/src/frame-crosscheck.test.ts repeats the comparison live against proj4.
const FOURTH_AND_KING = { lon: -122.3947, lat: 37.7765, easting: 553304.8549, northing: 4181190.1906 };
const SALESFORCE_TC = { lon: -122.3962, lat: 37.7897, easting: 553163.3022, northing: 4182653.8706 };

describe('world frame', () => {
  test('grid is 20 x 24 tiles of 4,096 m with a snapped origin', () => {
    expect(GRID_WIDTH_M).toBe(81920);
    expect(GRID_HEIGHT_M).toBe(98304);
    expect(GRID_ORIGIN_EASTING % TILE_SIZE_M).toBe(0);
    expect(GRID_ORIGIN_NORTHING % TILE_SIZE_M).toBe(0);
  });

  test.each([
    ['4th and King', FOURTH_AND_KING],
    ['Salesforce Transit Center', SALESFORCE_TC],
  ])('%s projects to the proj4 reference within 1 mm', (_name, p) => {
    const u = lonLatToUtm10(p.lon, p.lat);
    expect(Math.abs(u.easting - p.easting)).toBeLessThan(0.001);
    expect(Math.abs(u.northing - p.northing)).toBeLessThan(0.001);
  });

  test('station world positions and tiles', () => {
    const a = lonLatToWorld(FOURTH_AND_KING.lon, FOURTH_AND_KING.lat);
    const b = lonLatToWorld(SALESFORCE_TC.lon, SALESFORCE_TC.lat);
    expect(a.x).toBeCloseTo(20824.855, 2);
    expect(a.z).toBeCloseTo(-64710.191, 2);
    expect(b.x).toBeCloseTo(20683.302, 2);
    expect(b.z).toBeCloseTo(-66173.871, 2);
    // North is -z: Salesforce Transit Center is north of 4th and King.
    expect(b.z).toBeLessThan(a.z);
    // Straight-line distance between the two points, grid metres.
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(1470.5, 0);
    expect(worldToTile(a.x, a.z)).toEqual({ tx: 5, ty: 15 });
    expect(worldToTile(b.x, b.z)).toEqual({ tx: 5, ty: 16 });
  });

  test('lon/lat round-trips to well under a millimetre', () => {
    for (const p of [FOURTH_AND_KING, SALESFORCE_TC, { lon: -121.75, lat: 37.2 }, { lon: -122.6, lat: 38.05 }]) {
      const w = lonLatToWorld(p.lon, p.lat);
      const back = worldToLonLat(w.x, w.z);
      expect(Math.abs(back.lon - p.lon)).toBeLessThan(1e-9);
      expect(Math.abs(back.lat - p.lat)).toBeLessThan(1e-9);
      const u = worldToUtm10(w.x, w.z);
      const ll = utm10ToLonLat(u.easting, u.northing);
      expect(Math.abs(ll.lat - p.lat)).toBeLessThan(1e-9);
    }
  });

  test('central meridian and scale factor', () => {
    const u = lonLatToUtm10(-123, 37.5);
    expect(u.easting).toBeCloseTo(500000, 6);
    // One arc second of longitude at the central meridian, scaled by k0 = 0.9996.
    const v = lonLatToUtm10(-123 + 1 / 3600, 0.000001);
    expect((v.easting - 500000) / (6378137 * (Math.PI / 180 / 3600))).toBeCloseTo(0.9996, 6);
  });

  test('all four game box corners are inside the grid', () => {
    for (const lon of [GAME_BOX.west, GAME_BOX.east]) {
      for (const lat of [GAME_BOX.south, GAME_BOX.north]) {
        const w = lonLatToWorld(lon, lat);
        expect(isInGrid(w.x, w.z), `corner ${lon}, ${lat} at x ${w.x}, z ${w.z}`).toBe(true);
      }
    }
  });

  test('tiles: bounds, containment, loud failures', () => {
    expect(tileBounds(0, 0)).toEqual({ minX: 0, maxX: 4096, minZ: -4096, maxZ: 0 });
    expect(tileBounds(19, 23)).toEqual({ minX: 77824, maxX: 81920, minZ: -98304, maxZ: -94208 });
    expect(worldToTile(0, 0)).toEqual({ tx: 0, ty: 0 });
    expect(worldToTile(81919.9, -98303.9)).toEqual({ tx: 19, ty: 23 });
    expect(() => worldToTile(-1, 0)).toThrow('x -1');
    expect(() => worldToTile(0, 5)).toThrow('z 5');
    expect(() => tileBounds(20, 0)).toThrow('(20, 0)');
    expect(() => lonLatToUtm10(10, 50)).toThrow('lon 10');
  });
});
