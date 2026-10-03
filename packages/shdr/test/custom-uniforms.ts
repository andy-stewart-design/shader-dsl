import { createFragmentShader, defineUniforms, vec4 } from "../src/index.js";
import type {
  Expr,
  F32,
  Vec3,
  TypedCompiledFragmentArtifact,
} from "../src/index.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

const inline = defineUniforms((u) => ({
  color: u.vec3(0, 0, 1),
  dpi: u.f32(12),
})).createFragmentShader(({ uniforms }) => {
  type _Color = Expect<Equal<typeof uniforms.color, Expr<Vec3<F32>>>>;
  type _Dpi = Expect<Equal<typeof uniforms.dpi, Expr<F32>>>;
  // @ts-expect-error Unknown properties are not accepted.
  void uniforms.radius;
  return vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, uniforms.dpi);
});

const uniforms = defineUniforms((u) => ({
  color: u.vec3(1, 0, 0),
  dpi: u.f32(24),
}));
const named = createFragmentShader(
  ({ uniforms }) =>
    vec4(uniforms.color.x, uniforms.color.y, uniforms.dpi, uniforms.dpi),
  { uniforms },
);
const typed: TypedCompiledFragmentArtifact<typeof uniforms.schema> = inline;
const sameType: TypedCompiledFragmentArtifact<typeof uniforms.schema> = named;
void [typed, sameType];
// @ts-expect-error A different inferred schema is not assignable to this artifact.
const bad: TypedCompiledFragmentArtifact<typeof uniforms.schema> =
  defineUniforms((u) => ({ color: u.f32(1) })).createFragmentShader(
    ({ uniforms }) =>
      vec4(uniforms.color, uniforms.color, uniforms.color, uniforms.color),
  );
void bad;
