interface UniformBase {
  id: string;
  name: string;
}

export type FloatUniform = UniformBase & {
  type: "float";
  value: string;
  min: string;
  max: string;
};

export type ColorUniform = UniformBase & {
  type: "color";
  draft: string;
  valid: string;
};

export type Uniform = FloatUniform | ColorUniform;
export type UniformType = Uniform["type"];

export function cloneUniforms(uniforms: readonly Uniform[]): Uniform[] {
  return uniforms.map((uniform) => ({ ...uniform }));
}
