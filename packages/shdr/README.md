# `shdr` (workspace-only)

Source-language declarations, expression types and artifact types for the [restricted shader language](../../README.md#accepted-shader-language). These DSL functions are **not** runtime shader builders: use `@shdr/vite` for a static `.shdr.ts` import or opt in to `@shdr/core/browser` for edited source. Never import and execute an authored `.shdr.ts` file as ordinary JavaScript to read defaults.

```ts
// fragment.shdr.ts — concise form
import { defineUniforms, vec4 } from "shdr";
export default defineUniforms((u) => ({
  color: u.vec3(0.2, 0.4, 0.6),
  gain: u.f32(0.25),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color.x, uniforms.color.y, uniforms.gain, uniforms.color.z),
);
```

An equivalent named form declares `const uniforms = defineUniforms((u) => ({ ... }))` in the same file—or imports that named declaration from another `.shdr.ts` module—and links it with `createFragmentShader(({ uniforms }) => ..., { uniforms })`; see [the complete named fixture](../../apps/vite-basic/src/custom-demo-named.shdr.ts). Without custom inputs, `createFragmentShader(callback)` remains supported. Only static finite f32 numeric literals (including unary minus) may be used for defaults; for example `u.f32(window.devicePixelRatio)` is rejected at its original source range, not evaluated. Custom names cannot shadow the automatic `resolution`, `mouse` or `time` uniforms. The callback reads custom expressions alongside those three automatic expressions.

A Vite-imported authored shader retains `TypedCompiledFragmentArtifact<S>` at the TypeScript boundary, with `S` inferred from its declarations; it is the same JSON artifact as `CompiledFragmentArtifact`, plus a **type-only** invariant schema identity. The browser compiler returns a schema-erased `DynamicCompiledFragmentArtifact` because arbitrary source can change at runtime. No type brands or authored JavaScript are serialized into the artifact. See the [runtime host API](../runtime/README.md) for creation overrides, `setUniforms`, resets, replacement and WebGL/WebGPU layout. Ordinary standalone `tsc` does not understand shader operators inside authored callbacks; use `shdr check` for shader semantics and the TypeScript 7 editor adapter for mapped hovers/diagnostics.

## Reusable helpers and schemas

Use a top-level `const` initialized with `defineShaderFunction` for a compile-only helper. Parameters must be explicit `Expr<F32>` or `Expr<Vec2/3/4<F32>>` types; returns may be inferred or annotated. Helpers cannot capture uniforms, `coord`, module values or host JavaScript. Exported helpers and `defineUniforms` declarations may live in helper-only `.shdr.ts` files or beside a default fragment. Import them directly by name from relative paths or configured TypeScript `paths` aliases, and explicitly link an imported schema with `{ uniforms }`.

Neither the compiler nor Vite executes authored modules or callbacks. Named exports are compile-time graph inputs; a Vite module's runtime value is its default compiled artifact. The browser REPL accepts local helpers in its one textarea, but has no file map or fetch path: an external `.shdr.ts` import reports `SHDR1300` and leaves the last successful render installed.
