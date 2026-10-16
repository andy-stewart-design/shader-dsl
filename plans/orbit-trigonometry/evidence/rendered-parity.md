# Rendered orbit/trigonometry parity evidence

## Scope

`packages/runtime/test/verify-orbit-math.mjs` compiles deterministic Shdr sources through the browser compiler, installs each generated artifact into both runtime backends, and checks WebGL readback against a presented WebGPU canvas screenshot.

Cases cover:

- `asin`, `acos`, unary `atan`, `radians`, and `degrees` across scalar, Vec2, Vec3, and Vec4 result paths.
- Binary `atan(y, x)` across scalar, Vec2, Vec3, and Vec4 with asymmetric quadrants.
- Nondegenerate near-axis and negative-branch-cut approaches.
- Signed vector/vector and vector/scalar `mod`, including negative divisors and all result dimensions.
- Known angle conversions and a dynamic custom-uniform update from `phase = -0.25` to `phase = 0.25`.

Each shader writes normalized values to all four channels. Four samples are checked at `(2,4)`, `(8,13)`, `(19,23)`, and `(29,30)` on deterministic 32×32 canvases. Host `Math` references provide expected values; WebGL and presented WebGPU each must be within 8 8-bit channel values of the reference and each other. Exact degenerate axes, signed-zero-sensitive cases, and origin are not asserted as portable values.

## Environment and result

- Chromium, SwiftShader WebGL 2, and enabled SwiftShader WebGPU.
- WebGL uses `readPixels`; WebGPU uses a screenshot of the presented canvas decoded with `createImageBitmap`.
- Initial creation, four non-center samples, backend parity, and custom-uniform update draws all passed.
- No browser page errors or backend errors were reported.

Verification commands:

- `pnpm --filter @shdr/runtime check` — passed.
- `pnpm --filter @shdr/runtime exec node test/verify-orbit-math.mjs` — passed.
- `pnpm --filter @shdr/runtime test` — passed, including the new verifier and all existing runtime suites.
- `pnpm --filter @shdr/core exec vitest run --config ../../vitest.config.ts --root . test/orbit-generated.test.ts` — passed.

This establishes the tested browser/software-renderer path, not bit identity across GPUs or a universal precision guarantee.