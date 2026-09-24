# Shader DSL Proof-of-Concept Specification

## Objective

Prove that shader expressions can use native operators inside TypeScript source while providing:

- Correct shader-specific type inference
- VS Code hovers and diagnostics
- Diagnostics mapped to original operator expressions
- GLSL ES 3.00 and WGSL generation from one target-neutral typed IR
- A shared compiler core for Vite and a browser REPL

This is an embedded shader language using TypeScript syntax—not TypeScript operator overloading.

## Target syntax

```ts
// gradient.shdr.ts
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

1. Open an actual `.shdr.ts` file.
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

## Source parser

`@shdr/core` uses Babel Parser 8 with TypeScript syntax enabled. Babel is used only to convert source text into an AST; the project does not adopt Babel transforms, configuration, or runtime semantics.

Babel AST nodes remain private to a parser adapter. Downstream compiler stages consume normalized core syntax nodes and source ranges so that the parser can be replaced without changing shader semantics. The parser adapter must remain synchronous, filesystem-independent, and browser-compatible.

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

declare function vec4(
  xy: Expr<Vec2<F32>>,
  z: Expr<F32>,
  w: Expr<F32>,
): Expr<Vec4<F32>>;

declare function vec4(value: Expr<F32>): Expr<Vec4<F32>>;
declare function vec4(value: Expr<Vec4<F32>>): Expr<Vec4<F32>>;
```

The second overload supports idiomatic construction such as `vec4(uv.xy, 0, 1)`. The unary scalar form splats one `F32` across all four components, while the unary `Vec4` form performs a copy/identity construction. Semantic lowering classifies all four overloads as the same `vec4` constructor call IR with an ordered argument list and `Vec4<f32>` result. `SHDR1206` rejects all other arity/type combinations on the complete call. `Vec3`, mixed component packing, and other GLSL constructor combinations remain deferred.

Numeric source literals become `Expr<F32>` through the virtual transformation described below. The final returned expression must have type `Expr<Vec4<F32>>`; semantic lowering reports `SHDR1207` on the returned expression when it resolves to another type.

Assignment, `let`, `var`, type annotations, expression statements, unary operators including unary minus, other binary operators, optional access, nested calls other than supported constructors, and all other statement and expression forms are unsupported. Encountering unsupported syntax must produce a shader diagnostic rather than being silently interpreted as JavaScript.

## Built-in inputs

```ts
coord: Expr<Vec4<F32>>;
```

`coord` has target-neutral, WebGPU-oriented framebuffer semantics:

- The origin is the top-left of the viewport.
- Positive X points right and positive Y points down.
- Coordinates are in pixels, with the top-left pixel center at `(0.5, 0.5)`.
- Fragment depth uses the `0.0` near to `1.0` far range.

WGSL maps `coord` directly to its fragment-position built-in. GLSL constructs the canonical value from `gl_FragCoord`, converting Y with `uniforms.resolution.y - gl_FragCoord.y`. Therefore `resolution` is an implicit GLSL dependency whenever `coord` is referenced, even when source does not access that uniform explicitly.

Minimum read swizzles supported by the POC:

```text
              Vec2<F32> result   Vec4<F32> result
  .x          F32                F32
  .y          F32                F32
  .xy         Vec2<F32>          Vec2<F32>
```

Normalized syntax accepts any direct, non-computed identifier property structurally. Semantic lowering distinguishes default-uniform access from swizzling based on the receiver, stores swizzles as component indices (`x = 0`, `y = 1`), and reports the property-name range for scalar receivers, components unavailable at the receiver dimension, and unsupported spellings. This keeps syntax normalization independent of the current swizzle list without silently accepting extra language features.

This is not the intended full vector API. `Vec3`, writable swizzles, `.z`/`.w`, alternate component alphabets, and complete GLSL/WGSL swizzle support are deferred until after the operator-integration hypothesis is proven.

## Default uniforms

```ts
interface DefaultUniforms {
  resolution: Expr<Vec2<F32>>;
  mouse: Expr<Vec2<F32>>;
  time: Expr<F32>;
}
```

| DSL value             | GLSL value     | Semantics                                                     |
| --------------------- | -------------- | ------------------------------------------------------------- |
| `uniforms.resolution` | `u_resolution` | Viewport size in pixels                                       |
| `uniforms.mouse`      | `u_mouse`      | Top-left-origin pointer position in pixels; +X right, +Y down |
| `uniforms.time`       | `u_time`       | Elapsed seconds                                               |

Custom uniforms are not part of the POC.

