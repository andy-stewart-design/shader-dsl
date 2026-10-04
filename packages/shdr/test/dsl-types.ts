import * as shdr from "../src/index.js";
import {
  ceil,
  createFragmentShader,
  cross,
  distance,
  vec2,
  vec3,
  vec4,
} from "../src/index.js";
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
  CompiledFragmentArtifact,
  TypedCompiledFragmentArtifact,
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
const vector2PlusScalar = __shdr_internal_add(vector2, scalar);
const scalarPlusVector3 = __shdr_internal_add(scalar, vector3);
const vector4MinusScalar = __shdr_internal_sub(vector4, scalar);
const scalarMinusVector2 = __shdr_internal_sub(scalar, vector2);
const vector3ByScalarMul = __shdr_internal_mul(vector3, scalar);
const negativeVector3 = __shdr_internal_neg(vector3);
const vector2XXYY = vector2.xxyy;
const vector2YYY = vector2.yyy;
const vector3ZYX = vector3.zyx;
const vector4Z = vector4.z;
const vector2RGGR = vector2.rggr;
const vector3BGR = vector3.bgr;
const vector4RGBA = vector4.rgba;
const vector4R = vector4.r;
const chainedColor = vector4.bgr.gr;
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
const colorFromVector3 = vec4(vector3, scalar);
const packedVec3 = vec3(vector2, scalar);
const copiedVec3 = vec3(vector3);
const splatVec3 = vec3(scalar);
const ceilScalar = ceil(scalar);
const ceilVector = ceil(vector4);
const distanceScalar = distance(scalar, scalar);
const distanceVector = distance(vector2, vector2);
const crossVector = cross(vector3, vector3);
// @ts-expect-error cross is only defined for Vec3.
const invalidCross = cross(vector2, vector2);
// @ts-expect-error distance requires equal shapes.
const invalidDistance = distance(vector2, vector3);
// @ts-expect-error ceil accepts exactly one argument.
const invalidCeil = ceil(vector2, vector2);
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

// @ts-expect-error A single swizzle cannot mix positional and color aliases.
const invalidSwizzleSpelling = vector4.xr;
// @ts-expect-error Vec2 does not contain b.
const invalidVector2B = vector2.b;
// @ts-expect-error Vec3 does not contain a.
const invalidVector3A = vector3.a;

// @ts-expect-error Swizzles have at most four components.
const invalidSwizzleLength = vector4.xyzwx;

// @ts-expect-error Vec3 has no w component.
const invalidVec3W = vector3.w;

// @ts-expect-error Scalar/vector arithmetic is deliberately unsupported.
const invalidScalarVectorMul = __shdr_internal_mul(scalar, vector2);

// @ts-expect-error Addition still requires vectors of the same dimension.
const invalidVectorScalarAdd = __shdr_internal_add(vector2, vector3);

// @ts-expect-error Vector operands must have equal dimensions.
const invalidVectorDimensions = __shdr_internal_sub(vector2, vector3);

// @ts-expect-error Adjacent packings take the vector before the scalar.
const invalidMixedVec3 = vec3(scalar, vector2);

// @ts-expect-error Adjacent packings take the vector before the scalar.
const invalidMixedVec4 = vec4(scalar, vector3);

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
  Expect<Equal<typeof ceilScalar, Expr<F32>>>,
  Expect<Equal<typeof ceilVector, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof distanceScalar, Expr<F32>>>,
  Expect<Equal<typeof distanceVector, Expr<F32>>>,
  Expect<Equal<typeof crossVector, Expr<Vec3<F32>>>>,
  typeof invalidCross,
  typeof invalidDistance,
  typeof invalidCeil,
  Expect<Equal<typeof scalarByScalar, Expr<F32>>>,
  Expect<Equal<typeof vector2ByScalar, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof vector2ByVector2, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof vector4ByScalar, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof vector4ByVector4, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof vector3ByScalar, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector3ByVector3, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector3ByVector3Add, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector3ByVector3Sub, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector2PlusScalar, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof scalarPlusVector3, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector4MinusScalar, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof scalarMinusVector2, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof vector3ByScalarMul, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof negativeVector3, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector2XXYY, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof vector2YYY, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector3ZYX, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector4Z, Expr<F32>>>,
  Expect<Equal<typeof vector2RGGR, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof vector3BGR, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof vector4RGBA, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof vector4R, Expr<F32>>>,
  Expect<Equal<typeof chainedColor, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof constructedVec2, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof copiedVec2, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof splatVec2, Expr<Vec2<F32>>>>,
  Expect<Equal<typeof constructedVec3, Expr<Vec3<F32>>>>,
  Expect<Equal<typeof colorFromVector3, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof packedVec3, Expr<Vec3<F32>>>>,
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
  Expect<
    Equal<typeof shader, TypedCompiledFragmentArtifact<Record<never, never>>>
  >,
];
const schemaErasedShader: CompiledFragmentArtifact = shader;
void schemaErasedShader;
