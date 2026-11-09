# 02. Terrain, bathymetry and geology data

Researched 2026-11-09. All "measured" values come from experiments run this session (scripts and raw output paths in section 9). Web search budget ran out mid-session; items not confirmed against a fetched source are marked UNVERIFIED.

## 1. Verdict

- **Elevation + bathymetry: AWS Terrain Tiles (terrarium PNG), zoom 12 to 14.** One keyless HTTP GET per tile, decodes with `node:zlib` alone, and around the Bay the tiles are built from the USGS 1/9 arc-second San Francisco topobathy DEM, so seabed and land come from one seamless source. Verified end to end.
- **Surface geology: USGS OFR 00-444 polygon shapefile** (nine counties, includes San Francisco). 13,827 polygons with a unit code and a liquefaction class. Parsed with stdlib Python, no GDAL.
- **Faults: USGS Quaternary Fault and Fold Database ArcGIS REST**, returns GeoJSON directly. 2,800 line features in the Bay Area bbox.
- **Depth dimension (what is under the surface unit) has no ready open dataset.** It has to be procedural, anchored on a handful of real boreholes and tunnel profiles.

## 2. Elevation sources compared

| Source | Resolution | Bathymetry | Access without GDAL | License | Verdict |
|---|---|---|---|---|---|
| AWS Terrain Tiles, terrarium | 256 px tiles to z15; ~7.5 m/px at z14, ~30 m/px at z12 (at 37.8 N) | Yes, real topobathy around SF Bay (measured) | Plain HTTPS PNG, no key | Per-source; US sources public domain, attribution requested | **Use** |
| USGS 3DEP (1 m / 10 m) | 1 m lidar, 1/3 arc-second seamless | Land only (topobathy is a separate product) | EPQS point JSON works; ImageServer `exportImage` returns float32 TIFF (needs a TIFF decoder such as geotiff.js) | Public domain | Validation only |
| USGS CoNED TBDEM, SF Bay | 2 m, 42 source datasets from 1922 to 2010 | Yes | Download via CoNED viewer / National Map; GeoTIFF format and size UNVERIFIED | Public domain (stated for page media; data license not spelled out on the page) | Later upgrade |
| USGS 1 m SF Bay DEM (doi 10.5066/P9TJTS8M) | 1 m, bathymetry only; ver. 2.0 (July 2021) title says data collected 1999 to 2020 (abstract still says 1999 to 2016); MLLW and NAVD88 versions | Yes | ScienceBase (returned 403 to scripted fetch this session) | USGS; "not for navigation" | Skip for v1 |
| Copernicus GLO-30 | 30 m | **No.** Ocean has no tiles, assume 0 | COG on S3, HTTP 200 verified; needs geotiff.js | Copernicus license, free, attribution | Skip |
| SRTM | 1 arc-second (30 m) | **No.** Water filled with 0 | Already inside terrarium at low zoom | No US copyright | Skip (already included) |

