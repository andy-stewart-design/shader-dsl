# Square f32 matrices specification

## Status

- Readiness: **Ready for planning**. This is a behavioral contract, not an implemented-feature claim or permission to implement.
- Blocking decisions: None. Raw-target feasibility and rendered acceptance remain unverified implementation gates.
- Source: The matrix-support discussion and `grill-me` interview in this conversation, including the final agreement to native arithmetic with limited constructor lowering. [The language-extension roadmap](../language-exntesion.md#pr-8--minimal-mat2-values-and-multiplication-not-implemented) supplies the historical `mat2` reference-port motivation; this specification deliberately broadens square sizes, not the entire GLSL matrix language. The [accepted language reference](../../README.md#accepted-shader-language) supplies compatibility constraints.

## Problem and intended outcome

Shader authors currently have to expand matrix transformations into scalar/vector formulas. The reference sketches motivate `mat2`, but introducing matrices crosses the same public-type, compiler, helper, editor, and backend boundaries for all square sizes.

Authors should be able to construct, pass, return, apply, and compose square f32 matrices of sizes 2, 3, and 4 in source-only Shdr code. One authored expression must have the same shape and mathematical meaning on WebGL and WebGPU, with original-source diagnostics for invalid combinations. This delivers reusable matrix values, not a commitment to arbitrary GLSL or completion of the reference ports.

**Central invariant:** matrix size and multiplication direction survive every layer; backend generation must not transpose, reorder, componentwise-multiply, or silently resize a matrix operation. Existing scalar/vector behavior and artifact/runtime boundaries remain unchanged.

## Scope

Included:

- Square f32 matrix expression types for sizes 2, 3, and 4.
- Column-major construction from a diagonal scalar, explicit scalar coefficients, complete column vectors, or a same-size matrix copy.
- Local values, helper parameters, and inferred or explicitly annotated helper returns, including existing named imported helpers.
- Native matrix/vector and matrix/matrix products, matrix addition/subtraction, and scalar multiplication in both orders, as enumerated below.
- Public typing, core semantics and diagnostics, GLSL ES 3.00/WGSL generation, TypeScript 7 editor parity, existing consumer integrations, documentation, and real rendered acceptance together.

Non-goals:

- Matrix division in any operand order, unary matrix negation, or additional general scalar/vector arithmetic signatures.
- Matrix uniforms, host matrix representations/uploads, rectangular matrices, other numeric kinds, or new shader stages.
- Authored matrix indexing, properties/swizzles, mutation, arrays, matrix-size conversions, or arbitrary constructor packing.
- Matrix builtins such as transpose, inverse, determinant, outer product, componentwise multiplication, or matrix overloads for existing math builtins.
- Module captures, new control flow, recursion, interprocedural numeric proofs, or execution of authored JavaScript.
- Completing reference ports, changing coordinate conventions, claiming original-reference fidelity, bit-identical GPU results, or broad performance guarantees.

## Current behavior and evidence

The following are static source observations, not newly executed verification:

- `packages/shdr/src/types.ts` admits `F32` and Vec2/3/4 shader values. `dsl.ts` and `index.ts` expose vector constructors but no matrix constructors/types. `operators.ts` supplies concrete internal operator signatures for editor checking.
- `packages/core/src/shader-type.ts` has scalar/vector numeric value types. `shader-ir.ts` admits only vector constructor names. Existing typed calls, local references, function parameters, and returns provide expression/value seams to extend.
- `packages/core/src/lower-shader-syntax.ts` shares a scalar/vector result rule for `*` and `/`. Its constructor, type-equality, swizzle, and unary rules do not yet establish the matrix boundary in this specification.
- `parse-shader-functions.ts` accepts scalar/vector `Expr` annotations; `lower-shader-functions.ts` compares annotated vector return sizes. Matrix parameters and return annotations require equally strict size compatibility.
- `evaluate-shader-constant.ts` evaluates existing binary arithmetic componentwise. Applying that rule to a matrix product would be incorrect; this feature must not fabricate componentwise product constants.
- The GLSL/WGSL expression and fragment generators emit typed local/helper values. `packages/core/test/grouping-render-parity.test.ts` demonstrates an existing real-browser WebGL/presented-WebGPU verification seam; runtime has sibling math verifiers. These files establish available patterns, not matrix acceptance evidence.
- `apps/vite-basic/src/references/circles-circling.frag`, `infinite-squircle.frag`, and `moby-gradient.frag` use `mat2`, including both multiplication directions and a matrix-returning helper. The squircle's asymmetric coefficients must not be replaced with a conventional rotation if later ported.
- The [WGSL arithmetic specification](https://www.w3.org/TR/WGSL/#arithmetic-expr), consulted during the interview, enumerates native matrix addition/subtraction and products, but not matrix division or unary matrix negation. The agreed boundary omits those operations rather than synthesizing them. Constructor normalization is an explicit exception, not a general native-WGSL-only authoring rule.

No implementation checks or browser probes were run to author this specification. All acceptance criteria below describe future verification.

## Requirements and invariants

- **R1 — Concrete matrix values:** All three square sizes are distinct f32 shader value types, usable in supported local/helper positions. They are neither vectors nor resources. Core represents column and row counts independently, while this slice accepts only equal counts in `2 | 3 | 4`. Public types, core types, and editor inference must agree without a permissive overload that accepts excluded combinations.
- **R2 — Exact construction boundary:** Accept exactly the four constructor families below, with column-major coefficients, diagonal scalar semantics, size-preserving copies, and no implicit size conversions or general packing.
- **R3 — Exact arithmetic boundary:** Accept exactly the new operator families below at matching dimensions. Preserve matrix/vector direction and use linear-algebra products rather than componentwise multiplication. Existing scalar/vector arithmetic remains unchanged.
- **R4 — Helper compatibility:** Matrices may cross existing local and named imported helper boundaries transitively. Arguments and annotated returns must match both value kind and size; inferred matrix returns retain their concrete size. Existing capture, recursion, import, and fragment-return rules stay intact.
- **R5 — Numeric and evaluation integrity:** Preserve f32 expression grouping and authored argument occurrences during lowering. Constant analysis must not treat matrix products as componentwise operations or invent target-exact values. Ordinary finite inputs with representable intermediates/results have tolerance-consistent mathematical behavior; no universal overflow, subnormal, signed-zero, or bit-identity promise is introduced.
- **R6 — Source-owned failures:** Invalid constructors, operations, helper signatures, and excluded matrix uses fail through source-located diagnostics, not a backend-only type failure or compiler exception. An invalid compilation produces no usable candidate artifact. Existing invalid-edit recovery and backend failure reporting remain unchanged.
- **R7 — Dual-target and tooling parity:** Every accepted family works through the shared compiler, CLI, Vite static imports, browser compiler/REPL, and existing TypeScript 7 editor paths. Editor types and diagnostics refresh on unsaved edits and identify authored locations. Neither target may independently widen the accepted language.
- **R8 — Compatibility and isolation:** No new artifact fields, host inputs, uniform/resource slots, runtime matrix API, or renderer state transitions are introduced. Preserve scalar/vector signatures, existing math domains, coordinate conventions, safe names, module semantics, runtime defaults/updates, and compiler exclusion from static artifact consumers. Compilation must not execute authored code.
- **R9 — Evidence and documentation:** Completion requires real WebGL and presented-WebGPU evidence covering all sizes, both vector multiplication directions, and matrix composition, plus coverage of every accepted constructor/operator family. Publish the accepted and rejected boundary accurately; record inputs, tolerances, actual environment, and unavailable capabilities without claiming completed reference ports.

## Behavior and contracts

### Internal shape boundary

Represent core matrix shape with separate `columns` and `rows` counts, rather than one square-only size field. Type equality compares both counts, component counts derive from `columns * rows`, and constructor/type emission derives from the explicit shape. This is an internal extensibility constraint agreed after the initial planning discussion; it does not add a public generic matrix API.

All source constructors, helper annotations, and operations in this slice still admit only square shapes with equal counts in `2 | 3 | 4`. Keep the public `Mat2`/`Mat3`/`Mat4` types unchanged. Do not implement rectangular constructor signatures, multiplication compatibility, or rendering support ahead of a separate contract. Internal shape utilities may be unit-tested with unequal synthetic dimensions without admitting those shapes as shader source or claiming rectangular target support.

### Authoring types and imports

Use the existing compile-only `shdr` import model. The selected API defaults are `Mat2<F32>`, `Mat3<F32>`, `Mat4<F32>` and constructor functions `mat2`, `mat3`, `mat4`; their inferred-default status is recorded under Assumptions.

For the rest of this contract:

- `N` is one fixed size in `2 | 3 | 4`.
- `S = Expr<F32>`.
- `VN = Expr<VecN<F32>>` and `MN = Expr<MatN<F32>>`.
- Every occurrence of `N` within a signature means the same dimension.

Matrix expressions have no authored component accessors. The generic-looking public spelling does not admit non-f32 kinds, dynamic dimensions, rectangular shapes, or an untyped matrix escape hatch. Numeric literals use existing shader f32 normalization, not host-side matrix execution.

Constructors must be directly imported by their exact names, as with vector constructors. Existing alias/namespace restrictions and `.shdr.ts` graph ownership remain unchanged. Shader-local declarations continue to use inferred `const` types; supporting helper annotations does not introduce local variable annotations.

### Constructor families

Each constructor returns `MN` and accepts exactly these families:

| Family                | Arguments                          | Meaning                                                                                                                                                      |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Diagonal              | One `S`                            | All diagonal entries equal the scalar; every off-diagonal entry is zero. `matN(1)` is identity and `matN(0)` is the zero matrix. This is not a scalar splat. |
| Explicit coefficients | Exactly `N * N` scalar expressions | Consecutive groups of `N` coefficients form columns, in column order.                                                                                        |
| Columns               | Exactly `N` expressions, each `VN` | The arguments are complete columns in order.                                                                                                                 |
| Copy                  | One `MN`                           | Preserve the value and size.                                                                                                                                 |

There are four families per size, twelve concrete constructor signatures. Examples:

```ts
mat2(1);
mat2(1, 2, 3, 4);
mat2(vec2(1, 2), vec2(3, 4));
mat2(existingMat2);
mat3(vec3(1, 2, 3), vec3(4, 5, 6), vec3(7, 8, 9));
mat4(1);
```

`mat2(1, 2, 3, 4)` represents rows `(1, 3)` and `(2, 4)`. The same column order applies at all sizes.

Zero arguments do not imply identity or zero. Reject wrong counts, arrays/spreads, mixed scalar/vector packing, wrong-size columns, vector-to-matrix one-argument forms, and copies from a different matrix size. A negative scalar argument such as `mat2(-1)` is valid; it is not unary negation of a matrix.

### Operators and mathematical meaning

The following are the only newly accepted operator signatures:

| Expression | Result | Meaning                                              |
| ---------- | ------ | ---------------------------------------------------- |
| `MN + MN`  | `MN`   | Componentwise matrix addition.                       |
| `MN - MN`  | `MN`   | Componentwise matrix subtraction.                    |
| `MN * S`   | `MN`   | Scale every matrix coefficient.                      |
| `S * MN`   | `MN`   | Scale every matrix coefficient.                      |
| `MN * VN`  | `VN`   | Matrix times column vector.                          |
| `VN * MN`  | `VN`   | Row vector times matrix.                             |
| `MN * MN`  | `MN`   | Linear-algebra matrix composition in authored order. |

There are seven families per size, twenty-one new binary signatures. For zero-based row/column indices, write `A[r,c]` as mathematical notation only; authored indexing remains unsupported:

- `(A * v)[r] = sum over c of A[r,c] * v[c]`.
- `(v * A)[c] = sum over r of v[r] * A[r,c]`.
- `(A * B)[r,c] = sum over k of A[r,k] * B[k,c]`.

For example, with `A = mat2(1, 2, 3, 4)` and `v = vec2(5, 6)`, `A * v` is `(23, 34)` while `v * A` is `(17, 39)`. These results must remain distinguishable. With `B = mat2(2, 0, 1, 3)`, `A * B` is `mat2(2, 4, 10, 14)` and `B * A` is `mat2(4, 6, 10, 12)`.

Do not add matrix/scalar addition or subtraction, matrix/vector addition or subtraction, mixed matrix sizes, or mismatched matrix/vector products. All `/` forms involving a matrix and unary `-MN` are rejected even where GLSL permits them. Authors can write `MN * -1` for negation. Supporting `S * MN` does not make the currently rejected scalar-left vector multiplication valid.

Matrices remain excluded from all existing math builtins, including `mix`, `clamp`, and `dot`; those functions do not acquire matrix overloads by virtue of accepting a generalized shader value type.

### Locals, helpers, and fragment results

A matrix constructor or operation may initialize a shader-local `const`, be passed to an existing helper, or be returned by a helper. Helper parameters may use `Expr<MatN<F32>>`; helper matrix returns may be inferred or annotated with that type. Annotation/call compatibility checks size as well as matrix kind, including transitive and named imported helper calls.

The fragment itself must still return `Expr<Vec4<F32>>`. A matrix return from a helper is not permission for the fragment's final return to be a matrix. Module captures, arbitrary JavaScript calls, recursion, and nested helper definitions remain excluded.

### Target lowering and numeric boundaries

GLSL uses `matN` and WGSL uses `matNxN<f32>` values, including typed locals and helper boundaries. The listed arithmetic operations use their native matrix meaning on both targets. No scalar expansion may replace a native product with a different algebraic operation, reassociate products, commute operands, or substitute a standard rotation for authored coefficients.

Constructor normalization may group scalar arguments into columns, expand a diagonal scalar with off-diagonal zeros, or eliminate a same-size copy. It must preserve each authored argument occurrence without duplicating that expression in generated evaluation. This is an evaluation-integrity requirement, not a new guarantee about relative argument evaluation order. Generated helpers/temporaries, if used, are internal and collision-safe; they do not enable authored branching, mutation, indexing, or JavaScript evaluation.

Constructors and arithmetic follow existing f32 literal validation and numeric limitations. Out-of-range literals retain `SHDR1211` at the literal. No general matrix overflow/domain prover is required. In particular, matrix products may remain unknown to local constant/domain analysis rather than being approximated with JavaScript arithmetic or a presumed GPU accumulation order. Existing scalar/vector domain checks must not regress; a dynamic or conservatively unknown product passed into a domain-sensitive builtin leaves that builtin's preconditions with the caller.

Raw-target acceptance, including constant-valued and helper/dynamic-valued expressions, must be established rather than inferred from specification spelling. Backend-only failure for ordinary valid finite cases is not an acceptable implementation of an advertised signature. If feasibility contradicts this contract, report it for review rather than silently narrowing the language. Extreme arithmetic does not gain finite-result guarantees merely because its literals are finite.

### Validation and failure behavior

Use the existing diagnostic taxonomy. The specific mapping below is a selected default, not an additional user-approved product decision:

| Authored failure                                                  | Diagnostic / location                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Unsupported matrix constructor count or argument shapes           | `SHDR1206`, whole original constructor call.                                     |
| Unsupported binary matrix operation or incompatible dimensions    | `SHDR1205`, whole original binary expression.                                    |
| Unary matrix negation                                             | `SHDR1105`, whole original unary expression, with a matrix-specific explanation. |
| Matrix property/swizzle such as `M.xy`                            | `SHDR1204`, authored property name.                                              |
| Matrix indexing such as `M[0]`                                    | Existing `SHDR1107`, authored access expression.                                 |
| Existing math builtin given a matrix                              | `SHDR1208`, whole original builtin call.                                         |
| Helper argument kind/size mismatch                                | Existing `SHDR1213`, whole original helper call.                                 |
| Helper annotated return mismatch, or final fragment matrix return | Existing `SHDR1207`, original returned expression.                               |

Unsupported imports, invalid helper annotations, captures, assignments, invalid literals, and invalid inner expressions retain their existing more-specific diagnostics/ranges. An inner failure must not be obscured by a fabricated outer matrix mismatch. Messages describe matrices as matrices with their actual size, not as scalar/vector/texture fallbacks. TypeScript 7 messages need not be text-identical to core messages, but must agree on acceptance and remain mapped to original source.

A source error produces no usable candidate artifact. The REPL retains its last successful render under its existing invalid-edit behavior. Genuine GPU/backend failures remain backend failures, not invented original-source type diagnostics. This feature adds no cancellation, permissions, persistence, or renderer lifecycle states.

## Ownership and boundaries

The `shdr` package owns compile-only public types and constructor/operator signatures. Core owns target-neutral matrix shape/meaning, strict compatibility, source diagnostics, conservative analysis, and both target outputs. Editor and CLI/Vite/browser integrations present that shared contract rather than inventing alternate matrix signatures or runtime fallbacks.

Renderers continue consuming existing JSON artifacts and supplying existing uniforms/resources. They neither execute matrices in host JavaScript nor acquire matrix upload responsibilities. Existing scalar/vector uniforms may supply constructor coefficients without becoming matrix uniforms. Backend-private lowering must not leak into public artifact metadata or bring compiler code into static runtime consumers.

## Acceptance criteria

All verification approaches below are proposed obligations, not recorded results.

| ID   | Requirement(s) | Starting condition / action                                                                                                                                                                                         | Expected outcome                                                                                                                                                                                                                                             | Verification approach                                                                                                                     |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | R1, R2, R7     | Author all four constructor families at each of N=2/3/4, including asymmetric columns and a same-size copy of a helper result.                                                                                      | Exactly twelve constructor signatures infer the corresponding `MN`; public types, core, editor, and both targets agree. Core shape metadata retains separate column/row counts, and shape equality distinguishes a change to either count.                                                                                                                                      | Public type/core/editor fixtures and real target compilation.                                                                             |
| AC2  | R2, R6, R7     | Try zero arguments, too few/many coefficients, mixed packing, arrays/spreads, wrong-size columns, `mat3(mat2(1))`, and `mat2(vec2(1))`.                                                                             | No excluded form is admitted. Shape/count errors use `SHDR1206`; syntax-boundary errors retain specific existing diagnostics. No usable artifact is produced.                                                                                                | Negative type/core/editor cases with original-range assertions.                                                                           |
| AC3  | R2, R5, R9     | Apply diagonal matrices made from 0, 1, and a non-unit dynamic scalar to non-uniform vectors at every size; compare flat and column constructors for the same asymmetric matrix.                                    | Zero, identity, and scaling are observable; off-diagonal entries are zero. Flat and column construction agree without transposition or scalar splatting.                                                                                                     | Generated-expression inspection plus finite numeric/rendered browser cases.                                                               |
| AC4  | R1, R3, R7     | Author all seven operator families at N=2/3/4 in fragments and representative helpers.                                                                                                                              | Exactly twenty-one new binary signatures infer the stated matrix/vector result size and generate both targets.                                                                                                                                               | Public type/core/editor coverage and real target compilation.                                                                             |
| AC5  | R3, R5, R9     | Apply asymmetric N=2/3/4 matrices to non-uniform vectors in both directions and compose noncommuting matrix pairs.                                                                                                  | Direction and composition order match the equations above, including the specified 2x2 examples. Matrix products are not componentwise products.                                                                                                             | Numeric expectations encoded visibly without output clipping, with real WebGL and presented-WebGPU comparisons.                           |
| AC6  | R3, R6, R8     | Try mismatched sizes, matrix/vector addition, matrix/scalar addition, all matrix division orders, `-M`, matrix swizzles/indexing, and existing math calls receiving matrices. Also try currently rejected `S * VN`. | Matrix exclusions fail at authored locations under the diagnostic contract; scalar-left vector multiplication remains rejected. `M * -1` remains valid.                                                                                                      | Negative public/core/editor cases and unchanged-language regression fixtures.                                                             |
| AC7  | R1, R4, R6, R7 | Pass and return matrices through local and named imported helpers, with inferred and annotated returns; change a parameter or return annotation from Mat2 to Mat3.                                                  | Valid transitive helpers retain exact dimensions. Argument and annotated-return mismatches fail at original source locations, including imported files.                                                                                                      | Core graph, public-type, and editor tests with unsaved edits.                                                                             |
| AC8  | R4, R6, R8     | Return a matrix directly from a fragment, capture a module value, recurse, or attempt matrix mutation/uniform declaration; compare with a valid helper-returning-matrix shader.                                     | Helper matrix values are allowed without widening fragment return, capture, recursion, mutation, or uniform rules. Existing specific failures remain source-owned.                                                                                           | Negative core/integration fixtures and uniform/artifact type checks.                                                                      |
| AC9  | R2, R5, R8     | Construct a diagonal matrix from a nested helper call and use nested/grouping-sensitive matrix expressions with collision-prone local names.                                                                        | Lowering does not duplicate authored arguments, reorder/group products differently, or collide with user names. Helper/local types are correct on both targets.                                                                                              | IR/generated-source inspection and grouping-sensitive target/rendered fixtures.                                                           |
| AC10 | R5, R6, R8     | Analyze a known matrix product whose componentwise result differs from its algebraic result, including a vector result feeding domain-sensitive math; also use an overflowing source literal.                       | Analysis reports a mathematically justified value or unknown, never a fabricated componentwise constant or false domain proof. Existing literal errors retain `SHDR1211` and original ranges.                                                                | Focused constant/domain/core tests and existing math regression cases.                                                                    |
| AC11 | R5, R7, R9     | Compile every constructor/operator family with ordinary constant inputs and representative dynamic/helper inputs in both targets.                                                                                   | Advertised valid finite cases compile on real WebGL 2 and WebGPU, without missing native forms, incorrect helper types, or backend-only constant-evaluation rejection.                                                                                       | Raw feasibility probes followed by generated-shader browser compilation.                                                                  |
| AC12 | R3, R5, R9     | Render pinned, asymmetric N=2/3/4 cases covering all new arithmetic families; update an existing scalar/vector uniform used to construct a matrix and draw again.                                                   | Both browser paths produce finite, mathematically expected, tolerance-consistent pixels before and after update. Evidence exposes direction/transpose/composition mistakes rather than hiding them at center pixels or through clipping.                     | Real WebGL readback and presented-WebGPU capture; record multiple samples, inputs, tolerances, environment, and unavailable capabilities. |
| AC13 | R6, R7, R8     | Compile matrix shaders through CLI, static Vite import, and browser/REPL; edit between valid and invalid matrices and inspect TypeScript 7 hovers.                                                                  | Acceptance and concrete types agree across paths, diagnostics refresh at authored ranges, and invalid REPL edits retain the previous successful render. Existing single-textarea external-import restrictions and ordinary `.ts` ownership remain unchanged. | Integration/editor-adapter fixtures and browser REPL checks.                                                                              |
| AC14 | R8, R9         | Use matrices alongside old math, helpers, custom uniforms, and textures; inspect resulting artifacts/static consumers and the published language documentation.                                                     | Artifact shape, bindings, coordinates, defaults/updates, old accepted/rejected signatures, and compiler isolation remain unchanged. Documentation lists the new boundary and exclusions without claiming full GLSL support or completed reference ports.     | Compatibility/artifact/bundle checks and documentation review.                                                                            |

## Assumptions

These are implementation-ready defaults from the interview wrap-up, not separately user-approved decisions or verified runtime facts:

- **A1 — Public API shape:** `MatN<F32>` and `matN` follow existing `VecN<F32>`/`vecN` naming and branding. Validate against public declarations and editor inference; do not replace them with a host matrix object or third-party math dependency.
- **A2 — Constructor enumeration:** Complete column vectors, explicit coefficients, and same-size copy accompany the expressly discussed diagonal constructor. This avoids arbitrary packing while matching vector-style authoring. Validate all twelve concrete signatures and negative shapes in the feasibility/type checks.
- **A3 — Diagnostic reuse:** Existing codes/range conventions suffice, including `SHDR1105` for rejected unary matrix negation. Validate core/editor routing; exact wording is not fixed beyond accurate type/size explanations.
- **A4 — Delivery evidence:** Dedicated fixtures suffice; a full reference port is not a release gate. Software-GPU browser paths may provide evidence if their environment is stated, consistent with existing suites; they are not hardware-wide precision/performance claims.
- **A5 — No architectural migration:** Existing source-only helper/module, virtual-source editor, JSON artifact, and runtime seams suffice. Validate through integration coverage; inconvenience alone does not justify new runtime fields or host matrix APIs.

## Risks and open decisions

- **Blocking:** None at specification handoff. Target feasibility is unverified; any contradiction that would change advertised behavior must be surfaced before the affected work proceeds.
- **Non-blocking orientation risk:** Identity and symmetric rotations can hide transposition and reversed direction. Use asymmetric coefficients, non-uniform vectors, and noncommuting pairs at every size.
- **Non-blocking analysis risk:** Existing scalar/vector-only helpers may assume every nonscalar is a vector, or compare only value kind. Matrix size equality and conservative product analysis require explicit coverage, including negative cases.
- **Non-blocking lowering risk:** A diagonal scalar must not be duplicated merely because it fills multiple entries. Helper/temporary strategy is an implementation choice subject to R5, not additional public syntax.
- **Non-blocking numerical risk:** Native products may differ in accumulation details; extreme finite inputs may overflow and 8-bit pixels can hide differences. Use bounded expected values, independently justified numeric expectations, and explicit tolerant comparisons without new exact-accumulation guarantees.
- **Non-blocking scope risk:** Historical roadmap text says only `mat2`, and current language docs reject matrices. This spec governs the proposed expanded slice; update delivered-language claims only when acceptance is established, not merely because the spec exists.

## Deferred work

- Matrix uniforms and host layout/upload APIs, only when a concrete host-controlled transformation requires them.
- Rectangular matrices, indexing/read access, mutation, additional constructor packing, and size conversions, only under separately enumerated contracts.
- Matrix division and unary negation, if the native-target boundary is deliberately revisited; neither is an implicit follow-on requirement.
- Matrix-specific builtins and overloads for existing builtins, with their own numeric/target contracts.
- Reference translations and fidelity evidence, including coordinate decisions, reversed `smoothstep` rewrites, and preservation of unusual authored coefficients.
- Interprocedural constant/domain proofs and hardware-wide performance or bit-identity studies.
