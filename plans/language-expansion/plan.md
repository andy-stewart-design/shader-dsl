# Shdr language expansion — math builtins plan

Status: proposed for **one language-expansion PR**, after the [project-aware LSP](../_completed/lsp-discovery/plan.md) is reviewed. This PR must deliver `sin`, `cos`, `smoothstep`, **`abs`, `floor`, `fract`, `min`, `max`, `dot`, `length`, and `normalize` together**. Use small, independently reviewed implementation phases _within_ that PR; do not call it complete after the first three functions. The [existing arithmetic/vector contract](../_completed/next-milestone/language-slice.md) and [public language reference](../../README.md#accepted-shader-language) remain the baseline.

## Goal and invariants

Make useful fragment effects possible while establishing and pressure-testing **one coherent builtin-call abstraction**. Preserve native shader operators, original-source diagnostics, the restricted `createFragmentShader` callback, and one target-neutral IR generating GLSL ES 3.00 and WGSL. Public `"shdr"` types, TypeScript 7 editor checking, core lowering, the CLI, and both generators must agree on accepted calls and result types. Do not add arbitrary `Math.*`, JavaScript execution, ambient globals, target pass-through calls, or a second checker. Only direct named imports from `"shdr"` are shader callables; ordinary TypeScript outside shader callbacks stays ordinary TypeScript.

A small motivating shader (proposed, **not yet supported**):

```ts
import {
  createFragmentShader,
  fract,
  length,
  sin,
  smoothstep,
  vec4,
} from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const wave = sin(uniforms.time + uv.x);
  const band = smoothstep(0.2, 0.8, fract(length(uv) + wave));
  return vec4(band, band, band, 1);
});
```

The complete PR also needs a shader that exercises vector-valued calls and compositions involving `abs`, `floor`, `min`, `max`, `dot`, and `normalize`, rather than merely adding exports that never flow through the compiler.

## Phase 1 — Freeze the common-subset signature and diagnostic contract

Use `S = Expr<F32>` and `Vn = Expr<VecN<F32>>` for `n ∈ {2, 3, 4}`. These are **candidate** signatures, not a claim that either target or the current implementation already accepts them. Validate every row in raw GLSL ES 3.00 and WGSL fixtures before freezing it:

| Builtins                | Candidate accepted arguments → result              | Boundaries to decide and test                                                                                         |
| ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `sin`, `cos`            | `(S) → S`, `(Vn) → Vn`                             | Vector forms are component-wise; no implicit scalar/vector conversion.                                                |
| `smoothstep`            | `(T edge0, T edge1, T x) → T`, `T = S` or one `Vn` | Every argument has the **same** shape; for portable results require `edge0 < edge1` per component.                    |
| `abs`, `floor`, `fract` | `(S) → S`, `(Vn) → Vn`                             | Vector calls are component-wise; `fract` on negative inputs and precision near integer boundaries need target checks. |
| `min`, `max`            | `(S, S) → S`, `(Vn, Vn) → Vn`                      | Both vectors have the **same** dimension; scalar/vector broadcasts and unequal dimensions are deferred.               |
| `dot`                   | `(Vn, Vn) → S`                                     | Same-size vectors only; no scalar dot product.                                                                        |
| `length`                | `(S) → S`, `(Vn) → S`                              | Scalar length is `abs` for ordinary finite inputs; precision/overflow need care.                                      |
| `normalize`             | `(Vn) → Vn`                                        | Nonzero vector is a caller precondition; do not promise portable results for zero length.                             |

Numerical edge cases (non-finite values, signed zero, subnormal `min`/`max`, invalid `smoothstep` edges, and zero-vector `normalize`) must be documented without claiming exact cross-target bit parity. Known const-equal `smoothstep` edges can make WGSL **fail shader creation**; known reversed edges lack portable GLSL behavior. The source-level policy must diagnose statically established non-increasing components instead of silently emitting invalid/undefined target shaders; no general proof of runtime edge inequality is promised. Confirm the useful finite-input common subset and expected tolerances, not JavaScript `Math` semantics. Numeric literals inside shader callbacks continue to behave as `S`. No integer or boolean types, mixed vector dimensions, implicit broadcasts, comparisons, or new constructor shapes are introduced by these signatures.

Record a reviewed table of positive and negative source examples, wrong arity/type/argument-order results, hover types, and **original-source** diagnostic codes/messages/ranges. Direct named imports are required: aliases, namespace calls, shadowed imports, unknown names, and `Math.sin` must not become shader calls by accident. If a candidate overload is not portable, narrow _that overload_ after review; do not silently drop any of the eleven required function names from this PR. If a required name has no viable shared signature, stop and explicitly revisit the PR scope before implementation.

**Gate 1:** frozen overload/diagnostic table with positive and rejected DSL cases, plus raw target compilation/validation tests for every candidate accepted shape (including V2/V3/V4) and relevant edge precondition. A target accepting an intentionally excluded DSL shape does not widen the contract. Stop for review before public types or checker changes.

**Phase 1 result — stop for review:** The [candidate builtin contract](./builtin-contract.md) specifies all eleven names, 42 scalar/vector signature shapes, import/call boundaries, `SHDR1208` ownership for invalid signatures, `SHDR1209` for statically established non-increasing `smoothstep` edges, original-source ranges, and undefined-domain preconditions. [Raw-target tests](../../packages/core/test/math-builtin-target-feasibility.test.ts) compile all 42 typed shapes in GLSL ES 3.00 and WGSL, demonstrate WGSL's const-equal-edge shader-creation error, then check finite negative `fract`/`floor` and nonzero `normalize` behavior via WebGL pixels and WebGPU compute readback in Chromium 153.0.8010.12. This **does not** add DSL builtins or claim editor/core parity. Review the contract before Phase 2.

## Phase 2 — Build a coherent builtin-call path

- Specify a finite builtin identity/signature model (name, arity, operand shapes, return type and source range), used consistently to classify direct call syntax. Prefer a shared declarative signature source where package boundaries permit; where public TypeScript overloads, virtual helper signatures and core validation require separate representations, enforce exhaustive parity tests rather than maintaining untested hand-copied rules.
- Add public `shdr` callable types/markers, TypeScript 7 virtual checking and mapped diagnostics, source validation and core semantic typing. Reuse the current normalized **generic direct-call syntax** and typed `ShaderCallExpression` IR with `target.kind: "builtin-function"`; retain ordered arguments, result type, and original range. Do not add a special AST node per function or embed GLSL/WGSL names in the IR. Keep compiler-core code browser-safe and the public runtime stubs non-evaluating.
- Implement exhaustive target emitters for the finite builtin set, including nested calls, with deterministic GLSL and WGSL spellings. Exhaustive visitors must reject unknown IR names rather than generating arbitrary calls; neither backend may independently widen the DSL's accepted signatures.
- Start with `sin`, `cos`, `smoothstep` as a vertical implementation check, then add all eight requested functions **in this same PR** to exercise unary scalar/vector, binary scalar/vector, reductions, and vector normalization. At each internal checkpoint, test the whole currently implemented subset against TypeScript/core/IR/two-target parity; checkpoints are not permission to merge a partial builtin set.

**Gate 2:** the abstraction works end-to-end for each of the eleven names, with public types, TypeScript 7 diagnostics/hovers, core lowering, CLI results and both generators agreeing. Stop for review before broader editor/runtime claims.

**Phase 2 result — stop for review:** Public overloads, a finite signature model, target-neutral builtin IR, both exhaustive emitters and the shared TypeScript 7 editor adapter cover all 42 shapes in source/hover tests; the CLI handles valid calls and original-source `SHDR1208`/`SHDR1209` failures. Generated WGSL compiles all 42 cases in WebGPU, including vector `smoothstep`. For a `smoothstep` edge pair that source analysis cannot prove non-increasing, WGSL emits a shape-specific helper with parameter edges: WGSL evaluates the builtin with non-const operands, preventing a shader-creation error even when constant-folded source arguments happen to be equal (verified in WebGPU for scalar/vector `sin(1)` versus `sin(1 + 0)`). The strict-inequality **runtime precondition still applies**; the helper does not define an equal-edge result or weaken statically proven `SHDR1209` diagnostics. Reserve `shdr_internal_` for generated WGSL helpers. This satisfies the shader-creation part of Gate 2 without adding new diagnostics or requiring an approximate transcendental evaluator. Phase 3 still owns cross-target generated-render/pixel validation and real-editor integration.

## Phase 3 — Pressure-test integration and finish the PR

- For every accepted signature and representative rejected arity/type pair, compare TypeScript 7 and core behavior, including `V2`/`V3`/`V4`, literals, unary minus, nested calls, invalid inner arguments, local references, aliases/namespace/captures, and the final `Vec4` return rule. Check that each failing expression gets a useful **original-source** range and sanitized message, without native TypeScript cascades or virtual helper names. Ordinary `.ts` and code outside the shader callback retain their current ownership.
- Add directly constructed typed-IR and generator tests to prove classification, argument order, nesting and target-neutral representation, not just source-string snapshots. Run raw target fixtures and generated GLSL/WebGL render/pixel checks plus WGSL/WebGPU compilation/validation. Use finite non-degenerate inputs for pixel comparisons; separately document invalid-domain behavior rather than treating it as a shader failure.
- Verify an integrated example through `shdr check`, Vite and REPL paths, and real VS Code/Zed diagnostics and hovers where applicable. Update the public language reference and valid/invalid shader examples. Run `pnpm build`, `pnpm check`, `pnpm test`, `pnpm ci:check` and the real VS Code fixture check; distinguish protocol checks from actual Zed behavior. The CLI still does **not** check ordinary TypeScript.

**PR gate:** all eleven names and the reviewed signatures are implemented and independently verified across public types, the existing adapter, core, target-neutral IR, both targets and real-editor paths. Stop for review before merge or any further language expansion.

## Later, independent PRs

- **Additional math overloads:** Consider `clamp`, `mix`, and mixed scalar/vector edge or `min`/`max` forms only with a new GLSL/WGSL common-subset matrix. `mix`'s interpolation-factor rules must be checked on both targets. These are _not_ prerequisites for the eleven names above.
- **Vector composition:** Add narrowly specified forms such as `vec3(Vec2, F32)` and `vec4(Vec3, F32)` with original-range diagnostics and type/checker/core/backend parity; do not silently enable arbitrary packing.
- **Comparisons and selection:** Design scalar `F32` comparisons yielding a shader boolean, then same-type selection arms. Decide `&&`/`||`/`!`, scalar versus vector conditions, and especially **eager versus lazy arm evaluation** before choosing GLSL/WGSL lowering; WGSL has no source-style `?:` expression. General `if` statements and loops remain deferred.
- **Resources and stages:** Custom uniforms, textures/samplers and additional shader stages need host-facing binding/layout and runtime design. Do not bundle them into this math-builtin PR.

The project-aware LSP is a prerequisite for **testing across projects**, not a new semantic engine for these language changes.
