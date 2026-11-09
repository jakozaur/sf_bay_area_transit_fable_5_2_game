# 04. World scale and voxelization of a 100 km region

Status: research, 2026-11-09. Scope: scale math, precedents, OSM voxelization, coordinates, one concrete shippable scheme. Rendering internals are in `03-voxel-rendering.md`, terrain/bathymetry sources in `02-terrain-bathymetry-geology.md`; this doc only points at them.

Evidence labels: **[M]** measured here (scripts and outputs in `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/world-scale/`), **[C]** computed from cited inputs, **UNVERIFIED** not confirmed against a source.

## 1. Bottom line

- No single voxel size works. Tunnels need about 1 m voxels (7 m bore = 7 voxels); the region needs 16 m or coarser columns to fit in memory. The gap is 16x linear, 256x in column count.
- The player-edited volume is tiny (roughly 100 km of 7 to 15 m bores), so the world should be a baked 2.5D column field plus a sparse 3D voxel overlay that exists only where something was dug.
- Ship vectors plus DEM, voxelize in the client at whatever LOD the camera needs. Measured: about 20 bytes per building footprint after quantization and brotli, so all 1.86M buildings in the game box are about 40 MB, against about 170 MB for a pre-rasterized 2 m column field of buildings alone [M].
- Tracks, tunnel alignments, bridges and trains are vector geometry. Voxels are derived from them (swept-volume stamping), never the source of truth.
- Projection: UTM 10N (EPSG:32610). Web Mercator is 26% off in scale at this latitude and drifts 1.15% across the region.

## 2. Reference dimensions

