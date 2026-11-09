# 01. OSM data acquisition and build pipeline

Researched 2026-11-09. Experiments run on this machine (macOS arm64, 10 cores, 64 GB RAM, DuckDB CLI v1.5.5 already at `/opt/homebrew/bin/duckdb`, Node 26.7, Python 3.14.6).
Scratch (scripts, logs, samples, PBF, parquet extracts, 1.5 GB): `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/osm-data/` (below: `$S`). The 2.3 GB DuckDB work file was deleted after the run; `duckdb $S/out/work.duckdb < $S/scripts/pbf_extract.sql` regenerates it in 38 s (the `inspect*.sql` and `encode.py` scripts read it).
Test bbox everywhere: `36.9,-123.1,38.6,-121.2` (S,W,N,E). Note it is larger than the 9 counties: it includes downtown Sacramento, Stockton, Santa Cruz.

## TL;DR

- Build-time source of truth: **Geofabrik NorCal `.osm.pbf` (655.5 MB) for rail, stations, route relations, roads** plus **Overture GeoParquet for polygons (buildings with heights, water including ocean/Bay, land use)**. Both ODbL, both readable with the DuckDB CLI that is already installed. Nothing else to install.
- Measured: full thematic extraction from the PBF with geometry assembly for 2.86 M ways takes **38 s** in DuckDB. Overture Bay Area buildings (3.20 M) download in **226 s**.
- Overpass is not usable as a build dependency: on 2026-11-09 the main instance returned 502 "at capacity" on roughly half of attempts, trivial count queries took 40 to 75 s, and the buildings count query died on the 512 MiB default memory cap. Keep it for ad hoc inspection only.
- Buildings: raw OSM has a height or levels tag on 19% of Bay Area buildings; Overture has a height on 80%. Use Overture for buildings.
- OSM `layer=*` is stacking order, not depth. Tunnel depth and vertical profile must come from a hand-authored table per tunnel; OSM cannot supply it.
- Compact output is small for the network (rail 0.22 MB, major roads 0.95 MB, coastline 0.09 MB brotli) and large for buildings (26 MB brotli for the bbox), so buildings must be chunked or pre-voxelized.

## 1. Source comparison

| Source | What you get | Size / limits | Scriptable without osmium/GDAL | Verdict |
|---|---|---|---|---|
| Geofabrik `norcal-latest.osm.pbf` | Full OSM (nodes, ways, relations, all tags), no user metadata | 655,544,424 bytes for `norcal-261108` (measured, md5 verified); page label "625 MB". Whole California: 1,335,418,542 bytes (measured HEAD) | Yes: plain HTTPS GET, dated snapshots + md5, `.poly` offered | **Primary** for rail/transit/roads |
| Overture Maps (release `2026-10-21.0`) | GeoParquet on S3, bbox columns, buildings with `height`/`num_floors`/`roof_shape`, base water incl. ocean polygons, land, land_use, transportation segments | Bay bbox: buildings 396.8 MB zstd parquet, water 30.8 MB, land 29.9 MB, rail segments 1.7 MB (all measured) | Yes: DuckDB `httpfs` + `spatial`, anonymous S3 | **Primary** for buildings, water, land use |
| Overpass API | Arbitrary tag/bbox/relation queries, JSON with inline geometry | Policy: under 10,000 requests/day and 1 GB/day; default timeout 180 s, default maxsize 512 MiB; 429 on rate limit, 504 on resource denial | Yes, but unreliable (see section 2) | Dev inspection only |
| BBBike extracts | Custom-polygon extract in PBF/GeoJSON/GeoParquet/PMTiles/etc. | Interactive web form, link by email, 2 to 7 min wait, "fair usage"; per-format size caps 128 to 1,500 MB | No (form + email) | Skip |
| Protomaps daily planet PMTiles | Render-oriented vector tiles z0 to z15 | Planet `20261109.pmtiles` = 139,407,008,771 bytes (measured from build metadata); regional cut via `pmtiles extract --bbox` over HTTP range requests | Needs the `pmtiles` Go binary (not installed; 16 MB zip from GitHub releases, v1.31.2) | Not for simulation data; optional for a 2D minimap |
| OSM vector tiles in general (Protomaps, OpenMapTiles, Shortbread) | Clipped, simplified, generalized geometry | n/a | n/a | Wrong abstraction: no topology, no relations |
| osmdata.openstreetmap.de water/land polygons | Coastline-derived ocean or land polygons, shapefile | UNVERIFIED size: host refused connections from this machine today (curl and WebFetch both `ECONNREFUSED`); a third-party note cites ~540 MB for `water-polygons-split-4326.zip` | Shapefile needs a reader (pure-JS `shapefile` or DuckDB `ST_Read`) | Replaced by Overture ocean polygons |

