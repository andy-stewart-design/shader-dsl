# Follow-up notes

Status: candidates for future, separately reviewed work—not commitments or a single PR. The [language reference](../README.md#accepted-shader-language) defines what Shdr supports today; completed plans live under [`_completed/`](./_completed/). For a new language form, agree on f32 signatures and source diagnostics first, then verify public types, the TypeScript 7 editor, core/IR, both generated targets, and representative browser/editor behavior. Do not infer Shdr support from a raw GLSL or WGSL example.

## Candidate milestones (not priority commitments)

### Comparisons, selection, and control flow

- Design scalar f32 comparisons yielding shader booleans and same-type selection arms. Settle `&&`/`||`/`!`, scalar versus vector conditions, and **eager versus lazy arm evaluation** before lowering to GLSL/WGSL; WGSL has no source-style `?:` expression.
- Leave general `if` statements and loops out until a static shader control-flow and diagnostic model is specified. Do not treat ordinary TypeScript control flow as shader code by default.

### Textures and samplers

- Host-driven texture URL swaps via `setUniforms` (currently synchronous and numeric-only), per-frame/video updates, a fuller REPL image picker or host image overrides, and configurable sampler filtering/addressing such as nearest-neighbor and repeat.
- Any future update API needs an asynchronous loading, supersession, disposal, and failure policy; do not silently treat texture changes as numeric uniform patches.
- Future extensions may revisit color-space/alpha controls, mipmap policy, broader URL/CORS rules, and richer runtime/source error mapping.

### Transparent canvas output

The [opaque runtime v1 contract](./_completed/runtime-api/spec.md) computes shader alpha but does not composite a translucent canvas over the page. Treat transparency as a separate cross-backend feature: specify straight versus premultiplied alpha, canvas configuration, blending/compositing, and color-space expectations. Test alpha below 1 against a visible page background and through pixel readback on real WebGL and WebGPU paths.

### Further reference-port vocabulary, when needed

The [language-extension roadmap](./language-exntesion.md) describes still-unimplemented candidates such as fragment derivatives, narrowly analyzed module constants, orbit/trigonometry operations (including GLSL-style `mod`), and minimal `mat2` values. Review each against a concrete reference port before committing to its scope; named shader helpers, vector packing, and the first `mix`/`step`/`clamp`/`pow` signatures are already implemented. Reversed-`smoothstep` reference behavior is not portable GLSL fidelity; agree on a defined rewrite and pinned inputs before claiming a port matches its original. Vertex-stage authoring and varying interfaces need separate stage-specific IR, type/location and interpolation rules, and a host pipeline contract.

## Optional builtin signature extensions

### Additional `min`/`max`/`smoothstep` signatures

- `min`/`max` with a vector and scalar would need an explicit choice of argument order and a WGSL splat. [GLSL `min`](https://docs.gl/el3/min) · [WGSL `min`](https://www.w3.org/TR/WGSL/#min-float-builtin)
- `smoothstep` with scalar edges and vector `x` would need vectorized WGSL edges and preserve the existing equal-edge/domain policy. [GLSL](https://docs.gl/el3/smoothstep) · [WGSL](https://www.w3.org/TR/WGSL/#smoothstep-builtin)

These are optional ergonomics, not gaps in the existing f32 subset. Require a reviewed signature matrix and two-target tests before adopting them. Boolean-mask `mix` depends on an agreed shader-boolean contract; it is not part of today's scalar/vector `mix` signatures.

## Editor, runtime, and distribution follow-ups

### One editor LSP and shader navigation (possible SOW)

Today the `.shdr.ts` editor paths provide diagnostics and hover, but not navigation. TypeScript 7 exposes symbol/declaration and reference primitives; Shdr must return **authored-file locations**, never positions in transformed virtual TypeScript or generated GLSL/WGSL. In this beta, prefer replacing the VS Code fixture's direct adapter transport with the existing Shdr LSP over maintaining both for compatibility. This is a candidate milestone, not a commitment to replicate every TypeScript navigation feature or publish an extension.

- **Unify transports:** make the VS Code fixture a Shdr LSP client for `.shdr.ts` diagnostics/hover, using the same server as Zed; retain the shared TypeScript 7 adapter behind the server. After real-editor parity, remove the direct VS Code `DiagnosticCollection`/`HoverProvider` and duplicate project-refresh path, rather than keeping parallel providers or a fallback. Ordinary `.ts` remains owned by TypeScript. A repo-local beta client may launch the built server; clean-install distribution is a separate gate, not a prerequisite for replacing the fixture transport.
- **Feasibility spike:** verify TypeScript 7's symbol/reference behavior for a transformed local helper, an imported helper alias, and an imported uniform schema. Decide how to map both the query and cross-file results through each file's original/virtual source, including unavailable or stale definitions. Use core graph information only where TypeScript cannot provide reliable shader identity.
- **Definition slice:** expose a source-located definition result from the shared adapter through LSP `textDocument/definition` for both editors. Cover local helpers/locals and direct or aliased `.shdr.ts` imports; preserve normal handling of non-shader `.ts` files.
- **References slice:** search the selected project for declarations and uses across files rather than only the open document. Return authored ranges for helper and schema declarations/imports/calls, including aliases and multiple consumers. Handle unsaved edits, dependency refresh, project boundaries, and stale results; do not claim interruptible cancellation while TypeScript checking still blocks the server event loop. Decide whether builtins and automatic uniforms are in scope separately.
- **Acceptance:** retain current diagnostics/hover behavior in LSP protocol and real VS Code checks after removing the direct transport. Test local and cross-file navigation, transitive helpers, alias paths, mixed/helper-only modules, unsaved edits, and removal/restoration of a dependency. Assert exact original-file ranges and no generated-helper locations or unrelated `.ts` takeover; verify Zed through the same LSP when available. A hover or TypeScript-only symbol lookup does not satisfy the navigation gate.

### Editor hardening

- The project-aware stdio LSP and shared TypeScript 7 adapter exist; **production/distributable** editor support does not. A beta VS Code fixture can switch to the LSP without preserving its old direct transport; packaging and external-project support remain separate work. Improve Zed's limited lexical highlighting before considering semantic tokens.
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
