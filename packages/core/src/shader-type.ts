export type ShaderScalarKind = "f32";

export type ShaderVectorSize = 2 | 3 | 4;

export interface ShaderScalarType {
  readonly kind: "scalar";
  readonly scalar: ShaderScalarKind;
}

export interface ShaderVectorType {
  readonly kind: "vector";
  readonly scalar: ShaderScalarKind;
  readonly size: ShaderVectorSize;
}

export type ShaderValueType = ShaderScalarType | ShaderVectorType;
