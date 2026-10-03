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

The example uses top-left-origin pixel coordinates and the drawing-buffer resolution. For an expanded shader exercising `vec3`, unary minus, arithmetic, and swizzles, see [the checked fixture](packages/core/test/fixtures/expanded.shdr.ts). For the original eleven math builtins, see the [Vite/WebGL fixture](apps/vite-basic/src/math-builtins.shdr.ts); for `ceil`, `distance`, and `cross`, see the [editor/REPL fixture](apps/editor-fixture/geometry-math.shdr.ts).

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

The plugin recognizes `.shdr.ts` modules during Vite's pre-transform and emits a JavaScript module whose default export is a dual-target artifact (GLSL ES 3.00, WGSL and referenced default-binding metadata). A static import does not ship the Shdr parser/compiler. For edited source in the browser, explicitly import `compileFragmentArtifact` from `@shdr/core/browser`; this opt-in path returns the same artifact or original-source diagnostics.

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

The production check confirms that generated GLSL and WGSL—but not the parser/compiler or original operator expression—are bundled. Browser tests check both GPU paths with real pixels plus a WebGL-only fallback. The [runtime package guide](packages/runtime/README.md) covers explicit backend selection, automatic inputs, `{ animate: false }`, errors, loss and canvas ownership. This is a **workspace-local API, not a published package**.

## Multi-target browser REPL

The REPL deliberately imports the opt-in browser compiler from `@shdr/core/browser`. It lowers once and produces the same dual-target artifact as Vite, displays shared source diagnostics, and installs that artifact through both workspace renderers on separate WebGL 2 and WebGPU canvases where available. Invalid edits preserve the last successful render on each valid canvas.

```sh
pnpm --filter repl dev
pnpm --filter repl build
pnpm --filter repl test
```

Select either generated target in the UI. WGSL only reports rendered after successful module compilation, pipeline creation and a draw. If WebGPU or an adapter is unavailable, the WebGL 2 preview remains usable and the WebGPU preview reports unavailable. Chromium/SwiftShader browser tests compare rendered pixels within channel tolerances, exercise the default uniforms and fallback paths, and keep backend messages distinct from shared source diagnostics. Both previews use the shared workspace runtime; it has **not** been published.

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
- Direct read swizzles of one to four `xyzw` components available on the receiver. Repetition, reordering, and chaining work: `coord.xyz`, `coord.xy.yx`, `coord.xy.xxyy`. A one-component swizzle produces `F32`; two to four produce the corresponding vector type.
- `vec2`, `vec3`, and `vec4` constructors in the forms below; the fourteen direct-import math builtins below; and a final `Expr<Vec4<F32>>` result.

| Operator        | Accepted operands (same `V` means the same vector dimension)   |
| --------------- | -------------------------------------------------------------- |
| `+`, binary `-` | `F32` with `F32`, or `V` with `V`                              |
| `*`, `/`        | The same pairs, or `V` **on the left** with `F32` on the right |
| unary `-`       | Any scalar or vector shader expression                         |

Operations on vectors are component-wise. **No** scalar-on-the-left vector multiplication/division, scalar/vector addition/subtraction, or mixed vector dimensions are accepted. For example, `coord.xy * 0.5` works; `0.5 * coord.xy` and `coord.xy + uniforms.time` do not. Unary `+` and `%` are unsupported.

| Constructor | Supported arguments                                                                        |
| ----------- | ------------------------------------------------------------------------------------------ |
| `vec2`      | One `F32` (splat), two `F32`s, or one `Vec2<F32>` (copy)                                   |
| `vec3`      | One `F32` (splat), three `F32`s, or one `Vec3<F32>` (copy)                                 |
| `vec4`      | One `F32` (splat), four `F32`s, one `Vec2<F32>` plus two `F32`s, or one `Vec4<F32>` (copy) |

Other packings such as `vec3(coord.xy, 1)` or `vec4(coord.xyz, 1)` are not yet supported. Swizzles cannot be written to or computed (`coord[0]`); `.rgba` aliases and unavailable components such as `coord.xy.z` are invalid.

### Math builtins (f32 common subset)

Let `S = Expr<F32>` and `Vn = Expr<VecN<F32>>` for `n = 2, 3, 4`. Each `Vn` within a signature has the **same** dimension; a `T` is either `S` or one `Vn` for that call. Import each function directly by its exact name from `"shdr"`:

| Builtin(s)                                    | Accepted operands → result                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `sin`, `cos`, `abs`, `floor`, `fract`, `ceil` | `(S) → S`, `(Vn) → Vn` (component-wise vectors)                                  |
| `smoothstep`                                  | `(T edge0, T edge1, T x) → T` (same shape for all three; component-wise vectors) |
| `min`, `max`                                  | `(S, S) → S`, `(Vn, Vn) → Vn`                                                    |
| `dot`                                         | `(Vn, Vn) → S`                                                                   |
| `distance`                                    | `(S, S) → S`, `(Vn, Vn) → S`                                                     |
| `cross`                                       | `(V3, V3) → V3`                                                                  |
| `length`                                      | `(S) → S`, `(Vn) → S`                                                            |
| `normalize`                                   | `(Vn) → Vn`                                                                      |

These are 51 signatures across fourteen names. No implicit broadcasts, mixed dimensions, scalar `dot`/`normalize`/`cross`, non-Vec3 `cross`, f16, integer variants, `Math.sin`, unimported calls, aliases or namespace calls. Unsupported builtin arity/types report `SHDR1208` on the whole original call. An invalid argument keeps its more specific diagnostic rather than causing an outer overload cascade.

