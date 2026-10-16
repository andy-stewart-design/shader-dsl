# Binary `atan` comparison

## Status

**Decision recorded: native forwarding.** The raw comparison is complete on the configured Chromium/SwiftShader path. The visible fields did not justify custom generated axis branches; the WebGL/WebGPU orientation difference is a coordinate convention, not an `atan` candidate difference. Signed-zero-sensitive axes, origin, and very small-input precision remain outside the portable value guarantee.

## Environment and method

- Chromium `153.0.8010.12`, headless, SwiftShader software rendering.
- WebGL 2 renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`.
- WebGPU adapter: Google SwiftShader, preferred canvas format `bgra8unorm`.
- Browser flags: `--enable-webgl`, `--enable-unsafe-swiftshader`, `--enable-unsafe-webgpu`, `--use-angle=swiftshader`.
- Test: `packages/core/test/orbit-atan-comparison.test.ts`.
- Verification: `pnpm --filter @shdr/core check`; `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-atan-comparison.test.ts` — passed.

The probe transports dynamic f32 inputs as bit patterns, including positive and negative zero. GLSL numeric results use lossless float-bit encoding and WebGL readback. WGSL numeric results use the same encoding rendered to an `rgba8unorm` offscreen target and copied back. Separate native and guarded angle/hue fields were drawn to WebGL canvases and presented WebGPU canvases; hue samples were captured from both canvases. The hue fields use centered coordinates, `(position - size / 2) / (size / 2)`, so the 64×64 visual spike spans positive and negative X/Y values and crosses both axes and the negative-X branch cut.

Persistent visual artifacts can be regenerated with:

```bash
SHDR_ORBIT_ATAN_CAPTURE=1 pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-atan-comparison.test.ts
```

Open [`atan-comparison/index.html`](atan-comparison/index.html) to see the native/guarded hue fields and enlarged exact-input case strips. The case strips make the signed-zero differences visible even though they are not visible in a continuous hue field.

## Candidates

- **Native:** GLSL `atan(y, x)` and WGSL `atan2(y, x)`.
- **Guarded exploratory candidate:** explicit scalar axis handling; positive horizontal axis `0`, negative horizontal axis `π`, vertical axes `±π/2`, signed zero normalized, then quadrant correction using unary `atan(y / x)`. Origin returns `0` only as an exploratory observation and is not proposed as a portable guarantee.

## Numeric observations

The following values were observed in both raw targets for ordinary quadrants, within f32 readback precision:

| `(y, x)`          | Native / guarded |
| ----------------- | ---------------: |
| `(1, 2)`          |      `0.4636476` |
| `(2, 1)`          |      `1.1071488` |
| `(1, -2)`         |      `2.6779451` |
| `(2, -1)`         |      `2.0344439` |
| `(-1, -2)`        |     `-2.6779451` |
| `(-2, -1)`        |     `-2.0344439` |
| `(-1, 2)`         |     `-0.4636476` |
| `(-2, 1)`         |     `-1.1071488` |
| `(1e-6, 1e-6)`    |      `0.7853982` |
| `(-1e-6, 1e-6)`   |     `-0.7853982` |
| `(1e-20, -1e-20)` |      `2.3561945` |
| `(1e-6, -1)`      |      `3.1415918` |
| `(-1e-6, -1)`     |     `-3.1415918` |

Both candidates compiled and drew vector/mixed-lane inputs. The tested lanes `(1,2)`, `(-1,-2)`, `(0,-1)`, and `(1,0)` matched across GLSL and WGSL.

### Axis and signed-zero observations

| `(y, x)`   | Native GLSL/WGSL |      Guarded candidate |
| ---------- | ---------------: | ---------------------: |
| `(0, 1)`   |              `0` |                    `0` |
| `(0, -1)`  |              `π` |                    `π` |
| `(1, 0)`   |            `π/2` |                  `π/2` |
| `(-1, 0)`  |           `-π/2` |                 `-π/2` |
| `(+0, -1)` |              `π` |                    `π` |
| `(-0, -1)` |              `0` |                    `π` |
| `(+0, +1)` |              `0` |                    `0` |
| `(-0, +1)` |              `π` |                    `0` |
| `(0, 0)`   |              `0` | `0` (exploratory only) |

The native signed-zero results were identical between the tested GLSL and WGSL implementations, but they differ from the explicit candidate's normalized-axis behavior. This is an observation on SwiftShader, not a portable language guarantee.

### Presented hue comparison

Native and guarded angle-to-hue fields were sampled at representative points across quadrants, near axes, and the branch cut. The regenerated centered-coordinate captures show the intended full signed domain rather than the previously one-sided field. Native-versus-guarded samples matched exactly within each backend (at most 0 channel difference in the recorded samples). The expected `-π`/`π` angle representation jump did not create a visible hue seam because the hue encoding is periodic. WebGL and presented WebGPU hue fields were sampled separately; their differing screen-coordinate orientation is unrelated to the candidate comparison.

## Decision

**Native forwarding is selected.** GLSL emits `atan(y, x)` and WGSL emits `atan2(y, x)` without a custom helper. This preserves the observed ordinary output while avoiding generated branches for a difference that is only visible for exact signed-zero degenerates. The origin, signed-zero-sensitive axis pairs, and very small-input precision remain caller preconditions without a portable value guarantee.
