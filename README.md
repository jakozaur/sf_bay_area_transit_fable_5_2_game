# Boring Game

Voxel San Francisco Bay Area in the browser: plan alignments, bore tunnels, build stations, cut red tape.
Research and architecture: `docs/research/` (start with `10-architecture-tooling.md`); shared interfaces of the current round: `docs/CONTRACTS.md`. Needs Node 26+, pnpm 11.

```sh
pnpm install
pnpm --filter @bayvox/e2e exec playwright install chromium-headless-shell   # once, for e2e
pnpm dev          # Vite dev server on http://localhost:5173
pnpm check        # typecheck + Biome + repo lint + Vitest (the inner loop)
pnpm e2e          # Playwright, hardware GPU project (macOS Metal); pnpm e2e:swgl for software GL
pnpm bench        # Vitest micro benchmarks
pnpm build        # production bundle in apps/game/dist
pnpm data:build   # rebuild world data in apps/game/public/data: terrain, vectors, manifest (committed; see below)
```

The app boots on its title screen over the whole Bay (64 m cells, the rail network on top). Pick a mission, read the briefing, press Start: the mission's site loads as 1 m voxels near the camera and 4 m columns around it. The flow of a mission is plan (use the official alignment or draw your own, place stations, choose the design), approvals (Next decision runs the clock to the next gate or event card; reforms), build (launch, drive the machine or leave it on autopilot), open (fit-out, trains, scorecard and receipt). Each gate is a card: tender fixes the design and the contract prices, so reforms on procurement, staffing and utilities are bought before it. Any mission can be picked at any time. The target on every line: within 2x Poland on cost and time. Progress autosaves to IndexedDB; Continue on the title screen resumes it.

Keys in play: 1 to 4 pick the plan, station, dig and drive tools (also P, B, G, T), Space runs to the next decision (pauses while a machine bores, where Regular, Faster and Skip to end set the pace), Esc puts a tool away or closes a panel, Ctrl+Z undoes a plan edit, comma and period step depth or brush size. Camera: drag or W A S D pans, right-drag or Q / E rotates, wheel zooms. While driving: W / S thrust, A / D steer, R / F pitch, Space autopilot, Esc leaves the machine.

World data (about 4 MB, 46 files) is committed under `apps/game/public/data/`, so nothing has to be built to run. `pnpm data:build` regenerates it deterministically from OpenStreetMap, Overture Maps and AWS Terrain Tiles; the first run downloads about 680 MB of raw inputs into `data/raw/` (gitignored). Sources and licenses: `ATTRIBUTION.md`.

The backlash posts that follow every spend of political capital are adaptations of real public comments against Bay Area housing and California rail; the comments and their sources are in `docs/research/12-opposition-comments.md`.

URL parameters (all optional): `mission=<scenario id>` (skip the title screen and start that mission: `the-portal`, `googleplex-spur`, `dumbarton-to-meta`, `siliconBranch`, `sandbox`), `site=<site id>` (voxel site behind the title screen), `hud=0` (no interface, bare canvas), `debug=1` (lil-gui panel with render counters), `world=site|synthetic`, `radius` (voxel near field in chunks, default 8), `detail=4|8|16|32` (city tier cell in metres), `far=64|128|256|512` (far tier cell in metres), `freeze=1` (stop the clock, for screenshots and tests), `workers=0` (mesh on the main thread), `aa=0`, `seed`, `cam=0..3` (start view with `mission`; a mission on another site than the boot site starts on its own mission view unless `cam` is 1 to 3).

Tests beyond `pnpm check`: `pnpm e2e` includes a playthrough of The Portal by mouse and keyboard (`e2e/tests/play.spec.ts`; set `BAYVOX_SHOTS=<dir>` to keep its screenshots) and the regressions of the two playtests (`playtest1.spec.ts`, `playtest2.spec.ts`), `pnpm --filter @bayvox/ui pw` runs the interface against fixtures, `node packages/render/demo/shoot.mjs <dir>` shoots the entity models.
