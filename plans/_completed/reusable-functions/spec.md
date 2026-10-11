# Reusable shader functions specification

## Status

- Readiness: **Ready for planning**; this is a proposed contract, not an implemented feature.
- Blocking decisions: None identified in the interview. Resolver details and implementation feasibility still need to be validated in planning.
- Source: The PR 6 discussion in [the language-extension roadmap](../language-exntesion.md), the agreed interview in this conversation, and the earlier [draft specification](./spec.md). The earlier draft remains intact. This document separates agreed behavior from assumptions where the interview did not settle a detail.

## Problem and intended outcome

A shader author currently has to inline or duplicate reusable expressions such as grain, palette, noise, and waveform calculations inside fragment callbacks. Authors should be able to define a typed shader helper once, call it locally or import it from another `.shdr.ts` file, and share a statically declared uniform schema across fragment files. The result must still be a single dual-target fragment artifact, not a collection of authored JavaScript modules run in the browser.

**Central invariant:** the source looks like a restricted TypeScript module graph, but neither compilation nor the static consumer evaluates authored `.shdr.ts` modules as JavaScript. Existing source diagnostics, artifact/binding contracts, and f32 behavior for valid inputs survive the change.

## Scope

Included:

- Top-level `defineShaderFunction` helpers with concrete f32 scalar/V2/V3/V4 parameters, optional return annotations, inferred return types, and straight-line expression or `const`/final-return bodies.
- Same-file calls; named `.shdr.ts` exports/imports, including aliases and transitive helper calls; a helper-only module or named exports beside a default-exported fragment.
- Importing an explicitly linked `defineUniforms` declaration from another `.shdr.ts` file; relative paths and selected-project `tsconfig.json` `paths` aliases.
- Core compilation with an explicit virtual file graph, project-backed Vite/CLI/editor integration, and generated GLSL ES 3.00 and WGSL functions.

Non-goals:

- Running JavaScript to discover shader values; importing arbitrary `.ts`/JS modules, npm package-name imports, Vite-only aliases, re-export barrels, namespace/dynamic imports, or runtime named exports of helpers/uniform definitions.
- Implicit captures (including `coord` or uniforms), generic/overloaded functions, recursion, control flow, host values, other stages, matrices, new math/resource types, or static module-constant capture.
- A multi-file REPL UI or interprocedural proof of builtin domain validity through helper arguments. Existing single-source usage remains supported.

## Current behavior and evidence

- **Static code inspection:** `packages/core/src/parse-shader-file.ts` expects one default-exported fragment call; named shader-callable imports currently come from `"shdr"`. `packages/core/src/lower-shader-syntax.ts` resolves constructors/builtins, not authored helper calls. `packages/core/src/shader-ir.ts` has one fragment module and no user-function definitions. These are extension seams, not evidence that multi-file compilation already works.
- **Static code inspection:** `packages/core/src/compile-fragment-artifact.ts` compiles a single source string; `packages/vite/src/index.ts` transforms each `.shdr.ts` file into a default-exported artifact; `packages/cli/src/check.ts` checks discovered files individually. `apps/repl/src/App.tsx` has one source textarea. `packages/lsp/src/project-discovery.ts` selects a TypeScript project, while the CLI and Vite plugin do not yet share a shader-module resolver.
- **Existing contract to preserve:** `packages/core/src/parse-custom-uniforms.ts` parses literal-only `defineUniforms` defaults; the artifact contains automatic/custom usage metadata. The current editor virtual-source transformation handles fragment expressions. The [custom-uniform contract](../_completed/custom-uniforms/spec.md) and [runtime contract](../_completed/runtime-api/spec.md) govern bindings, defaults, rendering, and replacement. No runtime/target behavior for reusable functions is claimed as observed here.

## Requirements and invariants

