# Shader DSL Proof-of-Concept Specification

## Objective

Prove that shader expressions can use native operators inside TypeScript source while providing:

- Correct shader-specific type inference
- VS Code hovers and diagnostics
- Diagnostics mapped to original operator expressions
- GLSL generation
- A shared compiler core for Vite and a browser REPL

This is an embedded shader language using TypeScript syntax—not TypeScript operator overloading.

## Target syntax

```ts
// gradient.shader.ts
import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const color = vec4(uv.x, uv.y, 0, 1);

  return color;
});
```

Expected inferred types:

```text
  coord                 Expr<Vec4<F32>>
  coord.xy              Expr<Vec2<F32>>
  uniforms.resolution   Expr<Vec2<F32>>
  uv                    Expr<Vec2<F32>>
  uv.x                  Expr<F32>
  color                  Expr<Vec4<F32>>
```

## First milestone: editor go/no-go spike

Before building the shader IR or GLSL generator, demonstrate in a real VS Code project:

1.  Open an actual .shader.ts file.
2.  Show no native TypeScript error for /.
3.  Hover uv and see Expr<Vec2<F32>>.
4.  Change the expression to an invalid division.
5.  See a diagnostic mapped to the original / expression.
6.  Confirm ordinary TypeScript outside the shader callback is unaffected.
7.  Confirm nested division works:

```ts
const value = coord.xy / uniforms.resolution / uniforms.time;
```

Until these behaviors work, the central hypothesis remains unproven.

## Strict source rules

The POC recognizes only:

- A direct named import of createFragmentShader
- Exactly one default-exported createFragmentShader(...) call
- A synchronous arrow-function callback
- Parameter destructuring as ({ coord, uniforms })
- Direct imports of supported constructors such as vec4
- No import aliases
- No namespace imports
- No nested functions
- No closure captures
- No asynchronous code
- No arbitrary JavaScript inside the callback

These restrictions may be relaxed after the POC.

## Built-in inputs

```ts
coord: Expr<Vec4<F32>>;
```

coord maps to:

```glsl
  gl_FragCoord
```

Initial supported swizzles:

```text
  .x
  .y
  .xy
```

## Default uniforms

```ts
interface DefaultUniforms {
  resolution: Expr<Vec2<F32>>;
  mouse: Expr<Vec2<F32>>;
  time: Expr<F32>;
}
```

┌─────────────────────┬──────────────┬────────────────────────────┐  
│ DSL value │ GLSL value │ Semantics │  
├─────────────────────┼──────────────┼────────────────────────────┤  
│ uniforms.resolution │ u_resolution │ Viewport size in pixels │  
├─────────────────────┼──────────────┼────────────────────────────┤  
│ uniforms.mouse │ u_mouse │ Pointer position in pixels │  
├─────────────────────┼──────────────┼────────────────────────────┤  
│ uniforms.time │ u_time │ Elapsed seconds │  
└─────────────────────┴──────────────┴────────────────────────────┘

Custom uniforms are not part of the POC.

## Branded shader types

Shader types must be structurally distinct:

```ts
declare const shaderType: unique symbol;
declare const expressionType: unique symbol;

interface F32 {
  readonly [shaderType]: "f32";
}

interface Vec2<T> {
  readonly [shaderType]: readonly ["vec2", T];
}

interface Vec4<T> {
  readonly [shaderType]: readonly ["vec4", T];
}

interface Expr<T> {
  readonly [expressionType]: T;
}
```

The actual Expr<T> definition will also expose valid swizzles based on T.

## Virtual TypeScript transformation

### Operators

Source:

```ts
const uv = coord.xy / uniforms.resolution;
```

Virtual TypeScript:

```ts
const uv = __div(coord.xy, uniforms.resolution);
```

Nested operators must preserve associativity:

```ts
a / b / c;
```

becomes:

```ts
__div(__div(a, b), c);
```

### Numeric literals

All numeric literals inside the shader boundary receive shader semantics.

Source:

```ts
vec4(uv.x, uv.y, 0, 1);
```

Virtual TypeScript:

```ts
vec4(uv.x, uv.y, __f32(0), __f32(1));
```

This also ensures:

```ts
const half = 1 / 2;
```

becomes:

```ts
const half = __div(__f32(1), __f32(2));
```

## Explicit operator overloads

The virtual checker will use explicit overloads rather than a conditional result that could silently produce  
Expr<never>:

