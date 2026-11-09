import {
  ColumnUnit,
  createRng,
  Material,
  nextFloat,
  packChunkKey,
  packColumnClass,
  SEA_LEVEL_M,
  type TerrainRaster,
  terrainClassAt,
  terrainHeightM,
} from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { ChunkWorldStore } from './chunk-store.ts';
import { createColumnSample } from './column-source.ts';
import { type GridSpec, rasterizeBuildings } from './rasterize.ts';
import { demLayerFromTerrainRaster, SiteColumnSource, type SiteLayers } from './site-source.ts';

/** 8 m DEM, 16 x 16 cells = 128 m square with its north-west corner at (1000, -2000). */
const DEM_GRID: GridSpec = { originXM: 1000, originZM: -2000, cellSizeM: 8, width: 16, depth: 16 };
/** 2 m overlay grid over the same square. */
const FINE_GRID: GridSpec = { originXM: 1000, originZM: -2000, cellSizeM: 2, width: 64, depth: 64 };

/** Ground rising 1 m per DEM cell eastwards from 2 m, flat north to south. */
function rampDem(): Int16Array {
  const dem = new Int16Array(256);
  for (let iz = 0; iz < 16; iz++) for (let ix = 0; ix < 16; ix++) dem[ix + iz * 16] = 2 + ix;
  return dem;
}

function layers(): SiteLayers {
  const buildings = rasterizeBuildings(FINE_GRID, [
    { rings: [[1040, -1960, 1060, -1960, 1060, -1940, 1040, -1940]], heightM: 30, cls: Material.BUILDING_TOWER },
  ]);
  const mask = new Uint8Array(64 * 64);
  for (let iz = 48; iz < 64; iz++) mask.fill(1, iz * 64, iz * 64 + 64); // southern quarter is water
  const surface = new Uint8Array(64 * 64).fill(Material.ROAD);
  return {
    dem: { grid: DEM_GRID, data: rampDem() },
    buildings: { grid: FINE_GRID, height: buildings.height, cls: buildings.cls },
    water: { grid: FINE_GRID, mask, levelM: 6 },
    surface: { grid: FINE_GRID, material: surface },
  };
}

