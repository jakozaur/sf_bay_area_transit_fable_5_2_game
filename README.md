# Bay Area Tunnels

Voxel San Francisco Bay Area in the browser: plan alignments, bore tunnels, build stations, cut red tape.
Research and architecture: `docs/research/` (start with `10-architecture-tooling.md`). Needs Node 26+, pnpm 11.

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

The app boots on real map data: downtown San Francisco around the Salesforce Transit Center as 1 m voxels, the rest of the site at 4 m, the whole Bay at 64 m with the rail network on top (keys 1 to 4 jump between views). The first scenario, The Portal, runs in the sim from boot; until the UI lands, the debug panel has "draw the official plan" and "approve / pass gate" buttons and a speed selector.

World data (about 4 MB, 46 files) is committed under `apps/game/public/data/`, so nothing has to be built to run. `pnpm data:build` regenerates it deterministically from OpenStreetMap, Overture Maps and AWS Terrain Tiles; the first run downloads about 680 MB of raw inputs into `data/raw/` (gitignored). Sources and licenses: `ATTRIBUTION.md`.

URL parameters (all optional): `world=site|synthetic`, `radius` (voxel near field in chunks, default 8), `detail=4|8|16|32` (city tier cell in metres), `far=64|128|256|512` (far tier cell in metres), `freeze=1` (stop the clock, for screenshots and tests), `workers=0` (mesh on the main thread), `hud=0`, `aa=0`, `seed`, `cam=0..3`.
