/** Far raster (tier F): the whole game grid at 64 m cells, heights plus column classes. */
import { FAR_CELL_M, GRID_HEIGHT_M, GRID_WIDTH_M, type TerrainRaster } from '@bayvox/core';
import { type ElevationSource, resampleCells } from '../terrain/resample.ts';
import { type ColumnField, classifyColumns, fieldClasses, sandProvinceMask } from './classify.ts';

export const FAR_COLS = GRID_WIDTH_M / FAR_CELL_M;
export const FAR_ROWS = GRID_HEIGHT_M / FAR_CELL_M;
/** Sub-samples per axis per cell: a 32 m lattice box-filters the z12 source (about 30 m per pixel). */
export const FAR_SUBSAMPLES = 2;

export interface FarBuild {
  raster: TerrainRaster;
  /** Geology inputs on the far grid, reused to classify site DEM nodes. */
  field: ColumnField;
}

export function buildFarRaster(src: ElevationSource): FarBuild {
  const heights = resampleCells(src, { originE: 0, originN: 0, cols: FAR_COLS, rows: FAR_ROWS, cellM: FAR_CELL_M }, FAR_SUBSAMPLES);
  const field = classifyColumns(heights, FAR_COLS, FAR_ROWS, FAR_CELL_M, sandProvinceMask(FAR_COLS, FAR_ROWS, FAR_CELL_M));
  return {
    raster: {
      kind: 'far',
      cols: FAR_COLS,
      rows: FAR_ROWS,
      cellM: FAR_CELL_M,
      originX: 0,
      originN: 0,
      heights,
      classes: fieldClasses(field),
    },
    field,
  };
}