describe('SiteColumnSource', () => {
  test('bounds are the DEM grid; outside them columns are empty', () => {
    const source = new SiteColumnSource(layers());
    expect(source.bounds).toEqual({ minXM: 1000, minZM: -2000, maxXM: 1128, maxZM: -1872 });
    const s = createColumnSample();
    for (const [x, z] of [
      [999.9, -1990],
      [1128, -1990],
      [1050, -2000.1],
      [1050, -1872],
    ] as const) {
      source.sampleColumn(x, z, s);
      expect(s, `(${x}, ${z})`).toEqual(createColumnSample());
    }
  });

  test('DEM: bilinear between cell centres by default, clamped at the edge; nearest on request', () => {
    const s = createColumnSample();
    const bilinear = new SiteColumnSource({ dem: { grid: DEM_GRID, data: rampDem() } });
    bilinear.sampleColumn(1004, -1990, s); // centre of cell 0
    expect(s.surfaceM).toBe(2);
    bilinear.sampleColumn(1008, -1990, s); // halfway to cell 1
    expect(s.surfaceM).toBe(2.5);
    bilinear.sampleColumn(1001, -1990, s); // west of the first centre: clamped
    expect(s.surfaceM).toBe(2);
    bilinear.sampleColumn(1127, -1873, s);
    expect(s.surfaceM).toBe(17);
    expect(s.waterLevelM).toBe(Number.NEGATIVE_INFINITY);
    expect(s.buildingMaterial).toBe(0);
    expect(s.surfaceMaterial).toBe(0);

    const nearest = new SiteColumnSource({ dem: { grid: DEM_GRID, data: rampDem(), interpolation: 'nearest', unitsPerM: 2, offsetM: -1 } });
    nearest.sampleColumn(1008.5, -1990, s);
    expect(s.surfaceM).toBe(3 * 0.5 - 1);
    nearest.sampleColumn(1007.9, -1990, s);
    expect(s.surfaceM).toBe(2 * 0.5 - 1);
  });

  test('DEM rows run north to south: row 0 is the minimum z', () => {
    const dem = new Int16Array(256);
    dem.fill(50, 0, 16); // first row
    const source = new SiteColumnSource({ dem: { grid: DEM_GRID, data: dem, interpolation: 'nearest' } });
    const s = createColumnSample();
    source.sampleColumn(1050, -1999, s);
    expect(s.surfaceM).toBe(50);
    source.sampleColumn(1050, -1991, s);
    expect(s.surfaceM).toBe(0);
  });

  test('buildings, water and surface overlays', () => {
    const source = new SiteColumnSource(layers());
    const s = createColumnSample();
    source.sampleColumn(1050, -1950, s); // inside the tower footprint
    expect(s.buildingMaterial).toBe(Material.BUILDING_TOWER);
    expect(s.buildingBaseM).toBe(s.surfaceM);
    expect(s.buildingTopM).toBe(s.surfaceM + 30);
    expect(s.surfaceMaterial).toBe(Material.ROAD);
    expect(s.waterLevelM).toBe(Number.NEGATIVE_INFINITY);
    source.sampleColumn(1039, -1950, s); // just west of it
    expect(s.buildingMaterial).toBe(0);
    source.sampleColumn(1010, -1900, s); // water quarter (z >= -1904)
    expect(s.waterLevelM).toBe(6);
    source.sampleColumn(1010, -1905, s);
    expect(s.waterLevelM).toBe(Number.NEGATIVE_INFINITY);
  });

  test('building classes map to materials through classMaterials', () => {
    const b = rasterizeBuildings(FINE_GRID, [{ rings: [[1040, -1960, 1060, -1960, 1060, -1940, 1040, -1940]], heightM: 9, cls: 200 }]);
    const classMaterials = new Uint8Array(256);
    classMaterials[200] = Material.BUILDING_CIVIC;
    const source = new SiteColumnSource({
      dem: { grid: DEM_GRID, data: rampDem() },
      buildings: { grid: FINE_GRID, height: b.height, cls: b.cls, classMaterials, heightScaleM: 2 },
    });
    const s = createColumnSample();
    source.sampleColumn(1050, -1950, s);
    expect(s.buildingMaterial).toBe(Material.BUILDING_CIVIC);
    expect(s.buildingTopM - s.buildingBaseM).toBe(18);
    // Without the table, class 200 is not a material id.
    expect(
      () =>
        new SiteColumnSource({ dem: { grid: DEM_GRID, data: rampDem() }, buildings: { grid: FINE_GRID, height: b.height, cls: b.cls } }),
    ).toThrow(/material of building class 200 is not a known non-AIR material id: 200/);
  });

  test('construction fails loudly on inconsistent layers', () => {
    const good = layers();
    expect(() => new SiteColumnSource({ dem: { grid: DEM_GRID, data: new Int16Array(10) } })).toThrow(
      /dem.data has 10 cells, grid 16 x 16 needs 256/,
    );
    expect(() => new SiteColumnSource({ dem: { grid: DEM_GRID, data: rampDem(), unitsPerM: 0 } })).toThrow(/dem unitsPerM must be > 0/);
    expect(() => new SiteColumnSource({ ...good, water: { grid: FINE_GRID, mask: new Uint8Array(5) } })).toThrow(/water.mask has 5 cells/);
    const cls = new Uint8Array(64 * 64);
    cls[77] = Material.BUILDING_CIVIC;
    expect(() => new SiteColumnSource({ ...good, buildings: { grid: FINE_GRID, height: new Uint16Array(64 * 64), cls } })).toThrow(
      /buildings cell 77 has class 16 but height 0/,
    );
    expect(() => new SiteColumnSource({ ...good, surface: { grid: FINE_GRID, material: new Uint8Array(64 * 64).fill(99) } })).toThrow(
      /surface material is not a known non-AIR material id: 99/,
    );
  });

  test('absolute roofs are flat on sloping ground, and a mapped shoreline lowers the bed', () => {
    const base = layers();
    const { buildings, water } = base;
    if (buildings === undefined || water === undefined) throw new Error('fixture lost a layer');
    // The tower footprint spans x 1040..1060, where the ramp rises from 7 to 9.5 m. Roof at 40 m absolute.
    const height = buildings.height.map((h) => (h === 0 ? 0 : 140));
    const source = new SiteColumnSource({
      ...base,
      buildings: { ...buildings, height, roofDatumM: -100 },
      water: { ...water, levelM: 6, bedM: 1 },
    });
    const s = createColumnSample();
    source.sampleColumn(1041, -1950, s);
    const west = { base: s.buildingBaseM, top: s.buildingTopM };
    source.sampleColumn(1059, -1950, s);
    expect(s.buildingTopM).toBe(40);
    expect(west.top).toBe(40);
    expect(s.buildingBaseM).toBeGreaterThan(west.base + 2);
    // A roof at or below the ground is no building.
    const sunk = new SiteColumnSource({
      ...base,
      buildings: { ...buildings, height: height.map((h) => (h === 0 ? 0 : 105)), roofDatumM: -100 },
    });
    sunk.sampleColumn(1059, -1950, s);
    expect(s.buildingMaterial).toBe(0);
    // Water quarter, high east end: the DEM says 16 m, the mapped water wins and the bed drops to 1 m.
    source.sampleColumn(1120, -1890, s);
    expect(s.waterLevelM).toBe(6);
    expect(s.surfaceM).toBe(1);
    expect(() => new SiteColumnSource({ ...base, water: { ...water, levelM: 6, bedM: 6 } })).toThrow(/bedM must be below levelM 6/);
    expect(() => new SiteColumnSource({ ...base, buildings: { ...buildings, roofDatumM: Number.NaN } })).toThrow(/roofDatumM/);
  });

  test('drives a ChunkWorldStore: terrain, water, road cap and tower become voxels', async () => {
    const store = new ChunkWorldStore({ voxelSizeM: 2, source: new SiteColumnSource(layers()) });
    // The site in voxels: x [500, 564), z [-1000, -936).
    await store.ensureLoaded({ min: { x: 500, y: -16, z: -1000 }, max: { x: 564, y: 32, z: -936 } });
    await expect(store.ensureLoaded({ min: { x: 499, y: 0, z: -1000 }, max: { x: 564, y: 32, z: -936 } })).rejects.toThrow(
      /leaves the source bounds/,
    );

    // Column at x 1051 m, z -1949 m: DEM (1051 - 1004) / 8 + 2 = 7.875 m, 4 voxel layers of ground.
    expect(store.get(525, 3, -975)).toBe(Material.ROAD);
    expect(store.get(525, 2, -975)).toBe(Material.ROCK); // class 0: rock from the surface down
    expect(store.get(525, 4, -975)).toBe(Material.BUILDING_TOWER);
    expect(store.get(525, 18, -975)).toBe(Material.BUILDING_TOWER); // top at 37.875 m rounds to 19 layers
    expect(store.get(525, 19, -975)).toBe(Material.AIR);
    // Water quarter at the low west end: ground 2 m (1 layer), water to 6 m (3 layers).
    expect(store.get(501, 0, -940)).toBe(Material.ROAD);
    expect(store.get(501, 1, -940)).toBe(Material.WATER);
    expect(store.get(501, 2, -940)).toBe(Material.WATER);
    expect(store.get(501, 3, -940)).toBe(Material.AIR);
    // High east end of the water quarter is above the water level: dry.
    expect(store.get(560, 8, -940)).toBe(Material.AIR);
    expect(store.get(560, 7, -940)).toBe(Material.ROAD);
    // Outside the site reads as AIR at any depth.
    expect(store.get(499, -5, -975)).toBe(Material.AIR);
    expect(store.getChunk(packChunkKey(14, -1, -32)).indices).toBeNull();
  });
});

