# PR 2 language slice — semantic contract (Phase 2.1)

Status: **frozen in Phase 2.1; implemented in Phase 2.2**. This is the semantic contract for the expanded source language. Changes to it require an explicit decision and parity-test updates; public usage documentation follows in Phase 2.3.

## Scope and types

All values are `Expr<T>` with `T` in `F32`, `Vec2<F32>`, `Vec3<F32>`, or `Vec4<F32>`. Use `S` for `F32` and `V2`/`V3`/`V4` for those vector types. Source numeric literals are `Expr<F32>` inside the callback. No integers, implicit dimension conversions, booleans, matrices, or scalar/vector broadcasting beyond the explicit rules below. `coord` remains `Vec4`, existing default uniforms keep their types, and a fragment shader still returns `Expr<Vec4<F32>>`.

The module boundary, direct named imports from exactly `"shdr"`, callback shape, `const`-only declarations, one final return, and no arbitrary JavaScript/TypeScript execution remain unchanged. `vec2` and `vec3` become additional named shader callable imports; import aliases, closures, type annotations, and unsupported calls remain errors.

## Arithmetic rules

All binary results have the left operand's type. Operations are component-wise for same-size vectors; vector/scalar operations apply the scalar to each vector component. Division preserves the POC's numerator/denominator ordering. Let `V` mean any **one** of `V2`, `V3`, or `V4` (both occurrences in a row must have the same dimension):

| Operator  | Accepted `(left, right) → result` | Rejected examples                         |
| --------- | --------------------------------- | ----------------------------------------- |
| `+`       | `(S,S)→S`, `(V,V)→V`              | `(V2,S)`, `(S,V2)`, `(V2,V3)`             |
| `-`       | `(S,S)→S`, `(V,V)→V`              | `(V3,S)`, `(S,V3)`, `(V4,V2)`             |
| `*`       | `(S,S)→S`, `(V,V)→V`, `(V,S)→V`   | `(S,V2)`, `(V2,V4)`                       |
| `/`       | `(S,S)→S`, `(V,V)→V`, `(V,S)→V`   | `(S,V2)`, `(V3,V4)`                       |
| unary `-` | `S→S`, `V→V`                      | all well-typed shader values are accepted |

This adds `V3` to the existing `/` matrix without changing any existing division rules. No implicit `S+V`, `S-V`, `S*V`, `S/V`, `V+S`, or `V-S`, **even where GLSL or WGSL permits it**. Arithmetic with unequal vector sizes is always rejected. No `%`, `**`, unary `+`, `!`, `~`, update, compound assignment, or comparisons. Signed zero and division-by-zero behavior are not being redesigned; no constant folding is introduced.

Use `SHDR1205` on the _complete binary expression_ for invalid operand pairs, preserving the sanitized `Expr<...>` operand-type display already used for `/`. Every successfully lowered shader value is valid under unary `-`; an invalid operand retains its existing diagnostic (for example, bare `uniforms` reports `SHDR1203`), so there is no new unary-type diagnostic. Unsupported unary operator spellings remain `SHDR1105`. For nested expressions, diagnose the smallest failing operation without leaking virtual helper names. The TypeScript 7 helper-overload matrix and semantic lowerer must agree for each pair (`4 × 4` per binary operator, plus unary over each available value type).

## Constructors

`vec2` and `vec3` each accept exactly these source forms, with an ordered-arguments constructor IR node:

| Constructor | Accepted arguments       | Result |
| ----------- | ------------------------ | ------ |
| `vec2`      | `(S)`, `(S,S)`, `(V2)`   | `V2`   |
| `vec3`      | `(S)`, `(S,S,S)`, `(V3)` | `V3`   |

One scalar splats; a same-type vector is copied; all-scalar forms use component order. `vec4` retains exactly its existing `(S)`, `(S,S,S,S)`, `(V2,S,S)`, and `(V4)` forms. Other packings (including `vec3(V2,S)` and `vec4(V3,S)`), wrong arities, and wrong argument types report `SHDR1206` over the complete call. In particular, don't accept arbitrary GLSL/WGSL constructor combinations just because either target supports them. The constructor IR stays target-neutral; generators spell these as `vecN(...)` in GLSL ES 3.00 and `vecN<f32>(...)` in WGSL.

## Read swizzles

For a vector of dimension `N`, a direct non-computed property is a supported swizzle iff its spelling is 1–4 characters from `xyzw` and _each_ component index is less than `N`. Repetition and reordering are allowed. Length 1 gives `S`; lengths 2, 3, and 4 give `V2`, `V3`, and `V4` respectively, regardless of receiver dimension. For example, `coord.xyzw: V4`, `coord.w: S`, `coord.xyz: V3`, `vec3Value.zyx: V3`, and `vec2Value.xxyy: V4`. Swizzles may be chained on their resulting vector type. `uniforms.resolution`, `.mouse`, and `.time` continue to resolve as uniform properties, not swizzles.

