# Phase 3.1 — Rendered derivative acceptance

## Environment and method

- Revision under test: current worktree after Phase 2 exit; run with Node `v24.21.0` and pnpm `11.23.0`.
- Browser: Playwright Chromium with `--enable-webgl`, `--enable-unsafe-swiftshader`, `--enable-unsafe-webgpu`, and `--use-angle=swiftshader`.
- WebGL 2: vendor `Google Inc. (Google)`; renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`; Chromium WebGL 2 / OpenGL ES 3.0.
- WebGPU: vendor `google`, architecture `swiftshader`; adapter reports no device/description string in this Chromium build.
- Pinned presented canvases: `73×47` CSS and backing dimensions, device scale factor 1. Interior samples use top-left coordinates `(11,9)`, `(36,18)`, `(61,33)`.
- `WebGL.readPixels` converts those top-left coordinates to its bottom-left origin. WebGPU pixels are captured from a screenshot of the presented canvas and decoded as top-left-origin `ImageData`; no offscreen WebGPU attachment/readback is used.
- Finite affine fields avoid borders, discontinuities, and quad-edge samples. Renderers use `animate: false`; both target pipelines are installed and drawn for each pass. Missing targets/adapters, renderer failures, and page errors fail the test rather than skip it.

## Encodings and observations

The predeclared Phase 0 mappings and tolerance were retained: signed slopes use `0.5 + 0.25 × slope`; widths use `0.25 + 0.1 × width`; compare each target independently to the expected 8-bit value within **±4 codes**. Canvas alpha is opaque and is not used to encode derivative results. Each pass checks all three sample points. The table shows the observed first sample; all remaining samples also passed. WebGL/WebGPU maximum byte differences were **0** for every pass.

| Pass                                                                    | First-sample WebGL and WebGPU RGBA bytes                                                                                     | Expected RGBA bytes (±4)                                      |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Scalar `dFdx(coord.x)`, helper `dFdy(coord.y)`, reconstructed-up `dFdy` | `[191, 191, 64, 255]`                                                                                                        | `[191, 191, 64, 255]`                                         |
| Scalar `fwidth(coord.y)`                                                | `[89, 89, 89, 255]`                                                                                                          | `[89, 89, 89, 255]`                                           |
| Vec2 `dFdx` / `dFdy` / `fwidth`                                         | `[159,128,128,255]` / `[128,175,128,255]` / `[76,83,128,255]`                                                                | `[159,128,128,255]` / `[128,175,128,255]` / `[77,83,128,255]` |
| Vec3 `dFdx` / `dFdy` / `fwidth`                                         | `[159,128,175,255]` / `[128,175,159,255]` / `[76,83,96,255]`                                                                 | `[159,128,175,255]` / `[128,175,159,255]` / `[77,83,96,255]`  |
| Vec4 `dFdx` / `dFdy` / `fwidth` (xyz), then lane w                      | `[159,128,175,255]` / `[128,175,159,255]` / `[76,83,96,255]`; `[191,128,128,255]` / `[96,128,128,255]` / `[102,128,128,255]` | Same values except fwidth xyz red is `77` (±4)                |

The rendered scalar probes distinguish right/down `+1` from reconstructed-up `-1`, so a missing or double GLSL Y sign flip fails. The imported helper is reachable from the authored entry. Vector slopes and widths differ by lane; the Vec4 `w` lane is checked in separate passes because the presented alpha channel is opaque. Target-to-target equality is an observation for this SwiftShader configuration, not a cross-GPU or bit-identity promise.

## Commands

- `pnpm build` — passed (11 Turbo tasks).
- `pnpm --filter @shdr/runtime exec node test/verify-fragment-derivatives.mjs` — passed, 14 authored derivative passes on both presented canvases.
- `pnpm --filter @shdr/runtime check` — passed.
- `git diff --check` — passed.

This is Phase 3.1 target evidence only. It does not establish broad hardware coverage, derivative behavior at discontinuities/edges, or final documentation/review acceptance.