describe('SiteColumnSource over a core dem TerrainRaster', () => {
  /** 9 x 7 nodes at 8 m: x [4096, 4160], north [6144, 6192], i.e. z [-6192, -6144]. Land in the west, bay in the east. */
  function raster(): TerrainRaster {
    const cols = 9;
    const rows = 7;
    const heights = new Int16Array(cols * rows);
    const classes = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const h = 83 - col * 17 + row * 5; // 0.1 m units: 8.3 m down to about -5 m eastwards, rising northwards
        heights[col + row * cols] = h;
        classes[col + row * cols] =
          h < SEA_LEVEL_M * 10 ? packColumnClass(ColumnUnit.WATER, 10) : packColumnClass(ColumnUnit.FILL_OVER_SAND, 12);
      }
    }
    return { kind: 'dem', cols, rows, cellM: 8, originX: 4096, originN: 6144, heights, classes };
  }

  test('heights and classes agree with core terrainHeightM and terrainClassAt everywhere in the tile', () => {
    const r = raster();
    const source = new SiteColumnSource({ dem: demLayerFromTerrainRaster(r) });
    expect(source.bounds).toEqual({ minXM: 4096, minZM: -6192, maxXM: 4160, maxZM: -6144 });
    const s = createColumnSample();
    const rng = createRng(3);
    let waterColumns = 0;
    for (let i = 0; i < 2000; i++) {
      const x = 4096 + nextFloat(rng) * 64;
      const z = -6192 + nextFloat(rng) * 48;
      source.sampleColumn(x, z, s);
      expect(Math.abs(s.surfaceM - terrainHeightM(r, x, z))).toBeLessThan(1e-9);
      expect(s.columnClass).toBe(terrainClassAt(r, x, z));
      const isWater = (s.columnClass & 7) === ColumnUnit.WATER;
      expect(s.waterLevelM).toBe(isWater ? SEA_LEVEL_M : Number.NEGATIVE_INFINITY);
      if (isWater) waterColumns++;
    }
    expect(waterColumns).toBeGreaterThan(300);
    // On the nodes themselves: exact stored heights, south row first.
    source.sampleColumn(4096, -6144 - 1e-9, s);
    expect(s.surfaceM).toBeCloseTo(8.3, 6);
    source.sampleColumn(4096 + 16, -6192, s); // north-west corner row (row 6), col 2
    expect(s.surfaceM).toBeCloseTo((83 - 34 + 30) / 10, 9);
  });

  test('rejects a far raster and feeds the store: geology from classes, bay water to sea level', () => {
    expect(() => demLayerFromTerrainRaster({ ...raster(), kind: 'far' })).toThrow(/need a 'dem' raster, got 'far'/);
    const store = new ChunkWorldStore({ voxelSizeM: 1, source: new SiteColumnSource({ dem: demLayerFromTerrainRaster(raster()) }) });
    // West edge column at x 4096.5, z -6150.5: about 8.6 m, made land: fill on top.
    expect(store.get(4096, 8, -6151)).toBe(Material.FILL);
    expect(store.get(4096, 9, -6151)).toBe(Material.AIR);
    expect(store.get(4096, -60, -6151)).toBe(Material.ROCK);
    // East edge column at x 4159.5: bed near -5 m, Bay Mud on the bed, water up to SEA_LEVEL_M (voxel y 0), air above.
    expect(store.get(4159, -6, -6151)).toBe(Material.BAY_MUD);
    expect(store.get(4159, -3, -6151)).toBe(Material.WATER);
    expect(store.get(4159, 0, -6151)).toBe(Material.WATER);
    expect(store.get(4159, 1, -6151)).toBe(Material.AIR);
  });
});