- **R1 — Explicit typed boundary:** A helper is a top-level `const` initialized by `defineShaderFunction` with explicitly annotated `Expr<F32>` or `Expr<Vec2/3/4<F32>>` parameters. Its return is inferred from its shader expression unless an `Expr<T>` annotation is supplied, in which case it is checked. A helper has one concrete signature independent of its call sites; ordinary TypeScript functions do not silently become shader functions.
- **R2 — Explicit dependencies:** A helper can use its parameters, own supported `const` locals, supported Shdr builtins/constructors, and local or imported helpers. It cannot capture callback inputs, module variables, uniform definitions, or host/JavaScript values. A shader explicitly passes `coord` or uniform expressions as arguments when needed.
- **R3 — Source-module reuse:** A `.shdr.ts` file can export named helpers or uniform definitions without a fragment, or export them beside a default fragment. Direct named imports, including local aliases, work between `.shdr.ts` files. Transitive calls resolve even when the root fragment does not directly import every dependency. Re-exports and recursive call/module cycles are unsupported in V1.
- **R4 — Imported uniform contract:** A fragment may select an imported `defineUniforms` declaration through its existing explicit `{ uniforms }` link. Its complete schema/defaults, callback types, referenced fields, artifact metadata, and runtime behavior match a same-file declaration. No helper gains implicit access to that schema; unused exports are not merged into it.
- **R5 — Resolution parity:** Supported imports resolve to `.shdr.ts` source via relative paths or `paths` in the selected project's `tsconfig.json`. The same graph/configuration must identify the same files for CLI, Vite, editor, and a browser caller supplying equivalent virtual files and mappings. Unsupported or ambiguous imports fail clearly; authored imports are never evaluated.
- **R6 — Environment-neutral compiler:** Multi-file compilation accepts an entry shader, named source files, and effective alias information without core filesystem or TypeScript-project access. Single-source compilation without cross-file imports stays usable. Browser integrations can supply sources explicitly; no automatic network fetch is required.
- **R7 — Diagnostic ownership and failure:** An error in a definition has that file's original range; an invalid helper invocation has the caller's original range. Missing imports, cycles, invalid signatures/exports, captures, return mismatches, and malformed uniform links fail with source-located diagnostics. Failure produces no partial artifact; checking multiple dependents must not repeatedly report an unchanged shared-file fault as unrelated errors.
- **R8 — Backend equivalence:** A successful fragment graph produces one target-neutral typed meaning and the existing JSON artifact shape. Both backends emit each reachable helper once, with matching parameter/return types, dependency-safe order, cross-target collision-free names, unchanged f32 grouping, and intact generated builtin helpers and uniform bindings. An imported file's default fragment is not included merely because one of its helpers is used.
- **R9 — Tooling and static boundary:** CLI checks helper-only files; TypeScript 7/editor diagnostics and hovers cover helper definitions and imported calls without taking ownership of ordinary `.ts`. Editing an imported source invalidates dependent Vite artifacts. A production static host still consumes only the default artifact: no authored source execution or compiler bundle, and no callable named export exposed as ordinary runtime JavaScript.
- **R10 — REPL boundary:** The existing single-textarea REPL can compile helpers defined in that text. Without a supplied virtual graph, an external `.shdr.ts` import reports an unresolved-import diagnostic; V1 does not require a multi-file editor.
- **R11 — Existing numeric policy:** Current builtin checks still reject locally provable invalid expressions, including ones written in helpers. Helper parameters are dynamic for V1 domain analysis: a call such as `root(-1)` is not rejected solely because `root(x)` contains `sqrt(x)`. Its domain remains the caller's precondition; unknown or invalid runtime inputs are not promised finite or portable output.
- **R12 — Compatibility:** Fragments without reusable functions retain their accepted source forms, original-source diagnostic ownership, uniform and runtime interfaces, artifact schema, and static compiler-exclusion boundary. The feature does not reassociate f32 operations or silently broaden unrelated Shdr syntax.

## Behavior and contracts

An example of the intended authoring flow (illustrative APIs, not currently implemented):

```ts
// shared.shdr.ts
import { defineShaderFunction, defineUniforms, fract } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

export const uniforms = defineUniforms((u) => ({ grain: u.f32(0.1) }));
export const filmGrain = defineShaderFunction(
  (p: Expr<Vec2<F32>>, seed: Expr<F32>) =>
    fract(p.x * 0.1031 + p.y * 0.11369 + seed),
); // Expr<F32> return inferred.
```

```ts
// scene.shdr.ts
import { createFragmentShader, vec4 } from "shdr";
import { filmGrain as grain, uniforms } from "./shared.shdr.ts";

export default createFragmentShader(
  ({ coord, uniforms }) =>
    vec4(grain(coord.xy, uniforms.time) * uniforms.grain, 0, 0, 1),
  { uniforms },
);
```

