/**
 * Region loader, part 2: rasterizes decoded site features (site-data.ts) into SiteColumnSource layers, one
 * site tile at a time, at any cell size. TiledSiteSource is the ColumnSource over a whole site: at 1 m it
 * feeds ChunkWorldStore (tiles are rasterized on first touch), at 4 m it feeds the city-tier column patches.
 */
import { Material, SEA_LEVEL_M, SITE_TILE_SIZE_M, terrainHeightM } from '@bayvox/core';
import { type ColumnBounds, type ColumnSample, type ColumnSource, clearColumnSample } from './column-source.ts';
import { type BuildingFootprint, type GridSpec, rasterizeBuildings, rasterizePolygon } from './rasterize.ts';
import type { Box2, SiteData, SiteLine } from './site-data.ts';
import { demLayerFromTerrainRaster, SiteColumnSource, type SiteLayers } from './site-source.ts';

/** Tidal water is at least this deep: the bed under mapped water is lowered to SEA_LEVEL_M minus this. */
export const TIDAL_MIN_DEPTH_M = 2;
/** Datum of the roof elevations in a tile's building layer (they are stored unsigned), world metres. */
export const ROOF_DATUM_M = -64;

/** DEM ground height at a plan position, clamped into the site. */
export function siteGroundM(site: SiteData, x: number, z: number): number {
  const { tx0, ty0, nx, ny } = site.tileBox;
  const b = site.bounds;
  const cx = Math.min(Math.max(x, b.minX), b.maxX);
  const cz = Math.min(Math.max(z, b.minZ), b.maxZ);
  const tx = Math.min(tx0 + nx - 1, Math.floor(cx / SITE_TILE_SIZE_M));
  const ty = Math.min(ty0 + ny - 1, Math.max(ty0, Math.ceil((0 - cz) / SITE_TILE_SIZE_M) - 1));
  const dem = site.dem[tx - tx0 + (ty - ty0) * nx];
  if (dem === undefined) throw new Error(`siteGroundM: site ${site.id} has no DEM for tile (${tx}, ${ty})`);
  return terrainHeightM(dem, cx, cz);
}

function overlaps(a: Box2, grid: GridSpec): boolean {
  return (
    a.minX < grid.originXM + grid.width * grid.cellSizeM &&
    a.maxX > grid.originXM &&
    a.minZ < grid.originZM + grid.depth * grid.cellSizeM &&
    a.maxZ > grid.originZM
  );
}

/**
 * Paints a polyline of the given width into `out`: one rectangle per segment plus a square at every
 * vertex so bends leave no wedge. Lines narrower than 1.5 cells are widened to that, so coarse grids
 * keep roads connected under the cell-centre rule.
 */
function paintLine(grid: GridSpec, line: SiteLine, out: Uint8Array): void {
  const half = Math.max(line.widthM, grid.cellSizeM * 1.5) / 2;
  const p = line.points;
  const width = grid.width;
  const fill = (iz: number, ix0: number, ix1: number): void => {
    out.fill(line.material, iz * width + ix0, iz * width + ix1);
  };
  const quad = new Float64Array(8);
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i] as number;
    const az = p[i + 1] as number;
    const bx = p[i + 2] as number;
    const bz = p[i + 3] as number;
    const len = Math.hypot(bx - ax, bz - az);
    if (len > 0) {
      const nx = (-(bz - az) / len) * half;
      const nz = ((bx - ax) / len) * half;
      quad[0] = ax + nx;
      quad[1] = az + nz;
      quad[2] = bx + nx;
      quad[3] = bz + nz;
      quad[4] = bx - nx;
      quad[5] = bz - nz;
      quad[6] = ax - nx;
      quad[7] = az - nz;
      rasterizePolygon(grid, [quad], fill);
    }
    quad[0] = bx - half;
    quad[1] = bz - half;
    quad[2] = bx + half;
    quad[3] = bz - half;
    quad[4] = bx + half;
    quad[5] = bz + half;
    quad[6] = bx - half;
    quad[7] = bz + half;
    rasterizePolygon(grid, [quad], fill);
  }
}

interface TileRaster {
  grid: GridSpec;
  /** Non-zero where tidal water is mapped. */
  mask: Uint8Array;
  /** Ground paint material per cell, 0 on the sea bed. */
  surface: Uint8Array;
  /** Roof elevation above ROOF_DATUM_M in metres, 0 = no building. */
  roof: Uint16Array;
  /** Building material per cell, 0 = no building. */
  cls: Uint8Array;
}