```ts
declare function __div(left: Expr<F32>, right: Expr<F32>): Expr<F32>;

declare function __div(
  left: Expr<Vec2<F32>>,
  right: Expr<F32>,
): Expr<Vec2<F32>>;

declare function __div(
  left: Expr<Vec2<F32>>,
  right: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;

declare function __div(
  left: Expr<Vec4<F32>>,
  right: Expr<F32>,
): Expr<Vec4<F32>>;

declare function __div(
  left: Expr<Vec4<F32>>,
  right: Expr<Vec4<F32>>,
): Expr<Vec4<F32>>;
```

No permissive implementation signature will be visible to the virtual checker.

## Initial semantic rules

```text
  F32  / F32  → F32
  Vec2 / F32  → Vec2
  Vec2 / Vec2 → Vec2
  Vec4 / F32  → Vec4
  Vec4 / Vec4 → Vec4
```

Invalid example:

```ts
const invalid = coord.xy / coord;
```

This must produce a diagnostic on the original expression because Vec2 / Vec4 is unsupported.

Every rule must have parity tests against:

1.  TypeScript virtual checking
2.  Shader compiler semantic analysis

A generated canonical rule table can be considered later.

## Language-service behavior

The language-service package will:

1.  Detect supported .shader.ts files.
2.  Create an in-memory virtual TypeScript representation.
3.  Type-check the virtual file.
4.  Replace native operator diagnostics inside shader boundaries.
5.  Map virtual diagnostics to original source ranges.
6.  Map hover requests to the virtual representation.
7.  Delegate ordinary TypeScript behavior outside shader boundaries.

The POC must be tested using a real workspace TypeScript installation and VS Code/tsserver session.

## Standalone tsc limitation

A tsserver plugin affects editor behavior but does not change:

```bash
  tsc --noEmit
```

Standard tsc will initially inspect the original operator expressions and may reject them.

The POC will document that standalone tsc support is not yet provided. Potential future solutions include:

- A shdr check compiler wrapper
- A transformed TypeScript compiler host
- A dedicated shader file extension
- Generated virtual declarations and project configuration

This limitation must not be presented as solved by the Vite plugin.

## Compiler pipeline

After the editor spike succeeds:

```text
  .shader.ts source
         │
         ├──► Virtual TS transform
         │          │
         │          ▼
         │     Language service
         │
         ▼
  Shader lowering
         │
         ▼
  Typed shader IR
         │
         ▼
  GLSL ES 3.00 generator
```

The compiler must not evaluate arbitrary source code.

## GLSL target

The POC targets WebGL 2 / GLSL ES 3.00.

Expected output:

```glsl
  #version 300 es
  precision highp float;

  uniform vec2 u_resolution;

  out vec4 shdr_fragment_color;

  void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      vec4 color = vec4(uv.x, uv.y, 0.0, 1.0);
      shdr_fragment_color = color;
  }
```

Only referenced default uniforms need to be emitted.

## Package structure

```text
  apps/
    vite-basic/
    repl/

  packages/
    core/
      parsing
      virtual transformation
      semantic rules
      shader IR
      GLSL generation

    language-service/
      tsserver integration
      source mappings
      hovers and diagnostics

    vite/
      Vite transformation adapter
```

@shdr/core must remain filesystem-independent and browser-compatible. Shipping the TypeScript parser in the REPL is  
acceptable for the POC despite its bundle-size cost.

## Implementation order

1. Define branded shader types.
1. Implement / and numeric-literal virtual transformations.
1. Add explicit __div overloads.
1. Implement source-to-virtual mappings.
1. Demonstrate real VS Code hovers and diagnostics.
1. Test invalid and nested division.
1. Define the shader IR.
1. Implement semantic lowering and parity tests.
1. Generate WebGL 2 GLSL.
1. Add the Vite adapter.
1. Add the browser REPL and rendering demo.

### Final acceptance criteria

The POC succeeds when:

- Operator syntax remains intact in source.
- VS Code reports uv as Expr<Vec2<F32>>.
- Native arithmetic errors are hidden inside the shader boundary.
- Invalid shader operations produce mapped diagnostics.
- Ordinary TypeScript remains unaffected.
- Nested division and numeric literals have shader semantics.
- The generated GLSL compiles and renders in WebGL 2.
- Vite and the browser REPL share the same compiler core.

## Non-goals

- Standalone tsc compatibility
- User-defined uniforms
- Vertex shaders
- Control flow
- Loops
- User-defined shader functions
- Textures and samplers
- Matrices
- Closure capture
- WGSL
- Optimization passes
- Complete refactoring and rename support
- Production-quality source maps