The top-level imported `uniforms` supplies the options value; `{ uniforms }` inside the callback names the shader input. Neither is an implicit capture by `filmGrain`. `import type` of supported Shdr expression/value types must be understood as type syntax, not a runtime source dependency. A project alias can replace `"./shared.shdr.ts"` when specified in that project's `tsconfig.json`; a browser virtual graph must supply the equivalent mapping.

For a browser caller, an API equivalent to `compileFragmentArtifact({ entry: "/scene.shdr.ts", files: { "/scene.shdr.ts": source, "/shared.shdr.ts": sharedSource }, paths })` describes the required **behavior**, not a finalized signature. Paths identify source files for resolution and diagnostics. Success returns the same kind of dual-target artifact as single-source compilation; failure identifies an authored file and range and returns no usable candidate. Existing string-only calls with no cross-file imports continue to work. Compiling an entry does not install it or change the last successfully rendered shader; the host controls replacement as before.

On a helper call, wrong argument count or shape is diagnosed at that call. A locally invalid builtin expression in the helper is diagnosed in the helper file, whereas a builtin receiving an otherwise unknown helper parameter retains its runtime precondition. Generated shader functions and entry points may have different target spellings, but must implement the same typed call graph and uniform interface. No helper definition or `defineUniforms` callback runs as authored JavaScript during resolution, compilation, or static rendering.

## Ownership and boundaries

Core owns source-graph semantics, typed lowering, file/range diagnostics, and dual-target generation; it must not read the filesystem or assume a browser/project service. Vite and CLI own project-file loading and invalidation/check presentation; TypeScript 7/editor owns project-aware display of mapped diagnostics and hovers. Browser callers own any virtual source map; the existing REPL owns only its current textarea. Runtime renderers own artifact installation and uniform values, not imports or shader parsing. Static hosts import a fragment's default JSON artifact only. Ownership must remain consistent when multiple fragment entries share one helper or uniform file: compiling/replacing one entry must not alter another entry's artifact or host override state.

## Acceptance criteria

| ID  | Requirement(s) | Starting condition / action                                                                                                                                                                                                                           | Expected outcome                                                                                                                                                                                                                                             | Verification approach                                                       |
| --- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| AC1 | R1, R2         | Define an expression-bodied and a `const`/return helper with typed scalar/vector parameters; call them with valid arguments. Then try an untyped parameter, mismatched annotated return, capture of `coord`, and an ordinary JS-function call.        | Valid helpers infer/check concrete returns and produce typed calls; invalid cases report original-source diagnostics and no artifact.                                                                                                                        | Core and TypeScript 7/editor fixtures.                                      |
| AC2 | R3, R7         | Compile an entry importing a helper exported beside another file's default fragment; that helper calls a helper from a third file. Repeat with a helper-only source, named-import alias, duplicate names, missing export, direct and indirect cycles. | Valid entries reach each required definition once without including the other default shader; failures identify the appropriate file/range and do not produce an artifact.                                                                                   | Source-graph/core and CLI cases.                                            |
| AC3 | R4, R12        | Import a literal-default `defineUniforms` schema into two separate fragments, compile and install each artifact, then update/reset one renderer.                                                                                                      | Both artifacts retain the same declared schema/defaults and correct binding subsets; typed host access works; updating one renderer leaves the other's values unchanged. Existing same-file forms still behave as before.                                    | Type checks, metadata assertions, runtime integration.                      |
| AC4 | R5, R6         | Resolve the same dependency via a relative specifier and a `tsconfig.json` `paths` alias in a project and via equivalent browser virtual files/mapping; then remove the dependency or provide an unsupported specifier.                               | Supported graphs select the intended `.shdr.ts` source and produce equivalent artifacts; unsupported/unresolved imports give source-located errors rather than execution, fetch, or a different target-specific resolution.                                  | CLI/Vite/editor and browser-core graph fixtures.                            |
| AC5 | R7, R9         | Put an invalid expression in a shared helper imported by two fragments; check the project, edit the helper to fix it, then edit it again.                                                                                                             | CLI/editor attribute the fault to the helper's original location without duplicate independent faults; editor hovers update; Vite dependent artifacts update on each edit while ordinary `.ts` ownership remains unchanged.                                  | CLI, project editor adapter, real VS Code UI and Vite dev verification.     |
| AC6 | R8, R12        | Compile a finite fragment using transitive helpers, an imported custom schema, vectors and a guarded builtin for both targets.                                                                                                                        | GLSL ES 3.00 compiles/links, WGSL creates a module/pipeline, each reachable function is emitted once with safe names, bindings and JSON metadata match their contract, and pinned WebGL pixels match **presented WebGPU pixels** within declared tolerances. | Real Chromium WebGL 2 and presented-WebGPU tests; static output assertions. |
| AC7 | R9, R12        | Build a production static host importing a default fragment that uses helpers; also attempt to import a named helper as an ordinary runtime value.                                                                                                    | Production dual-target and WebGL-only bundles contain artifact data but no compiler or authored helper execution; the ordinary runtime-value import fails clearly rather than exposing a callable helper.                                                    | Production bundle inspection and negative Vite fixture.                     |
| AC8 | R10, R6        | In the existing single-textarea REPL, compile a local helper; then paste a shader with an external import but no virtual file map.                                                                                                                    | Local helper compiles and renders both available previews; external import yields a clear diagnostic, with no fetch or partial replacement of the last installed shader.                                                                                     | Browser REPL check.                                                         |
| AC9 | R11            | Put `sqrt(-1)` directly inside a helper, then instead define `root(x) = sqrt(x)` and call `root(-1)`; repeat with an unknown runtime argument.                                                                                                        | The directly invalid authored builtin is rejected in its defining file; the latter calls follow the documented parameter precondition without interprocedural rejection or an assertion of finite results.                                                   | Core/CLI domain-diagnostic cases; no invalid-pixel fidelity assertion.      |