Sources: Geofabrik NorCal page https://download.geofabrik.de/north-america/us/california/norcal.html ; Geofabrik technical notes https://download.geofabrik.de/technical.html ; Overture getting data https://docs.overturemaps.org/getting-data/ ; Overture STAC https://stac.overturemaps.org/catalog.json ; Overpass usage https://dev.overpass-api.de/overpass-doc/en/preface/commons.html and https://wiki.openstreetmap.org/wiki/Overpass_API ; BBBike https://extract.bbbike.org/extract.html ; Protomaps downloads https://docs.protomaps.com/basemaps/downloads , layers https://docs.protomaps.com/basemaps/layers , CLI https://docs.protomaps.com/pmtiles/cli , build list https://build-metadata.protomaps.dev/builds.json ; water polygons https://osmdata.openstreetmap.de/data/water-polygons.html .

Notes per source:

- **Geofabrik**: rebuilt daily around 21:00 CET; ways and multipolygon relations crossing the extract border are kept complete; `user`/`uid`/`changeset` stripped since 2018-05-03 (https://download.geofabrik.de/technical.html). NorCal is a strict superset of the 9 counties; there is no Bay Area sub-extract, so clipping is on us.
- **Overture**: latest release per STAC on 2026-11-09 is `2026-10-21.0`. Path pattern `s3://overturemaps-us-west-2/release/<release>/theme=<theme>/type=<type>/*`, region `us-west-2`. `pip install overturemaps` gives a bbox CLI as an alternative to DuckDB (https://docs.overturemaps.org/getting-data/). Releases are monthly-ish and old ones disappear, so pin the release and cache the extract.
- **Protomaps basemap**: `buildings` layer has `height`/`min_height` but buildings are merged below z15 and quantized; rail is only `roads.kind=rail` with `kind_detail`; the `transit` layer is "currently empty" (https://docs.protomaps.com/basemaps/layers). No route relations, no stations graph. I did not run a `pmtiles extract` experiment because the binary is not installed.

## 2. Overpass experiments (real, 2026-11-09 ~20:05 to 20:27 UTC)

Harness: `$S/scripts/opretry.sh` (curl, `--compressed`, generic User-Agent, exponential backoff 5 s to 60 s). Logs: `$S/overpass_log_run1.txt`, `$S/overpass_log.txt`. Responses: `$S/samples/*.json`.

Endpoint health observed:

| Endpoint | Observation |
|---|---|
| `overpass-api.de` | Without a User-Agent: 406 (UNVERIFIED in the fact-check: the server answered 502 "at capacity" before any UA check). With one: alternates between `502 "server is currently at capacity. All query workers are busy and the request queue is full"` in ~0.13 s and 200 after 39 to 75 s. Across both runs: 21 attempts, 10 failed (9 x 502, 1 x 504) |
| `overpass.private.coffee` | One 200 after 227 s with `timestamp_osm_base = 2026-05-31` (five months stale; UNVERIFIED in the fact-check, `/api/timestamp` timed out at 40 s); then a 240 s client timeout; then 504 after 235 s |
| `maps.mail.ru/osm/tools/overpass` | 504 on every attempt (0.6 to 53 s) |
| `overpass.kumi.systems` | Status endpoint timed out at 15 s |

Queries against `overpass-api.de` (wire bytes are gzip; "attempts" counts tries until the first 200):

| Query (bbox above unless noted) | Elements | JSON bytes | Wire bytes | Time of successful try | Attempts |
|---|---|---|---|---|---|
| `relation[route=train][network~"Caltrain",i]; out tags;` | 24 relations | 22,694 | 2,358 | 40.3 s | 2 |
| Same, `(._;>>;); out body;` (full recursion to ways and nodes) | 3,477 nodes, 516 ways, 26 relations | 1,134,640 | 129,442 | 44.4 s | 5 |
| `way[railway~"^(rail\|subway\|light_rail\|tram)$"]; out tags geom;` | 8,215 ways | 8,092,390 | 1,340,455 | 59.1 s | 1 |
| Same plus narrow_gauge, construction, proposed, disused, abandoned; `out count;` | 11,181 ways | 418 | 291 | 61.2 s | 1 |
| Station nodes: `railway~station\|halt\|tram_stop\|subway_entrance` or `public_transport=station`; `out body;` | 948 nodes | 369,504 | 52,400 | 62.4 s | 2 |
| `relation[type=route][route~train\|subway\|light_rail\|tram\|railway\|tracks]; out tags;` | 219 relations | 109,504 | 15,231 | 39.0 s | 1 |
| `way[railway=platform]` or `public_transport=platform + train=yes`; `out tags geom;` | 728 ways | 605,397 | 94,446 | 38.5 s | 1 |
| `way[highway~motorway\|trunk\|primary]; out count;` | 32,843 ways | 418 | 293 | 62.2 s | 2 |
| `way[building]` + `relation[building]`; `out count;` | **failed**: HTTP 200 with `runtime error: Query ran out of memory ... would need at least 627 MB of RAM` | 311 wire | | 75.1 s | 1 |
| `way[building][height]` or `way[building]["building:levels"]`; `out count;` | 493,799 ways | 418 | 294 | 43.9 s | 2 |
| `way[natural=coastline]; out count;` | 1,159 ways | 418 | 292 | 39.3 s | 1 |

Readings:

- Time is dominated by queueing, not query cost: a count returning 418 bytes takes the same 40 to 60 s as 8 MB of rail geometry. The server holds a request up to 15 s for a slot before refusing (https://dev.overpass-api.de/overpass-doc/en/preface/commons.html); today it was holding far longer.
- An out-of-memory failure comes back as **HTTP 200 with a `remark` field and zero elements**. Any Overpass client must check `remark`, or it silently produces an empty dataset.
- Cross-check: Overpass rail|subway|light_rail|tram = 8,215 ways; the same filter on the Geofabrik PBF (one day older) = 8,209. Overpass and the PBF agree, so the PBF loses nothing.
- All rail data for the region is 8 MB of JSON. Overpass could technically serve the rail layer, but buildings (2.56 M ways) cannot be fetched in one query at default limits, and mirrors can be months stale.

## 3. PBF parsing without osmium/GDAL (real benchmarks on `norcal-261108.osm.pbf`)

File contents (DuckDB `ST_ReadOSM`): 79,753,987 nodes, 7,772,962 ways, 85,338 relations.

| Tool | Version | Install | Full scan time | Peak RSS | Notes |
|---|---|---|---|---|---|
| DuckDB `spatial` `ST_ReadOSM` | CLI 1.5.5 | already installed; `INSTALL spatial` | **1.26 s** count by kind (10 threads); full pipeline below 38 s wall | not measured; work DB 2.3 GB on disk | Multithreaded, zero-copy; emits raw nodes/ways/relations with `tags MAP`, `refs`, `ref_roles`, `ref_types`; builds no geometry (https://duckdb.org/docs/2.0/core_extensions/spatial/functions.html) |
| `osm-pbf-parser-node` | 1.1.4 (2024-06) | `npm i` | 40.8 s | 352 MB | Pure JS async iterator, single thread; fine as a fallback |
| pyosmium (`osmium` on PyPI) | 4.3.2 | `uv pip install osmium`; cp314 macOS arm64 wheel exists and imports on 3.14.6 | 113.3 s unfiltered Python loop; **12.0 s** with `KeyFilter('railway')` + `with_locations()` | 246 MB unfiltered; 3.37 GB with node locations | libosmium bundled in the wheel; best ergonomics for relations and area assembly |
| `osmix` / `@osmix/core` | 0.4.0 / 0.3.0 (2026-10) | `npm i` | not benchmarked | README: in-memory at ~5x PBF size | TS, runs in browser and Node, bbox extract, GeoJSON, MVT; small project (https://github.com/conveyal/osmix) |
| QuackOSM | 0.20.0 | `pip`; needs DuckDB, PyArrow, GeoPandas, Shapely | not benchmarked | README: 10x PBF size free disk for unfiltered parse | DuckDB-based, assembles ways and multipolygons to GeoParquet, bbox and tag filters (https://github.com/kraina-ai/quackosm) |
| `osm-pbf-parser` 2.3.0 (2015), `osm-read` 0.7.0 (2019), `tiny-osmpbf` (2016) | | | | | Stale; skip |
| osmium compiled to WASM | | | | | No npm package found (`osmium-wasm` is a 404 on the registry); UNVERIFIED whether any maintained build exists |

Benchmark scripts: `$S/jsbench/bench.mjs`, `$S/pybench/bench.py`. Registry versions read from registry.npmjs.org and pypi.org on 2026-11-09.

DuckDB gotchas hit while writing the pipeline (`$S/scripts/pbf_extract.sql`, log `$S/out/duckdb_log.txt`):

- In DuckDB 1.5.5 `tags['key']` returns the value, not a list. Old snippets using `tags['highway'][1]` silently compare the first character and match nothing.
- `ST_Length_Spheroid` and the GDAL writer warn about axis order: run `SET geometry_always_xy = true` first.
- `ST_ReadOSM` does not assemble multipolygon relations. NorCal has 13,167 building multipolygons and 1,825 `natural=water` multipolygons that a ways-only pipeline drops. This is the main reason to take polygons from Overture instead.
- `duckdb` on PyPI 2.0.0 ships cp311 and cp312-abi3 wheels only; the abi3 wheel installed and ran on Python 3.14 here. The CLI is simpler.

### What is in the Bay bbox (from the PBF, 38 s end to end)

Stage timings: thematic way filter 6.1 s, bbox node table (35,539,132 nodes) 2.0 s, the rest is the refs-to-nodes join, line building, stats and exports.

| Theme | Ways in bbox | Length |
|---|---|---|
| Buildings (`building=*`, `building:part=*`) | 2,563,845 | (160,687 km of outline) |
| Land use / leisure | 102,511 | |
| Water / waterway / wetland / wood / beach | 88,285 | |
| Roads motorway..secondary incl. links | 88,149 | 14,488 km |
| Railway (any `railway=*` way) | 12,370 | 5,927 km |
| Coastline | 1,158 | 1,724 km |

Railway ways by value (count, km, of which tunnel / bridge / has `layer`):

| `railway=` | Ways | km | tunnel | bridge | layer | electrified tag | maxspeed | gauge |
|---|---|---|---|---|---|---|---|---|
| rail | 5,792 | 3,167.6 | 65 | 773 | 806 | 5,344 | 2,228 | 5,391 |
| abandoned | 1,913 | 1,016.5 | 17 | 98 | 87 | 126 | 88 | 682 |
| subway | 1,228 | 469.6 | 164 | 297 | 470 | 1,223 | 165 | 1,228 |
| light_rail | 1,056 | 384.2 | 114 | 112 | 203 | 1,051 | 238 | 1,053 |
| disused | 820 | 340.2 | 10 | 70 | 79 | 497 | 44 | 509 |
| platform | 728 | 108.4 | 52 | 25 | 111 | | | |
| tram | 133 | 36.3 | 2 | 2 | 2 | 132 | 31 | 132 |
| proposed | 109 | 265.6 | 21 | 34 | 51 | 18 | 67 | 89 |
| monorail | 57 | 13.7 | 5 | 51 | 50 | | 49 | |
| construction | 50 | 17.9 | 0 | 17 | 17 | 37 | | 44 |

- `service=*` (siding, yard, spur, crossover) is on 3,218 of 5,792 `rail` ways: more than half the heavy-rail ways are not running lines. Filter on `service IS NULL` (and `usage=main|branch`) for the game network.
- `layer` distribution on rail|subway|light_rail|tram: none 6,728; 1: 1,146; -1: 189; -2: 64; 2: 27; 4: 20; -3: 19; -4: 14 (Central Subway).
- Vertical data is absent: across all railway ways only 2 have `ele`, 0 have `depth`, 55 have `location=underground`. The wiki is explicit: "Layer provides absolutely no information about relative or absolute height difference" (https://wiki.openstreetmap.org/wiki/Key:layer).
- Longest tunnel groups: BART M-Line (16.3 km at layer -1, 12.3 km at -2, 8.1 km at -3), Muni Metro 11.1 km, BART C-Line 10.3 km, Caltrain Peninsula Subdivision 5.4 km, Central Subway 2.26 km per direction at -4.

Stations (nodes in bbox): `railway=station` 313, `tram_stop` 294, `subway_entrance` 171, `halt` 15, `railway=stop` 704, `public_transport=stop_position` 18,888 (mostly bus; ignore). Station/halt/tram_stop nodes by `network`: Muni 356, VTA 59, BART 51, SacRT 40, untagged 37, Caltrain 29 (+2 shared Amtrak;Caltrain;ACE), SMART 13, Amtrak 12, SFO AirTrain 11, ACE 5. NorCal-wide, stations are mapped as 702 nodes, 124 ways, 5 relations, so station extraction must take way/relation centroids too.

Route relations touching rail ways in the bbox:

| Network | `route=` | Route relations | Route masters |
|---|---|---|---|
| Caltrain | train | 24 (Local 1XX, Limited 4XX, Express 5XX, Weekend 6XX, South County 8XX, game-day variants) | 6 |
| BART | subway / light_rail (eBART) / monorail (OAK connector) | 12 / 2 / 2 | 5 / 1 / 1 |
| Muni | light_rail / tram (F, cable cars) | 14 / 8 | 7 / 5 |
| VTA | light_rail | 8 | 3 |
| SMART | train | 2 | 1 |
| ACE | train | 2 | 1 |
| Amtrak (Capitol Corridor 6, Gold Runner 4, California Zephyr 2, Coast Starlight 2) | train | 14 | 4 |
| SacRT (outside the 9 counties) | light_rail | 6 | 3 |
| Infrastructure (`route=railway`, e.g. Peninsula Subdivision 7916804, Coast Subdivision 4515581, BART letter lines) | railway | 116 | |

- Capitol Corridor is tagged `network=Amtrak`, `ref=Capitol Corridor`; select it by `ref`, not `network`.
- Full list with ids: `$S/out/route_relations.csv`.

Planned projects already in OSM as `railway=proposed` / `construction`:

| Name in OSM | Ways | km | Tunnel ways |
|---|---|---|---|
| Bay Subdivision (CAHSR, relations 15570754 and 9466656 "California High Speed Rail Proposal, Phase 1 North") | 65 | 103.9 | 6 |
| Capitol Subdivision (Phase 2) (CAHSR) | 1 | 80.6 | 0 |
| New Union Pacific Main for California High Speed Rail | 8 | 23.6 | 0 |
| BART Silicon Valley Phase II (+ East/West transition zones) | 16 | 19.4 | 14 |
| Valley Link Rail | 2 | 14.8 | 0 |
| Alum Rock-Eastridge Corridor (VTA, construction) | 6 | 7.6 | 0 |
| Bay Subdivision (Lead to Downtown Extension Project) | 1 | 2.1 | 1 |

- The Portal / DTX exists only as that single 2.1 km proposed way; there is no Salesforce Transit Center train-box station feature (name search returns the building outline way 542375290 / relation 10725927, an `amenity=bus_station` node 7221455729, the bus `stop_area` relation 8742597 and bus bay platform/stop nodes; nothing with a `railway` tag). Link21 and campus spurs are not in OSM at all. Dumbarton has no proposed/construction way, but the existing right of way is mapped as `railway=disused` "Dumbarton Branch" (13 ways, 10.2 km in the bbox, plus 1 active 0.2 km `rail` way). Proposed station nodes do exist for BART Phase II (Santa Clara, Diridon, Downtown San José, 28th Street/Little Portugal as `railway=proposed` + `proposed:railway=station`). Scenario alignments have to be authored by us (own GeoJSON layer), with OSM proposed ways as a starting trace for CAHSR and BART Phase II and the disused branch as a starting trace for Dumbarton.

County clip: all nine county boundary relations are in the PBF (`boundary=administrative`, `admin_level=6`): Alameda 396499, Contra Costa 396462, Marin 396461, Napa 396463, San Francisco 111968, San Mateo 396498, Santa Clara 396501, Solano 396513, Sonoma 396468.

## 4. Buildings and water: OSM tags vs Overture (real extraction)

Scripts `$S/scripts/overture_buildings.sql`, `$S/scripts/overture_base.sql`; outputs in `$S/overture/`.

| | Raw OSM (PBF, ways only) | Overture `buildings/building` 2026-10-21.0 |
|---|---|---|
| Buildings in bbox | 2,563,845 | 3,198,101 |
| With height | 462,371 `height=*` (420 unparsable, e.g. `106 m`, `55'`) | 2,566,597 |
| With floors | 43,102 `building:levels` | 41,107 `num_floors` |
| Height or floors | 498,858 (19.5%) | 2,573,466 (80.5%) |
| Max height | 326 m | 326 m |
| Fetch time | 38 s local after a 303 s download | 226 s remote query (26 s CPU) |

- Overture rows by first source: OpenStreetMap 2,561,528 (2,053,944 with height), Microsoft ML Buildings 560,577 (477,847), Esri Community Maps 75,996 (34,806). Where the extra heights on OSM-sourced footprints come from is UNVERIFIED per feature (Overture `sources` is per property; I did not break it down). Overture's buildings guide says "height attributes are merged between matches" during conflation, and the attribution page lists USGS 3DEP among buildings sources, so non-OSM heights on OSM footprints are expected.
- Overture mean height 5.0 m: the region is overwhelmingly single-family; the voxel skyline matters only in a few km2.
- Overture building schema: `height` (m), `num_floors`, `min_height`, `roof_shape`, `roof_height`, `has_parts`, `is_underground`; `building_part` type is OSM-only (https://docs.overturemaps.org/schema/reference/buildings/building/ , https://docs.overturemaps.org/guides/buildings/).
- Water: Overture `base/water` returned 15 `subtype=ocean` polygons in the bbox (45,006 km2 including open Pacific, 91,804 vertices); the tile covering the Bay contains both a Bay Bridge mid-span point and a South Bay point, so **San Francisco Bay is inside the ocean polygons**, already closed. Fetch 16 s. Inland polygons: river 219 km2, reservoir 165 km2, generic water 189 km2, plus 34,350 `human_made` (34,299 swimming pools, 45 salt ponds, 6 reflecting pools; drop the pools, keep salt ponds if the South Bay shoreline should look right).
- This sidesteps the coastline problem: `natural=coastline` is 1,158 open ways in the bbox (the Bay is mapped as coastline), which need ring closure against the bbox and land-on-the-left orientation to become polygons. OSM-based alternatives are osmcoastline (C++) or the preprocessed land/water polygons (https://wiki.openstreetmap.org/wiki/Coastline), and that host was unreachable today.
- Overture `transportation/segment` `subtype=rail`: 6,974 segments, 6,214 km, classes standard_gauge 3,803, unknown 2,050, light_rail 517, subway 422, tram 71. It carries `rail_flags` (is_bridge, is_tunnel, is_disused, is_abandoned as linear-referenced ranges) and `level_rules`, but no route relations and none of electrified/gauge/maxspeed/service/usage. Not a substitute for raw OSM rail.

## 5. Tags to extract

| Layer | Select | Keep |
|---|---|---|
| Track | ways `railway in (rail, subway, light_rail, tram, monorail, funicular, narrow_gauge, construction, proposed, disused, abandoned)` | `name, operator, usage, service, tunnel, bridge, cutting, embankment, layer, electrified, voltage, frequency, gauge, maxspeed, passenger_lines`, node ids (for topology) |
| Stations | nodes + ways + relations `railway in (station, halt, tram_stop)`, `public_transport=station` | `name, network, operator, station, layer, wikidata, ref` |
| Entrances / platforms | `railway=subway_entrance`; ways `railway=platform` / `public_transport=platform` | `ref, layer, level`; platform length is useful for train-length gameplay |
| Stop positions | nodes `railway=stop` (704) | link routes to track nodes |
| Routes | relations `type=route` + `route in (train, subway, light_rail, tram, monorail)`; `type=route_master`; `route=railway|tracks` for named subdivisions | `network, operator, ref, name, colour, from, to`, ordered members with roles |
| Roads | ways `highway in (motorway, trunk, primary, secondary)` + `_link` | `name, ref, bridge, tunnel, layer, lanes` |
| Buildings | Overture `building` (+ `building_part` for downtown SF towers) | `height, num_floors, min_height, class, roof_shape` |
| Water | Overture `water`: `ocean`, `river`, `lake`, `reservoir`, `physical` (names of bays/straits) | polygons only, drop `human_made` and streams |
| Land use / parks | Overture `land_use` or OSM `landuse=*`, `leisure=park|nature_reserve`, `natural=wood|wetland|beach` | class only |
| Admin | the nine `admin_level=6` relations | clip mask, labels |

Tag semantics: https://wiki.openstreetmap.org/wiki/Key:railway , https://wiki.openstreetmap.org/wiki/Key:layer .

## 6. Compact output size (measured)

Encoding test (`$S/pybench/encode.py`): project to local metres, quantize, delta + zigzag varint per vertex, per-feature vertex count, geometry only (no tags), features ordered by OSM id (not spatially sorted, so this is pessimistic).

| Layer | Features | Vertices | Raw | gzip -9 | brotli 9 |
|---|---|---|---|---|---|
| Rail, all `railway=*` ways, 0.5 m | 12,370 | 127,604 | 0.34 MB | 0.30 MB | 0.30 MB |
| Rail, 2 m | 12,370 | 127,604 | 0.30 MB | 0.23 MB | 0.22 MB |
| Roads motorway..secondary, 2 m | 88,149 | 525,851 | 1.30 MB | 0.98 MB | 0.95 MB |
| Coastline, 2 m | 1,158 | 68,262 | 0.14 MB | 0.10 MB | 0.09 MB |
| Buildings, 0.5 m | 2,563,845 | 23,633,104 | 52.98 MB | 38.60 MB | 37.36 MB |
| Buildings, 2 m | 2,563,845 | 23,633,104 | 51.53 MB | 27.21 MB | 25.92 MB |
| Water/natural, 2 m | 88,285 | 2,291,943 | 4.86 MB | 3.20 MB | 3.08 MB |
| Land use, 2 m | 102,511 | 1,824,323 | 4.01 MB | 2.83 MB | 2.72 MB |

The buildings rows are OSM footprints, not the Overture set the plan actually ships. Same encoding at 2 m on the Overture extract (3,198,101 features, 28,321,285 vertices, fact-check 2026-11-09): 59.97 MB raw, 30.01 MB gzip -9, 28.49 MB brotli 9 when features are Hilbert-sorted; 41.93 MB brotli 9 in arbitrary order (Overture ids are not spatially coherent, so sort before encoding). Heights and classes are extra.

For comparison the same rail layer as GeoJSON with 12 properties is 7.6 MB (`$S/out/rail.geojson`), and the Overpass JSON for 4 rail types is 8.1 MB.

## 7. ODbL obligations for a published game

- Attribution text: credit "OpenStreetMap" and make clear the data is under ODbL, e.g. a link to `openstreetmap.org/copyright`. For computer games and simulations the OSMF guideline allows the credit on a startup splash screen, in the game view, on the credits page, or in a menu; splash text "must be easily legible and visible" long enough to read; if the first credit is terse, full detail must be reachable elsewhere (https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).
- Overture ODbL themes (buildings, base, transportation): "(c) OpenStreetMap contributors, Overture Maps Foundation", plus source credits listed on https://docs.overturemaps.org/attribution/ (Microsoft, Esri Community Maps, Google Open Buildings for buildings; ESA WorldCover etc. for base).
- Geofabrik extracts are plain ODbL OSM data; no extra obligation beyond OSM's.
- Produced Work vs Derivative Database: rendered output (the voxel world on screen, screenshots, video) is a Produced Work and needs only the notice (ODbL 4.3). A machine-readable geometry file we ship (rail graph, building footprints) that lets someone extract the data is, by the OSMF test ("If the published result of your project is intended for the extraction of the original data, then it is a database and not a Produced Work"), a Derivative Database. Publicly using it obliges us to offer either the derivative database or "a file containing all of the alterations ... or the method of making the alterations" (ODbL 4.6) (https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline , https://opendatacommons.org/licenses/odbl/1-0/). Vector tiles, 3D models and games are not addressed by that guideline, so the classification of baked voxel chunks is UNVERIFIED; the conservative reading is to treat shipped data assets as ODbL.
- Practical compliance: an open-source, reproducible build pipeline is "the method of making the alterations". Ship a `DATA_LICENSE` next to the assets.
- Own content stays ours if kept as separate layers: scenario alignments, fantasy lines, costs, tunnel depth tables are a Collective Database as long as a given feature type in a region is all-OSM or all-ours and not a deduplicated merge (https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline). Hand-edits applied to OSM track geometry (fixing topology, snapping) are alterations and fall under share-alike.
- Not legal advice.

## Recommendations for the game

1. **Two-source build, DuckDB as the only engine.** `tools/data/` with SQL files driven by a small Node script (`@duckdb/node-api` 2.0.0-r.1 or shelling out to the CLI). Inputs pinned by date and checksum: `norcal-YYMMDD.osm.pbf` + `.md5` from Geofabrik, Overture release id. Downloads cached under a gitignored `data/raw/`; fail loudly on checksum or release mismatch.
2. **OSM PBF for everything linear and relational**: track ways with node ids, stations, stop positions, platforms, route and route_master relations, major roads, county relations. Use the SQL shape proven in `$S/scripts/pbf_extract.sql` (way filter, bbox node table, unnest-join, `ST_MakeLine`).
3. **Overture for everything polygonal**: buildings with heights, ocean + inland water, land use. No multipolygon assembly and no coastline processing on our side.
4. **Build steps**: (a) fetch; (b) extract to intermediate parquet; (c) clip to the union of the nine county polygons plus a buffer (and decide whether Santa Cruz/Gilroy/Stockton approaches stay for CAHSR and ACE); (d) project to a fixed local ENU origin in metres and quantize; (e) build the rail graph: split ways at shared node ids, drop `service=*` unless yard gameplay wants it, attach stations to nearest track node, order route members into stop sequences; (f) join the hand-authored vertical profile table (tunnel depth, portal locations, viaduct heights) keyed by OSM way id or relation name; (g) emit static assets; (h) write `ATTRIBUTION.md` + data license.
5. **Asset layout**: one always-loaded `network.bin` (rail graph + stations + routes + coastline + major roads, about 1.5 MB brotli by the measurements above) and lazily loaded world chunks for buildings/water/land use on a fixed metric grid, or pre-voxelized columns per chunk. The 26 MB building blob (28.5 MB for the Overture set, geometry only) must not be a single download; SF + Peninsula + South Bay scenario areas first.
6. **Heights**: use Overture `height`, fall back to `num_floors * ~3 m`, then to a class default. 19.5% of footprints have neither.
7. **Scenario geometry is authored, not extracted**: keep `scenarios/*.geojson` (The Portal, Link21, Dumbarton, campus spurs) in the repo as our own layer; seed CAHSR and BART Silicon Valley Phase II from the OSM `railway=proposed` ways listed above.
8. **Overpass only as a dev tool** for looking at a single relation; always send a User-Agent, check `remark`, check `timestamp_osm_base`. Never in CI or the build.
9. **Refresh cadence**: rebuild on demand; the 38 s extraction makes a full rebuild cheap. Geofabrik `.osc.gz` diffs are not needed.

## Open questions

- Exact world extent: nine counties only, or include Santa Cruz, Gilroy to Pacheco Pass, Altamont/Tracy/Stockton and Sacramento for CAHSR, ACE, Valley Link and Capitol Corridor scenarios? This drives the clip polygon and chunk count.
- Source for tunnel depths and track elevation (BART Transbay Tube, Market St subway levels, Caltrain tunnels, Central Subway): OSM has none. Agency drawings, EIR profiles, or pure game-design values? Not answered here; check `05-bay-area-transit-projects.md` and `02-terrain-bathymetry-geology.md`.
- Terrain and bathymetry are out of scope here: see `02-terrain-bathymetry-geology.md`. Chunking and voxelization of the polygon layers: see `04-world-scale-voxelization.md`.
- Are baked voxel chunks a Produced Work or a Derivative Database? The OSMF guideline is silent on 3D/game assets. If the repo and pipeline are public this is moot.
- Overture height provenance for OSM-sourced footprints (lidar-derived or ML-estimated) and its accuracy for downtown SF; spot-check Salesforce Tower (326 m) and a sample of mid-rises.
- Microsoft ML footprints (560,577 in bbox) are lower quality than OSM ones; keep or drop for visual consistency?
- Do services (timetables, headways, ridership) come from GTFS rather than OSM route relations? OSM routes give stop order and geometry only. See `09-demand-ridership-sim.md`.
- osmdata.openstreetmap.de was refusing connections on 2026-11-09; if a pure-OSM coastline path is ever needed, recheck availability and the zip size.
- Whether to run a `pmtiles extract` experiment for a 2D overview/minimap basemap (requires downloading the `pmtiles` binary).

## Corrections (2026-11-09 fact-check)

Independent re-runs live in `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/verify-01-osm-data/` (`q1.sql` to `q6.sql`, `enc.py`, `enc_ovt.py`).

- Section 3, planned projects: "Dumbarton rail ... not in OSM at all" was wrong. The corridor is mapped as `railway=disused` "Dumbarton Branch" (13 ways, 10.2 km). Source: own DuckDB query on `norcal-261108.osm.pbf`.
- Section 3, planned projects: the Salesforce Transit Center name search does not return "only bus bay platform nodes"; it also returns the building way/relation, a bus_station node and a stop_area relation. The conclusion (no rail station feature) stands. Added the BART Phase II proposed station nodes. Source: same PBF.
- Section 4, water: `human_made` count was 30,934; the extract has 34,350 (34,299 swimming pools). Source: `bay_water.parquet` and the researcher's own `base_log.txt`.
- Section 6 and recommendation 5: the 26 MB buildings figure is for OSM footprints; the Overture set that the plan ships measures 28.5 MB brotli spatially sorted, 41.9 MB unsorted. Source: `enc_ovt.py` on `bay_buildings.parquet`.
- Section 7: the Produced Work test was misquoted; replaced with the guideline's wording. Source: https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline .
- Section 4: height provenance narrowed (conflation merges heights between matched footprints). Source: https://docs.overturemaps.org/guides/buildings/ , https://docs.overturemaps.org/attribution/ .
- Marked UNVERIFIED: Overpass 406 without User-Agent, and the `overpass.private.coffee` stale timestamp (neither endpoint answered during the check).
- Confirmed unchanged (re-measured or re-fetched): Geofabrik sizes and md5; PBF element counts; rail/proposed/layer/tunnel tables; county and CAHSR relation ids; 13,167 building and 1,825 water multipolygons; OSM vs Overture building height coverage; Bay inside the Overture ocean polygons (10 of 10 open-water probe points); encoding sizes for rail, roads, coastline, OSM buildings; parser benchmarks (osm-pbf-parser-node 37.4 s / 347 MB, pyosmium 101.5 s and 11.5 s / 3.46 GB); all npm, PyPI and GitHub versions; Overture release id; Protomaps build size; Overpass, Geofabrik, BBBike, OSMF and Overture attribution statements.
