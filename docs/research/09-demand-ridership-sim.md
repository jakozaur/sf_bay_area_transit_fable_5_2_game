# 09: Demand, ridership and operations simulation

Researched 2026-11-09. Numbers marked MEASURED were produced locally today from the cited files (scripts in the scratchpad, see "Reproduction"). Numbers marked UNVERIFIED could not be confirmed against a primary source in this session (web search budget ran out midway; several agency pages returned HTTP 403 to automated fetches).

## 1. Demand data

### 1.1 LODES (home to work flows, block level)

| Item | Value | Source |
|---|---|---|
| Latest year | 2024 (files dated 2026-10-14) | MEASURED, HTTP headers at https://lehd.ces.census.gov/data/lodes/LODES8/ca/od/ |
| Geography | 2020 census blocks, 15-char GEOID | LODES tech doc 8.4, https://lehd.ces.census.gov/data/lodes/LODES8/LODESTechDoc8.4.pdf |
| OD columns | `w_geocode, h_geocode, S000` (total jobs), 9 segment columns (age, earnings, industry), `createdate` | same |
| Job types | JT00 all, JT01 primary, JT02 all private, JT03 private primary, JT04 federal, JT05 federal primary | same |
| main vs aux | main = home and work both in state; aux = work in state, home out of state | same |
| Citation template | "U.S. Census Bureau, {File}, LEHD Origin-Destination Employment Statistics, {Vintage}, https://lehd.ces.census.gov/data/lodes" | https://lehd.ces.census.gov/data/ |
| Licence | US federal work; the LEHD page gives a citation template and no usage restriction. Explicit public-domain wording: UNVERIFIED | https://lehd.ces.census.gov/data/ |

File sizes, MEASURED (Content-Length, 2026-11-09):

| File | Bytes (gz) | URL |
|---|---|---|
| CA OD main, all jobs, 2024 | 98,118,335 | https://lehd.ces.census.gov/data/lodes/LODES8/ca/od/ca_od_main_JT00_2024.csv.gz |
| CA OD main, primary jobs, 2024 | 87,959,087 | .../od/ca_od_main_JT01_2024.csv.gz |
| CA OD aux, 2024 | 1,918,191 | .../od/ca_od_aux_JT00_2024.csv.gz |
| CA RAC (homes of workers), 2024 | 11,537,081 | https://lehd.ces.census.gov/data/lodes/LODES8/ca/rac/ca_rac_S000_JT00_2024.csv.gz |
| CA WAC (jobs by workplace), 2024 | 6,372,235 | https://lehd.ces.census.gov/data/lodes/LODES8/ca/wac/ca_wac_S000_JT00_2024.csv.gz |
| CA block crosswalk (has block lat/lon, tract, county) | 9,295,375 | https://lehd.ces.census.gov/data/lodes/LODES8/ca/ca_xwalk.csv.gz |

Nine-county extract, MEASURED from the 2024 JT00 main file (counties 001, 013, 041, 055, 075, 081, 085, 095, 097):

- CA rows: 16,385,254. Rows with both ends in the Bay: 2,947,728, carrying 3,264,208 jobs.
- Work in Bay, home elsewhere in CA: 743,084 jobs. Home in Bay, work elsewhere in CA: 418,591. External flows are about 23% on top of internal, so they need gateway zones (matters for HSR, ACE, Capitol Corridor scenarios).
- Bay blocks in crosswalk: 82,210.
- Mean straight-line home to work distance: 22.2 km; cumulative share under 10 km 37%, under 20 km 60%, under 40 km 83%, under 60 km 93%. This is long: LODES assigns some workers to employer administrative addresses and ignores WFH, so treat the tail as inflated (the inflation claim itself is UNVERIFIED here; the distribution is measured).
- Job concentration: top 5% of work tracts hold 43% of jobs; largest work tracts are in Santa Clara County (06085505006: 69k jobs) and downtown SF (06075011700: 67k).

OD matrix size by aggregation, MEASURED (binary = 6 bytes per pair: u16 origin, u16 dest, u16 flow; gz = zlib level 9):

