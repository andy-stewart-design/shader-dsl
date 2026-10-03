# Custom uniforms — proposed contract

Status: phase-0 [typed/layout contract](./phase-0-contract.md) and phase-1 compiler/editor work implemented locally; **runtime binding and host updates are not implemented**. This extends the [workspace browser runtime](../_completed/runtime-api/spec.md) and the existing fragment-only, f32 shader subset. The authored-shader examples now compile; the host update/rendering examples describe the intended phase-2 API. Do not change the three automatic uniforms, canvas ownership, opaque output, backend selection, or current renderer failure/loss contract. Textures, samplers, matrices, arrays, structs, other scalar types, native runtimes, and npm publication are out of scope.

## Authored shader and static defaults

The concise form builds a fragment shader directly from the declaration:

```ts
// frag.shdr.ts
import { defineUniforms, vec4 } from "shdr";

export default defineUniforms((u) => ({
  color: u.vec3(0, 0, 1),
  dpi: u.f32(12),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, 1),
);
```

An explicitly named declaration is equally supported (as an alternative authored module):

```ts
import { createFragmentShader, defineUniforms, vec4 } from "shdr";

const uniforms = defineUniforms((u) => ({
  color: u.vec3(0, 0, 1),
  dpi: u.f32(12),
}));

export default createFragmentShader(
  ({ uniforms }) => vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, 1),
  { uniforms },
);
```

`defineUniforms` declares both the value types and **static initial values** in one place: `f32` maps to shader `Expr<F32>` and a host `number`; `vec2`/`vec3`/`vec4` map to `Expr<VecN<F32>>` and fixed-length numeric tuples. Inside the shader, `uniforms.color` has type `Expr<Vec3<F32>>`, `uniforms.color.x` has type `Expr<F32>`, and `uniforms.dpi` has type `Expr<F32>`. The existing `uniforms.resolution`, `uniforms.mouse`, and `uniforms.time` remain automatic on the same object; those three names are reserved and cannot be declared or set as custom uniforms. In the named form, the top-level `uniforms` identifier and callback parameter can shadow each other because `{ uniforms }` explicitly links the declaration to that shader. In the chained form the builder itself supplies that link. Neither form needs implicit module-global lookup or a second host-side type declaration.

The public authored-module type should preserve the inferred schema through its Vite import, so the runtime can type-check calls for a static shader. `defineUniforms` is a source-language declaration, **not** a command that runs in a built app. The compiler statically recognizes either a same-file declaration with an explicit `{ uniforms }` reference or the direct `defineUniforms(...).createFragmentShader(callback)` chain. Both forms infer the same callback types and normalize to one internal shader declaration before lowering; they produce identical dual-target artifacts, including names, types, defaults and usage metadata derived from the target-neutral IR. The Vite compiler and opt-in browser compiler must produce equivalent artifacts; neither evaluates/imports the authored `.shdr.ts` module as JavaScript to discover values. A static Vite consumer must not bundle the parser/compiler. Renderer code must not infer bindings from generated GLSL/WGSL text.

Initially allow only numeric literal arguments (including unary minus) to `u.f32` and `u.vecN`, with the exact arity and finite values that do not overflow when converted to f32. Ordinary f32 rounding (for example, `0.1`) is allowed. Dynamic expressions such as `u.f32(window.devicePixelRatio)`, closures, computed property names, and arbitrary builder calls are rejected with **original-source Shdr diagnostics** rather than evaluated. Preserve the existing `createFragmentShader(callback)` form for shaders without custom uniforms. Extend the parser, source diagnostics, core, and TypeScript 7 editor adapter together for both the explicit second argument and the direct `.createFragmentShader(callback)` chain, plus `({ uniforms })` without `coord` and the expression-body callback shown above (while retaining block-body callbacks). Reject duplicate/invalid names, reserved names, missing declarations and mismatched references with source-located errors. Only explicitly supported syntax is admitted; this does not enable general JavaScript execution or callback captures.

The artifact carries the complete declaration and defaults, even if a custom uniform is not referenced in the fragment; a backend may omit unused GPU bindings. Metadata must be deterministic and validated at the runtime boundary. WebGL and WebGPU use the same typed values/defaults but may pack them differently internally; WebGPU's existing group 0 slots for `resolution`/`mouse`/`time` remain fixed. Phase 0 selects a WebGPU group 1 binding 0 uniform struct and individual WebGL uniforms, with the layout and alignment recorded in the [typed/layout contract](./phase-0-contract.md). This internal packing is not a new host-owned resource API.

## Host API and first frame

