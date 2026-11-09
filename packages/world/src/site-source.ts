/**
 * SiteColumnSource: a ColumnSource over already-decoded site arrays (DEM, rasterized buildings,
 * water mask, surface classes). It knows nothing about files or the pipeline; whoever decodes a
 * site tile hands the typed arrays over. Each layer has its own GridSpec, so an 8 m DEM can sit
 * under a 1 m building grid.
 */
import { ColumnUnit, HEIGHT_UNITS_PER_M, MATERIAL_COUNT, Material, SEA_LEVEL_M, type TerrainRaster } from '@bayvox/core';
import type { ColumnBounds, ColumnSample, ColumnSource } from './column-source.ts';
import { assertGridSpec, type GridSpec } from './rasterize.ts';

export interface SiteDemLayer {
  /**
   * Sample grid. With 'cell' registration (default) sample (ix, iz) is the centre of grid cell
   * (ix, iz). With 'node' registration sample (ix, iz) sits ON the point
   * (originXM + ix * cellSizeM, originZM + iz * cellSizeM) and width, depth count nodes, so the
   * layer spans (width - 1) x (depth - 1) cells: the layout of core's 'dem' TerrainRaster.
   */
  grid: GridSpec;
  registration?: 'cell' | 'node';
  /** 'northFirst' (default): row 0 is the minimum z, as in GridSpec. 'southFirst': row 0 is the maximum z, as in TerrainRaster. */
  rowOrder?: 'northFirst' | 'southFirst';
  /** Ground height per sample in 1 / unitsPerM metres, plus offsetM. */
  data: Int16Array;
  /** DEM units per metre. Default 1 (whole metres); core terrain rasters use HEIGHT_UNITS_PER_M = 10. */
  unitsPerM?: number;
  /** Metres added after scaling. Default 0. */
  offsetM?: number;
  /** 'bilinear' (default) interpolates between samples, clamped at the grid edge; 'nearest' gives terraces. */
  interpolation?: 'nearest' | 'bilinear';
  /**
   * Column class byte per sample (core assets/terrain.ts), read from the nearest sample. Default: all 0.
   * When there is no water layer, columns whose class unit is ColumnUnit.WATER get water up to SEA_LEVEL_M.
   */
  classes?: Uint8Array;
}

/** The DEM layer for a decoded core 'dem' TerrainRaster (node registered, south row first, 0.1 m units, with classes). */
export function demLayerFromTerrainRaster(r: TerrainRaster): SiteDemLayer {
  if (r.kind !== 'dem') throw new RangeError(`demLayerFromTerrainRaster: need a 'dem' raster, got '${r.kind}'`);
  return {
    // Node row 0 is the south edge at north = originN, i.e. z = -originN: the grid's maximum z.
    grid: { originXM: r.originX, originZM: -(r.originN + (r.rows - 1) * r.cellM), cellSizeM: r.cellM, width: r.cols, depth: r.rows },
    registration: 'node',
    rowOrder: 'southFirst',
    data: r.heights,
    unitsPerM: HEIGHT_UNITS_PER_M,
    classes: r.classes,
  };
}

export interface SiteBuildingLayer {
  grid: GridSpec;
  /** Building height above the ground per cell in units of heightScaleM. 0 = no building. */
  height: Uint16Array;
  /** Metres per height unit. Default 1. */
  heightScaleM?: number;
  /**
   * When set, `height` is not above the column's own ground but an absolute roof elevation:
   * roof = roofDatumM + height * heightScaleM (world metres). Roofs are then flat however the ground
   * slopes under the footprint; a column whose ground reaches the roof has no building.
   */
  roofDatumM?: number;
  /** Building class per cell, 0 = no building. */
  cls: Uint8Array;
  /**
   * Material id per class value. Default: the class value is the material id itself.
   * A class present in the grid that maps to no known material fails at construction.
   */
  classMaterials?: ArrayLike<number>;
}

