# `@shdr/vite` (workspace-only)

Pre-transform `.shdr.ts` modules into one static GLSL ES 3.00 + WGSL [compiled artifact](../shdr/README.md); it never evaluates the authored module to obtain custom-uniform defaults. Configure `plugins: [shdr()]` from `@shdr/vite` in Vite. For a complete dual-backend host with [inline](../../apps/vite-basic/src/custom-demo-inline.shdr.ts) and [named](../../apps/vite-basic/src/custom-demo-named.shdr.ts) custom-uniform shaders, see the [Vite fixture](../../apps/vite-basic/README.md#custom-uniform-demo).

Still-image texture resources use the same static artifact path:

```ts
import shader from "./photo.shdr.ts";
import { createWebGlRenderer } from "@shdr/runtime/webgl";

const renderer = await createWebGlRenderer(canvas, shader);
```

Use `u.texture2D("/photo.png")` with `sample(uniforms.photo, uv)` for a Vite public asset. The plugin rewrites only root-absolute artifact resource URLs according to Vite's configured `base`; external HTTPS URLs and standalone compiler artifacts are unchanged. Runtime sampling uses fixed linear filtering, clamp-to-edge addressing, no mipmaps and top-left image orientation. The plugin emits JSON artifact data and does not fetch images or add the compiler/parser to the browser bundle.

```ts
import shader from "./custom-demo-inline.shdr.ts";
import { createWebGlRenderer } from "@shdr/runtime/webgl";
const renderer = await createWebGlRenderer(canvas, shader, {
  animate: false,
  uniforms: { gain: 0.2 }, // Overrides the first frame for this instance.
});
renderer.setUniforms({ gain: 0.8 });
await renderer.draw(); // No additional draw is scheduled in manual mode.
renderer.resetUniforms("gain");
await renderer.draw();
```

A static import preserves inferred uniform names and f32/vector types, including same-schema replacement checks; no runtime DSL stub, Babel Parser or compiler is pulled into the static browser bundle. The artifact includes all declarations/defaults even for fields omitted by GPU optimizers, plus target-specific referenced subsets. Vite serves updated GLSL and WGSL after shader source edits. Source errors carry original `.shdr.ts` ranges. A live editor instead explicitly imports `compileFragmentArtifact` from `@shdr/core/browser`; that opt-in bundle includes the parser/compiler and produces schema-erased artifacts checked by the renderers at runtime. Renderers remain separate `@shdr/runtime/webgl` and `/webgpu` entries with no automatic fallback.