| Zoning | Zones | Nonzero pairs | Raw | gz | Pairs with flow >= 5 | Jobs kept by >= 5 cut |
|---|---|---|---|---|---|---|
| Census tract | 1,765 | 764,790 | 4.6 MB | 1.9 MB | 150,882 | 69% |
| Block group | 5,179 | 1,553,394 | 9.3 MB | 4.0 MB | 124,360 | 38% |
| 1 km grid | 6,937 | 1,283,449 | 7.7 MB | 3.3 MB | 132,211 | 48% |
| 2 km grid | 2,867 | 470,712 | 2.8 MB | 1.3 MB | 116,511 | 82% |
| 3 km grid | 1,622 | 224,030 | 1.3 MB | 0.6 MB | 76,381 | 92% |

- Thresholding small flows is lossy at fine zoning (drops half the jobs at 1 km). Ship full sparse matrices instead; they are small enough.
- H3 equivalents (not run, inferred from cell area): res 8 = 0.737 km2, close to the 1 km grid; res 7 = 5.16 km2, between the 2 km and 3 km grids. Areas from https://h3geo.org/docs/core-library/restable/.

Rail-addressable commute market, MEASURED (both home block and work block within X km straight-line of a current BART or Caltrain station, ends more than 2 km apart):

| Radius at both ends | Jobs |
|---|---|
| 0.8 km | 73,507 |
| 1.6 km | 354,885 |
| 3.2 km | 1,102,546 |

Compare with actual weekday ridership in section 5: this is the main calibration lever (catchment decay and non-commute multiplier).

### 1.2 ACS population and mode share

- ACS 5-year API base: `https://api.census.gov/data/2023/acs/acs5`. Tables: B01003 (population), B08301 (means of transportation to work), B08303 (travel time to work). A keyless request today returned HTTP 302 with an empty body (MEASURED); the redirect target is `https://api.census.gov/data/missing_key.html` (MEASURED in the fact-check, same for the 2024 vintage path), so treat a free API key as required, or use bulk table downloads. Written key policy and whether ACS 2024 5-year is published yet: UNVERIFIED.
- Regional commute mode share (MTC Vital Signs): drive 73% (2019), 59% (2021), 69% (2024); transit 13%, 4%, 8%; WFH 7%, 33%, 17%. SF residents over 36% transit in 2019. https://vitalsigns.mtc.ca.gov/indicators/commute-mode-choice
- For the game, RAC and WAC from LODES already give homes-of-workers and jobs per block; ACS is only needed for total population (non-work trips) and for mode share calibration targets.

### 1.3 GTFS feeds for existing service

MEASURED today (download, row counts):

| Agency | URL | Zip size | stops | routes | trips | stop_times |
|---|---|---|---|---|---|---|
| BART | https://www.bart.gov/dev/schedules/google_transit.zip | 1.02 MB | 291 | 14 | 6,377 | 76,409 |
| Caltrain | https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip | 0.17 MB | 106 | 5 | 260 | 5,468 |
| VTA | https://gtfs.vta.org/gtfs_vta.zip | 4.70 MB | 3,345 | 71 | 8,620 | 387,798 |
| Muni | https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip | 10.45 MB | 3,238 | 68 | 50,690 | 1,901,119 |
| AC Transit | https://api.actransit.org/transit/gtfs/download?token=... (token in URL on their page) | not fetched | | | | |
| 511 regional (31 agencies merged) | `http://api.511.org/transit/datafeeds?api_key=KEY&operator_id=RG` | not fetched (401 without key) | | | | |

Licensing and redistribution:

