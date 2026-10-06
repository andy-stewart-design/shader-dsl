# Shdr

Shdr is an experimental language for writing fragment shaders with native operators inside TypeScript-shaped source. A custom editor path gives those operators shader-specific types and diagnostics; a target-neutral compiler lowers the same source to typed IR and generates either GLSL ES 3.00 or WGSL. This is a **restricted shader language**, not arbitrary TypeScript, JavaScript execution, or a general GLSL/WGSL frontend.

```ts
import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const color = vec4(uv.x, uv.y, 0, 1);

  return color;
});
```

The example uses top-left-origin pixel coordinates and the drawing-buffer resolution. For an expanded shader exercising `vec3`, unary minus, arithmetic, and swizzles, see [the checked fixture](packages/core/test/fixtures/expanded.shdr.ts). For the original eleven math builtins, see the [Vite/WebGL fixture](apps/vite-basic/src/math-builtins.shdr.ts); for `ceil`, `distance`, and `cross`, see the [editor/REPL fixture](apps/editor-fixture/geometry-math.shdr.ts). For `mix`, `step`, and typed custom defaults, try the [representative cells shader](apps/vite-basic/src/cells-representative.shdr.ts). For `sqrt`, `exp`, `tanh`, `clamp`, and `pow`, see the [two-target color field](apps/vite-basic/src/pr3-math.shdr.ts) or the [translated plasma reference](apps/vite-basic/src/references/plasma.shdr.ts).

## Requirements and workspace commands

Use Node.js 24 or newer and pnpm 11.23.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
```

The normal test suite includes real Chromium WebGL tests, Vite development/production integration, rendered-pixel assertions, and the browser REPL test. Playwright installs its pinned Chromium build automatically when needed.

| Workspace                   | Purpose                                                 |
| --------------------------- | ------------------------------------------------------- |
| `packages/shdr`             | Public authoring types and DSL markers                  |
| `packages/cli`              | Node CLI for shader-source checks in CI                 |
| `packages/core`             | Parser, validation, typed IR, and GLSL/WGSL generation  |
| `packages/language-service` | TypeScript 7 virtual-source checking and editor routing |
| `packages/lsp`              | Private stdio LSP feasibility spike (not shipped)       |
| `packages/vite`             | `.shdr.ts` to dual-target artifact Vite pre-transform   |
| `packages/runtime`          | Workspace-only WebGL 2 and WebGPU browser renderers     |
| `apps/editor-fixture`       | Real VS Code diagnostics and hover fixture              |
| `apps/vite-basic`           | Static Vite/WebGL 2 + WebGPU integration fixture        |
| `apps/repl`                 | React browser compiler, target viewer, and validator    |

## Shader checks in CI

After building the workspace, check authored shader files with the Shdr CLI:

```sh
pnpm shdr check # recursively check authored shaders in this workspace
pnpm ci:check # ordinary TypeScript checks plus Shdr checks
```

`shdr check [paths...]` recursively discovers `.shdr.ts` files under the given files/directories (or the current directory if no paths are given). A search with no matches fails. Default discovery skips `test/fixtures` directories containing deliberately invalid shader samples; new authored shaders elsewhere are picked up automatically. Use `pnpm check` separately for ordinary TypeScript; the Shdr CLI does not type-check code outside shader callbacks or make standalone `tsc` understand shader operators. See [CLI usage and discovery rules](packages/cli/README.md).

## VS Code and workspace TypeScript

The editor fixture is pinned to VS Code 1.127.0 and TypeScript 7.0.2. Build the workspace and launch an Extension Development Host:

```sh
pnpm build
code \
  --extensionDevelopmentPath="$PWD/apps/editor-fixture" \
  "$PWD/apps/editor-fixture"
