# bayvox master plan

Status: v1, 2026-11-09; amended the same day after three reviews (engine and data, economics and fidelity, game design), with every accepted change folded into the section it concerns. Single source of truth for scope, architecture, numbers and order of work. Amend in place with a short dated note; decisions (including rejected and deferred alternatives) live in section 2 and are not re-proposed without new evidence.

Research index (detail lives there, not here): [01](research/01-osm-data.md) OSM and pipeline, [02](research/02-terrain-bathymetry-geology.md) terrain and geology, [03](research/03-voxel-rendering.md) rendering, [04](research/04-world-scale-voxelization.md) scale and voxelization, [05](research/05-bay-area-transit-projects.md) projects, [06](research/06-construction-costs.md) costs, [07](research/07-red-tape-policy.md) policy, [08](research/08-game-design-references.md) design references, [09](research/09-demand-ridership-sim.md) demand, [10](research/10-architecture-tooling.md) architecture, [11](research/11-polish-road-costs.md) Polish baseline. Cited as [NN] or [NN s.X].

Number tags:
- `[NN]`: taken from that research doc (which carries the primary source).
- DERIVED: arithmetic here on research numbers.
- TUNING: game constant chosen here, calibrated to research, not a fact. Lives in the constants registry with `verified: false`, never as a bare literal.
- TARGET: engineering budget to be measured; not yet a measurement.
- UNVERIFIED: carried from research without primary-source confirmation. Must not ship as fact in game text.

- MEASURED: read from the repo or from a bake in `apps/game/public/data/` on 2026-11-09.

Repo state on 2026-11-09: implementation is already in flight beside this plan (one commit, "M0 skeleton", plus uncommitted work in `core`, `world`, `mesher`, `render`, `input`, `pipeline`, `sim`, `apps/game`). This plan adopts what is built where the choice is neutral and names the deltas where it decides otherwise (section 11.0). Section 10 lists only additions to the existing contracts.

## 1. Vision and pillars

A browser game: a 1:1 voxel Bay Area built from OpenStreetMap, Overture and USGS data, where the player drives tunnel boring machines under real streets, builds stations, and removes the named causes of Bay Area cost and delay until projects price out at Polish practice. "Minecraft for boring tunnels."

Pillars (used to cut scope):

1. **The toy is the game.** A drivable TBM, hand digging, a cutaway and a breakthrough must be fun with no economy attached. M0.5 and M1 exist to prove or kill this before any economics gate [08 rec. 3].
2. **The player never waits.** Digging is immediate. Calendar time is a resource spent by work and shown as time-lapse; no lapse runs longer than 15 s of real time, and any lapse over 5 s gives the player something to place or ride (TUNING, tested in the reference script).
3. **Every block has a price and a Polish par.** Funds are debited at your price: the scope you built at the levers you have reformed so far. Status Quo (SQ) and Polish practice (PL) are the two bounds computed for the same scope. The HUD shows your number and the gap to PL; the receipt shows all three; the real sponsor quote and date run as a ghost at the scorecard [08 s.4.8].
4. **The gap is a receipt, not a multiplier.** It decomposes into design scope the player can see as extra blocks, named institutional levers, and time. Every model number resolves in the constants registry, enforced by a check, not by discipline. The receipt, scorecard and cards print the source or a TUNING/UNVERIFIED label; the HUD, floaters and gauges show bare numbers with the source one hover away.
5. **Reform is visible and never free.** Every reform or tech changes something in the voxel world and names who pays for it (7), except "Pothole first" [07 rec. 6]. Poland is the benchmark, not a fairy tale: PL mode keeps its own failure cards (Łódź, lowest-bid collapses) [06 s.2.2][11 s.1.5].
6. **One persistent Bay.** Real projects are missions on one map; the network is never reset [08 s.4.7]. Money saved on real projects pays for the lines nobody planned (the Caltrain campus branches, 9.1).
7. **Vectors are truth, voxels are derived.** Tunnels, stations and track are parametric records; voxels are stamped from them [03][04].

Headline claim (owner decision, 2026-11-09, given directly in session; supersedes the PPP recommendation). UI text is generated from the model's own ratios (6.7), never typed as a fixed string. The headline is per route-km, nominal USD (3.71 PLN/USD), all-in: a Bay Area rail project against what Poland builds for the same transport function, at the Polish design (twin bore, compact standard stations, no oversized caverns or mezzanines) and Polish prices, anchored on Polish urban rail tunnels (Warsaw metro, Łódź). For The Portal that is about 12x on the research figure for the M2 central section (680 mln PLN/km in 2026 money, about $183M/km [11 s.6]) and about 24x on the owner's figures (Warsaw metro about $95M/km, Łódź about $85M/km, Portal about $2.2B/km; UNVERIFIED here, which Warsaw phase and price year they refer to is not checked). The receipt decomposes the headline into separate factors, each with its own reforms: design scope (about 3x on The Portal, back-calculated, UNVERIFIED), institutional levers at matched scope (about 4.5x at PPP [11 s.6.5]), and the price-level gap between exchange rate and PPP (1.61 [11 s.5.3]). The like-for-like figures of [11 s.6.5] (x4 PPP, x6.5 nominal at matched scope) stay visible on the receipt as the "same design" comparison.

Out of scope for v1: timetables, fares and operating-cost simulation, passenger or vehicle agents, bus networks, construction logistics chains, parcel-by-parcel eminent domain (land is priced by area and building count, 6.2), multiplayer, mobile and touch, first-person walking and physics, WebGPU, wasm, SharedArrayBuffer, an ECS library.

## 2. Key decisions

### 2.1 Proposal verdict

Three independent proposals were judged (5 = best):

| Criterion | fun-first | tech-risk-first | realism-message-first |
|---|---|---|---|
| Fun in the first 15 minutes | 5: toy at M0, full drive possible, no waiting, audio from M0 | 2: first toy at M3, slice at M6 | 3: cost engine first, toy second, no TBM in mission 1 |
| Browser feasibility | 4: sound, but budgets asserted rather than gated | 5: explicit gates, one-constant fallbacks, precision tests | 4: sound, lighter on perf proof |
| Fidelity to the owner's vision | 4: strongest on boring-machine fantasy; weakest on benchmark honesty (one global 4.47 product) | 4: per-category levers; HSR reduced to a profile view | 4: best Polish-benchmark rigor; mission 1 without a TBM contradicts the brief |
| Buildable by parallel agents, headless | 4: reference command scripts per mission | 5: most precise acceptance criteria | 4: citation gate, cost bands, property tests |

Base: **fun-first** (the only one whose M0/M1 is a playable dig). Grafts:

- From tech-risk-first: gate discipline (deterministic counter budgets, pre-declared one-constant fallbacks, gates never move), per-category SQ levers so the multiple emerges from what is built, 1 game hour tick, regenerate-after-evict determinism test, risk-retirement table, whole-Bay soak milestone.
- From realism-message-first: analytic pricing from parametric records (independent of voxel size), cost engine as a pure module with sanity bands, sourced-constants gate in CI, three-part receipt with the unexplained residual printed, irreducible seismic line, funding slices with the federal gate, honest Portal labelling.

The implementation in flight is closest to the two grafted proposals: a planning-level sim (alignment, methods, phases, headings) with a Poland comparison waterfall. What it lacks is the base proposal's core: a machine the player drives, and time that never makes the player wait. Those are the M0.5 and M1 deltas (11.0).

### 2.2 Decisions

