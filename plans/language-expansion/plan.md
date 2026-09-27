# Shdr language expansion — plan

Status: proposed; start after the [project-aware LSP](../_completed/lsp-discovery/plan.md) is reviewed. Expand the language in **small, separately reviewable slices**, not one broad collection of JavaScript or shader builtins. The [existing arithmetic/vector contract](../_completed/next-milestone/language-slice.md) and [public language reference](../../README.md#accepted-shader-language) remain the baseline. Stop for review at each slice's gate.

## Goal and invariants

Make useful fragment effects possible without abandoning native shader operators, original-source diagnostics, the restricted `createFragmentShader` callback, or **one target-neutral IR** generating GLSL ES 3.00 and WGSL. TypeScript 7 editor checking, core lowering and the CLI must agree on accepted forms and source ranges; both targets must implement the same semantics. Add explicit named imports from `"shdr"`, not arbitrary `Math.*`, JavaScript evaluation, ambient global functions or a pass-through to whichever target accepts a call.

A motivating example for the first slice (proposed, **not yet supported**):

```ts
import { createFragmentShader, sin, smoothstep, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const wave = sin(uniforms.time + coord.x * 0.02);
  const band = smoothstep(-0.2, 0.2, wave);
  return vec4(band, band, band, 1);
});
```

## Slice 1 — `sin`, `cos`, `smoothstep`

### 1.1 Lock the semantic contract and target feasibility

- Start with **scalar** signatures: `sin(F32) -> F32`, `cos(F32) -> F32`, and `smoothstep(F32 edge0, F32 edge1, F32 x) -> F32`. `F32` here means a Shdr expression, including numeric literals inside the callback. Vector forms are **not implied** by these signatures; decide them in a later, explicit matrix after checking both targets. Wrong arity, wrong types, aliases, namespace calls and `Math.sin` must not become valid by accident.
- Define the allowed import/call spellings, result hovers, and diagnostic codes/messages/ranges for unsupported signatures and malformed calls. Specify `smoothstep`'s edge precondition (`edge0 < edge1`) and what is and is not statically validated; avoid promising portable results when it is violated. Confirm numeric precision/behavior and that each selected signature compiles in **both** GLSL ES 3.00 and WGSL with raw target fixtures before expanding public DSL types.

**Gate:** reviewed overload/diagnostic table, positive and negative examples, and target compilation/validation tests. If a rule cannot be implemented faithfully in both targets, narrow the contract.

### 1.2 Implement the same rules in all paths

- Add public `shdr` types/markers, virtual TypeScript 7 signatures and mapped calls, source parser/validator and semantic typing. Lower to an explicit typed builtin-call IR (or equivalently exhaustive target-neutral node), then emit the two target builtin spellings. Keep ordinary code outside shader callbacks unchanged; never expose virtual helpers or generated offsets in errors.
- Test each accepted call and rejected arity/type/import form against both TypeScript 7 and core, including nested calls, literals, unary minus and an invalid inner argument. Preserve original-source ranges, deterministic IR/generation and shader/ordinary TypeScript diagnostic routing. Verify the motivating shader through `shdr check`, both generators, WebGL render/pixel checks and WGSL/WebGPU validation; exercise Vite/REPL and real editor hovers/diagnostics where applicable.

**Gate:** build/check/tests/CI and real-editor checks pass, with TypeScript/core parity and both browser targets. Keep the first PR limited to this coherent scalar slice; no comparisons or conditionals.

## Slice 2 — Selected additional math, not an open-ended library

- Consider `clamp` and `mix` next, plus vector overloads of `sin`, `cos` and `smoothstep` **only after** a reviewed GLSL/WGSL common-subset matrix. Specify each operand's exact scalar/vector type and result; do not infer broadcasts or mixed dimensions from one target's permissiveness. In particular, confirm `mix`'s interpolation-factor signatures in both targets before admitting scalar-factor/vector-value forms.
- Keep undefined or edge-case behavior (for example, reversed/equal `smoothstep` edges) explicit. Add `abs`, `floor`, `fract`, `min`, `max`, `dot`, `length` or `normalize` later according to real example needs rather than automatically accepting every target builtin.

**Gate:** a separate reviewed rule table followed by the same virtual TypeScript/core/IR/two-target parity and source-diagnostic tests as Slice 1. Ship only signatures proven in both targets.

## Subsequent independent slices

1. **Vector composition:** Add narrowly specified missing constructor forms such as `vec3(Vec2, F32)` and `vec4(Vec3, F32)` with original-range diagnostics and parity across public types, virtual checking, core and both generators. Do not silently enable arbitrary mixed packing.
2. **Comparisons and selection:** Design scalar `F32` comparisons yielding a shader boolean, then conditional selection with same-type result arms (for example, a threshold choosing between two `Vec4` values). Decide `&&`/`||`/`!`, scalar versus vector conditions, and especially **eager versus lazy arm evaluation** before choosing GLSL/WGSL lowering; WGSL has no source-style `?:` expression. This is a separate design and PR, not a consequence of adding math builtins. General `if` statements and loops remain deferred.
3. **Resources and stages:** Custom uniforms, textures/samplers and further shader stages need host-facing binding/layout and runtime design. Do not bundle them into the expression-language slices.

At every gate, update the standalone language reference and valid/invalid shader examples, test original-source diagnostics in CLI and editors without claiming CLI checks ordinary TypeScript, and run both backend and browser checks. The project-aware LSP work is a prerequisite for **testing across projects**, not a new semantic engine for these language slices.
