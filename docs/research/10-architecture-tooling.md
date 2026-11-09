# 10. App architecture, tooling, testing, deployment

Researched 2026-11-09. Machine used for experiments: Apple M1 Max, macOS 14.7.3, Node 26.7.0, pnpm 11.21.0, bun 1.2.19, Python 3.14.6.
Scope: engineering plan only. Renderer internals are in `03-voxel-rendering.md`, world scale and voxelization in `04-world-scale-voxelization.md`; this doc points to them instead of repeating.

Evidence labels: **[measured]** = run locally for this doc (scripts in the scratchpad, see section 14); **UNVERIFIED** = not confirmed against a primary source.

Research limit: the session web-search budget ran out after one query, so everything below comes from direct fetches of primary docs, the npm registry, package source, and local experiments. Topics that needed search to find a primary source are marked UNVERIFIED.

## 1. Package versions (npm registry, 2026-11-09)

All from `npm view <pkg> version`. Registry pages: `https://www.npmjs.com/package/<pkg>`.

| Package | Latest | Role | Note |
|---|---|---|---|
| vite | 8.3.7 | build/dev server | Rolldown is the single bundler since 8.0 (2026-03-12), Node 20.19+/22.12+ ([vite.dev](https://vite.dev/blog/announcing-vite8)) |
| typescript | 7.0.2 | typecheck | native Go port, GA 2026-07-08 as 7.0.2 (RC 7.0.1-rc was 2026-06-18) ([TS blog](https://devblogs.microsoft.com/typescript/)) |
| three / @types/three | 0.187.0 / 0.187.0 | renderer | |
| vitest, @vitest/browser, @vitest/browser-playwright | 5.1.0 | unit + browser tests | |
| playwright, @playwright/test | 1.65.0 | e2e, screenshots | 1.64.1 is what installs here, see cooldown note |
| @biomejs/biome | 2.6.6 | lint + format | |
| oxlint | 1.93.0 | lint (alt) | |
| preact / @preact/signals | 11.2.0 / 2.11.4 | UI | |
| solid-js / svelte | 1.9.18 / 5.57.3 | UI (alt) | |
| comlink | 4.4.2 | worker RPC | last publish 2024-11 |
| bitecs / miniplex / koota | 0.4.0 / 2.0.0 / 0.6.6 | ECS (alt) | last publish 2025-12 / 2023-07 / 2026-04 (koota canary builds publish daily) |
| pmtiles | 4.5.0 | single-file tile archive | |
| fflate / fzstd | 0.8.3 / 0.1.1 | JS deflate / zstd decode | fzstd last publish 2024-03 |
| idb-keyval | 6.3.0 | IndexedDB KV | |
| valibot / zod | 1.5.0 / 4.6.7 | schema validation | |
| tinybench | 6.2.3 | micro benchmarks | |
| pixelmatch | 8.0.0 | image diff | used internally by Playwright and Vitest |
| lil-gui / stats-gl | 0.21.0 / 4.2.3 | debug UI / perf HUD | |
| wrangler | 4.159.0 | Cloudflare deploy CLI | |
| assemblyscript / wasm-pack | 0.28.20 / 0.15.1 | wasm (deferred) | |
| turbo | 2.11.10 | task runner (not needed) | |
| pnpm | 12.18.0 | package manager | installed locally: 11.21.0 |
| @babylonjs/core / playcanvas | 9.35.0 / 2.24.0 | engine (alt) | |
| osm-pbf-parser-node | 1.1.4 | pure-JS OSM PBF reader | pipeline candidate; evaluation belongs to the data-pipeline doc |

Local constraint **[measured]**: this machine's npm has `min-release-age = 7` (days). `npm i playwright@1.65.0` fails with `No matching version found ... with a date before 11/2/2026`; unpinned installs resolved to playwright 1.64.1 and vite 8.3.5. Pin versions at least 7 days old, or the install fails loudly. `pnpm config get minimumReleaseAge` returned `undefined`, so pnpm does not inherit this setting.

## 2. Stack comparison

### 2.1 Build and language

| Option | Verdict | Reason |
|---|---|---|
| Vite 8 + TS 7 | **Pick** | Vite transpiles with Oxc/Rolldown and never calls `tsc`, so TS 7 shipping without a programmatic API does not block it. Built-in worker and wasm handling ([Vite features](https://vite.dev/guide/features)) |
| TS 6.x | Fallback only | Needed only by tools that depend on the old compiler API (typescript-eslint, Vue/Svelte/Astro language plugins). None are in this stack ([TS 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)) |
| Bun as bundler/runtime | Rejected | Vitest and Playwright target Node; one runtime is simpler for agents |

TS 7.0 facts that affect setup ([announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)):

- 8x to 12x faster full builds; `tsc` binary ships in the `typescript` package.
- New defaults: `strict` on, `module: esnext`, `types: []` (list `@types/*` explicitly), `rootDir: ./`.
- Removed: `baseUrl`, `moduleResolution: node|node10|classic`, `target: es5`. Use `moduleResolution: bundler`.
- No JS API in 7.0 (expected in 7.1). typescript-eslint needs the `@typescript/typescript6` side-by-side package. Biome does not need `typescript` at all ([Biome v2](https://biomejs.dev/blog/biome-v2/)).
- `--checkers` (default 4) can change results in rare cases; fix the value in `tsconfig`/scripts so agents and CI agree.

Node 26 runs erasable TypeScript directly **[measured]**: `node file.ts` works for type annotations and fails on `enum`. Pipeline scripts need no `tsx` if the codebase bans `enum`, `namespace`, and parameter properties (set `erasableSyntaxOnly: true`).

### 2.2 Renderer

Decision and rationale live in `03-voxel-rendering.md` (three 0.187 `WebGLRenderer`, WebGPU deferred behind a `ChunkRenderer` interface). Supporting evidence gathered here:

- `WebGPURenderer` picks WebGPU and falls back to a WebGL 2 backend; `forceWebGL: true` forces the fallback ([three docs](https://threejs.org/docs/pages/WebGPURenderer.html)).
- API churn: r181, r182, r183, r185, r186, and r187 all have WebGPURenderer or TSL breaking notes; r184 has none (async methods deprecated r181, `colorBufferType` renamed `outputBufferType` r182, `PostProcessing` renamed `RenderPipeline` r183, premultiplied alpha change r185, `PCFSoftShadowMap` removed from `WebGPURenderer` r186 after deprecation in `WebGLRenderer` r182, struct storage buffer change r187). The guide already has a 187 to 188 section for the unreleased r188 ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)). Agents trained on older TSL will write stale code.
- WebGPU reach ([gpuweb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)): Chromium 113+ on Mac/Windows/ChromeOS, Android 12+ from 121, Linux partial (Intel Gen12+ from 144, NVIDIA on Wayland from 147, else flag); Firefox 141 Windows, 147 all macOS, Linux Nightly only; Safari 26 on macOS/iOS/visionOS. MDN still lists it as not Baseline ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)).
- Bundle cost **[measured]**, gzip -9 of unminified r187 builds: `three.core.js` 290 kB, plus `three.module.js` (WebGL) 129 kB or `three.webgpu.js` 265 kB. Tree-shaken production sizes will be smaller; not measured.
- Babylon.js 9.35.0 and PlayCanvas 2.24.0 exist and are current on npm; not evaluated beyond what doc 03 states.

### 2.3 ECS vs plain modules

| Option | State | Fit |
|---|---|---|
| Plain modules + typed-array tables | n/a | **Pick.** Game state is a chunk grid, a track graph, a project list, a ledger, and a few thousand trains. Graph and table shaped, not archetype shaped |
| bitecs 0.4.0 | ~5 kB, zero deps, SoA or AoS stores, relations, built-in serialization, "thread-friendly"; 1.5k stars ([repo](https://github.com/NateTheGreatt/bitECS)). Last npm publish 2025-12 | Reasonable if train/agent counts reach 10^4 to 10^5. Revisit then |
| miniplex 2.0.0 | Last npm publish 2023-07 | Stale. Rejected |
| koota 0.6.6 | Active (0.6.6 stable published 2026-04-09; `0.6.6-canary.*` builds published daily, latest 2026-11-09), 769 stars, docs self-described as notes "until I make docs", positioned as state management for React and TypeScript ([repo](https://github.com/pmndrs/koota)) | Pre-1.0, React-leaning. Rejected |

Rule that keeps a later ECS swap cheap: sim entities are integer ids into SoA tables owned by one module each; no object graphs with methods, no class instances in sim state.

### 2.4 UI layer

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| DOM overlay, Preact 11 + signals | JSX is the most common UI idiom in agent training data; signals give fine-grained updates from sim snapshots without re-rendering trees; Playwright can assert on real DOM (roles, text) | One more dependency | **Pick** |
| DOM overlay, Solid 1.9 / Svelte 5 | Same DOM testability; compile-time reactivity | Extra compiler plugin, smaller agent corpus | Acceptable alternates |
| Plain DOM | Zero deps | Tech tree, ledgers, permit timelines become hand-rolled diffing | Only for the debug HUD (lil-gui) |
| In-canvas UI | Single surface | No accessibility, no DOM locators, text rendering work, screenshot-only tests | Rejected, except world-anchored labels (station names, cost floaters) |

Doc 03 reaches the same DOM-overlay conclusion. Framework bundle sizes were not measured.

## 3. Runtime architecture

```
 input (DOM events) -> actions -> Command[]  ------------------.
                                                               v
 UI (Preact, signals) <- SimSnapshot (read-only) <- sim.step(commands)   [fixed tick, deterministic, no DOM/three imports]
                                                               |
                                                               v  WorldEdit events (dirty chunk ids)
 renderer (three) <- chunk meshes <- mesher worker pool <- world/chunk store
        ^-- camera rig, interpolation alpha
```

### 3.1 Deterministic sim, separate from render

- Fixed-timestep accumulator: add clamped frame time, run `step(dt)` while `acc >= dt`, render with `alpha = acc / dt`; clamp frame time (0.25 s in the reference) and cap steps per frame to avoid the spiral of death ([Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/)).
- Tick is in game time, not wall time. Speed controls (pause, 1x, 10x, 100x) change ticks per frame, never `dt`. A multi-year megaproject must be simulable headlessly in milliseconds: `sim.run(nTicks)` with no renderer.
- State changes only via serializable `Command`s (`{t: 'dig', ...}`, `{t: 'layTrack', ...}`, `{t: 'enactPolicy', id}`) applied at tick boundaries. This gives replay, undo (snapshot + replay), scenario scripting, and agent-written tests for free.
- Determinism rules:
  - Money and time are integers (cents, ticks). No float accumulation in the ledger.
  - Seeded PRNG owned by sim state (sfc32 or PCG, ~10 lines, in-repo; `seedrandom` 3.0.5 was last published 2019-09). No `Math.random`, no `Date.now` in `packages/sim`.
  - `Math.sin/cos/exp/pow` are implementation-approximated in the spec ([ECMA-262](https://tc39.es/ecma262/#sec-math.sin)), so results may differ across engines. Basic `+ - * /` and `Math.sqrt` are IEEE-exact. Keep transcendental functions out of state-affecting code or use table/integer versions. Only matters for cross-browser replay and shared saves; same-engine replay is unaffected.
  - Iterate arrays and `Map`s (insertion ordered), never rely on object key order of numeric-like keys.
  - `stateHash()` (FNV-1a or xxhash over the canonical binary state) exposed for tests: same seed + same commands => same hash at tick N.
- Where it runs: main thread first. The command-in, snapshot-out boundary is already message shaped, so moving the sim to a worker later is a transport change.

### 3.2 State for UI

- Sim owns truth. After each step it publishes an immutable `SimSnapshot` (small: budget, date, project statuses, KPIs, selected entity details). UI signals are assigned from it at most once per frame.
- UI never mutates sim state; it dispatches commands. No zustand/redux layer (zustand 5.1.0 exists; not needed with signals).
- UI-only state (open panels, tool selection, camera bookmarks) lives in signals inside `packages/ui` and is excluded from saves except user settings.

### 3.3 Workers

- Mesher pool: `navigator.hardwareConcurrency - 1` capped at ~4; module workers via `new Worker(new URL('./mesher.worker.ts', import.meta.url), { type: 'module' })`. Vite only detects this when `new URL()` sits directly inside `new Worker()` and options are static literals ([Vite features](https://vite.dev/guide/features)).
- Always transfer, never clone **[measured, Node 26]**: `structuredClone` of a 64 MB `Uint8Array` 60 ms; transfer 0.9 ms.
- Comlink 4.4.2: 1.1 kB brotli, `wrap/expose/transfer/proxy`, every call async, callbacks need `Comlink.proxy`, `Remote<T>` typing is best-effort ([repo](https://github.com/GoogleChromeLabs/comlink)). Fine for the control plane (`mesh(chunkId, voxels) => Comlink.transfer(result, [buf])`). A hand-written typed `postMessage` protocol is about 60 lines and removes the dependency; either is acceptable. Pick Comlink unless profiling shows proxy overhead on the hot path.
- Chunk decode (fetch + decompress + parse) also runs in workers.
- SharedArrayBuffer: needs a secure context and cross-origin isolation ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)), i.e. COOP/COEP response headers. Cloudflare Pages can set them via `_headers` ([docs](https://developers.cloudflare.com/pages/configuration/headers/)). GitHub Pages cannot set custom response headers (UNVERIFIED against a GitHub doc; the feature request [community discussion 13309](https://github.com/orgs/community/discussions/13309) is still open, and the known workaround is a `coi-serviceworker` style service worker). Design without SAB; doc 03 defers it for the same reason.

### 3.4 Wasm

Not justified now. **[measured, Node 26, M1 Max, naive unoptimized JS]**:

| Mesher | 32^3 | 64^3 |
|---|---|---|
| Culled faces | 0.18 ms, 6,308 quads | 1.39 ms, 23,774 quads |
| Classic greedy (mask sweep) | 0.57 ms, 1,722 quads | 14.1 ms, 6,446 quads |

Doc 03 reports 0.11 to 0.14 ms per 32^3 chunk for a binary greedy mesher in JS. At these costs a 4-worker pool remeshes thousands of chunks per second; the bottleneck will be upload and draw calls. Reconsider wasm only for: (a) pipeline-grade voxelization if it must run in-browser, (b) zstd decode if chosen as chunk codec, (c) pathfinding/demand assignment over the full network if profiling demands it. If needed: Rust + wasm-pack 0.15.1 (toolchain must be installed: `rustup`, `wasm32-unknown-unknown` target) or AssemblyScript 0.28.20 (npm only, no extra toolchain). Zig was not evaluated.

### 3.5 Save/load

- Parametric source of truth (doc 03 decision 5): tunnels, tracks, stations, policies, ledger are records; voxels are derived by carving. A save therefore does not store voxel grids, only records plus any free-form dig edits as sparse per-chunk deltas.
- Container v1: one JSON document.
  ```ts
  interface SaveFile {
    format: 'bayvox-save';
    schemaVersion: number;       // bump on any shape change
    worldDataVersion: string;    // manifest.worldVersion the save was made against
    scenarioId: string;
    seed: number;
    tick: number;
    sim: SimStateV;              // records, ledger, policies, tech
    edits: { chunk: string; rle: string /* base64 */ }[];  // free-form voxel deltas
    stateHash: string;           // integrity check after load
  }
  ```
- Versioning: `migrations[n]: (SaveV_n) => SaveV_n+1`, applied in a chain on load. Unknown or newer `schemaVersion` fails loudly with the version named; no best-effort loading. One golden save fixture per shipped version in `packages/sim/test/fixtures/`, and a test that every fixture migrates to current and reproduces its `stateHash`.
- `worldDataVersion` mismatch: block load with a clear message unless a pipeline-provided remap exists. Do not silently load against different terrain.
- Validation at the boundary with valibot 1.5.0 (or zod 4.6.7). Not measured for size; valibot is the modular one.
- Storage: autosave to IndexedDB (idb-keyval 6.3.0), manual export/import as a `.json.gz` file. `CompressionStream('gzip')` is native. Call `navigator.storage.persist()`; Safari grants by heuristic and can evict best-effort origins ([WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)).
- Optional later: command-log saves (seed + commands) for replays and bug reports. Depends on the cross-engine determinism rules in 3.1.

## 4. Asset pipeline (build-time, separate package)

Source selection, voxelization, and formats are owned by docs 02 and 04. Engineering shape:

- `packages/pipeline`: Node 26 TypeScript run directly (`node src/cli.ts <stage>`), or Python 3.14 for stages where a pure-Python lib is clearly better. No osmium/GDAL/tippecanoe assumed. Any non-npm dependency must be named in the stage's README with the exact install command, and the stage must fail with a one-line message when it is missing.
- Stages are pure functions of (inputs, params, code version): `fetch -> extract -> normalize -> voxelize/tile -> pack -> manifest`. Each stage writes to `.cache/<stage>/<inputHash>/` and is skipped when the hash exists.
- Cached downloads: `sources.lock.json` checked in, one entry per source: `{ url, sha256, bytes, etag, fetchedAt, license }`. `fetch` verifies sha256; a mismatch is an error naming the URL, never a silent re-download. Raw downloads live in `.cache/downloads/<sha256>` (gitignored).
- Reproducibility: sorted iteration everywhere, no timestamps inside artifacts, fixed float formatting, pinned tool versions. Test: run the fixture pipeline twice, byte-compare outputs.
- Outputs: content-hashed binary files + one `manifest.json`:
  ```ts
  interface WorldManifest {
    format: 'bayvox-world';
    formatVersion: number;         // chunk binary layout version
    worldVersion: string;          // hash of all inputs + params; saves pin this
    origin: { lat: number; lon: number; crs: string };   // local ENU origin
    voxelSizeM: number; chunkSize: number;
    regions: { id: string; file: string; bytes: number; sha256: string; bbox: [number, number, number, number] }[];
    layers: { id: string; file: string; kind: 'osm-rail' | 'stations' | 'projects' | string }[];
    sources: { name: string; license: string; attribution: string; sha256: string }[];
  }
  ```
- Chunk codec: must be decodable in a worker without wasm. Browser support **[measured, Chromium 156]**: `DecompressionStream` accepts `gzip` and `deflate-raw`; rejects `brotli`, `br`, and `zstd`. Node 26's own `DecompressionStream` accepts `brotli` **[measured in the fact-check]**, so a codec test that only runs in Node would not catch a brotli payload that Chromium cannot decode; run codec round-trips in the browser tier too. Node 26 `zlib` has both brotli and zstd for the writer side. So in-file compression = gzip/deflate (native decode, or fflate 0.8.3), and brotli/zstd only as HTTP `Content-Encoding` on whole-file fetches. zstd in-file would need fzstd 0.1.1 (JS, last publish 2024-03) or wasm.
- Pipeline outputs are not committed to the app repo. They are built into `dist-data/` and published as a separate deploy artifact keyed by `worldVersion`.

### Packaging options for static hosts

| Layout | How | Pros | Cons |
|---|---|---|---|
| A. Region files | World split into fixed regions (for example 2 km squares), one content-hashed file each, internal index + per-chunk gzip blobs, fetched whole | Plain GETs, immutable caching, no range/encoding interplay, each file far below 25 MiB; 100 km x 100 km at 2 km = 2,500 files max | Many files; manifest lists them |
| B. Single archive + HTTP Range | PMTiles v3 style: 127-byte header, root directory within the first 16 KiB, Hilbert tile ids, one archive-wide tile compression setting (none/gzip/brotli/zstd) with each tile compressed individually, tile type `Unknown/Other` allowed ([spec](https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md)) | One file, one upload; `pmtiles` 4.5.0 JS reader exists | File exceeds Pages per-file limits quickly, so it needs R2 or similar; range requests must hit an identity-encoded resource, and neither Cloudflare Pages nor Workers static assets answer `Range` with 206 (section 5); a JS/Python writer for custom payloads is UNVERIFIED |
| C. PMTiles only for 2D basemap/minimap | Standard vector tiles for the overview map | Reuses an ecosystem | Building vector tiles without tippecanoe needs another tool (UNVERIFIED which) |

Pick A for voxel/terrain data. Keep C as an optional later layer. B only if the dataset moves to R2.

## 5. Static hosting

| Host | Limits | Headers | Range | Compression |
|---|---|---|---|---|
| GitHub Pages | Site 1 GB, 100 GB/month soft bandwidth, 10 builds/hour soft (not applied to custom Actions workflows), 10 min deploy timeout ([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)); git blocks files over 100 MiB, warns at 50 MiB ([large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)) | No custom headers (UNVERIFIED) | Works **[measured]**: `Range: bytes=0-9` on `pages.github.com` returned `206` with `content-range` | Served gzip when the client offered `zstd, br, gzip` **[measured, one HTML file]** |
| Cloudflare Pages | 20,000 files (free), 100,000 (paid), 25 MiB per file, 500 builds/month free ([limits](https://developers.cloudflare.com/pages/platform/limits/)) | `_headers` file, max 100 rules, applies to static assets ([docs](https://developers.cloudflare.com/pages/configuration/headers/)) | Not honored **[measured in the fact-check, one third-party pages.dev site, CSS/SVG/TXT assets]**: `Range: bytes=0-9` returned `200` with the full body and no `content-range`. No official Pages doc found on this | Zone default by plan: Zstandard on Free, Brotli on Pro/Business; `application/octet-stream` is not in the default compressed types ([compression](https://developers.cloudflare.com/speed/optimization/content/compression/)) |
| Cloudflare Workers static assets | Same 20,000 / 100,000 files and 25 MiB per file ([limits](https://developers.cloudflare.com/workers/platform/limits/)); "Requests to static assets are free and unlimited" ([billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)) | `_headers` (100 rules) or Worker code | Not honored: a `Range` request gets `200 OK` with the full file, no `Content-Range`/`Accept-Ranges`; 206 needs `run_worker_first` plus hand-written slicing in the Worker ([billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)) | Same edge |
| Cloudflare R2 | Free 10 GB-month, 1M class A + 10M class B ops/month, zero egress; then $0.015/GB-month ([pricing](https://developers.cloudflare.com/r2/pricing/)) | CORS config per bucket | Yes; recommended PMTiles host ([Protomaps](https://docs.protomaps.com/pmtiles/cloud-storage)) | Store pre-compressed |

Consequences:

- Binary chunk files are `application/octet-stream`, which Cloudflare does not compress by default. Compress inside the file (section 4) and treat HTTP compression as a bonus for JS/JSON only.
- Layout A fits Cloudflare Pages free tier with room to spare, and GitHub Pages as long as total data stays under 1 GB.
- App and data deploy independently: app bundle references `manifest.json` by URL from config, so a data rebuild does not need an app rebuild.
- No deploy step is wired into CI until the owner asks; CI stops at producing `dist/` and `dist-data/` artifacts.

## 6. Monorepo layout

pnpm workspaces (`pnpm-workspace.yaml`, `workspace:*` protocol, strict resolution so a package cannot import what it does not declare) ([pnpm](https://pnpm.io/workspaces)). No Turborepo/Nx: with TS 7 and Vitest the whole repo checks in seconds; add a task runner only when measured.

```
/
  package.json            scripts: check, test, e2e, bench, build, data:fixture
  pnpm-workspace.yaml     packages/*, apps/*
  biome.json
  tsconfig.base.json
  apps/
    game/                 Vite app: index.html, main.ts, composition root only
  packages/
    core/                 shared types, coords, PRNG, hash, binary readers. Zero deps
    world/                chunk store, palette compression, edits, region loader
    mesher/               voxels -> quad buffers, worker entry
    render/               three.js scene, ChunkRenderer, floating origin, overlays
    input/                DOM events -> actions; camera rig
    sim/                  deterministic sim: cost, schedule, demand, policy/tech
    tools/                dig/track/station tools: actions -> Commands + previews
    scenarios/            scenario data + loaders (The Portal, Link21, ...)
    ui/                   Preact panels, HUD
    pipeline/             build-time data pipeline (Node/Python), never imported by the app
    testkit/              fixtures, golden helpers, fake world generators
  e2e/                    Playwright specs, camera paths, screenshot baselines
  docs/
```

Dependency rules (enforced by package.json deps + a Biome `noRestrictedImports` rule):

| Package | May import | Must not import |
|---|---|---|
| core | nothing | everything |
| world, mesher | core | three, DOM, sim |
| sim | core, world (read + edit API) | three, DOM, ui, render |
| render | core, world, mesher (types), three | sim internals, ui |
| tools | core, world, sim (command types) | three (previews go through a render-facing interface) |
| ui | core, sim (snapshot + command types), preact | three, world internals |
| scenarios | core, sim (types) | render, ui |
| pipeline | core | all runtime packages |
| apps/game | all | n/a |

## 7. Lint and format

| Tool | Facts | Verdict |
|---|---|---|
| Biome 2.6.6 | One binary for format + lint + import sorting; type-aware rules without the TS compiler; nested configs for monorepos; GritQL plugins ([v2 post](https://biomejs.dev/blog/biome-v2/)) | **Pick.** One tool, one config, fast enough to run on every agent edit |
| oxlint 1.93.0 | Type-aware mode via `oxlint-tsgolint`, 59 of 61 typescript-eslint type-aware rules, requires TypeScript 7.0+, coverage "incomplete (but very close)" ([docs](https://oxc.rs/docs/guide/usage/linter/type-aware)) | Optional second pass for `no-floating-promises` class rules if Biome's coverage proves thin. Linter only; a formatter would still be needed |
| ESLint + typescript-eslint | Needs the TS 6 API package side by side ([TS 7 post](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)) | Rejected |

Project-specific rules worth encoding as lint, since agents will otherwise drift: ban `Math.random`/`Date.now`/`performance.now` in `packages/sim`; ban `enum`; ban cross-package deep imports; ban U+2014 in source and docs (owner style rule; a grep step in `check`).

## 8. Testing strategy (headless, agent-runnable)

One entry point: `pnpm check` = biome + `tsc --noEmit` + vitest (node). `pnpm e2e` and `pnpm bench` are separate because they need a browser. All quiet on success, one-line failure per offending input.

| Tier | Tool | What | Runtime target |
|---|---|---|---|
| T0 static | Biome, `tsc` | lint, types, import boundaries | seconds |
| T1 unit | Vitest 5 (node env) | sim rules, cost model, PRNG, coords, chunk store, palette codec, mesher output, save migrations | under 10 s |
| T2 property/golden | Vitest | determinism (`stateHash` after N ticks), mesher invariants, pipeline golden data | under 30 s |
| T3 browser component | Vitest browser mode + `@vitest/browser-playwright` | code that needs real WebGL/worker/OPFS APIs but not the whole app | optional |
| T4 e2e | Playwright | boot, load fixture world, tool flows via DOM + test hooks, screenshots | 1 to 2 min |
| T5 perf | Playwright + tinybench/`vitest bench` | fixed camera paths, mesher/sim micro benches | on demand, hardware GPU only |

### 8.1 T1/T2 specifics

- Mesher invariants (cheap, catch most bugs): quad count for known shapes (single voxel = 6, full chunk = 6 with greedy), total face area equals exposed-face count, no quad outside chunk bounds, identical output for identical input, neighbor-padding seams produce no interior faces.
- Sim: scenario scripts as command lists with expected `stateHash` and KPI assertions ("The Portal at Bay Area baseline costs X, at Polish baseline X/k, k within the range from doc 06").
- Pipeline golden data: a tiny checked-in fixture (a few city blocks of OSM as raw `.osm.pbf` or GeoJSON, a small DEM crop, all under ~1 MB) goes through the full pipeline; outputs compared by sha256 to checked-in goldens. Regenerate only with an explicit `--update-golden` flag, and the diff is reviewed. Second test: two consecutive runs are byte-identical.
- Vitest browser mode: providers `playwright` (recommended, parallel), `webdriverio`, `preview`; headless only with playwright/webdriverio ([docs](https://vitest.dev/guide/browser/)). It also has `toMatchScreenshot` with pixelmatch and per-browser/platform baseline names ([docs](https://vitest.dev/guide/browser/visual-regression-testing)). Keep screenshots in Playwright (one mechanism); use browser mode only for API-level tests.

### 8.2 Headless WebGL/WebGPU on macOS: experiment

Setup: Playwright 1.64.1, bundled Chromium 156.0.8078.4 (headless shell and full build), three 0.187.0, scene of 20,000 instanced cubes at 640x480, three renderer variants (`WebGLRenderer`, `WebGPURenderer`, `WebGPURenderer{forceWebGL}`), each page loaded twice and screenshotted. **[measured]**

| Launch config | WebGL2 renderer string | `requestAdapter()` | WebGPURenderer backend | Wall time, 6 page loads |
|---|---|---|---|---|
| default (`chromium-headless-shell`, no args) | ANGLE Vulkan SwiftShader (software) | `null` | falls back to WebGLBackend | 75 s |
| shell + `--use-angle=metal --enable-gpu` | ANGLE Metal, Apple M1 Max | apple / metal-3 | WebGPUBackend | **1.3 s** |
| shell + `--use-angle=swiftshader --enable-unsafe-swiftshader` | SwiftShader | `null` | WebGLBackend | 86 s |
| shell + `--enable-unsafe-webgpu` | SwiftShader | google / swiftshader, fallback adapter | WebGPUBackend (software) | 73 s |
| `channel: 'chromium'` (new headless), no args | ANGLE Metal, Apple M1 Max | apple / metal-3 | WebGPUBackend | 5.9 s (first launch) |
| `channel: 'chromium'` + `--enable-unsafe-webgpu` | ANGLE Metal | apple / metal-3 | WebGPUBackend | 1.1 s |
| `channel: 'chromium'` + `--use-angle=swiftshader --enable-unsafe-swiftshader --enable-unsafe-webgpu --use-webgpu-adapter=swiftshader` | SwiftShader | google / swiftshader | WebGPUBackend (software) | 83 s |
| `channel: 'chromium'` + `--disable-gpu --enable-unsafe-swiftshader` | SwiftShader | `null` | WebGLBackend | 74 s |

Findings:

- Playwright's default headless on macOS is software GL with no WebGPU adapter. Two ways to get the real GPU: add `--use-angle=metal --enable-gpu` to the headless shell, or use `channel: 'chromium'` (new headless, the full browser; opt-in documented at [playwright.dev](https://playwright.dev/docs/browsers)). No `--enable-unsafe-webgpu` needed on macOS for hardware WebGPU.
- Software WebGPU exists: `--enable-unsafe-webgpu` yields a SwiftShader fallback adapter, so WebGPU code paths can run on GPU-less CI.
- Screenshots were byte-identical across the two loads in every config (sha1 of PNG). Software WebGL output was also identical across headless shell and full Chromium. Hardware Metal output was identical across both browser builds on this machine.
- Hardware and software images differ from each other, and the three renderer variants differ from each other (WebGL vs WebGPU backend output is not pixel-equal).
- Software GL is about 60x slower end to end for this scene (roughly 12 s per load + screenshot). Software-GL tests need tiny viewports and tiny scenes.
- Not tested: Linux flags. Chrome's guidance for Linux headless WebGPU is `--no-sandbox --headless=new --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --enable-unsafe-webgpu` plus working GPU drivers ([Chrome blog](https://developer.chrome.com/blog/supercharge-web-ai-testing)). Whether SwiftShader output on Linux matches macOS SwiftShader byte for byte is UNVERIFIED.

### 8.3 Screenshot tests

- Playwright `toHaveScreenshot`: pixelmatch, `threshold` default 0.2, `maxDiffPixels`, baselines named `<name>-<project>-<platform>.png`, retries until two consecutive captures match; docs warn that rendering varies with OS, hardware, and headless mode ([docs](https://playwright.dev/docs/test-snapshots)).
- Two Playwright projects:
  - `gpu` (default for local agents on this Mac): headless shell + `--use-angle=metal --enable-gpu`. Fast. Baselines `*-gpu-darwin.png`.
  - `swgl` (CI on GPU-less Linux runners, also runnable locally): default headless shell, SwiftShader, 320x240 viewport, minimal scenes. Baselines `*-swgl-<platform>.png`.
- Make frames deterministic before comparing pixels: URL params `?scenario=<id>&seed=<n>&cam=<bookmark>&freeze=1`; `freeze` stops the wall clock, disables animation/particles/time-of-day, and the test waits on `await window.__game.settled()` (all chunk meshes for the view uploaded, sim paused at tick N). `deviceScaleFactor: 1`, fixed viewport.
- Screenshots are the second line of defense. First line is structural asserts through a test hook, which survive GPU and driver changes:
  ```ts
  interface GameTestHook {
    settled(): Promise<void>;
    stats(): { drawCalls: number; triangles: number; chunksLoaded: number; chunksMeshed: number; gpuBytes: number };
    simHash(): string;
    dispatch(cmd: Command): void;
    stepSim(ticks: number): void;
    setCamera(b: CameraBookmark): void;
    pick(screenX: number, screenY: number): { voxel: [number, number, number]; material: number } | null;
  }
  ```
- Tolerances are set once per project from measured noise (zero on the same machine per 8.2) and not widened to make a failing change pass; a real visual change updates the baseline in the same PR with the image diff attached.

### 8.4 Perf benchmarks

- Micro: `vitest bench` / tinybench 6.2.3 for mesher, chunk codec, sim tick. Report ms/op.
- Macro: Playwright `gpu` project, fixed camera paths (`e2e/paths/*.json`: keyframes of position/target/time), game stepped manually (`renderFrames(n)`) rather than via free-running rAF, recording per-frame CPU time, `stats()`, and chunk streaming latency. Output JSON to `bench-results/` (gitignored) plus a one-line summary.
- Gate on deterministic counters (draw calls, triangles, GPU bytes, chunks meshed for a path) with exact budgets. Report wall-clock numbers (p50/p95/p99 frame ms) without gating on them in CI; shared runners and software GL make them noise. Timing budgets are enforced only on the hardware `gpu` project, on a named machine class.
- GPU timer queries (`EXT_disjoint_timer_query_webgl2`) availability in headless Chromium: UNVERIFIED.

## 9. CI

- GitHub Actions standard runners: `ubuntu-latest` 4 CPU / 16 GB (public repos), 2 CPU / 8 GB (private); `macos-latest` is arm64 M1, 3 CPU / 7 GB; no GPU listed for standard runners, GPU only on paid larger runners ([docs](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)).
- Jobs (all on `ubuntu-latest` unless noted):
  1. `check`: `pnpm i --frozen-lockfile`, biome, `tsc --noEmit`, vitest node.
  2. `pipeline-golden`: fixture pipeline + byte comparison.
  3. `build`: `vite build`, upload `dist/`; bundle-size report.
  4. `e2e-swgl`: Playwright `swgl` project with Linux baselines generated in CI (Vitest's guidance is the same: generate references in CI, not locally ([docs](https://vitest.dev/guide/browser/visual-regression-testing))).
  5. Optional `e2e-gpu-macos` on `macos-latest`: whether its virtualized GPU exposes Metal to headless Chromium is UNVERIFIED; try once before relying on it.
- Cache: pnpm store, Playwright browsers (`~/.cache/ms-playwright`; this run's Chromium + headless shell download was 366 MB + 203 MB on disk **[measured]**).
- No deploy job. Branch + PR; owner merges and deploys.

## 10. Pitfalls

### 10.1 Float precision at 100 km

- float32 spacing **[computed]**: 3.9 mm at 50 km from origin, 7.8 mm at 100 km. Vertex positions in absolute world meters would jitter visibly at close zoom and break seams between chunks.
- three `WebGLRenderer` computes `modelViewMatrix = camera.matrixWorldInverse * object.matrixWorld` on the CPU in JS doubles (`three.module.js` r187, line 17996) before upload. So chunk-local vertex coordinates + one `Object3D` per chunk at its world offset already gives camera-relative precision per object.
- `WebGPURenderer` multiplies on the GPU in 32-bit by default; `renderer.highPrecision = true` switches to CPU 64-bit, and its doc comment states it "is not compatible with `InstancedMesh` and `SkinnedMesh`" (`three.webgpu.js` r187, around line 23763). That matters for a later WebGPU backend because doc 03's design is instanced quads.
- Still do an explicit floating origin: sim and world use integer voxel coordinates (int32 covers 100 km at any plausible voxel size) relative to a fixed ENU origin from the manifest; the render package keeps `renderOrigin` (a chunk coordinate) and rebases when the camera moves more than a few km, so camera position, shadow cameras, raycasts, and custom shader uniforms stay small. Instanced paths must receive chunk offsets relative to `renderOrigin`, not world absolute.
- Depth: `WebGLRenderer` has `reversedDepthBuffer` (needs `EXT_clip_control`, falls back with a warning) and `logarithmicDepthBuffer` (ignored when reversed is active) (`three.module.js` r187, lines 2423 to 2432). Doc 03 picks reversed depth.
- Geodesy: one local tangent-plane projection for the whole region is a pipeline decision (doc 04); the app never sees lat/lon except for labels.

### 10.2 Large typed arrays and GC

- V8 allows huge arrays **[measured]**: `new Uint8Array(2**33)` succeeds in Node 26 (V8 14.6) and in Chromium 156. Safari and Firefox limits UNVERIFIED. Do not design around multi-GB buffers: per-chunk buffers of tens of kB, pooled.
- Never allocate per frame or per chunk in hot paths: mesher keeps scratch buffers sized for the worst case and returns an exact-size copy that is transferred; renderer reuses `BufferAttribute`s and updates ranges.
- A detached (transferred) buffer has `byteLength === 0`; treat use-after-transfer as a bug and assert in debug builds.
- Avoid object-per-voxel, object-per-quad, and closures in inner loops; these are the usual sources of minor-GC stutter.
- Dispose GPU resources explicitly on chunk unload (`geometry.dispose()`); r187 moved internal bookkeeping to `WeakRef`/`FinalizationRegistry` and r186 added `Object3D.dispose()` ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)), but GPU memory is not garbage collected on your schedule.
- Track `gpuBytes` in `stats()` and enforce a budget with LRU chunk eviction.

### 10.3 Mobile Safari

- WebGPU is on by default in Safari 26 on iOS/iPadOS ([gpuweb status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)); WebGL 2 remains the safe path.
- Per-tab memory ceilings on iOS are not documented by Apple; community reports put practical limits well below desktop and the failure mode is a tab reload. Numbers UNVERIFIED. Plan: a `quality` profile that scales view distance and chunk cache by `navigator.deviceMemory` where present and by measured allocation failures elsewhere; handle `webglcontextlost`/`restored` by rebuilding GPU buffers from the chunk store.
- Storage: Safari 17+ origin quota up to 60% of disk for browser apps, overall 80%, LRU eviction for best-effort origins ([WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)). Saves must always be exportable.
- Pointer Lock on iOS: UNVERIFIED (MDN marks the API as not Baseline without naming the gaps). Assume touch needs its own control scheme.
- Recommendation: desktop Chromium/Safari/Firefox is the v1 target; mobile is "boots and does not crash" until a milestone says otherwise.

### 10.4 Pointer lock and input

- `requestPointerLock()` needs a user gesture, returns a promise in modern browsers and `undefined` in old ones; `{ unadjustedMovement: true }` disables OS acceleration and can reject with `NotSupportedError`, so retry without it; Esc exits and fires `pointerlockchange`; after a user-initiated exit an engagement gesture is required again ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)).
- This is a builder game: default camera is orbit/pan with a free cursor (doc 03 picks `camera-controls`). Pointer lock is only for an optional first-person "walk the tunnel" mode.
- Input architecture: `packages/input` maps raw DOM events to semantic actions (`camera.pan`, `tool.primary`, `tool.cancel`) through a rebindable table keyed on `KeyboardEvent.code`; tools consume actions, not events. That keeps tools unit-testable with synthetic action streams.
- Details that bite: use Pointer Events with `setPointerCapture` for drags; `wheel` listener must be `{ passive: false }` to `preventDefault`; clear held-key state on `blur` and `visibilitychange`; pause the sim accumulator when the tab is hidden (rAF stops, and the frame-time clamp alone would still advance one clamped step on return); `contextmenu` suppressed on the canvas only; UI overlay elements stop propagation so clicks on panels do not dig.

## 11. Work packages and interfaces

Each WP is one package, owned by one agent at a time, testable alone against fakes from `testkit`. Interfaces below are the contract; internals are free.

| WP | Package | Depends on | Independent test |
|---|---|---|---|
| A. Core | `core` | none | Vitest: coords, PRNG, hash, binary IO |
| B. Data pipeline | `pipeline` | core (manifest/chunk format types) | Golden fixture, byte-reproducibility |
| C. World/chunk store | `world` | core | Vitest: get/set, palette codec, edit log, region decode from fixture bytes |
| D. Mesher | `mesher` | core | Vitest invariants + bench |
| E. Renderer | `render` | core, world, mesher types | Playwright page that renders a `testkit` synthetic world; stats + screenshots |
| F. Camera/input | `input` | core | Vitest with synthetic events; Playwright for pointer capture |
| G. Tools (dig/track/station) | `tools` | core, world, sim command types | Vitest: action stream in, Commands + preview geometry out |
| H. Sim (cost/time/demand/policy) | `sim` | core, world edit API | Vitest: scenario scripts, `stateHash`, save migrations |
| I. UI | `ui` | core, sim snapshot/command types | Vitest browser mode or Playwright with a fake snapshot source |
| J. Scenarios | `scenarios` | core, sim types | Vitest: every scenario validates against schema and runs 1,000 ticks |
| K. App shell + e2e | `apps/game`, `e2e` | all | Playwright end to end |

```ts
// core
type ChunkKey = number;                       // packed (cx, cy, cz)
interface VoxelCoord { x: number; y: number; z: number }   // int32, world voxel units, ENU from manifest origin

// world (C)
interface ChunkData { key: ChunkKey; palette: Uint16Array; indices: Uint8Array | Uint16Array | null /* null = uniform */ }
interface WorldStore {
  getVoxel(c: VoxelCoord): number;
  applyEdit(e: WorldEdit): ChunkKey[];        // returns dirty chunks, including neighbors
  getChunk(key: ChunkKey): ChunkData | undefined;
  paddedCopy(key: ChunkKey, out: Uint16Array): void;   // (N+2)^3 for the mesher
  onDirty(cb: (keys: ChunkKey[]) => void): () => void;
  ensureLoaded(aabb: Aabb): Promise<void>;
}
type WorldEdit =
  | { t: 'fillBox'; min: VoxelCoord; max: VoxelCoord; material: number }
  | { t: 'carveCapsule'; a: VoxelCoord; b: VoxelCoord; radius: number }
  | { t: 'setVoxels'; coords: Int32Array; materials: Uint16Array };

// mesher (D): pure, runs in a worker
interface MeshInput { key: ChunkKey; size: number; padded: Uint16Array }
interface MeshOutput { key: ChunkKey; quads: Uint32Array; faceOffsets: Uint32Array /* 7 entries, 6 buckets */; opaqueCount: number }
function meshChunk(input: MeshInput, scratch: MesherScratch): MeshOutput;

// render (E)
interface ChunkRenderer {
  upload(mesh: MeshOutput): void;
  remove(key: ChunkKey): void;
  setRenderOrigin(chunk: VoxelCoord): void;
  draw(camera: CameraState, alpha: number): void;
  stats(): RenderStats;
}

// sim (H)
interface Sim {
  step(commands: readonly Command[]): void;   // advances exactly one tick
  snapshot(): SimSnapshot;                    // immutable, UI-facing
  serialize(): SimStateV;
  hash(): string;
}
function createSim(scenario: Scenario, seed: number, world: WorldStore): Sim;
function loadSim(save: SaveFile, world: WorldStore): Sim;

// tools (G)
interface Tool {
  id: string;
  onAction(a: InputAction, ctx: ToolContext): void;
  preview(): PreviewGeometry | null;          // renderer draws it; not sim state
  commit(): Command[];
}

// scenarios (J)
interface Scenario {
  id: string; title: string;
  start: { date: string; budgetCents: number; policies: string[]; tech: string[] };
  camera: CameraBookmark;
  existing: ProjectRecord[];                  // pre-built network
  objectives: Objective[];                    // e.g. connect 4th & King to Salesforce Transit Center
  costProfile: 'bayAreaStatusQuo' | 'polishBaseline' | string;
}
```

### Milestones

| M | Goal | WPs in parallel | Exit test |
|---|---|---|---|
| M0 Skeleton | Repo, workspace, `pnpm check`, CI, empty app boots headless, test hook exists | A, K | `check` green; Playwright boots app in `gpu` and `swgl` projects |
| M1 Synthetic voxel slice | Procedural heightmap world, chunk store, mesher pool, renderer, orbit camera | C, D, E, F | Fixed camera path on synthetic world within counter budgets; screenshots stable |
| M2 Dig and save | Dig tool, parametric tunnel carve, edit log, save/load v1 | G, H (ledger only), C | Scripted dig => expected voxel counts and cost; save, reload, same `stateHash` |
| M3 Real data | Pipeline fixture then SF downtown tile set, region loader, manifest | B (starts at M0 against the format types), C | Golden pipeline test; app loads real downtown SF regions |
| M4 Transit sim | Track graph, stations, TBM schedule, cost/time model, policy/tech tree, demand v0 | H, G, I | The Portal scenario playable end to end headlessly via commands; KPI assertions from docs 05/06/09 |
| M5 Scenarios and UI | Scenario loader, objectives, tech-tree/budget/permit panels, underground view | J, I, E | Each scenario runs 1,000 ticks; UI flows in Playwright |
| M6 Scale and ship | Full Bay Area data, LOD tiers, perf pass, hosting, mobile smoke | B, E, K | Perf budgets on reference path; data within host limits; deploy on owner's go |

Parallelization notes: B is independent from day one once `WorldManifest` and the chunk binary layout are frozen in `core`. C/D/E can proceed against `testkit` synthetic worlds without B. H needs only `WorldStore`'s edit API, so it can run against an in-memory fake. I needs only `SimSnapshot` and `Command` types.

## 12. Recommendations for the game

1. Stack: Vite 8.3 + TypeScript 7.0 (`erasableSyntaxOnly`, `moduleResolution: bundler`, explicit `types`) + three 0.187 `WebGLRenderer` (per doc 03), pnpm workspaces, Biome 2.6, Vitest 5.1, Playwright 1.64/1.65. Pin exact versions at least 7 days old because of the local npm cooldown.
2. No ECS library. Plain modules with SoA typed-array tables and integer ids. bitecs 0.4 is the fallback if entity counts explode; miniplex and koota rejected.
3. UI is a DOM overlay in Preact + signals; canvas is for the world only. lil-gui for the debug HUD.
4. Sim is a pure package with a fixed game-time tick, command-only mutation, integer money, in-repo seeded PRNG, and a `stateHash`. Runs on the main thread first; no transcendental `Math` functions in state-affecting code.
5. Workers for meshing and chunk decode, transferables only, Comlink for the control plane. No SharedArrayBuffer, no wasm in v1.
6. Saves are versioned JSON of parametric records plus sparse voxel deltas, pinned to `worldDataVersion`, migrated by a chain of pure functions, validated at load, failing loudly on anything unknown. IndexedDB autosave plus file export.
7. Pipeline is a separate package with hash-keyed stage caching, `sources.lock.json` with sha256, byte-reproducible outputs, and a `manifest.json` with `worldVersion`. Chunk payloads use gzip/deflate inside the file because Chromium's `DecompressionStream` does not accept brotli or zstd.
8. Data layout A (region files of a few MB, content-hashed) on Cloudflare Pages or Workers static assets (20,000 files, 25 MiB each on free); GitHub Pages works for early demos under 1 GB. R2 when data outgrows that. App and data deploy separately. No deploy automation until asked.
9. Tests: `pnpm check` under ~30 s for the agent inner loop. Playwright with two projects: `gpu` (`--use-angle=metal --enable-gpu` on the headless shell, measured hardware Metal + WebGPU) and `swgl` (default SwiftShader, tiny viewport). Assert on test-hook counters and `simHash` first, pixels second.
10. Perf gates on deterministic counters; wall-clock numbers are reported, and budgeted only on hardware GPU.
11. Floating origin and chunk-local coordinates from M1; int32 voxel coordinates in sim/world; `reversedDepthBuffer`.
12. Desktop first. Mobile Safari is a smoke target until M6.
13. Build order M0 to M6 with work packages A to K and the interfaces in section 11 frozen in `core` during M0.

## 13. Open questions

1. Voxel size and chunk format are owned by docs 03/04 (2 m, 32^3, palette). `WorldManifest`/`ChunkData` above are placeholders until those are frozen; who owns the freeze?
2. Hosting: is a Cloudflare account acceptable, or should v1 be GitHub Pages only? Decides whether COOP/COEP (and therefore SAB later) is ever available, and the data size ceiling.
3. Does the full Bay Area dataset fit 1 GB (GitHub Pages) or 20,000 x 25 MiB (Cloudflare) after compression? Needs doc 04's size estimate against layout A.
4. Is cross-browser deterministic replay a goal (shareable replays, leaderboards), or is same-engine determinism enough? Decides how strict the no-transcendentals rule must be.
5. CI provider and repo visibility: public repo gives 4-CPU Linux runners; is a macOS hardware-GPU e2e job wanted, and does `macos-latest` expose Metal to headless Chromium (untested)?
6. Cross-OS stability of SwiftShader screenshots (macOS vs Linux) is untested; if they match, one baseline set serves local and CI.
7. Preact vs Solid vs Svelte is a taste call with similar engineering cost; confirm Preact.
8. Sim tick granularity (one game hour? one day?) and maximum speed-up; affects demand model resolution (doc 09) and TBM progress animation.
9. Mobile ambition: touch controls and memory profiles are real scope; in or out for v1?
10. Unverified items to close when search is available: GitHub Pages custom-header support (official doc), iOS per-tab memory limits, Pointer Lock on iOS, Safari/Firefox typed-array size limits, a tippecanoe-free vector tile writer, a JS/Python PMTiles writer for custom payloads, GPU timer queries in headless Chromium.

## 14. Experiment artifacts

Scratch directory: `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/arch/`

| File | Purpose |
|---|---|
| `probe.mjs`, `www/index.html` | Headless GL/WebGPU matrix in 8.2 (needs `PLAYWRIGHT_BROWSERS_PATH=<scratch>/pw-browsers`) |
| `shots/*.png` | 24 screenshots from the matrix |
| `mesh.mjs` | Mesher and transfer-vs-clone microbenchmarks in 3.3/3.4 |
| `dec.mjs` | `DecompressionStream` format and typed-array size probe in Chromium |

## Corrections (2026-11-09 fact-check)

Independent re-check of 20 claims (npm registry JSON, primary docs, local re-runs in `scratchpad/verify-10-architecture-tooling/`). Confirmed without change: every version in section 1, Vite 8.0 date and Node floor, TS 7.0 defaults/removals/API/`--checkers`, WebGPU reach, GitHub Pages and Cloudflare Pages/Workers/R2 limits and pricing, Cloudflare compression defaults, Actions runner specs, Playwright and Vitest screenshot behavior, oxlint type-aware coverage, WebKit storage quotas, three r187 source line references and gzip sizes, float32 spacing, Node type stripping, `Uint8Array(2**33)`, Chromium 156 `DecompressionStream` formats, GitHub Pages `206`. Not re-run: the 8.2 headless GPU matrix timings and the 3.4 mesher timings.

- TypeScript 7.0 GA date was 2026-06-18; that is the RC (`7.0.1-rc`). GA is 7.0.2 on 2026-07-08. Source: npm registry `time` field, announcement post byline.
- koota "published today" was wrong: 0.6.6 stable is from 2026-04-09; only `0.6.6-canary.*` builds were published on 2026-11-09. Rejection stands (pre-1.0, React-leaning). Source: npm registry `time` field.
- `seedrandom` 3.0.5 last publish was 2022-06; that is the registry `modified` date. Actual publish is 2019-09-17. Source: npm registry.
- three.js churn: "every release r181 to r187" overstated; r184 has no WebGPURenderer/TSL breaking note. `PCFSoftShadowMap` r186 removal is `WebGPURenderer` only. Source: three.js Migration Guide.
- PMTiles "per-tile compression" reworded: the algorithm is one header field for the whole archive. Source: PMTiles v3 spec.
- Cloudflare range requests were UNVERIFIED; now refuted as an option. Workers static assets are documented to return `200` with the full file for `Range` requests; a pages.dev static site measured the same. Layout B therefore cannot run on Pages or Workers static assets without Worker code; this strengthens the pick of layout A. Sources: Cloudflare Workers static assets "Billing and limitations", curl against `staging-blog.pages.dev`.
- Added: Node 26 `DecompressionStream` accepts `brotli` while Chromium 156 rejects it (local run), so codec tests must also run in a browser.

