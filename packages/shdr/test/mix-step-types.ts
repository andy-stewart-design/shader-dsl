import { mix, step } from "../src/index.js";
import type { Expr, F32, Vec2, Vec3, Vec4 } from "../src/index.js";

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

declare const s: Expr<F32>;
declare const v2: Expr<Vec2<F32>>;
declare const v3: Expr<Vec3<F32>>;
declare const v4: Expr<Vec4<F32>>;

const results = [
  mix(s, s, s),
  mix(v2, v2, s),
  mix(v2, v2, v2),
  mix(v3, v3, s),
  mix(v3, v3, v3),
  mix(v4, v4, s),
  mix(v4, v4, v4),
  step(s, s),
  step(s, v2),
  step(v2, v2),
  step(s, v3),
  step(v3, v3),
  step(s, v4),
  step(v4, v4),
] as const;

type Signatures = [
  Expect<Equal<(typeof results)[0], Expr<F32>>>,
  Expect<Equal<(typeof results)[1], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof results)[2], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof results)[3], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof results)[4], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof results)[5], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof results)[6], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof results)[7], Expr<F32>>>,
  Expect<Equal<(typeof results)[8], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof results)[9], Expr<Vec2<F32>>>>,
  Expect<Equal<(typeof results)[10], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof results)[11], Expr<Vec3<F32>>>>,
  Expect<Equal<(typeof results)[12], Expr<Vec4<F32>>>>,
  Expect<Equal<(typeof results)[13], Expr<Vec4<F32>>>>,
];
void (0 as unknown as Signatures);

// @ts-expect-error Endpoint dimensions must agree.
mix(v2, v3, s);
// @ts-expect-error A vector factor must match both endpoints.
mix(v3, v3, v2);
// @ts-expect-error Scalar endpoints cannot use a vector factor.
mix(s, s, v2);
// @ts-expect-error Interpolation requires three arguments.
mix(v2, v2);
// @ts-expect-error Vector edges cannot be used with scalar input.
step(v2, s);
// @ts-expect-error Vector edge and input dimensions must agree.
step(v3, v4);
// @ts-expect-error Threshold requires two arguments.
step(s);
