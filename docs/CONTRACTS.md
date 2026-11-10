# Round 2 contracts

Frozen 2026-11-09 for the round "play The Portal start to finish without the debug panel". The source files are the contract; this page says where things are, what was decided and who owes what. Change a frozen type only additively (new optional field, new union member) and report it. Never rename or remove an export.

## Work packages and paths

| Label | Owns | Builds |
|---|---|---|
| SIM | `packages/sim`, `packages/scenarios` | commands, snapshot views, driving, receipt, scorecard, missions, briefings |
| RENDER | `packages/render` | entity layer: machines, rings, track, trains, boxes, pits, alignments, guidance, previews |
| UI | `packages/ui` | title, briefing, HUD, panels, event cards, scorecard, against a fake `BayServices` |
| TOOLS | `packages/tools`, `packages/input` | plan, station, dig and drive tools, tool host, input contexts |
| APP | `apps/game`, `e2e` (and `packages/world` if the edit log needs it) | `BayServices`, site loading per scenario, frame loop, camera follow, audio, save and load |

If the orchestrator splits the work differently, ownership follows the path.

## Where each contract lives

| Topic | File | Main exports |
|---|---|---|
| Services the UI and tools call | `packages/core/src/services.ts` | `GameServices`, `SimPort`, `TimePort`, `SessionPort`, `CameraPort`, `ViewPort`, `WorldPort`, `OverlayPort`, `ToolPort`, `AudioPort`, `Readable`, `MissionCard`, `CampaignProgress`, `SaveSlotInfo`, `AUDIO_CUES` |
| Entities and previews | `packages/core/src/entities.ts` | `EntityScene`, `TbmEntity`, `TunnelEntity`, `StationEntity`, `LaunchPitEntity`, `TrainEntity`, `AlignmentEntity`, `GuidanceEntity`, `PreviewGeometry`, `EntityRef`, `ENTITY_COLORS` |
| Tool input and status | `packages/core/src/tooling.ts` | `ToolAction`, `ToolId`, `ToolStatus`, `ToolAvailability`, `TOOL_KEYS`, `TOOL_COMMANDS` |
| Tool interface, save file | `packages/core/src/sim.ts` | `Tool`, `ToolContext`, `SaveFile.editLog`, `EditLogRef` |
| Test hook additions | `packages/core/src/hook.ts` | `GameTestHook.stepSubsteps`, `GameTestHook.services` |
| Sim commands, snapshot, queries | `packages/sim/src/types.ts` | `GameCommand`, `GameSnapshot`, `ProjectView`, `TbmView`, `Receipt`, `Scorecard`, `DesignView`, `NextAction`, `ClockView`, `MissionView`, `ServiceView`, `FeedItem`, `AlignmentEstimate`, `SimQueries`, `BayServices`, `BayTool`, `BayToolContext` |
| Sim object | `packages/sim/src/sim.ts` | `GameSim.substep`, `GameSim.estimateAlignment`, `GameSim.save(SaveOptions)` |
| Sim stubs and placeholders | `packages/sim/src/pending.ts` | `checkAlignment`, `trainsAt`, `geologyOfMaterial`, `pending*` |
| Tuning constants | `packages/sim/src/constants.ts` | round 2 block of `CONSTANTS`, `SUBSTEPS_PER_DAY` |
| Entity layer | `packages/render/src/entities.ts` | `EntityLayer`, `createEntityLayer` |
| UI store and mount | `packages/ui/src/contract.ts` | `UiStore`, `UiProps`, `PanelId`, `createUiStore`, `mountUi` |
| Tools and host | `packages/tools/src/contract.ts` | `AlignmentTool`, `StationTool`, `DigTool`, `DriveTool`, `ToolHost`, `createToolHost` |
| Input | `packages/input/src/actions.ts` | `GameAction` (now contains `ToolAction`), `InputContext`, `DRIVE_BINDINGS`, `InputMapper.setContext` |
| Missions | `packages/scenarios/src/index.ts` | `missionCards`, `EMPTY_CAMPAIGN`; `ScenarioDef.siteId`, `ScenarioDef.briefing` |