```

In the development host:

1. Run **TypeScript: Select TypeScript Version** and choose **Use Workspace Version** if the command is available.
2. Confirm TypeScript 7.0.2 is selected.
3. Reload the window after changing the TypeScript selection.

`apps/editor-fixture/.vscode/settings.json` enables TS Go and points editor tooling to the workspace TypeScript installation. The fixture extension assigns `.shdr.ts` files the `shdr-typescript` language ID, reuses VS Code's TypeScript TextMate grammar for lexical highlighting, publishes mapped shader diagnostics, and supplies shader hovers. Ordinary `.ts` files remain owned by the standard TypeScript provider. A separate [repo-local Zed dev extension](extensions/zed-shdr/README.md) now verifies highlighting, mapped diagnostics and hover in Zed 1.21.0 from both the repository root and `apps/editor-fixture` worktrees, including a second configured TypeScript project from the root. The extension and LSP are **not shipped**; VS Code still uses its existing provider rather than LSP.

Run the Shdr-owned real-editor checklist automatically against an installed VS Code. The standard TypeScript provider check for ordinary `.ts` files remains manual:

```sh
pnpm --filter @shdr/editor-fixture build
pnpm --filter @shdr/editor-fixture test:editor
```

Set `VSCODE_EXECUTABLE_PATH` if VS Code is not installed at the default macOS path. See [the editor fixture guide](apps/editor-fixture/README.md) for the manual checklist and architecture details.

## Vite integration

Install the `@shdr/vite` plugin in a Vite configuration:

```ts
import shdr from "@shdr/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [shdr()],
});
```

The plugin recognizes `.shdr.ts` modules during Vite's pre-transform and emits a JavaScript module whose default export is a dual-target artifact (GLSL ES 3.00, WGSL, automatic bindings and complete custom-uniform defaults/usage metadata). A static import preserves the declared custom-uniform schema for typed host calls without shipping the Shdr parser/compiler. For edited source in the browser, explicitly import `compileFragmentArtifact` from `@shdr/core/browser`; this opt-in path returns the same artifact or original-source diagnostics.

```ts
import shader from "./gradient.shdr.ts";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
// Or choose createWebGpuRenderer from "@shdr/runtime/webgpu" explicitly.

