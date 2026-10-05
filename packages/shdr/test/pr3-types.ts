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
// @ts-expect-error Vector x needs vector bounds.
clamp(v3, s, s);
// @ts-expect-error Mixed vector dimensions are not accepted.
clamp(v3, v2, v3);
// @ts-expect-error Scalar exponent is deliberately excluded.
pow(v3, s);
// @ts-expect-error Vector exponent with scalar base is excluded.
pow(s, v3);
// @ts-expect-error Mismatched vector shapes are excluded.
pow(v2, v3);
// @ts-expect-error Wrong arity.
sqrt(s, s);
// @ts-expect-error Wrong arity.
clamp(s, s);
// @ts-expect-error No boolean inputs.
exp(true);