## Assumptions

- **Direct-export syntax:** V1 uses `const name = defineShaderFunction(...)` with optional `export`; no function declarations or re-export barrels. This follows the agreed marker and direct-import decision, but the precise declaration grammar was not separately approved. Validate against a representative authored fixture before finalizing the parser contract.
- **One explicit schema per fragment:** Imported schemas use the existing `{ uniforms }` selection rather than composing several definitions; this is inferred from the current custom-uniform API, not a request for schema merging. Validate with two fragments importing one declaration and with a negative multiple-schema case.
- **Acyclic modules and calls:** Reject module cycles as well as recursive calls for deterministic V1 resolution; the interview explicitly accepted rejecting recursion but did not separately choose how harmless module cycles should behave. Validate a minimal cycle diagnostic before coding broad resolver behavior.
- **Project configuration:** `tsconfig.json` `paths` is authoritative for aliases as agreed; the exact containing-project selection and behavior for an entry with no usable config need a documented, testable resolver rule. This is a planning/feasibility validation item, not permission to fall back silently to Vite-only resolution.
- **Reachability and invocation:** An imported module's default fragment is not emitted when only a named helper is used; CLI still checks standalone helper files. This follows the agreed reusable-module shape and existing default-artifact behavior. Confirm both modes with a mixed-export fixture.

## Risks and open decisions

- Blocking: **None identified** for planning. If the selected TypeScript project cannot give CLI, Vite and editor consistent alias resolution, the alias contract must be revisited explicitly rather than implemented inconsistently.
- Non-blocking: TypeScript 7 currently transforms one callback region, while Vite currently replaces an entire `.shdr.ts` file with one artifact. Multi-file virtual diagnostics, dependency invalidation, and compile-only named exports are substantial integration risks; validate these seams before promising a delivery date. Browser source-map path keys and `paths` inputs must be normalized so different callers compile equivalent graphs. WGSL/WebGL optimization can differ for floating-point helpers, so use pinned finite inputs and tolerances, not bit identity.

## Deferred work

Package-name imports, re-exports/namespace imports, ordinary host-side helper values, a multi-file REPL UI, inferred helper parameter types, generic/overloaded helpers, recursion, arbitrary captures/control flow, cross-helper domain analysis, static module constants, and other language milestones (such as matrix helpers) require separate contracts. Revisit them only when a concrete port or consumer needs them.