| Source | Terms | Source URL |
|---|---|---|
| 511 regional feed | Free token; 60 requests per hour per token; `historic=YYYY-MM` for old versions. Site terms bar redistribution and derivative works without written authorization from MTC, and say that authorization includes use of the Open511 APIs "as provided by written agreement with MTC". That agreement exists (a search-indexed copy is at https://511.org/sites/default/files/pdfs/511_Data_Agreement_Final_0.pdf; the open-data page links a 2026 version). Fragments seen in the fact-check: nonexclusive royalty-free licence to use the data in public services; data "shall not be sold as received on a standalone basis" without MTC consent. Full text not read, so redistribution rights stay UNVERIFIED; treat as not redistributable until it is read | https://511.org/open-data/transit, https://511.org/about/terms |
| SFMTA | Non-exclusive, revocable right to use, reproduce, redistribute. Derivatives must carry the notice "Reproduced with permission granted by the City and County of San Francisco..."; no Muni logos or maps; "only SFMTA may modify the data"; licence file ships inside the zip | https://www.sfmta.com/reports/gtfs-transit-data |
| Caltrain | Non-exclusive, revocable right to use, reproduce, redistribute; no Caltrain brand or system map without consent | https://www.caltrain.com/developer-resources |
| AC Transit | Right to use, reproduce, redistribute; page states CC BY 3.0 Unported; disclaimer must be shown | https://www.actransit.org/data-terms-and-conditions |
| BART | Developer licence page returned 403 to automated fetch. Terms UNVERIFIED | https://www.bart.gov/schedules/developers/developer-license-agreement |
| VTA | Terms not checked. UNVERIFIED | https://gtfs.vta.org/ |
| Regional feed background | Interline merges 31 agency feeds daily for MTC | https://www.interline.io/blog/mtc-regional-gtfs-feed-release/ |

Practical reading: build from per-agency feeds, not the 511 regional feed. Ship only a derived abstraction (route stop sequences, peak and off-peak headways, run times), not the raw zips, and carry the SFMTA notice plus an agency credits screen.

## 2. What the reference games do

| Game | Demand | Routing | Mode choice | Source |
|---|---|---|---|---|
| Subway Builder | Homes from LODES (and England and Wales 2021 census); workplaces assigned by a distance-based gravity model calibrated per city to match commute distances; "millions" of commuters; students and airports as separate segments | range-RAPTOR on the timetable, every departure in a 30 minute window, walking to, from and between stations | Best transit journey vs driving vs walking on perceived time, cost and income-dependent value of time. Perceived-time weights: ride 1.00, walk 1.39, platform wait 1.37, departing later than planned 0.40, driving in congestion 1.33, parking 1.60. Overcrowding and too many trains cause delays | https://www.subwaybuilder.com/simulation, https://www.subwaybuilder.com/ |
| NIMBY Rails | Pax pick origin and destination points from a population layer and POIs with demand curves by weekday, time and distance; then a covering station pair | Per-pax pathfind with a path cache (hit rate 99.9% or higher; cache is about stations squared, millions of entries above 1,000 stations). "Best path" station-pair picking started 50 to 100x slower than random and was optimized to 2 to 3x | No car alternative modelled in these posts; walking at 1 m/s straight line. Per-archetype preferences were dropped because each needs its own cache | https://carloscarrasco.com/page/17/, https://carloscarrasco.com/page/21/ |

Takeaways:
- Subway Builder uses LODES only for homes and regenerates workplaces with a gravity model. For one fixed region we can ship the real OD matrix instead (1.3 to 4 MB) and keep the gravity model only for induced or scenario demand (new campuses, upzoning).
- Both are agent-based and desktop-class. NIMBY Rails shows the cost: path caches in the millions of entries. In the browser, aggregate flows per OD pair give the same ridership numbers for a fraction of the cost.
- Subway Builder's published weights are a ready-made default set for generalized time.

## 3. Model ladder

### 3.1 Trip generation and distribution

- Level 0: use LODES OD directly. Daily one-way commute trips for pair (i, j) = `2 * T_ij * a`, with `a` = on-site attendance (start at 1 minus WFH share, 0.83 from Vital Signs 2024; calibrate).
- Level 1, gravity for new or changed land use: `T_ij = O_i * D_j * f(c_ij) / sum_k D_k f(c_ik)`, `f(c) = exp(-b * c)`, singly constrained at origins. Fit `b` so modelled mean distance matches the LODES distribution above (mean 22.2 km straight-line; fit on the under-60 km portion to discount the tail).
- Level 2, doubly constrained (Furness/IPF) when both homes and jobs change: iterate row and column balancing factors until RAC and WAC marginals match. 1,765 zones dense is 3.1M cells, trivial per iteration.
- Non-work trips: multiply commute riders by a per-mode factor `k_mode` fitted to observed ridership (section 5). Share of trips that are commutes: UNVERIFIED, so fit it, do not assume it.

### 3.2 Generalized time and mode choice

Generalized transit time in ride-equivalent minutes (weights from Subway Builder, section 2):

```
G_transit = 1.39 * (t_access_walk + t_egress_walk)
          + 1.37 * (wait_first + sum wait_transfer)
          + 1.00 * t_in_vehicle
          + P_transfer * n_transfers
          + fare / VOT
wait = min(headway / 2, wait_cap)            # frequency-based, random arrivals
G_car = 1.33 * t_drive_congested + 1.60 * t_park + (c_km * dist + parking + tolls) / VOT
```

Binary logit on the difference:

```
P_transit = 1 / (1 + exp(beta * (G_transit - G_car) - ASC))
riders_ij = 2 * T_ij * a * P_transit
```

- `beta`: the MTC Travel Model One UEC documentation shows an in-vehicle time token `c_ivt` = -0.0220 (https://github.com/BayAreaMetro/modeling-website/wiki/UECUtilitySheet). The page presents it as an example token value and does not state units or which tour purpose it belongs to; "per minute, work mode choice" is UNVERIFIED. Treat it as a floor for a nested model with many alternatives; for a two-alternative game model start at 0.04 to 0.06 per generalized minute and calibrate (design parameter, UNVERIFIED as an empirical value).
- `P_transfer`, `wait_cap`, `VOT`, `ASC`: design parameters. Suggested starts: 5 min, 15 min, $20 per hour, fitted. All UNVERIFIED.
- Sanity checks against elasticities: headway elasticity averages about 0.5; service expansion 0.6 to 1.0; fare elasticity about -0.2 to -0.5 short run, larger long run (Litman, https://www.vtpi.org/tranelas.pdf). After calibration, halve a headway in the model and check ridership rises by roughly 30 to 45%, not 5% or 200%.
- Income heterogeneity (Subway Builder does per-commuter VOT): get the same smoothing for free by evaluating the logit at 3 VOT classes using LODES earnings segments SE01 to SE03 (columns exist in the OD file, tech doc above).

### 3.3 Assignment

| Level | Method | Cost | When |
|---|---|---|---|
| A | All-or-nothing on shortest generalized-time path, wait = headway/2 on boarding edges | one Dijkstra per station | MVP |
| B | Frequency-based "optimal strategies" (combined headway on common lines, split by frequency) | similar | when parallel lines exist (Caltrain local vs express, BART interlining) |
| C | Capacity feedback: crowding multiplier on in-vehicle time when load/capacity > 0.8, denied boarding adds a headway of wait; 3 to 5 MSA iterations | 3 to 5x level A | when Transbay or Caltrain saturate |
| D | Timetable-based rRAPTOR or CSA over generated schedules, sampled departures | much heavier | only if timetables become gameplay |

Road side: no assignment in MVP. Static congested drive times (section 4). Upgrade: BPR `t = t0 * (1 + 0.15 * (v/c)^4)` (https://en.wikipedia.org/wiki/Route_assignment) on a coarse freeway and bridge graph so that diverted drivers visibly relieve the Bay Bridge and US-101.

### 3.4 Routing libraries in JS (for level D or for validating level A)

| Library | Algorithm | Browser | Licence | Notes | Source |
|---|---|---|---|---|---|
| minotor | RAPTOR, earliest arrival to all stops (isochrones); README also lists range queries (Pareto set over a departure window) | Yes; GTFS parsing in Node, router loads a protobuf timetable | MIT | Swiss national daily timetable 20 MB, 5 MB compressed; minute resolution; npm 13.0.0, published 2026-10-30 (actively maintained, fast-moving major versions, so pin it) | https://github.com/aubryio/minotor |
| raptor-journey-planner | RAPTOR and range RAPTOR, no mcRAPTOR | Yes, via Web Worker | GPLv3 (copyleft, check fit) | Loads GTFS from Blob or fetch | https://github.com/planarnetwork/raptor |
| Conveyal R5 | Many-to-many over departure windows, cumulative-opportunity accessibility | No (JVM) | MIT | Reference for accessibility method, offline validation only | https://github.com/conveyal/r5 |

For player-drawn lines there is no timetable, only headway and speed. A frequency-based graph is the natural representation; RAPTOR would require synthesizing timetables first. Use minotor only as an offline check that the abstraction of existing service reproduces GTFS travel times.

### 3.5 Benefit metrics

- Riders per day per line, boardings per station, peak load per segment vs capacity.
- Time saved: `sum_ij trips_ij * (G_before - G_after)` for existing riders, rule of half for new riders.
- Consumer surplus via logsum: `CS_ij = (1/beta) * ln(exp(-beta * G_car) + exp(-beta * G_transit + ASC))`; benefit = trips times delta CS, in minutes, times VOT for dollars. This is the number to set against construction cost.
- Accessibility: `A_i = sum_j jobs_j * [G_transit_ij <= 45]`; headline "jobs within 45 min by transit for the average resident" = RAC-weighted mean of `A_i`. Falls out of the same zone-to-zone matrix at no extra cost.
- Isochrones: threshold the same matrix row for the selected zone and paint voxels or hexes.
- Car trips removed and vehicle-km removed = new transit riders times OD road distance; CO2 from a per-km factor (factor UNVERIFIED, pick from EPA later).

## 4. Car baseline without paid APIs

- Offline: build a drivable graph from the OSM extract (motorway, trunk, primary, secondary), free-flow speed from `maxspeed` or class default, run zone-to-zone Dijkstra in Python or Node (no OSRM or Valhalla required; either would need Docker or a native build, neither is installed).
- Peak factor per road class and per screenline (bridges, US-101, I-880, I-80): design parameters to calibrate, UNVERIFIED. Start around 1.6 to 2.0 on freeways in peak direction, 1.3 on arterials, plus fixed bridge delay.
- Calibration targets that are free: ACS B08303 travel time to work by tract, Vital Signs congestion indicators (https://vitalsigns.mtc.ca.gov), Caltrans PeMS (free account; UNVERIFIED access terms). TomTom Traffic Index city page did not render usable numbers to an automated fetch.
- Ship as a second u8 or u16 matrix aligned with the OD pair list (minutes): 1 to 2 bytes per pair, so 0.76 MB (u8) to 1.53 MB (u16) raw at tract level (764,790 pairs).
- Parking: per-zone minutes and dollars, high in SF downtown, zero in suburbs. Design parameter.

## 5. Calibration targets (current service)

| System | Avg weekday riders | Annual | Source |
|---|---|---|---|
| BART | 204,800 (Q2 2026); 423,395 in FY2017 | 55.5M (2025) | https://en.wikipedia.org/wiki/Bay_Area_Rapid_Transit |
| Caltrain | 41,968 (Mar 2026, article body, Caltrain dashboard); infobox shows 39,985 (Aug 2025, fare-media estimate); APTA Q2 2026 figure is 45,800; over 63,000 in 2019 | 11.2M (2025) | https://en.wikipedia.org/wiki/Caltrain |
| Muni | 533,700 (Q2 2026) | 167.1M (2025) | https://en.wikipedia.org/wiki/San_Francisco_Municipal_Railway |
| AC Transit | 164,800 (Q2 2026) | 40.4M (2025) | https://en.wikipedia.org/wiki/AC_Transit |
| VTA bus + LRT | 96,200 (Q2 2026) | 27.6M (2025) | https://en.wikipedia.org/wiki/Santa_Clara_Valley_Transportation_Authority |

- BART, Muni, AC Transit and VTA are Wikipedia infobox values (APTA-derived, Q2 2026 weekdays). Caltrain is not: three sources give 40k to 46k weekday depending on method and month, so calibrate to a range, not a point. Agency primary pages were blocked (BART 403) or dashboard-only (Caltrain). Good enough for calibration, re-verify before quoting in-game.
- BART station-to-station OD matrices and Caltrain station counts exist (Caltrain page mentions origin-station estimates from Nov 2023: https://www.caltrain.com/about-caltrain/statistics-reports/ridership). BART OD download location UNVERIFIED (page blocked). These would allow per-station calibration, not just system totals.
- Scale check: BART plus Caltrain carry about 247k weekday trips; the 1.6 km both-ends LODES market is 355k jobs, i.e. about 590k one-way trips per day at 0.83 attendance. A calibrated rail share near 30 to 40% of that market, before the non-work multiplier, is the expected order of magnitude.

Calibration procedure: fix weights (section 3.2), then fit `beta`, `ASC_rail`, `ASC_bus`, catchment decay and `k_mode` by grid search to minimize squared log error on the five system totals plus the regional 8% transit commute share. Run offline, bake constants into the build.

## 6. Train operations abstraction

Run time between stations d metres apart, cruise v, accel a, decel b:

```
d_crit = v^2/2 * (1/a + 1/b)
t_run  = d/v + v/2 * (1/a + 1/b)              if d >= d_crit
t_run  = sqrt(2 * d * (a + b) / (a * b))      otherwise (never reaches v)
t_leg  = t_run + dwell
cycle  = 2 * sum(t_leg) + 2 * turnaround
fleet  = ceil(cycle / headway) * (1 + spare)
capacity_per_hour_per_direction = (60 / headway_min) * cars * pax_per_car
```

Tech presets:

| Tech | Top speed | Accel | Train size | Observed average | Source |
|---|---|---|---|---|---|
| BART | 80 mph max, 70 mph typical | 3.0 mph/s (legacy A/B cars; new fleet not stated) | up to 10 cars, 70 ft each (700 ft consist); 54 seats per car on the current fleet (retired legacy C cars 56, B cars 60) | 35 mph average incl. stops | https://en.wikipedia.org/wiki/Bay_Area_Rapid_Transit, https://en.wikipedia.org/wiki/Bay_Area_Rapid_Transit_rolling_stock |
| Caltrain EMU (Stadler KISS) | 79 mph line limit; KISS family 160 to 200 km/h | 1.1 m/s2 (KISS family): UNVERIFIED, not found on the cited page or in a search | 7-car sets; Caltrain-specific seats not on page (secondary sources give 558 to 573 for the original 6-car design, UNVERIFIED) | Local SF to Tamien 83 min electric (115 diesel); 10-stop express 59 min; 104 trains per weekday; peak headway down to 15 min. Current GTFS (MEASURED in fact-check): weekday locals SF to Tamien 83 to 98 min, SF to Diridon 77 to 78 min, express 60 min, limited 70 min; 104 mainline weekday trips plus 8 Gilroy connector trips | https://en.wikipedia.org/wiki/Caltrain, https://en.wikipedia.org/wiki/Stadler_KISS |
| HSR | 220 mph design; 110 mph cap on blended Caltrain corridor | UNVERIFIED | at least 450 seats | SF to LA 2 h 40 min mandate | https://en.wikipedia.org/wiki/California_High-Speed_Rail |
| Muni Metro, VTA LRT | UNVERIFIED | UNVERIFIED | UNVERIFIED | VTA LRT 42.2 mi | https://en.wikipedia.org/wiki/Santa_Clara_Valley_Transportation_Authority |

- Standing capacity per car, dwell times, minimum headway by signalling (CBTC vs fixed block), and Transbay Tube trains per hour: UNVERIFIED. Make them tech-tree parameters (signalling upgrade lowers minimum headway, level boarding lowers dwell).
- Validate the kinematic formula against the two measured anchors: BART 35 mph average, Caltrain local 83 min over 48.7 mi (78.3 km, SF to Tamien, GTFS `shape_dist_traveled`; 51 mi is the electrified length, not the station-to-station distance).

Economics per line per day:

```
fare_revenue = riders * avg_fare
op_cost      = train_hours * c_hour + car_km * c_km + stations * c_station
```

- Fare anchors: BART distance-based, $2.15 minimum under 6 mi, $10.30 max without surcharges, $1.40 Transbay surcharge, average fare paid $3.93 (June 2022). https://en.wikipedia.org/wiki/Bay_Area_Rapid_Transit
- Farebox recovery anchors: BART 72% (2019), 28.59% (2026); Caltrain 70% (2019); Muni 17%; AC Transit 13% (2020); Warsaw ZTM 37% (2019). https://en.wikipedia.org/wiki/Farebox_recovery_ratio
- Unit operating costs (`c_hour`, `c_km`): NTD agency profiles are the source (https://www.transit.dot.gov/ntd/transit-agency-profiles), fetch returned 403. Values UNVERIFIED; back-solve from the farebox ratios above until NTD is read. A "Polish operations" multiplier belongs here too, mirroring the capex benchmark.

Visual trains: yes, but decoupled from demand. Train count = `fleet`, positions are a closed-form function of sim time along the line polyline using the same speed profile; no per-passenger agents. Show crowding as platform voxel crowds and car fill colour from segment load/capacity. This keeps the render loop independent of the assignment worker.

## 7. Performance design

- Offline (Node or Python): LODES to zone OD (43 s in plain Python for the whole CA file, MEASURED), car time matrix, existing-service graph from GTFS, calibration.
- Runtime, in a Web Worker: typed arrays only, transferred not copied.
  1. On network edit, rebuild the station graph (platform nodes per line, boarding edge = wait, alighting edge, ride edges, walk transfer edges).
  2. All-pairs station to station generalized time: one Dijkstra per station.
  3. For each OD pair, min over K access times K egress stations, logit, accumulate riders and station-pair loads.
  4. Push station-pair loads along stored predecessor paths to get segment loads.
- MEASURED synthetic benchmark, Node 26.7, one thread: 600 stations and 800 platform nodes, all-pairs Dijkstra 72 ms; 765,000 OD pairs (the real tract count) times 16 access/egress combinations with logit, 93 ms. Full recompute about 0.17 s at tract scale; the 1 km grid (1.28M pairs) would be about 0.3 s. Step 4 was not benchmarked.
- So a full recompute per edit is affordable; no incremental scheme needed for MVP. Debounce edits by 200 ms and show a "recomputing" tick.
- Download budget: OD 1.3 to 3.3 MB gz, car times about 1 MB, zone table (centroid, homes, jobs) under 100 KB, existing network under 300 KB.

## Recommendations for the game

MVP model (all formulas in sections 3 and 6):

1. Zones: two-level. Store OD at about 2 km (H3 res 7 or 2 km grid: about 2,900 zones, 470k pairs, 1.3 MB gz). Store homes (RAC) and jobs (WAC) at about 1 km or finer (H3 res 8 or 9) so station catchments resolve inside a zone; a zone's access to a station is the RAC or WAC share within walking distance, with distance decay. If the two-level split proves fiddly, ship the full 1 km OD (3.3 MB gz) and skip disaggregation.
2. Demand: LODES 2024 JT00 OD directly, plus external gateway zones for the 743k in-commuters. Gravity model only for scenario land use (new campus stations, upzoning as a red-tape reward).
3. Mode choice: binary logit car vs transit on generalized time, Subway Builder weights, 3 income classes from SE01 to SE03.
4. Assignment: frequency-based, all-or-nothing, wait = headway/2 capped. Full recompute in a Web Worker on each edit.
5. Car baseline: precomputed OSM free-flow matrix times class and screenline peak factors, static.
6. Existing service: derived from per-agency GTFS into line, stop sequence, headway, run time. Rail and ferries explicit; buses collapsed into a generic access speed per zone in MVP (Muni alone is 1.9M stop_times rows, not worth shipping).
7. Outputs shown to the player: riders per line and station, peak load vs capacity, minutes saved per day, jobs within 45 min, car trips removed, fare revenue minus operating cost, benefit per dollar of capex.
8. Trains: kinematic visual only, count from cycle time and headway.
9. Calibrate offline to the five system totals and the 8% regional transit share; ship constants.

Upgrade path, in order of payoff:

1. Capacity and crowding feedback (level C), so the Transbay Tube saturates and Link21 has a reason to exist.
2. Optimal-strategy assignment for express/local and interlined trunks.
3. BPR on a coarse bridge and freeway graph so mode shift visibly reduces congestion.
4. Explicit frequent-bus network and park-and-ride access.
5. Time-of-day periods (AM peak, midday, PM peak, evening) with separate headways.
6. Induced land use: accessibility gain raises zone homes or jobs over game years, gated by zoning reform in the policy tree.
7. Timetable mode with rRAPTOR (minotor, MIT) only if scheduling becomes a mechanic.

Licensing actions:
- Do not use or redistribute the 511 regional feed until its data agreement is read; per-agency feeds from SFMTA, Caltrain and AC Transit explicitly allow redistribution with conditions.
- Read BART and VTA terms manually (blocked or unchecked here).
- Add a credits screen: Census LEHD citation, SFMTA notice text, AC Transit CC BY 3.0, OSM.

## Open questions

- Zoning choice: H3 (nice neighbours, awkward against a cubic voxel grid) vs a square grid aligned to the voxel world. Depends on the terrain chunking decision in the voxel research.
- Is LODES JT00 (all jobs) or JT01 (primary jobs, one per worker) the better commute proxy? JT01 avoids double-counting multi-job holders; file is 88 MB.
- How much of the 22 km mean distance is administrative-address artefact, and should flows above some distance be damped before calibration?
- Non-work demand: is a fitted multiplier enough, or do airports (SFO, OAK, SJC), universities and stadiums need explicit generators, as Subway Builder does for students and airports?
- Out-of-region demand for HSR missions: LODES aux and other-county flows cover commuters only; intercity trips need a separate, probably hand-authored, table.
- 511 data agreement contents and BART licence terms.
- NTD unit operating costs by mode, and what the "Polish operations" multiplier should be.
- Peak congestion factors: which free source to calibrate against (ACS B08303 vs PeMS).
- Should the player see pre-2020 or current ridership as the baseline? BART is at roughly half of FY2017 weekday ridership, which changes how "full" the existing system feels.
- Census API access without a key (got a 302 today).

## Reproduction

Scratch files (not part of the repo):
- `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/demand/analyze.py`: LODES nine-county aggregation, matrix sizes, distance distribution, rail-addressable market. Args: download dir, GTFS dir.
- `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/demand/bench.mjs`: synthetic assignment benchmark.
- `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/demand/gtfsstat.py`: GTFS row counts.
- Method notes: distances are equirectangular straight-line at latitude 37.6; grid zones are lat/lon bins of nominal km size; station points are BART and Caltrain `stops.txt` entries with location_type 0 or 1, deduplicated to 3 decimals (112 points).

## Corrections (2026-11-09 fact-check)

Changed:
- Section 6, Caltrain validation distance: "about 51 mi" replaced by 48.7 mi SF to Tamien. Source: `shape_dist_traveled` in the Caltrain GTFS downloaded today (78,335 m); Wikipedia route diagram gives 48.9 mi. 51 mi is the electrification project length.
- Section 5, Caltrain weekday ridership: 41,968 (Mar 2026) is article body text, not the infobox. Infobox is 39,985 (Aug 2025); the APTA template value is 45,800 (Q2 2026). Row and the "all five are infobox values" note amended. Source: raw wikitext of Caltrain and Template:American transit ridership.
- Section 6, BART seats: "51 to 56" replaced by 54 on the current fleet (legacy C 56, B 60). Source: Wikipedia BART and BART rolling stock wikitext.
- Section 6, KISS acceleration 1.1 m/s2: marked UNVERIFIED. The cited Wikipedia page contains no acceleration figure and a search found none for the Caltrain sets.
- Section 3.2, TM1 coefficient: -0.0220 is shown on the cited wiki page only as an example `c_ivt` token; units and purpose marked UNVERIFIED.
- Section 1.2, Census API: the 302 redirects to `missing_key.html`, so a key is required in practice (measured with curl).
- Section 1.3, 511: the data agreement PDF is retrievable (old filename `511_Data_Agreement_Final_0.pdf`); row updated with the fragments seen. Full text still unread.
- Section 4, car matrix size: "under 1.5 MB" replaced by 0.76 to 1.53 MB (764,790 pairs times 1 or 2 bytes).
- Section 3.4, minotor: added npm version and date (13.0.0, 2026-10-30) and range-query support. Source: `npm view minotor`, GitHub README.

Confirmed independently (no change):
- LODES file sizes and 2026-10-14 dates (HEAD requests); header columns; rows 16,385,254; Bay rows 2,947,728; jobs 3,264,208; inflow 743,084; outflow 418,591; 82,210 blocks; mean 22.2 km, 37% under 10 km, 60% under 20 km; tract matrix 1,765 zones, 764,790 pairs, 4.59 MB raw, 1.95 MB zlib-9, 150,882 pairs at flow >= 5 keeping 69%; 2 km grid 470,712 pairs; top 5% of work tracts 43%; top two tracts. Recomputed with a separately written script on the same downloaded files. Max tract-pair flow is 867 and max 2 km grid-pair flow is 6,506, so u16 flows do not overflow.
- GTFS zip sizes and row counts for BART, Caltrain, VTA, Muni (fresh download); SFMTA licence file inside the Muni zip; 511 returns 401 without a key, 60 requests per hour, `historic=YYYY-MM`, 31 agencies (Interline).
- SFMTA, Caltrain, AC Transit licence wording (agency pages).
- Subway Builder weights, rRAPTOR, 30 minute window, LODES plus gravity model (subwaybuilder.com/simulation). NIMBY Rails cache claims (both devblog pages).
- Vital Signs mode shares; H3 areas; Litman headway 0.5 and expansion 0.6 to 1.0; farebox ratios; BART fares, 35 mph, 80/70 mph, 3.0 mph/s, FY2017 423,395; BART, Muni, AC Transit, VTA Q2 2026 weekday and 2025 annual figures; VTA LRT 42.2 mi; HSR 220 mph, 110 mph, 450 seats, 2 h 40 min.
- raptor-journey-planner 5.2.0, GPL-3.0, worker entry point, no mcRAPTOR (npm, GitHub).
- Benchmark: `bench.mjs` rerun twice on Node 26.7.0 gave 69 to 76 ms and 91 to 96 ms.

Not rechecked (still as the researcher reported): block-group, 1 km and 3 km matrix rows; the rail-addressable market table; the 43 s Python timing (the independent script took 35 s); BART licence terms (403 again); LODES inflation of long commutes.
