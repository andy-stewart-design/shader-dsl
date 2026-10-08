# Reusable shader functions — PR 6 specification

## Status and goal

Proposed language extension, not an implementation or a general JavaScript evaluator. This develops [PR 6 in the language-extension roadmap](../language-exntesion.md) against the current fragment-only f32 language. Authors can define straight-line, typed shader helpers once and call them from the same or another `.shdr.ts` file. A `.shdr.ts` file can contain only exported helpers/uniform definitions, or can also default-export a fragment shader. Imports feel like named TypeScript imports at authoring time; compilation statically resolves source, **never executes authored modules**, and produces the existing dual-target JSON fragment artifact.

Retain one target-neutral IR, GLSL ES 3.00 and WGSL parity, original-file diagnostics, TypeScript 7/editor behavior, static-consumer compiler exclusion, automatic/custom uniform contracts, and finite rendered behavior for valid inputs. This feature does not itself add missing math builtins, matrices, control flow, derivative semantics, or other reference-shader capabilities.

## Authored surface

Illustrative V1 source (the declarations and types below define the intended contract, not existing APIs):

```ts
// shared.shdr.ts
import { defineShaderFunction, defineUniforms, fract } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

export const uniforms = defineUniforms((u) => ({ grain: u.f32(0.1) }));

export const filmGrain = defineShaderFunction(
  (p: Expr<Vec2<F32>>, seed: Expr<F32>) => {
    const n = p.x * 0.1031 + p.y * 0.11369 + seed;
    return fract(n); // Expr<F32> return inferred.
  },
);
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

The top-level imported `uniforms` declaration supplies the existing `{ uniforms }` option; the callback's `uniforms` is its typed input, not an implicit helper capture. An exported helper or uniform definition may instead live alongside a default-exported `createFragmentShader(...)` in the same `.shdr.ts` file and be imported elsewhere. Helper-only files need no dummy default shader. Preserve existing inline/chained `defineUniforms` authoring forms for fragment entries.

- `defineShaderFunction` is a recognizable top-level declaration boundary, not an executable way to construct a JavaScript function in a built app. Support direct `const` declarations, optionally named-exported; direct expression-body and block-body arrows with zero or more **explicitly annotated** `Expr<F32>` / `Expr<Vec2/3/4<F32>>` parameters. Block bodies use the current supported sequence of shader-local `const` statements and one final return. Accept an optional `Expr<T>` return annotation and check it; otherwise infer the return type from the lowered final expression. Annotated helper parameters and `import type` declarations for the supported Shdr types must work in core, the browser compiler, and TypeScript 7 tooling without relying on `tsc` to evaluate shader operators. Do not infer parameter shapes from call sites: an exported helper must have a stable signature even if no fragment calls it.
- Each helper has one concrete signature. Check exact argument count and scalar/vector shapes at each call, with errors at the authored call/argument. The return must be an existing shader value type; function values, host values, matrices, optional/rest/default parameters, overloads, generics, async/generators, and control flow are out of scope. A helper may call another local or imported helper or a supported constructor/builtin, but cannot access `coord`, `uniforms`, module values, or any other outer binding except through explicit `Expr` arguments. No arbitrary closures or shader-global state. Local/parameter identifiers use the same cross-target safe-name/fallback discipline as fragments.
- Resolve calls by symbol identity and their declared signatures, **not** by interpreting a same-spelled ordinary TypeScript function or blindly substituting text. Support direct named `.shdr.ts` exports/imports, including `import { filmGrain as grain }`. Detect duplicate/ambiguous declarations, unknown imports, invalid exports, arity/shape errors, and capture attempts at original source locations. A module can call helpers it imports transitively: a fragment importing `noise` need not import `noise`'s dependency `hash`. Reject direct and indirect recursion, including cycles involving modules or functions, with an understandable cycle path; emit only reachable helper definitions exactly once per fragment in dependency order. Do not implicitly compile another module's default fragment merely because a helper in that module is imported.
- One fragment selects at most **one** custom-uniform definition through its existing explicit link. That definition may be imported from a `.shdr.ts` file; its static literal defaults, complete schema, typed callback access, and referenced-binding metadata remain the same as a local declaration. Importing a definition does not grant a helper access to it. Other unused exports are not merged into the selected fragment's custom schema. A fragment's default artifact still carries the existing schema-preserving static host type. A separate shader that imports the same definition can use its own artifact and host overrides.

## Source graph, resolution, and consumers

- Only statically analyzable imports of supported named helpers and uniform definitions from `.shdr.ts` modules participate in V1. Resolve relative `.shdr.ts` paths and project `tsconfig.json` `paths` aliases against the selected TypeScript project; use a common resolver contract across compiler hosts so a CLI-clean shader cannot silently resolve to a different file in Vite/editor. Named-import aliases are allowed. Module specifiers must resolve to `.shdr.ts` source; report missing files, unsupported exports, alias ambiguity and cycles without executing an import. No package-name imports, Vite-only aliases, namespace imports, dynamic imports, barrel re-exports (`export *` or `export { ... } from`), or arbitrary `.ts`/JavaScript modules in V1. Define/document how project boundaries, canonical paths and duplicate imports are handled; avoid treating a string-based import as trusted code execution.
- The core must expose an environment-neutral multi-file compilation entry: an entry path, source contents for reachable virtual paths, and sufficient alias-resolution information. An equivalent of `compileFragmentArtifact({ entry, files, paths })` is illustrative; preserve the existing single-source compile path for no-import fragments, with a clear unresolved-import diagnostic if it has no resolver. A virtual map must never need filesystem access, `require`, `eval`, or a TypeScript project service. Report diagnostics with **both file identity and original range** for multi-file errors, while retaining the existing single-source API/diagnostic behavior where possible. Errors in helper bodies point into the defining module; mismatched calls point into the calling module. Failed compilation yields no partial artifact.
- CLI discovery/checks validate helper-only files as well as fragment entries and resolve their dependencies, including files reached outside the initial discovery set where permitted by project configuration. Avoid duplicate diagnostics when a broken shared file has multiple dependents; attribute them to their authored file and preserve deterministic output. The TypeScript 7 adapter/LSP and real VS Code UI must route original diagnostics and hovers in _each_ file's helper body/parameters and imported call sites, without taking over ordinary `.ts` files. Preserve editing behavior when either a dependency or an entry changes.
- Vite statically compiles a default-exported fragment and its source dependencies into one existing artifact (no runtime imports of helper or uniform source modules). Watch/invalidate every source and relevant resolution input so a shared-helper edit rebuilds all dependent fragments. Helper-only `.shdr.ts` modules are compile-time libraries, not host runtime exports. Ordinary static consumers still import only a fragment's default artifact; attempting to import a helper or uniform definition as an ordinary runtime value must fail clearly rather than ship or execute authored source. The production artifact/binding schema and compiler-excluding bundle boundary must not change.
- The browser compiler accepts an explicitly supplied virtual file map, including the effective `paths` mapping if aliases are used. The existing single-textarea REPL need not gain a multi-file UI in PR 6: same-file helpers should work; external imports without supplied files get a clear diagnostic, not a browser fetch or silent omission. A future workspace REPL can supply a map from tabs. Vite/CLI may read sources from disk, but the shared core must not do so implicitly.

## IR and target semantics

Extend target-neutral syntax/IR for parameter references, user-helper call targets, typed helper definitions, and module identity. Prefer immutable definitions and deterministic graph traversal. GLSL and WGSL generate real typed functions with stable, collision-free backend identifiers (including when authors reuse names across files or use reserved names), retaining the existing autogenerated uniforms, entry points, helper/builtin namespaces, f32 expression grouping, WGSL splats and guarded helpers. Resolve helper call types and bindings without substituting arbitrary strings into finished target code. Do not algebraically reassociate f32 expressions, mutate the IR, or promise bit-exact GPU results.

Builtin numeric/domain diagnostics retain the **existing local rule** wherever a builtin appears, including a helper body: reject a demonstrably invalid direct `sqrt(-1)`, `pow`, `clamp`, `smoothstep` equality, or non-finite f32 subexpression at its authored builtin/argument. Helper parameters are dynamic for V1 analysis; do **not** propagate known values through a helper call graph to reject `root(-1)` when `root(x)` contains `sqrt(x)`. Document the argument's domain as a caller precondition and avoid guaranteeing finite behavior for invalid runtime values. Unknown dynamic inputs remain subject to current preconditions; this is not a validation of every invocation. The compiler must not invoke helper code to establish constant values.

## Acceptance and review gates

1. Source/API tests: helper-only module; same-file helper plus default fragment; imported helper and imported uniforms from a mixed module; named-import alias; project `paths` alias; chained helpers in three files; explicit and inferred return types; scalar and V2/V3/V4 signatures; existing custom default/schema and independent host overrides. Assert identical typed IR semantics and stable artifacts for the same graph in different hosts. Invalid parameter annotations, mismatched return/argument types, capture, ordinary-JS call, unresolved/unsupported import, recursion/cycle, and missing or conflicting uniform link must produce file/range-correct diagnostics rather than uncaught exceptions.
2. Original-source checks: direct invalid builtin calls remain diagnosed in fragment and helper bodies; unknown helper-parameter domains and `root(-1)` follow the documented caller-precondition limitation. Core/CLI/TypeScript 7/editor diagnostics and quick info agree on supported expressions and do not suppress unrelated `.ts` errors. Exercise same-file and cross-file edits and project aliases in real editor/CLI checks.
3. Generated-target checks: compile real GLSL ES 3.00 in WebGL 2 and WGSL modules/pipelines in WebGPU for local, imported, alias, transitive, colliding-name, and custom-uniform cases. Confirm helpers are emitted once in dependency order; their argument/return shapes, WGSL splats, guarded builtins, automatic bindings, custom group 1 metadata and entry names agree with the fragment-only behavior. Compare pinned, non-degenerate WebGL pixels against **presented WebGPU pixels** with tolerances; include a reusable grain/palette-style helper and custom defaults. Explicitly reconstruct reference Y coordinates if comparing existing GLSL reference frames.
4. Consumer checks: Vite production/default artifact stays JSON data and excludes compiler and authored-source execution, including the WebGL-only bundle; edits to an imported helper or uniform invalidate dependent artifacts. Browser virtual-map and Vite/CLI artifacts agree for equivalent sources/config. The single-file REPL supports local helpers and reports unresolved external imports clearly, without requiring a new UI. Run workspace build, uncached checks, CLI checks, all tests, real VS Code UI, formatting and whitespace checks.

## Explicit non-goals

General TypeScript/JavaScript module execution or arbitrary imports; npm package and Vite-only alias resolution; import barrels and namespace imports; a multi-file REPL UI; implicit helper access to uniforms/coordinates or static module constants; polymorphic/overloaded functions, recursion, user control flow, matrices, new stages or resources; interprocedural domain proof or constant specialization; changed runtime renderer APIs/artifact schema; promising portable results for undefined operations or bit-identical cross-GPU pixels.
