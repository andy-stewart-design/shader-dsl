# Shader DSL POC outcome

## Decision

**GO for a hardened next milestone.**

The central hypothesis succeeded: native operator syntax can remain intact in TypeScript-shaped shader source while a dedicated VS Code provider supplies shader-aware types and mapped diagnostics, and the same filesystem-independent compiler core can generate deterministic GLSL ES 3.00 and WGSL for Node/Vite and browser consumers.

This is a feasibility result, not a production-readiness claim. The next milestone should harden the editor/compiler boundary and add a first-class checker before materially expanding the shader language.

## Evidence summary

| Acceptance criterion                              | Result and evidence                                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator syntax remains intact                    | The checked-in `.shdr.ts` fixtures retain native `/`; virtual rewriting remains internal to the language service.                                         |
| `uv` is `Expr<Vec2<F32>>` in VS Code              | The real Extension Development Host checklist asserts this exact hover.                                                                                   |
| Native arithmetic cascades are hidden             | The editor fixture reports only the intentional ordinary TypeScript error for the valid shader callback.                                                  |
| Invalid shader operations are mapped              | `coord.xy / coord` produces one sanitized diagnostic over the original division expression with no helper name.                                           |
| Ordinary TypeScript is unaffected                 | Outside-callback errors and hovers remain visible; ordinary `.ts` files remain owned by VS Code's TypeScript provider.                                    |
| Nested division and literals use shader semantics | Virtual-source, mapping, parity, language-service, and semantic-lowering tests cover both.                                                                |
| GLSL compiles and renders                         | Real Chromium WebGL 2 tests compile/link the generated module and verify representative gradient pixels.                                                  |
| One typed IR generates both targets               | The parity test recursively freezes one IR object, generates in both orders, and proves deterministic output and non-mutation.                            |
| Coordinate/depth conventions agree                | Backend tests and browser pixels cover top-left Y orientation, half-integer centers, implicit GLSL resolution, direct WGSL position, and canonical depth. |
| WGSL compiles in WebGPU                           | The REPL test created a WebGPU shader module and received no compilation errors in pinned Playwright Chromium.                                            |
| Vite and REPL share the core                      | `@shdr/vite` calls public `compileFragment`; the browser REPL calls public `lowerFragment`/`generateFragment` from the same `@shdr/core` package.         |

## Editor result

The editor hypothesis passed against:

- **VS Code:** 1.127.0 (`arm64`)
- **TypeScript:** 7.0.2
- **Investigated native-preview extension:** `TypeScriptTeam.native-preview` 0.20260708.2

The successful implementation does not depend on native-preview middleware. `.shdr.ts` is registered as a dedicated `shdr-typescript` language, and the extension publishes diagnostics and hovers through stable VS Code APIs while `@shdr/language-service` privately uses `typescript/unstable/sync`.

At closeout, `pnpm --filter @shdr/editor-fixture test:editor` reran the complete checklist in a real isolated Extension Development Host. It covered the initial valid shader, exact `uv` hover, preserved ordinary error/hover, live invalid division, nested division recovery, standalone invalid fixture, and ordinary TypeScript provider ownership.

## Compiler and backend result

- Parsing, validation, semantic typing, and lowering are synchronous and filesystem-independent.
- The typed IR contains semantic built-ins and uniforms but no TypeScript AST nodes, GLSL names, WGSL attributes, or target-conditioned coordinate transformations.
- The GLSL ES 3.00 backend compiles and links in WebGL 2 and renders the expected gradient through SwiftShader ANGLE.
- The WGSL backend generates a standalone fragment entry point with deterministic sparse uniform bindings.
- Playwright 1.63.0 with Chromium 153.0.8010.12 exposed WebGPU during the closeout run; `createShaderModule()` plus `getCompilationInfo()` reported successful WGSL compilation.
- WebGPU rendering was intentionally not implemented.

## Clean acceptance run

A detached temporary worktree at commit `3f29c2c` was installed and tested with no generated files or `node_modules` present. Turbo caching was forcibly disabled. The run used Node.js 24.20.0 and pnpm 11.23.0:

```sh
pnpm install --frozen-lockfile
TURBO_FORCE=true pnpm build
TURBO_FORCE=true pnpm check
TURBO_FORCE=true pnpm test
```

All tasks passed with zero cached tasks. The normal test command included the Vite and REPL Playwright browser suites. The real VS Code checklist also passed separately.

## Browser bundle observation

The Step 7.4 production REPL JavaScript measured:

- **618,142 bytes minified**
- **168,464 bytes gzip**

That single bundle includes React, Babel Parser, `@shdr/core`, and both generators. The build audit found no Node-only core imports, globals, filesystem access, browser-external compatibility stubs, or Node polyfills. Babel Parser is the dominant deliberate browser-boundary tradeoff and should be profiled before treating the REPL compiler as a production web payload.

## What remains fragile

- The editor path depends on TypeScript 7's unstable synchronous API.
- `.shdr.ts` uses a dedicated language ID instead of extending the native TypeScript provider.
- Checker work currently runs synchronously on the VS Code extension host.
- The editor adapter assumes one workspace root and one `tsconfig.json`; multi-root and project-reference behavior is not hardened.
- Standalone `tsc` sees ordinary arithmetic and cannot apply shader semantics.
- Source syntax is deliberately narrow, and source maps/refactoring support are feasibility-grade.
- Vite is fixed to GLSL ES 3.00; multi-target generation is currently a direct core API.
- Browser compilation includes Babel Parser and produces a relatively large POC bundle.
- WGSL is compile-validated but not rendered.

## Recommended next milestone

Build a **production-oriented checker and editor architecture** before expanding syntax substantially:

1. Add a `shdr check` CLI that recursively discovers shader modules and reports the same core diagnostics for CI.
2. Move editor checking off the extension-host hot path, add cancellation, and support multi-root/project-reference workspaces.
3. Define compatibility tests around TypeScript/VS Code upgrades so unstable API breakage is detected explicitly.
4. Improve incremental parsing/caching and source-map quality.
5. Then expand the language deliberately—additional arithmetic operators, vector dimensions/constructors, and user uniforms—through the existing parity matrices and target-neutral IR.

## Standalone `tsc` recommendation

Do **not** pursue deep standalone `tsc` integration in the next milestone. Native TypeScript does not provide operator overloading or the required source-replacement semantics, so a transformer/plugin path would be invasive, version-sensitive, and still incomplete for editor/build parity. Keep ordinary TypeScript checking for ordinary modules, exclude `.shdr.ts` from standalone `tsc`, and provide the dedicated `shdr check` CLI for shader CI. Revisit TypeScript integration only if an official virtual-file/content-mapping API becomes stable.