/** Rasterizes the site's features into one grid under the cell-centre rule. */
function rasterTile(site: SiteData, grid: GridSpec): TileRaster {
  const width = grid.width;
  const cells = grid.width * grid.depth;
  // Tidal water first: it decides where there is ground to paint at all.
  const mask = new Uint8Array(cells);
  for (const w of site.tidalWater) {
    if (!overlaps(w, grid)) continue;
    rasterizePolygon(grid, w.rings, (iz, ix0, ix1) => {
      mask.fill(1, iz * width + ix0, iz * width + ix1);
    });
  }

  // Ground paint: pavement everywhere, then land use and ponds, then roads and rail.
  const surface = new Uint8Array(cells).fill(Material.PAVEMENT);
  for (const a of site.areas) {
    if (!overlaps(a, grid)) continue;
    rasterizePolygon(grid, a.rings, (iz, ix0, ix1) => {
      surface.fill(a.material, iz * width + ix0, iz * width + ix1);
    });
  }
  for (const line of site.lines) if (overlaps(line, grid)) paintLine(grid, line, surface);
  // No paint on the sea bed.
  for (let i = 0; i < cells; i++) if (mask[i] !== 0) surface[i] = 0;

  // Roofs are flat: each building stands on the ground under the middle of its footprint (never below
  // the water line, for sheds on piers), and its roof elevation is rasterized, the highest roof winning.
  const footprints: BuildingFootprint[] = [];
  for (const b of site.buildings) {
    if (!overlaps(b, grid)) continue;
    const base = Math.max(SEA_LEVEL_M, siteGroundM(site, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2));
    footprints.push({ rings: b.rings, heightM: base + b.heightM - ROOF_DATUM_M, cls: b.material });
  }
  const buildings = rasterizeBuildings(grid, footprints, 1);
  return { grid, mask, surface, roof: buildings.height, cls: buildings.cls };
}

/**
 * Merges `factor` x `factor` cells into one, by majority: a coarse cell is water, or a building, when at
 * least half of its fine cells are. A building cell takes the highest roof in the block and that roof's
 * material; the ground paint is the most common one. Sampling coarse cells at their centre instead would
 * drop most buildings and all streets.
 */
function coarsen(fine: TileRaster, factor: number): TileRaster {
  const width = fine.grid.width / factor;
  const depth = fine.grid.depth / factor;
  const grid: GridSpec = { ...fine.grid, cellSizeM: fine.grid.cellSizeM * factor, width, depth };
  const out: TileRaster = {
    grid,
    mask: new Uint8Array(width * depth),
    surface: new Uint8Array(width * depth),
    roof: new Uint16Array(width * depth),
    cls: new Uint8Array(width * depth),
  };
  const half = (factor * factor) / 2;
  const votes = new Uint16Array(256);
  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      let water = 0;
      let built = 0;
      let roof = 0;
      let cls = 0;
      votes.fill(0);
      for (let dz = 0; dz < factor; dz++) {
        const row = (iz * factor + dz) * fine.grid.width + ix * factor;
        for (let dx = 0; dx < factor; dx++) {
          const k = row + dx;
          if (fine.mask[k] !== 0) water++;
          const r = fine.roof[k] as number;
          if (r !== 0) {
            built++;
            if (r > roof) {
              roof = r;
              cls = fine.cls[k] as number;
            }
          }
          const paint = fine.surface[k] as number;
          votes[paint] = (votes[paint] as number) + 1;
        }
      }
      const i = ix + iz * width;
      if (built >= half) {
        out.roof[i] = roof;
        out.cls[i] = cls;
      }
      if (water >= half) {
        out.mask[i] = 1;
      } else {
        // Most common ground paint, the sea bed (0) excluded.
        let best = 0;
        let bestVotes = 0;
        for (let m = 1; m < 256; m++) {
          const v = votes[m] as number;
          if (v > bestVotes) {
            bestVotes = v;
            best = m;
          }
        }
        out.surface[i] = best;
      }
    }
  }
  return out;
}

/** Cells at or below this size are rasterized directly; coarser ones are merged from cells of this size. */
const DIRECT_CELL_MAX_M = 8;

