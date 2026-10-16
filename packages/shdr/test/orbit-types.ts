import { acos, asin, atan, degrees, mod, radians } from "../src/index.js";
import type { Expr, F32, Vec2, Vec3, Vec4 } from "../src/types.js";

const scalar = {} as Expr<F32>;
const vector2 = {} as Expr<Vec2<F32>>;
const vector3 = {} as Expr<Vec3<F32>>;
const vector4 = {} as Expr<Vec4<F32>>;

const scalarResults: readonly Expr<F32>[] = [
  asin(scalar),
  acos(scalar),
  atan(scalar),
  radians(scalar),
  degrees(scalar),
];
const vector2Results: readonly Expr<Vec2<F32>>[] = [
  asin(vector2),
  acos(vector2),
  atan(vector2),
  radians(vector2),
  degrees(vector2),
];
const vector3Results: readonly Expr<Vec3<F32>>[] = [
  asin(vector3),
  acos(vector3),
  atan(vector3),
  radians(vector3),
  degrees(vector3),
];
const vector4Results: readonly Expr<Vec4<F32>>[] = [
  asin(vector4),
  acos(vector4),
  atan(vector4),
  radians(vector4),
  degrees(vector4),
];
const modResults: readonly [
  Expr<F32>,
  Expr<Vec2<F32>>,
  Expr<Vec2<F32>>,
  Expr<Vec3<F32>>,
  Expr<Vec3<F32>>,
  Expr<Vec4<F32>>,
  Expr<Vec4<F32>>,
] = [
  mod(scalar, scalar),
  mod(vector2, vector2),
  mod(vector2, scalar),
  mod(vector3, vector3),
  mod(vector3, scalar),
  mod(vector4, vector4),
  mod(vector4, scalar),
];

void scalarResults;
void vector2Results;
void vector3Results;
void vector4Results;
void modResults;

// @ts-expect-error Unary orbit math has exact arity.
asin(scalar, scalar);
// @ts-expect-error Unary orbit math does not accept mismatched vectors.
acos(vector2, vector3);
// @ts-expect-error Unary orbit math does not accept a host number.
atan(1);
// @ts-expect-error Unary orbit math has exact arity.
radians(vector2, vector2);
// @ts-expect-error Unary orbit math does not accept a scalar/vector union.
degrees(scalar as Expr<F32> | Expr<Vec2<F32>>);
// @ts-expect-error Scalar-first vector mod is intentionally excluded.
mod(scalar, vector2);
// @ts-expect-error Mixed vector dimensions are excluded.
mod(vector2, vector3);
// @ts-expect-error Mod has exact arity.
mod(vector4);