Sources: [Joerd data sources](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md), [Joerd attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md), [USGS CoNED SF Bay TBDEM](https://www.usgs.gov/special-topics/coastal-national-elevation-database-(coned)-applications-project/science-4), [USGS 1 m DEM](https://doi.org/10.5066/P9TJTS8M), [Copernicus DEM on AWS](https://registry.opendata.aws/copernicus-dem/), [AWS Terrain Tiles registry](https://registry.opendata.aws/terrain-tiles).

Notes:
- GLO-30 is a surface model (includes buildings and vegetation), which is the wrong thing to voxelize under OSM buildings. [Source](https://registry.opendata.aws/copernicus-dem/)
- Joerd docs say ETOPO1 (1 arc-minute) is the global bathymetry and that California ocean uses "NED Topobathy" at zooms 10 to 15. GEBCO is not used at all. [Source](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md)
- Tiles are a static 2017 build (`Last-Modified: 11 Nov 2017` on the tile probed). Post-2017 earthworks are absent.

## 3. Terrarium format and access

- URL: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, standard XYZ Web Mercator, 256 px, no auth.
- Decode: `elevation_m = (R * 256 + G + B / 256) - 32768`, 1/256 m steps. [Joerd formats](https://github.com/tilezen/joerd/blob/master/docs/formats.md)
- PNGs are 8-bit RGB, non-interlaced: a 40-line decoder (inflate + 5 scanline filters) is enough. In the browser, `createImageBitmap` + canvas `getImageData` works as long as no color management or premultiplication touches the pixels (RGB, no alpha, so safe).
- Each response carries `x-amz-meta-x-imagery-sources`, naming the source rasters. Useful as a per-tile provenance check.
- Other encodings in the same bucket: `normal` PNG, 512 px `geotiff`, 1 degree `skadi` HGT (16-bit integer, loses the sub-meter precision). [Joerd formats](https://github.com/tilezen/joerd/blob/master/docs/formats.md)

Attribution text to ship (from Joerd): "United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey." plus "Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration". 3DEP is public domain "and may be used without restriction". [Source](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)

## 4. Experiment: real decoded values

Setup: Node 26, zero dependencies, 276 tiles fetched (23 MB on disk), mean 184 ms per tile uncached.

### 4.1 What the tiles are made of (from response headers)

| Zoom | Sources observed across fetched tiles |
|---|---|
| z10 | `srtm`, `gmted`, `etopo1` only |
| z12 | `ned_topobathy` (112 source refs), `ned` (3), `ned13` (1) |
| z14 | `ned_topobathy` (29), `ned` (2), `ned13` (1) |
| z15 | `ned_topobathy` (24), `ned` (1) |

- Bay-covering tiles cite `ned19_n38x00_w122x50_ca_sanfrancisco_topobathy_2010.tif`: the 1/9 arc-second (about 3 m) 2010 San Francisco topobathy. z14 and z15 are therefore near-native, not upsampled.
- z10 has coarse ETOPO1 bathymetry and integer SRTM land (64.6% of z10 pixels are whole meters vs 0.4% at z12). **Do not use z10 or below for anything under water.**

### 4.2 Land check

| Point | Published | z12 | z14 | Note |
|---|---|---|---|---|
| Twin Peaks, south summit (37.7516, -122.4477) | 280.5 m (USGS EPQS, 1 m 3DEP, queried this session) | n/a | **280.8 m** (box max) | 0.3 m agreement |
| Mount Davidson | ~283 m (UNVERIFIED) | 280.0 | 284.3 | SF high point per tiles |
| Mount Sutro | ~277 m (UNVERIFIED) | 273.9 | 277.7 | |
| Nob Hill | ~104 m (UNVERIFIED) | 105.7 | 105.0 | |
| San Bruno Mountain | ~401 m (UNVERIFIED) | n/a | 399.7 | box max |
| Mount Diablo | 1173 m (UNVERIFIED) | 1163.1 | 1170.8 | z10 gives 1140 |
| Mount Tamalpais east peak | 784 m (UNVERIFIED) | 777.0 | 779.6 | |
| Salesforce Transit Center, street | n/a | 5.1 | 5.5 | |
| 4th and King | n/a | 3.5 | 3.7 | |
| Googleplex / Meta MPK20 / Oracle Redwood Shores | n/a | 7.0 / 3.7 / 0.9 | 7.4 / 3.5 / 1.2 | all campuses sit within 8 m of datum |
| Diridon | n/a | 29.6 | 29.6 | |

A naive single-pixel sample at the commonly quoted Twin Peaks coordinate returned 255 m (wrong summit pixel). Peak checks need a window max.

### 4.3 Bathymetry check (negative = below datum)

| Location | z14 value |
|---|---|
| Golden Gate Bridge midspan | -95.8 m |
| Golden Gate strait, deepest pixel in box | **-114.8 m** at 37.816, -122.491 |
| Bay Bridge west span corridor, deepest | **-39.4 m** next to Yerba Buena Island |
| Bay Bridge west span, mid | -6.6 m |
| Bay Bridge east span corridor, deepest | -30.0 m |
| Transbay Tube alignment, mid-bay | -15.6 m |
| Central Bay, Alcatraz to Angel Island, deepest | -56.9 m |
| Raccoon Strait | -15.1 m |
| San Mateo Bridge channel | -15.2 m |
| Dumbarton crossing, mid / deepest in corridor | -4.0 m / -18.6 m |
| Carquinez Strait, deepest (z12) | -40.6 m |

Transect, Ferry Building to Oakland portal along the approximate Transbay Tube line (25 samples, z14):
`-2.4 -19.5 -23.3 -26.7 -28.7 -19.6 -17.8 -17.1 -16.0 -12.1 -8.5 -8.0 -13.6 -15.9 -8.6 -7.1 -9.6 0.1 4.8 5.2 5.7 4.4 4.6 2.6 4.9`

- Seabed tops out near -29 m on the SF side; the tube's stated maximum depth is 135 ft (41 m) below sea level, consistent with a structure sitting in a dredged trench below the seabed. [Transbay Tube](https://en.wikipedia.org/wiki/Transbay_Tube)
- The east half of the crossing is under 10 m of water: the "Bay" is mostly a shallow mud flat with a few scoured channels. Gameplay implication: water depth is rarely the problem, the mud is.

### 4.4 Budget

| Extent | Zoom | Tiles | PNG bytes (measured) |
|---|---|---|---|
| Whole region, lon -123.0 to -121.6, lat 37.1 to 38.2 | z10 | 25 | 1.8 MB |
| Core Bay, lon -122.55 to -122.0, lat 37.4 to 37.95 | z12 | 63 | 6.5 MB |
| Same core | z14 | 858 (26 x 33, computed from the bbox; not 16x z12 because the z12 set overhangs the bbox) | ~80 MB (extrapolated at ~90 KB per tile, not fetched) |

Core Bay at z12: 33.0% of pixels below 0 m, 18.1% below -10 m, 11.0% below -20 m (includes Pacific west of the Golden Gate).

### 4.5 Caveats found

- **Datum.** 3DEP heights are NAVD88, not sea level. Local mean sea level at San Francisco is +0.969 m NAVD88, and MHHW is +1.798 m NAVD88 (NOAA station 9414290 datums API, 1983 to 2001 epoch, fetched 2026-11-09). Put the game's water plane near +1 m, not 0, or shoreline voxels will look dry.
- **Structures.** Bare-earth model: bridges, piers and buildings are absent, which is what we want under OSM geometry.
- **ArcGIS `identify` on 3DEP ImageServer returned NoData** for a valid point with my parameters; EPQS (`https://epqs.nationalmap.gov/v1/json?x=..&y=..&units=Meters&wkid=4326`) worked first try.

## 5. Geology data that actually loads

### 5.1 Surface units: USGS OFR 00-444 (Knudsen et al., 2000)

- Download: `https://pubs.usgs.gov/of/2000/of00-444/of00-444_4c.tar.gz` (19.7 MB), contains `sf-qpys.shp` polygons in geographic coordinates, bbox lon -123.625 to -121.125, lat 36.875 to 38.875. [Report page](https://pubs.usgs.gov/of/2000/of00-444/)
- Fields: `PTYPE` (unit code), `LIQ` (liquefaction susceptibility VH/H/M/L/VL, W for water).
- pubs.usgs.gov returns 403 to Python `urllib`'s default User-Agent only. Default `curl` and Node 26 `fetch` both get 200 with no extra headers (re-measured 2026-11-09), so a Node pipeline needs no User-Agent workaround.
- **Do not use the newer OFR 2006-1037 alone.** It is more detailed (16,141 polygons) but excludes the San Francisco North quadrangle: all seven SF city test points returned no polygon (re-confirmed 2026-11-09: 5 of 5 SF city points empty). [OFR 2006-1037](https://pubs.usgs.gov/of/2006/1037/)
- **`LIQ` ratings differ between the two reports.** OFR 2006-1037 supersedes 00-444 inside its area and reclassified Bay Mud (`Qhbm`) to moderate susceptibility; in its shapefile Meta MPK20 and Googleplex both read `M`, against `H` in 00-444. Where both cover a site, treat the 2006 class as the current one.

Point lookups run this session (OFR 00-444):

| Site | Unit | Liquefaction |
|---|---|---|
| Salesforce Transit Center, 4th and King, Mission Bay, Embarcadero, Marina, SFO, Treasure Island, Foster City | `afbm` artificial fill over Bay Mud | VH |
| Twin Peaks, Berkeley Hills | `br` bedrock | VL |
| Sunset District, downtown Oakland, West Oakland, Alameda | `Qds` dune sand | M |
| Meta MPK20 | `Qhbm` Holocene Bay Mud (point-dependent: lookups within ~300 m of each other on the campus return `Qhbm`/H, `afbm`/VH and `af`/L) | H |
| Googleplex | `Qhff` Holocene fan, fine facies | H |
| Palo Alto, downtown San Jose | `Qhl` fan levee | M |
| Diridon | `Qhf` Holocene alluvial fan | M |
| Millbrae | `Qoa` old alluvium | VL |
| Oracle Redwood Shores | `H2O` (campus sits on a lagoon polygon; neighbors are fill) | W |

Area shares in OFR 2006-1037 (central region, planar degrees, indicative only): bedrock 51%, water 15%, Holocene fan 7%, Bay Mud 5.5%, Pleistocene fan 3.4%, fill over estuarine mud 1.7%.

The report's Table 4 also gives **typical depth to groundwater per unit**, which is the only regional groundwater proxy found: under 5 ft in Bay Mud, under 10 ft in fill and fine fans, under 15 ft in Holocene fans, under 25 ft in dune sand, under 30 to 40 ft in Pleistocene alluvium. [OFR 00-444 text](https://pubs.usgs.gov/of/2000/of00-444/of00-444_3a.txt)

### 5.2 Faults: USGS Qfaults

- `https://earthquake.usgs.gov/arcgis/rest/services/haz/Qfaults/MapServer/21/query?...&f=geojson` (layer 21 = National Database).
- Bay Area bbox: 2,800 features; server caps at 2,000 per request, pagination supported, so two requests. First page is 2.4 MB of GeoJSON.
- Useful attributes: `fault_name`, `slip_rate` (binned: 961 of the first 2,000 are "Greater than 5.0 mm/yr"), `slip_sense`, `age`, `linetype` (well constrained / moderately / inferred).
- Feature counts by name in the first page: San Andreas 457, Calaveras 268, Hayward 211, Greenville 209, Concord 74, Silver Creek 26, Rodgers Creek 25. This list is partial and first-page only: it omits Butano (214) and Green Valley (83), and the second page (800 features) adds Hayward 314 (525 total), San Gregorio 170, Berrocal 154, Monte Vista-Shannon 119. Do not rank faults from page one.

### 5.3 Regulatory liquefaction zones: CGS

- `https://services2.arcgis.com/zr3KAIbsRSUyARHG/arcgis/rest/services/CGS_Liquefaction_Zones/FeatureServer/0`, polygons per quadrangle with release dates. Found via the [California State Geoportal](https://gis.data.ca.gov/). Point query at Twin Peaks returned no feature as expected; point queries at Salesforce Transit Center and Googleplex return the San Francisco North and Mountain View quadrangles (checked 2026-11-09). Full coverage and license terms ("custom") UNVERIFIED.
- Redundant with the `LIQ` field above for gameplay. Its value is thematic: it is the actual red-tape layer (a zone triggers a mandatory geotechnical report under the Seismic Hazards Mapping Act, UNVERIFIED wording).

### 5.4 Bedrock geology

- USGS SIM 2918 (Graymer et al., 2006, 1:275,000) is the regional bedrock map. The publication page offers PDFs; the GIS database link points to a legacy host (`geomaps.wr.usgs.gov`) that now redirects to the www.usgs.gov home page (checked 2026-11-09), so treat that download as gone. [SIM 2918](https://pubs.usgs.gov/sim/2006/2918/)
- CGS also serves `CGS/Geologic_Map_of_California` as a FeatureServer at `https://gis.conservation.ca.gov/server/rest/services/CGS` (listed, not queried).
- For v1 the single `br` class from OFR 00-444 is enough; rock subtypes can be a noise field.

## 6. How real Bay Area tunnels dealt with the ground

| Project | Ground | Method | Numbers | Source |
|---|---|---|---|---|
| BART Transbay Tube (1965 to 1969) | Bay Mud and soft sediment; route chosen to avoid bedrock so the tube can flex | Immersed tube in a dredged trench | 3.6 mi, 57 sections of ~100 m, 48 ft x 24 ft, max 135 ft below sea level; trench 60 ft wide on 2 ft of gravel; 5.6 M cubic yards dredged; ~$180 M total in 1970 | [Wikipedia](https://en.wikipedia.org/wiki/Transbay_Tube) |
| Same, seismic | Backfill found liquefiable in a 2002 study | Seismic joints at both ends (4.25 in axial, 6.75 in lateral design travel, reduced to as little as 1.5 in after settlement and Loma Prieta); fill compaction, then inner steel liner | $330 M retrofit estimate (2004); $267 M liner contract (2016) | [Wikipedia](https://en.wikipedia.org/wiki/Transbay_Tube) |
| SF Central Subway (2013 to 2014) | Colma Formation ~1,750 m, Old Bay deposits >500 m, Franciscan sandstone ~750 m (UCS up to 27 MPa); "potentially gassy" | Two 6.3 m EPB TBMs with mixed-face cutterheads; 7% grades; 137 m radius curve | 16 to 20 rings/day in Dec 2013; averages 44 and 54 ft/day (13 and 16 m/day); best 40 m/day and 513 m/month | [Robbins NAT 2014 paper](https://www.robbinstbm.com/wp-content/uploads/2010/04/21_UrbanEPBs_SFCentralSubway_NAT2014.pdf), [Robbins project page](https://www.robbinstbm.com/projects/san-francisco-central-subway/), [Wikipedia](https://en.wikipedia.org/wiki/Central_Subway_(San_Francisco)) |
| Central Subway, Chinatown station | Franciscan under Nob Hill slope | Sequential excavation (mined cavern); the other two stations cut-and-cover | Program $1.578 B budget, $1.891 B estimate by 2021 | [Wikipedia](https://en.wikipedia.org/wiki/Central_Subway_(San_Francisco)) |
| SFPUC Bay Tunnel (2010 to 2015) | San Antonio Formation clays, silts, sands under the Bay Mud; 700 ft of Franciscan basalt expected | EPB TBM, 15 ft bore, one 5 mi drive with no intermediate shaft; frozen-ground exit shaft | Up to 100 ft deep; low bid $215.3 M; early progress 4,700 ft in ~5 months (UNVERIFIED: TunnelTalk unreachable on 2026-11-09) | [Tunnel Business Magazine](https://tunnelingonline.com/tunnel-achievement-award-bay-tunnel/), [TunnelTalk](https://tunneltalk.com/Bay-Tunnel-Feb12-Construction-Progress.php) |
| BART Silicon Valley Phase II (planned) | Soft, "difficult and variable hydro-geologic conditions", overburden only ~1.5 diameters | Single 53 ft bore, Herrenknecht TBM | Planned advance 29 ft/day baseline, 35 ft/day in the cost-saving scenario; $12.1 to 12.7 B program | [VTA peer review, Sept 2025](https://vtabart.org/wp-content/uploads/2025/10/VTA-BSVII-Peer-Review-Final-Report_Sept-2025.pdf) |
| BART Berkeley Hills Tunnel (1965 to 1968) | Mixed, mostly soft and porous rock; Hayward fault 900 ft inside the west portal | Drill and blast, twin 17.5 ft bores, 3.1 mi | Holed through in ~25 months; creep narrowed the section, $60 M realignment planned | [Wikipedia](https://en.wikipedia.org/wiki/Berkeley_Hills_Tunnel) |
| Caldecott fourth bore (2010 to 2013) | East Bay Hills sedimentary rock | Mined; NATM with roadheaders is UNVERIFIED | 1,033 m, excavation Aug 2010 to Aug 2012, $420 M | [Wikipedia](https://en.wikipedia.org/wiki/Caldecott_Tunnel) |
| The Portal / DTX (planned) | Fill over Bay Mud at both ends (confirmed by OFR 00-444 lookups above), Franciscan under Rincon Hill (UNVERIFIED) | Cut-and-cover plus a mined tunnel (confirmed in the SFCTA memo); single-bore SEM, ~0.65 mi mined, per TJPA contract slides (search summary only, document not opened) | 1.3 mi; $8.25 B (Aug 2023, includes the built train box); indicative update $7.57 B (July 2025, $6.84 B excluding the train box); no FFGA yet | [Wikipedia](https://en.wikipedia.org/wiki/Downtown_Rail_Extension), [SFCTA memo, Jan 2026](https://www.sfcta.org/sites/default/files/2026-01/SFCTA_CAC_Item9_TJPAPortalProjectFiscalYear2026MEMO_2026-01-28.pdf) |

Fault facts usable in game:
- Hayward fault creeps under 5 mm/yr; UC Berkeley's stadium walls are offset 13 in since 1923. [Hayward Fault Zone](https://en.wikipedia.org/wiki/Hayward_Fault_Zone)
- BART decided in 2006 not to harden the Berkeley Hills Tunnel crossing, judging re-boring after an event cheaper. [Source](https://en.wikipedia.org/wiki/Hayward_Fault_Zone)
- The Hetch Hetchy crossing in Fremont uses an articulated multi-section structure with ball and slip joints. [Source](https://en.wikipedia.org/wiki/Hayward_Fault_Zone)
- UCERF3: 72% chance of an M6.7+ in the Bay Area before 2043 (30-year window 2014 to 2043; Wikipedia's "before 2045" is wrong); 14.3% on the Hayward alone over the same window. [USGS FS 2016-3020](https://pubs.usgs.gov/publication/fs20163020), [Wikipedia](https://en.wikipedia.org/wiki/Hayward_Fault_Zone)

Downtown SF column, for calibration: fill, then Young Bay Mud, then dense Colma sand (Millennium Tower piles stop here at 60 to 90 ft), bedrock about 200 ft down. [Millennium Tower](https://en.wikipedia.org/wiki/Millennium_Tower_(San_Francisco)). Old Bay Clay between Colma sand and rock: UNVERIFIED, from memory.

Derived rates (my arithmetic from the dates above, not published figures): Berkeley Hills ~200 m/month per bore; Caldecott ~43 m/month; Bay Tunnel ~290 m/month during startup.

## 7. Proposed geology model: 6 materials + 1 overlay

### 7.1 Materials

| ID | Material | From OFR 00-444 `PTYPE` | Real analogue |
|---|---|---|---|
| 1 | `FILL` | `af*`, `alf`, `ads`, `ac*`, `gq` | 1850s onward rubble and sand fill, SoMa, Mission Bay, Marina, SFO, Treasure Island |
| 2 | `BAY_MUD` | `Qhbm`, `Qhdm`; everything under `H2O` | Soft saturated estuarine clay |
| 3 | `SAND` | `Qds`, `Qhds`, `Qhbs` | Dune sand and Colma Formation |
| 4 | `ALLUVIUM` | all other `Qh*`, `Q*` fans, levees, terraces | South Bay and East Bay plain: interbedded clay, sand, gravel, high water table |
| 5 | `STIFF_CLAY` | none at surface (`Qp*`, `Qo*` optional); mainly a depth layer | Old Bay Clay / San Antonio Formation: where the SFPUC Bay Tunnel ran |
| 6 | `ROCK` | `br` | Franciscan Complex and East Bay Hills rock; hardness varies by noise |
| overlay | `FAULT_ZONE` | Qfaults lines buffered 50 to 150 m, weighted by `slip_rate` | San Andreas, Hayward, Calaveras, Silver Creek |

### 7.2 Vertical rule (procedural, per map column)

Inputs: surface elevation `z0` (terrarium), surface unit `U` (rasterized polygons), `dRock` = horizontal distance to the nearest `br` polygon (distance transform), `dShore` = distance bayward of the historic shoreline (edge of `afbm`/`Qhbm`/`H2O`).

1. Rockhead depth below surface: `min(k * dRock, 200 m)` with `k` ~ 0.08, plus low-frequency noise. Zero inside `br`. Calibration point: ~60 m under downtown SoMa.
2. If `U` is fill: 3 to 10 m of `FILL` on top.
3. If `U` is `afbm`, `Qhbm` or water: `BAY_MUD` below, thickness growing with `dShore` from 0 to a cap of ~35 m (real maximum about 120 ft, UNVERIFIED; USGS MF-976 maps it for the South Bay but only as a scanned plate: [MF-976](https://pubs.usgs.gov/publication/mf976)).
4. If `U` is `SAND`: 10 to 25 m of `SAND`.
5. Remaining depth down to rockhead: `SAND` lens (west side, SF) or `ALLUVIUM` (elsewhere) in the upper third, `STIFF_CLAY` below.
6. `ROCK` below rockhead.
7. Water table depth by surface unit from OFR 00-444 Table 4 (1.5 m in mud, 3 m in fill, 5 to 8 m in fans and dunes, 10 m+ in old alluvium, none in rock). Voxels below it are flagged `wet`.

Hand-placed overrides for the scenario sites (Rincon Hill rock knob, Yerba Buena Island, Transbay Tube trench) are cheaper than a better model.

### 7.3 Gameplay effect (proposed tuning values, not measurements)

Anchors: 6.3 m EPB in mixed SF ground averaged 13 to 16 m/day and peaked at 40 m/day; a 53 ft machine in South Bay alluvium is planned at 29 to 35 ft/day (9 to 11 m/day); US practice is 2 x 10 h shifts, 5 days, against 3 x 8 h, 7 days internationally (sources in section 6).

| Material | Base TBM speed (x of 15 m/day) | Cost x | Main risk | Right tool |
|---|---|---|---|---|
| `STIFF_CLAY` | 1.2 | 0.9 | Low; the sweet spot under the Bay | EPB |
| `SAND` (dry) | 1.0 | 1.0 | Settlement, cutter wear | EPB with conditioning |
| `ALLUVIUM` (wet) | 0.8 | 1.2 | Water inflow, settlement under low cover | EPB or slurry, pressurized face |
| `BAY_MUD` | 0.6 | 1.5 | Machine sinks or floats, large settlement; shallow stations need deep walls | Go deeper, or immersed tube in open water |
| `FILL` | 0.4 | 1.8 | Obstructions (old piles, buried ships), liquefaction, utilities | Cut-and-cover; do not bore |
| `ROCK` | 0.7 | 1.2 | Abrasive wear; mixed-face penalty at soil/rock transitions | Rock TBM, or SEM for station caverns |
| `FAULT_ZONE` | 0.3 | 3.0 | Creep maintenance cost per year; rupture event | Oversized vault section, or cross at grade |

Rules that produce real decisions:
- **Mixed-face penalty.** A ring face touching two materials costs an extra 0.7x speed. This makes vertical alignment a real choice (Central Subway lowered its profile to stay in rock near Chinatown: [Tunnels and Tunnelling](https://tunnelsandtunnelling.com/?p=7215), via search summary; UNVERIFIED, not found in the Robbins paper or Wikipedia).
- **Cover rule.** Less than 1.5 bore diameters of cover in soft ground adds settlement risk and a speed penalty (the VTA peer review's stated concern).
- **Diameter.** Cost and risk scale faster than linearly with bore diameter; single-bore vs twin-bore is a player choice with the VTA numbers as flavor.
- **Shift tech.** "24/7 operations" policy unlock moves 100 h/week to 168 h/week, straight from the peer review.
- **Immersed tube** as a separate build method: only in open water over `BAY_MUD`, fast and cheap per meter, needs dredging permits (red-tape hook) and later seismic retrofit cost.
- **Fault crossing** triggers a design choice: vault (capital cost), accept-and-repair (BART's real choice, recurring cost), or reroute.
- **Liquefaction class** (`LIQ` field) scales station and portal cost, not tunnel cost.

## 8. Recommendations for the game

1. Bake terrain offline with a Node script: terrarium z12 for the regional view, z14 for scenario areas. Commit the derived heightmaps (quantized Int16 at 0.1 m), not the PNGs. Do not fetch AWS tiles at runtime.
2. Set sea level at +0.97 m in tile units (MSL at NOAA 9414290 is +0.969 m NAVD88).
3. Voxel size: 8 m horizontal matches z14 (7.5 m/px) one to one. Vertical 2 to 4 m, because the interesting geology is in the top 60 m and the Bay is under 20 m deep almost everywhere; 8 m vertical voxels would flatten it.
4. Use a vertical exaggeration or a log depth scale only in the cross-section view, never in the world mesh.
5. Rasterize OFR 00-444 polygons to the same grid with a pure JS or Python scanline fill; store one byte per column (unit class) plus one byte (liquefaction class).
6. Fetch Qfaults GeoJSON once (two paged requests), simplify, and bake a per-column fault distance field.
7. Generate the subsurface with the section 7.2 rules, seeded and deterministic, then hand-tune the Portal, Link21 and Dumbarton corridors against the real profiles in section 6.
8. Ship a "boring log" UI: clicking any column shows the generated strata and water table. It is the main teaching tool and doubles as a debugging view.
9. Credits screen: USGS 3DEP, SRTM, GMTED2010, NOAA ETOPO1, USGS OFR 00-444, USGS Qfaults.

## 9. Reproduction

Scratch directory: `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/terrain/`

| File | Purpose |
|---|---|
| `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/terrain/scripts/terrarium.mjs` | Fetch, decode, point samples, transects, region stats, source headers |
| `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/terrain/scripts/run2.mjs` | Window max/min over lon/lat boxes |
| `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/terrain/scripts/dbf.py` | Stdlib shapefile attribute and area summary |
| `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/terrain/scripts/pip.py` | Stdlib point-in-polygon lookup of named sites |
| `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/terrain/run1.txt`, `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/terrain/run2.txt` | Raw output |

The scratch directory is session-scoped; port the decoder into the repo's data pipeline when implementation starts.

## 10. Open questions

- Whether the game should model tides at all (MSL to NAVD88 offset is settled: +0.969 m, section 4.5).
- Is the CoNED 2 m TBDEM worth the download for scenario areas, or is the 1/9 arc-second data inside the z14 and z15 tiles already the same source? Tile headers suggest the latter; not confirmed.
- Young Bay Mud thickness: digitize USGS MF-976 and MF-1376 contours for realism, or keep the distance-from-shore rule?
- Rockhead under the Bay along Link21 candidate alignments: no open grid found. Link21 geotechnical reports may publish profiles (not researched here).
- SIM 2918 GIS database: is the legacy download host still alive, or use the CGS statewide geologic map service instead?
- Real groundwater grids for Santa Clara Valley (Valley Water publishes depth-to-water maps, UNVERIFIED) vs the per-unit table used here.
- CGS liquefaction zone service: license terms and whether San Francisco and the South Bay quadrangles are all present.
- The Portal: confirm segment-by-segment construction method and Rincon Hill geology from the TJPA SEIS/EIR before building the first scenario.
- Vertical voxel size is a rendering and memory decision shared with the voxel-rendering research (`03-voxel-rendering.md`); the 2 to 4 m proposal here is driven by geology only.
- All speed and cost multipliers in 7.3 are design proposals. They need reconciling with the cost model (Polish baseline) owned by the cost research.

## 11. Corrections (2026-11-09 fact-check)

Re-run scripts and downloads: `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/verify-02-terrain-bathymetry-geology/`.

- **z14 tile budget (4.4):** ~1,000 tiles / ~100 MB changed to 858 tiles / ~80 MB. Source: slippy-tile arithmetic on the stated bbox; z14 tile size from a live HEAD (91 KB).
- **pubs.usgs.gov 403 (5.1):** "403 to default clients, browser User-Agent required" was wrong. Only Python `urllib` gets 403; default `curl` and Node `fetch` get 200. Source: live requests.
- **Sea level datum (4.5, 8, 10):** "roughly +1 m, UNVERIFIED" replaced with MSL = +0.969 m NAVD88, MHHW = +1.798 m. Source: NOAA CO-OPS datums API, station 9414290.
- **UCERF3 window (6):** "before 2045" changed to "before 2043". Source: USGS Fact Sheet 2016-3020.
- **The Portal (6):** added the July 2025 indicative estimate of $7.57 B next to the 2023 $8.25 B; construction method upgraded from UNVERIFIED to partly confirmed. Source: SFCTA CAC memo, 2026-01-28.
- **Qfaults name counts (5.2):** flagged as first-page only; added the omitted Butano and Green Valley and the page-two totals (Hayward 525 overall). Source: live paged query, 2,000 + 800 features.
- **Meta MPK20 unit (5.1):** flagged as point-dependent (`Qhbm`, `afbm`, `af` all occur on the campus). Source: own point-in-polygon run on `sf-qpys.shp`.
- **Liquefaction classes (5.1):** added that OFR 2006-1037 downgrades Bay Mud to moderate, so 00-444 `H` values at Meta and Googleplex are superseded. Source: OFR 2006-1037 abstract and shapefile.
- **USGS 1 m DEM (2):** survey range updated to ver. 2.0 wording (1999 to 2020). Source: DataCite record for doi 10.5066/P9TJTS8M.
- **SIM 2918 host (5.4):** `geomaps.wr.usgs.gov` now redirects to the USGS home page. Source: live request.
- **CGS liquefaction zones (5.3):** SF North and Mountain View quadrangles confirmed present. Source: live point queries.
- **Newly marked UNVERIFIED:** Bay Tunnel "4,700 ft in ~5 months" (source unreachable); Central Subway "lowered its profile to stay in rock" (7.3).
- **Confirmed unchanged:** terrarium URL, 256 px, z15 maximum (z16 is 404), 8-bit RGB non-interlaced, `x-imagery-sources` header, 2017 `Last-Modified`, 2010 topobathy source at z14/z15, ETOPO1-only bathymetry at z10; sample values (Golden Gate -95.8 and -114.8 m, Twin Peaks 280.8 m vs EPQS 280.5 m, Googleplex 7.4 m, Diridon 29.6 m); z10 = 25 and z12 = 63 tiles; OFR 00-444 tarball size, 13,827 polygons, fields, bbox and 12 of 13 re-run site lookups; OFR 2006-1037 16,141 polygons and no SF city coverage; Qfaults 2,800 features, 2,000 cap, 2.4 MB first page, 961 "Greater than 5.0 mm/yr"; Copernicus GLO-30 has no ocean tiles; CoNED 2 m / 42 datasets / 1922 to 2010; Transbay Tube, Berkeley Hills, Caldecott, Central Subway, Bay Tunnel (except progress rate), Millennium Tower and VTA peer-review figures against their cited sources.