| Thing | Size | Source |
|---|---|---|
| Salesforce Tower | 326 m architectural, 296 m roof, 61 floors | https://en.wikipedia.org/wiki/Salesforce_Tower |
| Salesforce Transit Center building | about 440 m x 50 m; two-level train box below, 6 tracks, 3 island platforms | https://en.wikipedia.org/wiki/Salesforce_Transit_Center , https://www.tjpa.org/portaldtx/about-portal |
| The Portal | about 2.2 mi total construction length; cut-and-cover plus mined tunnel under Townsend and Second; platforms two levels below ground | https://www.tjpa.org/portaldtx/about-portal |
| Transbay Tube | 5.8 km long, max 41 m below sea level, sections 15 m x 7.3 m, each bore about 5.2 m | https://en.wikipedia.org/wiki/Transbay_Tube |
| BART Silicon Valley Phase II | about 5 mi single bore; TBM nearly 54 ft (16.5 m) cut diameter, lined tunnel 48 ft inside, just under 52 ft outside (corrected 2026-11-09; older 48 ft outside / 43 ft inside figures predate the enlarged design) | https://www.vta.org/blog/vta-purchases-tunnel-boring-machine-bsvii-project ; VTA 2026 monitoring reports say "approximately 53 feet in diameter" (https://vtabart.org/wp-content/uploads/2026/08/2026-06-CA-BSVII-OP25-ProjectMonitoringReport-1-1.pdf , as relayed by search) |
| Bay Bridge | 7.18 km; towers 160 m; west main spans 704 m; clearance 67 m; west deck 17.5 m of lanes | https://en.wikipedia.org/wiki/San_Francisco%E2%80%93Oakland_Bay_Bridge |
| Golden Gate Bridge | 2,737 m; main span 1,280 m; 27.4 m wide; towers 227.4 m; strait about 113 m deep | https://en.wikipedia.org/wiki/Golden_Gate_Bridge |
| Mount Diablo | 1,173 m (NAVD88) | https://en.wikipedia.org/wiki/Mount_Diablo |
| SoMa block | 825 ft x 550 ft (251 m x 168 m) | UNVERIFIED in the 2026-11-09 fact-check; https://codelibrary.amlegal.com/codes/san_francisco/latest/sf_planning/0-0-0-21838 |
| BART platform | about 700 ft (213 m), 10-car trains | UNVERIFIED (BART article confirms 5 to 10 car trains only: https://en.wikipedia.org/wiki/Bay_Area_Rapid_Transit ) |
| Typical SF street right-of-way | about 21 m (68.75 ft) | UNVERIFIED |
| Single-track metro TBM bore | 6 to 7 m | UNVERIFIED as a general figure; Transbay Tube bores are 5.2 m (above) |

Vertical extent the world must cover: about -115 m (Golden Gate channel) to about +1,175 m (Diablo) for terrain, +326 m above ground for buildings, tunnels down to about -45 m. Measured DEM range in a 120 x 100 km crop: -120 m (clipped) to 1,329 m; p50 11 m, p90 323 m, p99 859 m; 39% of cells at or below 0.5 m (ocean plus bay) [M, from AWS Terrain Tiles z12, 361 tiles, 34.3 MB].

## 3. Bay Area inventory (measured)

Overture Maps release 2026-10-21.0, queried with DuckDB over S3 with bbox pushdown; 54 s for the larger box, no GDAL or osmium needed [M].

| Quantity | Wide box (37.10..38.35 N, -123.10..-121.55 E, about 137 x 139 km) | Game box (37.20..38.05 N, -122.60..-121.75 E, about 75 x 94 km) |
|---|---|---|
| Buildings | 2,271,357 | 1,856,874 |
| with `height` | 1,846,308 (81%) | 1,536,530 (83%) |
| with `num_floors` | 35,697 | n/a |
| Source split | OSM 1,886,518; Microsoft ML 338,440; Esri 46,399 | n/a |
| Height quantiles | p50 4.7 m, p90 7.1 m, p99 12.0 m, p99.9 23.5 m, max 326 m | n/a |
| Buildings >= 30 / 60 / 100 / 150 m | 990 / 310 / 109 / 31 | n/a |
| sqrt(footprint area) | p10 5.8 m, p50 13.4 m, p90 18.6 m, p99 41 m | n/a |
| Total footprint area | 544 km2 | n/a |
| Road segments (Overture transportation) | n/a | 627,744 |
| Rail segments | n/a | 4,085 |

Cross-check from Overpass (wide box): 805,630 `highway` ways, 6,075 rail/subway/light_rail/tram ways, 458,669 building ways with an OSM `height` tag, 10,544 building relations [M, https://overpass-api.de]. Overture reports far more heights than raw OSM tags, so Overture is the better building source; which upstream fills the heights is UNVERIFIED.

Implications:
- 99% of buildings are under 12 m. The skyline is 109 buildings over 100 m. Treat those as hero objects, everything else as texture.
- Median house is 13 m across. Any cell over about 6 m cannot separate neighbouring houses.

## 4. Voxel size math

Region boxes: nominal 120 x 100 km = 12,000 km2; proposed game grid 81.92 x 98.304 km = 8,053 km2 (20 x 24 tiles of 4,096 m). Dense volume assumes 1,536 m vertical range at 1 byte per voxel. All rows [C] unless marked.

### 4.1 Counts and memory

| Voxel | Grid (120x100 km) | Columns | Dense voxels | Column field in RAM (3 B/col) | Columns, game grid |
|---|---|---|---|---|---|
| 1 m | 120,000 x 100,000 | 12.0 G | 18,432 G | 36 GB | 8.05 G |
| 2 m | 60,000 x 50,000 | 3.0 G | 2,304 G | 9.0 GB | 2.01 G |
| 4 m | 30,000 x 25,000 | 750 M | 288 G | 2.25 GB | 503 M |
| 8 m | 15,000 x 12,500 | 187.5 M | 36 G | 563 MB | 126 M |
| 16 m | 7,500 x 6,250 | 46.9 M | 4.5 G | 141 MB | 31.5 M |
| 32 m | 3,750 x 3,125 | 11.7 M | 0.56 G | 35 MB | 7.9 M |

- Dense 3D is out at every size except 32 m. Columns (2.5D) fit in RAM only at 8 m and coarser for the whole region.
- The same holds for every precedent that covers a large area: they stream, or they are 2.5D (section 5).

### 4.2 What is recognizable

| Voxel | 7 m bore | 16.5 m BSV bore | 21 m street | 13 m house | 213 m platform | Salesforce Tower | GG towers |
|---|---|---|---|---|---|---|---|
| 1 m | 7 | 16.5 | 21 | 13 | 213 | 326 | 227 |
| 2 m | 3.5 | 8.3 | 10.5 | 6.7 | 106 | 163 | 114 |
| 4 m | 1.75 | 4.1 | 5.2 | 3.4 | 53 | 82 | 57 |
| 8 m | 0.9 | 2.1 | 2.6 | 1.7 | 27 | 41 | 28 |
| 16 m | 0.4 | 1.0 | 1.3 | 0.8 | 13 | 20 | 14 |
| 32 m | 0.2 | 0.5 | 0.7 | 0.4 | 7 | 10 | 7 |

### 4.3 Rasterization experiment [M]

Overture footprints, area-majority rule (cell is building if >= 50% covered, sampled 4x4 per cell), tallest building wins, cubic voxels (height rounded to voxel size, minimum 1). Two 2.6 x 2.8 km samples: SF downtown/SoMa (5,076 buildings, 40% footprint coverage, max 326 m) and a Mountain View suburb (7,656 buildings, 25% coverage, max 23 m). "Components/bldg" is connected building blobs per building: it falls when separate buildings fuse. Quads are a 1D run-merge (a conservative stand-in for 2D greedy meshing).

SF downtown/SoMa:

| Voxel | Buildings with >= 1 cell | Components/bldg | Distinct heights | Quads/km2 | Brotli bits/col |
|---|---|---|---|---|---|
| 1 m | 99.8% | 0.22 | 147 | 76.7 k | 0.33 |
| 2 m | 99.8% | 0.20 | 86 | 37.0 k | 0.62 |
| 4 m | 99.4% | 0.17 | 51 | 17.3 k | 1.12 |
| 8 m | 96.5% | 0.15 | 30 | 7.6 k | 1.73 |
| 16 m | 73.1% | 0.11 | 17 | 2.8 k | 2.09 |
| 32 m | 32.2% | 0.07 | 9 | 0.9 k | 2.28 |

Mountain View suburb:

| Voxel | Buildings with >= 1 cell | Components/bldg | Distinct heights | Quads/km2 | Brotli bits/col |
|---|---|---|---|---|---|
| 1 m | 100.0% | 0.90 | 21 | 84.1 k | 0.39 |
| 2 m | 99.8% | 0.78 | 11 | 41.5 k | 0.71 |
| 4 m | 98.5% | 0.57 | 6 | 19.8 k | 1.12 |
| 8 m | 93.5% | 0.40 | 3 | 8.2 k | 1.33 |
| 16 m | 65.7% | 0.27 | 1 | 2.8 k | 1.45 |
| 32 m | 15.0% | 0.07 | 1 | 0.6 k | 1.33 |

Reading:
- 1 to 2 m: individual buildings, streets, setbacks. Suburb houses still separate (0.78 to 0.90).
- 4 m: 98 to 99% of buildings still present, but 43% of suburban houses have fused with a neighbour and all houses are 1 to 2 voxels tall (6 height levels total). Downtown still reads: streets are 5 cells, towers have 51 height levels. This is the coarsest size where "city" is legible.
- 8 m: streets are 2.6 cells, houses 1.7 cells, 3 height levels in the suburb. Blocks read, buildings do not.
- 16 m: a third of buildings vanish, streets alias in and out, suburb is one flat height. Only terrain, water, land use and the tower cluster read.
- Arnis documents the same cliff: below scale 0.30 blocks/m (cells over 3.3 m) "buildings and roads are too small to render, so only terrain and land cover are generated" (https://github.com/louis-e/arnis/wiki/Generation-Settings).

Extrapolated mesh size for all 2.27M buildings (quads per building from the suburb sample: 81 / 40 / 19 / 7.9 / 2.65 / 0.6): 184M / 91M / 43M / 18M / 6M / 1.4M quads at 1 / 2 / 4 / 8 / 16 / 32 m [C from M].

### 4.4 Terrain experiment [M]

AWS Terrain Tiles (3DEP 10 m and 3 m inside the US per https://github.com/tilezen/joerd/blob/master/docs/data-sources.md and https://registry.opendata.aws/terrain-tiles ), z12 (30.2 m/px) for the region and z14 (7.55 m/px, 81 tiles) for a 17.4 km square over SF (48% water). Predictor = left + up - upleft, int16, brotli q9.

| Grid | Vertical quant | Bits/cell | Run-merged quads/col |
|---|---|---|---|
| 7.6 m (SF) | 1 m | 1.40 | 0.71 |
| 7.6 m (SF) | 4 m | 0.71 | 0.23 |
| 7.6 m (SF) | 8 m (cubic) | 0.48 | 0.11 |
| 15 m (SF) | 1 m | 2.16 | 1.08 |
| 15 m (SF) | 4 m | 1.10 | 0.42 |
| 15 m (SF) | 16 m (cubic) | 0.49 | 0.11 |
| 30 m (region) | 1 m | 2.54 | n/a |
| 30 m (region) | 8 m | 1.10 | 0.61 |
| 30 m (region) | 16 m | 0.82 | 0.33 |
| 30 m (region) | 32 m (cubic) | 0.59 | 0.16 |
| 60 m (region) | 1 m | 3.91 | n/a |
| 60 m (region) | 64 m (cubic) | 0.61 | 0.16 |

- Cubic-voxel terrain costs a scale-invariant 0.11 to 0.16 quads per column. Whole nominal region: 1,920M / 480M / 120M / 30M / 7.5M / 1.9M terrain quads at 1 / 2 / 4 / 8 / 16 / 32 m [C from M].
- Whole-region heightmap, 30 m grid, 1 m quant: 26.2 MB raw, 4.2 MB brotli. At 4 m quant: 2.4 MB [M].
- Vertical step is a free knob: finer steps than the horizontal cell (slab voxels) raise quads per column 2 to 7x but keep hills and low buildings legible at coarse horizontal sizes.

### 4.5 Vector vs pre-rasterized [M]

- Footprints quantized to 0.25 m int16 deltas plus a height byte: 32 to 44 B/building raw, 18.4 (suburb) to 23.7 (downtown) B/building after brotli.
- Game box, 1.86M buildings: about 40 MB as vectors. Pre-rasterized building columns for the game grid: about 169 MB at 2 m, 70 MB at 4 m, 24 MB at 8 m, 7 MB at 16 m [C from 4.3].
- Vectors also give 1 m detail anywhere for free and survive a change of voxel size without a re-bake.

## 5. Precedents

| Project | Scale / cell | World extent | How it copes | Source |
|---|---|---|---|---|
| Arnis (OSM to Minecraft) | 1 block = 1 m default; scale 0.05 to 2.5 (GUI), up to 4.0 (CLI); terrain height multiplier 0.25 to 4 with buildings unscaled | user rectangle; no published max, larger maps pushed to a separate tool | OSM via Overpass plus Overture footprints plus Mapterhorn elevation (AWS tiles about 30 m as fallback) plus land cover; drops buildings and roads below 0.30 | https://github.com/louis-e/arnis/wiki/Generation-Settings , https://github.com/louis-e/arnis , https://wiki.openstreetmap.org/wiki/Arnis |
| BuildTheEarth / Terra++ | 1:1 (1 block = 1 m), true scale varies with latitude | whole Earth | generated on demand from public elevation plus OSM downloaded at runtime (TerraPlusPlusOSMTileGen); Cubic Chunks to escape the 255 m build height; modified Airocean/Dymaxion projection after Mercator failed | https://github.com/BuildTheEarth/terraplusplus , https://en.wikipedia.org/wiki/Build_the_Earth |
| Minecraft Earth maps | 1:500 to 1:18000; a 1:4000 map is 10,752 x 5,376 blocks (UNVERIFIED in the 2026-11-09 fact-check) | whole Earth | heightmap only, mountains exaggerated at coarse scales; at 1:4000 the Bay Area is about 25 blocks wide [C] | https://mcpedl.com/1400-scale-earth-map/ , https://discord.com/servers/minecraft-earth-map-656100677755338753 , https://www.planetminecraft.com/project/earth-11000/ |
| Minecraft storage | 16^3 sections, paletted, 4096 entries; palette index width grows with distinct block count | n/a | uniform or low-variety sections cost almost nothing (single-valued palette at 0 bits per entry, indirect palette at 4 to 8); the model to copy for sparse edit chunks | https://minecraft.wiki/w/Java_Edition_protocol/Chunk_format (wiki.vg is offline) |
| Distant Horizons (MC LOD mod) | simplified LOD beyond loaded chunks | 256+ chunk (4 km+) view, 512 reported | 2 to 4 GB extra RAM at high settings | https://modrinth.com/project/distanthorizons , https://www.pcgamer.com/games/survival-crafting/distant-horizons-mod-blows-past-minecrafts-max-render-distance-pushing-viewable-terrain-out-to-an-unbelievable-512-chunks |
| Cities: Skylines | 8 m cell; tile 240 x 240 cells = 1,920 m | 9 x 9 tiles = 17.28 km, 2,160^2 = 4.67M cells; 9 to 25 tiles buildable | fixed heightmap, vector roads/rail on top | https://wiki.biligame.com/csl/Maps , https://admin-forum.paradoxplaza.com/forum/threads/larger-than-81-tiles.1489006 |
| Cities: Skylines II | tile about 1/3 of the CS1 tile by side length (developer: "roughly 1/3"); by area about 1/10: 159 km2 / 441 = 0.36 km2 vs 3.69 km2 [C] | 441 tiles, 159 km2 playable | same model | https://www.pcgamesn.com/cities-skylines-2/tiles |
| NIMBY Rails | vector, quantized to 32 cm at the equator | whole planet in 16 GB (target 20 GB); buildings removed to fit | custom delta-coded quantized tiles per LOD, pre-triangulated offline; tracks are true circular arcs; bake needed a 1.4 TB RAM instance | https://carloscarrasco.com/nimby-rails-retrospective/ |
| Subway Builder (beta 2025-10, 1.0 2026-02, Steam 2026-07) | vector map, no voxels | per-city; 26 US cities at beta, 55 cities in 7 countries as of 2026-10 (https://en.wikipedia.org/wiki/Subway_Builder ) | map tiles loaded online; MapLibre instance exposed to mods; per-city data served as files (`demand_data.json`, metadata); census-driven demand | https://www.subwaybuilder.com/ , https://github.com/ejfox/subwaybuilder-mod , https://www.pcgamer.com/games/city-builder/the-sleeper-hit-of-the-fall-might-be-this-mad-lads-hyper-realistic-traffic-management-sim-that-uses-real-census-data-and-a-distance-based-gravity-model-to-produce-millions-of-npc-commuters |
| Teardown | 10 cm voxels (UNVERIFIED in the 2026-11-09 fact-check) | small levels | dense per-object volumes, 8-bit palette; cannot scale past a few hundred metres | https://softwareengineeringdaily.com/wp-content/uploads/2024/12/SED1772-Teardown.txt , https://blog.voxagon.se/2024/12/29/year-summary.html |
| Townscaper | irregular relaxed quad grid, not a metric voxel grid | small islands | marching-cubes-style modules on the irregular grid; stylization over fidelity | https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making , https://boristhebrave.com/docs/sylves/1/articles/tutorials/townscaper.html (cell size UNVERIFIED) |
| Voxel Tycoon | UNVERIFIED (no primary numbers found for voxel or region size) | "infinite" procedural world | UNVERIFIED | https://www.vgdb.co/games/voxel-tycoon |

Takeaways:
- Nobody ships a metropolitan region as true 3D voxels at 1 m. 1:1 projects generate on demand from elevation plus vectors (BTE, Arnis). Large-area games are 2.5D heightmap plus vector networks (Cities: Skylines, NIMBY Rails, Subway Builder).
- Our region at 16 m columns (31.5M) is 6.7x the cell count and 27x the area of a full Cities: Skylines 1 map [C].
- NIMBY Rails dropped buildings to hit its size budget and stores circular arcs for track; Subway Builder is closest in theme and is fully vector. The differentiator here is the excavated volume, so that is where voxels should be spent.

## 6. Design options

| Option | Verdict | Why |
|---|---|---|
| (a) Single coarse scale | Reject | The only sizes that fit region-wide (16 m, 32 m) make a 7 m bore sub-voxel and erase streets (4.2, 4.3). The only sizes that show tunnels (1 to 2 m) need 2 to 8 G columns. |
| (b) Multi-resolution: regional overview plus fine work sites | Adopt | Matches how the game is played: plan at 100 km, build at 500 m. |
| (c) Heightmap surface plus sparse voxels only where dug | Adopt (as the storage model inside b) | Edited volume is about 100 km x 10 m x 10 m. Everything undisturbed is a column or an implicit stratum function. |
| (d) Vertical exaggeration | View-only | Data stays true scale. A render-time Y scale (1.0 at work sites, up to 2 to 3 in the regional view) plus a profile editor with its own V:H ratio. Arnis exposes the same idea as a terrain multiplier that leaves buildings unscaled (https://github.com/louis-e/arnis/wiki/Generation-Settings). |
| (e) Vector track geometry over voxels | Adopt | Gauge is 1.435 m (1.676 m BART, https://en.wikipedia.org/wiki/Bay_Area_Rapid_Transit ), curves and grades are continuous. NIMBY Rails stores arcs (https://carloscarrasco.com/nimby-rails-retrospective/). Voxels are stamped from the swept volume. |

## 7. Voxelizing OSM/Overture

Inputs and tooling (no osmium, GDAL or tippecanoe required):
- Buildings, roads, rail, water, land use: Overture GeoParquet on S3 via DuckDB `httpfs` (pip or npm). Verified working here: `uv venv` with Python 3.12, `duckdb`, `numpy`, `pillow`, `shapely`, `scipy` [M]. Python 3.14 also works: binary wheels for all five (plus `brotli`) installed and imported on 3.14.6, and the Overture query ran there (fact-check 2026-11-09) [M].
- Raw OSM tags Overture drops (`layer`, `building:part`, `roof:*`, `railway=*` detail): Geofabrik extract plus a pure-Python or Node PBF reader, or Overpass for small areas. Overpass returned 502 "at capacity" on the first whole-region building count [M], so do not put it in the bake path.
- Elevation: AWS Terrain Tiles terrarium PNGs over plain HTTPS, decode `(R*256 + G + B/256) - 32768` (https://registry.opendata.aws/terrain-tiles). They are Web Mercator, so resample to the game grid at bake time. Bathymetry: USGS 1 m bay DEM (https://data.usgs.gov/datacatalog/data/USGS:607df1b6d34e8564d67e3af6); details in `02-terrain-bathymetry-geology.md`.

Rules per feature class:

| Feature | Fine tiers (1 to 4 m) | Coarse tiers (16 m and up) |
|---|---|---|
| Buildings | Scanline fill, area-majority (>= 50%), tallest wins; force the centroid cell so nothing vanishes. Height = `height`, else `num_floors`/`building:levels` x 3.0 m (OSM default: https://wiki.openstreetmap.org/wiki/Key:building:levels ), else class default (house 6 m). Base at min terrain under the footprint. | No individual buildings. Per cell: coverage fraction and area-weighted p90 height, rendered as a low "built mass" slab. Towers >= 60 m (310 in the wide box) kept as individual prisms at their true footprint. |
| Roads | Capsule stamp of half-width around the centreline; width from `width`, else lanes x about 3.5 m (lane width UNVERIFIED), else class default. Paint as surface material, zero height. | Not rasterized. Motorway/trunk only, as vector lines with a minimum pixel width. |
| Rail (existing) | Vector centreline mesh; 1 m ballast stamp in the work tier. | Vector lines, always visible, never rasterized. |
| Water | Polygon fill from Overture `water` plus DEM <= sea level; depth from bathymetry. | Same, as surface class; shade by depth. |
| Land use / land cover | Polygon fill into a surface-class byte (park, forest, wetland, industrial, airport, residential). | Majority class per cell. |
| Bridges, viaducts, existing tunnels | Never rasterized into columns (columns cannot hold an overhang). Emit as vector structures: deck ribbon at tagged height, piers and towers as prisms. | Bay Bridge and Golden Gate as hand-placed low-poly models: at 16 m the west span deck is 1 cell wide, towers 10 to 14 cells [C]. |

Stylization at coarse scale:
- Exaggerate by class, not by geometry: fixed palette per surface class, heavier outlines for water edges and rail.
- Hero list (about 100 landmarks: Salesforce Tower, Transamerica, both bridges, Sutro Tower, SFO, Googleplex, Meta MPK, Oracle Redwood Shores, Apple Park, stadiums) rendered one tier finer than their surroundings.
- Rail and player projects draw as screen-space-width lines above every tier so the network is readable from 100 km.
- Slab voxels in coarse tiers (vertical step = cell / 4): 16 m cells with 4 m steps keep SF hills (Twin Peaks is about 70 steps instead of 17 [C, summit 282 m, https://en.wikipedia.org/wiki/Twin_Peaks_(San_Francisco) ]).

## 8. Coordinate systems

| Frame | Scale error in game box | Other error | Verdict |
|---|---|---|---|
| Web Mercator (EPSG:3857) | scale factor sec(lat) = 1.2554 at 37.20 N, 1.2639 at 37.70 N, 1.2699 at 38.05 N: 26% inflation, 1.15% drift north to south [C; formula https://desktop.arcgis.com/en/arcmap/latest/map/projections/mercator.htm ] | a "16 m" tile-aligned cell is 12.6 to 12.7 true metres and changes with latitude | Reject for the world grid. Fine only as the addressing scheme of source tiles. |
| True ENU tangent plane | none at origin | curvature drop d^2/2R: 7.8 m at 10 km, 71 m at 30 km, 283 m at 60 km [C] | Reject. Sea level would not be flat. |
| UTM 10N (EPSG:32610), projected E/N plus orthometric height | k0 = 0.9996 on 123 W (https://epsg.io/32610 ); k = 0.99962 at -122.6, 0.99963 at -122.4, 0.99975 at -121.75 [C]: lengths 0.025 to 0.04% short, under 40 cm per km | grid north rotated up to 0.76 deg from true north at the east edge [C]; distortion bounded at 1 part in 1,000 zone-wide (https://en.wikipedia.org/wiki/Universal_Transverse_Mercator_coordinate_system ) | Adopt. Standard EPSG code, trivial in proj4js/pyproj. |
| Custom transverse Mercator centred on about -122.18, k0 = 1 | under 45 ppm at 60 km [C] | convergence under 0.3 deg [C] | Not worth a non-standard CRS for a 0.03% gain. |

Conventions:
- World metres = UTM 10N easting/northing minus a fixed origin at the SW corner of the game grid, snapped to 4,096 m. Y up = NAVD88 metres. Flat world, flat sea.
- Cost and length maths use grid metres directly; the 0.04% error is far below cost-model noise.
- Precision: float32 has a 7.8 mm step between 65 and 131 km [C]. Keep world positions in float64 on the CPU, vertices chunk-local small integers, and render camera-relative.
- Sea level in NAVD88 at SF: MSL = +0.97 m, MHHW = +1.80 m, MLLW = +0.02 m (NOAA station 9414290, https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9414290/datums.json?units=metric , fetched 2026-11-09). Pick one water plane constant from these.

## 9. Recommendations for the game

### 9.1 Scheme: vector in, voxel out, four tiers

Game grid: 81.92 km (E-W) x 98.304 km (N-S) = 20 x 24 region tiles of 4,096 m, UTM 10N. Covers SF, Oakland, Richmond, San Jose, Fremont, Livermore's west edge, all three campuses. Gilroy and the Pacheco Pass approach fall outside (open question).

| Tier | Horizontal cell | Vertical step | Representation | Extent loaded | Source |
|---|---|---|---|---|---|
| F (far) | 64 m | 16 m | column raster, 1,280 x 1,536 = 1.97M columns | whole region, always | baked, one file |
| R (region) | 16 m | 4 m | column raster, 5,120 x 6,144 = 31.5M columns in 480 tiles of 256^2 | about 12 km radius | baked tiles |
| C (city) | 4 m | 1 m | columns generated in a worker from vector tiles plus DEM | about 2.5 km radius | vector plus DEM tiles |
| W (work site) | 1 m | 1 m | columns as in C, plus true 3D chunks of 32^3 wherever the ground is opened | about 400 m radius around the cursor or active TBM | same vectors, plus save data |

- Factor 4 between tiers keeps it to four code paths; add 2 m and 8 m by runtime downsampling only if tier seams pop visibly.
- W at 1 m matches the Minecraft/BTE/Arnis convention and gives a 7 m bore 7 voxels. Low-end fallback: run W at 2 m from the same data.
- Underground is implicit: `material(x, y, z)` from depth below surface plus a few geology polygons (fill, Bay Mud, Franciscan; see `02`). Nothing is stored until dug.
- Promote on edit: the first excavation in a 32 m cell converts those columns into 3D chunks. Uniform chunks stay a single value, palette-indexed otherwise (Minecraft model, https://minecraft.wiki/w/Java_Edition_protocol/Chunk_format).
- Tunnels, stations, track, portals are vector objects (centreline as line/arc/spiral plus vertical profile plus cross-section template). The void is stamped into W chunks when they load. Save file = vector graph plus an RLE diff of manual digs.
- Trains, track, tunnel lining, bridges, catenary: conventional meshes on the vector geometry, not voxels.

### 9.2 Static asset budget

| Asset | Tiling | Estimated size (brotli) | Basis |
|---|---|---|---|
| F64 raster (height, class, built mass) | 1 file | about 1 MB | 1.97M cols at about 4 bits [C from 4.4] |
| R16 raster | 480 files, 4,096 m | about 10 MB total, about 21 kB each | 31.5M cols at about 2.6 bits (1.1 height at 4 m quant, rest class and built mass) [C from 4.4; class and built-mass bits UNVERIFIED] |
| DEM for C/W, 8 m grid, 1 m quant | 1,920 files, 2,048 m, 256^2 | about 30 MB total, about 16 kB each | 126M cells at about 2 bits [C from 4.4] |
| Buildings, quantized vector | same 2,048 m tiles | about 40 MB total | 1.86M x about 21 B [M] |
| Roads, land use, water vectors | same tiles | 20 to 40 MB | 628k road segments; size UNVERIFIED |
| Existing rail network plus scenario alignments | 1 file | under 1 MB | 4,085 rail segments [M]; size UNVERIFIED |
| Hero models | about 100 small files | under 5 MB | UNVERIFIED |
| Total hosted | about 4,500 files | about 110 to 130 MB | |

- Fits Cloudflare Pages free tier (20,000 files, 25 MiB per file: https://developers.cloudflare.com/pages/platform/limits ) and GitHub Pages (1 GB site, 100 GB/month soft bandwidth, and not permitted for commercial sites: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits ). A single PMTiles archive would exceed the 25 MiB per-file cap, so ship loose tiles.
- 8 m DEM grid is the honest ceiling: the source is 3DEP at about 10 m (3 m in places).

### 9.3 Load and runtime budget

| Phase | Download | What the player sees |
|---|---|---|
| Boot | app bundle plus F64 plus rail network: 3 to 4 MB | whole Bay, coastline, hills, rail lines |
| Regional view | R16 tiles around the camera: 1 to 3 MB | land use, tower clusters, bridges |
| First work site (e.g. The Portal) | about 12 C/W tiles x (DEM 16 kB + vectors 30 to 150 kB): 1 to 2 MB | streets and buildings at 1 to 4 m |
| Typical session | 10 to 25 MB | |

Mesh budget, loaded at once [C from 4.3 and 4.4; frustum culling removes about two thirds]:

| Tier | Columns | Quads |
|---|---|---|
| F64, whole region | 1.97M | about 0.6M |
| R16, 12 km radius | 1.77M | about 0.8M |
| C4, 2.5 km radius | 1.23M | about 0.8M (half terrain, half buildings) |
| W1, 400 m radius | 0.5M | about 0.45M plus excavations |
| Total | | about 2.6M quads, 5.3M triangles |

- At 8 bytes per quad (packed instanced quads, as in https://github.com/cgerikj/binary-greedy-meshing ) that is about 21 MB of GPU buffers. Conventional 4 vertices x 16 B would be about 170 MB, so use the packed format.
- CPU column RAM: F64 8 MB plus R16 window about 7 MB plus C4 window about 5 MB plus W1 window about 2 MB at 4 B per column [C].
- Meshing: native binary greedy meshing is 50 to 200 us per 62^3 chunk (same repo). JS/WASM worker cost is UNVERIFIED; budget 1 to 3 ms per 32^3 chunk and measure.
- Do not put world volumes in 3D textures: 2,048 is the only universally supported WebGL2 `MAX_3D_TEXTURE_SIZE` (https://web3dsurvey.com/webgl2/parameters/MAX_3D_TEXTURE_SIZE).

### 9.4 Bake pipeline (pure Python or Node)

1. DuckDB pulls Overture buildings, transportation, water, land use for the box to local Parquet (about 1 minute for buildings [M]).
2. Fetch terrarium tiles z14 for the box (2,000 tiles for the game box [C]; the 361-tile, 34 MB z12 pull [M] covered the wide box, the game box is 130 tiles at z12 [C]), merge bathymetry, resample to the UTM grid at 8 m.
3. Emit F64 and R16 rasters (majority class, built-mass coverage and p90 height, DEM).
4. Emit 2,048 m vector tiles: quantized 0.25 m int16 deltas, per-feature class and height bytes.
5. Emit hero list and the rail network with stable ids for scenarios.
6. Fail the bake on any tile whose feature count or byte size is outside expected bounds; no silent truncation.

### 9.5 Build order

1. F64 plus R16 viewer for the whole region with rail overlay. Proves projection, tiling, load budget.
2. C4 around Salesforce Transit Center from vector tiles. Proves client-side voxelization.
3. W1 with promote-on-edit and one stamped tunnel from Fourth and King to the train box. Proves the core loop on The Portal.

## 10. Open questions

- Game box: include Gilroy/Pacheco (HSR) and the Altamont/Valley Link corridor by enlarging the grid, or handle them as off-map portals? Each extra 4 km column of tiles costs about 24 tiles.
- W tier at 1 m vs 2 m as the default: 1 m is recommended on fidelity; needs a real-device meshing measurement before it is locked.
- Coarse-tier look: slab steps (cell / 4) vs cubic. Cubic is 3 to 4x fewer quads; slabs keep hills readable. Needs a visual test.
- Tier factor 4 vs 2: are C4 to R16 seams acceptable without 8 m in between?
- Building heights: where do Overture's 1.5M heights in the box come from, and how good are they outside SF? Spot-check against known towers.
- Sea level constant in NAVD88 and tidal flats: one water plane, or mudflats as a surface class?
- Existing underground assets (BART tubes, Muni Metro, Central Subway, Caltrain tunnels): OSM has centrelines but not depths. Depth source per line is unresolved and matters for collision with new bores.
- Bridges and elevated structures: hand-modelled hero set vs procedural from `bridge`/`layer` tags.
- Offline play: cache tiles via service worker, or accept online-only like Subway Builder?
- Voxel Tycoon and Townscaper numbers were not found; web search budget ran out before they, platform lengths, and SF street widths could be confirmed.

## Corrections (2026-11-09 fact-check)

Experiments in `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/verify-04-world-scale-voxelization/` (`calc.py`, `ov.py`).

- BART Silicon Valley Phase II bore (sections 2, 4.2): was 48 ft (14.6 m) outside / 43 ft inside. Current design is a nearly 54 ft (16.5 m) TBM, 48 ft inside, just under 52 ft outside. Table 4.2 column recomputed for 16.5 m. Source: https://www.vta.org/blog/vta-purchases-tunnel-boring-machine-bsvii-project .
- Cities: Skylines II tile (section 5): "1/3 of CS1 tile area" was wrong; 1/3 is the side-length ratio, area ratio is about 1/10. Source: https://www.pcgamesn.com/cities-skylines-2/tiles plus arithmetic.
- Subway Builder (section 5): city count and dates outdated; now 55 cities in 7 countries, 1.0 released 2026-02. Source: https://en.wikipedia.org/wiki/Subway_Builder .
- Minecraft chunk format links (sections 5, 9.1): wiki.vg refuses connections; replaced with the minecraft.wiki copy.
- Terrain tile resolution citation (section 4.4): `attribution.md` does not state resolutions; `data-sources.md` does. Same page says ocean depths in these tiles are ETOPO1 (1 arc-minute) except NED Topobathy in California, so do not rely on them for bay bathymetry.
- Terrarium tile counts (section 9.4): 361 z12 tiles is the wide box, not the game box (130 at z12, 2,000 at z14). Recomputed from the tile formula.
- Python 3.14 wheels (section 7): was UNVERIFIED, now confirmed by install.
- Sea level in NAVD88 (section 8) and Twin Peaks height (section 7): were UNVERIFIED, now sourced.
- GitHub Pages (section 9.2): added the "no commercial sites" restriction from the cited page.
- Confirmed without change: Overture release 2026-10-21.0 exists; re-query gave 2,271,357 buildings (wide) and 1,856,878 (game; doc says 1,856,874), identical height coverage, source split, quantiles and tower counts; footprint encoding re-measured at 18.3 (Mountain View) and 23.7 (SoMa) B/building after brotli; Mercator, UTM, curvature and float32 figures; section 4.1 and 9.2/9.3 arithmetic; Cloudflare Pages limits; `MAX_3D_TEXTURE_SIZE`; Arnis settings; NIMBY Rails figures; binary-greedy-meshing figures (its renderer uses `glMultiDrawElementsIndirect`, which WebGL2 lacks, so the 8 B/quad path needs an instancing port); Salesforce Tower, Transit Center, Transbay Tube, both bridges, The Portal, Cities: Skylines 1 grid.
- Not checked (search budget exhausted): SoMa block size, Minecraft Earth map sizes, Teardown, Townscaper, Distant Horizons view distances, Overpass counts, rasterization tables 4.3 and 4.4.
