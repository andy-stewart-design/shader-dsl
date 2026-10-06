# Code quality 001: readable generated shader code

## Status and goal

Specification for a separate, output-only change after PR 3. Make GLSL ES 3.00 and WGSL easier to inspect by using authored local names **by default** where safe and by omitting redundant parentheses. Do not change which `.shdr.ts` programs are accepted, the typed IR's meaning, bindings, runtime artifact schema, or original-source diagnostics.

For example, an authored `const inputMouse = vec2(uniforms.mouse.x, uniforms.resolution.y - uniforms.mouse.y)` should yield a GLSL declaration like:

```glsl
vec2 inputMouse = vec2(u_mouse.x, u_resolution.y - u_mouse.y);
```

WGSL should likewise use `let inputMouse: vec2<f32> = ...`. Exact uniform syntax, float suffixes, and target-specific splats/helpers remain target-specific. For an ordinary local swizzle/multiplication, prefer `inputMouse.x * gain` over `((shdr_local_5).x * shdr_local_6)`.

## Decisions and boundaries

1. **Readable names are the default**, not an opt-in mode. Choose one emitted name per local symbol for the whole module, and use that same choice in both targets for its declaration and every reference. The IR already records declaration/reference `name` and `symbolId`; symbol identity, not string substitution, remains authoritative. Do not rename generated uniforms, entry points, helper functions, or custom-uniform bindings as part of this change.
2. Preserve an authored name verbatim if it is a legal identifier in **both** GLSL ES 3.00 and WGSL and cannot shadow/collide with any emitted symbol or target-reserved word. Use the existing deterministic `shdr_local_<symbolId>` fallback otherwise. This is an output choice: unsafe authored identifiers must **not** become new Shdr source errors. No target may silently select a different name for the same local.
3. Make the naming decision with a module-wide prepass before emitting statements, based on the complete symbol table and generated namespace, not while emitting references. Reserve at least: target keywords and builtin/type names that could change parsing or calls; GLSL's `gl_` namespace; the internal `shdr_` namespace (including `shdr_local_N`, `shdr_coord`, fragment output, custom bindings, WGSL structs and helper names); automatic uniform names such as `u_mouse`/`u_resolution` and their WGSL equivalents; and any other generated module-scope symbol. Use a conservative common identifier subset (for example ASCII letters/underscore followed by ASCII letters/digits/underscore), with the exact target legality and reserved-word checks covered by compiler tests. Names such as `$color`, `café`, `attribute`, `shdr_local_0`, and `shdr_coord` fall back. A harmless name such as `inputMouse` stays `inputMouse`.
4. Pre-reserve _all_ possible fallback names for the module so an authored `shdr_local_1` cannot collide with another symbol's fallback. Existing Shdr duplicate-local and imported-callable rules remain unchanged. If standalone expression emission has no module naming plan, it may continue to emit ID-based fallback names; the full fragment generators must share the precomputed plan with their expression generators.
5. Emit the minimum **proven safe** grouping for the IR tree using explicit precedence/context rules shared in policy across both targets. Identifier, literal, call, and safe postfix/swizzle receivers need no blanket parentheses. Retain parentheses around a binary expression used where lower precedence would change parsing (e.g. `(a + b) * c`) and around a same-precedence **right** binary child where dropping them would change grouping (e.g. `a - (b - c)`, `a + (b + c)`, `a * (b * c)`). Preserve necessary grouping of unary operands, call arguments, and swizzle receivers; keep a conservative pair of parentheses if target syntax is uncertain. Do not flatten, reorder, or algebraically reassociate floating-point operations. Preserve WGSL scalar/vector splats and guarded-builtin/smoothstep helpers.
6. Both emitters should remain deterministic for identical IR, without mutating it. **Alpha-renaming a safe authored local will now change generated text by design**; the previous test asserting identical artifacts for every source-local spelling must be revised, not worked around. Fallback cases should remain deterministic and collision-free. Formatting is not a promise to reproduce the author's whitespace or redundant source parentheses.

## Implementation outline

- Centralize a symbol-ID-to-emitted-name plan used by `generate-glsl-fragment.ts`, `generate-wgsl-fragment.ts`, both expression emitters, and local declarations. Keep the plan target-neutral by selecting from the intersection of safe names, while preserving the current `shaderLocalName(symbolId)` fallback.
- Give expression emission parent context/precedence rather than recursively wrapping every swizzle, unary expression, and binary expression. Factor out common grouping _decisions_ if practical, but leave target spelling and WGSL splat/helper logic in the existing emitters. Do not introduce an arbitrary text postprocessor that strips parentheses from completed shader strings.
- Update output/golden assertions deliberately; no change to parser, lowerer, IR schema, diagnostic ranges, public shader API, or artifact metadata is required.

## Acceptance and review gate

- Exact-output tests show authored-name declarations/references and readable postfix/arithmetic in **both** targets, including the `inputMouse` example and a swizzle chain. Compare safe names, unsafe names, collision/fallback names, and multiple declarations with aliases. Exercise target-only reserved words, generated bindings/helpers, ASCII/Unicode/`$`, and an authored name resembling another local's fallback. The emitted mapping is unique and identical across backends.
- Grouping tests cover all supported binary operators and scalar/vector shapes, mixed precedence, left- and right-nested equal-precedence trees, unary negatives, constructors, calls, chained swizzles, WGSL splats, and helper calls. In particular preserve `a + (b + c)` and `a * (b * c)` rather than assuming associativity for f32.
- Compile generated GLSL in real WebGL 2 and create real WGSL shader modules for representative names and grouping cases, including keywords/collisions. Compare actual WebGL pixels with **presented WebGPU pixels** for non-degenerate cases, and check any sensitive grouping example against the pre-change emitted behavior where feasible. Do not infer semantic equivalence only from pretty printed strings.
- Keep original-source core/CLI/TypeScript 7 diagnostics and hovers, static Vite transforms and compiler-excluding bundles, and runtime artifact/binding behavior intact. Run workspace build, uncached checks, all tests, real VS Code UI checks, formatting, and whitespace checks. Update user-facing generated-code examples if their expected spelling changes.

## Out of scope

Renaming shader inputs or uniforms, preserving every source parenthesis, introducing user-selected backend identifiers, broadening identifier validity in Shdr, source maps for backend compiler errors, changing constant-folding/domain policy, and promising bit-identical pixels across GPU hardware.