For future vertex support, Shdr will use WGSL-style canonical clip depth (`0..W` before perspective division); a GLSL vertex backend would remap Z to `-W..W`. For future textures, Shdr will define `(0, 0)` as the top-left texel and normalize resource upload per runtime backend rather than silently rewriting arbitrary UV expressions. CCW remains the canonical front-face convention, with backend pipeline state responsible for preserving it. Vertex authoring, textures, and culling controls remain outside this POC.

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

type ShaderBinaryOperator = "/";

interface VirtualBinaryOperation {
  kind: "binary-operation";
  operator: ShaderBinaryOperator;
  original: TextRange;
  generated: TextRange;
}

type VirtualOperation = VirtualBinaryOperation;

interface VirtualSource {
  code: string;
  mappings: SourceMapping[];
  operations: VirtualOperation[];
  shaderRegion: TextRange;
}
```

The filesystem-independent public entry point returns virtual source only after successful parsing and validation:

```ts
interface CreateVirtualSourceSuccess {
  readonly ok: true;
  readonly virtualSource: VirtualSource;
  readonly diagnostics: readonly [];
}

interface CreateVirtualSourceFailure {
  readonly ok: false;
  readonly diagnostics: readonly ShaderDiagnostic[];
  readonly shaderRegion?: TextRange;
}

type CreateVirtualSourceResult =
  | CreateVirtualSourceSuccess
  | CreateVirtualSourceFailure;

createVirtualSource(
  source: string,
  fileName?: string,
): CreateVirtualSourceResult;
```

Failure diagnostics use original-source coordinates, and no partial `VirtualSource` is returned. When the callback boundary was recognized before validation failed, `CreateVirtualSourceFailure.shaderRegion` preserves that original-source range for editor diagnostic routing. `VirtualSource.shaderRegion` also remains in original-source coordinates; generated positions are translated through its mappings.

Copied identifiers and expression fragments receive identity mappings. Each generated `__shdr_internal_div(...)` call maps to the complete original binary expression that produced it, and each generated `__shdr_internal_f32(...)` call maps to its original numeric literal. Each generated binary helper call also receives operator-neutral virtual-operation metadata with its operator and original/generated ranges. For nested division, every generated call maps to its corresponding inner or outer binary expression and has a distinct operation record.

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

This must produce `SHDR1205` on the complete original expression because Vec2 / Vec4 is unsupported. Successful lowering produces the generic binary IR node with `operator: "/"`, recursively lowered operands, and the matrix result type. Invalid semantic diagnostics use the same `Expr<...>` operand-type display as the sanitized TypeScript 7 editor diagnostic.

Every rule must have parity tests against:

1.  TypeScript virtual checking
2.  Shader compiler semantic analysis

A generated canonical rule table can be considered later.

## TypeScript 7 editor behavior

The language-service package will:

1. Register supported `.shdr.ts` files under a dedicated VS Code language ID.
2. Create and cache an in-memory virtual TypeScript representation by source version.
3. Ask TypeScript 7 to check the virtual file through an isolated adapter.
4. Preserve TypeScript syntactic and semantic diagnostics for ordinary code through identity mappings.
5. Use virtual semantic diagnostics for the complete shader callback.
6. Add shader diagnostics for unsupported syntax and semantic rules.
7. Map virtual diagnostics to original source ranges.
8. Route hover requests inside the shader callback to the virtual representation.
9. Return TypeScript 7 hover and diagnostic results for ordinary code elsewhere in the shader module.
10. Leave non-shader `.ts` files with the standard TypeScript editor provider.

Replacing diagnostics applies to the complete shader callback, not only to TypeScript arithmetic diagnostic codes. This is necessary because checking the original source may infer `/` as `number` and then produce cascading errors for later expressions such as `uv.x`. The dedicated language provider avoids publishing those original-source diagnostics and instead presents one mapped view produced from shader validation plus virtual TypeScript checking.

The POC does not depend on TypeScript 6 or the legacy tsserver plugin API. The real VS Code spike established that pinned TypeScript 7.0.2 does not ship diagnostic middleware or the newer content-mapper protocol. The selected integration therefore claims `.shdr.ts` through a dedicated VS Code language ID and uses `typescript/unstable/sync` with an in-memory filesystem overlay. The unstable API surface is limited to the language-service adapter; VS Code diagnostic and hover publication uses stable provider APIs.

TypeScript 7 API and protocol details remain isolated inside `@shdr/language-service`; they must not leak into `@shdr/core`. The browser REPL uses Babel Parser and the shader semantic analyzer and does not bundle TypeScript solely for compilation.

The behavior must have automated adapter tests for hover information and diagnostics, followed by verification using the workspace TypeScript 7 installation in a real VS Code session. Exact hover text is asserted only against the pinned TypeScript 7 version.

## Standalone tsc limitation

The editor adapter affects editor behavior but does not necessarily change:

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
  .shdr.ts source
         │
         ├──► Virtual TS transform
         │          │
         │          ▼
         │     TypeScript 7 adapter
         │
         ▼
  Shader lowering
         │
         ▼
  Typed shader IR
         │
         ├──► GLSL ES 3.00 generator
         │
         └──► WGSL generator
```