export interface SiteWaterLayer {
  grid: GridSpec;
  /** Non-zero = water column. */
  mask: Uint8Array;
  /** Water plane height. Default SEA_LEVEL_M. A water layer replaces the class-derived water of the DEM layer. */
  levelM?: number;
  /**
   * Ground under water cells is lowered to at most this height, so a mapped shoreline wins over a
   * blurred DEM edge. Must be below levelM. Default: no lowering (water only shows where the DEM is low).
   */
  bedM?: number;
}

export interface SiteSurfaceLayer {
  grid: GridSpec;
  /** Material id of the topmost ground voxel per cell. 0 = no cap (the subsurface function decides). */
  material: Uint8Array;
}

export interface SiteLayers {
  dem: SiteDemLayer;
  buildings?: SiteBuildingLayer;
  water?: SiteWaterLayer;
  surface?: SiteSurfaceLayer;
}

const UNIT_WATER = ColumnUnit.WATER;
const SEA = SEA_LEVEL_M;

function assertLength(what: string, actual: number, grid: GridSpec): void {
  if (actual !== grid.width * grid.depth) {
    throw new RangeError(
      `SiteColumnSource: ${what} has ${actual} cells, grid ${grid.width} x ${grid.depth} needs ${grid.width * grid.depth}`,
    );
  }
}

function assertMaterial(what: string, id: number): void {
  if (!Number.isInteger(id) || id <= Material.AIR || id >= MATERIAL_COUNT) {
    throw new RangeError(`SiteColumnSource: ${what} is not a known non-AIR material id: ${id}`);
  }
}

/**
 * The DEM layer defines `bounds`. Outside it columns are empty (no ground, no water). The other
 * layers are overlays: outside their own grids there is simply no building, water or cap.
 */
export class SiteColumnSource implements ColumnSource {
  readonly bounds: ColumnBounds;
  private readonly dem: SiteDemLayer;
  private readonly demUnits: number;
  private readonly demOffset: number;
  private readonly bilinear: boolean;
  /** 0.5 for cell-registered samples (they sit at cell centres), 0 for node-registered ones. */
  private readonly demShift: number;
  private readonly southFirst: boolean;
  private readonly buildings: SiteBuildingLayer | undefined;
  private readonly buildingScale: number;
  /** True when building heights are absolute roof elevations above roofDatum. */
  private readonly absoluteRoof: boolean;
  private readonly roofDatum: number;
  /** Material id per building class value, 256 entries. */
  private readonly classMaterial: Uint16Array;
  private readonly water: SiteWaterLayer | undefined;
  private readonly waterLevel: number;
  private readonly waterBed: number;
  private readonly surface: SiteSurfaceLayer | undefined;

