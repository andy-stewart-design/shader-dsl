# Phase 0 evidence

## Step 0.1 — Browser image, sampling and resource limits

Date: 2026-10-13

Environment: Playwright 1.63.0, Chrome for Testing 153.0.8010.12 on macOS arm64, Chromium launched with WebGL 2 and SwiftShader/WebGPU flags. A real WebGL 2 context and a working WebGPU adapter were available. WebGPU observations below come from pixels captured from the presented canvas with Playwright screenshots, not shader validation alone.

### Baseline before the probe

- `pnpm --filter @shdr/core test`: passed, 46 files / 423 tests.
- `pnpm --filter @shdr/runtime test`: passed all existing browser suites, including presented WebGPU checks, loss/disposal, replacement, numeric uniforms and bundle isolation.

No pre-existing failures were observed in these focused baselines.

### Probe

Added `packages/core/test/texture-target-feasibility.test.ts` and ran:

- `pnpm --dir packages/core exec vitest run --config ../../vitest.config.ts --root . test/texture-target-feasibility.test.ts`: passed.
- `pnpm --filter @shdr/core check`: passed.

The probe creates a browser-decoded non-square 4x2 RGBA PNG containing quadrant/edge colors and one semi-transparent straight-alpha texel. It checks WebGL readback and presented WebGPU screenshot pixels for top-left, top-right, semi-transparent, fractional, and out-of-range samples. It also checks two independent textures and fixed linear/clamp settings.

Observed sample values matched the encoded source on both targets:

- top-left: `[255, 0, 0, 255]`
- top-right: `[0, 0, 255, 255]`
- semi-transparent texel: `[128, 64, 32, 128]`
- fractional red/green sample: `[128, 128, 0, 255]`
- clamped edge samples matched the intended edge texels
- alpha was separately encoded into red and observed as `128` on both targets
- two-texture sample returned `[128, 22, 32, 255]` (WebGL) and matching RGB on presented WebGPU

Observed limits/settings:

- WebGL `MAX_TEXTURE_IMAGE_UNITS`: `32`
- WebGL `MAX_COMBINED_TEXTURE_IMAGE_UNITS`: `64`
- WebGL min/mag filter: `LINEAR` / `LINEAR`
- WebGL wrap S/T: `CLAMP_TO_EDGE` / `CLAMP_TO_EDGE`
- WebGPU `maxSampledTexturesPerShaderStage`: `16`
- WebGPU `maxSamplersPerShaderStage`: `16`
- WebGPU `maxTextureDimension2D`: `8192`

The probe's WebGPU external-image upload required `COPY_DST | TEXTURE_BINDING | RENDER_ATTACHMENT` on this Chromium/SwiftShader implementation. This is a raw feasibility finding for implementation; it does not prescribe the final resource usage flags beyond satisfying actual target validation.

## Step 0.2 — Vite public URLs and deployment bases

Environment: Vite 8.3.0, Node 24.21.0. The disposable project was exercised through real Vite dev HTTP requests and a static HTTP deployment of each built output.

### Probe

Added `packages/vite/test/texture-base-feasibility.test.ts` and ran:

- `pnpm --dir packages/vite exec vitest run --config ../../vitest.config.ts --root . test/texture-base-feasibility.test.ts`: passed, 3 tests.
- `pnpm --filter @shdr/vite test`: passed, 2 files / 17 tests.
- `pnpm --filter @shdr/vite check`: passed.

The disposable project contained `public/photo.png`, a Vite-processed `src/imported.png`, and a JSON-like artifact object containing the literal resource URL `/photo.png`.

Observed dev public requests:

- base `/`: `/photo.png` returned 200.
- base `/nested/`: `/nested/photo.png` returned 200 while the unadapted `/photo.png` returned 404.
- base `./`: root `/photo.png` returned 200 in dev.

Observed build output:

- index asset prefixes were `/assets/`, `/nested/assets/`, and `./assets/` for bases `/`, `/nested/`, and `./` respectively.
- Vite-processed imports were base-aware: absolute bases emitted base-prefixed asset URLs; relative base emitted a runtime `new URL("imported-<hash>.png", import.meta.url)` form.
- The `/photo.png` string inside the artifact object remained `/photo.png` for every base. Vite does not rewrite a public URL buried in JSON/object data.
- `public/photo.png` was copied as `dist/photo.png` in every build.

A static deployment probe served the built output at `/` or `/nested/`. The following candidate resource URLs loaded successfully:

- base `/`: `/photo.png`
- base `/nested/`: `/nested/photo.png`
- base `./` from a `/nested/` page: `./photo.png`, resolving to `/nested/photo.png`

The unadapted `/photo.png` failed for the nested deployments.

### Vite-only URL decision

For root-absolute authored resource URLs, the Vite integration can adapt only the artifact metadata while core and the standalone compiler remain unchanged:

- base `/`: preserve `/photo.png`
- absolute base `/nested/`: emit `/nested/photo.png`
- relative base `./`: emit `./photo.png`
- preserve absolute HTTPS URLs unchanged

This preserves a JSON data artifact and does not require Vite to infer an asset reference from a string. The relative-base probe supports the contract when the adapted relative URL is resolved by the browser relative to the deployed page URL; no unsupported base mode was found in this feasibility probe.

### Conclusion

The raw browser targets provide a feasible implementation of the specified decoded sRGB/straight-alpha channel policy, top-left UV convention, linear filtering, clamp-to-edge addressing, no-mipmap 2D textures, and at least two simultaneous texture bindings. Step 0.1 is unblocked and ready for review.
