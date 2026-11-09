import { GAME_BOX, lonLatToUtm10, utm10ToLonLat, WORLD_CRS } from '@bayvox/core';
import proj4 from 'proj4';
import { expect, test } from 'vitest';
import { PACKAGE_NAME } from './index.ts';

const UTM10N = '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs';

test('pipeline placeholder exports its package name', () => {
  expect(PACKAGE_NAME).toBe('@bayvox/pipeline');
  expect(WORLD_CRS).toBe('EPSG:32610');
});

test('core UTM 10N projection agrees with proj4 across the game box within 1 mm', () => {
  let worst = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const lon = GAME_BOX.west + ((GAME_BOX.east - GAME_BOX.west) * i) / 10;
      const lat = GAME_BOX.south + ((GAME_BOX.north - GAME_BOX.south) * j) / 10;
      const [e, n] = proj4('EPSG:4326', UTM10N, [lon, lat]) as [number, number];
      const u = lonLatToUtm10(lon, lat);
      worst = Math.max(worst, Math.abs(u.easting - e), Math.abs(u.northing - n));
      const [lon2, lat2] = proj4(UTM10N, 'EPSG:4326', [u.easting, u.northing]) as [number, number];
      const back = utm10ToLonLat(u.easting, u.northing);
      expect(Math.abs(back.lon - lon2)).toBeLessThan(1e-8);
      expect(Math.abs(back.lat - lat2)).toBeLessThan(1e-8);
    }
  }
  expect(worst).toBeLessThan(0.001);
});
