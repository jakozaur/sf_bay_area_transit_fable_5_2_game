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