Dependency rules are unchanged (biome.json): core imports nothing; render never imports sim; ui never imports three, render or world, and has no dependency on tools; tools never imports three, render, ui or input. That is why the scene and tool types are in core and why `GameServices` is generic. Import the closed instance `BayServices` from `@bayvox/sim`.

## Decisions

1. **Sub-day motion: fixed sub-steps, driven headings only.** Time is counted in sub-steps of 1 / `SUBSTEPS_PER_DAY` (240) of a game day. `GameSim.substep()` advances one; `GameSim.step()` advances 240, so a day is still a tick and old callers are unchanged. A heading is in one of two regimes:
   - planned (`TbmView.driven` false): advances along the alignment by chainage once per day, as in round 1. Forecasts and headless runs stay cheap.
   - driven (after the first `tbmControl` with `autopilot: false`): integrates position, yaw and pitch once per sub-step from the control values in force, carves when the face has moved a voxel, and keeps its own as-built path. Autopilot on a driven heading is a cruise law in the same integrator that steers back to the plan.
   Everything else (phases, stations, money, events, escalation) runs once, when a sub-step closes a day. State after N sub-steps is a function of the seed and of which commands arrived before which sub-step. Wall time only decides how many sub-steps a frame runs, so driving is deterministic and replayable.
2. **Smooth at 60 fps by interpolation.** The app keeps a wall-time accumulator. Per frame it runs whole days with `step()` and the rest with `substep()`, then draws every machine at `lerp(previous pose, current pose, alpha)` where alpha is the unspent fraction of the next unit. The camera follows the interpolated pose. The sim never sees alpha.
3. **Pace is the sim's call.** `snapshot.clock.daysPerSecond` is the number of game days per real second at 1x: chosen so the current approval phase lasts at most `lapseTargetSeconds` (10 s), and `driveGameHoursPerSecond / 24` while a machine is driven (a 2 km drive is 3 to 5 minutes). Speeds 10x and 100x multiply it; 0 pauses. `clock.hold` non-null (event card open, project at a gate) means the frame loop must not advance time. Both are advisory: `step`, `substep` and the test hook ignore them.
4. **Control semantics** (`tbmControl`, omitted fields keep their value): `thrust` 0..1 of the full rate for the ground, in quarter steps from W and S; `steer` -1..1, +1 is right and turns at the minimum radius (yaw decreases); `pitch` -1..1, +1 raises the grade, clamped to the grade limit; `autopilot` toggled by Space. Limits and the off-plan surcharge are in the round 2 block of `CONSTANTS`. Yaw everywhere is counter-clockwise seen from above, 0 pointing +z (south); travel direction is (sin yaw, 0, cos yaw).
5. **Trains are presentation, not state.** A tick is a day and a train crosses the line in minutes, so the snapshot carries `services` (path, stops, kinematics) and `trainsAt(service, clockSeconds)` gives positions in closed form from the app's own clock.
6. **Snapshot views are render-ready.** `TbmView`, `StationView` and `TrainView` extend the core entity types, and `ProjectView` carries `alignment`, `tunnels` and `pits`. APP builds the `EntityScene` by flattening: no mapping logic outside the sim.
7. **Design chooser.** `setDesign` picks one `TunnelOptionId` and one `StationBoxId` per project. `DesignView.options` carries each option's price tag, days to opening and `lockedBy` reforms. The Polish baseline is `twinBore` plus `compactBox`; `singleLargeBore`, `minedCavern` and `mezzanineBox` are the California options.
8. **Receipt.** Three model columns (`yours`, `statusQuo`, `poland`) plus the sponsor `ghost` beside the status quo. Lines are grouped into `designScope`, `institutional` (levers by name), `delay` and `priceLevel`; `priceLevel` is always its own line. Each column's `baseCents` plus its line cents equals its `costCents` exactly. Every ratio is computed from the columns.
9. **Save and load.** `GameSim.save({ worldDataVersion, editLog })` puts an `EditLogRef` into the `SaveFile` container. It is not in `serialize()` or the state hash, because a storage key must not change the hash. Sim carves are replayed by `loadSim`; hand digs live in the manual edit log (`packages/world` edit-log format) that APP records in `WorldPort.dig`. Load order: site, manual edit log, `loadSim`.
10. **Hand dig.** The dig tool calls `services.world.dig` (carves, logs, returns the solid volume) and commits `chargeDig`. The sim only charges.
11. **Mission flow.** `SessionPort` owns screens (`title`, `briefing`, `loading`, `playing`, `scorecard`), site loading and the campaign profile. The sim reports `mission.complete` and `mission.result`; APP stores the result and `missionCards(progress)` computes unlocks (next mission unlocks when the previous line opens; free build is always open). `sim.snapshot` is always a valid snapshot, also on the title screen; it describes the mission in play only while the screen is `playing` or `scorecard`.
12. **One project id per mission.** The draw tool and `useOfficialPlan` both write `mission.planProjectId`.
13. **Banners and sounds come from `snapshot.feed`.** Items have a rising `seq`; APP maps kinds to `AUDIO_CUES` and to `EntityLayer.flash` for `breakthrough`, UI shows banners.
14. **Tools are data to the UI.** `ToolStatus` (hint, readouts with a `bad` flag, option specs, command buttons) is rendered generically; `TOOL_KEYS` and `TOOL_COMMANDS` freeze the keys the UI may bind dedicated controls to.
15. **Input.** Right click becomes `tool.secondary` (delete) and Escape `tool.cancel`; a tool that returns true from `pointer.down` claims the drag and the camera ignores it. In the `drive` context `DRIVE_BINDINGS` take W A S D R F Space from the camera.

