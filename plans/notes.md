# Follow-up notes

Status: candidates for future, separately reviewed work—not commitments or a single PR. The [language reference](../README.md#accepted-shader-language) defines what Shdr supports today; completed plans live under [`_completed/`](./_completed/). For a new language form, agree on f32 signatures and source diagnostics first, then verify public types, the TypeScript 7 editor, core/IR, both generated targets, and representative browser/editor behavior. Do not infer Shdr support from a raw GLSL or WGSL example.

## Candidate milestones (not priority commitments)

### Comparisons, selection, and control flow

- Design scalar f32 comparisons yielding shader booleans and same-type selection arms. Settle `&&`/`||`/`!`, scalar versus vector conditions, and **eager versus lazy arm evaluation** before lowering to GLSL/WGSL; WGSL has no source-style `?:` expression.
- Leave general `if` statements and loops out until a static shader control-flow and diagnostic model is specified. Do not treat ordinary TypeScript control flow as shader code by default.

### Textures and samplers

Specify shader-side types and sampling calls together with host creation, binding, upload, and disposal. Choose coordinate origin, image orientation, color-space/format, and sampler-state conventions; verify real samples on WebGL and presented WebGPU. This is a resource/runtime milestone, not a parser-only addition.

### Transparent canvas output

The [opaque runtime v1 contract](./_completed/runtime-api/spec.md) computes shader alpha but does not composite a translucent canvas over the page. Treat transparency as a separate cross-backend feature: specify straight versus premultiplied alpha, canvas configuration, blending/compositing, and color-space expectations. Test alpha below 1 against a visible page background and through pixel readback on real WebGL and WebGPU paths.

### Further reference-port vocabulary, when needed

The [language-extension roadmap](./language-exntesion.md) describes still-unimplemented candidates such as fragment derivatives, narrowly analyzed module constants, orbit/trigonometry operations (including GLSL-style `mod`), and minimal `mat2` values. Review each against a concrete reference port before committing to its scope; named shader helpers, vector packing, and the first `mix`/`step`/`clamp`/`pow` signatures are already implemented. Reversed-`smoothstep` reference behavior is not portable GLSL fidelity; agree on a defined rewrite and pinned inputs before claiming a port matches its original. Vertex-stage authoring and varying interfaces need separate stage-specific IR, type/location and interpolation rules, and a host pipeline contract.

## Optional builtin signature extensions

### Mixed scalar/vector `clamp` and `pow` signatures after PR 3

The completed PR 3 accepts only same-shape f32 scalar or vector arguments for `clamp(T, T, T)` and `pow(T, T)`. Authors can explicitly write `clamp(v, vec3(low), vec3(high))` or `pow(v, vec3(exponent))`. GLSL ES 3.00 accepts vector `clamp` with scalar bounds, but WGSL requires matching shapes; neither target natively accepts a vector base with scalar exponent for `pow`. Review a coherent signature family—operand orders, explicit target splats, component-wise domain rules, and constant diagnostics—rather than inferring a general broadcast rule. Test public types, editor/core/CLI, both generators, and real pixels. See the [completed PR 3 scope](./_completed/language-extension-first-three-plan.md).

### Additional `min`/`max`/`smoothstep` signatures

- `min`/`max` with a vector and scalar would need an explicit choice of argument order and a WGSL splat. [GLSL `min`](https://docs.gl/el3/min) · [WGSL `min`](https://www.w3.org/TR/WGSL/#min-float-builtin)
- `smoothstep` with scalar edges and vector `x` would need vectorized WGSL edges and preserve the existing equal-edge/domain policy. [GLSL](https://docs.gl/el3/smoothstep) · [WGSL](https://www.w3.org/TR/WGSL/#smoothstep-builtin)

These are optional ergonomics, not gaps in the existing f32 subset. Require a reviewed signature matrix and two-target tests before adopting them. Boolean-mask `mix` depends on an agreed shader-boolean contract; it is not part of today's scalar/vector `mix` signatures.

## Editor, runtime, and distribution follow-ups

### Editor hardening

- The project-aware stdio LSP and shared TypeScript 7 adapter exist; **production/distributable** editor support does not. Keep VS Code's existing provider and the repo-local Zed extension separate until an integration decision warrants a change. Improve Zed's limited lexical highlighting before considering semantic tokens.
- The adapter still filters selected core diagnostics to avoid conflicts with TypeScript 7. If that causes a user-visible mismatch or grows, consider making core authoritative for shader-semantic errors while keeping TypeScript responsible for ordinary TS errors. Preserve source ranges, QuickInfo, and editor/core parity across invalid builtins and custom uniforms.
- **Independent helper errors in one pass:** core stops at the first invalid helper; the editor suppresses virtual shader cascades while preserving ordinary TypeScript errors outside shader regions. If simultaneous independent shader errors become important, collect them while tracking dependent functions, then suppress only untrustworthy downstream diagnostics/hovers. Test original ranges and dependency cascades.
- Move blocking checks off the synchronous editor/LSP path; design cancellation, supersession, and incremental caching. Extend project selection to multi-root/reference cases and unsaved files, and test TypeScript upgrades in real editors. Package/install/update integrations for projects outside this checkout.

### Runtime quality and releases

- Map generated GLSL/WGSL compiler errors and runtime failures back to authored source where possible. Original-source **Shdr** diagnostics already have mapped ranges; backend errors do not.
- Profile the current REPL compiler bundle before choosing another browser parser or chunk strategy. Maintain the language reference and fixtures; consider an example gallery and release workflows when distribution is defined.
- Optionally profile draw-time allocations before reusing a per-installed-shader WebGPU CPU uniform array. Preserve candidate isolation and verify updates, preflight, supersession, device loss, and presented pixels. Offsets and size are already computed once per installation.
- Keep `createWebGlRenderer` / `createWebGpuRenderer` factories and concrete classes for compatibility. Any future change to class exports should be a deliberate public API review with typed static/dynamic imports and backend-isolated bundle checks, not incidental cleanup.

### Standalone TypeScript

`shdr check` checks shader semantics; ordinary `tsc` checks ordinary TypeScript. Revisit standalone `tsc` integration only if a suitable supported content-mapping/virtual-file API becomes available. Do not present today's CLI as a replacement for `tsc`.
