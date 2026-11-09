# 03: Voxel rendering tech in the browser

Researched 2026-11-09. Versions checked live against npm registry and GitHub API on that date. Numbers without a URL are either (a) measured locally (section 5.2, marked MEASURED) or (b) derived arithmetic / design targets (marked DERIVED or TARGET). Anything not confirmed against a primary source is marked UNVERIFIED.

## 1. Verdict in one screen

- Renderer: **three.js r187, classic `WebGLRenderer` (WebGL2)** for v1, custom `ShaderMaterial` drawing packed instanced quads. WebGPU path deferred, kept possible by a renderer-agnostic mesher output.
- No off-the-shelf voxel engine fits. All maintained ones are Minecraft clones (1 m blocks, player scale, infinite procedural worlds, often server-authoritative). This game is geospatial, multi-LOD, builder-camera. Write a small custom voxel layer (est. 2-3k LOC TS).
- World model: voxels are a **rasterization target, not the source of truth**. Base terrain is regenerated from DEM + OSM; tunnels/stations are parametric objects (alignment + profile) carved into voxels. Saves are small JSON plus optional chunk diffs.
- Near field 2 m voxels in 32^3 chunks (64 m cubes), binary greedy meshing in Web Workers (plain TS, transferables, no SharedArrayBuffer), far field heightmap clipmap rings for the whole Bay.
- Underground: shader cut plane + slice-texture caps, x-ray silhouette pass for infrastructure, plus a 2D longitudinal profile panel.
- Desktop first. Tablet plausible with a reduced tier. Phone is not a v1 target.

## 2. Rendering engines (late 2026)

