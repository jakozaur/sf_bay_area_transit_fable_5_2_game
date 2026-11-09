/** Site DEM tiles: 2,048 m tiles of 257 x 257 nodes at 8 m, heights plus column classes. */
import { DEM_CELL_M, DEM_TILE_NODES, SITE_TILE_SIZE_M, type TerrainRaster } from '@bayvox/core';
import { type ColumnField, classifyNodes } from '../far/classify.ts';
import { type ElevationSource, resampleNodes } from './resample.ts';

/** One site tile. (tx, ty) index the 2,048 m site-tile grid from the grid origin, east and north. */
export function buildDemTile(src: ElevationSource, field: ColumnField, tx: number, ty: number): TerrainRaster {
  const grid = {
    originE: tx * SITE_TILE_SIZE_M,
    originN: ty * SITE_TILE_SIZE_M,
    cols: DEM_TILE_NODES,
    rows: DEM_TILE_NODES,
    cellM: DEM_CELL_M,
  };
  const heights = resampleNodes(src, grid);
  return {
    kind: 'dem',
    cols: grid.cols,
    rows: grid.rows,
    cellM: grid.cellM,
    originX: grid.originE,
    originN: grid.originN,
    heights,
    classes: classifyNodes(field, heights, grid),
  };
}
