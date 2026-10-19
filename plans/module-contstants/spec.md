# Static module constants specification

## Status

- Readiness: **Ready for planning**; not implemented. This contract is not permission to implement or publish.
- Blocking decisions: None identified. Editor type-mapping, source-graph isolation, and two-target feasibility are implementation gates, not assumed results.
- Source: The `grill-me` discussion in this conversation and [PR 5 of the language-extension roadmap](../language-exntesion.md#pr-5--static-module-constants-not-implemented-optional-authoring-tranche). The user agreed to literals, vector constructors, and references to earlier constants, **without arithmetic in module initializers**. The [accepted language reference](../../README.md#accepted-shader-language) governs existing expression, helper, and source-module boundaries.

## Problem and intended outcome

A shader author can name a value in a callback or pass it to a helper, but cannot share a static radius, color, or tuning value between a fragment and helpers in the same source file. A top-level `const` is currently a forbidden capture in shader bodies. Authors should be able to declare a small, statically analyzable set of same-file scalar/vector constants and refer to them from shader code, while compilation remains source-only and preserves the meaning of ordinary TypeScript outside shader regions.

**Central invariant:** only an eligible, statically validated same-file declaration can cross the existing no-capture boundary. All other outer values, including imports, runtime state, uniform definitions, and ordinary JavaScript functions, remain forbidden captures. No authored `.shdr.ts` module or initializer is executed to obtain a shader value.

## Scope

Included:

- Simple top-level `const` names initialized by finite numeric literals (including unary negative literals), supported direct-import `vec2`, `vec3`, or `vec4` constructors, or references to **earlier eligible constants in that file**. Constructor arguments may use the same permitted forms, including earlier constants, provided the resulting expression is accepted by an existing constructor signature.
- Scalar `F32` and `Vec2/3/4<F32>` shader values used in the fragment callback and in `defineShaderFunction` helpers **defined in the same file as the constant**. A fragment importing a helper whose defining module contains its own eligible constant still works through the existing source graph; the fragment does not gain direct access to that constant.
- Static f32 validation, original-file diagnostics, both generated targets, TypeScript 7/editor and CLI/Vite/REPL parity, unchanged runtime/artifact boundary, and real-browser rendered acceptance.

Non-goals:

- Arithmetic, swizzles, math builtins, shader-helper calls, arbitrary calls, mutable values, destructuring, arrays, objects, `as const`/assertions, or TypeScript function execution in module initializers. Authors can calculate derived values inside a shader or pass them as explicit arguments; expanding initializer grammar needs a separate decision.
- Imported or exported-as-a-shader-dependency constants, re-exports, a new constant-import protocol, captured host variables, captured uniforms/automatic inputs, or implicitly executing imported modules. Existing helper and uniform-schema imports are unchanged.
- Matrix/texture module constants, new shader stages, general module-scoped shader statements, dynamic host configuration, additional uniform defaults or updates, or completing any reference port.

## Current behavior and evidence

The following is **static inspection**, not new implementation or browser verification:

- `packages/core/src/validate-shader-syntax.ts` permits callback-local names and helper parameters, but reports an outer identifier as a closure capture; `lower-shader-syntax.ts` resolves locals and selected shader callables/uniforms, not ordinary top-level values. `parse-shader-file.ts` and `parse-shader-functions.ts` recognize fragment/helper boundaries without evaluating author code.
- `packages/core/src/shader-module-graph.ts` resolves named helpers and uniform schemas across `.shdr.ts` files. Imported helpers are lowered in their defining module. Source-file ownership and diagnostics must remain attached to that module; the current graph does not expose named constants as an import kind.
- `packages/core/src/transform-shader-expressions.ts` rewrites numeric literals and shader operators within fragment/helper regions for TypeScript 7 checking, while `packages/shdr/src/internal.ts` has an internal number-to-`Expr<F32>` typing bridge. Extending this to referenced module scalars and accepted vector initializers is **unverified**; ordinary `const R = 0.1` is a TypeScript `number` outside shader expressions.
- Existing f32 literal/domain checks, local name isolation, helper lowering, and GLSL/WGSL generation provide patterns, not evidence that module constant capture already works. The `circles-circling.frag`, `horizon-burn.frag`, and `moby-gradient.frag` references under `apps/vite-basic/src/references/` contain named scalar/vector constants; none is a completed module-constant Shdr port. No tests were run to author this spec.

## Requirements and invariants

- **R1 — Bounded authoring form:** An eligible declaration is a simple, top-level `const NAME = initializer` in a `.shdr.ts` file. Initializers consist only of the accepted literals, previously eligible same-file identifiers, and existing supported vector-constructor forms over those inputs. Names must obey existing generated-name/reserved-name rules. The subset is determined from syntax and imports, never by evaluating authored JavaScript.
- **R2 — Same-file capture only:** A fragment or helper may reference eligible constants from its own file, regardless of whether a helper is later imported by another fragment. Shadowing by a valid shader-local or helper parameter retains the existing lexical binding. A constant cannot capture a shader callback input, uniform, imported value, or another file's constant; other outer identifiers still receive the existing capture/unknown-name behavior.
- **R3 — Dependency and error ownership:** A constant reference resolves only to an eligible declaration that precedes it in the same source file. Forward references, invalid chains, unsupported initializers, non-finite/f32-overflow literals, and incompatible constructor shapes used by shader code produce authored-file/range diagnostics, not exceptions, generated-file cascades, or a partial artifact. Cycles cannot be admitted through aliases, imports, or source ordering. Unused ordinary host declarations outside shader regions must not start producing Shdr errors merely because this feature exists.
- **R4 — Value/type integrity:** A scalar declaration is a TypeScript number outside shader regions but behaves as `Expr<F32>` when referenced as a shader value; vector declarations retain their corresponding `Expr<VecN<F32>>` behavior in supported shader use. In both targets, constant values follow existing f32 literal/constructor semantics without executing JavaScript, changing expression grouping, or promising bit-identical GPU output. A module constant is not a uniform or mutable runtime value.
- **R5 — Source graph and tooling parity:** Single-source compilation and helpers in project/virtual graphs resolve the same eligible constants within each defining file. TypeScript 7 diagnostics and hovers, CLI checks, Vite static compilation, and the single-textarea REPL agree on accepted/invalid source, including unsaved edits and source-file ranges. The REPL does not fetch imports; existing `.shdr.ts` source import rules are not widened to import constants.
- **R6 — Artifact/runtime isolation:** Compilation yields the existing JSON-only dual-target artifact and preserves automatic/custom/resource metadata, numeric defaults, f32 behavior, generated-name safety, and static-consumer compiler exclusion. Renderer APIs and lifecycle are unchanged; no module constant, authored initializer, or helper becomes a host-side JavaScript value or runtime binding.
- **R7 — Real-target acceptance:** Finite scalar/vector constant examples, including a helper-local same-file capture and an imported helper with its own constant, compile on real WebGL 2 and WebGPU targets and render matching meaning within stated channel tolerances on WebGL and **presented** WebGPU. Invalid or missing browser capability is reported as unverified, not claimed from shader text or mocks.

## Behavior and contracts

Illustrative source-only authoring:

```ts
import { defineShaderFunction, vec2, vec3, vec4 } from "shdr";
import type { Expr, F32, Vec2 } from "shdr";

const RADIUS = 0.1;
const CENTER = vec2(0, 0);
const TINT = vec3(0.3, RADIUS, 0.8);
const SECOND_TINT = TINT;

const tint = defineShaderFunction((uv: Expr<Vec2<F32>>) =>
  vec3(uv.x + CENTER.x, uv.y * RADIUS, SECOND_TINT.z),
);

export default /* existing fragment form */;
```

The final line stands for an existing `createFragmentShader` entry that uses `tint`; this example does not introduce another entry syntax. `const SPACING = RADIUS` is also eligible; `const SPACING = RADIUS * 2` is **not** a supported module initializer in this slice, although the corresponding multiplication inside a shader is already supported. A valid vector constructor may use scalar literals or earlier scalar constants in the positions admitted by its existing signature; it may copy an earlier same-size vector where the constructor already supports copying. A declaration cannot refer to itself or a later top-level name. Use ordinary lexical shadowing in shader bodies: a helper parameter named `RADIUS` names that parameter, not the module constant.

The compiler may inline an eligible value or emit a safe target-level constant; this is not an author-facing choice. It must not duplicate runtime-dependent expressions or change existing shader expression grouping. No module initializer may read `process.env`, call a host function, access `uniforms.time`, refer to an imported value, or rely on TypeScript evaluation. Constructor names must be imported from `"shdr"` as under existing language rules; spelling `vec3` alone is not permission to call a host function. A plain `const HOST = computeColor()` elsewhere in a file can remain ordinary host text, but referencing `HOST` from a shader is invalid at its authored use/definition range. An invalid constant referenced by a helper defined in another module is reported in the helper's source module, not remapped onto the importing fragment.

Module declarations are compile-time inputs for the fragment/helper that reads them, not host uniform defaults. For example `defineUniforms((u) => ({ gain: u.f32(RADIUS) }))` remains invalid under the existing literal-default rule. Changing a constant's source requires recompiling the artifact through the normal project/Vite/editor paths; it cannot be updated with `setUniforms` or `resetUniforms`. The REPL can only use constants written in its textarea and does not request external `.shdr.ts` source.

## Ownership and boundaries

Core owns static eligibility, same-file dependency resolution, value/type lowering, and authored-file diagnostics without filesystem access or authored-code execution. The TypeScript 7 virtual-source adapter owns editor-only type mapping inside shader regions while leaving ordinary TypeScript checks and source coordinates intact. The existing graph/project consumers supply files and invalidate dependents; Vite emits the default static artifact, and runtime renderers continue to consume that artifact without interpreting source or loading constants. Imported helpers can use constants **from their defining file**, but a caller cannot import that constant as a new dependency or capture its own module values inside an imported helper.

## Acceptance criteria

| ID  | Requirement(s) | Starting condition / action                                                                                                                                                                                                    | Expected outcome                                                                                                                                                                                                                                                                              | Verification approach                                                         |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| AC1 | R1, R2, R4     | Declare a scalar literal, a `vec2/3/4` value, an earlier scalar alias, and a vector built from earlier scalar values; use them in a fragment and a same-file helper, including a local/parameter shadow.                       | Each valid use has the expected scalar/vector type and value on both targets; shadowed names refer to the local/parameter. Nothing is evaluated as authored JS.                                                                                                                               | Public types, core/compiler, TypeScript 7 editor, and generated-target tests. |
| AC2 | R2, R3, R5     | Compile a fragment importing a helper from a helper-only file with its own eligible constant; then edit that constant and check both helper and dependent fragment.                                                            | The imported helper reflects its defining file's changed constant, diagnostics/hovers retain authored file/ranges, and unrelated entries or ordinary `.ts` files do not change. The constant itself is not an importable shader dependency.                                                   | Virtual-graph, CLI/project, Vite dev and editor unsaved-edit cases.           |
| AC3 | R1, R3         | From a shader use a forward name, `let`, dynamic host call, imported variable, unsupported module arithmetic, wrong-shape vector constructor, overflowing literal, or a constant that depends on one of these.                 | All invalid uses fail with actionable authored ranges and no artifact or JS execution; unrelated unused host declarations do not acquire Shdr errors.                                                                                                                                         | Core negative fixtures, public/virtual TS7 diagnostics, CLI parity.           |
| AC4 | R4, R7         | Render a shader using non-square coordinate math with static scalar/vector constants, a helper-local capture, and an imported helper that owns its own constant. Compare finite pinned inputs on both backends.                | GLSL compiles/links, WGSL modules/pipelines validate, and WebGL pixels and **presented WebGPU** pixels implement the same intended values within recorded tolerances.                                                                                                                         | Real Chromium WebGL 2 readback and presented-WebGPU screenshots/pixels.       |
| AC5 | R5, R6         | Build static Vite consumers and use the REPL's single textarea with a local constant; compile the same source via opt-in browser core, then try an unresolved external constant import and a uniform default using a constant. | Valid sources yield the existing JSON artifact shape without new bindings/compiler code in the static consumer; local REPL renders on available backends. The external import and nonliteral uniform default fail visibly without fetching `.shdr.ts` or changing a healthy installed shader. | Artifact/bundle tests, REPL browser and negative graph/CLI cases.             |
| AC6 | R3, R5, R6     | Check a project with one invalid constant referenced by more than one helper/entry, repair it, and recheck after an unsaved edit.                                                                                              | The defining-file error is not duplicated into misleading independent caller faults; dependent results refresh, ordinary TypeScript ownership stays intact, and prior renderer defaults/overrides remain unchanged.                                                                           | Source-graph, editor adapter, real editor UI, runtime regression.             |

## Assumptions

- **Type bridge:** `const R = 0.1` remains a `number` for ordinary TypeScript code; only shader references are interpreted as f32 shader expressions. The precise virtual-source and lowering mechanism is open. Validate with a standalone ordinary `.ts` use and source-located hover/diagnostic fixtures before claiming editor parity.
- **Syntactic subset:** Top-level simple `const` declarations are analyzed only when needed by a shader/helper; unrelated host declarations remain outside the language. It is inferred—not separately approved—that an exported constant is not a supported shader import, even though a same-file use of that declaration could be analyzed. Keep export handling from implying runtime named shader exports.
- **Numeric normalization:** Reuse existing finite-f32 literal policy, including rounding at the existing literal boundary. Confirm negative zero, overflow/underflow, and constructor compatibility against both generated targets. No interprocedural domain proof or bit-identical pixel claim is inferred.

## Risks and open decisions

- Blocking for planning: **None.** If prototype editor typing cannot express scalar `number` as a shader `Expr<F32>` at original ranges without polluting ordinary TypeScript, stop for contract review rather than claiming parity from compiler-only checks.
- Non-blocking: Helper-only modules and imported helpers need per-defining-file constant environments and dependency-aware invalidation; a shortcut using the entry file's constants would silently change values. Module-level vector constructors are compile-only DSL markers: a host that executes the authored `.shdr.ts` file as JavaScript remains outside the supported boundary. Expanded constant arithmetic or importing constants requires a separate contract.

## Deferred work

Derived module initializers (arithmetic/builtins), matrix/texture constants, cross-file constant exports/imports, constant-based uniform defaults, host-driven updates, arbitrary JavaScript captures, full reference-port fidelity, and changes to helper parameter/domain analysis are not part of this slice. Revisit them for a concrete authoring need and a defined static/f32 contract.
