# 08. Game design references and core loop

Researched 2026-11-09. Evidence tags: **[F]** page fetched and read, **[S]** seen only in a search-result snippet (treat as lower confidence), **[M]** from memory, not re-verified this session (UNVERIFIED). Anything tagged UNVERIFIED must not be shipped as fact in game text.

Cost and engineering figures here are only what the design needs; the cost-benchmark and Portal-engineering research docs are the source of truth and should override these if they disagree.

## 1. Facts that constrain the design

| Fact | Value | Source |
|---|---|---|
| The Portal tunnel is cut-and-cover plus a mined tunnel, not a TBM bore | Contract 40-CT covers "cut-and-cover structures and mined tunnel"; construction shaft and laydown for the mined tunnel at Townsend and Third; throat at Second and Howard widens from 2 to 6 tracks | [F] [SFCTA memo, Jan 2026](https://www.sfcta.org/sites/default/files/2026-01/SFCTA_CAC_Item9_TJPAPortalProjectFiscalYear2026MEMO_2026-01-28.pdf) |
| Portal length | 1.3 mi (2.1 km), Fourth and King to Salesforce Transit Center | [F] same memo; [F] [Wikipedia](https://en.wikipedia.org/wiki/The_Portal_(San_Francisco)) |
| Portal cost | $8.25B (Aug 2023, incl. trainbox); indicative $7.57B (Jul 2025), $6.84B excl. trainbox | [F] SFCTA memo |
| Portal cost history | ~$600M (1999, downtown extension), $6B (2018), $6.7B (Jan 2023), $8.25B (2023). The 1995 figure of $491M to $686M was for the new terminal, not the extension; do not chain it with the DTX numbers | [F] Wikipedia |
| Portal schedule slip | 2027 (RAB study), 2032 (as of Jan 2023), 2036 (current, subject to funding) | 2027 and 2032: [F] Wikipedia; 2036: [F] SFCTA memo only (Wikipedia still says 2032) |
| Portal funding | FTA CIG share $3.38B; remaining gap ~$2.2B | [F] SFCTA memo |
| Portal governance | Six-party MOU: TJPA, Caltrain, CHSRA, MTC, CCSF, SFCTA | [F] SFCTA memo |
| Portal enabling works | Relocate or protect 20+ utilities on Townsend; demolish 7 buildings | [F] SFCTA memo |
| Trainbox already exists | Built with the Transit Center, opened Aug 2018; 6 tracks, 3 island platforms planned | [F] Wikipedia |
| DTX ridership uplift | +25% system ridership by 2040, 25,000+ added daily riders (2019 Caltrain modelling, via advocacy blog) | [F] [Green Caltrain](https://www.greencaltrain.com/2019/05/caltrain-forecasts-25-ridership-boost-from-downtown-extension/) |
| EPB TBM average advance | 85.5 m/week across 46 TBMs on 22 projects (about 12 m/day on 2 x 12 h shifts, 7 days/week); range 33.7 to 184.8 m/week; soft ground, mostly metro tunnels | [F] [Robbins, WTC 2014](https://www.robbinstbm.com/wp-content/uploads/2010/04/16_EPBPerformance_WTC2014.pdf) |
| Boring Co. Prufrock | "Targeting a speed of 1 mile per week" (page meta: "more than one mile per week") [F] [boringcompany.com/prufrock](https://boringcompany.com/prufrock). The 7 miles/day figure is not on that page; it is a 2022 company statement about a next-generation machine (MB3, still being built as of June 2026) | [F] [Wikipedia](https://en.wikipedia.org/wiki/The_Boring_Company) citing Engadget 2022 |
| Prufrock achieved | 40 to 46 m/day in 2024 | [S] Wikipedia mirror only, UNVERIFIED. The current Wikipedia article and the vendor page give no achieved rate; do not use as a tuning anchor |
| NY cost premium decomposition | Stations x2.06, procurement x1.85, labor x1.5, systems x1.35 (on hard costs), soft costs x1.2; overall 8 to 12x baseline, point estimate 9.34 | [F] [Transit Costs Project final report](https://transitcosts.com/?p=14795) |
| Warsaw M2 Bemowo to Karolin | 1.62bn PLN for 3.9 km (about 415M PLN/km, my arithmetic). This is the value quoted while the section was under construction (article dated Jun 2022, on the Bemowo opening), not a final outturn cost | [F] [Railway Gazette](https://www.railwaygazette.com/metro/warszawa-metro-extension-opens/62093.article) |
| Warsaw M2 in TCP database | Extensions: $194M to $200M/km (PPP, cost-year dollars) or $249M to $261M/km (2025 dollars) in the TCP dataset; TCP web pages use another price basis (Trocka page: $219.8M/km). Central section 2010 to 2015: $505.6M/km cost-year, $709.3M/km 2025 dollars, $596.7M/km on the web page. Pick one basis and state it | [F] [TCP dataset](https://transitcosts.com/data/) (sheet fetched 2026-11-09); [F] [TCP Warsaw Line 2](https://transitcosts.com/warsaw-line-2/), [F] [Trocka extension](https://transitcosts.com/warsaw-line-2-extension-to-trocka/) |

Design consequences:

- **Mission 1 is not a TBM job in reality.** Either (a) the tutorial teaches all three methods on one short alignment (cut-and-cover on Townsend, mined or bored under Second, fit-out of an existing box), with the TBM as the player's "reform" option, or (b) the TBM fantasy starts in mission 2. Recommendation: (a). Whether a TBM bore was formally studied and rejected for the Second Street segment is UNVERIFIED; ask the Portal-engineering doc.
- **The multiplier is not "several times".** $7.57B / 2.1 km is about $3.6B/km (my arithmetic; includes station fit-out, throat, yard, systems, so a per-km comparison flatters nobody). Against $0.20B to $0.26B/km PPP for Warsaw extensions (range depends on price basis, see table) that is roughly 14x to 18x; 14x is the like-for-like 2025-dollar figure, and whether $7.57B is year-of-expenditure dollars is UNVERIFIED. The fantasy "Polish prices times several" understates the real gap; the game can honestly show both.
- **The five TCP factors multiply to about 9.3** (2.06 x 1.35 x 1.5 x 1.85 x 1.2 = 9.26, my arithmetic, vs. the report's 9.34). That is a ready-made, citable reform tree: five branches, each a real multiplier.
- **Real time is long.** 2.1 km at 12 m/day is about 175 days of pure boring; the real project is 2026 to 2036. Time compression must make a decade feel like minutes and make the non-digging years (the comedy) visible.

## 2. Reference games

### 2.1 Direct competitors: real-map transit builders

| Game | Facts | What works | Where it bores or breaks | Lesson for us |
|---|---|---|---|---|
| **Subway Builder** (Colin Miller / Borough Studio) | Beta 2025-10-09, 1.0 2026-02-10, Steam 2026-07-17; Win/Mac/Linux [F] [Wikipedia](https://en.wikipedia.org/wiki/Subway_Builder). $30 direct, $39.99 Steam [F] [site](https://www.subwaybuilder.com/), [F] Steam store API (US). Internet needed to load map tiles [F] site. Steam: Mixed, 61% of 463 [F] [Steam](https://store.steampowered.com/app/4039140). 55 cities plus sandbox as of Oct 2026 [F] Wikipedia | Census-driven commuters via distance-based gravity model; mode choice on time, cost, time of day; per-commuter analysis of waits, transfers, income [F] Wikipedia, [F] [Savvy Gamer](https://www.thesavvygamer.com/gaming/recreational-urban-planning-what-makes-subway-builder-so-fun). "Tunnels, viaducts, cut-and-cover, all have trade offs"; must negotiate building foundations and road layouts [F] site. Real maps are the hook (10% of positive review weight) [F] VaporLens | Review negatives by weight: always-online 34%, performance 26%, UI 25%, overpriced 22%, weak tutorial 12%, painful line editing 6%, shallow 5% [F] VaporLens. Commuters prefer to avoid transfers [F] Wikipedia (tagged citation-needed there; "over-avoid" is this doc's reading, UNVERIFIED). No failure state described; framed as low-stakes [F] Savvy Gamer | It already owns "real census commuters on a 2D map". Do not compete on simulation fidelity. It **hides** the cost problem: costs are set to overseas levels because that was "the only way the game would be playable" [F] Wikipedia (the "make playing impossible" wording is [S] only, UNVERIFIED). Wikipedia puts US costs at "generally between 2 and 5 times higher", well below the Portal ratio above. Our game makes that gap the central mechanic. Also: work offline, ship a real tutorial, keep editing cheap |
| **NIMBY Rails** (Carlos Carrasco, solo) | Early Access since 2021-01-26; Win/Linux; multiplayer [F] [Wikipedia](https://en.wikipedia.org/wiki/NIMBY_Rails). 84.99 zl regional; Very Positive, 88% of 1,282 English reviews; 55 GB install [F] [Steam](https://store.steampowered.com/app/1134710/NIMBY_Rails/). US price $18.99 to $19.99 [S] | Whole-world OSM map; real-scale track; tracks hit-test against streets, rivers, other tracks; curve radius limits speed [F] [dev retrospective](https://carloscarrasco.com/nimby-rails-retrospective/). VICE: "feeds the ultimate YIMBY fantasy" [F] Wikipedia | "Simplistic passenger demand system"; no sound or music as of 2023; controls and text UI criticised; **no NIMBYs in a game called NIMBY Rails**; eminent-domain prototype dropped [F] Wikipedia, [F] retrospective. Money is optional [F] Wikipedia | The politics layer its title promises is an unoccupied niche. OSM buildings were cut for size and coverage; he concluded buildings "will need to be procedurally generated" [F] retrospective. A solo dev can ship a real-world rail game, but a whole-planet pipeline took a 1.4 TB RAM instance; one metro area avoids that |
| **Metro Dreamin'** | Free web app, AGPL-3.0, Next.js + Firebase + Mapbox GL, 96 stars [F] [GitHub](https://github.com/the-nemz/metro-dreamin). Each map shows Score, Ridership, Cost, stations, lines, length [S] | Zero-friction draw-and-share; public gallery with "Top Scores Today", stars [F] [site](https://metrodreamin.com/explore) | No simulation over time; score method not documented on fetched pages (UNVERIFIED how it is computed) | Shareable URL per network plus a one-line scorecard is the community loop. Fantasy-map people want to publish, compare, and argue |
| **"BetterTransit"** | No product by this name found in search. Possibly a voice-transcription artifact or a small community tool; UNVERIFIED | n/a | n/a | Confirm with the owner what was meant (Transitmix/Remix are the professional analogues [S] [Human Transit](https://humantransit.org/2015/01/transitmix-continues-its-development.html)) |

### 2.2 Abstract transit puzzles

| Game | Facts | What works | Lesson |
|---|---|---|---|
| **Mini Metro** | Prototyped in a weekend for Ludum Dare 26; browser alpha Sept 2013; Early Access Aug 2014; 1.0 Nov 2015 [F] [Wikipedia](https://en.wikipedia.org/wiki/Mini_Metro_(video_game)) | One lose condition: "a station becomes overcrowded for an extended period". Weekly reward choice (trains, tunnels, bridges, lines, interchanges). Tunnels are a scarce inventory item. Modes: Normal, Extreme (no edits), Endless, Creative [F] Wikipedia | A single legible failure signal beats a spreadsheet. Scarce "crossings" make water a real decision; the Bay is our water. The **free web build "front-and-center on the index page"** drove awareness and survival of the studio; "Mini Metro is a game defined by its scope" [F] [postmortem](https://www.gamedeveloper.com/audio/postmortem-dinosaur-polo-club-s-i-mini-metro-i-) |
| **Mini Motorways** | GDC 2023 talk by Tana Tanoi [F] [Thumbsticks](https://www.thumbsticks.com/hustle-and-bustle-how-mini-motorways-built-its-wuselfaktor/) | "Wuselfaktor": pleasure of watching many predictable agents on a growing network. Player controls a narrow, critical part only; "numerous but small and impactful decisions". Find the toy first (took about 4 months); "It doesn't matter why things are happening" | Rejected prototype: **roads over real-world map data "didn't evolve smoothly and didn't feel like building your own city"** [F] Thumbsticks. Warning for us: a real map can feel like tracing. Counter: the underground is blank and the player's own |
| Both | Procedural audio: every sound generated by game events (Mini Metro) [F] postmortem; music driven by the traffic scheduler, horns "only as annoying as is necessary" as an information channel, goal to "tone down the stressfulness" [F] [Game Developer](https://www.gamedeveloper.com/design/turning-road-noise-into-music-mini-motorways) | | Audio as state readout, see section 4.10 |

### 2.3 Tycoon and city-builder transit

| Game | Evidence | Lesson |
|---|---|---|
| **Transport Fever 2** | Economy "a very rudimentary form", never changes across eras; campaign "plays as if we just used a cheat for unlimited money"; "requires a lot of clicking"; the logistics network itself is the fun [F] [Gamepressure](https://www.gamepressure.com/editorials/reviews/transport-fever-2-review-good-sim-poor-tycoon/z520c) | Good sim, weak game: money without pressure is noise. If money exists it must bind |
| **Cities: Skylines II** | Launch: transit vehicles freezing, poor explanation of how to create routes [S] [PCGamesN](https://www.pcgamesn.com/cities-skylines-2/review); developer said the economy did not meet quality standards [S] [Gamepressure](https://www.gamepressure.com/newsroom/cities-skylines-2-economy-didnt-meet-quality-standards-at-launch/z2692a) | Deep agent sim is a liability if it is not legible and stable. Aggregate flow model first, agents as decoration |
| **Cities: Skylines 1 / SimCity** | [M] Line drawing as stop-to-stop clicks; per-line colour and vehicle count; SimCity advisors and ordinances as the policy UI. UNVERIFIED this session | Advisor characters are a proven wrapper for policy choices; reuse for the red-tape layer |
| **Railway Empire 2** | Campaign of 5 chapters; each sets tasks with a deadline; some compulsory, some optional [S] [Games Asylum](https://www.gamesasylum.com/2023/05/25/railway-empire-2-review/) | Scenario = task list + deadline + optional objectives. Fits "deliver The Portal before 2036 / under $X" |
| **OpenTTD** | GPL reimplementation; subsidies pay +50% to 4x on a specific route for a period [S] [OpenTTD wiki](https://wiki.openttd.org/en/Manual/Subsidy) | Time-limited grants pull the player toward specific corridors: a natural model for FTA/state grant offers |
| **Workers & Resources: Soviet Republic** | Steam about 91% positive; realistic mode praised; negatives: steep learning curve, missing onboarding, UI flood [S] [VaporLens](https://vaporlens.app/app/784150/workers_resources_soviet_republic) | Construction-as-logistics (materials and crews must physically arrive) is loved by a niche and repels everyone else. Make it an opt-in difficulty, not the default |
| **Voxel Tycoon** | Early Access since 2021-04-15, $24.99 [S] [SteamDB](https://steamdb.info/app/732050); 78% of 1,565 positive; research unlocks buildings, chains, vehicles; terraforming is late-game and expensive [F] [Steam](https://store.steampowered.com/app/732050/Voxel_Tycoon/) | Closest "voxel + trains + research" precedent. Voxel look is fine for a tycoon camera. Five-plus years in Early Access: scope risk of pairing a tycoon with a factory game |

### 2.4 Dig, build, automate

| Game | Evidence | Lesson |
|---|---|---|
| **Minecraft** | No tutorial; first night is the forcing function ("Create shelter or die") [S] [Game Developer](https://gamedeveloper.com/design/learning-from-minecraft). Loop: mine, craft, build, explore [S] | One verb (break block, place block) with instant feedback carries the first hour. A soft forcing function teaches better than text. Our equivalent of nightfall: the rush-hour train arriving at an unfinished station, or a grant deadline |
| **Deep Rock Galactic** | Combines Minecraft-style fully destructible worlds with exploration [S] [Co-Optimus](https://www.co-optimus.com/editorial/1978/page/2/indie-ana-co-op-and-the-deep-rock-galactic-interview.html); "procedural level design" mixing handcrafted parts and code [S] [GamingBolt](https://gamingbolt.com/deep-rock-galactic-interview-heigh-ho-off-to-plunder-we-go) | [M, UNVERIFIED] The feel comes from: terrain that carves in rounded chunks, a Driller class whose tunnel is a visible persistent trace, strong lighting contrast (flares), and breakthrough moments into caverns. Breaking through into an existing void is the payoff; the Salesforce trainbox is exactly that void |
| **Factorio** | Technologies and science packs are the main progression; pack unlocks made explicit so players see "where to get them and what they lead to"; campaign redesigned because forcing a new factory each mission "severely limits player investment"; fix was one persistent, expanding map [F] [FFF-245](https://www.factorio.com/blog/post/fff-245); branching pack choice went unnoticed by most players [S] [FFF-275](https://factorio.com/blog/post/fff-275) | **One persistent Bay Area, missions expand it**; never reset the player's network between scenarios. Keep the tree mostly linear with visible gates; fake branches are wasted design |
| **Satisfactory** | Tier 0 is a fixed-order onboarding sequence and is skippable; later tiers open in any order within a tier; phase deliveries gate tier pairs [S] [Satisfactory wiki](https://satisfactory.wiki.gg/wiki/Tier_0) | Tutorial = Tier 0 of the real tree, skippable on replay. Big "phase" deliveries (open a line) gate tiers |
| **shapez** | Open-source, Factorio-inspired, free web version alongside paid Steam build; Steam demo runs to level 7 [S] [GitHub](https://github.com/tobspr/shapez.io) | Web-first with a paid or extended desktop build is a known path |
| **Brick Rigs** | Physics sandbox, build/drive/destroy; 200,000+ Workshop creations [S] [Steam](https://store.steampowered.com/app/552100) | Sharing creations is the long tail. Relevance to us is low beyond that; physics destruction is out of scope |

### 2.5 Toys

| Game | Evidence | Lesson |
|---|---|---|
| **Townscaper** | Free browser demo since Dec 2021, no download; creator calls it "more of a toy than a game"; click to build, undo/redo, no goals [S] [PC Gamer](https://www.pcgamer.com/au/the-most-pleasant-game-of-2021-is-now-playable-in-your-browser), [S] [Gigazine](https://gigazine.net/gsc_news/en/20211202-townscaper-demo-browser) | A browser 3D toy can be the marketing. One click must produce a complete, good-looking result (auto-fit station entrances, portals, vent shafts) |
| **Dorfromantik** | "The interaction the player does the most has to feel as satisfying as possible"; quests are counting goals shown in-world; non-counting criteria were cut as hard to communicate; nothing "too punishing for someone just building for aesthetics"; 10+ prototypes from a Ludum Dare start [F] [Game Developer](https://www.gamedeveloper.com/disciplines/sparking-joy-through-tile-placement-in-idyllic-village-builder-i-dorfromantik-i-) | Polish the most frequent action first (placing a tunnel segment / TBM advance tick). Objectives as countable in-world asks ("this campus wants 20,000 daily riders") |

## 3. Cross-cutting lessons

- **Money**: works when it binds (Mini Metro's scarce tunnels, Railway Empire deadlines) and bores when abundant (TF2 campaign) or optional (NIMBY Rails). Subway Builder sidesteps US costs entirely. Our money should be two visible numbers per decision, not one hidden one.
- **Time**: every reference uses pause plus 2 to 4 speeds. None models pre-construction delay. That is our differentiator and our main pacing problem.
- **Demand**: Subway Builder (census gravity model) is the high bar; NIMBY Rails (population in station radius; mechanism UNVERIFIED, Wikipedia only says "simplistic") is the low bar that still earned 88% positive. Start at the low bar plus employment anchors (campuses), upgrade later.
- **Failure**: best-liked failures are single, visible, and physical (overcrowded station). Bankruptcy screens are disliked; toys with no failure retain casual players. Use star ratings and a "ghost" comparison instead of game over.
- **Onboarding**: the top complaints for both Subway Builder and Workers & Resources. Satisfactory's "tutorial is tier 0 of the real game" and Minecraft's forcing function are the two patterns worth copying.
- **Editing cost**: "once you've built out a network, it's very hard to change it" (Miller, [F] Savvy Gamer) and painful line editing is a review negative. Concrete is permanent in fiction; make *planning* fully undoable and *construction* permanent, and say so.
- **Where the genre bores**: late-game line micromanagement, timetables, opaque economies, clicking. We should end a scenario at ribbon-cutting plus a short operations montage, not hand the player a timetable.
- **Price anchors**: $19 to $40 for the PC incumbents; free web demos (Mini Metro alpha, Townscaper, shapez) as the top of funnel.
- **Scope**: Mini Metro defined itself by scope and still slipped a year; Voxel Tycoon and NIMBY Rails are in year 5+ of Early Access. One metro area, one mission, one toy first.

## 4. Design options for this game

### 4.1 Player fantasy

"I am the one person in the Bay Area who can actually get it built." Three stacked fantasies, in order of how often the player touches them:

1. **Digger**: carve the earth, hear the cutterhead, break through into the station box.
2. **Planner**: draw the line everyone on r/transit has drawn, on the real map, and watch real places light up.
3. **Reformer**: delete the reasons it costs about 15x and takes 40 years, and watch the price tag fall.

### 4.2 Verbs

| Verb | Scale | Input | Feedback |
|---|---|---|---|
| Survey | Map | Drag a section line; reveals geology, utilities, foundations as a cutaway | Voxel layers peel back; unknown ground costs risk |
| Plan alignment | Map | Spline with snapping; depth handle per node | Live curve radius to speed readout (as NIMBY Rails does [F] retrospective), live dual price tag |
| Choose method | Segment | Paint segment: cut-and-cover / mined / TBM / elevated / at-grade | Street-disruption overlay vs. cost vs. time |
| Sink shaft | Voxel | Minecraft-style dig in first or third person | Blocks pop, spoil trucks queue |
| Launch and drive TBM | Voxel | Throttle plus small steering corrections inside a tolerance tube | Advance counter, ring-build rhythm, face pressure gauge |
| Fit out station | Voxel/prefab | Place modules: platform, mezzanine, entrance, vent | Capacity and cost per module (stations are the x2.06 lever) |
| Open service | Line | Set trains per hour | Riders flow; scorecard |
| Lobby / reform | Policy | Spend political capital on a reform card | A named multiplier drops on every open ledger |

### 4.3 Loops

- **Moment to moment (5 to 30 s)**: advance the face, keep the TBM in tolerance, clear spoil, place the next segment or module. Must be satisfying with zero economy attached.
- **Project loop (5 to 15 min)**: survey, plan, clear process, dig, fit out, open, scorecard.
- **Strategic loop (hours)**: scorecards pay out funding and political capital; spend on tech and reform; unlock the next corridor on the same persistent map (Factorio expanding-map pattern).

### 4.4 Direct TBM driving vs. planning-level drawing

| Option | For | Against |
|---|---|---|
| A. Planning only: draw line, watch TBM | Scales to the whole Bay; cheapest to build; matches Subway Builder/NIMBY Rails | Loses "Minecraft for tunnels"; competes head-on with two shipped games; voxels become decoration |
| B. Direct only: first-person dig everything | Strongest feel; unique | 2.1 km at human pace is tedious; Link21 or HSR is impossible; real TBMs are steered by small corrections, not WASD |
| C. Hybrid: plan on the map, then "possess" any machine | Both fantasies; driving is optional skill expression; planning carries scale | Two cameras, two control schemes, two tutorials |

Recommendation: **C, with the planning layer as the game and possession as the toy.** Rules:

- Any TBM runs on autopilot at a baseline rate. Possessing it gives a bonus (e.g. +25% advance, lower settlement risk) for staying in tolerance, like a rhythm minigame. Never required.
- Hand digging (Minecraft verbs) is limited to small volumes: shafts, cross-passages, station caverns, clearing obstructions. Big volume is always the machine.
- The cutaway view (surface fades, tunnels glow) is the default strategic camera; first person is entered by clicking a machine or worker.
- Mini Motorways rejected real-map roads because they did not feel like the player's own city [F] Thumbsticks. The underground is our blank canvas; keep the surface read-mostly so everything the player authors is below ground or at station sites.

### 4.5 Time scale

- Calendar is always visible; default 1x = roughly one game week per real second (UNVERIFIED tuning guess; 10 years is about 9 minutes at 1x). Speeds: pause, 1x, 4x, 16x, plus "skip to next decision".
- Reference rates for tuning: 12 m/day conventional EPB average; 26 m/day best project average in the Robbins sample; Prufrock target above 1 mile/week (about 230 m/day) [S]. At 12 m/day, The Portal's 2.1 km is about 175 days; the remaining 9+ years of the real schedule are everything else.
- **Pre-construction is shown as a queue of physical tokens** (binders, hearings, lawsuits) sitting on the timeline in front of the TBM, each with a duration. Reforms shorten or delete tokens. The player sees the machine idle in the launch pit while the calendar spins. That image is the game's thesis.
- When possessing a TBM, time locally slows so 30 to 90 s of driving covers a meaningful drive; the calendar jumps on exit.

### 4.6 Win, lose, and scoring

- No hard game over in the campaign. Each scenario is graded on four axes, 1 to 3 stars each:

| Axis | Metric | Benchmark shown |
|---|---|---|
| Riders | Daily boardings added | Agency forecast (e.g. 25,000+ for DTX [S]) |
| Time | Rider-minutes saved per day | Before/after isochrone |
| Cost | Capital cost per daily rider | Real estimate and Polish-rate estimate |
| Delivery | Opening year | Real planned year (2036 for The Portal [F]) |

- Cost per rider is the headline number (the metric transit-cost writers use to rank projects, see [S] [Pedestrian Observations](https://pedestrianobservations.com/2024/02/11/costs-per-rider-and-willingness-to-build/)).
- Soft failures with physical readouts: settlement cracks a building (pay, delay, lose capital), funding lapses (project freezes; a grant clock like OpenTTD subsidies), station overcrowding after opening (Mini Metro signal).
- Optional "Status Quo" hard mode: fixed budget, no reforms, bankruptcy possible. This is where the lose condition lives.
- Sandbox: infinite money, all tech, same data (Subway Builder's sandbox framing [F] Savvy Gamer).

### 4.7 Campaign vs. sandbox

- **One persistent Bay Area**; scenarios are regions and objectives unlocked on it, never fresh maps (Factorio's finding on investment [F] FFF-245).
- Proposed order (real projects first, fantasy later; alignments and facts for each belong to the other research docs):
  1. The Portal (tutorial; cut-and-cover, mined, optional TBM, station fit-out).
  2. A campus branch (first long TBM drive, first new stations, first fantasy line: e.g. Googleplex or Meta spur).
  3. BART Silicon Valley phase II (deep single-bore vs. twin-bore decision).
  4. Dumbarton (water crossing; bridge vs. tunnel).
  5. Link21 second transbay crossing (the Mini Metro "tunnel across water" moment at full scale).
  6. California HSR into the Bay (Pacheco Pass tunnels; long-distance scale).
  7. Open sandbox and shareable fantasy maps.
- Sandbox unlocks after mission 1, not at the end. The fantasy-map audience (Metro Dreamin', r/transit) wants to draw immediately.

### 4.8 "Bay Area mode" vs. "Poland mode"

Three ways to stage the contrast:

| Option | Description | Verdict |
|---|---|---|
| Difficulty toggle | Pick one at start | Weakest: player sees only one side |
| Split ledger | Every price tag and date shows both: Status Quo and Reformed | Core UI; always on |
| Ghost run | Like a racing-game ghost: the real project timeline runs alongside the player's (the real Portal opens 2036 at $7.57B) | Best payoff at the scorecard |

Recommendation: split ledger always, ghost at scorecard, and the **player moves from Bay Area mode toward Poland mode by earning reforms**, so "Poland mode" is the end state of the tree, not a setting.

Comedy rules:

- Jokes come from real, cited numbers and process, not from people or groups: the 1999 estimate of ~$600M next to $8.25B (nominal dollars, 24 years apart; say so on the card); opening dates 2027, 2032, 2036; a six-agency MOU; 20+ utilities; a station box finished in 2018 with no trains [F] sources in section 1.
- Deadpan presentation: a binder-thickness meter, a meeting counter, a consultant-headcount ticker, an "escalation" line item that grows while nothing happens.
- Polish counterpart is equally deadpan and specific (e.g. a Warsaw M2 extension contract value and length on a single card [S] Railway Gazette). Poland is the benchmark, not the punchline. Every Polish figure needs a source from the cost doc before it ships.
- Keep a "sources" button on every satirical card. Credibility is the joke's engine and the defence against "partisan game" readings.
- Do not make reform free of trade-offs: e.g. cut-and-cover is cheaper but disrupts streets (TCP itself recommends it where possible [F]); less review means higher settlement or utility-strike risk unless survey is done.

### 4.9 Progression and tech tree

Two trees, both mostly linear with visible gates (Factorio lesson), tiered and gated by ribbon-cuttings (Satisfactory lesson).

**Policy tree: five branches mapped to the TCP decomposition [F]**

| Branch | Real multiplier (NY case) | Example nodes |
|---|---|---|
| Station design | x2.06 | Standard station box; shallow cut-and-cover stations; no oversized back-of-house |
| Procurement | x1.85 | Itemised contracts; technical-merit award; public sector keeps risk |
| Labor and utilisation | x1.5 | Staffing to international norms; unrestricted muck haul hours |
| Systems standardisation | x1.35 on hard costs | Off-the-shelf signalling; one spec across agencies |
| Soft costs / in-house capacity | x1.2 | Permanent in-house engineering team; fewer consultant layers |

Plus a **process/time branch** (affects calendar, not unit price): single lead agency, concurrent utility relocation, environmental-review streamlining, funding certainty. Specific California mechanisms (CEQA exemptions and similar) must come from the policy research doc; none verified here.

**Tech tree: machines and methods**

| Tier | Unlock | Reference rate |
|---|---|---|
| 0 | Cut-and-cover, hand/mined excavation, standard EPB TBM | about 12 m/day [S] |
| 1 | Well-run EPB, continuous muck conveyors, precast segment plant | about 26 m/day [S] |
| 2 | Large single-bore (stations inside the bore), slurry TBM for bay mud | UNVERIFIED tuning |
| 3 | Continuous mining with simultaneous ring erection, surface launch ("porpoising") | 40 to 46 m/day claimed achieved [S, UNVERIFIED]; above 230 m/day is a vendor target, not an achievement [S] |
| 4 | Speculative: autonomous fleet, 7 miles/day vendor goal [S] | Label clearly as fiction |

- Currencies: **funding** (from grants and scorecards) buys things; **political capital** (from riders served and promises kept) buys reforms. Keep to two.
- Tech discounts apply to future projects only, so early missions stay expensive and the curve is felt.
- Label tiers 3 and 4 in-game as claims or speculation; the game's credibility depends on separating delivered from promised.

### 4.10 UI/HUD

- **Dual price tag** on the cursor for every placement: Status Quo / Reformed, and the delta the next reform would unlock.
- Top bar: date, speed controls, funding, political capital. Nothing else permanent.
- **Cutaway slider**: surface opacity plus depth slice; the single most important camera control in a tunnelling game.
- Timeline strip along the bottom showing the token queue (process, dig, fit-out, test) with the ghost schedule under it.
- Line and station inspectors as side panels, never modal; Subway Builder's UI is a top complaint (25% weight [F] VaporLens).
- TBM cockpit HUD when possessed: advance (m), thrust, face pressure, deviation reticle, ring counter. Three gauges maximum.
- Scorecard is a shareable image plus URL (Metro Dreamin' pattern).
- Planning is fully undoable; construction commits with an explicit "pour concrete" confirmation.

### 4.11 Audio

- Generative, event-driven (Mini Metro/Motorways pattern [F]): TBM advance drives a slow rhythmic bed; ring installation is a pitched percussive hit; trains passing stations play notes per line.
- Sound as information: cutterhead pitch drops in hard ground; a settlement alarm is "only as annoying as is necessary".
- Contrast as comedy: Status Quo process time is hold music and paper shuffling; digging is the first time the mix opens up.
- Breakthrough gets a dedicated silence-then-daylight moment.
- Web constraint: WebAudio synthesis over large sample sets keeps the download small (implementation detail for the tech doc).

### 4.12 Accessibility

Baseline from [Game Accessibility Guidelines, basic tier](https://gameaccessibilityguidelines.com/basic/) [S]: remappable keys, readable default text with scaling, no information by colour alone (line colours need patterns or labels; transit maps are a classic colour-blind failure), subtitles for any speech.

Game-specific:

- First-person tunnel sections are a motion-sickness risk: FOV slider, no head bob, no screen shake by default, and every first-person action also doable from the cutaway camera [S] (Xbox guideline 117 topic).
- Pause-and-plan always available; no action requires reaction speed (TBM driving is bonus only).
- Mouse-only playable; keyboard-only playable for planning; touch is a stretch goal.
- Units toggle (metric/US), since the audience is split between Bay Area and Polish/European players.
- Low-spec mode: lower voxel draw distance and no agents, same game.

## 5. Vertical slice: first 15 minutes, The Portal

Goal: one complete project loop, all eight verbs touched once, the thesis delivered as a number. No menus before first input.

| Time | Beat | Verb taught | What the player sees |
|---|---|---|---|
| 0:00 | Cold open. A voxel Caltrain pulls into Fourth and King and stops at the bumpers. Camera lifts, flies 2.1 km to Salesforce Transit Center, dives through the floor into a finished, empty trainbox. Caption: "Opened 2018. Trains: 0." [F] | none | The gap, physically |
| 0:45 | Prompt: "Connect them." Player drags from the terminal toward the trainbox | Plan | Spline snaps along Townsend, turns up Second; curve tightness shows a speed limit |
| 1:45 | Cutaway peels the street. Utilities under Townsend, foundations along Second appear only where the player sweeps the survey tool | Survey | Unknown ground shows a risk premium that vanishes when surveyed |
| 2:45 | Paint methods: Townsend = cut-and-cover, Second = mined or TBM, throat widening 2 to 6 tracks at Second and Howard [F] | Method | Street-disruption overlay vs. cost vs. time |
| 3:30 | Hit "Build". The Status Quo timeline unrolls: token queue fills the strip, the dual price tag reads the real figures ($7.57B, 2036 [F]) next to the Reformed estimate. TBM sits idle in the pit while the calendar spins | (thesis) | Deadpan counters: agencies 6, utilities 20+, buildings to demolish 7 [F] |
| 4:30 | An advisor offers one free reform card (suggest: single lead agency, or concurrent utility relocation). Player plays it; tokens visibly shrink; price and date drop | Reform | First taste of the strategic loop |
| 5:30 | Launch site at Townsend and Third [F]. Player digs the shaft by hand, Minecraft-style, 20 to 30 blocks, then the crane lowers the machine | Sink shaft | Spoil trucks, first tactile digging |
| 7:00 | Possess the TBM. 60 to 90 s of driving: throttle, keep the reticle in the tube, rings click into place on the beat | Drive | Advance counter, calendar ticking by weeks |
| 8:30 | Event: sensor flags settlement risk under a building. Choice: slow down (time), grout (money), or ignore (risk). Autopilot resumes after | Risk | A consequence with a physical readout |
| 9:45 | Cut-and-cover on Townsend runs in parallel as a time-lapse; player drops in the Fourth and Townsend station from prefab modules; the cost per module teaches that station size is the big lever | Fit out | Station box cost reacting to module count |
| 11:15 | Breakthrough into the trainbox. Sound drops out, light floods the face, crew cheers | (payoff) | The moment worth clipping and sharing |
| 12:00 | Track and systems auto-lay as a fast montage; player sets trains per hour | Open service | First train runs through to Salesforce; riders pour out |
| 13:00 | Scorecard: riders, minutes saved, cost per rider, opening year, with the ghost of the real schedule and budget beside the player's | Score | Stars, shareable card with sources link |
| 14:00 | Map pulls back to the whole Bay. Dotted lines pulse: transbay crossing, Dumbarton, San Jose, a spur to a campus. Tech and policy trees open with payouts to spend. Sandbox unlocks | Strategic loop | "Where next?" |

Slice scope limits:

- One alignment corridor with limited freedom (cannot leave the Townsend/Second envelope), one station to place, one TBM, one event, one reform.
- Demand is a scripted number, not a simulation.
- A few city blocks at full voxel detail; the rest of the Bay as a low-detail backdrop.
- If the mined-vs-TBM question for Second Street turns out to make a TBM implausible, keep the scripted TBM drive as the player's "what if" and label it as such on the scorecard.

## Recommendations for the game

1. **Position against Subway Builder and NIMBY Rails, not alongside them.** They own 2D real-map line drawing and census sims. This game owns the three things neither has: the 3D underground, the act of digging, and cost and process as the mechanic. Subway Builder's own developer set costs to overseas levels to stay playable; make that gap the game.
2. **Hybrid control: planning is the game, TBM possession is the toy.** Autopilot always works; driving gives a skill bonus; hand digging is for small volumes only.
3. **Find the toy first.** Prototype only: carve a voxel tunnel with a TBM, cutaway camera, breakthrough into a void, sound. If that is not fun with no economy, nothing above it will save it (Dinosaur Polo Club and Toukana both built this way).
4. **Split ledger everywhere, ghost run at the scorecard.** "Poland mode" is the earned end state of the reform tree, not a difficulty toggle.
5. **Reform tree = the five Transit Costs Project multipliers plus a process/time branch.** Every node cites a source in-game. Label vendor claims (Prufrock targets) as claims.
6. **One persistent Bay Area map.** Scenarios unlock regions; never reset the player's network.
7. **No game over in the campaign.** Four-axis star grading (riders, time saved, cost per rider, opening year); hard failure only in an opt-in Status Quo mode.
8. **Tutorial is mission 1 and tier 0 of the real tree, skippable.** First input inside 45 seconds; all eight verbs once in 15 minutes.
9. **Treat The Portal honestly.** It is cut-and-cover plus mined tunnel in reality; teach all methods there and frame the TBM as the reform option, or move the first TBM drive to mission 2.
10. **Stop each scenario at ribbon-cutting plus a short operations montage.** No timetables, no fleet micromanagement; that is where the genre bores.
11. **Web-first, offline-capable, free first mission on the landing page.** The free browser build is what kept Mini Metro alive; always-online is Subway Builder's most-cited negative.
12. **Shareable scorecards and network URLs** to feed the fantasy-map community; unlock sandbox right after mission 1.
13. **Generative, state-driven audio** from day one; it is cheap, small to download, and doubles as an information channel.
14. **Satire by citation.** Deadpan real numbers with a sources button; process is the antagonist, not people. Poland is the benchmark, not the joke.
15. **Price reference if it ever goes paid:** incumbents sit at $19 to $40; Subway Builder draws "overpriced" complaints at $39.99.

## Open questions

1. Was a TBM option ever studied for The Portal's Second Street segment, and why was mined/SEM chosen? Determines whether the tutorial's TBM drive is "reform option" or "what if".
2. What multiplier should the game display: the owner's "several times Polish prices", the TCP-style 8 to 12x, or the raw per-km ratio (about 14x to 18x for The Portal vs. Warsaw extensions depending on price basis, my arithmetic)? Needs the cost doc and an owner decision.
3. What did the owner mean by "BetterTransit"? No such tool found; possibly a transcription artifact.
4. Tone: how sharp should the red-tape satire be, and should real agencies be named in-game or lightly fictionalised? Legal and reception risk either way.
5. Is first-person TBM possession in the vertical slice, or deferred until the planning loop is proven? It is the most distinctive feature and the most expensive one.
6. Demand model for v1: scripted per scenario, population-in-radius (NIMBY Rails level), or census/LODES gravity model (Subway Builder level)?
7. Time compression default (proposed one game week per second) is a guess; needs playtesting against a 10-year project.
8. Are the reference TBM rates right for bay mud and Franciscan rock, and what should tier 2 and 3 rates be? Prufrock's achieved 40 to 46 m/day is from a Wikipedia mirror only.
9. Does a real-map surface make the game feel like tracing (Mini Motorways' rejected prototype)? Test early whether authorship below ground is enough.
10. Monetisation and distribution: free web game, free first mission plus paid desktop build, or fully open source? Affects scope of sandbox and sharing features.
11. Multiplayer or co-op (NIMBY Rails has it, Deep Rock Galactic is built on it) is not assumed anywhere above; confirm it is out of scope.
12. Current Portal ridership forecast: only a 2019 secondary figure (+25,000 daily) was found; SFCTA says forecasts will be updated for the FFGA.

## Corrections (2026-11-09 fact-check)

Checked 30 claims against fetched pages, the SFCTA memo PDF text, the Robbins PDF text, the TCP dataset sheet, the Steam store API, and raw Wikipedia wikitext. Web search was unavailable (session budget exhausted), so checks used direct fetches only.

- Portal cost history: the 1995 $491M to $686M range was for the new terminal, not the downtown extension; removed from the DTX chain. Source: Wikipedia, The Portal (wikitext: "estimates for the new terminal").
- Portal 2036 date: only the SFCTA memo supports it; Wikipedia still says 2032. Source attribution fixed.
- Robbins EPB sample: 85.5 m/week over 46 TBMs on 22 projects, min 33.7, max 184.8; upgraded [S] to [F]. Source: Robbins WTC 2014 PDF text.
- Prufrock: vendor page says "targeting a speed of 1 mile per week"; the 7 miles/day figure is not on it and comes from a 2022 company statement (Wikipedia citing Engadget). Achieved 40 to 46 m/day stays UNVERIFIED; neither source gives any achieved rate.
- Warsaw M2 in TCP: "$209M to $215M/km" replaced with the dataset values ($194M to $200M/km cost-year PPP, $249M to $261M/km in 2025 dollars; Trocka web page $219.8M/km). Central section is $505.6M, $596.7M, or $709.3M/km depending on basis. Source: TCP Google Sheet rows 7178, 7179, 7184, 7185.
- Portal vs. Warsaw multiplier: "roughly 17x" changed to "14x to 18x" (14x on a 2025-dollar basis) in sections 1, 4.1 and open question 2. Recommendations and section 4.8 unchanged.
- Warsaw Bemowo to Karolin 1.62bn PLN: flagged as an in-construction value from a Jun 2022 article, not outturn. Source: Railway Gazette.
- Subway Builder: "make playing impossible" quote not found on Wikipedia (marked UNVERIFIED); added Wikipedia's "2 and 5 times higher" US cost statement; transfer-avoidance claim is citation-needed on Wikipedia; Steam price sourced to the Steam API ($39.99) because the developer site FAQ is internally inconsistent on the Steam price.
- NIMBY Rails demand mechanism ("population in station radius") marked UNVERIFIED.
- Confirmed as written (no change): all SFCTA memo figures ($8.25B, $7.57B, $6.84B, $3.38B, ~$2.2B gap, 1.3 mi, 2036, six-party MOU, 20+ utilities, 7 buildings, 2 to 6 track throat, 40-CT cut-and-cover plus mined tunnel); TCP multipliers 2.06, 1.85, 1.5, 1.35, 1.2 and 9.34 / 8 to 12; Subway Builder dates, 55 cities, Mixed 61% of 463, VaporLens weights; NIMBY Rails EA date, 88% of 1,282, 55 GB, $19.99, 1.4 TB instance; Metro Dreamin' AGPL-3.0 and 96 stars; Mini Metro dates and postmortem quotes; Mini Motorways GDC 2023 real-map prototype; Factorio FFF-245; OpenTTD subsidy 1.5x to 4x; Voxel Tycoon EA date, $24.99, 78% of 1,565; Railway Empire 2 five chapters; Transport Fever 2 and Dorfromantik quotes; Satisfactory Tier 0; Pedestrian Observations post; Game Accessibility Guidelines basics; Green Caltrain 25% / 25,000+ (upgraded to [F]).
- Not checked: Townscaper, shapez, Brick Rigs, Deep Rock Galactic, Minecraft, Cities: Skylines II, Workers & Resources 91%, FFF-275, Xbox guideline 117, "every reference uses pause plus 2 to 4 speeds". Existing [S]/[M] tags stand.