| # | Decision | Choice | Rejected or deferred, and why |
|---|---|---|---|
| 1 | World frame | UTM 10N (EPSG:32610), 20 x 24 region tiles of 4,096 m = 81.92 x 98.304 km, origin E 532,480 N 4,116,480, Y up = NAVD88 m, flat world [04 s.8, s.9.1]; constants in `packages/core/src/frame.ts` | Web Mercator (26% scale error), ENU tangent plane (283 m curvature drop at 60 km), custom TM (non-standard for 0.03%) [04 s.8] |
| 2 | Scale | 1:1, no vertical exaggeration in the world mesh | Exaggeration: view-only, later, in the 2D profile panel [02 s.8][04 s.6] |
| 3 | Work voxel | 1 m cubes, 32^3 chunks: a 6.6 m bore is 7 voxels and reads round [04 s.4.2] | 2 m default [03]: bore is 3.5 voxels. Kept as the one-constant fallback (`VOXEL_SIZE_M`), prices unaffected (decision 13) |
| 4 | Tiers | W 1 m true 3D chunks; C 4 m, R 16 m, F 64 m column meshes; factor 4 [04 s.9.1] | Any single voxel size (16x gap between tunnel and region scale [04 s.4]); dense 3D region-wide; SVO/DAG; POP buffers [03] |
| 5 | W representation | 3D chunks voxelized lazily from a column source (as built: `ChunkWorldStore` over `ColumnSource`), materialised only where the surface band, an edit, an authored void or a cut face needs them; everything else is the implicit strata function | W as columns plus a separate 3D overlay (two representations in the edit path; the scaffold `WorldStore` contract is chunk-based); pre-baked voxel chunks (169 MB at 2 m for buildings alone vs 40 MB as vectors [04 s.4.5]) |
| 6 | Source of truth | Vectors + DEM + parametric project records + sparse RLE dig deltas; saves hold no voxel grids [03][10 s.3.5] | Voxel saves |
| 7 | Underground view | Horizontal cut: shader `cutY` discard inside a radius plus slice-texture caps (as built, the [03 s.8] pick). Vertical "ant farm" section: a mesher-level view mask that follows the alignment (columns on the camera side of the alignment polyline, inside a radius of the focus, read as air for meshing only), so a diagonal or curved drive shows a continuous stair-stepped section wall (4.4). X-ray pass for the overlay layer. 2D profile panel at M4 | Axis-aligned mask plane (SoMa's grid, and so the Townsend and Second drive, runs about 45 degrees off the UTM axes; a plane meets the tunnel at one oblique point); view mask for every cut (would discard the working caps and remesh on each 1 m step); stencil caps; ghost alpha terrain [03 s.8]. Fallback if a mask move misses its frame budget (4.6): a curtain mesh along the alignment [03 s.8] |
| 8 | Renderer | three 0.187.0 `WebGLRenderer`, `reversedDepthBuffer`, instanced 8-byte packed quads batched into 4 x 4 x 4-chunk regions, one GLSL `ShaderMaterial` [03] | One draw per chunk (as built: 3,500 to 5,200 draws with all tiers against a 500 budget, 4.3); `WebGPURenderer` deferred behind `ChunkRenderer` (experimental per manual, open issue #30560, `highPrecision` incompatible with instancing [03][10]); Babylon, PlayCanvas, Bevy, noa, voxelize, DVE rejected [03] |
| 9 | Meshing | Binary greedy in plain TS, flat-merged (no AO in the merge key), worker pool, transferables only | Baked AO in the merge key (MEASURED +81% to +97% quads, 4.3); wasm mesher, SharedArrayBuffer: deferred (0.11 to 0.14 ms per chunk measured in JS; COOP/COEP hosting cost) [03][10] |
| 10 | Sim | Deterministic package, tick = 1 game hour (`TICKS_PER_DAY = 24`), command-only mutation, integer cents and mm, in-repo PRNG, `stateHash` [10 s.3.1]. Possession steps `possessionScale` ticks per real second (about 20 in mission 1) and is drawn interpolated | 10 game-minute tick (6x headless cost for a decade); 1 day tick (what the in-flight sim steps today: no possession possible; its rates are all per day, so the change is one constant). Fallback if the advance per tick reads as stepping at M0.5: `TICKS_PER_DAY = 96` |
| 11 | Control scheme | Hybrid with the toy on top: plan an alignment and let headings run (as built in `sim`), or possess a machine and drive, the driven path becoming the alignment record [08 s.4.4]. Skill is depth, face pressure and hazard avoidance, not yaw (5.4). Long drives are set pieces: the player possesses the launch, each hazard zone and the breakthrough, and cruise lapses between them (5.3); no mission from Act II on assumes a full manual drive | Planning-only (competes head-on with Subway Builder and NIMBY Rails, voxels become decoration); driving required; yaw-rate steering as the skill (0.4 to 1 degree per second at real radii, 5.4) |
| 12 | Time presentation | Clock advances only while work happens or a lapse plays; pre-construction is a stack of binder tokens; no lapse over 15 s. Possession scale is a per-mission constant derived from a target drive length in real seconds (5.3) | Idle real-time waiting at 1 week/s as the default experience; one global possession scale (1 s = 6 h made the first drive 8 to 14 minutes and BSV II over an hour); [08 s.4.5]'s fixed 30 to 90 s of driving with a calendar jump on exit as the only form (adopted for set pieces on long drives, rejected for mission 1, where the whole 1.3 km is drivable in about 4 minutes) |
| 13 | Pricing | Analytic from parametric records in integer mm, litres and cents; only hand digging is priced per voxel (1 voxel = 1 m3) | Per-voxel pricing of machine work: cost would depend on rasterization and on the 2 m fallback |
| 14 | Currency | **Decided by the owner 2026-11-09: nominal USD at 3.71 PLN/USD; PL par is the Polish design at Polish prices; the 1.61 price-level gap is its own labelled receipt line (see section 1 headline and 6.1).** Text below is the superseded recommendation, kept for the record. 2026 USD at civil-engineering PPP, 2.3 PLN/USD [11 s.5.3]; label "Polish practice at Bay Area input prices". Polish-anchored rates are stored in 2026 PLN and converted by one constant, so the basis is a one-line switch. **Contested:** the in-flight `sim/constants.ts` runs nominal (3.71) with the 1.61 price-level gap as a reform lever, citing an owner decision. The only record of owner input on this is second-hand: [11 s.6] opens "Added 2026-11-09 after the owner made Bay Area rail vs the Polish road-derived baseline the headline comparison. Hypothesis under test: the gap is about 20x", and concludes 20x is not supported like-for-like. That statement has two parts, a basis and a road-derived baseline, and neither says the price-level gap is something reform removes ([11] says no reform removes it). Open decisions 1 and 2 | Nominal FX baseline (not like-for-like; flavour toggle only) [06][11]; TCP 2025 PPP USD as primary basis (lands within 10%, kept as cross-check) [06] |
| 15 | SQ model | Scope as visible blocks + per-category institutional levers + time; no per-scenario fudge; unexplained residual printed on the receipt | One opaque 4.47 product; per-mission overrides (Portal 14x [06 s.7.5]); a 20x headline [11 s.6.5] |
| 16 | Portal mission | The real design (cut-and-cover + mined, 3-track) is the ghost and is buildable; a bored two-track tunnel is offered as a labelled what-if [08 rec. 9], driven with one Mainline 13 m EPB granted by the scenario (5.4): one drive, one breakthrough, two 25 kV tracks in a bore anchored on a real Polish machine | Pretending The Portal is a TBM job; no TBM until mission 2 (contradicts the brief); twin Metro bores for the what-if (two drives, and Caltrain bilevel EMUs under 25 kV in a 6.6 m bore are UNVERIFIED; kept only as the fallback if the M1 paper check of radius, cover and train box level fails for the 13 m bore). See open decision 4 |
| 17 | Currencies and meters | Dollars and political capital (PC). Client capacity is a prerequisite edge in the tree | Trust and capacity meters, ballot minigame, per-agency veto objects: deferred past v1 (no decision attached within 30 s of play) [07 s.5]. Reform side effects that [07 s.5] prices in trust or endorsements are re-expressed in dollars, PC or event odds (7) |
| 18 | Failure | None in the campaign; three star axes plus ghost; overrun is debt and is scored. Every hazard has a bounded dollar and calendar cost, and every stuck state has a priced way out (5.4) | Bankruptcy screens [08 s.3]; hazards with no stated loss; construction with no undo at all. Opt-in "Status Quo" hard mode is post-v1 |
| 19 | Demand | Scripted riders through M3 (campus branches from LODES job counts in reach); catchment model at M4; LODES OD on 2,048 m zones + binary logit + all-or-nothing promoted at M6 only if network-shape decisions need it (8) [09] | Agents, timetables/RAPTOR, gravity-only, H3 zones, 511 regional feed [09]; the full logit stack before any mission needs it |
| 20 | Campaign shape | Acts: The Portal and the first campus branch (Googleplex, mission 2); real projects; the campus loop; HSR. Missions bake their own corridors; whole-Bay W coverage and the R tier come last (M8). HSR Pacheco is an annex voxel strip outside the grid | PAX as mission 2 (the same SoMa tiles and the same verb as mission 1; now a side mission); campus lines only after the real projects; enlarging the grid (24 tiles per 4 km column [04 s.10]); HSR as a profile-only gateway (drops the boring fantasy) |
| 21 | Asset packaging | Loose content-hashed files, zlib stream (RFC 1950, `deflate` in `DecompressionStream` terms) inside the file, written by fflate in every stage, one `manifest.json` merged from stage manifests [10 s.4] | PMTiles/Range (Cloudflare Pages answers 200 to Range); brotli or zstd in-file (Chromium `DecompressionStream` rejects both); `node:zlib` writers (bytes depend on the zlib bundled with the Node build); Overpass or runtime map tiles in any path [01][10] |
| 22 | Pipeline tooling | Node 26 (exact version in `.nvmrc`) erasable TS + DuckDB (`@duckdb/node-api`) + `pngjs` + `proj4` + fflate. Beyond `pnpm i` the vector stage needs the DuckDB `spatial` and `httpfs` extensions, fetched once into a repo-local directory and pinned by version and sha256 in the lock file (3.4) | osmium, GDAL, tippecanoe, Python stages; unpinned `INSTALL` from the DuckDB extension repository (as built) |
| 23 | UI | DOM overlay, Preact + signals; canvas draws the world and world-anchored floaters only [10 s.2.4] | In-canvas UI, state libraries, ECS libraries (plain SoA tables instead) [10 s.2.3] |
| 24 | Citations | One typed registry: every model number is a `Constant { value, unit, source, verified }` (as built in `sim/constants.ts`); reforms, events and scenario figures carry an `evidence` or `source` string the same way. `pnpm check` fails on a displayed number that does not resolve in the registry, on every surface. The visible source or `verified: false` label is required on the receipt, scorecard and cards only | Discipline-only sourcing; a parallel `citations.json`; labels on HUD numbers, floaters and gauges (most gameplay constants are TUNING: the cockpit would be plastered) |
| 25 | Platform | Desktop Chromium is the gated platform. Safari and Firefox are v1 targets covered by structural smoke projects (WebKit and Firefox in Playwright: boot, codec, one dig, one pick, depth mode; no perf gates). If headless WebKit on macOS cannot create a WebGL2 context (UNVERIFIED), they fall back to a manual smoke per milestone by the owner. Mobile is not a v1 target | Touch UI, tablet tier; claiming three engines on Chromium-only gates |
| 26 | Delivery | Branch + PR; no deploy job; app and data deploy separately, on the owner's go [10 s.5] | CI deploy |
| 27 | Polygon source | Overture for buildings, water and land use: 80.5% of footprints carry height or floors against 19.5% in raw OSM, and the Bay is already closed inside the ocean polygons [01 s.4]. Rail, stations and roads stay raw OSM. Microsoft ML (560,577) and Esri (75,996) footprints are kept; the bake compares heights against a hand list of known towers | Raw OSM polygons (four of five footprints have no height); dropping ML footprints (holes in the suburbs; revisit only if they read badly in play, an open question in [01]) |
| 28 | Ground factors and base advance | One table: the [02 s.7.3] speed and cost factors for the six materials, re-based so Metro in dry SAND at tier 0 is 12 m/day (Robbins average over 46 machines [08 s.1]). ROCK depends on the shield: EPB 0.7 speed, 1.2 cost [02]; rock double shield 1.5, 0.9 [06 s.7.4]. Round-the-clock working is in the base for SQ and PL alike (5.4) | The [06 s.7.4] soft-ground factors (four classes, no FILL or STIFF_CLAY); the [02] factors on a 10.5 m/day base (two stacked discounts: 4 to 7 m/day where Central Subway averaged 13 to 16 [02 s.6]); 24/7 as an advance multiplier, x1.3 [06 s.7.4] or x1.68 [02 s.7.3] (breaks the utilisation cap and the same-rate rule) |
| 29 | Campus lines | Caltrain branches: 25 kV, mainline loading gauge, through-running to San Francisco, Mainline class (9.1) | Metro or Pod shuttle with a transfer (not "extending Caltrain"; stays available in Free Dig and as the Pod comparison in 7) |
| 30 | What the player pays | Your price: the scope built, at SQ levers less the reforms enacted. SQ and PL are bounds shown on the receipt; the HUD shows one number and one gap | Two cost modes with a restart (the in-flight `startScenario` regime switch stays as a debug toggle); dual price floaters on every stroke |
| 31 | Offline | A hand-written service worker, cache-first for the app shell and content-hashed data, from M2b, tested against `vite preview` (11) | The Cache API alone (cannot serve a reload or module requests); a PWA plugin or workbox (a dependency for about 50 lines) |
| 32 | Tunnel rate anchors | Metro bores on the Warsaw metro record; Mainline and Mega bores on the Polish large-bore contracts (6.3). Open decision 2 | One diameter exponent from the 6.3 m anchor for every size (DERIVED: prices the Łódź HSR tunnel at about 0.6x its contract) |
| 33 | Save versioning | Saves and scorecard URLs pin `simWorldVersion` per site: a hash of only the layers the sim reads (DEM, column class, scenario voids and no-dig volumes). Visual layers carry a separate `assetVersion` (3.5) | One `worldVersion` over every input (any rebake anywhere, including a far-raster layer or a new site, would invalidate every save) |

## 3. World and data

### 3.1 Frame

- World metres: x = east from grid origin, y = NAVD88 height, z = south (so north is -z). Grid x in [0, 81,920], z in [-98,304, 0]. Voxel (x, y, z) covers one metre cube. Lon/lat appear only in the pipeline and labels.
- Water: one plane; water occupies voxels with y < 1 (`SEA_LEVEL_M = 1`; MSL at NOAA 9414290 is +0.969 m NAVD88 [02 s.4.5]).
- Vertical data range: terrain -115 m (Golden Gate) to +1,173 m (Diablo), buildings to 326 m [04 s.2]. W materialises, per column, the band [ground - 96 m, max(ground + 32 m, building top)] (TUNING), so towers are never truncated where W punches its hole in the coarser tier; per-mission `yMin` override -128 m for Link21 (Transbay seabed to -29 m, tube to -41 m [02 s.4.3]).
- Annex sites (HSR Pacheco, M7) use the same UTM frame outside the grid (Gilroy at about x 95 km, n -20 km; east portal at about x 136 km; DERIVED from UNVERIFIED approximate coordinates in [05]). `ChunkKey` covers +/-262 km.

### 3.2 Tiers

| Tier | Cell / Y step | Representation | Loaded | Editable | Built from | Lands in |
|---|---|---|---|---|---|---|
| W work | 1 m / 1 m | 32^3 chunks (palette, uniform elided), generated on the main thread (as built: `getVoxel` is synchronous for sim and picking) from the site tile + strata function + stamps + dig deltas, under a per-frame generation budget (4.6); meshed in workers | 768 m square (24 x 24 chunk columns) around the focus: active machine or cursor (TUNING, from about 400 m radius in [04 s.9.1]) | yes | site tiles | M0 |
| C city | 4 m / 1 m | column patches of 32 x 32 columns in the chunk quad format (as built: `mesher/mesh-columns.ts`) | 4,096 m window | no | same site tiles | M2a (fog covers the W to F seam in the M1 slice) |
| R region | 16 m / 4 m | baked column tiles, 480 files of 256^2 | about 12 km radius | no | baked | M8 (fog hides the C to F seam until then) |
| F far | 64 m / 16 m | one baked raster, 1,280 x 1,536 columns | always | no | baked | M1 |

- W materialise rule: a chunk is generated and meshed if it intersects the surface band (terrain surface, building volume up to the building top, water surface), contains or abuts an edit, stamp or authored void, or lies on an active view mask. All other space is implicit: `materialAt()` over baked per-column strata fields. Chunks leaving the window are dropped and regenerate deterministically.
- Buildings in W and C: Overture footprints, area-majority fill, tallest wins, centroid cell forced [04 s.7]. Not diggable. Towers at or above 60 m (310 in the wide box [04 s.3]) carry a pile exclusion zone to rockhead or -30 m (TUNING; Millennium Tower piles stop at 18 to 27 m [02 s.6]).
- R and F carry terrain, surface class and a built-mass slab; towers at or above 60 m as individual prisms [04 s.7].
- Track, lining rings, trains, bridges, existing rail: meshes on vector geometry, drawn at every tier with a minimum pixel width [03 s.4][04 s.6]. Lining is never a voxel material. Columns never hold overhangs.
- C reflects open-sky excavations by lowering column heights; enclosed voids show at coarse tiers only through the overlay layer.
- Pre-declared fallbacks if a counter gate fails (4.6), each one constant, applied in this order and only as far as the failing counter needs: F and R vertical steps from cell/4 slabs to cubic (64 m and 16 m; slab steps cost 2x to 7x the quads of cubic ones [04 s.4.4]); C window 4,096 to 2,560 m; R radius 12 to 8 km; W window 768 to 512 m; `VOXEL_SIZE_M = 2`. The coarse tiers go first because they carry most of the quads and cost the player least; baked AO is no longer on the list because flat shading is the default (4.3).

### 3.3 Materials and strata

- Material ids are frozen in `packages/core/src/materials.ts` (append only): six geology materials FILL, BAY_MUD, SAND, ALLUVIUM, STIFF_CLAY, ROCK per [02 s.7.1], plus surface and building classes. To append: STATION_CONCRETE, HOARDING (dug, not yet built), EXISTING_STRUCTURE (no-dig), PILE_ZONE (no-dig). `wet` (below water table) and fault zone are flags, not materials.
- As built (v1): one column class byte per DEM node (unit in 3 bits, rockhead depth in 5 bits of 4 m steps) and `materialAt(surfaceHeight, depthBelowSurface, columnClass)` in `packages/core/src/assets/terrain.ts`, arithmetic only, shared by pipeline, world and sim. The unit comes from a terrain heuristic "without mapped geology" (`pipeline/src/far/classify.ts`: slope and height as a stand-in for bedrock, distance to water as a stand-in for the 1850s shoreline, a sand province box over San Francisco), with rockhead at 0.08 m per metre from rock [02 s.7.2].
- Hand overrides for mission corridors (Rincon Hill rock knob, Yerba Buena Island, Transbay Tube trench; all UNVERIFIED as geology [02 s.6]) are applied to the class byte at bake time. The Portal's overrides land with the M1 Portal data and author the class byte for the whole guide corridor, so the M1 slice and the M2 mission drive through one ground model and strata v2 does not move the Portal goldens (drive duration, cost, `simHash`, the rock section of the beat sheet).
- Target (v2, M2b): units rasterized from OFR 00-444 polygons [02 s.5.1] replace the heuristic outside the overrides. This bumps `simWorldVersion` once for each site whose class bytes change; goldens on those sites are regenerated in that PR and nowhere else. Water table depth per unit comes from the constants in [02 s.7.2] rule 7, so `wet` needs no extra data. Fault distance is a second per-node layer at M6.
- No open rockhead or Bay Mud thickness grid exists [02 s.1]. The boring-log UI labels strata "modelled, not boreholes".

### 3.4 Sources

Sources are recorded with checksums in the stage manifests today; from M0 all are pinned in `data/sources.lock.json` (url or query, sha256, bytes, license, fetchedAt) and a mismatch fails with one line naming the entry [10 s.4]. The lock pins local artifacts, not remote promises:

- Overture is a remote DuckDB query over many S3 parquet files, and old releases are withdrawn (retention period UNVERIFIED) [01 s.2]. At M0 the full game-box themes (about 460 MB [01]) are exported once with `ORDER BY id` to `data/raw/overture-2026-10-21.0/*.parquet`, and those files are what the lock hashes and what every later bake reads. Only four sites are extracted today, so this is time-critical.
- The Geofabrik file `norcal-261108.osm.pbf` is a rolling snapshot (retention UNVERIFIED); the copy in `data/raw/` is the pinned input.
- `data/raw/` is gitignored and about 1.2 GB. Losing it makes the whole-Bay bake (M8) irreproducible, so the owner archives it once outside the repo (owner task, section 13).
- DuckDB extensions (`spatial`, `httpfs`) are installed into a repo-local `data/duckdb-ext/` (`SET extension_directory`), with version and sha256 in the lock; if one is missing and the network is off, the stage fails with one line naming the extension. As built, `vectors/db.ts` runs a bare `INSTALL`, outside the lock and the 7-day cooldown.
- [01] validated the SQL on DuckDB CLI 1.5.5; the pipeline runs `@duckdb/node-api` 2.0.0-r.1. The opt-in `pnpm data:verify` asserts the `ST_ReadOSM` row counts on the real PBF against the [01 s.3] numbers.

| Layer | Source | Measured | Used for |
|---|---|---|---|
| Rail ways with node ids, stations (nodes + way/relation centroids), stop positions, platforms, route relations, major roads | Geofabrik `norcal-261108.osm.pbf`, 655,544,424 bytes, via DuckDB `ST_ReadOSM`; running lines = `service IS NULL` | 38 s end to end [01 s.3] | rail graph, existing lines, roads |
| Buildings with height, water (ocean polygons already contain the Bay), land use (decision 27) | Overture `2026-10-21.0` GeoParquet on S3, archived locally at M0 | 1,856,874 buildings in the game box, 83% with height [04 s.3]; 226 s remote [01]. Height provenance per feature and accuracy outside San Francisco are UNVERIFIED [01 s.4]: the bake prints modelled against published height for a hand list of towers (list to author) | surface |
| Elevation + bathymetry | AWS terrarium PNG: z14 for site tiles (2,000 tiles for the box), z12 for F and R (130) [04 s.9.4]; never z10 or below under water [02 s.4.1] | 184 ms per tile uncached [02 s.4] | terrain, seabed |
| Planned projects for the atlas (M3) and mission seeds | OSM `railway=proposed` and `construction` ways: 109 proposed ways, 265.6 km in the PBF, among them CAHSR 65 ways and 103.9 km (relations 15570754 and 9466656), BSV II 16 ways, Valley Link 2 ways and 14.8 km, Eastridge 6 ways and 7.6 km, The Portal one 2.1 km way [01 s.3] | | project atlas (9.3), seeds for missions 1, 4 and 7 |
| Jobs near campus stations (M3) | LODES 2024 WAC block counts only (no OD) [09 s.1.1] | | scripted riders for campus branches (9.1) |
| Surface geology + liquefaction (M2b; not ingested yet) | USGS OFR 00-444 `sf-qpys.shp`, 19.7 MB, 13,827 polygons [02 s.5.1]. Reader: DuckDB `ST_Read` (UNVERIFIED on this file), fallback an in-repo SHP/DBF polygon reader | | strata v2 |
| Faults (M6) | USGS Qfaults REST layer 21, two paged requests, 2,800 features [02 s.5.2] | | fault flag |
| Homes, jobs and home to work flows (M4) | LODES 2024 RAC, WAC and crosswalk for the catchment model; `ca_od_main_JT00` (98 MB gz) and aux only if the logit is promoted (8) [09 s.1.1] | | demand |
| Existing service (M4) | Per-agency GTFS (BART, Caltrain, Muni rail, VTA rail), reduced to stop sequence + headway + run time; never the 511 regional feed [09 s.1.3] | | baseline network |
| Mission geometry, voids, existing-tunnel depths, utilities corridors, geology overrides | Hand-authored in `packages/scenarios/data/` (ours, kept as a separate layer for ODbL) | | missions |

OSM has no vertical data (2 of 12,370 rail ways carry `ele`; `layer` is stacking order) [01 s.3]. Existing-tunnel depths are a hand-authored table per tunnel group, flagged approximate in the inspector; only mission corridors need entries. The Transbay Tube maximum (41 m below sea level) is the one sourced value [02].

### 3.5 Pipeline

As built: two stages, `pnpm data:build:terrain` (terrarium z12 and z14 to the far raster, site DEM tiles and column classes) and `pnpm data:build:vectors` (Geofabrik PBF and Overture through DuckDB to the rail network, far vector layers and site vector tiles), each writing a stage manifest (`manifest.terrain.json`, `manifest.vectors.json`) with sources, hashes and spot checks. Sites are declared in `packages/pipeline/sites.json` (centre + size; a site is a square of 2,048 m tiles). Raw downloads live in `data/raw/` (gitignored).

Rules for every stage: a pure function of (inputs, params, code hash); byte-reproducible (sorted iteration, `ORDER BY` on every export, no timestamps, fflate as the only compressor: as built the vector stage uses `node:zlib`, whose bytes follow the Node build); fails with one line naming the offending tile or URL; a tile whose bytes or feature count fall outside declared bounds fails the bake, nothing is truncated [04 s.9.4]; the SQL shape and the DuckDB gotchas are in [01 s.3].

Versions. The manifest carries two kinds, never one hash over everything:

- `simWorldVersion` per site: hash of the layers the sim reads (site DEM, column class with overrides, scenario voids and no-dig volumes). Saves and scorecard URLs pin it.
- `assetVersion`: hash of everything else (vectors, far raster, R tiles, rail overlay). Changing it never touches a save.
- On a `simWorldVersion` mismatch a load refuses with one line naming both versions and offers a replay: the save's command log is re-run on the current world and the cost, date and hash differences are shown before the player accepts. A scorecard URL with an old version shows its stored figures labelled with that version.

To add, in order: `data/sources.lock.json`, the local Overture archive, pinned extensions, fflate in the vector stage and hash-keyed stage caching (M0); a measured bake of one 4 x 4 block of suburban tiles and one of open water, to replace the single-site size extrapolation (M1); the merge stage that writes one `manifest.json` (`WorldManifest`) with both versions (M2a, when saves first need it); `strata` v2 from OFR 00-444 (M2b); the project atlas and WAC job counts (M3); `demand` (M4); mission corridors as each mission lands; `region` R tiles and whole-Bay site tiles (M8).

### 3.6 Asset formats and sizes

Binary layouts and decoders are defined once, in `packages/core/src/assets/{terrain,vectors}.ts` (zero dependencies, inflate injected), and versioned by a format version per kind. Compression is a zlib stream inside each file, decoded in a worker with native `DecompressionStream('deflate')` or fflate; the codec round-trip test must also run in Chromium, because Node accepts brotli and Chromium does not [10 s.4].

| File (as built unless marked) | Content | Size |
|---|---|---|
| `sites/<site>/dem_<tx>_<ty>.<hash>.bin` | One 2,048 m site tile: 257 x 257 nodes at 8 m (the honest ceiling of the source [04 s.9.2]), Int16 heights in 0.1 m, predictor-coded, plus the column class byte | 15 to 36 kB each (MEASURED, 21 tiles) |
| `sites/<site>/<tx>_<ty>.vectors.<hash>.bin` | Layers buildings, buildingParts, roads, water, landuse; 0.25 m quantization, varint deltas | up to 220 kB in SoMa (MEASURED); bake bound 400 kB (TARGET) |
| `far/terrain.<hash>.bin` | 1,280 x 1,536 cells at 64 m: mean height, column class | 1,795,134 bytes = 7.3 bits per cell (MEASURED) against the 4 bits [04 s.9.2] estimated. Cause to confirm at M1: heights are stored in 0.1 m although the tier is meshed in 16 m steps. Fix: store this raster in 1 m units (the header already carries height units per metre), expected about 3 to 4 bits per cell (DERIVED, to be measured). Bound 2 MB with the M1 layers included; if the measured file misses it the bound becomes 3 MB and the boot budget (6 MB) is rechecked, nothing is dropped silently |
| `net/rail.<hash>.bin` | Existing rail for the whole grid: tracks, stations, routes, route stops | 229 kB; 5,516 tracks, 532 stations, 85 routes (MEASURED) |
| `net/far.<hash>.bin` | Light region-wide layers: water, highways, places | 124 kB (MEASURED) |
| `region/<rx>_<rz>.<hash>.bin` (M8, to add) | 256^2 columns at 16 m: height at 4 m quant, class, built mass, tower prisms | 20 to 30 MB total, bake bound 64 kB per tile (DERIVED: the 10 MB and 21 kB of [04 s.9.2] scaled by the far raster's measured-to-estimated ratio) |
| `demand/<name>.<hash>.bin` (M4, to add) | RAC/WAC at 512 m for the catchment model; zone table, sparse OD (u16 o, u16 d, u16 flow) and car minutes u8 only if the logit is promoted (M6) | 1.3 MB OD gz at 2 km zones [09 s.1.1]; bound 3 MB (TARGET) |
| `manifest.json` (M2a, to add) | `WorldManifest` (`core/manifest.ts`, extended additively): versions, frame, file table with sha256, sources, attribution | small |

To add to the far raster at M1: surface class and built mass per cell, and tower prisms at or above 60 m, so the skyline and land use read at regional zoom [04 s.7]. Building footprints must be Hilbert-sorted before encoding (unsorted costs 47% more [01 s.6]).

- Whole Bay (M8): 1,920 site tiles + 480 R tiles. Bound 150 MB hosted (TARGET). The basis is thin: [04 s.9.2] estimated 110 to 130 MB with brotli (in-file deflate measured 5% larger on buildings [01 s.6]) and 16 kB per site DEM, where the bake measures 15 to 36 kB; the nine `portal` tiles average 104 kB each, which with about 40% of tiles being water lands near 120 MB of site tiles, plus 20 to 30 MB of R tiles: at the bound, not under it (DERIVED from one dense site). The M1 suburban and open-water block bake replaces this extrapolation before M8 is planned. Inside Cloudflare Pages free limits (20,000 files, 25 MiB each) [10 s.5].
- Coverage today (MEASURED): site `portal`, 3 x 3 site tiles (tx 9 to 11, ty 30 to 32; 6,144 m square; 0.94 MB in 18 files; 19,146 buildings), which covers 4th and King, Townsend, Second, the Salesforce Transit Center and 22nd Street; sites `googleplex` (tx 23 to 24, ty 12 to 13), `meta` (tx 20 to 21, ty 15 to 16) and `oracle` (tx 15 to 16, ty 17 to 18), 2 x 2 each. Whole bake: 3.9 MB. Each mission adds its own corridor; M8 = all.
- Committed to git: `data/fixture/` only (to add at M0), in two halves, 3 MB together (TARGET, set from measured files once cropped):
  - Extract-stage inputs for one site tile (the 2,048 m tile containing 4th and King): small Parquet extracts written by a one-off script with `ORDER BY` (DuckDB cannot write `.osm.pbf` and osmium is excluded, so the fixture boundary sits after `ST_ReadOSM`) plus the z14 terrarium PNG tiles that tile needs, with goldens for the pipeline tests [10 s.8.1]. Bound 1.5 MB.
  - Baked `portal` site (0.94 MB), the rail file (0.23 MB) and a far raster cropped to a window around the site, so sim and e2e tests need neither network nor a bake. Bound 1.5 MB. The full 1.80 MB far raster is not committed.
  - Pipeline goldens run in `pnpm check:slow`, not in `pnpm check` (11); the `ST_ReadOSM` path is tested only by `pnpm data:verify` against the real PBF. Everything else builds into `apps/game/public/data/` (gitignored).
- Boot download: bundle + far raster + rail + first site within 6 MB (TARGET; [04 s.9.3] estimates 3 to 4 MB boot plus 1 to 2 MB for the first site).
- Offline (M2b, decision 31): a hand-written service worker serves the app shell and content-hashed data cache-first, so a reload with the network off works for every tile already visited (always-online is the top Subway Builder complaint [08 s.2.1]). The Cache API alone cannot do this: it does not answer navigations or module requests. The Vite dev server does not behave like the build here, so the offline test runs against `vite preview`.

### 3.7 Licensing and attribution

- OSM and Overture layers are ODbL. Rendered output is a Produced Work; shipped geometry files are treated as a Derivative Database (classification of baked game assets is UNVERIFIED; conservative reading) [01 s.7]. Compliance: the open, reproducible pipeline is "the method of making the alterations"; ship `DATA_LICENSE` and `ATTRIBUTION.md` beside the assets. This assumes a public repo (open decision 10).
- Authored layers stay ours as a Collective Database as long as a feature type is all-OSM or all-ours [01 s.7]. Hand edits to OSM geometry are share-alike.
- Credits screen and legible splash credit per the OSMF game guideline [01 s.7]: OpenStreetMap contributors; Overture Maps Foundation and its listed sources; USGS 3DEP, SRTM, GMTED2010 and NOAA ETOPO1 text from [02 s.3]; USGS OFR 00-444; USGS Qfaults; Census LEHD citation template [09 s.1.1]; SFMTA notice text; Caltrain [09 s.1.3].
- Blocked until read by a human: BART and VTA GTFS terms, the 511 data agreement, the Transit Costs Project dataset licence [06][09]. Until then BART and VTA lines use OSM geometry with hand-authored headways, and no TCP rows are bundled.

## 4. Rendering and engine architecture

### 4.1 Stack (pinned; versions as installed in the repo on 2026-11-09)

| Layer | Package and version |
|---|---|
| Runtime and tooling | Node >= 26 in `engines`, exact version to pin in `.nvmrc` at M0, pnpm 11.21.0 (`minimumReleaseAge` 7 days, strict: pins must be at least 7 days old [10 s.1]), TypeScript 7.0.2 (`erasableSyntaxOnly`), Vite 8.3.5 |
| Lint, test | @biomejs/biome 2.6.4, Vitest 5.1.0, @playwright/test 1.64.1 (projects as built: `gpu`, `swgl`, both the Chromium headless shell; to add: `webkit`, `firefox`, `preview`, section 11); `scripts/repo-lint.mjs` (U+2014 ban, nondeterminism ban in sim) |
| Render | three 0.187.0, camera-controls 3.1.2 |
| Workers, IO | comlink 4.4.2, fflate 0.8.3, idb-keyval 6.3.0 |
| UI | preact 11.1.1, @preact/signals 2.11.4, lil-gui 0.21.0 (debug only) |
| Pipeline | @duckdb/node-api 2.0.0-r.1 with the `spatial` and `httpfs` extensions pinned in the lock (3.4), pngjs 7.0.0, proj4 2.22.0, fflate 0.8.3 |
| Offline (M2b) | one hand-written service worker, no library |
| To add at M2 | valibot 1.5.0 [10 s.3.5] for save and scenario validation |

### 4.2 Runtime shape

```
input (DOM) -> actions -> tools -> Command[] ----------------.
                                                             v
ui (Preact signals) <- SimSnapshot <------------- sim.step(commands) -> TickOutput { events, edits }
audio, floaters, camera beats, test hook <- events (app fans out)      fixed tick, no DOM, no three
                         sim reads the ground through GroundQuery ^    |
                                                                  |    v  edits, applied before the next step
render (three) <- region buffers <- mesher workers <- world (generator + stamps + dig deltas)
               <- column regions <- column mesher workers <- site tiles / R tiles / F raster
               <- infrastructure meshes <- parametric records
```

- Fixed-timestep accumulator; speed changes ticks per frame, never `dt`; frame time clamped; sim paused when the tab is hidden [10 s.3.1, s.10.4].
- Determinism rules per [10 s.3.1]: no `Math.random`, `Date.now`, `performance.now` or transcendental `Math` in state-affecting code. Headings are integers (1/65,536 turn) with a sin/cos table, and a driven front carries sub-unit yaw and pitch accumulators (2^-32 turn) so curvature is clamped on the accumulated value: one heading unit is 9.6e-5 rad, which at R 500 m would round to zero whenever a tick advances less than 48 mm (DERIVED). Cost exponents are precomputed per machine class in data.
- The sim and world seam, frozen in `core` by the contracts steps of M0.5 and M1 (10.2, 11):
  - Sim owns the stamp list (it is sim state and is saved). `step` returns the tick's `WorldEdit`s (add, grow or remove a stamp; hand digs); the app applies them to the world, in order, before the next step. Headless runs use the same loop.
  - Sim never sees a chunk store. It reads the ground through an injected `GroundQuery` (`materialAt`, `isNoDig`, `firstVoid`), defined as generator + scenario voids and no-dig volumes + stamps + deltas, so results never depend on which chunks are resident. The world package implements it; `testkit` implements it over a synthetic column source, so cost and breakthrough tests need no chunk store and no site bake. The dependency of `sim` on `world` goes away.
  - Events are returned by `step` as an immutable per-tick array. Nothing drains: the app hands the same array to audio, floaters, camera beats and a tick-indexed ring buffer that the test hook reads by cursor.

### 4.3 Chunks and meshing

- Chunk coordinates, packed quad format (8 bytes: x, y, z 6 bits; w-1, h-1 5 bits; face 3; material 10; AO 8; flags 14) and the mesher contract are frozen in `packages/core/src/{chunk,mesh}.ts`.
- Mesher: binary greedy with 32-bit column masks; the two border bit planes of the 34^3 padded input are handled separately (the benchmark in [03 s.5.2] skipped borders). Per-worker scratch, exact-size transferable output.
- Shading: flat-merged quads (`meshChunkFlat`, as built) plus edge darkening in the fragment shader [03 s.5.4]. Baked AO in the merge key is rejected on measurement: `packages/mesher/src/mesh-chunk.bench.ts` on 2026-11-09 gives 1,056 quads with AO against 537 flat on a 32^3 heightmap chunk (+97%) and 535 against 296 as the mean over a 4 x 4 chunk world (+81%) (MEASURED, synthetic terrain), far past the 30% this plan allowed. The 8 AO bits of the quad format stay reserved. M0 reruns both counts on the real `portal` site and records them here; AO comes back only as a per-face lookup outside the merge key, and only if the flat look fails the owner's eye at M0.5.
- Draw batching (M0 baseline, own work package): chunk meshes are copied into 4 x 4 x 4-chunk region buffers (128 m cubes) updated per chunk slot with `bufferSubData`, the slot stored in reserved flag bits [03 s.5.3]; one instanced draw per region, frustum-culled per region. The `ChunkRenderer` interface does not change. One draw per chunk (as built in `ChunkScene`) cannot meet the budget: 24 x 24 = 576 W surface chunks before towers, water and excavations, 1,024 C patches, 1,920 F patches and about 1,700 R patches are 3,500 to 5,200 draws (DERIVED), and `e2e/tests/world.spec.ts` already pins 500 draws at 549 chunks on the synthetic world. Batched design point (DERIVED): W 36 to 72 regions, C 64 to 130, F 120, R about 110, plus water, cap and overlay: 350 to 450 draws with all four tiers, 240 to 330 before R lands.
- Direction buckets: quads inside a region slot are kept in six face-direction ranges, so a region could skip the ranges facing away from the camera, which [03 s.5.3] counts on to roughly halve submitted quads. They are enabled only if they cost no draws, that is through one multi-draw per region. Instanced multi-draw with a per-range base instance is not core WebGL2, and `WEBGL_multi_draw` is UNVERIFIED in Safari and Firefox by this research, so the batching work package proves one route on Chromium, WebKit and Firefox (vertex pulling from an integer data texture with `multiDrawArraysWEBGL`, or instanced multi-draw where the base-instance extension exists) and records the result here. Until then every budget assumes no buckets.
- Coarse tiers reuse the chunk quad format (as built): the column mesher emits 32 x 32-column patches in vertical slabs of 32 steps and the renderer scales a patch by (cell, Y step, cell). Class AIR marks the hole where the finer tier takes over; a lower border column produces a skirt. One quad path, one shader. Patches batch 4 x 4 into regions under the same rule as chunks.
- Look: 256-entry palette texture, world-space procedural detail in the fragment shader, distance fog tinted to sky, one sun + hemisphere term, no shadow maps in v1, up to 8 point "work lights" as uniforms (TBM headlamp, station lamps) so tunnels glow. No texture atlas [03 s.5.3].
- Picking: CPU DDA against chunks, then column heights, then the F heightfield. No BVH [03 s.7].

### 4.4 Underground view

- Horizontal cut (as built): fragments above `cutY` inside `cutRadius` of the focus are discarded; one cap quad samples a material-id texture filled from the voxel layer just below the cut, so the section shows strata and voids without remeshing (`render/cap.ts`, the [03 s.8] pick). State is exposed through `window.__game.view()`.
- Vertical ant-farm cut (M1, to add): a view mask that follows the alignment. The mask is a polyline in the XZ plane (the driven or planned alignment; two points for a free cut in Free Dig), a lateral offset, a side and a radius around the focus. With a mask set (`setViewMask`), `paddedCopy` writes AIR for every column whose signed lateral distance to the polyline is past the offset on the camera side, inside the radius, so the mesher emits real strata-coloured faces on a stair-stepped but continuous section wall along a diagonal or curved drive. Sim and saves never see it. An axis-aligned plane cannot do this in SoMa, where the street grid and the Townsend and Second drive run about 45 degrees off the UTM axes (decision 7). This view is where depth decisions are made: it shows the fill, the mud and the clay under it.
- Mask cost and budget. Radius 192 m (TUNING, the same idea as `cutRadius`): the wall inside it is up to 384 m long, about 12 chunk columns x 4 layers = about 50 chunks (DERIVED). Those are mostly underground chunks that were not materialised, and generation is synchronous on the main thread: 0.22 to 0.25 ms per chunk on the M1 Max (`chunk-store.bench.ts`, MEASURED), plus one 79 kB `paddedCopy` per remesh. So: `setViewMask` returns only the chunks whose masked voxel set changed; they are generated under the per-frame generation budget, meshed nearest to the camera first, and uploaded under a mask allowance of 16 chunks per frame, separate from the streaming cap (4.6). The handle snaps to 4 m while dragging and 1 m on release. A 4 m step is complete within 4 stepped frames (TARGET, counted in frames from hook counters, not milliseconds); the wall appears near to far. A step inside the same 32 m layer dirties the same chunks again, which is why the budget is per step, not per drag.
- C, R, F fade with a dithered discard on the camera side of an active vertical cut.
- X-ray (as built): the overlay layer (rail lines, alignments, stations, machines) can draw through terrain, so the network is visible from the surface [03 s.8].
- Profile panel (M4): Canvas 2D longitudinal section with ground line, strata, water table, existing tunnels and the alignment; the primary vertical editor for planned lines [03 s.8].

### 4.5 Precision and depth

- Sim and world: int32 voxel coordinates; alignment lengths in mm. Render: chunk-local integer vertices, region origin minus `renderOrigin` computed in float64 on the CPU, rebase when the camera moves more than 4,096 m [10 s.10.1]. The `portal` site sits about 68 km from the grid origin (DERIVED), so precision is exercised from the first real tile.
- `reversedDepthBuffer: true`, near 0.5 m; `logarithmicDepthBuffer` if `EXT_clip_control` is missing [10 s.10.1]. Availability of `EXT_clip_control` in Safari and Firefox is UNVERIFIED, and the logarithmic path on a custom `ShaderMaterial` needs the logdepth shader chunks and writes `gl_FragDepth`, which gives up early Z on about a million quads. The depth mode actually selected is reported by `stats()` and asserted per engine in the smoke projects (11); if an engine lands on the logarithmic path, its frame cost is measured once before the engine is called supported.

### 4.6 Budgets

Reference class: Apple M1 Air or Intel Iris Xe, 1080p, DPR 1 (TARGET, no in-browser measurement yet [03 s.6]). Gates run on deterministic counters from `window.__game.stats()`; wall-clock numbers are reported and gated only on the hardware `gpu` Playwright project (`--use-angle=metal --enable-gpu`, measured to give hardware Metal [10 s.8.2]). The `gpu` project fails loudly if it gets SwiftShader.

| Budget (TARGET unless tagged) | Value | Instrument | Src |
|---|---|---|---|
| Quads drawn: quads in regions that pass per-region frustum culling, all tiers, no direction buckets | <= 1.0M | `stats().quadsDrawn` (to add to `RenderStats` now; today it has only `triangles`, and `quads` is optional in `GameStats`) | [03 s.6] |
| Draw calls | <= 500; design point 350 to 450 (4.3) | `stats().drawCalls` | [03 s.6] |
| Resident 3D chunks | <= 3,000 | `stats().chunksLoaded` | [03 s.6] |
| GPU geometry | <= 64 MB | `stats().gpuBytes` | [03 s.6] |
| App-owned memory: typed-array bytes by owner (chunks, meshes, caches), chunk count, cache entries | <= 400 MB | `stats().bytes`, the app's own accounting | plan |
| JS heap | <= 200 MB after a forced GC | CDP `HeapProfiler.collectGarbage` then `Performance.getMetrics` `JSHeapUsedSize`, `gpu` project only (`performance.memory` is quantized and excludes most ArrayBuffer stores; `measureUserAgentSpecificMemory` needs the cross-origin isolation this plan rejects) | [03 s.6], split here |
| W chunk generation on the main thread | <= 16 chunks per frame (about 4 ms at the measured 0.25 ms) | `stats().chunksGeneratedLastFrame` | plan; bench MEASURED |
| Main-thread mesh upload, streaming | <= 8 chunks per frame | hook counter | [03 s.6] |
| Mesh upload, view-mask allowance | <= 16 chunks per frame; a 4 m mask step complete in <= 4 stepped frames | hook counter | 4.4 |
| Dig edit to pixels | <= 2 frames | hook counter | [03 s.6] |
| Streaming coverage on a camera path | no uncovered region for more than 30 stepped frames | hook counter at a fixed stepped rate | plan |
| Sim cost per reference script | exact budgets in ticks, `materialAt` calls, voxels written and chunks generated, stored beside each script | counters in the script runner | plan |
| Demand recompute | integer, hash-stable output; cost gated on zone-pair evaluations | counter | [09 s.7] |
| Boot transfer | <= 6 MB | Playwright network log | 3.6 |

Reported by `pnpm bench`, never gated in `pnpm check` (wall-clock numbers flake when parallel agents load the machine): chunk mesh in a worker (target 0.5 ms [03 s.5.2]), ten game years headless (87,600 ticks, target 2 s in Node), each reference script (target 2 s), demand recompute (target 300 ms in a worker; 0.17 s measured at tract scale [09 s.7]), `pnpm check` itself (target 30 s for the fast tier; pipeline goldens and the 1,000-seed property suites run in `pnpm check:slow`).

Quad accounting (DERIVED from the per-column ratios of [04 s.9.3]; loaded, before culling):

| Tier | Columns | Quads | Note |
|---|---|---|---|
| W, 768 m window | 0.59M | 0.12M to 0.75M | The research disagrees with itself: about 0.2 quads per column in [04 s.4.3, s.4.4], 0.9 in [04 s.9.3], 1.3k per chunk in [03 s.6]. Measured on the `portal` site at M0, flat-merged, including the SoMa worst case (the 768 m window centred on the Transit Center, towers to 326 m: chunks and quads from a real count) |
| C, 4,096 m window | 1.05M | about 0.68M | |
| F, whole grid | 1.97M | about 0.6M | 3x to 4x fewer with cubic steps |
| R, 12 km radius (M8) | 1.77M | about 0.8M | same |
| Total | | 1.4M to 2.0M before R; 2.2M to 2.8M with R | |

The "frustum culling removes two thirds" assumption of [04 s.9.3] does not hold for the default orbit camera at 15 to 45 degrees of pitch, which sees all of W, most of C and a sixth to a quarter of F and R: 1.0M to 1.6M drawn (DERIVED). The upper half of that range is over budget, so the 3.2 ladder is expected to be used, starting with cubic F and R steps. A synthetic F + C + W scale probe on the `gpu` project measures this during M1, before C is wired into the app at M2a.

The proxy gap between the M1 Max test machine and the reference class is UNVERIFIED; one manual run of `?bench=soma-orbit` on a real mid-range laptop replaces the assumption (owner task, section 13).

## 5. Gameplay

### 5.1 Loops

- 5 to 30 s: hold the face gauge in band with the thrust level, pick a depth, set the curve that clears the next obstacle, punch through.
- 5 to 15 min, one project: launch pit, drive, station boxes, open, ride, scorecard.
- Hours, campaign: scorecards pay political capital and Savings; spend on reforms, tech and machines; the next corridor unlocks on the same map.

### 5.2 Verbs

| Verb | Input | Feedback | Lands in |
|---|---|---|---|
| Dig | Hold LMB with a brush (sphere 1 to 5 m, or box drag). In missions, pits and boxes are prefab outlines the drag snaps to | Voxels pop, fresh faces show HOARDING, the running cost ticks. Per-stroke price floaters appear only after the receipt has been introduced (5.8) | M0 |
| Drive | Click a machine to possess: thrust level 0 to 4, curve detent, grade detent, cruise toggle | Face gauge, wear gauge, advance, projected path on the plan inset | M0.5 (toy), M1 |
| Retract | On a possessed or stuck machine: retract to ring N, or abandon and relaunch (5.4) | Tail backfills, cost and months shown before confirming | M1 |
| Place | Pick a prefab (launch pit, station box, platform, entrance, vent shaft), click | Ghost preview with volume and price; snaps to track | M1 (pit outline), M2a |
| Reform | Play a card or tree node | A named receipt line drops and something in the world changes | M2a (one card), M2b (five), M3 (tree) |
| Open | Cut the ribbon when track is continuous between two stations and the works backlog is zero | Train runs, the camera rides it through the bore, riders counter, scorecard | M2a |
| Probe | Click ahead of the face ($50k, TUNING) | Reveals one boring-log column; unknown ground is drawn desaturated | M2b |
| Plan | Click waypoints on the map, set depth per waypoint, pick a method per segment; later drag depth handles in the profile panel | Curve radius and grade warnings, estimate at your price; becomes the cruise guide | commands exist in `sim` (M0); map tool and profile panel M4 |

When digging by hand the tool is the method: brush from open sky is cut-and-cover, brush from an existing void is mined. Planned segments carry an explicit method (bored twin, bored single large, cut-and-cover, mined, at-grade, viaduct, as built in `sim/types.ts`); a possessed machine bores.

Permanence and undo. Planning is undoable. A hand dig stays HOARDING and can be undone at full refund until the backlog starts draining it; after that it is permanent and says so [08 s.3]. A bored drive is undone only through Retract, which costs money and months. A mission pit is an outlined volume: the box drag snaps to the outline, a progress bar fills, the pit auto-finishes at 80% and shows "pit ready". Freehand digging stays the toy for Free Dig and for station tweaks; a pit for a 13 m machine is on the order of 15 x 40 x 25 m and is not a job for a 5 m sphere.

### 5.3 Time

- Global speeds: pause, 1 day/s, 1 week/s, 1 month/s.
- Possession scale is a per-mission constant in the scenario record (`possessionScale`, game hours per real second), derived from the experience and not the reverse: a first drive lasts 180 to 300 real seconds (TARGET) and the player meets an event at least every 30 s (5.8 event table). The clock runs only while the shield advances or a stoppage plays.
- Seconds of possession per kilometre = 24,000 / (advance in m/day x scale). At scale 20 (DERIVED from the rates in 5.4):

| Face | Metro (12 m/day base) | Mainline, Mega (10 m/day base) |
|---|---|---|
| STIFF_CLAY (x1.2) | 83 s/km | 100 s/km |
| SAND, dry (x1.0) | 100 | 120 |
| ALLUVIUM, wet (x0.8) | 125 | 150 |
| ROCK with an EPB shield (x0.7) | 143 | 171 |
| BAY_MUD (x0.6) | 167 | 200 |
| FILL (x0.4) | 250 | 300 |

- Mission 1: 1.3 km with the Mainline EPB through BAY_MUD, SAND and the Rincon Hill rock, mixed faces at the transitions: about 220 s at scale 20 (DERIVED; the scale is recomputed from the authored strata at M1 and stored in the record). The old global 1 s = 6 h put the same drive at 11 to 14 minutes.
- Long drives are set pieces [08 s.4.5]. From Act II the scenario record lists `setPieces[]` (launch, each hazard zone, each station approach, breakthrough), each 30 to 90 s of possession at the mission's scale; between them the drive lapses under cruise at whatever rate keeps the whole drive under 5 real minutes (TARGET). BSV II (8 km at about 8 m/day, 1,000 game days) and Pacheco (21.7 km of rock) are never driven end to end by hand; mission 1 is, because it is short.
- Lapses. No lapse is longer than 15 s of real time whatever the game duration, and any lapse over 5 s has a job: place entrances and vent shafts while the backlog drains, or ride the camera through the lined tunnel while track lays. Tested: no stretch over 15 s without accepted input in the reference script.
- Hand digging is instant for the player and adds crew-days to a works backlog (cut-and-cover 400 m3 per crew-day, TUNING; mined 2.5 m/day per face [11 s.5.3]). The backlog drains during drives and lapses; HOARDING turns to concrete as it drains. Opening requires backlog zero.
- Pre-construction is a stack of binder tokens on the launch pit (6.5; the phases planning, permitting, procurement and utilities in `sim`). Pressing Build plays a lapse while the date spins and the escalation line grows on the receipt. Reforms delete or shrink binders. Mission 1 presents the stack after the first drive (5.8): during that drive the HUD counts drive days, and the calendar is assigned when the lapse plays (launch date = start + stack). The total is the same because binders and construction are sequential; only the order of presentation changes. From mission 2 the binders come first.

### 5.4 TBM mechanics

A machine is a class (size) and a shield (type). Diameters are anchored on real machines; radius, grade and Pod figures are TUNING.

| Class | Bore | Carries | Anchor | Min radius | Max grade | Base advance, tier 0, dry SAND |
|---|---|---|---|---|---|---|
| Pod | 4.0 m | one guided pod lane; no train fits; 1,355 passengers per hour observed peak (4,400 in a test) [06 s.6.5] | Loop tunnels about 3.7 m ID (UNVERIFIED) [06 s.6.2] | 60 m | 6% | 15 m/day (LVCC conventional small EPB [06 s.6.3]) |
| Metro | 6.6 m | one metro track. Mainline EMUs under 25 kV in this bore are UNVERIFIED and not allowed | Warsaw 6.3 m, Central Subway 6.3 m machines in nominal 20 ft tunnels [02 s.6][06 s.6.2]; 6.6 m excavated in [11 s.5.1] | 150 m (Central Subway drove a 137 m curve [02 s.6]) | 5% (Central Subway 7% [02 s.6]) | 12 m/day = 30 x 0.40: Robbins average over 46 machines [08 s.1]; Warsaw 10 to 12 [06 s.6.3] |
| Mainline | 13.0 m | two mainline tracks under 25 kV: Caltrain, the campus branches, HSR at conventional speed | Łódź HSR tunnel, about 14 m, two tracks, 160 km/h [06 s.2.3]; Świnoujście 13.46 m, curve about 300 m [11 s.3.1] | 300 m | 3% | 10 m/day (DERIVED: the 8 m/day mean of 12 to 15 m machines was measured in saturated sand and silt [11 s.5.3]; 8 / 0.8) |
| Mega | 16.2 m | two tracks + platforms inside the bore | BSV II, 53 ft = 16.15 m [05 s.3.3] | 500 m | 3% | 10 m/day, so 8 in wet ALLUVIUM; BSV II plans 9 to 11 [02 s.6] |

| Shield | Unlock | Ground | Wrong ground |
|---|---|---|---|
| EPB | tier 0, every class up to Mainline | any soil on land, above or below the water table, at the table factors below. EPB is the listed machine for alluvium, clays and Bay Mud at moderate depth [06 s.6.1]. FILL in the face is legal but slow, dear and full of obstructions ([02 s.7.3]: "do not bore"), so pits put the axis below the fill | under open water: refused. In ROCK: 0.7 speed, 1.2 cost, wear |
| Rock double shield | tier 1 (standard product [06 s.6.6]) | ROCK only: 1.5 speed, 0.9 cost [06 s.7.4] | a soil face: advance x0.3 and a stoppage card [06 s.7.4] |
| Slurry / variable density | tier 2; also unlocks Mega | required under open water; halves the BAY_MUD and wet-ground penalties (TUNING) | none |

Ground factors: one table, [02 s.7.3] (all design values there), with the rock rows by shield (decision 28):

| Face | Speed | Cost |
|---|---|---|
| STIFF_CLAY | 1.2 | 0.9 |
| SAND, dry | 1.0 | 1.0 |
| ALLUVIUM, wet | 0.8 | 1.2 |
| BAY_MUD | 0.6 | 1.5 |
| FILL | 0.4 | 1.8 |
| ROCK, EPB shield / rock shield | 0.7 / 1.5 | 1.2 / 0.9 |
| Fault zone (flag, M6) | 0.3 | 3.0 |

A drive:

1. **Launch.** Excavate or place a launch pit to axis depth; buy or relaunch a machine. Launch and capex are fixed costs, so drive length and reuse matter (6.2). Scenarios may grant a machine (mission 1 grants one Mainline EPB).
2. **Thrust.** Each tick the sim samples the face (9 points through `GroundQuery.materialAt`), computes advance in mm, grows the head stamp, adds a lining ring every 1,500 mm (Warsaw ring length [06 s.2.1]), drops track bed, and books cost.
3. **Rate.** `advance = base(class) x utilisation(tier) / 0.40 x ground(shield, face) x mixedFace x cover x thrustFactor(level, needle)`, with `utilisation = min(0.90, tier value)`. Mixed face (two materials each at least 20% of the face, TUNING) is x0.7; cover under 1.5 diameters in soft ground is x0.8 (TUNING) and narrows the band [02 s.7.3], except within 2 diameters of a launch pit or a reception void, where the rule does not apply (TUNING). SQ and PL use the same machine rate and the same shifts: Central Subway averaged 13 to 16 m/day under US work rules [02 s.6], so the record shows no US penalty on advance, and delays come from stations and permits [11 s.5.3]. Round-the-clock working is therefore in the base and no reform multiplies advance.
4. **Face gauge and thrust.** One needle (0 to 100) and one control. The thrust level sets where the needle settles and how fast the machine goes; the face material sets the band, how quickly the needle follows, and how much it wanders. All needle dynamics are per metre of advance, so they feel the same at any possession scale. All values TUNING, to be prototyped on a synthetic strata world at M0.5 before any M1 work depends on them:

| | Level 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Needle target | holds | 40 | 55 | 68 | 80 |
| Advance factor | 0 | 0.5 | 0.8 | 1.0 | 1.15 |

| Face | Band | Lag (metres of advance to close 63% of a gap) | Wander per 10 m | Level that sits in band |
|---|---|---|---|---|
| STIFF_CLAY | 30 to 85 | 6 | +/- 3 | 3 or 4 |
| SAND | 35 to 75 | 5 | +/- 5 | 3 |
| ALLUVIUM, wet | 40 to 70 | 4 | +/- 8 | 2 or 3 |
| BAY_MUD | 45 to 65 | 3 | +/- 10 | 2 |
| FILL | 38 to 60 | 2 | +/- 12 | 1 or 2 |
| ROCK | 20 to 85 | 8 | +/- 2 | 3 (wear decides) |

   Mixed face: the overlap of both bands, narrowed by 40%. Wander is a deterministic PRNG walk. Within 10 m of advance (about 2 s on screen): in band, nothing happens and the machine runs at its level; under the band in soft ground below a building the settlement meter gains 10 points; over the band, wear accrues at 3x and advance drops one level. The loop is: read the next face on the section view, step the level before the band moves, and counter the wander. Depth is a real choice: dive under the mud into clay and run at level 4, or stay shallow in the mud at level 2 and babysit the needle. Cruise holds the highest level whose target sits at least 5 points inside the band, so a good manual driver is one level faster than cruise in forgiving ground; there is no separate manual bonus.
5. **Curve and grade.** Steering is a choice of arc, not a rate held on a key: at real radii yaw is about 1 degree per second for Mainline at this plan's screen speed (DERIVED: 5 m/s on 300 m) and a 90 degree turn is 470 m of arc, which nobody can feel in a chase view. The curve control has detents on each side (straight, then 8, 4, 2 and 1 x the class minimum radius; TUNING) and the grade control has detents at half and full maximum grade. The sim eases curvature over 30 m (TUNING). The plan inset draws the resulting path 250 m ahead over streets, building footprints, pile zones and the target void, so the decision is visible before it is driven. Scoring uses the line speed the finished track supports, `v = sqrt(a x R)` with a = 1.0 m/s2 (TUNING, UNVERIFIED), taken over curves longer than 50 m, so a short correction is not punished.
6. **Wear gauge.** Fills in ROCK and FILL and over the band; at 100% the machine stops for a cutter change (consequence table).
7. **Cruise.** With a guide line, autopilot holds line and band and may lapse (5.3). Driving is never required. In mission 1 the guide is a soft corridor: leaving it is allowed, and cruise steers back to it.
8. **Things in the ground.** Obstructions in FILL (old piles, buried ships [02 s.7.3]). EXISTING_STRUCTURE and PILE_ZONE: the shield refuses within 3 m (TUNING). Under open water (M5): cover under one diameter in BAY_MUD or wet SAND floods the heading.
9. **Breakthrough.** The step whose stamp first intersects an air void (station box, shaft, the Salesforce train box, another tunnel; `GroundQuery.firstVoid`) fires `breakthrough` exactly once: sound drops, light floods in, camera pulls back. The machine can be recovered there for the reuse credit or driven on.
10. **Twin bores are a paired drive.** Where a line needs two bores (Metro class: PAX, the BSV II redesign), the player drives the first; the second machine follows the same record automatically at one diameter clear (TUNING), books its own capex, launch, burn and per-metre cost, and breaks through in the same lapse. Nobody drives the same tunnel twice.

Consequences. Every hazard is a named receipt line, a calendar hit shown as a lapse of at most 5 s, and a star-axis effect, with a stated maximum (all TUNING unless sourced):

| Hazard | Trigger | Dollars | Calendar | Stars | Maximum per event |
|---|---|---|---|---|---|
| Settlement | settlement meter reaches 100 under a building | compensation and grouting, $5M to $50M by building class | 1 to 6 months | Cost, Date | $50M and 6 months. The building keeps visible cracks and scaffolding for the rest of the campaign. Basis: Łódź tenement stoppage [06 s.2.2] |
| Obstruction in fill | the face meets an authored or seeded obstruction | $2M to clear by hand; nothing if probed and passed | 1 month | Date | $2M, 1 month; at most 3 per km |
| Cutter change | wear at 100% | $1M | 2 weeks | Date | as stated |
| No-dig refusal | within 3 m of EXISTING_STRUCTURE or PILE_ZONE | none; the machine stops | none | none | the cost of the retract that follows |
| Wrong shield | rock shield in soil | none directly | advance x0.3 [06 s.7.4] | Date | until the face changes or the machine is retracted |
| Geology surprise (card) | unprobed ground, seeded | none directly | advance halves for the segment, at most +8 months (S19 [11 s.5.3]) | Date | 8 months |
| Flood (M5) | cover under one diameter below open water in BAY_MUD or wet SAND | $100M recovery, or abandon the machine | 12 to 24 months (SR 99 stopped for two years [11 s.5.3]) | Cost, Date | the machine's capex and 24 months |

Recovery. No state is a dead end:

- **Retract to ring N.** The tail from the face back to ring N is backfilled (the stamps are shortened and the ground regenerates); the boring already paid stays paid, backfill is charged at the mined rate per m3, and the calendar loses 1 month per 100 m (TUNING). The machine relaunches from ring N on a new heading.
- **Abandon and relaunch.** The machine is written off (no reuse credit) and a new drive starts from any pit.
- Tested at M1: from every stuck state reachable by random input (refused at a no-dig volume, below or beside the target void, outside the corridor), retract plus cruise completes the mission.

Mission 1 feasibility (paper check before the M1 Portal data is authored; results recorded here): the Townsend to Second curve at R >= 300 m and which parcels and pile zones it passes under (the real design also leaves the street grid there and demolishes 7 buildings [05 s.3.1]); cover, since 1.5 diameters over a 13 m bore puts the axis about 26 m down and the train box rail level is UNVERIFIED; the grade from that depth up to the box within 3%. If the Mainline bore cannot meet radius or grade, mission 1 falls back to a paired twin Metro drive with the Caltrain-fit label UNVERIFIED (decision 16).

Other methods share the same edit primitives: cut-and-cover is top-down `fillBox` of air plus a roof slab; mined is capsule or box stamps from a void; immersed tube (M5) is a dredged trench plus prefab segments, only in open water over BAY_MUD [02 s.7.3].

### 5.5 Stations and operations

- Station box is a placed prefab that becomes an excavation job in the backlog. Two templates: SQ (box 1.75x platform length with a full mezzanine) and catalogue (1.1x, no full mezzanine). The SQ template is forced until reform S1 is enacted; the catalogue outline is drawn greyed beside it, so the volume difference is visible and the choice is never a fake one (6.3).
- One excavation, one price. Platforms and fit-out can be placed in any void, but placing a platform re-prices the enclosing station volume (platform length x template section) at the station civil rate, less what hand digging inside it already cost. A brushed station-sized hole at the cut-and-cover rate ($630/m3) is therefore not a way around the $1,500/m3 station rate: road-derived box rates undercount stations by an order of magnitude [11 s.5.2]. Tested: both routes to the same station cost the same.
- Platform, stair core, entrance, vent shaft (required every 3 km [06 s.7.3]), cross passages (twin bore, automatic). Track, lining, catenary lay themselves as the backlog drains.
- After the ribbon the camera rides the first train from end to end through what the player dug (15 to 20 s, skippable), then the scorecard (M2a).
- Operations stop at ribbon-cutting: set trains per hour per line (M4), trains are closed-form kinematic visuals with count = cycle time / headway [09 s.6]. No timetables, fleet or fares [08 rec. 10]. Operations money (Measure RTM, Prop H) is flavour and a prerequisite, never a build budget [05 s.3.16].

### 5.6 Cameras

| Mode | Use | Notes |
|---|---|---|
| Map / orbit (default) | everything | `camera-controls`, dolly to cursor, pitch 15 to 85 degrees [03 s.7] |
| Cut | underground work | same rig, may go below grade; mask handle on screen |
| Drive (default when possessing) | driving | split view: the alignment-following section (4.4) as the main view, where depth and strata are read, and a plan-view inset with the projected path 250 m ahead, streets, footprints, pile zones and the target void |
| Chase | optional, cinematic | behind the shield looking at the face; FOV slider, no shake by default [08 s.4.12]. It shows no reference for yaw, which is why it is not the drive view |
| Follow train | after opening | on the alignment spline (M2a) |

No pointer lock in v1.

### 5.7 UI and audio

- Top bar: date, speed, funds, PC. One running cost number at your price, and one gap indicator beside it ("x3.1 Polish practice"). The full SQ, yours and PL columns live in the receipt panel (6.6), not on the cursor. Timeline strip with the binder stack and the ghost schedule under it. Cockpit when possessed: three gauges maximum [08 s.4.10]. Side panels, never modal.
- Funding in mission 1 is one budget bar with one marked gate ("federal money needs this binder"); the slice breakdown is in the receipt drawer. At-risk slices and reimbursement mechanics are introduced from mission 3.
- Sources: the receipt, scorecard and cards print a source or a TUNING/UNVERIFIED label on every number. HUD numbers, floaters and gauges are bare, with the source on hover and in the sources drawer (decision 24).
- Every satirical counter (agencies 6, utilities 20+, buildings to demolish 7, train box empty since 2018 [05 s.3.1][08 s.1]) is a cited fact with a sources button. Process is the antagonist, never people or groups; no motives attributed to named firms [07 s.7].
- Accessibility baseline per [08 s.4.12]: remappable keys on `KeyboardEvent.code`, no information by colour alone, pause always available, no action needs reaction speed (the needle works per metre and cruise is always available), units toggle.
- Audio: WebAudio synthesis only, placeholder at M0.5, real from M1: cutterhead drone pitched by material, ring thunk every 1.5 m, breakthrough silence then swell [08 s.4.11].

### 5.8 First ten minutes (target for M2b)

The toy comes first and the spreadsheet after it: the player digs, drives and breaks through with one running number on screen, and only then meets the receipt, the binders and the first reform. Times are TARGETs.

| Time | Beat |
|---|---|
| 0:00 | No menu. An 8 s camera move from the Caltrain bumpers at 4th and King to the pit outline at Townsend and Third (the real construction shaft site [08 s.1]); any input cuts it. A Free Dig button sits in the corner from the first frame |
| 0:10 | "Dig here." Box-drag inside the pit outline; progress bar; auto-finish at 80%; "pit ready". First input is accepted within 10 s of `ready` |
| 0:45 | Crane lowers the granted Mainline EPB. Possess. Three prompts: thrust level, curve, watch the needle. Drive view |
| 1:00 | Drive about 1.3 km under Townsend and Second, about 4 minutes, an event at least every 30 s (table below) |
| 5:00 | Breakthrough into the train box. A label on the box wall, found, not narrated: "Opened 2018. Trains: 0." |
| 5:20 | The receipt appears for the first time: what the drive cost at your price, between the PL and SQ bounds. Flashback lapse of at most 12 s: the binder stack that stands in front of this drive in the real schedule; the date spins and the escalation line grows |
| 6:00 | First reform card, free, one of three (U1, S1, P1). Stack and receipt shrink against the drive just finished |
| 6:45 | Place the 4th and Townsend station box (SQ template unless S1 was the card). While the backlog drains in a lapse of at most 15 s the player places entrances and a vent shaft; track lays itself |
| 8:30 | Ribbon. The camera rides the first Caltrain from 4th and King through the bore into the box. Riders roll up |
| 9:15 | Scorecard with the ghost. Map pulls back to the whole Bay |

Event density for the Portal drive (authored in the scenario record as chainages; the values below are placeholders to be re-authored against the baked strata at M1; the gate is the spacing, not the list):

| Chainage | Event | What the player does |
|---|---|---|
| 0 m | launch below the fill | thrust to level 2 |
| 80 m | BAY_MUD face, band narrows | hold level 2, counter the wander |
| 200 m | probe marker: obstruction 60 m ahead | pick a grade detent to pass under it, or clear it |
| 350 m | first building overhead, settlement zone | stay in band |
| 450 m | curve onto Second; a pile zone on the inside | pick the curve detent on the plan inset |
| 600 m | SAND below the mud | dive, step up to level 3 |
| 750 m | settlement scare: scripted wander under a tower | step down, recover |
| 900 m | Rincon Hill ROCK, mixed face | step down, watch wear |
| 1,050 m | wear near the limit | change cutters now or risk the stop |
| 1,150 m | rock to soil, mixed face | band narrows again |
| 1,250 m | reception zone, grade up to the box | grade detent |
| 1,300 m | breakthrough | |

## 6. Economy

### 6.1 Basis

Amended 2026-11-09 (owner decision): the ledger basis is nominal 2026 USD at 3.71 PLN/USD, and PL is the Polish design at Polish prices. Where the bullets below say PPP 2.3 or "flavour toggle", read them swapped: nominal drives balance, PPP is the tooltip. The price-level gap (1.61) is printed as its own receipt line and is not folded into any institutional lever. Polish road contracts supply unit rates and timelines (per m3, permit months, TBM advance); Polish urban rail tunnels supply the per-km headline anchor. The ratio bands in 6.4, 6.7 and M2a/M2b acceptance were derived at PPP and must be re-derived at the nominal basis during the 6.8 reconciliation.

- Ledger in integer cents of 2026 USD at civil-engineering PPP, 2.3 PLN/USD [11 s.5.3] (rests on the UNVERIFIED assumption that the US civil-engineering price level equals its GDP price level [11]). HS2-derived machine terms from [06 s.7.3] are 2025 PPP USD and used unadjusted (DERIVED: one year of drift, under the model's noise).
- PL = Polish practice at Bay Area input prices: wages are not what the player removes [11 s.4.2]. Every PL figure has a tooltip with the PLN value; the nominal figure (3.71 PLN/USD) is a flavour toggle and never drives balance.
- Polish-anchored rates are stored in 2026 PLN and converted by one constant (2.3 here), so the basis in open decision 1 is a one-line switch; rates anchored in PPP dollars ([06]) scale by 2.3 / 3.71 under a nominal basis.
- Polish contract values are gross of 23% VAT and are used gross, as an implicit contingency [11 s.5.2]; stripping it lowers every Polish-anchored figure by 18.7% and raises every ratio by up to 1.23x (open decision 3).
- What the player pays is `your_price` (6.2): debited from funds as work is booked. SQ and PL are computed for the same scope and shown as bounds.
- The ledger is integer cents. Multipliers applied to ledger amounts go through one helper that cannot lose cents (cents x factor can exceed 2^53).

### 6.2 Formulas

```
project_PL = sum(hard_i) x seismic x (1 + soft_PL) + land_PL + contingency_drawn   # 10% held, drawn only by events
project_SQ = sum(hard_i at SQ scope x levers(category_i)) x seismic
             x (1 + soft_SQ) x (1 + contingency_SQ) + land_SQ
             + escalation(unspent, idle years)                                     # 30% held, always spent
your_price = the SQ formula on the scope actually built, with every lever, soft rate, contingency rule,
             land rate and binder at its current reformed value; equals project_PL when all are reformed

drive   = capex(class) x (1 - reuse) + launch(kind) + burn_week(class) x weeks
          + length x per_m(class) x ground_cost + shafts + cross_passages
weeks   = length / (7 x advance_per_day)          # speed is money through the burn term
station = box_volume x civil_rate x depth_factor x method_factor + fit_out(platforms)
land    = hard cost of surface-taking elements x land_rate + buildings_demolished x building_rate
```

Structure is the HS2 guide's fixed + time-related + per-metre [06 s.5.2, s.7.2]. In its worked example the split is 28% fixed, 24% time, 48% per-metre. Escalation is charged on idle years only; year-of-expenditure ghosts are compared on their own basis (6.6).

### 6.3 PL unit rates

| Element | PL rate | Src |
|---|---|---|
| TBM capex | $18M x (d / 6.3)^1.5; 13 m is about $53M, 16 m about $75M; 50% credit on reuse | [06 s.7.3] (assumption there) |
| Launch | $25M per shaft launch, $40M per portal; zero with surface-launch tech | [06 s.7.3] |
| Weekly burn per mobilised machine | $0.6M at 6.3 m, scaled x (d / 6.3) (scaling TUNING) | [06 s.7.3] |
| Bored tunnel per metre, Pod and Metro | $16,000 at 6.3 m ($513/m3), x (d / 6.3)^1.7, x ground cost factor (5.4) | [06 s.7.3]; exponent is an assumption there |
| Check: twin 6.3 m bore inside a 6 km drive | $68M (bottom-up) against a $77M target per route-km | [06 s.7.1, s.7.3] |
| Bored tunnel per metre, Mainline and Mega | $125,000 at 14 m, scaled by area: $108,000 at 13 m, $166,000 at 16.2 m; x ground cost factor | DERIVED: Łódź HSR tunnel contract, 383 mln PLN/km net over 4.6 km = $766M at 2.3 [06 s.2.3], less capex, launch and burn from the rows above at 8 m/day; ground factor of that drive taken as 1.0 (UNVERIFIED). Replaces the exponent, which gives $62,000 at 14 m and prices the drive at about 0.6x its contract; [06 rec. 10] puts a mainline bore without stations at $200M to $250M per km |
| Check: 1.48 km, 13.46 m slurry drive under water | $1,600 to $1,850 per bored m3 (DERIVED from the row above at wet factors) against $1,900 recommended, range $850 to $2,300 | [11 s.5.3]; Świnoujście all-in is 5,200 PLN/m3 in 2026 money, an upper bound that includes ramps and road fit-out [11 s.3.2] |
| Vent or intervention shaft, one per 3 km | $45M urban, $20M rural | [06 s.7.3] |
| Cross passage, twin bore, one per 250 to 500 m | $2M | spacing [06 s.7.2]; cost TUNING, UNVERIFIED |
| Cut-and-cover, structure included | $630 per excavated m3 | [11 s.5.3] |
| Utility relocation under open cut in an old street | $45M per km of cut | [06 s.7.4] range 30 to 60, assumption there |
| Mined | $540/m3 in rock; 1.5x the cut-and-cover volume rate in soil | [11 s.5.3][06 s.3.3] |
| Station box civil | $1,500/m3 of box; depth factor 1.0 to 20 m, +4% per metre beyond; mined x1.5; platforms in a 16.2 m bore x1.2. Applies to any volume that receives a platform (5.5) | rate DERIVED so a 60,000 m3 standard box (TUNING dimensions) is $90M; factors [06 s.7.4] |
| Station fit-out | $36M per 140 m metro platform pair; mainline station 4x to 6x | DERIVED from the 71:29 civil to fit-out split in [06 s.7.1]; mainline factor is an assumption in [06 s.7.4] |
| Standard metro station, total | $126M (290 mln PLN) | [11 s.6.3]; cross-check $140M in [06 s.7.1]; both come from a cost split, not contracts (UNVERIFIED) |
| Line systems | metro $28M per route-km; mainline track + 25 kV + signalling $11M; electrification alone $2M | [11 s.6.3][06 s.7.3]. The $11M rests on an assumed 60% share of the Rail Baltica upgrade cost (UNVERIFIED [11 s.6.3]) |
| Double-track viaduct (M5) | $38M/km (11 m deck, $3,500/m2); HSR 13 m deck $45M/km (104 mln PLN) | [11 s.5.3, s.6.1] |
| At-grade double-track formation (M5) | $8.7M/km, no track | [11 s.5.3]; rests on an assumed 0.5 factor of expressway formation width (UNVERIFIED [11 s.5.1]) |
| HSR formation with its road overpasses (M7) | $13M/km (30 mln PLN) | [11 s.6.1], an assumption there (UNVERIFIED) |
| HSR mountain tunnel (M7) | $1,090/m3 (2,500 PLN); twin 9.5 m bores = 354 mln PLN/km, against 383 for the Łódź HSR contract | [11 s.6.1], an assumption there (UNVERIFIED) |
| HSR, whole line, upper bound | $70M/km (CPK "Y" budget, 160 mln PLN/km, scope unclear) | [11 s.6.4] |
| Greenfield HSR on flat land, cross-check only | $30M/km all-in | [06 s.7.3]: ECA figures for Spain and France, not Polish |
| Immersed tube (M5) | none found; placeholder to be set at M5 | UNVERIFIED, open in [06] |
| Soft + owner costs | 10% of hard | [06 s.7.3] |
| Land and right of way | interim: 25% of the hard cost of surface-taking elements (pits, cut-and-cover, station boxes built from the surface, portals, at-grade, viaduct); nothing on bored or mined length. SQ: 50%. A per-m2 and per-building rate replaces this after a research task before M2b text | DERIVED: [11 s.5.3] measures land, supervision and owner costs at +35% of works (one expressway, S2 Ursynów; range 20% to 40%), less the 10% soft above. SQ is +60% to +100% in [11], UNVERIFIED there. Polish compensation is market value plus 5% for handover within 30 days [11 s.1.4] |
| Contingency | 10% held as a reserve; events draw on it; the unspent part returns to Savings. SQ holds 30% and always spends it ("all money in the budget will be spent") | [06 s.3.3, s.7.3] |
| Seismic premium, both columns, own receipt line | a range: 1.05 to 1.20 underground (model value 1.10), 1.15 to 1.40 viaducts and bridges (1.25) | TUNING, UNVERIFIED: no source at all. [11 s.5.2] says only that the share is real and unquantified, and lists it as an open question. Research task before M2b text (Caltrans and BART seismic design and retrofit literature); until then the receipt prints the range with the label, and the Bay Area rows of 6.7 run at both ends |
| Learning curve (M3) | first drive with a machine class 2.0x on burn and launch, -15% per completed drive to 1.0 | [06 s.7.4]; narrowed here to burn and launch (TUNING) |

A below-par tier ("Madrid mode", 0.6x PL [06 s.7.5]) is deferred past v1: an across-the-board multiplier is the opposite of a receipt.

### 6.4 Status quo: where the multiple comes from

Three separate things, shown separately on the receipt:

**A. Design scope (physical, visible blocks).** Not a multiplier. SQ templates are bigger: station box 1.75x platform length with a full mezzanine (TUNING: gives the 1.60 station lever of [06 s.7.5]; New York measured 2.0x to 2.6x against 1.03x to 1.2x elsewhere [06 s.3.3]); one 16.2 m bore instead of twin 6.6 m (3x the excavated volume [11 s.6.2]); 3-track mined cavern; deep stations. The player sees the extra blocks and their price.

**B. Institutional levers (basis points on priced scope, per category).**

| Lever | SQ | Reformed | Applies to | Reform (7) | Src |
|---|---|---|---|---|---|
| Procurement and risk pricing | 1.50 | 1.00 | all hard cost | P1, P2 | [06 s.7.5] (TCP 1.85 scaled) |
| Work rules and staffing | 1.35 | 1.00 | tunnel and station civil, burn | L1 | [06 s.7.5] (TCP 1.5; no Bay Area data [07 s.2.10]) |
| Non-standard systems and finishes | 1.15 | 1.00 | systems, fit-out | S1 | [06 s.7.5] |
| Soft costs | 30% | 10% | on hard | C1 | [06 s.7.5]; BSV II about 40% [07 s.1] |
| Contingency | 30%, always spent | 10% held, drawn by events | on hard + soft | P2 | [06 s.3.3, s.7.5] |
| Land and right of way | 50% | 25% | surface-taking hard cost | R1 | 6.3 |

**C. Time.** Escalation 4% per year on unspent cost while binders burn (3% to 5% [07 s.2.11]).

DERIVED on the baseline metro mix (tunnel 34%, station civil 37%, fit-out 15%, systems 14% [06 s.5.1]): hard x2.54; with soft and contingency x3.5 static if the PL reserve is fully drawn, x3.9 if untouched; with 6 to 7 idle years x4.5 to x5.1. That sits on the scope-matched PPP headline of x4 (range 2 to 9) [11 s.6.5] and the per-km ratios of 4.3 to 5.0 [06 s.1]. Design-choice gaps are extra and come from volume pricing: BSV II against a twin-bore redesign is a further x2.2 [11 s.6.4].

Calibration rule: no hidden per-scenario constant. The receipt prints the model's SQ estimate, the sponsor figure, and the unexplained residual. A scope-matched real scenario whose residual exceeds 25% fails its test; the fix is in the model or the scope record. Ghosts that are not scope-matched (section 9 says which) are shown without a residual test.

### 6.5 Time model

Generic binder durations; each scenario authors its own stack from the sponsor schedule. Rows marked "binder" run in sequence; rows marked "span" contain other rows and are checks, not extra time. Planning and project selection (5 to 15 years against 1 to 2 [07 s.4]) is out of scope because every mission starts in 2026 with its project already selected.

| Stage | Kind | SQ | Reformed | Src |
|---|---|---|---|---|
| Environmental review (CEQA + NEPA) | binder | 3.5 to 4.5 y | 0.5 y | [07 s.4] |
| Litigation, if triggered | binder | +1 to +4 y | at most +0.75 y | [07 s.4] |
| Federal grant (CIG) | binder | 2 to 4 y | 1 y, or skipped with local funding | [07 s.4] |
| ROW and utilities | binder (SQ); inside the permit (reformed) | 2 to 8 y | title passes with the permit; about 1 y, overlapping design | [07 s.4][11 s.1.4] |
| Design + construction permit | binder; reformed it starts at contract award | 60 to 120 months | 17 months (12 to 24) | [11 s.5.3] |
| Contract to TBM launch | span, contains design + permit | same order (23 months on SR 99) | 30 months (20 to 48) | [11 s.5.3] |
| Boring and station works | modelled, not a binder | from the drives and the backlog | same machine rate; stations and surface works x1.5 slower at SQ | 5.4, 6.8 |
| Breakthrough to opening | binder | 15 to 22 months | 21 months (18 to 31) | [11 s.5.3] |
| Tunnel-section contract to opening | span, contains everything from design on | 100 to 160 months from decision | 66 months median (57 to 76) | [11 s.4.2, s.5.3]: Polish contracts are design-and-build, so the span includes design and permit |

The Portal, reformed, as planned (DERIVED): environmental review was cleared in 2019; with F1 the contract is awarded at the start, November 2026, and the 66-month span gives an opening in mid 2032; keeping the federal grant at its reformed 1 year gives mid 2033. The ghost is Q1 2036. Reading the rows additively (66 + 17 months) would give late 2033 and is wrong.

### 6.6 Funding and the receipt

- Each real mission gives funding as slices with gates. The Portal: about $1.26B committed non-federal (DERIVED: $7.57B less FTA $3.38B, less the $2.2B gap, less the $0.73B built train box), about $1.05B planned from the state and at risk, FTA $3.38B released only at the FFGA binder, which needs the gap closed [05 s.3.1][07 s.1]. At SQ prices the player is short by the real gap; at a reformed price near $1.5B the project fits non-federal money and the FFGA binder can be skipped. The game does not say this; the ledger shows it. Mission 1 presents all of this as one budget bar with one gate (5.7).
- Federal slices reimburse a share of spend and never carry. Unspent released non-federal funds carry forward as **Savings**, which pay for the campus branches, machines and tech (worked budget in 9.1). PC comes from stars and riders and buys reforms.
- Ghosts carry `{ amount, basis, year }`: year-of-expenditure to a stated year, or dollars of a stated year. The residual is computed on the ghost's basis, never on mixed ones: for a YOE ghost the model's SQ estimate is escalated at 4% over its own modelled spend curve to the ghost's years; for a past-dollar ghost it is deflated by a construction cost index (index choice is a research item before M2b; until then such ghosts are shown without a residual). Mixing bases biases ratios up for future projects and down for finished ones [11 s.6.1].
- Receipt, per project, also exported on the scorecard:

```
Polish practice at Bay prices (quantities x unit rates)       $
+ seismic premium (not removable; range, UNVERIFIED)          $ lo to hi
+ land and right of way (area taken, buildings demolished)    $
+ design scope beyond the Polish template (blocks you see)    $
x procurement 1.50  x work rules 1.35  x systems 1.15         $
+ soft costs 30%    + contingency 30%                         $
+ hazards (settlement, obstructions, floods), each named      $
+ escalation over N idle years at 4%                          $
= model status-quo estimate                                   $M
  your price (levers as reformed)                             $Y
  sponsor figure (ghost), price basis, source                 $G
  not explained by this model, on the ghost's basis           (G - M) / G
```

Each line is clickable: source, quote, date fetched, and which reform removes it.

### 6.7 Sanity targets (automated in the cost model's tests)

Warsaw rows run with seismic 1.00 and no contingency draw (they compare against Polish outturn); Bay Area rows run at both ends of the seismic range and must hold at both. Each row becomes a gate at the milestone named; before M2b the generic rows run on minimal scope fixtures in `testkit` (lengths, diameters, station counts) labelled as test inputs, not scenario data.

| Case | Model must give | Real anchor (basis) | Gate |
|---|---|---|---|
| PL: 1 route-km twin 6.6 m bore inside a 6 km drive, tier 0, hard cost | $77M +/- 15% | [06 s.7.1] (2025 PPP) | M2a |
| PL: Warsaw-style route-km all-in, 0.85 stations/km, parametric station record | $226M +/- 10% | 520 mln PLN/km in 2026 money [11 s.6.3]; $250M in 2025 PPP [06] | M2a |
| PL: 4 km twin bore, 3 standard stations | $0.80B to $1.05B | Bródno $995M (2025 PPP) [06 s.7.6] | M2a |
| PL: 4.6 km double-track 13 to 14 m bore, no stations | $167M/km +/- 20% | Łódź HSR tunnel, 383 mln PLN/km net [06 s.2.3] | M2a |
| PL: 1.48 km, 13.46 m slurry drive under water, per bored m3 | $850 to $2,300 | [11 s.5.3]; Świnoujście [11 s.3.2] | M2a |
| SQ / PL, generic twin-bore metro | 3.2 to 4.2 static; 4.0 to 5.3 with 6 to 7 idle years | [06 s.7.5][11 s.6.5] | M2a |
| Advance by tech tier, dry SAND, Metro | 12 / 16.5 / 16.5 / 19.5 / 27 m/day for tiers 0 to 4, +/- 1, and never above 0.90 x 30 | utilisation 0.40 / 0.55 / 0.55 / 0.65 / 0.90 [06 s.7.4] | M2a |
| Advance, Central Subway strata mix (1,750 m SAND, 500 m STIFF_CLAY, 750 m ROCK), Metro EPB, tier 0 | 13 to 16 m/day +/- 20% (DERIVED today: 11.1, inside the lower tolerance; if mixed faces push it out, the EPB-in-rock factor is what gets fixed) | Central Subway averages [02 s.6] | M2a |
| Advance, Mega in wet ALLUVIUM, tier 0 | 7 to 11 m/day | BSV II plan 9 to 11 [02 s.6] | M2a |
| PL: The Portal, real scope | $1.2B to $1.8B | $1.53B scope-matched PPP [11 s.6.4], on ASSUMED cross-sections | M2b |
| SQ: The Portal as designed | $5.5B to $8.2B | $6.84B excluding the built train box (YOE to 2036) [05 s.3.1] | M2b |
| SQ: Central Subway scope | $1.8B to $2.7B | $2.27B (2025 dollars) [06 s.7.6]; $1.891B final in 2010 to 2022 dollars [05 s.3.9] is not used as the anchor | M2b |
| PL: Googleplex branch, bored, two stations | $1.0B to $1.6B | none; DERIVED in 9.1 | M3 |
| SQ: BSV II as designed | $10B to $15B | $12.746B (YOE to 2039) [05 s.3.3] | M6 |
| PL: BSV II twin-bore redesign | at most 0.5x the PL single-bore design | x2.2 [11 s.6.4] | M6 |
| Link21 | no band: the model SQ and the residual against $18B to $30B (2023 dollars) are printed, and the scope record lists every assumed quantity | [11 s.6.4] finds 5.4x to 9.0x PPP on assumed scope | M6 |
| PL: Pacheco tunnels, 24.1 km twin 9.5 m bores, hard cost | $3.7B +/- 25% (DERIVED: 354 mln PLN/km) | [11 s.6.1]; no contract anchor in rock | M7 |
| HSR Merced to Bakersfield on the scope of [11 s.6.2] (no tunnels): ghost / PL | 2.6 to 4.0 | 3.3 at PPP, $35.66B (YOE) against $10.9B [11 s.6.4] | M7 |

### 6.8 Reconciliation with the in-flight registry (M2a exit item)

`sim/constants.ts` already holds a sourced registry. It differs from this section in ways that move the headline. The 6.7 bands arbitrate; the registry stays the one place numbers live. The reconciliation waits for open decisions 1 to 3 and gates M2a, where a scorecard first shows a ghost; it does not gate the toy (M0.5) or the slice (M1), which show one running number on the recommended basis.

| Topic | In flight (MEASURED in the repo) | This plan | Resolution |
|---|---|---|---|
| Basis | nominal USD at 3.71; the 1.61 price-level gap is a lever that reform removes | PPP at 2.3; the gap is not removable [11 s.4.2] | open decision 1; one constant either way |
| Bored tunnel | flat 3,000 PLN/m3, a calibration inside the 1,950 to 5,200 range of [11 s.3.2] | fixed + weekly burn + per-metre [06 s.7.2], per-class anchors (6.3) | adopt the three-term structure (speed tech has no price effect otherwise); open decision 2 picks the anchors; keep 3,000 PLN/m3 as a check value |
| Station oversize | factor 2.06 (TCP New York) | physical template, volume ratio 1.6 [06 s.7.5] | template; the factor becomes blocks |
| Third parties 1.2, Buy America 1.15 | present [07 s.4] | not separate levers | keep only if the static ratio row of 6.7 still holds ([07 s.1] warns its own product overshoots the observed gap on a PPP base) |
| Labour | 1.3 [07 s.4] | 1.35 [06 s.7.5] | either; the band arbitrates |
| Reformed contingency | 0 (Polish gross rates carry 23% VAT as implicit contingency [11 s.5.2]) | 10% held, counted only when drawn | same totals when no event fires; keep the reserve as a display line; open decision 3 |
| Idle-year cost | 4% escalation plus overhead of 2% (SQ) or 1% (PL) of hard per year (assumption) | 4% escalation only | adopt the overhead if the idle-years row of 6.7 holds; the standing army is real [06 s.7.5] |
| SQ construction time | x1.5 on all construction [11 s.5.3] | machine headings run at the same rate in both modes; x1.5 only on stations and surface works | per [11 s.5.3]: the x1.5 to x2 evidence is for at-grade and viaduct work |
| Land | none | own line (6.3) | add |
| Tick | 1 day | 1 hour | decision 10 in 2.2 |

Values the research docs disagree on, and the pick:

| Value | Chosen | Not chosen | Why |
|---|---|---|---|
| BSV II bore | 16.15 m (53 ft); Mega class 16.2 m | 16.5 m [04 s.2] | [05 s.3.3], [11 s.6.2] and the VTA peer review in [02 s.6] all give 53 ft |
| Central Subway bore | 6.3 m machines | 6.1 m [06 s.6.2] | [02 s.6] cites the Robbins paper for the machine; 6.1 m is the nominal 20 ft tunnel |
| Portal state money at risk | $1.05B planned state share is the slice; $750M of it is what the renegotiation card puts under review | either figure alone | [05 s.3.1] is the SFCTA memo; [07 s.1] is press on the cap-and-invest share in doubt |
| Portal PL par | $1.53B | $0.6B to $0.9B [06 s.7.6] | [11 s.6.4] prices the actual 3-track mined section and wide boxes; [06] divides by route-km against a Łódź-class tunnel and one station |
| Portal mined length | 1,000 m until the SEIS/SEIR is read | about 0.65 mi (1,046 m) [02 s.6] | within 5%; both secondary |
| BART weekday riders | 204,800 (Q2 2026) | 223,280 (September 2026) [05 s.2.1] | the second could not be confirmed in the fact-check; the 25% calibration tolerance covers both |

## 7. Reform and tech tree

Tiers open at ribbon cuttings [08 s.4.9]. Effects apply to work booked after the unlock. Content is data (as built: `sim/reforms.ts`, each entry with `evidence`, `effects`, `prereqs` and a cost in PC and dollars). The tables below are the target set; the in-flight list is reconciled to them at M3. Start state is real November 2026: SB 71, SB 131, AB 130, SB 79 in effect; RTM and Prop H passing but uncertified, shown with an `asOf` date [07 s.2.2, s.2.11].

Root rule: client capacity gates procurement. Procurement tricks without in-house staff misfire (GLX, VTA/KST) [07 s.5].

Policy tree v1: 11 nodes, each a decision with a named loser. PC costs are the [07 s.5] proposals where a node maps one to one and TUNING otherwise; every downside magnitude is TUNING. [07 s.5] prices most side effects in trust, endorsements or per-city relations, which v1 does not have (decision 17); they are re-expressed here in dollars, PC or event odds. PC is scarce on purpose: a mission pays 5 PC per star, at most 45 (TUNING), against 205 PC for the whole tree, so a mission affords one or two nodes and the order matters. M2b ships the five marked *.

| Node | Source id | Effect | PC | Who pays, and how it shows in play | Visible effect |
|---|---|---|---|---|---|
| U1 Pothole first* | [07] U3 | disarms "What Lies Beneath" | 0 | the budget: 1% of the project's hard cost upfront, its own receipt line | utilities drawn under streets before the dig |
| S1 Standard station catalogue* | [07] S3; [06 s.7.5] | unlocks the 1.1x box (the SQ box is forced until then); systems and finishes lever 1.15 to 1.00 | 15 | the cities: every station placed afterwards raises an "iconic station" request; declining costs 3 PC, accepting restores the SQ box for that station | the station prefab shrinks before the click |
| P1 Best-value award* | [07] P1 | procurement 1.50 to 1.25; lowest-bid collapse odds halved | 20 | low bidders and the calendar: scored bids add 3 months to the procurement binder | bid board shows scores, not only prices |
| L1 Lean crews and work rules* | [07] L1; [06 s.3.3] | work rules 1.35 to 1.00; no effect on advance (5.4 step 3) | 25 | the trades: a +5% wage premium on tunnel labour is the price of the deal and its own receipt line [07 s.5]; a noise-complaint card is armed for station boxes dug at night in residential tiles (-2 PC each) | fewer hard hats per shield (46 per shift to 30 [06 s.3.3]); night-shift lights |
| F1 Fund locally, skip CIG* | [07] F3 | removes the federal binder (2 to 4 years) | 0 | the budget: the federal slice is gone (up to 40% of funding [07 s.5]) | trade-off card: less money, sooner |
| C1 In-house engineering corps | [07] S1 | soft 30% to 10%; gates P2 | 25 | the owner's payroll: a salary line of $15M per year, charged in idle years too | advisor desk on site; binders clear faster |
| P2 Itemised contracts | [07] P2 | procurement 1.25 to 1.00; contingency 30% always spent to 10% held; change-order event becomes a fixed small fee; needs C1 | 10 | contractors' claims teams; the payroll line grows $5M per year (someone has to read the bill of quantities) | change orders show a price list |
| S2 Right-size the bore | [11 s.6.4]; [07 s.2.7] | unlocks twin 6.6 m bores where the SQ template forces one 16.2 m | 20 | the streets at stations: every station becomes a cut-and-cover box from the surface, with the utilities line ($45M per km of cut) and "What Lies Beneath" armed unless U1 | smaller cutterheads; open boxes on the street |
| E1 Megaproject court cap | [07] E2; [11 s.1.4] | litigation binder capped at 9 months; works cannot be stopped once started | 30 | plaintiffs lose the injunction; every project carries a 6-month business-case binder, the gate [07 s.5] attaches to this reform | the binder gets a countdown clock |
| E2 Review clock | [07] E3 | environmental review 3.5 to 4.5 years to 2; to 0.5 with R1 | 15 | a "federal reversal" card is armed: 10% per mission that review reverts to SQ for that project | thinner binder |
| R1 Rail specustawa | [11 s.1.4]; [07] R1 | one consolidated permit with a 90-day clock (17 months from design start), title by operation of law (ROW and utilities about 1 year), immediate enforceability; land line 50% to 25% | 45 | owners in the take lose the right to hold out; displaced households are shown and paid market value plus the 5% handover bonus [11 s.1.4]; -3 PC per demolished building | the binder stack becomes one folder |

Invariant (tested): with C1, S1, P1, P2, L1 and R1 enacted every cost lever is exactly 1.00 and `your_price` equals PL for the same scope; no reform changes the PL base line. Deferred to post-v1 with their evidence in [07 s.5]: single delivery agency, utility relocation statute and master permitting, progressive design-build as a node (it is the delivery-method card below), Madrid mode, regional network manager, ballot measures, Buy America, FRA compliance, buy-the-railroad, pay bands.

Tech tree (dollars from Savings; costs and gates TUNING):

| Tier | Unlock | Effect | Cost, gate | Label shown in game |
|---|---|---|---|---|
| 0 | EPB shields up to Mainline, open cut, mined | utilisation 0.40 | start | delivered |
| 1 | Continuous muck conveyor, segment plant, continuous advance; rock double shield | 0.55 (x1.6 on the 0.35 of [06 s.7.4]) | $60M, after the first ribbon | delivered; manufacturer figure [06 s.6.6] |
| 2 | Slurry and variable-density shields; Mega bores; immersed tube | unlocks open water; halves BAY_MUD and wet-ground penalties (TUNING) | $150M, after mission 2 | delivered |
| 3 | Robotic ring erection, automated logistics, surface launch | 0.65; launch fixed cost zero on Pod and Metro | $300M, after mission 4 | partly demonstrated [06 s.6.5] |
| 4 | "Prufrock-class" | 0.90 | $600M, after mission 5 | vendor target, not independently measured [06 s.6.5] |

What the tech tree is worth (DERIVED on the [06 s.7.3] check case: 1 route-km of twin bore inside a 6 km drive, PL):

| Tier | Tunnel civil per route-km | Change in an all-in $226M route-km | A 6 km drive takes |
|---|---|---|---|
| 0 | $66M | 0 | 500 days |
| 1, 2 | $62M | -2% | 364 |
| 3 | $53M | -6% | 308 |
| 4 | $50M | -7% | 222 |

Machines buy time, reform buys money: the whole tech tree moves a metro line's total by about 7%, where the policy tree moves it by x3.5, because TBM tech is a 1.2x to 1.6x factor on a component that is a third of cost and burn is about a quarter of that [06 s.5.2, s.6.6]. The brief asks for major innovation in speed and cost, so this is open decision 8, with the table shown to the owner. A Pod line carries pods, not trains: capacity is capped at the observed 1,355 passengers per hour per direction (4,400 in a test) [06 s.6.5] and it cannot through-run with rail.

Event cards v1. The deck is this list, not "the 18 of [07 s.6]": about half of those need systems v1 does not have.

| Card | Trigger in v1 state | Effect | Source | Ships |
|---|---|---|---|---|
| Obstruction in fill | 5.4 consequence table | 5.4 | [02 s.7.3] | M1 |
| Settlement | 5.4 consequence table | 5.4 | [06 s.2.2] | M1 (scare), M2b |
| What Lies Beneath | cut-and-cover or a station box from the surface, without U1 | +12% on that element, +3 years | [07 s.6] Van Ness | M2b |
| Cap-and-Invest Renegotiation | a project relies on a state slice; seeded | $750M of the Portal's state share, or 10% of funding elsewhere, goes "under review": cover it from Savings or the opening slips 1 to 3 years | [07 s.1, s.6] | M2b |
| Lowest-bid collapse | any award without P1; 15% per project (TUNING) | re-tender: +36% to +71% on that contract, 2 to 3 years | [11 s.5.3] S61 | M3 |
| The Twice-Priced Tunnel | the delivery-method card: progressive design-build chosen without C1 | 25% chance the price returns at 2x: re-procure (+1.5 years) or pay | [07 s.6][05 s.6.2] | M3 |
| Wrong Kind of Rail | fit-out under an award without P1; 10% (TUNING) | opening slips 3 months, $5M rework (TUNING) | [07 s.6] Central Subway | M3 |
| Idle machine storage | a machine is bought and its launch binder has not cleared | storage charge per month until launch (TUNING) | [05 s.6.2] BSV II | M3 |
| Title VI analysis failure | federal slice in use without C1; 10% (TUNING) | $70M of the federal slice is lost | [05 s.6.2] OAC | M3 |
| Geology surprise | 5.4 consequence table | 5.4 | [11 s.5.3] S19 | M3 |
| Ribbon Before the Election | opening within 4 years of mission start | +15 PC | [07 s.6] | M3 |
| The Railroad Will Call You Back | an alignment touches UP track | +18 months per agreement | [07 s.6] | M5 |

Deferred, with the system each needs: One Man and His Parking Spot, The Berkeley Truncation (surface BRT and bike projects); Fiscal Cliff, Do Not Disturb (operations and maintenance budget); Tap Fail (fare system); Escrow (ballot measures); Empty Box, Subsidence, the trust half of Ribbon Before the Election (trust meter; the empty box is the mission 1 world label instead); Phased Implementation Ordinance (arrives with the upzoning reward of section 8); Playground Rent, Aerial Over Diridon (per-agency vetoes, network manager); Kill Fee (concessions). Each card shows its real basis and source.

## 8. Demand and scoring

Scripted (through M3). The Portal is worth 25,000 added daily riders at reference line speed (2019 Caltrain modelling via a secondary source [08 s.1]), scaled by achieved line speed, clamped 0.6 to 1.1 (TUNING). Campus branches: jobs within 800 m of each new station (LODES WAC, counted at bake and stored in the scenario record) x a capture rate (TUNING), scaled the same way.

Model v1 (M4): the catchment model. Riders per station = homes and jobs in reach at 512 m resolution with distance decay x a rate per mode fitted offline to the calibration totals below, with ride time from the geometry the player built (line speed by curve, kinematic run time [09 s.6]). It answers the questions missions 1 to 3 ask (where the station is, how fast the line is) and is the fallback [09] itself would label. Computed in a worker on every network edit.

Model v2 (M6, only if network-shape decisions need it: transfers, competing lines, the transbay tube); method and measurements in [09 s.3, s.7]:

- Zones: the 1,920 site-tile cells (2,048 m), so zone id = site-tile id, plus gateway zones for the 743k in-commuters and 419k out-commuters [09 s.1.1]. OD from LODES 2024 JT00, full sparse matrix (thresholding is lossy [09]). Homes and jobs at 512 m for station catchment with distance decay; needed because The Portal moves a terminus 2 km and a 2 km zone cannot see that.
- Trips: `2 x T_ij x 0.83`, times a fitted non-work factor [09 s.3.1].
- Generalized time and binary logit per [09 s.3.2] with the published Subway Builder weights; logistic through a lookup table.
- Assignment: frequency-based all-or-nothing, wait = min(headway / 2, 15 min); existing BART, Caltrain, Muni Metro, VTA as fixed lines. Buses collapse into a per-zone access speed.
- Car baseline: offline zone-to-zone free-flow times from the OSM road graph times class and screenline peak factors, u8 per pair [09 s.4]. Fallback on the cut list: straight-line times with fixed bridge and parking penalties.
- Crowding (level C) arrives with Link21 so the Transbay Tube can saturate [09 s.3.3].

Calibration, offline, constants baked, for both models: BART 204,800 weekday, Caltrain 40,000 to 46,000, Muni Metro about 125,100, VTA light rail 17,700, regional transit commute share 8% [05 s.2.1][09 s.5]. The scorecard prints the calibration error ("this model reproduces current BART ridership within N%").

Baseline and growth. The player sees 2026 ridership, which for BART is about half of pre-2020 (410,000 weekday [05 s.2.1]); the pre-2020 level is drawn as a reference line, never as the baseline ([09] left this open). Demand then moves by two stated rules, both TUNING:

- A scenario year factor: flows grow by a fixed rate per game year from 2026 (rate in the registry, shown on the scorecard).
- Upzoning as a reform reward: stations the player opens in SB 79 tiles raise homes and jobs within 800 m year on year ([09] upgrade 6, [07 s.5] SB 79 hook), so building where people can live is what refills the system.

Link21's in-fiction reason to exist is that growth: the mission card prints the modelled year in which the Transbay Tube passes a 0.8 load factor.

Scoring: three axes, 1 to 3 stars each. Cost: 3 at or below PL par, 2 within released funds, 1 below the sponsor quote. Date: opening year against the sponsor's. Riders: against the agency forecast or the PL-par design. Headline printed on the scorecard: capital dollars per new daily rider [08 s.4.6]. Rider-minutes saved per day, the fourth axis of [08 s.4.6], is printed unscored from M4 (`minutesSavedPerDay` already exists in `DemandResult`); jobs within 45 minutes and car trips removed [09 rec. 7] stay out of v1. The scorecard is one shareable image: yours, the ghost, PL par, receipt, sources.

## 9. Scenario campaign

One persistent Bay. Free Dig (unlimited money, all tech) is on the `portal` site from the first frame, behind a corner button: the literal "Minecraft for boring tunnels" does not wait for a 10-minute mission. Other tiles and tech tiers join Free Dig as the campaign bakes and unlocks them. Every scenario record: id, sponsor, alignment flagged `real | traced | fictional`, stations, ghost `{ amount, basis, year }` flagged scope-matched or not, ghost date, funding slices, binder stack, `possessionScale`, `setPieces[]`, sources. All coordinates in [05] are approximate and are resolved against OSM at build time.

| Act | # | Mission | Ghost (basis; scope match) | New mechanic | Data needed beyond the base tiles | In |
|---|---|---|---|---|---|---|
| I | 1 | **The Portal**: 4th and King to the Salesforce train box, 2.09 km | $6.84B excluding the built train box (July 2025 indicative, YOE to 2036); Q1 2036 [05 s.3.1]; scope-matched. PL par $1.53B [11 s.6.4] | everything once; the bored what-if with the granted Mainline EPB | `portal` site (baked). Authored: guide alignment (seed: the one OSM proposed way, 2.1 km [01 s.3]) after the paper check of 5.4; train box void (dimensions UNVERIFIED; building is about 440 x 50 m [04 s.2]); pit outline; event table (5.8); Rincon Hill override (M1); real-design scope record (segment lengths conflict: 1.3 vs 1.5 vs 2.2 mi [05]; cross-sections ASSUMED in [11 s.6.2]); 4th and Townsend station templates; throat 2 to 6 tracks at Second and Howard [08 s.1]; utilities corridor on Townsend (20+ [05]); depth table entries for Market Street BART and Muni levels and the Central Subway (UNVERIFIED); slices and binders (FFGA target July 2027, award Q2 2029 [06 s.3.1]) | M1 (slice), M2a, M2b |
| I | 2 | **Googleplex and Bay View branch** (fictional), from Mountain View Caltrain, about 3.1 km (DERIVED from approximate coordinates) | none; the model's SQ estimate stands in, labelled as model | first free-form line: the driven path is the alignment, so no Plan tool is needed; new ground (wet ALLUVIUM, flat low-rise surface); bore against cut-and-cover under a wide street; employer co-funding | `googleplex` site (baked) extended one tile row south to reach Mountain View Caltrain (site tile 24, 11; DERIVED); ALLUVIUM with a high water table (`Qhff`), surface 7.4 m [02 s.4.2, s.5.1]; job counts (9.1) | M3 |
| side | S1 | **Oracle Redwood Shores branch** (fictional), from the main line at Belmont or San Carlos, about 3 km (UNVERIFIED [05 s.5]) | none | Plan verb and profile panel on a short line; lagoon ground | `oracle` site (baked) plus the tiles to the main line; Oracle on a lagoon polygon [02 s.5.1]; flagged as a shrinking anchor (HQ left) [05 s.5] | M4 |
| side | S2 | **Pennsylvania Avenue Extension** | $2.0B to $2.5B excluding stations (2022 dollars) [05 s.3.1]; scope-matched to the study alignment chosen | paired twin bore under an operating railway; portal siting; ties into the player's Portal | already inside the `portal` site; three study alignments (5,600 / 6,300 / 7,800 ft); 22nd Street; the two grade crossings removed | M4; on the cut list |
| II | 3 | **Dumbarton with Meta**: Redwood City to Newark on the disused branch. The Willow Road (Meta) station is the first leg, on land | $1.6B phased (2017 dollars) is the 20.5 mi Union City to Redwood City rail concept [05 s.3.5], not this scope: shown as "whole-programme figure, not scope-matched", no residual test. The real project is now a busway study | shallow water and mud: bridge rebuild vs immersed tube vs bore; viaduct and at-grade tools | `meta` site (baked) plus the corridor; seed: 13 disused ways, 10.2 km [01 s.3]; seabed -4.0 m mid, -18.6 m deepest [02 s.4.3]; Meta on BAY_MUD (point-dependent) [02 s.5.1]; UP card; wetlands permit binder | M5 |
| II | 4 | **BART Silicon Valley Phase II**, 9.66 km | $12.746B (YOE to 2039); February 2039 [05 s.3.3]; scope-matched | one 16.2 m bore vs paired twin 6.6 m with shallow stations: the design-scope gap; set-piece drive; idle machine storage | seed: 16 OSM proposed ways and 4 proposed station nodes [01 s.3]; funding table and $564M gap [05 s.3.3]; station depths (not found, UNVERIFIED) | M6 |
| II | 5 | **Second transbay crossing (Link21)** | $18B to $30B (2023 dollars, 1% to 2% design); no date [05 s.3.2]; not scope-matched: the alignment and every quantity are assumed, so the model SQ and the residual are printed with no band | deep water; a long set-piece drive in STIFF_CLAY under the mud; crowding relief; gauge rule | alignment fictional and labelled (East Bay landing UNVERIFIED); transect seabed [02 s.4.3]; `yMin` -128; BART track rejects standard-gauge stock [05 s.2.2] | M6 |
| III | 6 | **Campus loop** (fictional): Redwood Shores, Meta, Bay View, Googleplex, Nvidia, SJC, Apple Park branch | none | network design for demand; tier 3 and 4 machines | LODES jobs, not employer headcounts [05 s.5]; all campuses sit within 8 m of datum [02 s.4.2] | M7 |
| IV | 7 | **High-speed rail into the Bay** (9.2) | $18.87B is Gilroy to the Central Valley Wye (YOE) [05 s.3.12], wider than what the mission builds: shown as a whole-programme figure, not scope-matched, until the Gilroy to Wye length and structure split are sourced | rock shield, multiple headings, fault crossing, state cash flow | annex site tiles outside the grid; Qfaults; $1B/yr cap-and-invest stream 2030 to 2045; the data items in 9.2 | M7 |

### 9.1 Campus branches (Oracle, Meta, Googleplex)

- Compatibility (decision 29): the branches are Caltrain: 25 kV, mainline loading gauge, through trains to San Francisco. Machine: Mainline EPB, tier 0 on land, so the first branch can ship at M3. A Pod or Metro shuttle with a transfer is available in Free Dig and is the comparison the Pod class exists for.
- Order: Googleplex and Bay View is mission 2 (M3), Oracle is side mission S1 (M4), Meta's station is the land leg of mission 3 (M5), so all three named campuses are reachable before the water crossing; the loop that joins them is mission 6.
- Demand anchor: jobs within 800 m of each station from LODES WAC, counted at bake and stored in the record [05 s.5]; employer headcounts are unpublished. Riders are scripted from that count until M4 (8).
- Googleplex branch, reference design (DERIVED from 6.3; a test input, not a quote): 3.1 km Mainline bore in wet ALLUVIUM at $108,000/m x 1.2 = $402M; 55 weeks of burn $69M; machine $53M (half if the Portal machine is reused); launch $25M; one vent shaft $45M; two 200 m two-track stations at $180M each (the $126M metro station scaled by platform length, TUNING); systems $34M. Hard about $1.0B; with seismic, soft and land about $1.3B at PL, about $4.5B at SQ. Cut-and-cover under Shoreline Boulevard (a 12 x 8 m box, TUNING) prices the same running tunnel at about $330M including utilities, against about $550M bored: the mission's design choice is surface disruption against money.
- Savings arithmetic (DERIVED from 6.6): the Portal releases $2.31B of non-federal money ($1.26B committed + $1.05B state). Built at about $1.5B with the federal slice reimbursing its 49% share, the player keeps about $1.5B; with F1 and no federal money, about $0.8B; at SQ prices, nothing. So a branch is affordable near PL par and out of reach at SQ, which is the point.
- Employer co-funding card: up to half the branch, capped at $1B (anchor: the $1B Facebook floated for Dumbarton in 2019 [05 s.3.5]). Governance cost: the employer fixes the station within 300 m of its door and the card costs 10 PC (TUNING) [07 s.7].
- Acceptance bands are in M3 (Googleplex), M4 (Oracle) and M7 (loop).

### 9.2 High-speed rail

- Scope. In-grid: Diridon to the grid's south edge, seeded from the OSM CAHSR proposed ways (65 ways, 103.9 km, relations 15570754 and 9466656 [01 s.3, rec. 7]). The Peninsula is "blended" in the 2026 plan ($1.29B, HSR rides Caltrain with almost no new infrastructure [05 s.3.12]): it is the existing Caltrain line with a 110 mph cap (UNVERIFIED [09 s.6]), not something the player builds. San José to Gilroy is outside the sponsor's totals ($2B to $5B "shared benefit" [05 s.3.12]) and appears in the atlas only. Annex: the Pacheco strip (13.5 mi main bore plus about 1.5 mi second tunnel, secondary source).
- Geometry. A line carries a design speed, and `v = sqrt(a x R)` sets its minimum radius: Mainline's 300 m is 62 km/h; the 110 mph cap needs about 2.4 km and 350 km/h about 9.5 km (DERIVED at a = 1.0 m/s2, TUNING; [09 s.6] says kilometre-scale). On an `hsr` line the curve detents start at that radius. Grade limits for HSR are not in the research (data item).
- Machines. Two tracks at up to 160 km/h fit the Mainline bore (the Łódź HSR tunnel is exactly that [06 s.2.3]). Full speed uses twin single-track 9.5 m bores, a fifth class added as data at M7 (dimension ASSUMED in [11 s.6.1]; HS2 uses 8.8 m ID [06 s.6.2]), driven as a paired drive. Rock uses the rock double shield: 1.5 x base, so about 15 m/day against 7 for an EPB in rock (anchors: Esme-Salihli 13.77 m, best month 455 m; rock machines above 700 m/week at the ceiling [06 s.6.3]). Multiple headings: a tunnel may be driven from both portals and from adits; each heading is a machine with its own capex, launch and burn. Pacheco from one EPB heading is about 8.5 years, from two rock headings about 2 (DERIVED).
- PL rates: the HSR rows of 6.3, each with its UNVERIFIED tag: formation $13M/km, 13 m viaduct $45M/km, mountain tunnel $1,090/m3, CPK whole-line budget $70M/km as the upper bound. The $30M/km greenfield figure is Spanish and French, not Polish, and is a cross-check only.
- Sanity rows: Pacheco tunnels PL and the Merced to Bakersfield no-tunnel ratio (6.7, gate M7).
- Data items not in the research, required before M7 text: the Gilroy to Wye length and structure split (to scope-match the $18.87B ghost); Pacheco portals from the San José to Merced EIR; HSR grade limits; an intercity trip table. The trip table is hand-authored and ASSUMED [09], so mission 7 prints riders with that label and does not score the Riders axis until it is sourced.

### 9.3 Project atlas (M3)

The brief says to map all the existing projects. Seven are missions; the rest of the [05 s.3] catalog is on the map as a non-playable layer: Geary/19th, Valley Link and Altamont, the Peninsula grade separations, Eastridge, the SJC connector and Diridon, SMART, South Bay Connect, the North Beach extension, ferries, Caltrain electrification (done), HSR San José to Gilroy. Each is a scenario record without mission logic: a polyline from OSM proposed or construction ways where they exist (Valley Link 2 ways and 14.8 km, Eastridge 6 ways and 7.6 km, CAHSR, BSV II [01 s.3]), otherwise a schematic line labelled as such; sponsor cost with basis and year, date, status, source. Drawn on the F map through the existing overlay; a click opens the card. It costs pipeline filtering and authored records, and turns a deferred mission into a data-only addition later.

## 10. Repo layout and module interfaces

### 10.1 Layout

```
/
  package.json            check, check:slow, test, e2e, e2e:swgl, e2e:smoke, e2e:preview, bench, build,
                          data:build, data:build:terrain, data:build:vectors, data:verify
  apps/game/              Vite composition root: boot, streamer, HUD shell, test hook, URL params; sw.js (M2b)
  packages/
    core/                 frozen contracts: frame, chunk, mesh, materials, manifest, world, sim, render, hook;
                          assets/{terrain,vectors}: binary layouts, decoders, materialAt
                          to add: ground (GroundQuery), stamps, tick output, view mask
    world/                ChunkWorldStore, ColumnSource (site, synthetic), rasterizer, edit log
                          to add: stamps bucketed by chunk, GroundQuery, alignment view mask, delta export
    mesher/               binary greedy chunk mesher (flat-merged), column mesher, worker pool
    render/               renderer, ChunkScene, palette, shaders, cap, overlay (lines, markers, solids, x-ray)
                          to add: region batching (M0), work lights, plan inset
    input/                actions, DOM binding, camera rig, picking
    sim/                  constants registry, cost model, projects, phases, headings, stations, reforms, events,
                          funding, comparison, saves. To add: machines and needle, hand digs and backlog,
                          stamps, SimEvent in the tick output. Imports core only
    demand/      (M4)     catchment model, later zones, logit LUT, assignment; worker entry. Pure, imports core only
    tools/                brush, possess, retract, plan, place, probe: actions to Commands + previews
    scenarios/            scenario records, loaders, validation; data/ holds authored geometry (alignments, voids,
                          tunnel depths, utilities corridors, geology overrides, event tables, atlas entries)
                          and reference command scripts with their counter budgets
    ui/                   Preact panels: HUD, receipt, timeline, cards, scorecard, profile panel
    audio/       (M0.5)   WebAudio synth driven by SimEvent
    pipeline/             build-time only: terrain, vectors, far; sites.json; never imported by the app
    testkit/              synthetic worlds, memory world and GroundQuery, naive mesher, command-script runner,
                          goldens, cost-model scope fixtures
  data/
    fixture/     (M0)     extract-stage inputs for one site tile + goldens; baked portal site, cropped far raster, rail
    sources.lock.json (M0)
    duckdb-ext/           pinned DuckDB extensions (gitignored, hashes in the lock)
    raw/                  gitignored downloads and the Overture archive
  e2e/                    Playwright specs, camera paths, baselines; projects gpu, swgl, webkit, firefox, preview
  docs/PLAN.md  docs/research/
```

Import rules follow [10 s.6], plus: the cost model is a pure module inside `sim` (a function of scope, levers and the constants registry, with no access to sim state) and moves to its own package when `sim` passes about 5,000 lines (TARGET); `sim`, `demand` and `audio` import only `core`; `ui` sees snapshots, events and command types only; `render` never imports `sim`. One agent owns one package at a time; anything two packages share is a type in `core`, changed additively and in its own PR, landed in the contracts step that opens each milestone (11).

### 10.2 Seams

Existing contracts, to be read in the files and not copied here:

- `packages/core/src/`: `VoxelCoord`, `ChunkKey`, `Aabb`; packed quad, `MeshInput`, `MeshOutput`, `MeshChunkFn`; `Material`; `WorldManifest`; `ChunkData`, `WorldStore`, `WorldEdit`; `Command`, `Sim`, `SimSnapshot`, `SaveFile`, `Scenario`, `Tool`; `CameraState`, `RenderStats`, `ChunkRenderer`; `GameTestHook` (with `view`, `dig`, `benchFrames`); `assets/terrain.ts` (`TerrainRaster`, `ColumnUnit`, `materialAt`); `assets/vectors.ts` (`RailNetwork`, `SiteVectorTile`).
- `packages/world/src/column-source.ts`: `ColumnSource`, `ColumnSample`.
- `packages/render/src/overlay.ts`: polylines, markers and solids in world metres, with x-ray.
- `packages/sim/src/{types,constants}.ts`: `GameCommand`, `GameSnapshot`, `ScenarioDef`, `ProjectView`, `ComparisonView`, `ReformView`, `EventView`, `Constant`.

Additions this plan needs, sketched. Everything here is additive to what is built, and `tbmInput` in particular is fixed at M0.5 because `core` and `sim` contracts only grow afterwards:

```ts
type Vec3Mm = [xMm: number, yMm: number, zMm: number];

// core/ground: all the sim may ask about the ground. Defined as generator + scenario voids and no-dig + stamps +
// deltas, independent of resident chunks. Implemented by world (also headless) and by testkit.
interface GroundQuery { materialAt(p: Vec3Mm): number; isNoDig(p: Vec3Mm): boolean;
                        firstVoid(a: Vec3Mm, b: Vec3Mm, radiusMm: number): string | null }  // void id, for breakthrough

// stamps: sim state, saved; applied to the world as edits after sim.step, in order.
// 'tube' = flat-ended swept disc with a joint sphere at interior vertices (drives); 'capsule' and 'box' for mined
// work, pits and voids. Endpoints in mm, so a 3% grade is not stair-stepped by integer metres. No lining field:
// lining is a mesh. One stamp per straight run; in curves one per 4 m chord (TUNING) of the mm record.
interface Stamp { id: number; kind: 'tube' | 'capsule' | 'box'; a: Vec3Mm; b: Vec3Mm; radiusMm: number; fill: number }
type WorldEditV1 = WorldEdit
  | { t: 'addStamp'; stamp: Stamp } | { t: 'growStamp'; id: number; b: Vec3Mm } | { t: 'removeStamp'; id: number };

// view mask: meshing only. A polyline in XZ (two points = a free plane), a lateral offset, a side, a radius.
interface ViewMask { line: Int32Array /* x, z pairs, mm */; offsetMm: number; side: 1 | -1;
                     focus: [xMm: number, zMm: number]; radiusMm: number }
interface WorldStoreV1 extends WorldStore {
  applyEdit(e: WorldEditV1): ChunkKey[];                                 // stamps are bucketed by chunk
  setViewMask(mask: ViewMask | null): ChunkKey[];                        // only chunks whose masked set changed
  paddedCopy(key: ChunkKey, out: Uint16Array): void;                     // applies the current mask
  exportDeltas(): { chunk: string; rle: string }[];  importDeltas(d: { chunk: string; rle: string }[]): void }

// sim: machine classes and a driven heading (additive to FrontState and GameCommand)
interface MachineClass { id: 'pod' | 'metro' | 'mainline' | 'mega' | 'hsr'; boreMm: number; tracks: number;
                         minRadiusM: number; maxGradeBp: number; baseMmPerDay: number }
type Shield = 'epb' | 'rock' | 'slurry';
interface DrivenFront { classId: MachineClass['id']; shield: Shield; posMm: Vec3Mm;
                        yaw16: number; pitch16: number; yawAcc32: number; pitchAcc32: number;   // 2^-32 turn
                        thrust: 0 | 1 | 2 | 3 | 4; curve: number; grade: number;                // detents
                        faceMaterial: number; band: [lo: number, hi: number]; needle: number;   // 0..100
                        wearBp: number; settlementBp: number; possessed: boolean; cruise: boolean;
                        record: Int32Array /* tick polyline in mm: the alignment record, replayed verbatim */ }
type GameCommandV1 = GameCommand
  | { t: 'possess'; frontId: string | null }
  | { t: 'tbmInput'; frontId: string; thrust: 0 | 1 | 2 | 3 | 4; curve: -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;
      grade: -2 | -1 | 0 | 1 | 2; cruise: boolean }
  | { t: 'retract'; frontId: string; toRing: number } | { t: 'abandon'; frontId: string }
  | { t: 'dig'; projectId: string; method: 'cutAndCover' | 'mined'; shape: 'sphere' | 'box';
      a: VoxelCoord; b: VoxelCoord; r: number }
  | { t: 'undoDig'; digId: string }                                      // only while still HOARDING and undrained
  | { t: 'placeStationBox'; projectId: string; stationId: string; template: 'statusQuo' | 'catalogue';
      at: VoxelCoord; quarterTurns: 0 | 1 | 2 | 3 }
  | { t: 'probe'; at: VoxelCoord };
type SimEvent =
  | { t: 'ring'; frontId: string; material: number } | { t: 'breakthrough'; frontId: string; into: string }
  | { t: 'charge'; cents: number; sqCents: number; polandCents: number; at: VoxelCoord }   // cents = your price
  | { t: 'faceChange'; frontId: string; material: number }
  | { t: 'settlement' | 'obstruction' | 'flood' | 'card'; ref: string } | { t: 'opened'; projectId: string };
interface TickOutput { tick: number; events: readonly SimEvent[]; edits: readonly WorldEditV1[] }
interface SimV1 extends Sim { step(commands: readonly Command[]): TickOutput }   // void return widened; no drain API
type CreateSimFnV1 = (scenario: ScenarioV1, seed: number, ground: GroundQuery) => SimV1;

// receipt: ComparisonView.factors (design, unitPrices, softContingency, delay) is the receipt of 6.6.
// To add: 'seismic' (lo, hi), 'land' and 'hazards' factors; `yours`; `official { amount, basis, year, scopeMatched }`
// and `residual` on the ghost's basis; a ConstantId on every part.

// scenarios: additive to ScenarioDef
interface ScenarioV1 extends ScenarioDef { site: string; simWorldVersion: string;
  voids: { id: string; box: Aabb }[];                                   // the train box, existing stations
  noDig: { id: string; box: Aabb; material: number }[];                 // existing tunnels, pile zones
  guide?: Waypoint[]; grants?: { classId: MachineClass['id']; shield: Shield }[];
  possessionScale: number; setPieces: { fromMm: number; toMm: number; kind: string }[];
  events: { atMm: number; kind: string; ref: string }[];                // the density table of 5.8
  par: { polandCents: number; source: string };
  ghost?: { cents: number; basis: 'yoe' | 'dollarsOf'; year: number; scopeMatched: boolean; source: string };
  riders: { forecast: number; source: string }; referenceScripts: string[] }

// demand (M4): pure, worker-safe
interface NetworkGraph { stationXZ: Int32Array; lines: { stops: Uint16Array; headwayS: number; runS: Uint16Array }[] }
interface DemandResult { ridersByLine: Int32Array; boardingsByStation: Int32Array; newRiders: number;
                         minutesSavedPerDay: number; calibrationErrorBp: number }
function recompute(data: DemandData, net: NetworkGraph): DemandResult;

// save: additive. `commands` is the full command log, so a save can be replayed on a newer simWorldVersion.
// hook: additive
interface GameTestHookV1 extends GameTestHook {
  events(sinceTick: number): SimEvent[];                                 // cursor into a tick-indexed ring buffer
  audioState(): { context: 'running' | 'suspended' | 'closed'; cutterheadGain: number };
  inputLog(): { tick: number; action: string }[] }                       // playtest measurements
// RenderStats gains: quadsDrawn, regions, depthMode ('reversed' | 'logarithmic' | 'standard'),
//                    chunksGeneratedLastFrame, bytes { chunks, meshes, caches }.
```

## 11. Milestones

Every acceptance check runs headlessly:

- `pnpm check`: typecheck, Biome, repo lint, the fast Vitest tier. No wall-clock gate inside it.
- `pnpm check:slow`: pipeline goldens on the fixture, the 1,000-seed property suites, the reference scripts with their counter budgets.
- `pnpm e2e`: Playwright `gpu`, hardware Metal, launched with `--autoplay-policy=no-user-gesture-required` so an AudioContext can run without a gesture.
- `pnpm e2e:swgl`: SwiftShader, 320 x 240, a reduced scene (W radius 2 chunks, C and F off through URL params) with a 60 s timeout; software GL is far slower than hardware [10 s.8.2], and whether it could boot the full fixture scene inside a default timeout is UNVERIFIED, so it is not asked to.
- `pnpm e2e:smoke`: Playwright `webkit` and `firefox`, structural asserts only (boot, codec round-trip, one dig, one pick, depth mode), no perf gates.
- `pnpm e2e:preview` (from M2b): the built app under `vite preview`, for the service worker. The dev server that the other projects use does not serve a service worker or hashed bundles the way the build does.
- `pnpm bench`: all wall-clock numbers, reported, never gated in `check`. `pnpm data:verify`: opt-in, against the real PBF.

Structural asserts through `window.__game` first, screenshots second [10 s.8.3]. Missions are driven by recorded command scripts in `packages/scenarios/data/*/scripts/`. Budgets and tolerances are not relaxed to make a change pass; the pre-declared fallbacks in 3.2 are the only levers.

Work packages are named by package. "Parallel" means no shared files and only `core` types in common. Each milestone opens with a **contracts step**: one PR to `core`, owned by the app + e2e package, that lands every type the milestone's packages share (the 10.2 sketches for that milestone); the parallel packages start when it merges.

### 11.0 State on 2026-11-09 and deltas

| Area | Built or in flight (MEASURED in the repo) | Delta this plan requires | By |
|---|---|---|---|
| `core` | frame, chunk keys, packed quad, materials, manifest types, world, sim and render contracts, test hook, terrain and vector asset layouts | additive only: `quadsDrawn` and the other stats now; the 10.2 types in each contracts step | M0 on |
| `world` | `ChunkWorldStore` over `ColumnSource` (site and synthetic), rasterizer, edit log; generation on the main thread | W band up to building tops; generation budget; stamps in mm bucketed by chunk; `GroundQuery`; alignment view mask; no-dig materials; delta export | M0; M1; export M2a |
| `mesher` | binary greedy chunk mesher with AO and flat variants, column mesher, worker pool, benches | flat as the default; AO and flat counts on the real site recorded | M0 |
| `render` | palette shader, sky, fog, water pass, horizontal cut with slice cap, x-ray, overlay layer, hover highlight; one draw per chunk | region batching and the multi-draw finding; work lights and F tier in the app; C tier | M0; M1; M2a |
| `input` | action map, DOM binding, camera rig, picking | drive view (section + plan inset), chase camera | M0.5, M1 |
| `pipeline` | terrain and vector stages; four sites baked, 3.9 MB; `node:zlib` in the vector stage; unpinned DuckDB extensions | `sources.lock.json`, Overture archive, pinned extensions, fflate, fixture goldens; far-raster layers and size fix, block bake; merged `manifest.json` with two versions; OFR 00-444 strata | M0; M1; M2a; M2b |
| `sim` | constants registry with sources, types for projects, phases, headings, stations, reforms, events, funding and the Poland comparison; reforms; geometry. Steps one day per tick, runs nominal USD, depends on `world` | 1 hour tick; machines, needle and possession; `GroundQuery` instead of `world`; `TickOutput`; hand digs and backlog; your price; currency basis and rates per open decisions 1 to 3; levers reconciled to section 6 under the 6.7 bands (6.8); seismic, land and residual lines | toy M0.5; machines M1; reconciliation M2a; receipt M2b |
| `apps/game` | boot, streamer, HUD shell, hook with `dig`, `view`, `benchFrames` | possession flow, one-number HUD, audio, event fan-out, service worker | M0.5, M1, M2b |
| `e2e` | `gpu` and `swgl` projects, both Chromium | `webkit`, `firefox`, `preview` projects; autoplay flag; reduced swgl scene | M0; M2b |
| `tools`, `ui`, `scenarios` | placeholders (scenario stubs exist) | everything | M1 on |

### M0. Foundation (in flight)

Scope: bring what is being built to its engineering gates and commit it: chunk world with lazy column sources and edits; both meshers in the worker pool; renderer with region batching, horizontal cut, caps, x-ray and overlay; orbit camera and picking; brush dig; terrain and vector pipeline for the `portal` site with a committed fixture and pinned sources; streamer that keeps the W window loaded around the focus under the generation budget; planning-level sim (commands, projects, phases, headings, ledger) deterministic. No economics gate: the cost model keeps being worked on in `sim`, but its bands gate M2a.

| Parallel WP | Package | Delivers |
|---|---|---|
| world | `world` | store, edits, sources; W band to building tops; generation budget; regenerate-after-evict determinism |
| mesher | `mesher` | chunk and column meshers, pool, bench; AO against flat on the real site |
| render | `render` | renderer, cut and cap, overlay, stats including `quadsDrawn` |
| batching | `render` | 4 x 4 x 4 region buffers for W and for every column tier; the multi-draw and direction-bucket finding on three engines |
| input + tools | `input`, `tools` | action map, rig, picking, brush |
| pipeline | `pipeline`, `data/fixture` | both stages on fflate, lock file, Overture archive, pinned extensions, fixture and goldens |
| sim | `sim` | tick loop, commands, hash |
| app + e2e | `apps/game`, `e2e` | composition, hook, streamer, camera-path player; `webkit` and `firefox` smoke projects |

Acceptance:
- Mesher: single voxel = 6 quads; solid chunk = 6 quads; total face area equals the naive mesher's exposed-face count on 100 random chunks; no interior faces across chunk seams with real padded borders; byte-identical output for identical input [10 s.8.1]. Column mesher: a flat patch is one quad; a hole emits nothing and no side towards it. Quad counts with AO and flat on the `portal` site are recorded in 4.3.
- World: `carveCapsule` (the existing primitive: rounded ends, integer endpoints, so the axis runs through voxel centres) with radius 3.3 m over 100 m on three fixed axes (along x, along z, oblique): the voxel count equals a golden count per axis and lies within +/- 9% of the analytic capsule, 3,572 m3 (DERIVED: cylinder 3,421 + sphere 150.5). A centre-aligned 6.6 m section rasterizes to 37 cells against 34.2 (+8.1%) and a corner-aligned one to 32 (-6.5%), so a +/- 2% voxel tolerance is unreachable on axis-aligned drives and is not asserted anywhere; exactness lives in the analytic booking (M1). Dirty keys include touched neighbours; evict and regenerate gives identical chunk hashes; `getVoxel` 300 m above the Salesforce Tower footprint returns a building material inside the W window.
- Batching: on `soma-orbit` every frame has draws <= 500 with the region count reported; W generation never exceeds 16 chunks in a frame; the multi-draw route is recorded as proven or not on each engine.
- Data (`check:slow`): the fixture pipeline run twice is byte-identical and matches goldens; a lock mismatch fails with one line naming the entry; a missing extension with the network off fails with one line naming it; the Overture archive exists with its hashes in the lock. `data:verify` matches the [01 s.3] row counts. Spot checks on the baked `portal` site: surface at 4th and King 3.7 m +/- 1 and at the Transit Center 5.5 m +/- 1 [02 s.4.2] (the 2026-11-09 bake gives 3.67 and 5.23, MEASURED); both columns are FILL over BAY_MUD [02 s.5.1]; the tallest column within 100 m of Salesforce Tower is 326 m +/- 8 [04 s.2]; at least 99% of site footprints own a cell at 4 m (99.4% measured in [04 s.4.3]); open-Bay probe points classify as WATER; the Caltrain line from San Francisco to Tamien is one connected component with `service` ways excluded [01 s.3]; every file within its bake bound (3.6).
- Sim: same seed + commands gives the same `simHash` twice; a ten-game-year run stays inside its counter budget (ticks, `materialAt` calls); milliseconds appear only in `pnpm bench`.
- e2e `gpu`: renderer string is ANGLE Metal; boot to `ready` on the fixture with zero console errors; on camera path `soma-orbit` every frame meets quadsDrawn <= 1.0M, draws <= 500, GPU geometry <= 64 MB, app-owned bytes <= 400 MB; a brush dig reaches pixels within 2 frames at p95; `pick()` through the cap at 5 probe points returns `materialAt` for that column and depth; boot transfer <= 6 MB; codec round-trip passes in Chromium. The SoMa worst-case chunk and quad counts are written into 4.6.
- e2e `webkit` and `firefox`: boot to `ready`; codec round-trip; one dig changes `getVoxel`; one pick returns `materialAt`; `stats().depthMode` is asserted per engine. If headless WebKit on macOS cannot create a WebGL2 context, that is recorded here and decision 25 falls back to a manual smoke.
- `swgl` boots the reduced scene inside 60 s.

### M0.5. Toy

Scope: the cheapest thing that can prove or kill pillar 1, on what M0 already has. Possession on the baked `portal` site or a synthetic strata world: one machine carving with per-tick `carveCapsule` as built (integer endpoints are good enough for a prototype; the stamp seam is M1), the needle model of 5.4 with its table, curve and grade detents, the drive view (a first section plus the plan inset), one obstruction, a breakthrough into a box void, placeholder audio. No ledger, no C or F tier, no cost model, no reconciliation, no owner decision in the way.

Contracts step: `tbmInput` with thrust levels and detents, the needle fields of `DrivenFront`, `breakthrough`, `TickOutput`. These are final; the rest of 10.2 waits for M1.

Acceptance:
- Needle (unit, 1,000 seeds per material): at a level the table lists as in band the needle stays in band over 200 m with wander on; at a level whose target is outside the band it leaves within 3 lag lengths; a mixed face narrows the band; cruise never leaves the band.
- A scripted drive through `command()` fires `breakthrough` exactly once and ends with `pick()` at the face returning AIR. M0 counter budgets hold.
- **Go/no-go 1** (manual, owner): thrust, needle, depth and breakthrough, with no numbers on screen. Is it worth building on? If not, the needle, the views and the sound are iterated here, where nothing downstream has been built.

### M1. Slice: drive to the train box

Scope: the playable slice. Real SoMa terrain, buildings and strata as voxels from 4th and King to the Salesforce Transit Center with the F raster as backdrop and fog over the seam; authored train box void, no-dig volumes, pit outline, guide corridor and event table; existing rail on the overlay; the granted Mainline EPB carving through stamps, possessed or on cruise, from the pit to a breakthrough into the train box; the alignment-following section; retract and relaunch; synth audio; one running cost number at your price with the gap indicator, on the recommended basis. Not in M1 (moved to M2a or M2b, where the mission needs them): the C tier, date counters, SQ and PL columns, the SQ/PL ratio and date acceptance, planned-against-driven equivalence, delta export, the regime switch (a debug toggle only).

| WP | Package | Delivers |
|---|---|---|
| contracts (first, serial) | `core` | `GroundQuery`, `Stamp`, `WorldEditV1`, `ViewMask`, `DrivenFront`, snapshot fields for the HUD, hook additions |
| machines | `sim` | 1 hour tick; classes and shields; driven heading with thrust, needle, detents, accumulators, rings, face sampling through `GroundQuery`, ground factors, gauges, no-dig refusal, breakthrough, retract, hazards of the M1 rows |
| stamps + mask | `world` | stamps from headings, pits and voids; `GroundQuery`; alignment view mask with its budget |
| tier + lights | `render`, `mesher` | F tier in the app, work lights, lining rings and machine mesh on the overlay, plan inset |
| possession | `input`, `tools` | drive view, chase camera, possess and retract tools, pit outline, mask handle |
| HUD | `ui` | top bar, one running cost number and gap indicator, cockpit gauges |
| audio | `audio` | cutterhead, ring, breakthrough |
| Portal data | `scenarios` | paper check (5.4), train box void, no-dig volumes, guide corridor, pit outline, depth table, Rincon Hill override, event table, `possessionScale`, schema |
| scale probe (beside) | `testkit`, `render` | synthetic 100 km world with F + C + W on the `gpu` project |
| far raster (beside) | `pipeline` | surface class, built mass and tower prisms; the 1 m height units; the suburban and open-water block bake |

Acceptance:
- Machine: a scripted 200 m drive books exactly pi x r^2 x L in integer litres (a flat-ended tube; pure sim, no voxels). The carved voxel count equals a golden count on three fixed axes (centre-aligned, corner-aligned, oblique) and lies within +/- 9% of the analytic volume. Launch axes are snapped so the section rasterizes at its nominal width: through voxel centres for odd widths (Metro 7, Mainline 13), corners for even (Pod 4, Mega 16). Under random input over 1,000 seeds, minimum radius and maximum grade are never violated, including at advances under 48 mm per tick. `breakthrough` fires exactly once, on the tick whose stamp first intersects the void. The shield refuses to enter EXISTING_STRUCTURE. From every stuck state reached by random input, retract plus cruise completes the mission.
- Seam: every sim test runs on a `testkit` `GroundQuery` with no chunk store; all consumers receive the same event array per tick; the charged ledger equals the sum of `charge` events read through the hook cursor; the reference drive is at most 400 stamps (DERIVED: 1.3 km in 4 m chords at worst), added and grown, never re-sent.
- Slice script: the cruise drive from the authored pit reaches the train box; it lasts 180 to 300 real seconds at the record's `possessionScale` (ticks / scale, headless); no gap between events exceeds 30 s; game duration matches length over strata-weighted rate within 2%; the guide alignment satisfies Mainline radius and grade and clears every PILE_ZONE and EXISTING_STRUCTURE by 3 m (a geometric check on the record).
- World: chunks along the drive regenerate to identical hashes after leaving and re-entering the W window; resident chunks never exceed 3,000.
- e2e `gpu`: the scripted drive via `command()` ends with `pick()` at the face returning AIR and the HUD showing the running cost; with the mask on, `pick()` at 8 points along the authored guide line returns AIR or an infrastructure hit, never terrain; a 4 m mask step is complete within 4 stepped frames; M0 counter budgets hold in the drive view and with the chase camera inside the tunnel; while thrust is above 0, `audioState().context === 'running'` and the cutterhead gain is non-zero; three screenshot baselines.
- Scale probe: the JSON is written; counters are within 4.6, or the 3.2 ladder steps needed are applied and recorded. This gates wiring C into the app at M2a.
- Pipeline: the far raster with its M1 layers is inside its bound, or the bound change is recorded in 3.6; the block-bake sizes replace the extrapolation in 3.6.
- **Go/no-go 2** (manual, gates M2): three fresh players, no instructions beyond the three prompts, measured from `inputLog()`. Thresholds, written before the playtest (TUNING): at least 2 of 3 finish the drive with cruise on for under 30 s in total; at least 1 of 3 starts a second drive or opens Free Dig unprompted within 2 minutes of the breakthrough; the median longest stretch without an input change is under 30 s. Missing two of the three means iterate here; if it still misses, driving becomes set pieces only (5.3 already supports that) and M2a to M7 are re-scoped before any of it is built. Also one manual `?bench=soma-orbit` run on a mid-range laptop.

### M2a. Open the line

Scope: station box prefab in two templates (SQ forced), platform, entrance, vent shaft; open-cut and mined brushes with the works backlog and the undo window; auto track and lining; train on a spline; ribbon; the ride; a minimal scorecard with the ghost; one reform card; save/load v1 with autosave, export and the command log; the merged manifest with both versions; the C tier in the app; the cost model reconciled (6.8, after open decisions 1 to 3) with the registry gate; delta export. Parallel WPs: `sim` (backlog, stations, saves, cost model), `tools` (place), `ui` (minimal scorecard, card), `render` (C tier, prefab previews, train, hoarding to concrete), `pipeline` (manifest), `scenarios` (station templates, first reference script).

Acceptance:
- Cost model: the 6.7 rows gated M2a pass at both ends of the seismic range; every number the game displays resolves in the constants registry (negative test: a literal outside the registry fails `pnpm check`); SQ / PL for the bore-only scope of the mission 1 Mainline drive is in 2.4 to 3.3 (DERIVED from the levers in 6.4: 1.5 x 1.35 x 1.69 / 1.1 = 3.1 on tunnel civil, less on machine capex); the PL cost of the drive equals the cost model's price of the same scope to the cent.
- Stations: catalogue and SQ boxes differ in volume by 1.5x to 1.7x; a prefab box and a hand-dug void that receives the same platform cost the same.
- A driven path and its record replayed verbatim as a planned alignment carve the same voxels and book the same cost.
- Save, reload, same `simHash`; an unknown `schemaVersion` fails with the version named; a `simWorldVersion` mismatch refuses with both versions named and the replay produces a diff; a rebake that changes only `assetVersion` leaves the save loading unchanged.
- e2e: Playwright plays from the first frame to the scorecard; first input accepted within 10 s of `ready` [08 rec. 8 allowed 45]; no stretch over 15 s without accepted input; the ride plays and can be skipped; with C on, the counter budgets hold on `soma-orbit`.
- A playtest sits between M2a and M2b (owner, and the M1 players if available): unscored, its notes feed M2b.

### M2b. The receipt

Scope: binder stack with the flashback lapse; funding as one bar with one gate, slices in the drawer; five reforms as cards; events (What Lies Beneath, Settlement, Cap-and-Invest Renegotiation); probe; the full receipt with land, seismic range, hazards and the residual on the ghost's basis; scripted riders; onboarding prompts; the service worker and the `preview` project; strata v2 beside it. Parallel WPs: `sim` (tokens, funding, reforms, events), `tools` (probe), `ui` (receipt, timeline, cards, scorecard, onboarding), `apps/game` (service worker), `scenarios` (Portal record, three reference scripts), `pipeline` (strata v2), `audio` pass.

Acceptance:
- Reference scripts complete inside their counter budgets. As-planned (real design, SQ template, no cards): SQ in $5.5B to $8.2B, opening 2035 to 2037, exceeds released non-federal funds. Reformed as-planned: PL in $1.2B to $1.8B, opening 2032 to 2033 and at least 2.5 years before the SQ date (6.5). What-if (Mainline bore, catalogue station, F1 + S1): inside non-federal funds. The scorecard states which design was built.
- Receipt lines sum to the totals to the cent; the residual against $6.84B is computed on the YOE basis, printed, and within 25%.
- Every number in the receipt, scorecard and card DOM carries a source attribute that resolves in the registry, and `verified: false` entries show their label; HUD numbers resolve in the registry and carry no label.
- Offline (`preview`): after one online play, `context.setOffline(true)` and a reload boot to `ready` and load the `portal` site.
- Strata v2: the `simWorldVersion` bumps and the regenerated goldens land in one PR, and the Portal scripts' hashes do not change (the corridor is authored, 3.3).
- Before text is final: read the Portal SEIS/SEIR for segment lengths by method, cross-sections, train box levels, and whether a bored option was studied (owner or agent task; today UNVERIFIED [05][08]); the seismic and land research tasks of 6.3.

### M3. Trees, campaign shell, Googleplex branch, atlas

Scope: data-driven policy tree (11 nodes) and tech tree with costs and gates; PC; Savings carry-over; learning curve; the M3 rows of the event deck; sources button and registry table UI; mission select on the F map; the project atlas; Free Dig beyond the `portal` site; mission 2 with the driven free-form route, employer co-funding and WAC job counts.

Acceptance: the invariant of section 7; property test: every reform weakly lowers cost or time and none changes the PL base line; every node has a source id and a non-empty who-pays that changes a number in play; a mission with 2 stars on every axis affords at most two nodes; the delivery-method card fires at 25% +/- 3 points over 1,000 seeds; tech tiers give the advance row of 6.7 and reproduce the tech-effect table within one point; Savings persist across missions; one golden save per shipped schema version migrates and reproduces its hash; the Googleplex reference script (bored, two stations) prices in $1.0B to $1.6B at PL, its cut-and-cover variant prices lower, and its riders equal the recorded job count x capture rate; every [05 s.3] project has an atlas record with cost, basis, year, status and source, and those with OSM ways draw them.

### M4. Plan, catchment demand, side missions

Scope: Plan verb, profile panel, cruise on planned lines, trains per hour; the catchment demand model with offline calibration and minutes saved on the scorecard; corridor bakes along the Peninsula main line; S1 (Oracle branch); S2 (PAX, cut list).

Acceptance: BART and Caltrain weekday riders within 25% of 204,800 and of the 40,000 to 46,000 band; The Portal adds 15,000 to 40,000 daily riders (forecast 25,000+ [08 s.1]); moving a station towards jobs never lowers its riders; recompute gives integer, hash-stable outputs inside its counter budget; a planned Mainline line with a 200 m curve is rejected with a one-line reason; a cruise drive stays within 2 m of its plan; S1 through wet ground is slower and dearer than the same length in STIFF_CLAY by the table factors; if S2 ships, its SQ estimate is within 25% of $2.0B to $2.5B on that ghost's basis.

### M5. Water and mud

Scope: mission 3; seabed from bathymetry; flood rule; immersed tube, viaduct and at-grade methods; slurry shields; UP and wetlands cards.

Acceptance: five seabed samples on the Ferry Building to Oakland transect match [02 s.4.3] within 2 m; a drive at 0.5 D cover under water in BAY_MUD triggers the flood event and at 1.2 D does not; an EPB shield is refused under open water; the Dumbarton reference scripts (bridge, tube, bore) complete and rank by cost as the unit rates predict; immersed-tube rate carries a source or a visible UNVERIFIED label; the ghost is shown as not scope-matched.

### M6. Big bores

Scope: missions 4 and 5; Mega class; set-piece drives; the paired twin-bore redesign; the growth rule and crowding feedback; fault flag; gauge rule; demand v2 if promoted.

Acceptance: BSV II as designed inside $10B to $15B SQ on its YOE basis; its PL twin-bore redesign at most half the PL single-bore design; Link21 prints the model SQ and the residual, and its scope record lists every assumed quantity; with the growth rule run forward the Transbay Tube passes a 0.8 load factor in a printed year and drops below it after the crossing opens, and at the 2026 baseline it is below 0.8; BART track rejects standard-gauge stock; crossing a fault polygon without a design choice is blocked; in each reference script the set pieces and lapses of a drive total under 5 real minutes. If v2 is promoted: halving Caltrain headway raises its riders 25% to 50% (headway elasticity about 0.5 [09 s.3.2]); `demand` file <= 3 MB.

### M7. Campus loop and HSR

Scope: missions 6 and 7; Pacheco annex strip; rock shield and multiple headings; the `hsr` profile and the 9.5 m class.

Acceptance: every mission's reference script completes and reaches 3 Cost stars at full reform; the 6.7 rows gated M7 pass; an `hsr` line rejects a curve under its design-speed radius with a one-line reason; Pacheco from two headings takes half the calendar of one and books two machines; a rock shield at a soil face runs at x0.3; annex tiles load under their own site id; every campus station carries a job count and every loop segment prints a PL estimate.

### M8. Whole Bay and ship

Scope: R tier, all 1,920 site tiles and 480 R tiles, tier windows with hysteresis, LRU eviction, soak; shareable scorecard image and network URL; credits and data licence screens; `dist/` and `dist-data/` artifacts. No deploy step.

Acceptance: hosted data <= 150 MB, <= 20,000 files, none over 25 MiB [10 s.5]; no tile fails the bake bounds; camera path `caltrain-ride` (San Francisco to San Jose at 300 m): app-owned bytes grow <= 20 MB after warm-up, JS heap after a forced GC grows <= 20 MB, GPU geometry <= 64 MB, no uncovered region for more than 30 stepped frames; a second run offline succeeds on the `preview` project; the densest tile (found by scanning quads per region at bake time) meets the counter budgets; a scorecard URL round-trips to the same `simHash` on the same `simWorldVersion` and shows its stored figures, labelled, on any other; the credits screen lists every `sources.lock.json` entry. One manual mid-range laptop bench run by the owner.

Critical path: M0, M0.5, M1, M2a, M2b. Beside it: the scale probe and the block bake (M1), the cost-model reconciliation (from M0, gating only M2a), strata v2 (M2b).

## 12. Risks and cut list

| # | Risk | Signal | Retired in | Response |
|---|---|---|---|---|
| 1 | Driving a TBM is dull after two minutes | go/no-go 1 (owner, M0.5); go/no-go 2 (three players, thresholds in M1) | M0.5, M1 | Iterate needle, views and event density at M0.5 and M1. If the M1 thresholds still miss, driving becomes set pieces only and Plan + cruise carries the game |
| 2 | 1.0M drawn quads at 60 fps on an integrated GPU has never been measured in a browser [03 s.6]; the DERIVED load is 1.0M to 1.6M | M0 counters and frame report; M1 scale probe and laptop run | M0, M1 | Ladder in 3.2, coarse tiers first. Gates do not move |
| 3 | Real downtown density exceeds per-km2 averages taken from two 7 km2 samples [04 s.4.3]; towers add up to 10 chunk layers | M0 `soma-orbit` and the SoMa worst-case count | M0 | same |
| 4 | Alignment mask remesh hitches while dragging | a 4 m step over 4 stepped frames at M1 | M1 | Radius and snap are the knobs; then a curtain mesh along the alignment [03 s.8] |
| 5 | Mission 1's bored what-if does not fit: Mainline radius, cover or grade against the real street grid and train box level | paper check before M1 Portal data | M1 | Reception exemption on cover; else the paired twin Metro fallback, labelled (decision 16) |
| 6 | The cost model cannot reproduce real quotes without fudge | 6.7 bands, residual over 25% on scope-matched ghosts | M2a, M2b | Fix the model or scope record; else show that ghost as not scope-matched, with the PL estimate only |
| 7 | Scope inputs are assumed (Portal cross-sections, all of Link21, HSR viaduct share, Gilroy to Wye) [11 s.6.5] | reviewers dispute a receipt | M2b, M6, M7 | Read the SEIS/SEIR before M2b text; label fictional alignments; no bands on unmatched ghosts |
| 8 | Strata below the surface unit are invented [02 s.1] | experts object | M1 | "Modelled strata" label, hand overrides on mission corridors, boring log shows the rule |
| 9 | Existing-tunnel depths are unsourced [01][04] | collisions look wrong | M2b | Hand table per mission corridor, marked approximate |
| 10 | Real-map surface feels like tracing [08 s.2.2] | M3 play of the free-form branch | M3 | Authorship stays underground; Free Dig from the first frame; mission 2 has no authored line |
| 11 | Catchment demand misses calibration by more than 25%, or cannot answer network-shape questions | M4 fit; missions 4 and 5 | M4, M6 | Label the error; promote the logit (v2) for the missions that need it |
| 12 | The message reads as partisan or wrong | reception | M2b on | PPP basis, receipt with sources, x4 not x20, Polish failure cards, the seismic line as a labelled range, process as antagonist |
| 13 | Unverified facts leak into game text | registry gate | M2a on | Gate in `pnpm check`; `verified: false` renders with a label on the receipt, scorecard and cards, or the card is removed |
| 14 | Licence terms (BART and VTA GTFS, 511, TCP dataset) | unread | M4 | Hand-authored headways; no TCP rows bundled |
| 15 | Parallel agents collide on shared contracts | merge conflicts in `core` | every M | A contracts step opens each milestone; `core` changes are additive only |
| 16 | 2026 election results and legislation still moving [07] | start state goes stale | M3 | Start state is data with citations and an `asOf` date |
| 17 | Scope: seven missions, two trees, demand [08 s.3] | milestones slip | every M | Cut order below; M2 is already split in two with a playtest between |
| 18 | Implementation started before this plan and already diverges (currency basis, day tick, lever set, no possession, `sim` importing `world`) | 11.0 deltas stay open | M0.5 to M2a | The toy and the slice do not wait for the economics; the 6.8 reconciliation is an M2a exit item; open decisions 1 to 3 are asked first |
| 19 | Pinned sources disappear (Overture release, Geofabrik dated file) before the whole-Bay bake | a lock entry no longer downloads | M0 | Local archive at M0; owner archives `data/raw/` outside the repo |
| 20 | Safari or Firefox differ (depth extension, multi-draw, integer attributes, `DecompressionStream`, storage eviction) | smoke projects | M0 | Structural smoke per engine; logarithmic depth measured before an engine is called supported; saves always exportable |
| 21 | The seismic premium and the land line are unsourced, and the seismic line defines what reform cannot fix | research tasks before M2b text | M2b | Printed as ranges with labels; 6.7 Bay Area rows must hold at both ends |
| 22 | Tech feels weak next to policy (about 7% against x3.5) | open decision 8 | M3 | Say so in the UI, or add station-side tech with labelled evidence |

Cut order if time runs short (first cut first): tech tier 4; the whole-Bay bake and the R tier (keep the F raster, fog and the mission corridors); crowding feedback; fault flag; Pod class; immersed tube (bore or bridge only); the side missions (PAX, then the Oracle branch); OSM car matrix (straight-line fallback); demand v2 (stay on the catchment model); Plan verb (cruise follows authored lines only). The HSR annex strip is not on this list until open decision 12 is answered; if the owner picks the epilogue, it goes second. Never cut: the toy, your price with the PL gap, the receipt with sources, breakthrough, the underground views, the Googleplex branch, save/load, the headless gates, The Portal.

## 13. Open decisions for the owner

To be asked one at a time. Work proceeds on the recommendation until answered; each notes what it blocks. None of them blocks the toy (M0.5).

1. **Headline price basis.** RESOLVED 2026-11-09 by the owner: per route-km, nominal USD, all-in, against the Polish design at Polish prices (section 1 headline, 6.1). Rejected: PPP as the primary basis (kept as the tooltip and the "same design" receipt line). Remaining sub-question, not blocking: whether the price-level gap (1.61) can be closed by a late-game reform or stays as a permanent receipt line; built as a permanent labelled line until answered.
2. **Polish tunnel rate.** RESOLVED 2026-11-09 by the owner: per-km headline anchored on Polish urban rail tunnels (Warsaw metro, Łódź); road-derived data used for unit rates and timelines only. This is option (a) per-class anchors for pricing. Rejected: the road-derived rate on every bore as the headline (1.9x the Polish metro record).
3. **VAT in the Polish baseline.** (a) Keep contract values gross; the 23% acts as an implicit contingency [11 s.5.2]; (b) strip it (18.7% off every Polish-anchored figure, ratios up by as much as 1.23x) and let the reformed 10% reserve do that job. Recommendation: (a). Blocks the M2a reconciliation.
4. **The Portal and the TBM.** (a) Real design is the ghost and buildable; a bored two-track tunnel, driven with a granted Mainline EPB, is a labelled what-if in mission 1; (b) mission 1 strictly cut-and-cover + mined, first TBM in mission 2. Recommendation: (a). Blocks the M1 Portal data.
5. **Real names.** (a) Real agencies and projects, facts only, sources button on every card; (b) lightly fictionalised. Recommendation: (a) [07 s.7]. Blocks M2b text.
6. **"Transit bay" in the dictated brief.** Read here as the second transbay crossing (Link21). (a) Confirm; (b) it meant a product or map (no "BetterTransit" tool was found [08 s.2.1]); (c) something else. Blocks nothing until M6.
7. **Campaign order.** (a) The Googleplex branch as mission 2 (M3), the Oracle branch as a side mission (M4), real projects after; (b) real projects first, one campus branch as a side line at M4; (c) campus lines strictly after all real projects. Recommendation: (a): the brief's most distinctive ask arrives in the second hour, on tiles that are already baked, in different ground from mission 1, and it tests the tracing risk early. Blocks M3 mission select.
8. **How much innovation should move.** The tech-effect table in section 7: every machine tier together moves a metro line's cost by about 7% and its boring time by 2.25x. (a) Accept it, say in the UI that machines buy time and reform buys money, stop at tier 4 (0.90 utilisation, labelled vendor target); (b) as (a), plus a fictional tier at the vendor's 230 m/day claim, Pod bore only, labelled as fiction; (c) add station-side tech (prefab station modules, automated fit-out) acting on the half of hard cost that is stations; its effect sizes would be TUNING with no measured evidence beyond the standardisation factors of [06 s.6.6], and labelled so. Recommendation: (b), and (c) only after a research task finds evidence. Blocks M3 tech data.
9. **Oracle Redwood Shores.** (a) Keep as a destination with a note that the HQ left [05 s.5]; (b) swap for another anchor (Genentech, Stanford). Recommendation: (a). Blocks M4.
10. **Repo and hosting.** (a) Public repo, Cloudflare Pages when the owner chooses to deploy; (b) private repo (then an ODbL offer of the derivative database or method is needed some other way [01 s.7]); (c) GitHub Pages (1 GB cap, no commercial use [04 s.9.2]). Recommendation: (a). Blocks M8 packaging choices only.
11. **Distribution and monetisation** [08 q.10, rec. 11]. (a) Free web game, open source; (b) free first mission on the web, paid desktop build later; (c) free, closed source. Recommendation: (a) for v1; it matches 10 (a) and the ODbL posture, and (b) stays possible later as long as Free Dig and sharing stay in the free build. Blocks the M8 sharing features and what Free Dig includes.
12. **HSR.** (a) Pacheco as an annex voxel strip at M7; (b) HSR ends at the grid's south edge with Pacheco as a scripted epilogue. Recommendation: (a). Until this is answered the annex strip is not on the cut list. Blocks M7.
13. **Default voxel.** (a) 1 m with the 2 m fallback last on the 3.2 ladder; (b) 2 m everywhere now. Recommendation: (a), which is what is built. Blocks nothing.

Owner tasks that are not decisions: play the M0.5 toy for go/no-go 1; bring three fresh players for the M1 playtest; run `?bench=soma-orbit` once on a real mid-range laptop at M1 and M8; archive `data/raw/` (about 1.2 GB) outside the repo once the M0 Overture export exists; a manual Safari and Firefox smoke per milestone if the headless projects cannot run; read the BART and VTA GTFS terms and the 511 agreement, or accept hand-authored headways.