For invalid read swizzles, report `SHDR1204` at the property-name range: unavailable component (`vec2Value.z`, `vec3Value.w`), bad spelling/length (`coord.rgba`, `coord.xxxxx`, `coord.q`), or scalar receiver (`coord.x.x`). `rgba` and mixed alphabets are intentionally excluded even though shader targets have aliases. Writes, computed properties, and optional access remain unsupported syntax (do not treat them as read swizzles). The public `Expr<T>` type, virtual TypeScript checking, and IR result type must agree for all four possible output lengths and all three receiver dimensions.

## Grouping, numeric literals, and source ranges

Use TypeScript/JavaScript source precedence: property access and calls bind tightest; unary `-` binds tighter than `*` and `/`; `*` and `/` bind tighter than `+` and binary `-`; the binary groups associate left-to-right. Explicit parentheses override this. Preserve the source parse tree in virtual helpers and typed IR; generators may fully parenthesize to avoid differing target-parser rules. Examples:

| Source        | Required grouping    |
| ------------- | -------------------- |
| `a + b * c`   | `a + (b * c)`        |
| `a - b - c`   | `(a - b) - c`        |
| `a / b * c`   | `(a / b) * c`        |
| `a / (b / c)` | `a / (b / c)`        |
| `-1 / 2`      | `(-f32(1)) / f32(2)` |
| `a - -b`      | `a - (-b)`           |
| `-(a + b)`    | `-(a + b)`           |

`f32(...)` above denotes the **virtual** numeric-literal conversion, not user-callable shader syntax. Source `-1` is a unary operator applied to a shader-typed numeric literal, not an unsigned literal and not ordinary JavaScript arithmetic. Each generated unary/binary helper gets the complete corresponding original expression range; identity mappings remain on operands/property identifiers. No operator helper may appear in diagnostics. Existing supported numeric forms keep their POC meaning; no new numeric syntax or evaluation rules are added.

## Representative source cases

Valid whole fragment:

```ts
import { createFragmentShader, vec3, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  const rgb = vec3(uv.x, uv.y, uniforms.time);
  const shifted = -rgb + vec3(1);
  const scaled = shifted * 0.5;
  const reordered = scaled.zyx;
  return vec4(reordered.x, reordered.y, reordered.z, 1);
});
```

The following _individual replacements_ inside a valid shader callback must fail (use a final valid `vec4` return when testing each declaration):

| Expression                 | Reason                             | Expected diagnostic               |
| -------------------------- | ---------------------------------- | --------------------------------- |
| `coord.xy + uniforms.time` | `V2+S` is not in the matrix        | `SHDR1205` over binary expression |
| `uniforms.time * coord.xy` | `S*V2` deliberately deferred       | `SHDR1205` over binary expression |
| `coord.xyz / coord.xy`     | unequal vector dimensions          | `SHDR1205` over binary expression |
| `vec3(coord.xy, 1)`        | mixed constructor packing deferred | `SHDR1206` over call              |
| `vec2(coord.xyz)`          | wrong constructor argument type    | `SHDR1206` over call              |
| `coord.xy.z`               | unavailable receiver component     | `SHDR1204` over `z`               |
| `coord.x.x`                | scalar has no swizzles             | `SHDR1204` over final `x`         |
| `coord.rgba`               | excluded component alphabet        | `SHDR1204` over `rgba`            |
| `coord.xyzwx`              | length five                        | `SHDR1204` over `xyzwx`           |

Positive parity coverage must also include all allowed operator pairs across `S`, `V2`, `V3`, `V4`; unary `-` on every type; constructor splat/component/copy forms; repeated four-component swizzles on `V2` and `V3`; chained swizzles; mixed precedence, parentheses, and literals. Negative parity coverage must cover each rejected shape, not just the examples above.

## Target support and verification gate

This is a deliberately **narrower** common subset of GLSL ES 3.00 and WGSL f32/vector arithmetic. WGSL's [arithmetic expression rules](https://www.w3.org/TR/WGSL/#arithmetic-expr) include matching scalar/vector types, vector/vector component-wise operations, and vector/scalar operations; its [vector decomposition rules](https://www.w3.org/TR/WGSL/#vector-access-expr) admit repeated 2–4 component `xyzw` reads subject to receiver dimension. The [GLSL ES 3.00 specification](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf) defines scalar/vector arithmetic, vector constructors, and component selection. Neither backend should silently expand the DSL matrix based on host-language permissiveness.

Phase 2.1 validation: [`packages/core/test/language-slice-target-feasibility.test.ts`](../../packages/core/test/language-slice-target-feasibility.test.ts) compile-checks raw GLSL ES 3.00 and WGSL fragment sources covering every arithmetic result type and accepted operand shape, plus constructor copy/splat/component and repeated swizzle forms. The test passed in Playwright Chromium 153.0.8010.12 using WebGL 2 and WebGPU. This establishes target support, **not** DSL virtual-checker/core/backend parity, which is Phase 2.2. Any later browser/compiler rejection should narrow this specification rather than add target-conditioned lowering.
