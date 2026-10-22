import { dFdx, dFdy, fwidth } from "../src/index.js";
import type { Expr, F32, Mat2, Mat3, Mat4, Vec2, Vec3, Vec4 } from "../src/types.js";

const scalar = {} as Expr<F32>;
const v2 = {} as Expr<Vec2<F32>>;
const v3 = {} as Expr<Vec3<F32>>;
const v4 = {} as Expr<Vec4<F32>>;
const m2 = {} as Expr<Mat2<F32>>;
const m3 = {} as Expr<Mat3<F32>>;
const m4 = {} as Expr<Mat4<F32>>;

const scalars: readonly [Expr<F32>, Expr<F32>, Expr<F32>][] = [
  [dFdx(scalar), dFdy(scalar), fwidth(scalar)],
];
const vectors2: readonly [Expr<Vec2<F32>>, Expr<Vec2<F32>>, Expr<Vec2<F32>>][] = [
  [dFdx(v2), dFdy(v2), fwidth(v2)],
];
const vectors3: readonly [Expr<Vec3<F32>>, Expr<Vec3<F32>>, Expr<Vec3<F32>>][] = [
  [dFdx(v3), dFdy(v3), fwidth(v3)],
];
const vectors4: readonly [Expr<Vec4<F32>>, Expr<Vec4<F32>>, Expr<Vec4<F32>>][] = [
  [dFdx(v4), dFdy(v4), fwidth(v4)],
];
void [scalars, vectors2, vectors3, vectors4];

// @ts-expect-error Derivatives require shader expressions, not host numbers.
dFdx(1);
// @ts-expect-error Derivatives have exact unary arity.
dFdy(scalar, scalar);
// @ts-expect-error Derivatives reject mismatched vectors.
fwidth(v2 as Expr<Vec2<F32>> | Expr<Vec3<F32>>);
// @ts-expect-error Derivatives reject matrices.
dFdx(m2);
// @ts-expect-error Derivatives reject matrices.
dFdy(m3);
// @ts-expect-error Derivatives reject matrices.
fwidth(m4);
// @ts-expect-error Derivatives reject mixed vector dimensions.
dFdx(v2, v3);
