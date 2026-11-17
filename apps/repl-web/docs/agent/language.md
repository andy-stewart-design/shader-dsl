# REPL shader language

REPL source is TypeScript-shaped but is a restricted shader language. The compiler recognizes shader expressions and lowers them; it never evaluates authored JavaScript at runtime.

## Values and expressions

The available expression types are `Expr<F32>`, `Expr<Vec2<F32>>`, `Expr<Vec3<F32>>`, `Expr<Vec4<F32>>`, `Expr<Mat2<F32>>`, `Expr<Mat3<F32>>`, and `Expr<Mat4<F32>>`. Numeric literals are shader `f32` values. Supported operators are `+`, `-`, `*`, and `/`, subject to shader type checking. Parentheses preserve grouping.

Vectors expose `x/y/z/w` and `r/g/b/a` swizzles appropriate to their size. A swizzle of one to four components produces a scalar or vector expression:

```ts example=main
const p = coord.xy / u.resolution;
const mirrored = vec2(1 - p.x, p.y);
return vec4(mirrored, 0, 1);
```

Use the constructors and builtins documented in the other topics rather than ordinary JavaScript math. Matrix values can be constructed and passed to supported operators where the compiler permits them; math builtins themselves accept scalar/vector shapes only.

## Main and Utils rules

Main is the body inserted inside a generated callback. It is not the callback declaration itself. The generated callback may destructure `coord`, `uniforms`, and/or `u`; Main must return a vec4 expression. `coord` is `Expr<Vec4<F32>>`; the default inputs are `resolution: Expr<Vec2<F32>>`, `mouse: Expr<Vec2<F32>>`, and `time: Expr<F32>`. `u` and `uniforms` are aliases.

Utils is placed before that callback and is for top-level `defineShaderFunction` helpers and finite constants. Give helper parameters explicit expression types:

```ts example=paired
// Utils
const wave = defineShaderFunction((x: Expr<F32>): Expr<F32> => {
  return sin(x) * 0.5 + 0.5;
});

// Main
const uv = coord.xy / u.resolution;
const value = wave(uv.x + u.time);
return vec4(value, value, value, 1);
```

Helpers may use their parameters, supported expressions, and direct calls to helpers declared in Utils. Implicit values are not captured: pass `coord`, `u` fields, or other expressions as explicit call arguments. Helpers must not capture host state, mutable values, nested functions, or asynchronous code. Forward references between helpers and matrix-valued helper parameters are supported where their types are valid. A helper-only Utils document still needs a helper result that is an expression.

Do not write imports, exports, `function` declarations, arbitrary object/array logic, loops, promises, DOM calls, or host-side conditionals in the editor documents. Diagnostics are compile diagnostics; a failed edit does not execute JavaScript or install a new preview.

## Common pattern

This paired example shows the two editor documents. The `// Utils` and `// Main` labels are extraction metadata for this documentation example, not code that should be moved into a complete module:

```ts example=paired
// Utils
const ring = defineShaderFunction((p: Expr<Vec2<F32>>): Expr<F32> => {
  return length(p) - 0.25;
});

// Main
const uv = coord.xy / u.resolution;
const centered = uv * 2 - 1;
const glow = clamp(1 - abs(ring(centered)), 0, 1);
return vec4(glow, glow * 0.4, 0.1, 1);
```

The helper call is compiled as shader code. It is not a JavaScript function call with a host value.
