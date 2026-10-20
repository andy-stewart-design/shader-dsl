import {
  createFragmentShader,
  defineUniforms,
  sample,
  vec4,
} from "../src/index.js";
import type {
  Expr,
  F32,
  Vec3,
  TypedCompiledFragmentArtifact,
  UniformDeclaration,
  ShaderCustomUniformDeclaration,
  Texture2D,
  TextureUniformDeclaration,
  HostUniforms,
  Vec2,
  Vec4,
} from "../src/index.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

const scalarDeclaration: UniformDeclaration = { type: "f32", default: 1 };
const vectorDeclaration: UniformDeclaration = {
  type: "vec3",
  default: [1, 2, 3],
};
const textureDeclaration: TextureUniformDeclaration = {
  type: "texture2D",
  url: "/photo.png",
};
const dynamicTextureUrl: string = "/photo.png";
const dynamicTexture = defineUniforms((u) => ({
  // @ts-expect-error Texture declarations require a string literal URL.
  photo: u.texture2D(dynamicTextureUrl),
}));
const namedDeclaration: ShaderCustomUniformDeclaration = {
  name: "color",
  type: "vec2",
  default: [1, 2],
};
// @ts-expect-error A broad declaration cannot combine a scalar tag with a vector default.
const wrongScalar: UniformDeclaration = { type: "f32", default: [1, 2] };
// @ts-expect-error A named artifact declaration cannot combine a vector tag with a scalar default.
const wrongNamed: ShaderCustomUniformDeclaration = {
  name: "color",
  type: "vec2",
  default: 1,
};
// @ts-expect-error Artifact vector defaults require the declared tuple length.
const wrongLength: ShaderCustomUniformDeclaration = {
  name: "color",
  type: "vec4",
  default: [1, 2, 3],
};
void [
  scalarDeclaration,
  vectorDeclaration,
  textureDeclaration,
  namedDeclaration,
  wrongScalar,
  wrongNamed,
  wrongLength,
];
function inspectDeclaration(declaration: ShaderCustomUniformDeclaration) {
  if (declaration.type === "f32") {
    const scalar: number = declaration.default;
    // @ts-expect-error The narrowed scalar default is not a tuple.
    const vector: readonly [number, number] = declaration.default;
    void [scalar, vector];
  } else if (declaration.type === "vec3") {
    const vector: readonly [number, number, number] = declaration.default;
    // @ts-expect-error The narrowed vec3 default has three components.
    const scalar: number = declaration.default;
    void [vector, scalar];
  }
}
void inspectDeclaration;

const withTexture = defineUniforms((u) => ({
  photo: u.texture2D("/photo.png"),
  remote: u.texture2D("https://cdn.example/photo.png"),
  gain: u.f32(0.5),
}));
const textureShader = withTexture.createFragmentShader(({ uniforms }) => {
  type _Photo = Expect<Equal<typeof uniforms.photo, Texture2D>>;
  type _Remote = Expect<Equal<typeof uniforms.remote, Texture2D>>;
  type _Gain = Expect<Equal<typeof uniforms.gain, Expr<F32>>>;
  // @ts-expect-error Texture handles are not numeric expressions.
  return vec4(uniforms.photo, uniforms.gain, uniforms.gain, 1);
});
type _TextureHost = Expect<
  Equal<keyof HostUniforms<typeof withTexture.schema>, "gain">
>;
// @ts-expect-error Texture declarations are not numeric host uniform values.
const textureHost: HostUniforms<typeof withTexture.schema> = { photo: 1 };
const sampledShader = withTexture.createFragmentShader(({ uniforms }) => {
  type _Uv = Expect<Equal<typeof uniforms.resolution, Expr<Vec2<F32>>>>;
  const color = sample(uniforms.photo, uniforms.resolution);
  type _Sample = Expect<Equal<typeof color, Expr<Vec4<F32>>>>;
  // @ts-expect-error Sampling requires a texture handle as its first argument.
  sample(uniforms.gain, uniforms.resolution);
  // @ts-expect-error Sampling requires a Vec2<F32> UV.
  sample(uniforms.photo, uniforms.gain);
  void (0 as unknown as _Uv);
  return color;
});
void [textureShader, sampledShader, textureHost];

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
const withAlias = createFragmentShader(
  ($) => {
    const u = $.u;
    const other = u;
    type _Gain = Expect<Equal<typeof other.dpi, Expr<F32>>>;
    type _Resolution = Expect<Equal<typeof $.u.resolution, Expr<Vec2<F32>>>>;
    return vec4(other.color.x, $.uniforms.dpi, $.u.time, u.dpi);
  },
  { uniforms },
);
const withBothNames = createFragmentShader(
  ({ u, coord, uniforms }) => {
    type _Color = Expect<Equal<typeof u.color, Expr<Vec3<F32>>>>;
    return vec4(u.color.x, uniforms.dpi, coord.x, uniforms.dpi);
  },
  { uniforms },
);
const withBothNamesReordered = createFragmentShader(
  ({ coord, uniforms, u }) => vec4(uniforms.dpi, u.color.y, coord.y, u.color.z),
  { uniforms },
);
const typed: TypedCompiledFragmentArtifact<typeof uniforms.schema> = inline;
const sameType: TypedCompiledFragmentArtifact<typeof uniforms.schema> = named;
const aliasType: TypedCompiledFragmentArtifact<typeof uniforms.schema> =
  withAlias;
void [typed, sameType, aliasType, withBothNames, withBothNamesReordered];
// @ts-expect-error A different inferred schema is not assignable to this artifact.
const bad: TypedCompiledFragmentArtifact<typeof uniforms.schema> =
  defineUniforms((u) => ({ color: u.f32(1) })).createFragmentShader(
    ({ uniforms }) =>
      vec4(uniforms.color, uniforms.color, uniforms.color, uniforms.color),
  );
void bad;
