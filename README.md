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
pnpm data:build   # world data into apps/game/public/data (pipeline stages not implemented yet)
```
