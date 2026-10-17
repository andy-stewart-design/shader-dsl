import { mat2, mat3, mat4, vec2, vec3, vec4 } from "../src/index.js";
import {
  __shdr_internal_add,
  __shdr_internal_div,
  __shdr_internal_mul,
  __shdr_internal_sub,
} from "../src/internal.js";
import type {
  Expr,
  F32,
  Mat2,
  Mat3,
  Mat4,
  Vec2,
  Vec3,
  Vec4,
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
declare const matrix2: Expr<Mat2<F32>>;
declare const matrix3: Expr<Mat3<F32>>;
declare const matrix4: Expr<Mat4<F32>>;

const m2Diagonal = mat2(scalar);
const m2Coefficients = mat2(scalar, scalar, scalar, scalar);
const m2Columns = mat2(v2, v2);
const m2Copy = mat2(matrix2);
const m3Diagonal = mat3(scalar);
const m3Coefficients = mat3(
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
);
const m3Columns = mat3(v3, v3, v3);
const m3Copy = mat3(matrix3);
const m4Diagonal = mat4(scalar);
const m4Coefficients = mat4(
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
  scalar,
);
const m4Columns = mat4(v4, v4, v4, v4);
const m4Copy = mat4(matrix4);

const add2 = __shdr_internal_add(matrix2, matrix2);
const add3 = __shdr_internal_add(matrix3, matrix3);
const add4 = __shdr_internal_add(matrix4, matrix4);
const sub2 = __shdr_internal_sub(matrix2, matrix2);
const sub3 = __shdr_internal_sub(matrix3, matrix3);
const sub4 = __shdr_internal_sub(matrix4, matrix4);
const mul2s = __shdr_internal_mul(matrix2, scalar);
const mul2sLeft = __shdr_internal_mul(scalar, matrix2);
const mul2v = __shdr_internal_mul(matrix2, v2);
const mul2vLeft = __shdr_internal_mul(v2, matrix2);
const mul2m = __shdr_internal_mul(matrix2, matrix2);
const mul3s = __shdr_internal_mul(matrix3, scalar);
const mul3sLeft = __shdr_internal_mul(scalar, matrix3);
const mul3v = __shdr_internal_mul(matrix3, v3);
const mul3vLeft = __shdr_internal_mul(v3, matrix3);
const mul3m = __shdr_internal_mul(matrix3, matrix3);
const mul4s = __shdr_internal_mul(matrix4, scalar);
const mul4sLeft = __shdr_internal_mul(scalar, matrix4);
const mul4v = __shdr_internal_mul(matrix4, v4);
const mul4vLeft = __shdr_internal_mul(v4, matrix4);
const mul4m = __shdr_internal_mul(matrix4, matrix4);

export type ConstructorResults = [
  Expect<Equal<typeof m2Diagonal, Expr<Mat2<F32>>>>,
  Expect<Equal<typeof m2Coefficients, Expr<Mat2<F32>>>>,
  Expect<Equal<typeof m2Columns, Expr<Mat2<F32>>>>,
  Expect<Equal<typeof m2Copy, Expr<Mat2<F32>>>>,
  Expect<Equal<typeof m3Diagonal, Expr<Mat3<F32>>>>,
  Expect<Equal<typeof m3Coefficients, Expr<Mat3<F32>>>>,
  Expect<Equal<typeof m3Columns, Expr<Mat3<F32>>>>,
  Expect<Equal<typeof m3Copy, Expr<Mat3<F32>>>>,
  Expect<Equal<typeof m4Diagonal, Expr<Mat4<F32>>>>,
  Expect<Equal<typeof m4Coefficients, Expr<Mat4<F32>>>>,
  Expect<Equal<typeof m4Columns, Expr<Mat4<F32>>>>,
  Expect<Equal<typeof m4Copy, Expr<Mat4<F32>>>>,
];

export type OperatorResults = [
  Expect<Equal<typeof add2, Expr<Mat2<F32>>>>,
  Expect<Equal<typeof add3, Expr<Mat3<F32>>>>,
  Expect<Equal<typeof add4, Expr<Mat4<F32>>>>,
  Expect<Equal<typeof sub2, Expr<Mat2<F32>>>>,
  Expect<Equal<typeof sub3, Expr<Mat3<F32>>>>,
  Expect<Equal<typeof sub4, Expr<Mat4<F32>>>>,
  Expect<Equal<typeof mul2s, Expr<Mat2<F32>>>>,
  Expect<Equal<typeof mul2sLeft, Expr<Mat2<F32>>>>,
  Expect<Equal<typeof mul2v, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof mul2vLeft, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof mul2m, Expr<Mat2<F32>>>>,
  Expect<Equal<typeof mul3s, Expr<Mat3<F32>>>>,
  Expect<Equal<typeof mul3sLeft, Expr<Mat3<F32>>>>,
  Expect<Equal<typeof mul3v, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof mul3vLeft, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof mul3m, Expr<Mat3<F32>>>>,
  Expect<Equal<typeof mul4s, Expr<Mat4<F32>>>>,
  Expect<Equal<typeof mul4sLeft, Expr<Mat4<F32>>>>,
  Expect<Equal<typeof mul4v, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof mul4vLeft, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof mul4m, Expr<Mat4<F32>>>>,
];

// @ts-expect-error Zero arguments are not a matrix constructor family.
mat2();
// @ts-expect-error Explicit coefficients require exactly four scalar arguments.
mat2(scalar, scalar, scalar);
// @ts-expect-error A matrix cannot be packed with scalar arguments.
mat2(matrix2, scalar, scalar, scalar);
// @ts-expect-error Matrix sizes cannot be converted implicitly.
mat3(matrix2);
// @ts-expect-error Matrix sizes cannot be converted implicitly.
mat2(matrix3);
// @ts-expect-error A vector is not a one-argument matrix constructor.
mat2(v2);
// @ts-expect-error Columns must have the exact matrix size.
mat3(v2, v2, v2);
// @ts-expect-error Matrices do not expose component accessors.
matrix2.xy;
// @ts-expect-error Matrices do not expose indexing.
matrix2[0];
// @ts-expect-error Matrix division remains rejected.
__shdr_internal_div(matrix2, scalar);
// @ts-expect-error Matrix sizes must match.
__shdr_internal_add(matrix2, matrix3);
// @ts-expect-error Matrix/scalar addition remains rejected.
__shdr_internal_add(matrix2, scalar);
// @ts-expect-error Scalar-left vector multiplication remains rejected.
__shdr_internal_mul(scalar, v2);
// @ts-expect-error Matrix sizes must match.
__shdr_internal_mul(matrix2, matrix3);

void [
  m2Diagonal,
  m2Coefficients,
  m2Columns,
  m2Copy,
  m3Diagonal,
  m3Coefficients,
  m3Columns,
  m3Copy,
  m4Diagonal,
  m4Coefficients,
  m4Columns,
  m4Copy,
  vec2,
  vec3,
  vec4,
];
