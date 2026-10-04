# Follow-up notes

Status: candidates for future, separately reviewed work—not commitments or a single PR. The current [language reference](../README.md#accepted-shader-language) defines what Shdr actually supports. For each language addition, agree on f32 signatures and source diagnostics first, then verify public types, the TypeScript 7 editor adapter, core/IR, both generated targets, and representative browser/editor behavior. Do not infer support from a raw GLSL or WGSL example alone.

## Next steps (not necessarily in priority order)

### Language extension: additional builtins

The complication is choosing a shared GLSL/WGSL contract, not merely adding names to the compiler:

- **mix** — Both targets support a scalar blend factor for vector inputs. We’d need overloads for that as well as same-shape vectors. GLSL also has a boolean-mask form, which is outside Shdr’s current value types. [GLSL](https://docs.gl/el3/mix) · [WGSL](https://www.w3.org/TR/WGSL/#mix-builtin)
- **clamp** — Bound ordering needs a policy: WGSL rejects constant low > high at shader creation, while GLSL leaves results undefined for low >= high. GLSL also offers scalar bounds for vectors; WGSL’s builtin requires matching shapes. [GLSL](https://docs.gl/el3/clamp) · [WGSL](https://www.w3.org/TR/WGSL/#clamp)
- **step** — GLSL accepts a scalar edge with a vector input; WGSL requires matching shapes. We’d either exclude step(0.5, uv) or generate a vector edge for WGSL. No smoothstep-style edge-order issue. [GLSL](https://docs.gl/el3/step) · [WGSL](https://www.w3.org/TR/WGSL/#step-builtin)
- **pow** — Signatures are straightforward, but the numerical contract isn’t: negative bases are outside the portable domain, and GLSL also leaves pow(0, y) undefined for y <= 0. We’d decide which known-invalid calls to diagnose versus document as runtime preconditions. [GLSL](https://docs.gl/el3/pow) · [WGSL](https://www.w3.org/TR/WGSL/#pow-builtin)

Keep the first pass to explicit f32 signatures. In particular, decide `clamp` bound ordering and `pow` invalid-domain handling before adding diagnostics or generated-code helpers; test scalar and vector forms in both targets.

### Language extension: comparisons and selection

- Design scalar `F32` comparisons yielding a shader boolean, then selection with same-type arms. Specify how boolean values may be used inside callbacks without introducing arbitrary JavaScript execution.
- Decide `&&`/`||`/`!`, scalar versus vector conditions, and especially **eager versus lazy arm evaluation** before choosing GLSL/WGSL lowering; WGSL has no source-style `?:` expression.
- Defer general `if` statements and loops until a static shader control-flow model is specified. Cover short-circuit behavior, nested diagnostics, and both backends before admitting either.

### Language extension: vector composition

- Add narrowly specified forms such as `vec3(Vec2, F32)` and `vec4(Vec3, F32)` with original-range diagnostics and public-type/editor/core/backend parity; do not silently enable arbitrary packing.

### Browser runtime API

- Design a supported way to compile, bind, draw, update, and dispose a Shdr shader in the browser. Decide whether one facade over WebGL 2 and WebGPU is honest or separate target-specific functions are clearer; `createProgram` is only a working name. Specify canvas sizing, existing default uniforms, errors, and ownership/lifetime.
- Agree on the host-facing binding/update model before implementing custom resources. The current REPL and Vite fixture are demonstrations, **not** a reusable runtime API; this design need not block unrelated language work.

### Transparent canvas output (after the opaque runtime v1)

- The [runtime v1 contract](./runtime-api/spec.md) deliberately uses opaque WebGL/WebGPU canvases: shader alpha is still computed, but it does not make the canvas translucent over the page. Treat transparency as a separately reviewed runtime feature, not an implicit consequence of returning `vec4` with alpha below 1.
- Specify straight versus premultiplied alpha, canvas configuration, blending/compositing and color-space expectations across both backends. Test alpha below 1 against a visible page background and through pixel readback on real WebGL and WebGPU paths before claiming transparent output. Keep this independent of custom-uniform and texture work.

### Custom uniforms

- Define the source types, host-side value/update API, binding names/layout, defaults, and lifetime for both targets. Preserve the existing resolution/mouse/time semantics and test binding behavior, not just generated declarations. Start with a small f32/vector subset; arrays or structured buffers need separate review.

### Textures and samplers

- Specify source types and sampling calls alongside host-side texture/sampler creation, binding, upload, and disposal. Choose explicit coordinate origin, image orientation, color-space/format, and sampler-state conventions; test real samples on both runtimes. This is a resource/runtime design milestone, not a parser-only addition.

### Composable shader utility functions

- Specify how explicitly declared/imported shader functions can be called inside `createFragmentShader` without executing arbitrary outer TypeScript or allowing closure captures. Decide typed parameters/returns, recursion and call-graph restrictions, naming, and how definitions enter target-neutral IR and both generated modules. Retain original-source diagnostics across function boundaries.

### REPL: WebGPU rendering

- Go beyond WGSL module validation: bind the existing uniforms, create a WebGPU pipeline, draw, and read representative pixels. Compare finite inputs with WebGL using tolerances and the documented top-left coordinate convention; report unavailable adapters honestly.

---

## Proposed work prioritization

1. [x] **WebGPU pixel rendering in the REPL** and parity tests. WGSL currently validates but doesn’t render. Close that evidence gap before promising a two-target runtime.
2. [x] **Browser runtime API design**, then a minimal implementation. Define ownership, uniforms, errors, and disposal using what the REPL taught us. Keep the first API small.
3. [x] **Custom uniforms**. They depend on a host-facing binding/update contract and unlock substantially more useful shaders.
4. [ ] **Textures and samplers**. Build on the runtime and resource-binding model rather than inventing those contracts inside the language change.
5. [ ] **Small language PRs** alongside that work: vector composition first, then the most useful of mix/clamp/step/pow after a signature review. These needn’t block runtime work.
6. [ ] **Comparisons/selection**, then composable functions. Both need more semantic design than another builtin; tackle them when real shaders show which form is needed. Leave general control flow and vertex-stage authoring later.

---

## Deferred work

### Additional `min`/`max`/`smoothstep` signatures

- **`min` / `max`:** GLSL accepts `min(vector, scalar)` and `max(vector, scalar)`. WGSL requires matching shapes, so Shdr would have to splat the scalar into a vector. Decide argument order rather than implying all mixed forms work. [GLSL `min`](https://docs.gl/el3/min) · [WGSL `min`](https://www.w3.org/TR/WGSL/#min-float-builtin)
- **`smoothstep`:** GLSL accepts two scalar edges and a vector `x`. WGSL requires all three to have the same shape; supporting it needs vectorized edges and care around the existing equal-edge check/helper. [GLSL](https://docs.gl/el3/smoothstep) · [WGSL](https://www.w3.org/TR/WGSL/#smoothstep-builtin)

These are optional ergonomics, not gaps that invalidate the existing f32 subset. Require a new signature matrix and two-target tests before adopting them.

### Further language and shader stages

- Broader scalar/vector operators, conditionals beyond selection, loops, and user functions need explicit static semantics; don't treat ordinary TypeScript constructs as automatically valid shader code.
- Vertex-stage authoring and varying interfaces need stage-specific IR, type/location and interpolation rules, and a host pipeline contract. Defer until a concrete use case requires them.

### Editor hardening and distribution

- The project-aware stdio LSP and shared TypeScript 7 adapter exist; **production/distributable** editor support does not. Keep VS Code's existing provider and repo-local Zed extension separate until an integration decision warrants a change.
- Revisit diagnostic ownership in `packages/language-service/src/typescript-7-editor-adapter.ts`: the editor now shares one parse for virtual source and lowering, but still filters selected core diagnostics using builtin-specific rules to avoid conflicts with TypeScript 7. Consider making core authoritative for shader-semantic errors if this causes a user-visible mismatch or the filtering grows; keep TypeScript responsible for ordinary TS errors. Preserve original-source ranges, non-shader TypeScript diagnostics, QuickInfo, and editor/core parity; test duplicate and missing diagnostics across builtin calls, invalid domains, and custom uniforms before removing the filters. This is not a blocker for the current bug-fix pass.
- Move blocking checks off the synchronous editor/LSP path; design cancellation, superseding and incremental caching. Extend project selection to general multi-root/reference cases and unsaved files without silently checking the wrong project. Test TypeScript upgrades and real editor behavior.
- Improve Zed's limited lexical highlighting before considering semantic tokens. Package/install/update the LSP and editor integrations for projects outside this checkout; retain ordinary `.ts` ownership.

### Runtime quality, documentation, and releases

- Consider reusing a per-installed-shader CPU uniform packing array in `packages/runtime/src/webgpu.ts` instead of allocating a `Float32Array` on each draw, ideally after profiling draw-time allocations. Preserve candidate isolation during replacement and verify real presented WebGPU pixels through updates, preflight, supersession, and device loss. Offsets and total size are already computed once per installation; moving them into the validated internal schema is optional organizational work, not a prerequisite.
- Keep the existing `createWebGlRenderer` / `createWebGpuRenderer` factories and concrete classes for compatibility. If a future public API review favors exposing only factories/interfaces, make the class export change deliberately rather than as an incidental cleanup; verify typed static and dynamic imports and backend-isolated bundles.
- Map generated GLSL/WGSL errors back to original source and attribute runtime failures. Original-source **Shdr** diagnostics already have mapped ranges; that does not yet cover backend errors.
- Profile the **current** REPL compiler bundle before choosing a different browser parser; POC-era bundle measurements are historical. Maintain the language reference and fixtures, then consider an example gallery and release workflows when distribution is defined.

### Standalone TypeScript

- `shdr check` checks shader semantics; ordinary `tsc` checks ordinary TypeScript. Revisit standalone `tsc` integration only if a suitable supported content-mapping/virtual-file API is available. Do not present today's CLI as a replacement for `tsc`.