The compiler must not evaluate arbitrary source code.

## Growth-oriented internal representation

The normalized compiler syntax describes structure without baking current feature names into node shapes:

- Binary expressions carry a `ShaderBinaryOperator`; only `/` is initially accepted.
- Direct calls carry a callee name and arguments; semantic analysis classifies `vec4` as a constructor, while future built-in functions can use the same syntax node.
- Property access remains structurally generic; semantic analysis distinguishes uniforms from swizzles and validates each against the receiver type.

The typed IR uses dimensional scalar/vector type records and generic binary, call, and swizzle nodes. It can represent vector dimensions 2, 3, and 4 without requiring the POC source language to expose `Vec3` yet. Every accepted operator and call must still be explicitly typed, checked against the TypeScript virtual surface through parity tests, and emitted equivalently by both target generators. This representation is an extension boundary, not permission to silently accept unsupported language features.

The public IR shape includes:

```ts
type ShaderScalarKind = "f32";
type ShaderVectorSize = 2 | 3 | 4;

type ShaderValueType =
  | { kind: "scalar"; scalar: ShaderScalarKind }
  | { kind: "vector"; scalar: ShaderScalarKind; size: ShaderVectorSize };

interface ShaderExpressionBase {
  type: ShaderValueType;
  range: TextRange;
}

type ShaderExpression =
  | ShaderNumericLiteralExpression
  | ShaderBuiltinInputExpression
  | ShaderDefaultUniformExpression
  | ShaderLocalReferenceExpression
  | ShaderSwizzleExpression
  | ShaderBinaryExpression
  | ShaderCallExpression;

interface ShaderModule {
  kind: "shader-module";
  stage: "fragment";
  statements: readonly (ShaderConstDeclaration | ShaderReturnStatement)[];
  range: TextRange;
}
```

`fragment-position` is a semantic built-in input, default uniforms use semantic names, swizzles store component indices, and local declarations/references share module-local numeric symbol IDs. Every expression has a resolved `ShaderValueType` and original source range. The IR contains no parser nodes, TypeScript nodes, generated source names, target-language spellings, resource bindings, or coordinate-conversion nodes.

Semantic lowering processes const declarations in source order. An initializer can reference context bindings and previously declared locals, but not itself, a later declaration, an unknown or captured outer identifier, or a duplicate local. Default uniform properties resolve to their fixed semantic names and types; bare `uniforms` and unknown properties are errors. These failures return original-source diagnostics rather than partial modules.

## Shader targets

The POC generates both WebGL 2 / GLSL ES 3.00 and WGSL from the exact same target-neutral typed IR. GLSL is the rendered POC path; WGSL is generated and compile-validated in a WebGPU-capable browser without requiring WebGPU rendering.

### GLSL ES 3.00

Expected output:

```glsl
  #version 300 es
  precision highp float;

  uniform vec2 u_resolution;

  out vec4 shdr_fragment_color;

  void main() {
      vec4 shdr_coord = vec4(
          gl_FragCoord.x,
          u_resolution.y - gl_FragCoord.y,
          gl_FragCoord.z,
          gl_FragCoord.w
      );
      vec2 uv = shdr_coord.xy / u_resolution;
      vec4 color = vec4(uv.x, uv.y, 0.0, 1.0);
      shdr_fragment_color = color;
  }
```

Only explicitly or backend-implicitly referenced default uniforms need to be emitted. In GLSL, any use of `coord` implicitly references `resolution` for the Y-origin conversion.

### WGSL

WGSL output must include:

- A fragment entry point with a fragment-position built-in input
- A `@location(0) vec4<f32>` result
- Explicit WGSL scalar and vector type spellings
- A deterministic, documented bind-group/binding layout for referenced default uniforms
- Direct use of WebGPU fragment position for the DSL's canonical top-left framebuffer coordinates
- Equivalent local declarations, swizzles, division grouping, numeric values, and `vec4` construction

WGSL output must not contain GLSL directives, qualifiers, type spellings, or `gl_FragCoord`. The WGSL backend must not mutate or decorate the shared IR with target details.

