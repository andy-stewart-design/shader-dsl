import * as shdr from "../src/index.js";
import { createFragmentShader, vec2, vec3, vec4 } from "../src/index.js";
import {
  __shdr_internal_add,
  __shdr_internal_div,
  __shdr_internal_f32,
  __shdr_internal_mul,
  __shdr_internal_neg,
  __shdr_internal_sub,
} from "../src/internal.js";
import type {
  Expr,
  F32,
  FragmentShaderSource,
  Vec2,
  Vec3,
  Vec4,
} from "../src/index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

declare const scalar: Expr<F32>;
declare const vector2: Expr<Vec2<F32>>;
declare const vector3: Expr<Vec3<F32>>;
declare const vector4: Expr<Vec4<F32>>;

const literal = __shdr_internal_f32(1);
const scalarByScalar = __shdr_internal_div(scalar, scalar);
const vector2ByScalar = __shdr_internal_div(vector2, scalar);
const vector2ByVector2 = __shdr_internal_div(vector2, vector2);
const vector4ByScalar = __shdr_internal_div(vector4, scalar);
const vector4ByVector4 = __shdr_internal_div(vector4, vector4);
const vector3ByScalar = __shdr_internal_div(vector3, scalar);
const vector3ByVector3 = __shdr_internal_div(vector3, vector3);
const vector3ByVector3Add = __shdr_internal_add(vector3, vector3);
const vector3ByVector3Sub = __shdr_internal_sub(vector3, vector3);
const vector3ByScalarMul = __shdr_internal_mul(vector3, scalar);
const negativeVector3 = __shdr_internal_neg(vector3);
const vector2XXYY = vector2.xxyy;
const vector2YYY = vector2.yyy;
const vector3ZYX = vector3.zyx;
const vector4Z = vector4.z;
const vector2X = vector2.x;
const vector2Y = vector2.y;
const vector2XY = vector2.xy;
const vector4X = vector4.x;
const vector4Y = vector4.y;
const vector4XY = vector4.xy;
const constructedVec2 = vec2(scalar, scalar);
const copiedVec2 = vec2(vector2);
const splatVec2 = vec2(scalar);
const constructedVec3 = vec3(scalar, scalar, scalar);
const copiedVec3 = vec3(vector3);
const splatVec3 = vec3(scalar);
const color = vec4(scalar, scalar, scalar, scalar);
const colorFromVector2 = vec4(vector2, scalar, scalar);
const colorFromScalarSplat = vec4(scalar);
const colorFromVector4 = vec4(vector4);
const shader = createFragmentShader(({ coord, uniforms }) =>
  vec4(coord.x, coord.y, uniforms.time, uniforms.time),
);

// @ts-expect-error Fragment shaders must return Expr<Vec4<F32>>.
const invalidShaderReturn = createFragmentShader(({ coord }) => coord.xy);

// @ts-expect-error Vec2 / Vec4 has no shader overload.
const invalidDivision = __shdr_internal_div(vector2, vector4);

// @ts-expect-error Scalars do not expose vector swizzles.
const invalidScalarSwizzle = scalar.x;

// @ts-expect-error Vec2 does not contain z.
const invalidVector2Swizzle = vector2.z;

// @ts-expect-error Non-xyzw alphabets are not supported.
const invalidSwizzleSpelling = vector4.rgba;

// @ts-expect-error Swizzles have at most four components.
const invalidSwizzleLength = vector4.xyzwx;

// @ts-expect-error Vec3 has no w component.
const invalidVec3W = vector3.w;

// @ts-expect-error Scalar/vector arithmetic is deliberately unsupported.
const invalidScalarVectorMul = __shdr_internal_mul(scalar, vector2);

// @ts-expect-error Addition does not broadcast vector/scalar operands.
const invalidVectorScalarAdd = __shdr_internal_add(vector2, scalar);

// @ts-expect-error Vector operands must have equal dimensions.
const invalidVectorDimensions = __shdr_internal_sub(vector2, vector3);

// @ts-expect-error vec3(Vec2, F32) packing is deferred.
const invalidMixedVec3 = vec3(vector2, scalar);

// @ts-expect-error vec4(Vec3, F32) packing is deferred.
const invalidMixedVec4 = vec4(vector3, scalar);

// @ts-expect-error vec4 requires exactly four scalar expressions.
const invalidArity = vec4(scalar, scalar, scalar);

// @ts-expect-error vec4 requires exactly four scalar expressions.
const invalidExtraArgument = vec4(scalar, scalar, scalar, scalar, scalar);

// @ts-expect-error vec4 does not accept a vector expression as a component.
const invalidComponent = vec4(scalar, scalar, vector2, scalar);

// @ts-expect-error Internal helpers are not exported from the top-level package.
type TopLevelInternalHelper = (typeof shdr)["__shdr_internal_f32"];

type DslTypeAssertions = [
  Expect<Equal<typeof literal, Expr<F32>>>,
  Expect<Equal<typeof scalarByScalar, Expr<F32>>>,
  Expect<Equal<typeof vector2ByScalar, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof vector2ByVector2, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof vector4ByScalar, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof vector4ByVector4, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof vector3ByScalar, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector3ByVector3, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector3ByVector3Add, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector3ByVector3Sub, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector3ByScalarMul, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof negativeVector3, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector2XXYY, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof vector2YYY, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector3ZYX, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector4Z, Expr<F32>>>,
  Expect<Equal<typeof constructedVec2, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof copiedVec2, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof splatVec2, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof constructedVec3, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof copiedVec3, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof splatVec3, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector2X, Expr<F32>>>,
  Expect<Equal<typeof vector2Y, Expr<F32>>>,
  Expect<Equal<typeof vector2XY, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof vector4X, Expr<F32>>>,
  Expect<Equal<typeof vector4Y, Expr<F32>>>,
  Expect<Equal<typeof vector4XY, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof color, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof colorFromVector2, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof colorFromScalarSplat, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof colorFromVector4, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof shader, FragmentShaderSource>>,
];