  constructor(layers: SiteLayers) {
    const dem = layers.dem;
    assertGridSpec(dem.grid, 'SiteColumnSource dem');
    assertLength('dem.data', dem.data.length, dem.grid);
    if (dem.classes !== undefined) assertLength('dem.classes', dem.classes.length, dem.grid);
    this.dem = dem;
    this.demUnits = dem.unitsPerM ?? 1;
    this.demOffset = dem.offsetM ?? 0;
    if (!(this.demUnits > 0) || !Number.isFinite(this.demUnits) || !Number.isFinite(this.demOffset)) {
      throw new RangeError(`SiteColumnSource: dem unitsPerM must be > 0 and offsetM finite, got ${this.demUnits} and ${this.demOffset}`);
    }
    const interpolation = dem.interpolation ?? 'bilinear';
    if (interpolation !== 'bilinear' && interpolation !== 'nearest') {
      throw new RangeError(`SiteColumnSource: unknown dem interpolation ${JSON.stringify(interpolation)}`);
    }
    this.bilinear = interpolation === 'bilinear';
    const registration = dem.registration ?? 'cell';
    if (registration !== 'cell' && registration !== 'node') {
      throw new RangeError(`SiteColumnSource: unknown dem registration ${JSON.stringify(registration)}`);
    }
    const rowOrder = dem.rowOrder ?? 'northFirst';
    if (rowOrder !== 'northFirst' && rowOrder !== 'southFirst') {
      throw new RangeError(`SiteColumnSource: unknown dem rowOrder ${JSON.stringify(rowOrder)}`);
    }
    this.southFirst = rowOrder === 'southFirst';
    const node = registration === 'node';
    if (node && (dem.grid.width < 2 || dem.grid.depth < 2)) {
      throw new RangeError(`SiteColumnSource: a node-registered dem needs at least 2 x 2 nodes, got ${dem.grid.width} x ${dem.grid.depth}`);
    }
    this.demShift = node ? 0 : 0.5;
    const spanX = node ? dem.grid.width - 1 : dem.grid.width;
    const spanZ = node ? dem.grid.depth - 1 : dem.grid.depth;
    this.bounds = {
      minXM: dem.grid.originXM,
      minZM: dem.grid.originZM,
      maxXM: dem.grid.originXM + spanX * dem.grid.cellSizeM,
      maxZM: dem.grid.originZM + spanZ * dem.grid.cellSizeM,
    };

    this.buildings = layers.buildings;
    this.buildingScale = layers.buildings?.heightScaleM ?? 1;
    this.absoluteRoof = layers.buildings?.roofDatumM !== undefined;
    this.roofDatum = layers.buildings?.roofDatumM ?? 0;
    if (!Number.isFinite(this.roofDatum)) {
      throw new RangeError(`SiteColumnSource: buildings roofDatumM must be finite, got ${this.roofDatum}`);
    }
    this.classMaterial = new Uint16Array(256);
    if (layers.buildings !== undefined) {
      const b = layers.buildings;
      assertGridSpec(b.grid, 'SiteColumnSource buildings');
      assertLength('buildings.height', b.height.length, b.grid);
      assertLength('buildings.cls', b.cls.length, b.grid);
      if (!(this.buildingScale > 0) || !Number.isFinite(this.buildingScale)) {
        throw new RangeError(`SiteColumnSource: buildings heightScaleM must be finite and > 0, got ${this.buildingScale}`);
      }
      const seen = new Uint8Array(256);
      for (let i = 0; i < b.cls.length; i++) {
        const c = b.cls[i] as number;
        const h = b.height[i] as number;
        if ((c === 0) !== (h === 0)) {
          throw new RangeError(`SiteColumnSource: buildings cell ${i} has class ${c} but height ${h}; both must be zero or both non-zero`);
        }
        seen[c] = 1;
      }
      for (let c = 1; c < 256; c++) {
        if (seen[c] === 0) continue;
        const id = b.classMaterials === undefined ? c : (b.classMaterials[c] as number);
        assertMaterial(`material of building class ${c}`, id);
        this.classMaterial[c] = id;
      }
    }

    this.water = layers.water;
    this.waterLevel = layers.water?.levelM ?? SEA_LEVEL_M;
    if (layers.water !== undefined) {
      assertGridSpec(layers.water.grid, 'SiteColumnSource water');
      assertLength('water.mask', layers.water.mask.length, layers.water.grid);
      if (!Number.isFinite(this.waterLevel)) throw new RangeError(`SiteColumnSource: water levelM must be finite, got ${this.waterLevel}`);
    }
    this.waterBed = layers.water?.bedM ?? Number.POSITIVE_INFINITY;
    if (Number.isNaN(this.waterBed) || (layers.water?.bedM !== undefined && !(this.waterBed < this.waterLevel))) {
      throw new RangeError(`SiteColumnSource: water bedM must be below levelM ${this.waterLevel}, got ${this.waterBed}`);
    }

    this.surface = layers.surface;
    if (layers.surface !== undefined) {
      const s = layers.surface;
      assertGridSpec(s.grid, 'SiteColumnSource surface');
      assertLength('surface.material', s.material.length, s.grid);
      const seen = new Uint8Array(256);
      for (let i = 0; i < s.material.length; i++) seen[s.material[i] as number] = 1;
      for (let id = 1; id < 256; id++) if (seen[id] === 1) assertMaterial('surface material', id);
    }
  }