The rendering demo may supply a hard-coded fullscreen-triangle vertex shader for WebGL. Vertex-shader authoring in the DSL and WebGPU rendering remain outside the POC.

## Core APIs

The filesystem-independent core exposes at least:

```ts
type ShaderTarget = "glsl-es-300" | "wgsl";

type LowerFragmentResult =
  | { ok: true; ir: ShaderModule; diagnostics: readonly [] }
  | {
      ok: false;
      ir?: undefined;
      diagnostics: readonly Diagnostic[];
    };

type CompileResult = LowerFragmentResult & {
  target: ShaderTarget;
  code?: string;
};

function createVirtualSource(source: string): VirtualSource;
function lowerFragment(source: string): LowerFragmentResult;
function generateFragment(ir: ShaderModule, target: ShaderTarget): string;
function compileFragment(
  source: string,
  options: { target: ShaderTarget },
): CompileResult;
```

`lowerFragment` parses and types source once; the REPL passes its exact IR result to both `generateFragment` targets. `compileFragment` is the single-target convenience API used by adapters such as Vite. All diagnostic ranges returned by the core refer to the original source. None of these APIs reads files or resolves modules from the filesystem.

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
      target-neutral shader IR
      GLSL and WGSL generation

    language-service/
      TypeScript 7 editor adapter
      hover and diagnostic routing

    vite/
      Vite transformation adapter
```

`@shdr/core` must remain filesystem-independent and browser-compatible. Babel Parser is included in the REPL bundle for the POC, and its bundle-size impact must be measured during the browser phase.

The Vite adapter transforms a shader source file into a JavaScript module whose default export is the generated GLSL string:

```js
export default "...generated GLSL...";
```

It must not return raw GLSL as though it were JavaScript module source.

## Testing strategy

The POC includes automated tests at each boundary:

- Golden tests for generated virtual TypeScript and source mappings
- Programmatic language-service tests for QuickInfo and diagnostics
- Mapping and virtual-operation metadata tests for operands, generated helper calls, numeric literals, and nested expressions
- A parity matrix that runs every operator and constructor rule through both virtual TypeScript checking and shader semantic analysis
- Target-neutral shader IR assertions plus GLSL and WGSL snapshots
- Cross-target coordinate-convention tests, including pixel centers, Y orientation, and implicit backend dependencies
- Same-frozen-IR backend parity and non-mutation tests
- WebGL 2 shader compilation and linking in a real browser
- Vite development-transform and production-build integration tests
- A Playwright pixel test for the rendered gradient, using tolerances for implementation-dependent rendering differences

The automated language-service tests are followed by the manual VS Code go/no-go checklist from the first milestone. The browser REPL also records manual GLSL rendering and WGSL shader-module compilation in a pinned WebGPU-capable browser.

## Implementation order

1. Define branded shader types.
1. Parse the strict source boundary through the private Babel Parser adapter.
1. Implement `/` and numeric-literal virtual transformations.
1. Add explicit `__shdr_internal_div` overloads.
1. Implement source-to-virtual mappings.
1. Prove a viable TypeScript 7 editor extension point.
1. Demonstrate real VS Code hovers and diagnostics.
1. Test invalid and nested division.
1. Generalize normalized binary/call syntax and virtual-operation metadata without expanding the accepted language.
1. Define the growth-oriented shader IR.
1. Implement semantic lowering, both initial `vec4` overloads, and parity tests.
1. Generate and validate WebGL 2 GLSL.
1. Generate WGSL from the same frozen IR and test backend parity.
1. Add the GLSL-targeted Vite adapter.
1. Add the multi-target browser REPL, GLSL rendering, and browser WGSL compilation check.

## Final acceptance criteria

The POC succeeds when:

- Operator syntax remains intact in source.
- VS Code reports `uv` as `Expr<Vec2<F32>>`.
- Native arithmetic errors are not surfaced inside the shader boundary.
- Invalid shader operations produce mapped diagnostics.
- Ordinary TypeScript remains unaffected.
- Nested division and numeric literals have shader semantics.
- The generated GLSL compiles and renders in WebGL 2.
- The exact same typed IR generates deterministic GLSL and WGSL without target-conditioned lowering.
- Both backends preserve top-left framebuffer and `0..1` fragment-depth semantics.
- A WebGPU-capable browser reports no WGSL shader-module compilation errors.
- Vite and the multi-target browser REPL share the same compiler core.

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
- WebGPU rendering
- Optimization passes
- Complete refactoring and rename support
- Production-quality source maps