| Option | Version (date) | Status | Fit |
|---|---|---|---|
| three.js | 0.187.0 / r187 (2026-10-30) [npm](https://www.npmjs.com/package/three), [releases](https://github.com/mrdoob/three.js/releases) | ~118k stars, pushed daily | **Chosen** |
| Babylon.js | @babylonjs/core 9.35.0 (2026-11-06) [npm](https://www.npmjs.com/package/@babylonjs/core) | Active; 9.0 shipped March 2026 (secondary source: [cinevva](https://app.cinevva.com/news/2026-03-26-babylonjs-9)) | Viable, no decisive advantage here |
| PlayCanvas | playcanvas 2.24.0 (2026-11-09) [npm](https://www.npmjs.com/package/playcanvas) | Active | Viable; editor-centric workflow not needed |
| Raw WebGPU | spec is W3C CR Draft, 2026-09-15 [w3.org](https://www.w3.org/TR/webgpu/) | n/a | Best ceiling (vertex pulling, compute), but no Firefox Linux/Android/Intel Mac and everything hand-built. Deferred |
| Bevy (wasm) | 0.20 (2026-10-08) [bevy.org](https://bevy.org/news/bevy-0-20/); v0.20.1 tag 2026-10-28 [GitHub](https://github.com/bevyengine/bevy/releases) | Active | Rejected, see 2.3 |

### 2.1 three.js: WebGLRenderer vs WebGPURenderer + TSL

Primary source, three.js manual ([WebGPURenderer page](https://threejs.org/manual/pages/webgpurenderer.html)):

- "The renderer itself is still in an experimental state although its maturity level has been greatly improved in the last years."
- "depending on your application and scene setup, you will encounter missing features or a better performance with `WebGLRenderer`."
- "`WebGLRenderer` is still maintained and the recommended choice for pure WebGL 2 applications", but "no plans to add larger new features".
- `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile()` and `EffectComposer` are not supported in `WebGPURenderer`; custom shading must be TSL node materials.
- WebGPURenderer auto-falls back to a WebGL2 backend; `forceWebGL: true` forces it. Init is async (`await renderer.init()` or `setAnimationLoop`).
- Import path `three/webgpu` and `three/tsl`. r187 build ships `three.webgpu.js`, `three.tsl.js` next to `three.module.js` (verified in the npm tarball).

Known performance issue, still open:

- [three.js #30560](https://github.com/mrdoob/three.js/issues/30560) (open, High priority, last comment 2026-09-15): per-object UBO updates make many-mesh scenes slower. Original report (r173, M1 Pro): 20,000 non-instanced cubes at ~60 fps WebGLRenderer vs ~15 fps WebGPURenderer. r186 on M4 Max, WebGL2 fallback: `render()` 2.88 ms vs 2.20 ms (+31%), GL calls ~2,350 vs ~1,300.
- [Forum thread, r183](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904) (RTX 4090 laptop, Chrome 148, 4,000 meshes, ~8M tris): CPU render 4.5 ms WebGLRenderer, 9.7 ms WebGPU backend, 10.3 ms `forceWebGL`; first frame 32 / 167 / 344 ms. No maintainer reply.
- Relevance: a chunked voxel world is exactly a many-mesh scene. The overhead disappears if chunks are batched into few draws, but then three's scene graph is doing little and the value of WebGPURenderer is mostly TSL portability.

Features verified present in r187 source (local `npm i three@0.187.0`, grep):

- `BatchedMesh` (multi-draw via `WEBGL_multi_draw`, per-instance indirection texture), `DataArrayTexture`, `reversedDepthBuffer` and `logarithmicDepthBuffer` renderer options (both renderers), `ClippingNode` / clipping groups in the node system, `GTAOPass` / `OutlinePass` (classic) and `GTAONode` / `OutlineNode` (TSL), `MapControls`, `OrbitControls`, `PointerLockControls`.

Decision logic:

| Criterion | WebGLRenderer | WebGPURenderer + TSL |
|---|---|---|
| Reach | WebGL2 everywhere | WebGPU where available, WebGL2 fallback elsewhere |
| Maturity (per three.js manual) | "recommended choice for pure WebGL 2 applications" | "still in an experimental state" |
| Many-mesh CPU cost | baseline | ~2x on both backends (issue above) |
| Custom packed-quad shader | GLSL `ShaderMaterial`, straightforward | TSL node material, doable, fewer examples |
| Compute shaders, storage buffers | no | yes on WebGPU backend only |
| Future features | frozen | all new work lands here |

The game needs no compute, no storage buffers and no exotic post. Pick WebGLRenderer now; revisit when #30560 closes and the manual drops "experimental".

### 2.2 WebGPU browser support (2026-11)

From the [gpuweb implementation status wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status):

| Browser | Platform | Status |
|---|---|---|
| Chrome/Edge | Windows x64, macOS, ChromeOS | shipped 113 |
| Chrome | Android | 121 (ARM/Qualcomm/Intel GPUs, Android 12+); 139 (Imagination, Android 16+); Samsung Xclipse and others TBD |
| Chrome | Linux | 144 (Intel Gen12+), 147 (NVIDIA driver 535.183.01+, Wayland); other GPUs behind flag |
| Chrome | Windows ARM64 | behind flag |
| Firefox | Windows | shipped 141 |
| Firefox | macOS, Apple Silicon | 145 (macOS 26+), 147 (all macOS versions) |
| Firefox | macOS, Intel | Nightly only |
| Firefox | Linux | Nightly only |
| Firefox | Android | behind flag |
| Safari | macOS / iOS / iPadOS / visionOS | shipped 26 |

- [caniuse.com/webgpu](https://caniuse.com/webgpu): 88.63% global (86.83% full + 1.8% partial). The fetched summary of the caniuse table listed Firefox as "disabled by default", which conflicts with the gpuweb wiki; treat the wiki as authoritative, per-row caniuse detail UNVERIFIED.
- Chrome 146 added a WebGPU compatibility mode (`featureLevel: "compatibility"`) aimed at older Android hardware ([Chrome blog](https://developer.chrome.com/blog/new-in-webgpu-146)).
- Default limits relevant to voxel buffers ([spec](https://www.w3.org/TR/webgpu/)): `maxBufferSize` 256 MiB, `maxStorageBufferBindingSize` 128 MiB, `maxTextureArrayLayers` 256, `maxTextureDimension2D` 8192, `maxVertexBuffers` 8, `maxStorageBuffersPerShaderStage` 8.
- Net: WebGPU-only would exclude Firefox on Linux, Android and Intel Macs, and a tail of Android/Linux GPUs. Not a blocker for a hobby-scale game, but nothing in this design needs it.

### 2.3 Bevy / wasm

- WebGPU on web since Bevy 0.11 ([bevy.org](https://bevy.org/news/bevy-webgpu/)).
- Wasm binary size: 2023 data points of ~13 MB raw, ~3.9 MB compressed after profile tuning (secondary: Reddit thread summarised in search results). UNVERIFIED for 0.20.
- Bevy builds with wasm atomics but its internals were single-threaded on web as of [PR #12205](https://github.com/bevyengine/bevy/pull/12205). UNVERIFIED whether 0.20 changed this; the 0.20 notes found do not mention web.
- Rejected: large download, slow compile-iterate loop, no DOM UI (the game is UI-heavy: tech tree, budgets, permits), and the meshing hot loop is fast enough in JS (section 5.2).

## 3. Voxel-specific engines

| Engine | Version / last activity | Renderer | Verdict |
|---|---|---|---|
| [noa-engine](https://github.com/fenomas/noa) | 0.33.0, npm modified 2023-05-19, repo last push 2023-07-31; peer dep `@babylonjs/core ^6.1.0` (current is 9.35) | Babylon 6 | Unmaintained in practice (README still says "under active development"). Reject |
| [voxelize](https://github.com/voxelize/voxelize) | `@voxelize/core` 3.0.0 (2026-08-03), repo pushed 2026-11-08, MIT, 694 stars | three.js client + **Rust authoritative server**, protobuf over WebSocket | Maintained, but multiplayer-server-shaped. Wrong architecture for a static-hosted single-player sim. Reject, read for ideas |
| [Divine Voxel Engine](https://github.com/Divine-Star-Software/DivineVoxelEngine) | `@divinevoxel/vlox` 0.0.86 (2026-09-19), MIT, 265 stars | Babylon official; three.js and WebGPU ("Quantum") renderer packages "have not been worked on in a while" | Maintained, 0.0.x API, Babylon-bound. Multi-threaded, SAB optional (`useSharedMemory: false`). Reject |
| [minecraft-web-client](https://github.com/zardoy/minecraft-web-client) | pushed 2026-11-07, MIT | three.js based (builds on prismarine-viewer) | Reference implementation of worker meshing on three.js, not a library |
| [prismarine-viewer](https://github.com/PrismarineJS/prismarine-viewer) | pushed 2026-10-06, MIT | three.js | Reference |
| [ClassiCube](https://github.com/ClassiCube/ClassiCube) | pushed 2026-11-07 | C compiled to wasm/WebGL | Reference for a C-to-web voxel client |
| [HYTOPIA SDK](https://github.com/hytopiagg/sdk) | pushed 2026-03-02 | platform SDK | Platform-locked. Reject |

Common mismatch: fixed 1 m block worlds with first-person physics, no geospatial LOD, no notion of a 100 km map. Borrow algorithms, not code.

## 4. Scale problem (drives every other choice)

DERIVED, assumptions flagged; exact extents belong to the map/OSM research docs.

- Assumed play box: ~100 km x 120 km covering SF, Peninsula, South Bay, East Bay (UNVERIFIED extent, to be fixed by the data pipeline).
- Dense voxels at 2 m over that box with 512 m vertical: 50,000 x 60,000 x 256 = 7.7e11 voxels. Not storable, not needed.
- As a 2D heightfield at 2 m: 3e9 samples = 6 GB at u16. Must be tiled and streamed.
- At 32 m: 3,125 x 3,750 = 11.7M samples = 23 MB at u16. The whole Bay fits in memory as a far-field heightmap.
- float32 precision at 100 km from origin: ulp = 2^(16-23) m = 0.78 cm (1.6 cm beyond 131 km, reachable only with a corner origin). Still visible jitter at tunnel scale and near plane 0.1 m. Use chunk-local vertex coords (6 bits per axis) plus a camera-relative chunk offset computed in float64 on CPU.
- Depth range 0.5 m to ~150 km: enable `reversedDepthBuffer` (or `logarithmicDepthBuffer`) on the renderer, or split near/far into two passes.

Consequence: three representations, one visual style.

| Field | Range from focus | Representation | Resolution |
|---|---|---|---|
| Near | 0 to ~0.5-1 km | true voxel chunks, editable | 2 m |
| Mid | to ~4 km | voxel-styled meshes generated from columnar data (height + building extrusions), LOD 4 / 8 / 16 m | not editable, re-baked on change |
| Far | whole Bay | heightmap clipmap rings, stepped/quantized to look blocky | 32 m and up |

Infrastructure (track, tunnels, stations, trains) is a separate vector/mesh layer drawn at all ranges, so the transit network stays visible from regional zoom.

## 5. Techniques

### 5.1 Chunking

- 32^3 chunks. Reasons: 32-bit column masks map to JS numbers and `Math.clz32` with no BigInt (caveat: the padded 34-voxel column does not fit one u32, unlike cgerikj's 62+2 in a u64; the two border bits per column need separate bit planes, and the section 5.2 benchmark skipped this by treating borders as air); 5-bit local coords (6 with size-1 encoding) pack into one u32; edit remesh cost ~0.1-0.3 ms.
- cgerikj's reference uses 62^3 payload in 64^3 padded chunks with u64 masks ([repo](https://github.com/cgerikj/binary-greedy-meshing)); in JS that means BigInt or paired u32, so 32 is the natural size. A wasm mesher would make 64^3 attractive (fewer draws).
- At 2 m voxels a chunk is a 64 m cube. Vertical span for the near field, TARGET: -128 m to +384 m = 8 chunks; higher terrain (East Bay hills, Santa Cruz Mountains) is mid/far field only unless the player works there.
- Uniform chunks (all air, all one stratum) carry no voxel array and no mesh. Most underground chunks are uniform until dug.
- Neighbor data: copy a 1-voxel border into a 34^3 scratch buffer in the worker job so meshing needs no cross-chunk lookups.

### 5.2 Meshing: culled vs greedy vs binary greedy

- Classic reference: [0fps, Meshing in a Minecraft Game](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/). Greedy is within 8x of optimal quad count; advantage shrinks with curvature; checkerboard is the worst case.
- Binary greedy meshing ([cgerikj/binary-greedy-meshing](https://github.com/cgerikj/binary-greedy-meshing), 325 stars, last push 2025-03): occupancy as bit columns, face masks via shifts, run extraction via ctz. Reported 50-200 us per 62^3 chunk, average 74 us single-threaded on a Ryzen 3800X. Output is 8 bytes per quad (6-bit x, y, z, w, h + 8-bit type), drawn by vertex pulling with one `glMultiDrawElementsIndirect`, and face-direction buckets so back-facing groups are skipped.
- Rust port ([Inspirateur/binary-greedy-meshing](https://github.com/Inspirateur/binary-greedy-meshing), crate 0.6.1, pushed 2026-11-05), per 62^3 chunk on a Ryzen 5 5500: `fast_mesh` 65 us opaque / 90 us with transparency, `mesh` 300 / 340 us; ~30x faster than block-mesh-rs at ~3 ms (current [README](https://github.com/Inspirateur/binary-greedy-meshing/blob/main/README.md)). The old 0.3.6 README reported ~600 us on a Xeon E5-1650 v3.

MEASURED locally (plain JS, Node 26.7 arm64, Apple M1 Max, 32^3 chunk, borders as air, output = packed 2x u32 per quad, no AO, 2,000 runs after warmup). Script: `/private/tmp/claude-501/-Users-jacek-git-sf-bay-area-city/e4bed7c2-8b76-4549-9312-518344a511d0/scratchpad/voxel-rendering/bench.mjs`.

| Chunk content | Culled faces | Classic greedy | Binary greedy (32-bit) |
|---|---|---|---|
| Surface (rolling terrain, 3 strata, one building) | 5,394 quads, 66 us | 1,340 quads, 586 us | 1,342 quads, 107 us |
| Solid strata with a bored tunnel + lining | 7,174 quads, 113 us | 86 quads, 560 us | 86 quads, 142 us |
| 3D checkerboard (worst case) | 98,304 quads, 125 us | 98,304 quads, 1,025 us | 98,304 quads, 939 us |

- Binary greedy in plain JS is ~4-5x faster than classic greedy at equal quad count and cuts quads 4x (surface) to 83x (tunnel) vs culling.
- Caveats: M1 Max is above "mid-range"; a real mesher adds border copy, AO and material rules. Budget 0.3-0.5 ms per chunk on a mid-range laptop (TARGET, UNVERIFIED until profiled in a browser worker).
- Conclusion: a wasm mesher is not needed for v1. 1,000 chunks x 0.5 ms / 4 workers = ~125 ms.

### 5.3 Draw representation

| Technique | Bytes per quad | Needs | Notes |
|---|---|---|---|
| Plain `BufferGeometry` (pos f32x3, normal f32x3, uv f32x2, u32 indices) | 4 x 32 + 6 x 4 = 152 (DERIVED) | nothing | Simplest; 1.5M quads = 228 MB GPU |
| Packed vertices (one u32 per vertex) | 16 + indices | custom shader | Common middle ground |
| **Instanced packed quads** (unit quad + per-instance 2x u32) | 8 | WebGL2 instancing, integer attributes | **Chosen.** 1.5M quads = 12 MB |
| Vertex pulling from storage buffer | 8 | WebGPU (or WebGL2 via `texelFetch` on a data texture) | What cgerikj does on desktop GL; TU Wien thesis measured pulling faster than instancing for particle quads on high-end GPUs ([Peter 2023](https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf)); no voxel-specific WebGPU benchmark found |

Proposed quad word layout (64 bits): x, y, z (6 bits each, chunk-local), w-1, h-1 (5 bits each), face (3), material (10), AO (8, 2 bits x 4 corners), light/flags (rest).

- Face culling by direction: 6 buckets per chunk (or per region); skip buckets facing away from the camera. Roughly halves submitted quads (technique from the cgerikj README; the "half" figure is DERIVED).
- Draw calls: start with one instanced mesh per chunk per LOD; classic WebGLRenderer handled 4,000 meshes in 4.5 ms CPU on a high-end laptop ([forum data](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904)). If the mid-range budget is exceeded, merge chunks into 4x4x4 region buffers (256 m cubes) updated with `bufferSubData` per chunk slot.
- Materials: palette color (256-entry LUT texture) plus world-space procedural detail in the fragment shader. Greedy quads break atlas UVs; if textures are wanted, use a `DataArrayTexture` with `fract(worldPos)` tiling. No atlas.
- Transparency (water, glass): separate pass, separate mesher run with "same material = no face" rule.

### 5.4 Ambient occlusion

- Baked per-vertex AO, 2 bits per corner ([0fps AO article](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/)). Cost: AO must be part of the greedy merge key, which reduces merging (quad count increase UNVERIFIED, must be measured).
- Alternative: screen-space GTAO (`GTAOPass` ships in three r187 addons) on merged quads with no baked AO.
- Proposal: baked AO only in the near ring (where the camera can be in a tunnel), none in mid/far. Decide after measuring quad inflation.

### 5.5 LOD and far field

- POP buffers for blocky voxels ([0fps 2018](https://0fps.net/2018/03/03/a-level-of-detail-method-for-blocky-voxels/)): floor vertices to power-of-two grids in the vertex shader, sort quads coarse to fine, draw a prefix; geomorph to hide seams. Elegant, but pairs awkwardly with greedy-merged, instanced quads and needs neighbor-aware LOD selection.
- Geometry clipmaps (Losasso and Hoppe 2004; a 2026 browser devlog reports near-field volumetric + mid heightmap chunks + far clipmap rings working in practice: [cinevva part 12](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-12-lessons.html)).
- Chosen: **downsampled voxel LOD rings** for mid field (remesh the same columnar source at 4 / 8 / 16 m; each ring has roughly constant quad count, so cost is O(levels)), **heightmap clipmap rings** for far field with heights snapped to the ring's voxel size so it reads as blocky. Skirts on ring borders instead of stitching.
- Because the mid field is generated from columnar data (terrain height + building footprint/height from OSM), it never needs 3D voxel storage.
- Sparse voxel octree / DAG raymarching: strong for static scenes, awkward with constant edits and WebGL2. Not pursued.

### 5.6 Workers and memory sharing

- Mesh and generation jobs in a worker pool (`min(hardwareConcurrency - 2, 6)` TARGET). Transfer `ArrayBuffer`s both ways (zero-copy move).
- `SharedArrayBuffer` requires cross-origin isolation: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`), check `self.crossOriginIsolated` ([web.dev](https://web.dev/articles/coop-coep), [MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)). `credentialless` shipped in Chrome 96 and Firefox 119 (desktop); not supported in Safari or Firefox for Android ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/http/headers/Cross-Origin-Embedder-Policy.json)), so a SAB build must use `require-corp` to reach Safari.
- COEP constrains every cross-origin fetch (tiles, fonts, analytics) and needs header control on the host (static hosts without custom headers need a service-worker shim such as [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker); UNVERIFIED which host will be used).
- Decision: **no SAB in v1**. Chunk payloads are 32-64 KB; transfer cost is negligible. DVE moved SAB to optional for similar reasons ([README](https://github.com/Divine-Star-Software/DivineVoxelEngine)).
- `OffscreenCanvas` rendering in a worker: not needed; main thread does only render + UI.
- Wasm mesher: deferred. Reference numbers suggest ~5-7x headroom per voxel column (the unit binary meshing scales with; 19 ns vs 104-139 ns) or ~10-14x per voxel (74 us per 62^3 in C vs 107-142 us per 32^3 in JS; different CPUs, so indicative only).

### 5.7 Storage and persistence

In memory:

| Scheme | Size per 32^3 chunk | Use |
|---|---|---|
| Raw u8 | 32 KB | scratch buffer in the mesher only |
| Uniform | ~0 | air, untouched bedrock/strata |
| Palette, n-bit indices (Minecraft-style, [chunk format](https://minecraft.wiki/w/Chunk_format)) | 4 KB (1 bit) to 16 KB (4 bit) | resident near-field chunks |
| Column RLE (runs of material along y) | tens of bytes per column | mid field and on-disk; ideal for layered geology |
| SVO / DAG | best for static data | rejected (edit cost, complexity) |

- DERIVED near-field memory: ~2,300 surface chunks x 16 KB = ~37 MB worst case with 4-bit palettes.
- Persist intent, not voxels: project graph (alignments, stations, tech state, budget) as JSON; base world is deterministic from shipped data. Optional per-chunk diffs only for free-form digging, RLE + `fflate` (0.8.3, [npm](https://www.npmjs.com/package/fflate)).
- Save games: IndexedDB via `idb-keyval` 6.3.0 ([npm](https://www.npmjs.com/package/idb-keyval)). Baked chunk/tile cache: OPFS with `createSyncAccessHandle()` in a worker (Baseline since March 2023 per [MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle)).
- Quotas ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)): Chrome ~60% of disk per origin; Firefox best-effort min(10% disk, 10 GiB), persistent 50% up to 8 TiB; Safari ~60% for browser apps. Safari deletes script-written storage after 7 days of browser use without interaction when tracking prevention is on. Mitigation: `navigator.storage.persist()` plus explicit save export/import to a file.
- No OPFS vs IndexedDB benchmark found; UNVERIFIED which is faster for 16 KB blobs.

## 6. Performance budgets

"Mid-range laptop" assumed: integrated GPU class (Intel Iris Xe, Apple M1/M2 Air), 8-16 GB RAM, 60 Hz, 1440x900 to 1080p at DPR capped to 1.5. All rows are TARGETS to validate in a prototype; none are in-browser measurements.

| Budget | Desktop mid-range | Tablet tier |
|---|---|---|
| Frame | 16.6 ms (60 fps), CPU render <= 4 ms | 33 ms (30 fps) |
| Visible quads after direction culling | <= 1.0M (2M triangles) | <= 300k |
| Draw calls | <= 500 | <= 150 |
| Near-field radius at 2 m | 512 m (16 x 16 chunk columns) | 256 m |
| LOD rings | 4 m to 1 km, 8 m to 2 km, 16 m to 4 km, heightmap beyond | one ring fewer |
| Resident voxel chunks | <= 3,000 | <= 800 |
| Mesh uploads per frame | <= 8 chunks or 2 ms | <= 4 |
| Chunk remesh latency after an edit | <= 2 frames | <= 4 frames |
| GPU geometry | <= 64 MB | <= 24 MB |
| JS heap + typed arrays | <= 600 MB | <= 250 MB |
| Initial download (code + first region data) | <= 15 MB | same |

- DERIVED check: near ring 256 surface chunk columns x ~1.3k quads (measured surface chunk) = ~340k quads; each coarser ring is of similar order; 4 rings = ~1.3M before direction culling, ~0.7M after. Fits the 1.0M target with little slack; dense downtown blocks will exceed the per-chunk average.
- Mobile: iOS has no documented per-tab memory limit; developer reports range from a kill at ~1.25 GB (iPad Air 3, iOS 14.2; that report was a WebGL canvas-resize leak fixed in 14.3, so it is one data point, not a limit; [Apple forum](https://developer.apple.com/forums/thread/668999)) to reload-under-memory-pressure on texture-heavy WebGL pages ([WebKit bug 300782](https://bugs.webkit.org/show_bug.cgi?id=300782)). Treat ~250-300 MB as the safe ceiling (UNVERIFIED, conservative). WebGL2 works on all current phones; the blocker is builder-game touch UX and thermal headroom, not API support.

## 7. Cameras

| Mode | Use | Implementation |
|---|---|---|
| Map / RTS orbit (default) | planning, regional view, placing alignments | `camera-controls` 3.1.2 ([npm](https://www.npmjs.com/package/camera-controls), [repo](https://github.com/yomotsu/camera-controls), pushed 2026-10-21) for smooth dolly-to-cursor, bounds, transitions; or three's built-in `MapControls`. Perspective camera, pitch clamped 15-85 degrees |
| Cutaway | underground design | same camera; cut plane height bound to scroll-modifier or a depth slider; camera may go below grade once cut is active |
| Follow / first-person | ride the TBM or a train, walk a station | camera on the alignment spline; `PointerLockControls` for free look; near plane 0.1 m; only tunnel-adjacent chunks drawn |
| Profile (2D) | vertical alignment editing | separate 2D canvas, not the 3D view (section 8) |

- Picking: voxel DDA raycast on the CPU against chunk data (near field) and heightmap (far field). No `three-mesh-bvh` needed for voxels; useful only for infrastructure meshes (0.9.18, [npm](https://www.npmjs.com/package/three-mesh-bvh)).
- Orthographic "isometric" option is cheap to add later and suits the diorama look.

## 8. Rendering underground

| Technique | How | Cost | Verdict |
|---|---|---|---|
| Horizontal cut plane, shader discard | uniform `cutY`; fragments above are discarded (three `clippingPlanes` does this) | free | Use. Leaves hollow shells without caps |
| Stencil caps | back-face stencil increment + cap quad ([three example](https://threejs.org/examples/webgl_clipping_stencil.html)) | 2 extra passes over clipped geometry | Not needed: voxel data knows what is solid |
| **Slice-texture caps** | per chunk column straddling the cut: one horizontal quad at `cutY` sampling a 32x32 material-ID texture read from the voxel layer at that height (strata from the geology function where the chunk is uniform) | ~1 KB upload per chunk when the cut moves a layer | **Chosen.** Shows geology cross-section, no remesh |
| Mesher-level cut | remesh treating everything above the cut as air | 0.1-0.5 ms x straddling chunks | Fallback for exact results (screenshots) |
| Vertical section along an alignment | second clip plane or a "curtain" mesh following the route | moderate | Later; the 2D profile covers the need first |
| X-ray | infrastructure layer drawn in a second pass with `depthFunc: GREATER`, flat tint + outline (RTS occluded-unit silhouette); optional terrain dither-fade under the cursor | one extra pass over a small layer | **Chosen** for "see my tunnels from the surface" |
| Ghost terrain | terrain alpha 0.15-0.3 | sorting artifacts, overdraw | Reject in favor of dithered discard |
| Cave/portal culling in first person | flood-fill connectivity per chunk between its 6 faces ([tomcc, Advanced Cave Culling](https://tomcc.github.io/2014/08/31/visibility-1.html)) | small precompute per remesh | Add when first-person mode lands |

- 2D longitudinal profile panel: sample ground height, strata, water table, existing tunnels and utilities along the alignment and draw distance vs elevation. This is how alignments are actually designed and is cheap (Canvas 2D). It should be the primary vertical-editing tool; the 3D cutaway is for spatial understanding.
- Tunnels are meshed twice by design: carved voxels (the hole) and a smooth parametric infrastructure mesh (lining, track, catenary) that feeds the x-ray pass and stays visible at regional zoom.

## Recommendations for the game

Stack (versions verified 2026-11-09):

| Layer | Choice |
|---|---|
| Renderer | `three` 0.187.0, `WebGLRenderer`, `reversedDepthBuffer: true`, custom GLSL `ShaderMaterial` on `InstancedBufferGeometry` |
| Build | Vite 8.3.x ([npm](https://www.npmjs.com/package/vite)), TypeScript, module workers |
| Camera | `camera-controls` 3.1.2 |
| Compression | `fflate` 0.8.3 |
| Persistence | `idb-keyval` 6.3.0 (saves), OPFS (tile/chunk cache) |
| Physics | none in v1 (trains follow splines); Rapier (`@dimforge/rapier3d` 0.21.0) only if first-person walking needs it |
| UI | DOM overlay (tech tree, budgets, permits), not in-canvas |

Design decisions:

1. Custom voxel layer on three.js; no voxel engine dependency.
2. Voxel = 2 m near field, 32^3 chunks, palette-compressed, uniform chunks elided.
3. Binary greedy mesher in TS inside a worker pool, transferables only, 34^3 padded input, output = 8-byte packed quads in 6 face buckets.
4. Three-tier world: editable voxels (near), columnar voxel-styled LOD rings (mid), snapped heightmap clipmap (far). Infrastructure as a separate always-visible layer.
5. Parametric tunnels/stations are the source of truth; voxels are carved from them. Saves are JSON.
6. Underground: `cutY` discard + slice-texture caps + x-ray silhouette pass + 2D profile panel.
7. Camera-relative rendering with chunk-local integer coordinates from day one.
8. Keep a thin `ChunkRenderer` interface (upload quads, set visibility, draw) so a WebGPU vertex-pulling backend can replace the WebGL one without touching meshing.

Rejected / deferred (do not re-propose without new evidence):

| Alternative | Status | Reason |
|---|---|---|
| `WebGPURenderer` + TSL as primary | Deferred | "experimental" per manual; open many-mesh perf issue #30560; no feature need |
| Raw WebGPU | Deferred | reach gaps (Firefox Linux/Android), large build cost |
| Babylon.js / PlayCanvas | Rejected | no advantage for a custom packed-quad pipeline |
| noa, voxelize, DVE | Rejected | stale, server-shaped, or Babylon-bound; all Minecraft-scale |
| Bevy wasm | Rejected | binary size, iteration speed, DOM UI |
| SharedArrayBuffer | Deferred | COOP/COEP hosting constraints for negligible gain at 32 KB chunks |
| Wasm mesher | Deferred | JS binary greedy measured at 0.11-0.14 ms per chunk |
| POP buffers | Rejected | poor fit with instanced greedy quads |
| SVO/DAG storage or raymarching | Rejected | edit-heavy workload |
| Stencil caps | Rejected | slice-texture caps are cheaper and show geology |

Prototype order (each step validates a budget above):

1. One 32^3 chunk, packed instanced quads, palette shader.
2. Worker pool + 16x16 chunk near field from a synthetic heightmap; measure quads, draws, frame time on an integrated-GPU laptop.
3. Cut plane + slice caps + x-ray pass with one hand-placed tunnel.
4. LOD rings and far heightmap with real DEM/OSM tiles.

## Open questions

- Voxel size: 2 m keeps a ~7 m bore at 3-4 voxels across, readable but coarse; 1 m quadruples surface quads and 8x voxel volume. Is 2 m acceptable in first-person station views, or is a 1 m detail tier needed near stations?
- Does baked AO in the merge key inflate quad counts beyond the 1.0M budget? Needs measurement on real downtown SF chunks.
- Real mid-range numbers: all frame budgets are targets; no in-browser measurement on an Iris Xe class GPU yet.
- Per-chunk meshes vs 4x4x4 region batching vs `BatchedMesh`: which is needed to stay under 500 draws once buildings are in?
- How blocky should the far field look? Snapped heightmap is cheap; true voxel look at 32 m+ needs side faces and more triangles.
- Building representation in the near field: voxelized OSM extrusions (uniform style, loses detail at 2 m) vs separate low-poly meshes.
- Water (the Bay) rendering and its interaction with the cut plane (cut through water shows a blue slab?).
- Hosting: is header control available (matters only if SAB or wasm threads are ever wanted)?
- Is tablet support a goal? It halves several budgets and forces touch-first UI decisions early.
- UNVERIFIED items to re-check before relying on them: Bevy 0.20 web threading and binary size; caniuse per-browser rows for Firefox; iOS tab memory ceiling; OPFS vs IndexedDB throughput.

## Corrections (2026-11-09 fact-check)

- 2.2 Firefox macOS: WebGPU ships on Apple Silicon only (145 / 147); Intel Macs are Nightly only. Row split, "Net" line and section 2 table updated. Source: [gpuweb implementation status wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status).
- 4 float32 precision: ulp at 100 km is 2^-7 m = 0.78 cm, not 1.6 cm (100 km lies in [2^16, 2^17) m). Conclusion (chunk-local coords) unchanged. Source: IEEE 754 arithmetic.
- 5.1 added caveat: 34-voxel padded columns do not fit a u32 mask; border bits need separate handling and the local benchmark did not exercise it. Source: reading `bench.mjs` (borders as air) and the cgerikj README (62+2 in u64).
- 5.2 Rust port numbers were from the stale 0.3.6 README; replaced with the current 0.6.1 figures (65-340 us, ~30x vs block-mesh-rs). Source: repo README on `main`, crates.io.
- 5.6 COEP `credentialless`: resolved from UNVERIFIED. Chrome 96, Firefox 119 desktop; no Safari, no Firefox Android. Source: MDN browser-compat-data.
- 5.6 wasm headroom: "5-8x per-voxel" was mislabeled; the cited numbers give ~10-14x per voxel, ~5-7x per column. Source: arithmetic on the cited figures.
- 6 iOS 1.25 GB report: qualified as a leak-specific crash on iOS 14.2, fixed in 14.3. Source: the linked Apple forum thread.
- Confirmed without change: all npm versions and dates in the doc; GitHub stars / push dates / licenses; issue #30560 state, labels and both sets of numbers; forum thread numbers; three.js manual quotes; r187 feature list (tarball inspected); WebGPU default limits and CR Draft date; caniuse 88.63%; Chrome 146 compatibility mode; cgerikj README figures; 0fps 8x bound; MDN storage quotas; OPFS Baseline date; TU Wien thesis abstract; WebKit bug 300782; section 5.2 benchmark (rerun on the same M1 Max, within 3%).