`smoothstep` accepts reversed edges, but for **portable results** requires `edge0 < edge1` in **every component**: WGSL defines reversed-edge behavior while GLSL ES 3.00 does not guarantee a result when edges are reversed. For a portable inverse scalar ramp, use `1 - smoothstep(0.2, 0.8, x)` instead of `smoothstep(0.8, 0.2, x)`. Statically established **equal** edges report `SHDR1209` on the original call; runtime equality has no guaranteed result. WGSL uses generated parameter helpers to avoid shader-creation errors from other constant-folded equal edges, **not** to define their result. `normalize` needs a nonzero vector. `distance` is equivalent to `length(x - y)` for ordinary finite values, but avoid exact equality or overflow guarantees. Avoid bit-exact cross-target claims for scalar `length` at large magnitudes, `fract` near negative integer boundaries, non-finite values, signed zero, and `min`/`max` subnormal/NaN inputs. Use ordinary finite, non-degenerate values for portable pixels.

Assignment, `let`, `var`, type annotations inside the callback, comparisons, control flow, user functions, textures, matrices, and other JavaScript/TypeScript forms are rejected with shader diagnostics. Imports cannot be aliased, and values cannot be captured from outside the callback. The compiler accepts only the explicitly listed subset even when GLSL, WGSL, or ordinary TypeScript permits more.

### Diagnostic examples

`pnpm shdr check apps/vite-basic/src/math-builtins.shdr.ts` checks a complete valid builtin shader. To see an equal-edge builtin failure, run `pnpm shdr check apps/editor-fixture/test/fixtures/invalid-math.shdr.ts`; an arithmetic failure is available at `packages/cli/test/fixtures/invalid-arithmetic.shdr.ts`. Shader diagnostics refer to **original source**, never virtual helpers or generated code:

| Expression in a shader callback | Diagnostic                                 | Range                   |
| ------------------------------- | ------------------------------------------ | ----------------------- |
| `coord.xy + uniforms.time`      | `SHDR1205` (incompatible binary operands)  | Whole binary expression |
| `vec3(coord.xy, 1)`             | `SHDR1206` (unsupported constructor form)  | Whole call              |
| `coord.xy.z`                    | `SHDR1204` (unavailable swizzle component) | `z`                     |
| `+coord.x`                      | `SHDR1105` (unsupported unary operator)    | Unary expression        |
| `dot(coord.xy, coord.xyz)`      | `SHDR1208` (unsupported builtin signature) | Whole call              |
| `smoothstep(0.5, 0.5, coord.x)` | `SHDR1209` (known equal edges)             | Whole call              |

These are **Shdr syntax and semantic** checks, not checks of ordinary TypeScript outside the callback. The TypeScript 7 editor provider also supplies mapped shader hovers and diagnostics; standalone `tsc` does not understand shader operators in `.shdr.ts` files.

## Targets, uniforms, and coordinates

| DSL value             | GLSL ES 3.00                                | WGSL                              | Runtime meaning                                                                |
| --------------------- | ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `coord`               | Canonical value derived from `gl_FragCoord` | Direct fragment-position built-in | Pixel position; top-left origin, +X right, +Y down, half-integer pixel centers |
| `uniforms.resolution` | `u_resolution`                              | Group 0, binding 0                | Drawing-buffer size in physical pixels                                         |
| `uniforms.mouse`      | `u_mouse`                                   | Group 0, binding 1                | Pointer position in pixels, top-left origin, no browser-input Y flip           |
| `uniforms.time`       | `u_time`                                    | Group 0, binding 2                | Seconds since the most recent successful shader compilation                    |

Custom f32/vector declarations now compile via `defineUniforms` with literal defaults in either [supported authoring form](plans/custom-uniforms/spec.md). **Runtime binding and host updates are not implemented yet**; compiling a custom-uniform shader does not make it renderable with the current browser runtime. See the [implementation plan](plans/custom-uniforms/plan.md) before using this feature in an app. GLSL converts Y with `u_resolution.y - gl_FragCoord.y`; using `coord` therefore creates an implicit GLSL resolution dependency. WGSL uses fragment position directly and does not add that dependency. Fragment depth follows the canonical `0.0` near to `1.0` far convention in both targets. Unreferenced uniforms are omitted.

## Known limitations

- **Standalone `tsc` does not understand shader operators.** Do not run ordinary `tsc --noEmit` over `.shdr.ts`; `tsc` never receives the editor virtual source or Vite transform. Use `shdr check` for shader semantics and ordinary `tsc` for ordinary modules.
- The VS Code adapter uses TypeScript 7's unstable synchronous API, performs synchronous extension-host work, and currently assumes one workspace root and one `tsconfig.json`. The private stdio LSP now selects a config per shader and has protocol tests across projects, but still checks synchronously. Its **Zed dev launcher** works only within this checkout's repository root and `apps/editor-fixture` worktrees; distribution and other projects remain unverified.
- The accepted source boundary is intentionally strict, and source maps are feasibility-grade.
- The Vite adapter emits both targets in one artifact. The Vite fixture and REPL use the same workspace-only browser runtime. It owns dedicated opaque canvases; transparent compositing, custom resources, and npm publishing require separate review.
- Babel Parser is intentionally included in the browser compiler. The complete REPL JavaScript measured 618,142 bytes minified and 168,464 bytes gzip at POC closeout; that historical measurement is not a current bundle-size claim.

These are current implementation limits, not silent compatibility claims.