/** SiteColumnSource layers for one site tile (tx, ty on the 2,048 m grid) at `cellM` metres per raster cell. */
export function buildSiteTileLayers(site: SiteData, tx: number, ty: number, cellM: number): SiteLayers {
  const { tx0, ty0, nx, ny } = site.tileBox;
  if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < tx0 || tx >= tx0 + nx || ty < ty0 || ty >= ty0 + ny) {
    throw new RangeError(`buildSiteTileLayers: tile (${tx}, ${ty}) is outside site ${site.id}`);
  }
  const factor = cellM > DIRECT_CELL_MAX_M ? cellM / DIRECT_CELL_MAX_M : 1;
  const fineCellM = cellM / factor;
  const cells = SITE_TILE_SIZE_M / cellM;
  if (!(cellM > 0) || !Number.isInteger(cells) || !Number.isInteger(factor)) {
    throw new RangeError(
      `buildSiteTileLayers: cellM must divide ${SITE_TILE_SIZE_M} m (and be a multiple of ${DIRECT_CELL_MAX_M} m above it), got ${cellM}`,
    );
  }
  const fineGrid: GridSpec = {
    originXM: tx * SITE_TILE_SIZE_M,
    originZM: 0 - (ty + 1) * SITE_TILE_SIZE_M,
    cellSizeM: fineCellM,
    width: cells * factor,
    depth: cells * factor,
  };
  const fine = rasterTile(site, fineGrid);
  const raster = factor === 1 ? fine : coarsen(fine, factor);
  const dem = site.dem[tx - tx0 + (ty - ty0) * nx];
  if (dem === undefined) throw new Error(`buildSiteTileLayers: site ${site.id} has no DEM for tile (${tx}, ${ty})`);
  return {
    dem: demLayerFromTerrainRaster(dem),
    buildings: { grid: raster.grid, height: raster.roof, heightScaleM: 1, roofDatumM: ROOF_DATUM_M, cls: raster.cls },
    water: { grid: raster.grid, mask: raster.mask, levelM: SEA_LEVEL_M, bedM: SEA_LEVEL_M - TIDAL_MIN_DEPTH_M },
    surface: { grid: raster.grid, material: raster.surface },
  };
}

/**
 * ColumnSource over a whole site. Each 2,048 m tile gets its own SiteColumnSource, built when a column in
 * it is first sampled (about 20 MB per tile at 1 m cells), so only visited tiles cost memory. With
 * `maxTiles`, the least recently sampled tile is dropped when one more is needed; a dropped tile is
 * rasterized again from the same features on its next sample, so the columns never change.
 */
export class TiledSiteSource implements ColumnSource {
  readonly bounds: ColumnBounds;
  readonly site: SiteData;
  readonly cellM: number;
  private readonly maxTiles: number;
  private readonly tiles: (SiteColumnSource | undefined)[];
  /** Access clock value per tile; the smallest is the eviction victim. */
  private readonly used: Float64Array;
  private clock = 0;
  private resident = 0;
  private built = 0;
  private lastIndex = -1;
  private lastTile: SiteColumnSource | undefined;

  constructor(site: SiteData, cellM: number, options: { maxTiles?: number } = {}) {
    const maxTiles = options.maxTiles ?? Number.POSITIVE_INFINITY;
    if (!(maxTiles >= 1)) throw new RangeError(`TiledSiteSource: maxTiles must be at least 1, got ${maxTiles}`);
    this.site = site;
    this.cellM = cellM;
    this.maxTiles = maxTiles;
    this.bounds = { minXM: site.bounds.minX, minZM: site.bounds.minZ, maxXM: site.bounds.maxX, maxZM: site.bounds.maxZ };
    this.tiles = new Array(site.tileBox.nx * site.tileBox.ny);
    this.used = new Float64Array(site.tileBox.nx * site.tileBox.ny);
  }

  /** Tiles rasterized so far, counting a tile again each time it is rebuilt after eviction. */
  get tilesBuilt(): number {
    return this.built;
  }

  /** Tiles held in memory now. */
  get tilesResident(): number {
    return this.resident;
  }

  sampleColumn(xM: number, zM: number, out: ColumnSample): void {
    const b = this.bounds;
    if (!(xM >= b.minXM && xM < b.maxXM && zM >= b.minZM && zM < b.maxZM)) {
      clearColumnSample(out);
      return;
    }
    const { tx0, ty0, nx } = this.site.tileBox;
    const tx = Math.floor(xM / SITE_TILE_SIZE_M);
    // Tiles count north; a tile covers z in [-(ty + 1) * size, -ty * size).
    const ty = Math.ceil((0 - zM) / SITE_TILE_SIZE_M) - 1;
    const i = tx - tx0 + (ty - ty0) * nx;
    let tile = this.lastTile;
    if (i !== this.lastIndex || tile === undefined) {
      tile = this.tiles[i];
      if (tile === undefined) {
        if (this.resident >= this.maxTiles) this.evictOldest();
        tile = new SiteColumnSource(buildSiteTileLayers(this.site, tx, ty, this.cellM));
        this.tiles[i] = tile;
        this.resident++;
        this.built++;
      }
      this.used[i] = ++this.clock;
      this.lastIndex = i;
      this.lastTile = tile;
    }
    tile.sampleColumn(xM, zM, out);
  }

  private evictOldest(): void {
    let victim = -1;
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i] !== undefined && (victim < 0 || (this.used[i] as number) < (this.used[victim] as number))) victim = i;
    }
    if (victim < 0) throw new Error(`TiledSiteSource: ${this.resident} tiles counted as resident, none found`);
    this.tiles[victim] = undefined;
    this.resident--;
  }
}