```ts
import shader from "./frag.shdr.ts";
import { createWebGlRenderer } from "@shdr/runtime/webgl";

const renderer = await createWebGlRenderer(canvas, shader); // First frame: blue, dpi 12.
renderer.setUniforms({ dpi: 0.5 }); // Next animated frame, or next explicit draw.
renderer.resetUniforms("dpi"); // Current shader's default (12) on the next frame/draw.
renderer.resetUniforms("dpi", "color"); // Reset several.
renderer.resetUniforms(); // Reset every custom uniform.
```

The same API applies to the separate WebGPU renderer. Both renderers install custom defaults **before** their first successful draw. A host may override a subset for an instance's first frame:

```ts
const renderer = await createWebGlRenderer(canvas, shader, {
  uniforms: { dpi: window.devicePixelRatio },
});
```

Creation-time values override serialized defaults for that renderer's current shader, preventing a flash of defaults; they are **not persistent across shader replacement** unless subsequently set with `setUniforms`. `setUniforms` accepts a partial patch of custom values, copies/validates it before changing current values, and records those keys as persistent host overrides. It does not recompile shaders or create another renderer. `resetUniforms(...names)` clears the named overrides and restores the **current installed shader's** defaults; with no arguments it resets all custom values. This also clears any creation-time override on the current shader. Reset is harmless for a declared key that was not overridden. Neither update method schedules an extra draw: animation observes the update on the next frame, and `{ animate: false }` observes it on the next explicit `draw()`. Successful `setShader` still performs its normal initial draw even when animation is off.

For a statically typed artifact, `setUniforms` accepts only declared names and maps `f32` to `number` and `vecN` to a fixed-length numeric tuple; `renderer.setUniforms({ dpi: "0.5" })` is a TypeScript error. `resetUniforms` only accepts declared names. For dynamically compiled/editor source, types cannot know the schema at build time, so both methods validate names, types, vector lengths, and finite numbers that remain finite after f32 conversion against the **currently installed** artifact at runtime. Invalid calls fail without partially applying a patch or silently ignoring an unknown field. Host name/value errors use a `ShdrRuntimeError` with a distinct `"uniform"` kind; malformed artifact metadata remains an `"artifact"` error. Runtime errors are not compiler diagnostics.

## Shader replacement and dynamic editors

`setShader` stays on the existing renderer and retains its installed/superseded result and failure-preservation behavior; it does **not** return a newly typed handle. For a statically typed renderer, a replacement is type-safe when the new shader has the same custom-uniform **names and types** (defaults may differ). Do not promise typed `setUniforms` against a different schema while the same renderer is still in use. A live editor receives a schema-erased artifact from runtime source compilation and can replace shaders with different schemas on the same canvas; it gets runtime validation, not compile-time knowledge of arbitrary edited names.

For each **successful** replacement, construct the candidate's values from its own defaults, then apply only persistent `setUniforms` overrides with the same name **and type**. Discard overrides for absent or type-changed keys rather than keeping dormant values that might reappear later. A creation-time override that was never passed to `setUniforms` does not carry over. For example, if the old shader declared `color: vec3` and `dpi: f32`, the host explicitly set both, and the next shader declares `color: f32`, `dpi: f32`, and `spin: f32`, its first frame uses the new `color` and `spin` defaults and the host's `dpi` value. `resetUniforms("dpi")` then selects the new shader's `dpi` default and stops carrying the override to later shaders.

While a replacement is pending, `setUniforms` and `resetUniforms` apply to the currently installed shader. A successful candidate's **first real frame** must use the latest compatible overrides at commit, not an earlier snapshot; backend preparation/preflight must not show stale values. A failed or superseded replacement leaves the installed shader, current values, and overrides unchanged (apart from valid host updates made while it was pending). Invalid authored source produces compiler diagnostics and does not install a candidate; cancellation of a pending install preserves the previous shader. Context/device loss remains terminal as in runtime v1.

## Verification and scope boundary

- Type-check both authoring forms and their identical callback hover/quick-info, static Vite import, creation options, `setUniforms`, `resetUniforms`, same-schema replacement, and rejected scalar/vector/name mismatches with the project's TypeScript 7 and editor integration.
- Exercise both authoring forms through Vite and the opt-in browser compiler; check equivalent artifacts, invalid declarations and source-located diagnostics, one target-neutral lowering, deterministic schema/default metadata, binding subsets, and static-bundle exclusion of the parser/compiler.
- Check real WebGL **and presented WebGPU pixels** for defaults on the first draw, creation-time overrides, typed value updates, reset-one/reset-many/reset-all, manual drawing, different shader defaults, compatible/incompatible replacement, overlapping installs/updates, failure preservation, and runtime validation. Avoid test-only per-frame canvas DOM attributes.
- No transparent canvas output, textures/samplers, generic resource binding, general shader captures, or automatic backend fallback is introduced by this feature.
