import type {
  Expr,
  F32,
  FragmentContext,
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

type CoordXyIsVec2 = Expect<
  Equal<FragmentContext["coord"]["xy"], Expr<Vec2<F32>>>
>;
type CoordXIsF32 = Expect<Equal<FragmentContext["coord"]["x"], Expr<F32>>>;
type CoordYIsF32 = Expect<Equal<FragmentContext["coord"]["y"], Expr<F32>>>;
type ResolutionXyIsVec2 = Expect<
  Equal<FragmentContext["uniforms"]["resolution"]["xy"], Expr<Vec2<F32>>>
>;
type MouseXIsF32 = Expect<
  Equal<FragmentContext["uniforms"]["mouse"]["x"], Expr<F32>>
>;

declare const scalar: Expr<F32>;

// @ts-expect-error Scalar expressions do not expose vector swizzles.
type ScalarX = (typeof scalar)["x"];

declare const vec2: Vec2<F32>;

// @ts-expect-error Vec2 and Vec4 are structurally distinct shader types.
const vec4: Vec4<F32> = vec2;

declare const shaderSource: FragmentShaderSource;

const plainString: string = shaderSource;

// @ts-expect-error A plain string is not branded fragment shader source.
const fragmentShaderSource: FragmentShaderSource = "fragment shader";

export type TypeAssertions = [
  CoordXyIsVec2,
  CoordXIsF32,
  CoordYIsF32,
  ResolutionXyIsVec2,
  MouseXIsF32,
  typeof vec4,
  typeof plainString,
  typeof fragmentShaderSource,
  ScalarX,
];
