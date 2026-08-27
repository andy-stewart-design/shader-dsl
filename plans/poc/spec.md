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
  color                 Expr<Vec4<F32>>
```

## Public API types

The source module and the JavaScript module produced by the Vite adapter both expose a shader source string. A brand distinguishes it from an arbitrary string while keeping it assignable to APIs that accept `string`:

```ts
declare const fragmentShaderSource: unique symbol;

type FragmentShaderSource = string & {
  readonly [fragmentShaderSource]: true;
};

interface FragmentContext {
  readonly coord: Expr<Vec4<F32>>;
  readonly uniforms: DefaultUniforms;
}

declare function createFragmentShader(
  callback: (context: FragmentContext) => Expr<Vec4<F32>>,
): FragmentShaderSource;
```

The Vite adapter emits a plain JavaScript string at runtime; `FragmentShaderSource` is its TypeScript representation.

## First milestone: editor go/no-go spike

Before building the shader IR or GLSL generator, demonstrate in a real VS Code project:

1. Open an actual `.shader.ts` file.
2. Show that no native TypeScript error for `/` is surfaced.
3. Hover `uv` and see `Expr<Vec2<F32>>`.
4. Change the expression to an invalid division.
5. See a diagnostic mapped to the original `/` expression.
6. Confirm ordinary TypeScript outside the shader callback is unaffected.
7. Confirm nested division works:

```ts
const value = coord.xy / uniforms.resolution / uniforms.time;
```

Until these behaviors work, the central hypothesis remains unproven.

## Strict source rules

The POC recognizes only:

- A direct named import of `createFragmentShader` from exactly `"shdr"`
- Exactly one default-exported `createFragmentShader(...)` call
- A synchronous arrow-function callback
- Parameter destructuring as `({ coord, uniforms })`
- Direct named imports of supported constructors such as `vec4` from exactly `"shdr"`
- No import aliases
- No namespace imports
- No nested functions
- No closure captures
- No asynchronous code
- No arbitrary JavaScript inside the callback
- No source identifier beginning with the reserved `__shdr_internal_` prefix

These restrictions may be relaxed after the POC.

## Supported shader-language subset

Inside the shader callback, the POC accepts only the following syntax.

Statements:

- `const` declarations with a simple identifier and initializer
- One final `return` statement

Expressions:

- Numeric literals
- Local identifiers
- Parenthesized expressions
- Binary division using `/`
- Calls to supported shader constructors
- Property access for built-in inputs, uniforms, and supported swizzles

The initial constructor surface is:

```ts
declare function vec4(
  x: Expr<F32>,
  y: Expr<F32>,
  z: Expr<F32>,
  w: Expr<F32>,
): Expr<Vec4<F32>>;
```

Numeric source literals become `Expr<F32>` through the virtual transformation described below. The final returned expression must have type `Expr<Vec4<F32>>`.

Assignment, `let`, `var`, type annotations, expression statements, unary operators including unary minus, other binary operators, optional access, nested calls other than supported constructors, and all other statement and expression forms are unsupported. Encountering unsupported syntax must produce a shader diagnostic rather than being silently interpreted as JavaScript.

## Built-in inputs

```ts
coord: Expr<Vec4<F32>>;
```

coord maps to:

```glsl
  gl_FragCoord
```

Minimum swizzles supported by the POC:

```text
  .x
  .y
  .xy
```

This is not the intended full vector API. `Vec3` and complete GLSL component and swizzle support are deferred until after the operator-integration hypothesis is proven.

## Default uniforms

```ts
interface DefaultUniforms {
  resolution: Expr<Vec2<F32>>;
  mouse: Expr<Vec2<F32>>;
  time: Expr<F32>;
}
```

| DSL value             | GLSL value     | Semantics                  |
| --------------------- | -------------- | -------------------------- |
| `uniforms.resolution` | `u_resolution` | Viewport size in pixels    |
| `uniforms.mouse`      | `u_mouse`      | Pointer position in pixels |
| `uniforms.time`       | `u_time`       | Elapsed seconds            |

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

For the POC, the actual `Expr<T>` definition exposes only the minimum swizzles listed above when valid for `T`.

## Virtual TypeScript transformation

Virtual helpers use the reserved `__shdr_internal_` prefix and are available only to generated code.

### Operators

Source:

```ts
const uv = coord.xy / uniforms.resolution;
```

Virtual TypeScript:

```ts
const uv = __shdr_internal_div(coord.xy, uniforms.resolution);
```

Nested operators must preserve associativity:

```ts
a / b / c;
```

becomes:

```ts
__shdr_internal_div(__shdr_internal_div(a, b), c);
```

### Numeric literals

All numeric literals inside the shader boundary receive shader semantics.

Source:

```ts
vec4(uv.x, uv.y, 0, 1);
```

Virtual TypeScript:

```ts
vec4(uv.x, uv.y, __shdr_internal_f32(0), __shdr_internal_f32(1));
```

This also ensures:

```ts
const half = 1 / 2;
```

becomes:

```ts
const half = __shdr_internal_div(
  __shdr_internal_f32(1),
  __shdr_internal_f32(2),
);
```

### Transformation result and mappings

The virtual transformation returns generated text together with explicit mappings:

```ts
interface TextRange {
  start: number;
  length: number;
}

interface SourceMapping {
  original: TextRange;
  generated: TextRange;
  kind: "identity" | "expression";
}

