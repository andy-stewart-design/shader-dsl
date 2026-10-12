import { clamp, exp, pow, sqrt, tanh } from "../src/index.js";
import type { Expr, F32, Vec2, Vec3, Vec4 } from "../src/index.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

declare const s: Expr<F32>;
declare const v2: Expr<Vec2<F32>>;
declare const v3: Expr<Vec3<F32>>;
declare const v4: Expr<Vec4<F32>>;
const results = [
  sqrt(s),
  sqrt(v2),
  sqrt(v3),
  sqrt(v4),
  exp(s),
  exp(v2),
  exp(v3),
  exp(v4),
  tanh(s),
  tanh(v2),
  tanh(v3),
  tanh(v4),
  clamp(s, s, s),
  clamp(v2, v2, v2),
  clamp(v3, v3, v3),
  clamp(v4, v4, v4),
  pow(s, s),
  pow(v2, v2),
  pow(v3, v3),
  pow(v4, v4),
] as const;
type Types = [
  Expect<Equal<(typeof results)[0], Expr<F32>>>,
  Expect<Equal<(typeof results)[1], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof results)[2], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof results)[3], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof results)[4], Expr<F32>>>,
  Expect<Equal<(typeof results)[5], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof results)[6], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof results)[7], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof results)[8], Expr<F32>>>,
  Expect<Equal<(typeof results)[9], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof results)[10], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof results)[11], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof results)[12], Expr<F32>>>,
  Expect<Equal<(typeof results)[13], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof results)[14], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof results)[15], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof results)[16], Expr<F32>>>,
  Expect<Equal<(typeof results)[17], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof results)[18], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof results)[19], Expr<Vec4<F32>>>>,
];
void (0 as unknown as Types);
const mixedResults = [
  clamp(v2, s, s),
  clamp(v2, s, v2),
  clamp(v2, v2, s),
  pow(v2, s),
  clamp(v3, s, s),
  clamp(v3, s, v3),
  clamp(v3, v3, s),
  pow(v3, s),
  clamp(v4, s, s),
  clamp(v4, s, v4),
  clamp(v4, v4, s),
  pow(v4, s),
] as const;
type MixedTypes = [
  Expect<Equal<(typeof mixedResults)[0], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof mixedResults)[1], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof mixedResults)[2], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof mixedResults)[3], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof mixedResults)[4], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof mixedResults)[5], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof mixedResults)[6], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof mixedResults)[7], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof mixedResults)[8], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof mixedResults)[9], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof mixedResults)[10], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof mixedResults)[11], Expr<Vec4<F32>>>>,
];
void (0 as unknown as MixedTypes);
// @ts-expect-error Scalar-first clamp does not broadcast vector bounds.
clamp(s, v2, v2);
// @ts-expect-error Mixed vector dimensions are not accepted.
clamp(v3, v2, v3);
// @ts-expect-error Scalar base with vector exponent is deliberately excluded.
pow(s, v3);
// @ts-expect-error Mismatched vector shapes are excluded.
pow(v2, v3);
// @ts-expect-error Wrong arity.
sqrt(s, s);
// @ts-expect-error Wrong arity.
clamp(s, s);
// @ts-expect-error No boolean inputs.
exp(true);
