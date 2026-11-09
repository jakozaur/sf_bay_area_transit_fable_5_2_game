# Data attribution

Map data shipped under `apps/game/public/data/` is derived from the sources below. The build is reproducible from pinned inputs: the method of making the alterations is the open pipeline in `packages/pipeline/` (ODbL 4.6). Not legal advice; background in `docs/research/01-osm-data.md` section 7.

## Terrain (`pnpm data:build:terrain`)

Files: `far/terrain.*.bin`, `sites/*/dem_*.bin`, index `manifest.terrain.json` (tile counts, checksums, measured sanity values).

| Source                                                                                          | Used for                                                                                                                                | License                                     | Credit                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS Terrain Tiles (Mapzen terrarium), zoom 12 for the whole grid and zoom 14 for the site boxes | Land elevation and bathymetry of the far raster and the site DEM tiles; the column classes (water, made land, rock) are derived from it | Public domain inputs; attribution requested | United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration. |

The geology under the surface is procedural (`packages/core/src/assets/terrain.ts` materialAt); no mapped geology dataset is shipped.

## Vector layers (`pnpm data:build:vectors`)

Files: `net/rail.*.bin`, `net/far.*.bin`, `sites/*/*.vectors.*.bin`, index `manifest.vectors.json` (exact snapshot ids, sizes, checksums).

| Source                                                                                                                              | Used for                                                                                                               | License  | Credit                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| OpenStreetMap, via the Geofabrik NorCal extract `norcal-261108.osm.pbf` (2026-11-08)                                                | Rail tracks, stations, route relations; roads in site tiles; motorways, trunk roads, cities and towns in the far layer | ODbL 1.0 | (c) OpenStreetMap contributors, https://www.openstreetmap.org/copyright                              |
| Overture Maps Foundation, release `2026-10-21.0`, themes `buildings` (`building`, `building_part`) and `base` (`water`, `land_use`) | Building footprints and heights, water polygons including San Francisco Bay, land use and parks                        | ODbL 1.0 | (c) OpenStreetMap contributors, Overture Maps Foundation, https://docs.overturemaps.org/attribution/ |

Overture conflates several upstream datasets. Its attribution page lists, for the themes used here: OpenStreetMap, Microsoft ML Building Footprints, Esri Community Maps and Google Open Buildings for buildings (USGS 3DEP is listed among the building sources as well), and OpenStreetMap-derived data for `base` water and land use. Measured on the Bay Area bounding box of research doc 01 (not on the shipped site tiles): 2,561,528 building footprints from OpenStreetMap, 560,577 from Microsoft ML Buildings, 75,996 from Esri Community Maps.

The curated anchor points in the far layer (`packages/pipeline/src/vectors/places.json`) are our own content with coordinates from `docs/research/05-bay-area-transit-projects.md` section 5.

In-game credit line (`apps/game/index.html`): "Map data (c) OpenStreetMap contributors, Overture Maps Foundation. Terrain: USGS 3DEP, NOAA".