interface VirtualSource {
  code: string;
  mappings: SourceMapping[];
  shaderRegion: TextRange;
}
```

Copied identifiers and expression fragments receive identity mappings. Each generated `__shdr_internal_div(...)` call maps to the complete original binary expression that produced it, and each generated `__shdr_internal_f32(...)` call maps to its original numeric literal. For nested division, every generated call maps to its corresponding inner or outer binary expression.

Diagnostics on copied operands should map to the operand when possible. Diagnostics attached to a generated helper call or helper name map to the corresponding complete original expression. The implementation must not assume that offsets from a fully reprinted TypeScript AST still correspond to the source; generated text must be assembled with explicit source-preserving segments and mappings.

Mappings may overlap for nested transformations. When multiple mappings contain a generated range, the mapping process selects the smallest containing mapping. An identity mapping takes precedence over an expression mapping when both are equally specific. This rule applies consistently to hovers and diagnostics.

## Explicit operator overloads

The virtual checker will use explicit overloads rather than a conditional result that could silently produce `Expr<never>`:

```ts
declare function __shdr_internal_f32(value: number): Expr<F32>;

declare function __shdr_internal_div(
  left: Expr<F32>,
  right: Expr<F32>,
): Expr<F32>;

declare function __shdr_internal_div(
  left: Expr<Vec2<F32>>,
  right: Expr<F32>,
): Expr<Vec2<F32>>;

declare function __shdr_internal_div(
  left: Expr<Vec2<F32>>,
  right: Expr<Vec2<F32>>,
): Expr<Vec2<F32>>;

declare function __shdr_internal_div(
  left: Expr<Vec4<F32>>,
  right: Expr<F32>,
): Expr<Vec4<F32>>;

declare function __shdr_internal_div(
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

1.  Detect supported `.shader.ts` files.
2.  Create and cache an in-memory virtual TypeScript representation by source version.
3.  Type-check the virtual file.
4.  Preserve original TypeScript syntactic diagnostics.
5.  Use virtual semantic diagnostics for the entire shader callback.
6.  Use original TypeScript semantic diagnostics outside the shader callback.
7.  Add shader diagnostics for unsupported syntax and semantic rules.
8.  Map virtual diagnostics to original source ranges.
9.  Route hover requests inside the shader callback to the virtual representation.
10. Delegate hover and diagnostic behavior outside the callback to the original language service.

Replacing diagnostics applies to the complete shader callback, not only to TypeScript arithmetic diagnostic codes. This is necessary because the original checker may infer `/` as `number` and then produce cascading errors for later expressions such as `uv.x`. Diagnostics that cross a boundary must be deduplicated and attributed to either the original or virtual representation according to whether their relevant expression is inside the shader callback.

A tsserver plugin must use the TypeScript instance supplied by the running server rather than importing a separate compiler instance. The POC supports the repository-pinned workspace TypeScript version; compatibility with other TypeScript versions is not required. The browser REPL may bundle that pinned version directly.

The behavior must have automated language-service tests for quick info and diagnostics, followed by verification using the workspace TypeScript installation in a real VS Code/tsserver session. Exact QuickInfo text is asserted only against the pinned TypeScript version.

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

The rendering demo may supply a hard-coded fullscreen-triangle vertex shader. Vertex-shader authoring in the DSL remains outside the POC.

## Core APIs

The filesystem-independent core exposes at least:

```ts
interface CompileResult {
  code?: string;
  ir?: ShaderModule;
  diagnostics: Diagnostic[];
}

function createVirtualSource(source: string): VirtualSource;
function compileFragment(source: string): CompileResult;
```

All diagnostic ranges returned by the core refer to the original source. Neither API reads files or resolves modules from the filesystem.

## Package structure

```text
  apps/
    vite-basic/
    repl/

  packages/
    core/
      parsing
      virtual transformation and source mappings
      semantic rules
      shader IR
      GLSL generation

    language-service/
      tsserver integration
      hover and diagnostic routing

    vite/
      Vite transformation adapter
```

`@shdr/core` must remain filesystem-independent and browser-compatible. Shipping the TypeScript parser in the REPL is acceptable for the POC despite its bundle-size cost.

The Vite adapter transforms a shader source file into a JavaScript module whose default export is the generated GLSL string:

```js
export default "...generated GLSL...";
```

It must not return raw GLSL as though it were JavaScript module source.

## Testing strategy

The POC includes automated tests at each boundary:

- Golden tests for generated virtual TypeScript and source mappings
- Programmatic language-service tests for QuickInfo and diagnostics
- Mapping tests for operands, generated helper calls, numeric literals, and nested expressions
- A parity matrix that runs every operator rule through both virtual TypeScript checking and shader semantic analysis
- Shader IR assertions and GLSL snapshots
- WebGL 2 shader compilation and linking in a real browser
- Vite development-transform and production-build integration tests
- A Playwright pixel test for the rendered gradient, using tolerances for implementation-dependent rendering differences

The automated language-service tests are followed by the manual VS Code go/no-go checklist from the first milestone.

## Implementation order

1. Define branded shader types.
1. Implement `/` and numeric-literal virtual transformations.
1. Add explicit `__shdr_internal_div` overloads.
1. Implement source-to-virtual mappings.
1. Demonstrate real VS Code hovers and diagnostics.
1. Test invalid and nested division.
1. Define the shader IR.
1. Implement semantic lowering and parity tests.
1. Generate WebGL 2 GLSL.
1. Add the Vite adapter.
1. Add the browser REPL and rendering demo.

## Final acceptance criteria

The POC succeeds when:

- Operator syntax remains intact in source.
- VS Code reports `uv` as `Expr<Vec2<F32>>`.
- Native arithmetic errors are not surfaced inside the shader boundary.
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