  sampleColumn(xM: number, zM: number, out: ColumnSample): void {
    out.surfaceMaterial = 0;
    out.columnClass = 0;
    out.buildingMaterial = 0;
    out.buildingBaseM = 0;
    out.buildingTopM = 0;
    out.waterLevelM = Number.NEGATIVE_INFINITY;
    const bounds = this.bounds;
    if (xM < bounds.minXM || xM >= bounds.maxXM || zM < bounds.minZM || zM >= bounds.maxZM) {
      out.surfaceM = Number.NEGATIVE_INFINITY;
      return;
    }
    let surfaceM = this.demAt(xM, zM);

    const surface = this.surface;
    if (surface !== undefined) {
      const i = cellIndex(surface.grid, xM, zM);
      if (i >= 0) out.surfaceMaterial = surface.material[i] as number;
    }
    const classes = this.dem.classes;
    if (classes !== undefined) out.columnClass = classes[this.nearestDemSample(xM, zM)] as number;
    const water = this.water;
    if (water !== undefined) {
      const i = cellIndex(water.grid, xM, zM);
      if (i >= 0 && water.mask[i] !== 0) {
        out.waterLevelM = this.waterLevel;
        if (surfaceM > this.waterBed) surfaceM = this.waterBed;
      }
    } else if ((out.columnClass & 7) === UNIT_WATER) {
      out.waterLevelM = SEA;
    }
    out.surfaceM = surfaceM;
    const buildings = this.buildings;
    if (buildings !== undefined) {
      const i = cellIndex(buildings.grid, xM, zM);
      if (i >= 0) {
        const h = buildings.height[i] as number;
        if (h !== 0) {
          const top = (this.absoluteRoof ? this.roofDatum : surfaceM) + h * this.buildingScale;
          if (top > surfaceM) {
            out.buildingMaterial = this.classMaterial[buildings.cls[i] as number] as number;
            out.buildingBaseM = surfaceM;
            out.buildingTopM = top;
          }
        }
      }
    }
  }

  /** Index of the DEM sample nearest to a position inside `bounds`. */
  private nearestDemSample(xM: number, zM: number): number {
    const grid = this.dem.grid;
    const w = grid.width;
    const d = grid.depth;
    // Cell registration: the containing cell. Node registration: the nearest node.
    const round = this.demShift === 0 ? 0.5 : 0;
    const ix = Math.min(w - 1, Math.floor((xM - grid.originXM) / grid.cellSizeM + round));
    const iz = Math.min(d - 1, Math.floor((zM - grid.originZM) / grid.cellSizeM + round));
    return ix + (this.southFirst ? d - 1 - iz : iz) * w;
  }

  /** Ground height in metres at a position inside `bounds`. */
  private demAt(xM: number, zM: number): number {
    const { grid, data } = this.dem;
    const w = grid.width;
    const d = grid.depth;
    if (!this.bilinear) return (data[this.nearestDemSample(xM, zM)] as number) / this.demUnits + this.demOffset;
    // Position in sample units, clamped so the half cell along a cell-registered edge extends flat.
    const gx = Math.min(w - 1, Math.max(0, (xM - grid.originXM) / grid.cellSizeM - this.demShift));
    const gz = Math.min(d - 1, Math.max(0, (zM - grid.originZM) / grid.cellSizeM - this.demShift));
    const ix0 = Math.min(Math.max(0, w - 2), Math.floor(gx));
    const iz0 = Math.min(Math.max(0, d - 2), Math.floor(gz));
    const ix1 = Math.min(w - 1, ix0 + 1);
    const iz1 = Math.min(d - 1, iz0 + 1);
    const u = gx - ix0;
    const v = gz - iz0;
    const south = this.southFirst;
    const row0 = (south ? d - 1 - iz0 : iz0) * w;
    const row1 = (south ? d - 1 - iz1 : iz1) * w;
    const a = (data[ix0 + row0] as number) * (1 - u) + (data[ix1 + row0] as number) * u;
    const b = (data[ix0 + row1] as number) * (1 - u) + (data[ix1 + row1] as number) * u;
    return (a * (1 - v) + b * v) / this.demUnits + this.demOffset;
  }
}

/** Index of the cell containing a world-metre position, or -1 outside the grid. */
function cellIndex(grid: GridSpec, xM: number, zM: number): number {
  const ix = Math.floor((xM - grid.originXM) / grid.cellSizeM);
  const iz = Math.floor((zM - grid.originZM) / grid.cellSizeM);
  if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.depth) return -1;
  return ix + iz * grid.width;
}
