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

The example uses top-left-origin pixel coordinates and the drawing-buffer resolution. For an expanded shader exercising `vec3`, unary minus, arithmetic, and swizzles, see [the checked fixture](packages/core/test/fixtures/expanded.shdr.ts).

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
| `packages/vite`             | `.shdr.ts` to GLSL Vite pre-transform                   |
| `apps/editor-fixture`       | Real VS Code diagnostics and hover fixture              |
| `apps/vite-basic`           | Vanilla TypeScript/WebGL 2 integration fixture          |
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

`apps/editor-fixture/.vscode/settings.json` enables TS Go and points editor tooling to the workspace TypeScript installation. The fixture extension assigns `.shdr.ts` files the `shdr-typescript` language ID, reuses VS Code's TypeScript TextMate grammar for lexical highlighting, publishes mapped shader diagnostics, and supplies shader hovers. Ordinary `.ts` files remain owned by the standard TypeScript provider. The separate [Zed highlighting spike](experiments/zed-shdr/README.md) has been visually verified in Zed 1.21.0 as a local dev extension, but has no shader diagnostics or hovers and is not shipped.

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

The plugin recognizes `.shdr.ts` modules during Vite's pre-transform and emits a JavaScript module whose default export is a generated shader string. Its target is intentionally fixed to **GLSL ES 3.00**; use `@shdr/core` for both targets.

```ts
import type { FragmentShaderSource } from "shdr";
import fragmentShader from "./gradient.shdr.ts";

const source: FragmentShaderSource = fragmentShader;
```

Run the complete vanilla Vite/WebGL fixture:

```sh
pnpm --filter vite-basic dev
pnpm --filter vite-basic build
pnpm --filter vite-basic test
```

The production check confirms that generated GLSL—not the original operator expression—is bundled. The browser checks cover development edits/reloads and expected GPU pixels.

## Multi-target browser REPL

The REPL runs `@shdr/core` entirely in the browser. It lowers once, generates GLSL ES 3.00 and WGSL from the same typed IR, displays shared source diagnostics, renders GLSL through WebGL 2, and preserves the last valid frame after an invalid edit.

```sh
pnpm --filter repl dev
pnpm --filter repl build
pnpm --filter repl test
```

Select either generated target in the UI. In a WebGPU-capable browser, the REPL creates a WGSL shader module and displays `getCompilationInfo()` results. If WebGPU or an adapter is unavailable, the UI reports that limitation rather than claiming success. WGSL rendering is deliberately out of scope.

## Accepted shader language

A shader module must have:

- Direct named imports from exactly `"shdr"`; no aliases or namespace imports.
- Exactly one default-exported `createFragmentShader(...)` call.
- A synchronous arrow callback with exactly `({ coord, uniforms })` destructuring.
- No closure captures, nested functions, asynchronous code, or identifiers beginning with `__shdr_internal_`.

The callback supports only:

- Simple `const name = expression` declarations followed by one final `return`.
- Numeric literals, local references, and parenthesized expressions.
- `coord` (`Vec4<F32>`), `uniforms.resolution` and `.mouse` (`Vec2<F32>`), and `uniforms.time` (`F32`). Numeric literals are `F32`; vectors have two, three, or four `F32` components.
- Native `+`, binary `-`, `*`, `/`, and unary `-`, with ordinary TypeScript precedence, left association, and parentheses. The operands and results remain shader expressions—not JavaScript arithmetic.
- Direct read swizzles of one to four `xyzw` components available on the receiver. Repetition, reordering, and chaining work: `coord.xyz`, `coord.xy.yx`, `coord.xy.xxyy`. A one-component swizzle produces `F32`; two to four produce the corresponding vector type.
- `vec2`, `vec3`, and `vec4` constructors in the forms below, and a final `Expr<Vec4<F32>>` result.

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

Assignment, `let`, `var`, type annotations inside the callback, comparisons, control flow, user functions, custom uniforms, textures, matrices, and other JavaScript/TypeScript forms are rejected with shader diagnostics. Imports cannot be aliased, and values cannot be captured from outside the callback. The compiler accepts only the explicitly listed subset even when GLSL, WGSL, or ordinary TypeScript permits more.

### Diagnostic examples

`pnpm shdr check apps/vite-basic/src/expanded.shdr.ts` checks a complete valid shader. To see a failure, run `pnpm shdr check packages/cli/test/fixtures/invalid-arithmetic.shdr.ts`. Shader diagnostics refer to **original source**, never virtual helpers or generated code:

| Expression in a shader callback | Diagnostic                                 | Range                   |
| ------------------------------- | ------------------------------------------ | ----------------------- |
| `coord.xy + uniforms.time`      | `SHDR1205` (incompatible binary operands)  | Whole binary expression |
| `vec3(coord.xy, 1)`             | `SHDR1206` (unsupported constructor form)  | Whole call              |
| `coord.xy.z`                    | `SHDR1204` (unavailable swizzle component) | `z`                     |
| `+coord.x`                      | `SHDR1105` (unsupported unary operator)    | Unary expression        |

These are **Shdr syntax and semantic** checks, not checks of ordinary TypeScript outside the callback. The TypeScript 7 editor provider also supplies mapped shader hovers and diagnostics; standalone `tsc` does not understand shader operators in `.shdr.ts` files.

## Targets, uniforms, and coordinates

| DSL value             | GLSL ES 3.00                                | WGSL                              | Runtime meaning                                                                |
| --------------------- | ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `coord`               | Canonical value derived from `gl_FragCoord` | Direct fragment-position built-in | Pixel position; top-left origin, +X right, +Y down, half-integer pixel centers |
| `uniforms.resolution` | `u_resolution`                              | Group 0, binding 0                | Drawing-buffer size in physical pixels                                         |
| `uniforms.mouse`      | `u_mouse`                                   | Group 0, binding 1                | Pointer position in pixels, top-left origin, no browser-input Y flip           |
| `uniforms.time`       | `u_time`                                    | Group 0, binding 2                | Seconds since the most recent successful shader compilation                    |

GLSL converts Y with `u_resolution.y - gl_FragCoord.y`; using `coord` therefore creates an implicit GLSL resolution dependency. WGSL uses fragment position directly and does not add that dependency. Fragment depth follows the canonical `0.0` near to `1.0` far convention in both targets. Unreferenced uniforms are omitted.

## Known limitations

- **Standalone `tsc` does not understand shader operators.** Do not run ordinary `tsc --noEmit` over `.shdr.ts`; `tsc` never receives the editor virtual source or Vite transform. Use `shdr check` for shader semantics and ordinary `tsc` for ordinary modules.
- The VS Code adapter uses TypeScript 7's unstable synchronous API, performs synchronous extension-host work, and currently assumes one workspace root and one `tsconfig.json`.
- The accepted source boundary is intentionally strict, and source maps are feasibility-grade.
- The Vite adapter emits GLSL only. Use `@shdr/core` directly, as the REPL does, for multi-target generation.
- WGSL is generated and compile-validated but not rendered.
- Babel Parser is intentionally included in the browser compiler. The complete REPL JavaScript measured 618,142 bytes minified and 168,464 bytes gzip at POC closeout; that historical measurement is not a current bundle-size claim.

These are current implementation limits, not silent compatibility claims.
