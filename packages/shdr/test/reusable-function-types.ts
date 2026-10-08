import { defineShaderFunction, vec2, vec3, vec4 } from "../src/index.js";
import { __shdr_internal_add } from "../src/internal.js";
import type {
  Expr,
  F32,
  Vec2,
  Vec3,
  Vec4,
  ShaderFunction,
} from "../src/index.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;
declare const scalar: Expr<F32>;
declare const v2: Expr<Vec2<F32>>;
declare const v3: Expr<Vec3<F32>>;
declare const v4: Expr<Vec4<F32>>;

const scalarFn = defineShaderFunction((x: Expr<F32>) => x);
const vec2Fn = defineShaderFunction((x: Expr<Vec2<F32>>) => x);
const vec3Fn = defineShaderFunction((x: Expr<Vec3<F32>>) => x);
const vec4Fn = defineShaderFunction((x: Expr<Vec4<F32>>) => x);
const composed = defineShaderFunction(
  (p: Expr<Vec2<F32>>, x: Expr<F32>): Expr<Vec4<F32>> =>
    vec4(vec3(__shdr_internal_add(vec2Fn(p).x, scalarFn(x))), x),
);
const a = scalarFn(scalar);
const b = vec2Fn(v2);
const c = vec3Fn(v3);
const d = vec4Fn(v4);
const e = composed(v2, scalar);
export type InferredReturns = [
  Expect<Equal<typeof a, Expr<F32>>>,
  Expect<Equal<typeof b, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof c, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof d, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof e, Expr<Vec4<F32>>>>,
];
export type Marker = Expect<
  Equal<typeof scalarFn, ShaderFunction<[x: Expr<F32>], Expr<F32>>>
>;

// @ts-expect-error A concrete scalar signature cannot accept a vector.
scalarFn(v2);
// @ts-expect-error A vec2 signature cannot accept vec3.
vec2Fn(v3);
// @ts-expect-error A vec3 signature cannot accept vec4.
vec3Fn(v4);
// @ts-expect-error A vec4 signature cannot accept a scalar.
vec4Fn(scalar);
// @ts-expect-error Exact arity is retained.
scalarFn();
// @ts-expect-error Exact arity is retained.
scalarFn(scalar, scalar);
// @ts-expect-error Ordinary JS values are not expression parameters.
defineShaderFunction((x: number) => vec2(x));
// @ts-expect-error Return must be a shader expression, not a host value.
defineShaderFunction((x: Expr<F32>) => 1);
// @ts-expect-error An explicit return annotation must match the body.
defineShaderFunction((x: Expr<F32>): Expr<Vec2<F32>> => x);
// @ts-expect-error Ordinary functions do not carry the source marker brand.
const ordinary: typeof scalarFn = (x: Expr<F32>) => x;
export { ordinary };