## Frame loop (APP)

```
flush queued commands into the first step or substep of the frame (sim.dispatch if none runs)
if speed > 0 and clock.hold is null:
  acc += dt * speed * clock.daysPerSecond * SUBSTEPS_PER_DAY      // capped, excess time is dropped
  while acc >= SUBSTEPS_PER_DAY: sim.step(); acc -= SUBSTEPS_PER_DAY   // identical to 240 substeps, cheaper
  while acc >= 1: sim.substep(); acc -= 1
toolHost.update(dt)
scene = flatten(snapshot, trainsAt(service, wallClock), toolHost preview), poses interpolated by acc
entityLayer.sync(scene); entityLayer.update(dt); draw
```

## Stubs and who owes them

Every stub throws `not implemented: <name> (owed by <owner>, see docs/CONTRACTS.md)` through core `notImplemented`; `grep -rn "notImplemented(" packages apps` lists them.

| Stub | File | Owner |
|---|---|---|
| commands `useOfficialPlan`, `removeProject`, `setDesign`, `tbmControl`, `chargeDig` (parse and apply) | `packages/sim/src/engine.ts` | SIM |
| `GameSim.substep`, `GameSim.estimateAlignment`, `checkAlignment`, `trainsAt`, `geologyOfMaterial` | `packages/sim/src/pending.ts` | SIM |
| `missionCards`, `ScenarioDef.briefing` for all five scenarios | `packages/scenarios/src` | SIM |
| `createEntityLayer` | `packages/render/src/entities.ts` | RENDER |
| `createUiStore`, `mountUi` | `packages/ui/src/contract.ts` | UI |
| `createAlignmentTool`, `createStationTool`, `createDigTool`, `createDriveTool`, `createTools`, `createToolHost` | `packages/tools/src/contract.ts` | TOOLS |
| `InputMapper.setContext`, emitting the new `ToolAction` members, key bindings for `time.*` and `tool.select` | `packages/input/src` | TOOLS |
| `createGameServices` (factory arguments are APP's choice) | `apps/game/src/services.ts` | APP |

### Snapshot placeholders (SIM)

So that `snapshot()` keeps working, these new fields hold neutral values from `pending.ts` until SIM fills them. The work is done when `pending.ts` is deleted.

- `GameSnapshot`: `clock` (idle, 2 days/s), `mission` (stage `plan`, never complete), `nextAction` (kind `none`), `services` (empty), `feed` (empty), `handDig` (zeros).
- `ProjectView`: `nextAction`, `design` (no options), `checks` (no limits, always ok), `alignment.segmentIssues` and `vertexIssues` (all null), `tunnels` and `pits` (empty), `receipt` and `scorecard` (zeros).
- `TbmView`: `driven` false, `autopilot` true, `thrust`, `steer`, `pitchInput`, `gradePct`, `deviation`, `limits`, `stopReason`, `breakthroughTick`, `maxRateMPerDay`.
- `StationView`: `yaw` 0, `style`, `box`, box size (today's carve volume), `fitOut`.
- `ReformView`: `preview` null, `receiptLines` and `unlocks` empty.

Already real: `headline` (from the round 1 comparison of the first project), `PhaseView.label`, `daysLeft` and `gate`, `TbmView` pose, radius and geology in the planned regime, `ReformView.affordable` and `blockedReason`, event option `affordable`, `alignment.points` and `state`.

## Notes for the integrator

- `ScenarioDef.siteId` is now required and validated. Values: portal, googleplex, meta (Dumbarton), oracle, and portal for free build. Whether each site's tiles cover its reference alignment is unverified.
- Constants in the round 2 block are tuning (`verified: false`) except `ringLengthM`. SIM may retune values, not names.
- The radius check of a polyline is not frozen: SIM defines it in `checkAlignment`. The official Portal reference has a 90 degree corner at Townsend and Second, so it will need a rule or a redraw that passes.
- The debug HUD (`apps/game/src/hud.ts`) stays until `mountUi` exists; APP then gates it behind the `hud` URL parameter.

## Integration notes (2026-11-10)

The round is integrated: no stub is left (`grep -rn "notImplemented(" packages apps` finds only the helper in core) and `packages/sim/src/pending.ts` is gone. What changed against the text above, all additive:

- `GameSim.clock()` returns the snapshot's `ClockView` without building a snapshot; the frame loop reads it after every step so a card or a gate stops the frame at once.
- `GameTestHook.entities()` reports what the entity layer draws (machines and trains at their drawn pose, ring and track counters).
- `EntityLayer.setCrowns(visible)` hides the upper half of the lining; the app switches it off under x-ray and the cut plane so track and trains show.
- `CameraPort.follow` with mode `cutaway` on a machine is flown as a chase (the cutaway is a trench open behind the machine); trains and stations keep the orbit. `FOLLOW_DEFAULTS` gained `dropM`.
- UI store: `reformFocus` and `openReform(id)`, so a locked design option or a receipt line opens the reform tree on its reform. The project panel has a design section.
- The debug HUD is behind `debug=1`; `hud=0` now means "no interface". `mission=<id>` deep-links into a mission (ignores campaign locks).
- App-side behaviour not in any contract: the camera goes to the machine at launch (any pan or map view leaves it), the game drops to 1x and switches x-ray on at breakthrough, and at opening it follows the first train with x-ray on. The scorecard comes up 8 real seconds after the line opens.
- Keys: with the interface mounted, digits 1 to 4 are tools (the UI takes them in the capture phase); camera bookmarks are in the Views menu. On the bare canvas (`hud=0`) the digits are still bookmarks.

## After the first playtest (2026-11-10)

Three playtesters drove the game; this is what changed in the contracts. All additive; `SCHEMA_VERSION` stays 2 and older saves load.

- **Poland is the Polish design of the route.** The Poland column (and `headline.polandPerKmCents`) prices the same route and station sites as twin 6.6 m bores and compact boxes under `POLAND_PROFILE` (`polishGeometry`, `polandRun`). It no longer follows the player's methods, so it does not move with the design chooser. `ReceiptColumn.baseCents` is that design for every column on the same route.
- **The price level is not a lever.** No reform touches `unit.priceLevel`; `POLAND_PROFILE` gets it from `POLISH_PRICE_LEVEL`, an entry that is not on the tree and that `enactReform` refuses. On the receipt the waterfall applies the price level first, so the line is the same dollars whatever is reformed. "Small lots, world bidders" now takes a tenth off procurement; "Buy at world prices" is the Buy America waiver on systems only.
- **New receipt line `reformCash`** (group `institutional`): cash paid for reforms and machines is charged to the mission project and is inside all-in.
- **One estimate.** `SimQueries.estimateAlignment` is anchored on the forecast of record when the request names an existing project: for the project's own line it returns the receipt's figures to the cent. Design option tags and reform previews are the closed-form ratio applied to that forecast.
- **Event prices are charged in full** (`events` ledger and receipt line); the contingency no longer absorbs them. Card titles come from `eventTitle` (change orders are numbered).
- **Cash call.** When cash is below zero at the end of a day and event cards are on, the card `cashCall` is raised on the mission project and holds the clock: wait a year, borrow at a fee, or spend political capital. `EventView.options[].gainCents` is what an option brings in; `ledger.raisedCents` and `SimState.cashRaisedCents` total it. The Portal no longer lists the $1.15B of "sources to be identified" as funding.
- **Headings.** `headingSpans` is the one list of headings (engine, pits, schedule): a run longer than `maxHeadingBoredM` (6 km), `maxHeadingMinedM` (1.2 km) or `maxHeadingSurfaceM` (8 km) is built from several. Machine utilisation is capped at `tbmMaxUtilisation` (27 m/day in soft ground). Free build starts with the two-track standards, as the campus missions do.
- **Driving.** With a lever at rest a hand-driven machine holds its heading parallel to the plan (`holdControls`). A machine held at the corridor edge re-steers in place and, if half a circle of that has not freed it, is bored back by the cruise law (`DriveState.blockedFor`, `isRecovering`). With a ground query, a machine above its plan cannot climb into less than `driveCoverM` of cover. The drive clock is paced on the machine's current rate in soft ground, so the start-up metres are not slow on screen.
- **Views.** `MissionView.targets` (ends of the connect objectives, with `served`); `PhaseView.gate.label` of the launch gate says what is launched ("Launch the TBM", "Start mining", "Start construction"); a draft's phases show the scenario head start as done; `mission.stage` is `build` from the launch gate on; `Scorecard.ghost.openDate` is `''` for a sponsor figure without a date.
- **Political capital.** `PC_PHASE_DONE` is 15. Hints name the capital in hand; `canAffordReform` counts reforms priced in political capital only.
- **UI.** Evidence lines are printed through `playerSource` (sim), which drops citations of the research docs. The reform tree and the design chooser pause time while open. An event card waits for the breakthrough banner. Toasts skip `eventRaised`.
- **App.** `WorldPort.siteBounds` is the whole map wherever the map has ground: a line may leave the voxel site (the campus missions' official lines do). Target rings are overlay items; machines leave the scene 30 game days after breaking through; the x-ray switched on at a breakthrough goes off after 8 s.
- **Tools.** The drive tool lists drivable headings only; "Use the official alignment" asks once before replacing a drawn line; a run of depth steps is one undo; a station inside a target ring takes the place's name; the dig brush refuses on an empty account.

Not done, known: the voxel sites of Googleplex and Dumbarton cover a third of their official lines (the rest is drawn on the 64 m tier); a mined heading is drawn with the shield-machine model; nothing shows site works during the approval time-lapses; the top bar overlaps itself below about 900 px; draw-call and chunk budgets of PLAN 4.6 and the 180 ms hitch when crossing between the Bay view and a site are as measured in the playtest.

## After the second playtest (2026-11-10)

Three playtesters drove the game again; this is what changed in the contracts. All additive; `SCHEMA_VERSION` stays 2 and older saves load.

- **Tender lets the contracts.** `advancePhase` records `ProjectState.contract` (procurement, staffing and third-party factors of that day; absent in older saves). From then on the project pays those whatever is reformed (`contractProfile` in `model.ts`); soft costs, contingency, the schedule and the machines still follow the reforms in force. A reform bought at the launch gate no longer halves the price.
- **An approved line stays buildable.** `setAlignment`, `addWaypoint`, `setMethod` and `setDesign` on an approved project are refused when the result fails `checkAlignment`; `advancePhase` refuses an unbuildable line. `checkAlignment` flags cut-and-cover deeper than `cutCoverMaxDepthM` below the datum with the issue `depth`.
- **Depth costs.** `depthFactor` raises the civil cost of underground segments below `tunnelDepthFreeM` (bored, mined) and `cutCoverDepthFreeM` (trench); the sim counts depth from sea level because it does not know the street. A station keeps its street when the line under it moves: its `depthM` follows.
- **Driven headings pay the plan.** A driven heading is priced and paced on the ground class of the plan (the injected ground query is used for the cover rule only) and by the metres of plan it has passed. The off-plan surcharge is `driveOffPlanCostFactor` at the tolerance plus `driveOffPlanCostPerM` per metre beyond it. `TbmDeviation` gained `freeM` and `surchargePct`. Machine utilisation times the ground factor is capped at `tbmMaxUtilisation`.
- **Twin bore needs the twin-bore standard.** `optionLocks('twinBore')` is `twoTracks` and `twinBoreStandard` (now 10 PC); `defaultMethod` is twin bore only under both. Dumbarton, Googleplex, Oracle and free build start with the standard.
- **Price tags that match the click.** With time standing (speed 0, which the reform screen and the design chooser set, or a gate) reform previews and design tags are forecast runs (`forecastWhatIf`): `ReformPreview.exact`. With time running they are the closed form, as before.
- **New snapshot fields.** `ReformPreview.notes` (why a preview is what it is: contracts let, phase over, stations set the date, cards not in the estimate); `DesignOptionView.headingDays`, `stationDays`, `applies`; `ProjectView.stationOptions` (`StationOptionView`: what one more station of each type adds); `MissionTarget.template` and `templateNote` (the station type the official plan puts in the ring); `GhostView.polandPerKmCents` (Poland on the sponsor's own route: `ratios.ghostToPoland` is against it); `Scorecard.starsReason`.
- **Receipt columns of one route.** The status quo column is the official plan only when the project stands on the official route and station sites; on a drawn line it is that line under the rules of day one. The basis of the player's column counts every reform in force.
- **Fit-out grows with the line** beyond `fitOutFreeKm` (`phaseDays(phase, p, lengthM)`), up to `fitOutMaxFactor`. Political capital from the monthly mandate and riders stops at `PC_MONTHLY_CAP`.
- **Core.** `WorldPort.digBlocked?` (why the brush may not dig at a point: beyond the voxel near field, or too far out to see a hole); `ToolOptionSpec` choices carry `detail` and `note`; `GuidanceEntity.ticks` (chainage marks across the plan).
- **Render.** Chunk meshes are drawn in batches of 4 x 16 x 4 chunks (`ChunkScene.flush`, called by `VoxelRenderer.draw`): about 80 draw calls at the mission overview and under 300 in an x-ray orbit, where the playtest measured 2,398. The camera-path budget of `e2e/tests/mechanics.spec.ts` was re-measured: draw calls 420 to 34, triangles 116,000 to 147,300 (a batch is culled whole). The follow cutaway is cut at the level of the machine axis and reaches 28 m ahead of the face.
- **Input.** `CameraRig.setZoomFloor`: the app keeps the map camera 1.5 km out where the focus is off the voxel site.
- **UI.** The gate card (`GateCard`, `store.gateDismissed`); station types as priced rows; notices in the top right corner, below a banner, never over a place name; the receipt lists the price level first, as the waterfall applies it.
- **App.** A gate drops the game to 1x; approving puts the drawing tools away; the x-ray of a breakthrough and of the first train goes off by itself; restart and a deep link to another site look at the mission; a watch ends when its machine leaves the scene.

Not done, known: the tunnel method and the machine-speed reforms still do not move the opening date where the station boxes take longer (the chooser and the previews now say so); a launch pit may stand in open water; waypoints may be placed in the Pacific; below about 700 px of width the top bar is cut down to the buttons, not laid out anew; the cut plane is still a fixed disc.