const renderer = await createWebGlRenderer(canvas, shader);
await renderer.setShader(shader); // Hot replacement; initial frame already drawn.
renderer.dispose();
```

Run the complete vanilla Vite/WebGL/WebGPU fixture:

```sh
pnpm --filter vite-basic dev
pnpm --filter vite-basic build
pnpm --filter vite-basic test
```

The production check confirms that generated GLSL and WGSL—but not the parser/compiler or original operator expression—are bundled. Browser tests check both GPU paths with real pixels, including the inline/named custom-uniform flows and a WebGL-only fallback. The [runtime package guide](packages/runtime/README.md) covers explicit backend selection, automatic inputs, `{ animate: false }`, errors, loss and canvas ownership. This is a **workspace-local API, not a published package**.

Generated shaders keep safe authored local names in both targets (for example `inputMouse.x * gain`), but use deterministic `shdr_local_<symbolId>` names for keywords, builtins, and generated-name collisions. Output omits redundant parentheses without reassociating f32 expressions: `a + (b + c)` remains grouped. This changes only the generated shader text, not source diagnostics, uniforms, or artifact metadata. See the [readable-output fixture](apps/vite-basic/src/readable-output.shdr.ts) for a two-target example with a fallback name.

## Multi-target browser REPL

The REPL deliberately imports the opt-in browser compiler from `@shdr/core/browser`. It lowers once and produces the same dual-target artifact as Vite, displays shared source diagnostics, and installs that artifact through both workspace renderers on separate WebGL 2 and WebGPU canvases where available. Invalid edits preserve the last successful render on each valid canvas.

```sh
pnpm --filter repl dev
pnpm --filter repl build
pnpm --filter repl test
```

Select either generated target in the UI. WGSL only reports rendered after successful module compilation, pipeline creation and a draw. If WebGPU or an adapter is unavailable, the WebGL 2 preview remains usable and the WebGPU preview reports unavailable. Chromium/SwiftShader browser tests compare rendered pixels within channel tolerances, exercise the default uniforms and fallback paths, and keep backend messages distinct from shared source diagnostics. Both previews use the shared workspace runtime; it has **not** been published. Paste either [custom-uniform example](apps/vite-basic/src/custom-demo-inline.shdr.ts) or [named equivalent](apps/vite-basic/src/custom-demo-named.shdr.ts) into the REPL to edit defaults live. For these examples only, the preview shows buttons for a fixed example host update and reset; it is not a generic uniform editor.

## Accepted shader language

A shader module must have:

- Direct named imports from exactly `"shdr"`; no aliases or namespace imports.
- Exactly one default-exported `createFragmentShader(...)` call, or a direct `defineUniforms(...).createFragmentShader(...)` chain. A same-file `const uniforms = defineUniforms(...)` may instead be linked with `createFragmentShader(callback, { uniforms })`.
- A synchronous arrow callback with `({ coord, uniforms })` or `({ uniforms })` destructuring.
- No closure captures, nested functions, asynchronous code, or identifiers beginning with `__shdr_internal_` or `shdr_internal_` (reserved for generated helpers).

The callback supports only:

- Simple `const name = expression` declarations followed by one final `return`, or a single expression-bodied callback.
- Numeric literals, local references, and parenthesized expressions.
- `coord` (`Vec4<F32>`) when destructured, `uniforms.resolution` and `.mouse` (`Vec2<F32>`), and `uniforms.time` (`F32`); custom `uniforms.name` has its statically declared f32/vector type. Numeric literals are `F32`; vectors have two, three, or four `F32` components.
- Native `+`, binary `-`, `*`, `/`, and unary `-`, with ordinary TypeScript precedence, left association, and parentheses. The operands and results remain shader expressions—not JavaScript arithmetic.
- Direct read swizzles of one to four `xyzw` or `rgba` components available on the receiver (`r/g/b/a` alias `x/y/z/w`). Repetition, reordering, and chaining work: `coord.xyz`, `coord.xy.yx`, `coord.xy.xxyy`, `coord.bgr.gr`. A single swizzle cannot mix alphabets (`coord.xr` is invalid). A one-component swizzle produces `F32`; two to four produce the corresponding vector type.
- `vec2`, `vec3`, and `vec4` constructors in the forms below; the twenty-one direct-import math builtins below; and a final `Expr<Vec4<F32>>` result.

| Operator        | Accepted operands (same `V` means the same vector dimension)                   |
| --------------- | ------------------------------------------------------------------------------ |
| `+`, binary `-` | `F32` with `F32`, `V` with `V`, or `V` with `F32` in either order              |
| `*`, `/`        | `F32` with `F32`, `V` with `V`, or `V` **on the left** with `F32` on the right |
| unary `-`       | Any scalar or vector shader expression                                         |

Operations on vectors are component-wise; scalar operands in vector addition/subtraction broadcast across components. For example, both `coord.xy - 0.5` and `1 - coord.xy` work. **No** scalar-on-the-left vector multiplication/division or mixed vector dimensions are accepted: `coord.xy * 0.5` works, but `0.5 * coord.xy` does not. Unary `+` and `%` are unsupported.

| Constructor | Supported arguments                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `vec2`      | One `F32` (splat), two `F32`s, or one `Vec2<F32>` (copy)                                                               |
| `vec3`      | One `F32` (splat), three `F32`s, one `Vec2<F32>` plus `F32`, or one `Vec3<F32>` (copy)                                 |
| `vec4`      | One `F32` (splat), four `F32`s, one `Vec2<F32>` plus two `F32`s, one `Vec3<F32>` plus `F32`, or one `Vec4<F32>` (copy) |

Vector-plus-scalar packings place the vector first; other shapes such as `vec4(1, coord.xyz)` are not supported. Swizzles cannot be written to or computed (`coord[0]`); unavailable components such as `coord.rgb.a` are invalid.

### Math builtins (f32 common subset)

Let `S = Expr<F32>` and `Vn = Expr<VecN<F32>>` for `n = 2, 3, 4`. Each `Vn` within a signature has the **same** dimension; a `T` is either `S` or one `Vn` for that call. Import each function directly by its exact name from `"shdr"`:

| Builtin(s)                                                           | Accepted operands → result                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `sin`, `cos`, `abs`, `floor`, `fract`, `ceil`, `sqrt`, `exp`, `tanh` | `(S) → S`, `(Vn) → Vn` (component-wise vectors)                                  |
| `smoothstep`                                                         | `(T edge0, T edge1, T x) → T` (same shape for all three; component-wise vectors) |
| `mix`                                                                | `(S, S, S) → S`, `(Vn, Vn, S) → Vn`, `(Vn, Vn, Vn) → Vn`                         |
| `step`                                                               | `(S edge, S x) → S`, `(S edge, Vn x) → Vn`, `(Vn edge, Vn x) → Vn`               |
| `min`, `max`, `pow`                                                  | `(S, S) → S`, `(Vn, Vn) → Vn`                                                    |
| `clamp`                                                              | `(T x, T low, T high) → T` (same shape throughout)                               |
| `dot`                                                                | `(Vn, Vn) → S`                                                                   |
| `distance`                                                           | `(S, S) → S`, `(Vn, Vn) → S`                                                     |
| `cross`                                                              | `(V3, V3) → V3`                                                                  |
| `length`                                                             | `(S) → S`, `(Vn) → S`                                                            |
| `normalize`                                                          | `(Vn) → Vn`                                                                      |

These are 85 signatures across twenty-one names. Apart from `mix`'s scalar factor and `step`'s scalar edge, no implicit call-site broadcasts, mixed dimensions, boolean-mask `mix`, vector-edge/scalar-input `step`, scalar-edge/vector-input `smoothstep`, scalar `dot`/`normalize`/`cross`, non-Vec3 `cross`, f16, integer variants, `Math.sin`, unimported calls, aliases or namespace calls are accepted. Unsupported builtin arity/types report `SHDR1208` on the whole original call. An invalid argument keeps its more specific diagnostic rather than causing an outer overload cascade.

`clamp(coord.xyz, 0, 1)` and `pow(coord.xyz, 2)` are intentionally not Shdr signatures: write `clamp(coord.xyz, vec3(0), vec3(1))` and `pow(coord.xyz, vec3(2))` instead. GLSL accepts scalar vector bounds for `clamp`, but WGSL does not; neither target natively accepts the mixed `pow` form. A later [scope review](plans/notes.md#mixed-scalarvector-clamp-and-pow-signatures-after-pr-3) can add tested broadcast semantics without making all mixed types implicit.

For ordinary finite inputs, `step(edge, x)` is `0` when `x < edge` and `1` otherwise, **including at equality**; vector forms act component-wise. `mix(a, b, factor)` interpolates component-wise and does not clamp the factor. WGSL receives an explicit vector splat for `step(S, Vn)`; this is one target-neutral Shdr operation, not an added WGSL overload. Avoid NaNs and threshold-adjacent bit-exact expectations between GPUs.

A [representative cells shader](apps/vite-basic/src/cells-representative.shdr.ts) uses both builtins and typed custom defaults for `dpi`, `spread`, and `blur` (corresponding to reference shader 1's `u_dpi`, `u_spread`, `u_blur`). It explicitly converts Shdr's top-left `coord` and mouse inputs to bottom-left positions. The fixture pins `dpi = 1`, `spread = 0.32`, and `blur = 0.08`; host updates require `dpi > 0`, `blur > 0`, finite positive resolution, and a meaningful spread. Browser tests compare representative default/mouse/update/reset frames on WebGL and presented WebGPU canvases. **This is not a pixel-exact reproduction of the reference GLSL:** its original host values and reference frames are not available here.

The PR 3 math builtins have **dynamic input preconditions**. `sqrt` needs nonnegative components; `pow` needs nonnegative bases, and base `0` requires a positive exponent (so `0^0` is excluded); `clamp` needs `low <= high` component-wise, with equal bounds allowed. Provably invalid f32-rounded components (even when another vector component is dynamic), non-finite compound arguments, and clear `exp`/`pow` overflow report `SHDR1209` on the original call. Inputs whose domain cannot be established statically remain the caller's responsibility; WGSL parameter helpers prevent premature shader-creation errors but do **not** guarantee valid runtime values. `exp` can overflow dynamically. Results of transcendental functions are not bit-exact across targets; pixel tests use ordinary finite values and channel tolerances.

`smoothstep` accepts reversed edges, but for **portable results** requires `edge0 < edge1` in **every component**: WGSL defines reversed-edge behavior while GLSL ES 3.00 does not guarantee a result when edges are reversed. For a portable inverse scalar ramp, use `1 - smoothstep(0.2, 0.8, x)` instead of `smoothstep(0.8, 0.2, x)`. Statically established **equal** edges report `SHDR1209` on the original call; runtime equality has no guaranteed result. WGSL uses generated parameter helpers to avoid shader-creation errors from other constant-folded equal edges, **not** to define their result. `normalize` needs a nonzero vector. `distance` is equivalent to `length(x - y)` for ordinary finite values, but avoid exact equality or overflow guarantees. Avoid bit-exact cross-target claims for scalar `length` at large magnitudes, `fract` near negative integer boundaries, non-finite values, signed zero, and `min`/`max` subnormal/NaN inputs. Use ordinary finite, non-degenerate values for portable pixels.

Assignment, `let`, `var`, type annotations inside the callback, comparisons, control flow, user functions, textures, matrices, and other JavaScript/TypeScript forms are rejected with shader diagnostics. Imports cannot be aliased, and values cannot be captured from outside the callback. The compiler accepts only the explicitly listed subset even when GLSL, WGSL, or ordinary TypeScript permits more.

### Diagnostic examples

`pnpm shdr check apps/vite-basic/src/math-builtins.shdr.ts` checks a complete valid builtin shader. To see an equal-edge builtin failure, run `pnpm shdr check apps/editor-fixture/test/fixtures/invalid-math.shdr.ts`; an arithmetic failure is available at `packages/cli/test/fixtures/invalid-arithmetic.shdr.ts`. Shader diagnostics refer to **original source**, never virtual helpers or generated code:

| Authored shader source           | Diagnostic                                 | Range                   |
| -------------------------------- | ------------------------------------------ | ----------------------- |
| `coord.xy + coord.xyz`           | `SHDR1205` (incompatible binary operands)  | Whole binary expression |
| `vec3(1, coord.xy)`              | `SHDR1206` (unsupported constructor form)  | Whole call              |
| `coord.xy.z`                     | `SHDR1204` (unavailable swizzle component) | `z`                     |
| `+coord.x`                       | `SHDR1105` (unsupported unary operator)    | Unary expression        |
| `dot(coord.xy, coord.xyz)`       | `SHDR1208` (unsupported builtin signature) | Whole call              |
| `smoothstep(0.5, 0.5, coord.x)`  | `SHDR1209` (known equal edges)             | Whole call              |
| `u.f32(window.devicePixelRatio)` | `SHDR1210` (dynamic custom default)        | Nonliteral argument     |
| `vec4(1e300)`                    | `SHDR1211` (f32 literal overflow)          | Numeric literal         |

These are **Shdr syntax and semantic** checks of the callback and its explicit custom-uniform declaration, not checks of unrelated ordinary TypeScript. The TypeScript 7 editor provider also supplies mapped shader hovers and diagnostics; standalone `tsc` does not understand shader operators in `.shdr.ts` files.

## Targets, uniforms, and coordinates

| DSL value             | GLSL ES 3.00                                | WGSL                              | Runtime meaning                                                                |
| --------------------- | ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `coord`               | Canonical value derived from `gl_FragCoord` | Direct fragment-position built-in | Pixel position; top-left origin, +X right, +Y down, half-integer pixel centers |
| `uniforms.resolution` | `u_resolution`                              | Group 0, binding 0                | Drawing-buffer size in physical pixels                                         |
| `uniforms.mouse`      | `u_mouse`                                   | Group 0, binding 1                | Pointer position in pixels, top-left origin, no browser-input Y flip           |
| `uniforms.time`       | `u_time`                                    | Group 0, binding 2                | Seconds since the most recent successful shader compilation                    |

Declare custom `u.f32`/`u.vec2`/`u.vec3`/`u.vec4` fields with **static numeric defaults** via `defineUniforms`; use the direct chain or a named same-file declaration with `{ uniforms }`. See the [two checked Vite examples](apps/vite-basic/README.md#custom-uniform-demo) and the [full contract](plans/custom-uniforms/spec.md). WebGL binds referenced fields as generated individual uniforms; WebGPU binds one group 1/binding 0 struct when custom fields are referenced. The automatic group 0 slots stay fixed. Both renderers bind defaults before their first draw, accept optional creation-time `uniforms` overrides, and provide persistent `setUniforms({ gain: 0.8 })` and `resetUniforms("gain")` / `resetUniforms()` updates. `{ animate: false }` needs `draw()` after updates; replacements draw once automatically, carrying only compatible explicit `setUniforms` values, not creation-only overrides. Static shader imports check names/types at compile time; dynamic REPL artifacts check them at runtime (`ShdrRuntimeError` kind `"uniform"`). Literal defaults cannot read `window` or JavaScript variables: `u.f32(window.devicePixelRatio)` reports `SHDR1210` at the authored argument.

GLSL converts Y with `u_resolution.y - gl_FragCoord.y`; using `coord` therefore creates an implicit GLSL resolution dependency. WGSL uses fragment position directly and does not add that dependency. Fragment depth follows the canonical `0.0` near to `1.0` far convention in both targets. Unreferenced GPU bindings are omitted; declared custom defaults remain in the artifact.

## Known limitations

- **Standalone `tsc` does not understand shader operators.** Do not run ordinary `tsc --noEmit` over `.shdr.ts`; `tsc` never receives the editor virtual source or Vite transform. Use `shdr check` for shader semantics and ordinary `tsc` for ordinary modules.
- The VS Code adapter uses TypeScript 7's unstable synchronous API, performs synchronous extension-host work, and currently assumes one workspace root and one `tsconfig.json`. The private stdio LSP now selects a config per shader and has protocol tests across projects, but still checks synchronously. Its **Zed dev launcher** works only within this checkout's repository root and `apps/editor-fixture` worktrees; distribution and other projects remain unverified.
- The accepted source boundary is intentionally strict, and source maps are feasibility-grade.
- The Vite adapter emits both targets in one artifact. The Vite fixture and REPL use the same workspace-only browser runtime. It owns dedicated opaque canvases; transparent compositing, textures/samplers, other custom resources, and npm publishing require separate review.
- Babel Parser is intentionally included in the browser compiler. The complete REPL JavaScript measured 618,142 bytes minified and 168,464 bytes gzip at POC closeout; that historical measurement is not a current bundle-size claim.

These are current implementation limits, not silent compatibility claims.
