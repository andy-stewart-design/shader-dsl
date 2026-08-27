import * as shdr from "../src/index.js";
import { createFragmentShader, vec4 } from "../src/index.js";
import { __shdr_internal_div, __shdr_internal_f32 } from "../src/internal.js";
import type {
  Expr,
  F32,
  FragmentShaderSource,
  Vec2,
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
declare const vector4: Expr<Vec4<F32>>;

const literal = __shdr_internal_f32(1);
const scalarByScalar = __shdr_internal_div(scalar, scalar);
const vector2ByScalar = __shdr_internal_div(vector2, scalar);
const vector2ByVector2 = __shdr_internal_div(vector2, vector2);
const vector4ByScalar = __shdr_internal_div(vector4, scalar);
const vector4ByVector4 = __shdr_internal_div(vector4, vector4);
const color = vec4(scalar, scalar, scalar, scalar);
const shader = createFragmentShader(({ coord, uniforms }) =>
  vec4(coord.x, coord.y, uniforms.time, uniforms.time),
);

// @ts-expect-error Vec2 / Vec4 has no shader overload.
const invalidDivision = __shdr_internal_div(vector2, vector4);

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
  Expect<Equal<typeof color, Expr<Vec4<F32>>>>,
  Expect<Equal<typeof shader, FragmentShaderSource>>,
];
