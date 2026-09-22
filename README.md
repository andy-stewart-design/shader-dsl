# Shdr operator-syntax POC

Shdr is a proof of concept for writing shader expressions with native operators inside TypeScript-shaped source. A custom editor path gives those operators shader-specific types and diagnostics; a target-neutral compiler lowers the same source to typed IR and generates either GLSL ES 3.00 or WGSL.

```ts
import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const color = vec4(uv.x, uv.y, 0, 1);

  return color;
});
```

This is an embedded shader language using TypeScript syntax, not JavaScript execution or TypeScript operator overloading.

- [POC specification](plans/poc/spec.md)
- [Implementation plan and step results](plans/poc/implementation-plan.md)
- [POC outcome and decision](plans/poc/outcome.md)

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
| `packages/core`             | Parser, validation, typed IR, and GLSL/WGSL generation  |
| `packages/language-service` | TypeScript 7 virtual-source checking and editor routing |
| `packages/vite`             | `.shdr.ts` to GLSL Vite pre-transform                   |
| `apps/editor-fixture`       | Real VS Code diagnostics and hover fixture              |
| `apps/vite-basic`           | Vanilla TypeScript/WebGL 2 integration fixture          |
| `apps/repl`                 | React browser compiler, target viewer, and validator    |

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

`apps/editor-fixture/.vscode/settings.json` enables TS Go and points editor tooling to the workspace TypeScript installation. The fixture extension assigns `.shdr.ts` files the `shdr-typescript` language ID, publishes mapped shader diagnostics, and supplies shader hovers. Ordinary `.ts` files remain owned by the standard TypeScript provider.

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

The plugin recognizes `.shdr.ts` modules during Vite's pre-transform and emits a JavaScript module whose default export is a generated shader string. Its target is intentionally fixed to **GLSL ES 3.00** for this POC.

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

## Exact supported language subset

A shader module must have:

- Direct named imports from exactly `"shdr"`; no aliases or namespace imports.
- Exactly one default-exported `createFragmentShader(...)` call.
- A synchronous arrow callback with exactly `({ coord, uniforms })` destructuring.
- No closure captures, nested functions, asynchronous code, or identifiers beginning with `__shdr_internal_`.

The callback supports only:

- Simple `const name = expression` declarations followed by one final `return`.
- Numeric literals, local references, and parenthesized expressions.
- Binary division with `/` for the supported equal-dimension or vector/scalar combinations.
- `coord`, `uniforms.resolution`, `uniforms.mouse`, and `uniforms.time`.
- Read swizzles `.x`, `.y`, and `.xy` on supported vectors.
- `vec4(x, y, z, w)`, `vec4(vec2, z, w)`, scalar splat `vec4(value)`, and `Vec4` copy `vec4(value)`.
- A final `Expr<Vec4<F32>>` result.

Assignment, `let`, `var`, type annotations inside the callback, other operators, control flow, user functions, custom uniforms, textures, matrices, and other JavaScript/TypeScript forms are rejected with shader diagnostics. The complete rules and diagnostic contracts are in the [specification](plans/poc/spec.md).

## Targets, uniforms, and coordinates

| DSL value             | GLSL ES 3.00                                | WGSL                              | Runtime meaning                                                                |
| --------------------- | ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `coord`               | Canonical value derived from `gl_FragCoord` | Direct fragment-position built-in | Pixel position; top-left origin, +X right, +Y down, half-integer pixel centers |
| `uniforms.resolution` | `u_resolution`                              | Group 0, binding 0                | Drawing-buffer size in physical pixels                                         |
| `uniforms.mouse`      | `u_mouse`                                   | Group 0, binding 1                | Pointer position in pixels, top-left origin, no browser-input Y flip           |
| `uniforms.time`       | `u_time`                                    | Group 0, binding 2                | Seconds since the most recent successful shader compilation                    |

GLSL converts Y with `u_resolution.y - gl_FragCoord.y`; using `coord` therefore creates an implicit GLSL resolution dependency. WGSL uses fragment position directly and does not add that dependency. Fragment depth follows the canonical `0.0` near to `1.0` far convention in both targets. Unreferenced uniforms are omitted.

## Known limitations

- **Standalone `tsc` does not understand shader operators.** Do not run ordinary `tsc --noEmit` over `.shdr.ts`; `tsc` never receives the editor virtual source or Vite transform. Normal TypeScript packages are still checked normally.
- The VS Code adapter uses TypeScript 7's unstable synchronous API, performs synchronous extension-host work, and currently assumes one workspace root and one `tsconfig.json`.
- The accepted source boundary is intentionally strict, and source maps are feasibility-grade.
- The Vite adapter emits GLSL only. Use `@shdr/core` directly, as the REPL does, for multi-target generation.
- WGSL is generated and compile-validated but not rendered.
- Babel Parser is intentionally included in the browser compiler. The complete REPL JavaScript measured 618,142 bytes minified and 168,464 bytes gzip at POC closeout.

These constraints are POC decisions, not silent compatibility claims. See the [outcome document](plans/poc/outcome.md) for the recommended next milestone.
