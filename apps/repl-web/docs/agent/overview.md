# REPL shader authoring overview

The REPL edits a small, source-only shader language. The **Main** document is inserted into a generated fragment callback and **Utils** is inserted before that callback. The app supplies the imports; you write the body, not a complete module.

The generated shape is equivalent to:

```ts
import {
  createFragmentShader,
  defineShaderFunction,
  vec2,
  vec3,
  vec4,
  mat2,
  mat3,
  mat4,
  sample /* and math builtins */,
} from "shdr";
import type { Expr, F32, Vec2, Vec3, Vec4, Mat2, Mat3, Mat4 } from "shdr";

// Utils is placed here.
export default createFragmentShader(({ coord, uniforms, u }) => {
  // Main is placed here.
});
```

`createFragmentShader` and the imports are generated. Do not add imports or exports in either editor. A Main body must return `Expr<Vec4<F32>>`, usually a `vec4`. The compiler transforms the source into GLSL ES 3.00 and WGSL; it does not run arbitrary JavaScript.

## Six documentation topics

- **overview** — this composition model and a quick start.
- **language** — values, operators, swizzles, helper rules, and diagnostics.
- **builtins** — the supported math builtins and their exact source signatures and shape rules.
- **utilities** — constructors, `sample`, `defineShaderFunction`, and generated entry points.
- **uniforms** — the two REPL uniform kinds and the implicit `coord`/`u` values.
- **preview** — apply, runtime controls, and preview/capture boundaries.

## Quick start

```ts example=main
const uv = coord.xy / u.resolution;
return vec4(uv.x, uv.y, 0, 1);
```

`coord` is a pixel coordinate with top-left origin and `u.resolution` is the drawing-buffer size. `u` and `uniforms` are aliases. The editor's Uniforms pane can add named float and color values; those become `u.name` expressions after an explicit Run/apply.

Keep source deterministic: use finite top-level constants and expressions in the shader language. A draft edit is not automatically installed in the preview. See `preview` for the apply boundary and `uniforms` for the actual UI schema.
