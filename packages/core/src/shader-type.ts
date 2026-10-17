export type ShaderScalarKind = "f32";

export type ShaderVectorSize = 2 | 3 | 4;
export type ShaderMatrixSize = 2 | 3 | 4;

export interface ShaderScalarType {
  readonly kind: "scalar";
  readonly scalar: ShaderScalarKind;
}

export interface ShaderVectorType {
  readonly kind: "vector";
  readonly scalar: ShaderScalarKind;
  readonly size: ShaderVectorSize;
}

export interface ShaderMatrixType {
  readonly kind: "matrix";
  readonly scalar: ShaderScalarKind;
  readonly columns: ShaderMatrixSize;
  readonly rows: ShaderMatrixSize;
}

export interface ShaderTextureType {
  readonly kind: "texture2D";
}

export type ShaderValueType =
  ShaderScalarType | ShaderVectorType | ShaderMatrixType;

export function shaderTypeComponentCount(type: ShaderValueType): number {
  switch (type.kind) {
    case "scalar":
      return 1;
    case "vector":
      return type.size;
    case "matrix":
      return type.columns * type.rows;
    default:
      return assertNever(type);
  }
}

export function sameShaderValueType(
  left: ShaderValueType,
  right: ShaderValueType,
): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "scalar":
      return right.kind === "scalar" && left.scalar === right.scalar;
    case "vector":
      return (
        right.kind === "vector" &&
        left.scalar === right.scalar &&
        left.size === right.size
      );
    case "matrix":
      return (
        right.kind === "matrix" &&
        left.scalar === right.scalar &&
        left.columns === right.columns &&
        left.rows === right.rows
      );
    default:
      return assertNever(left);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected shader type: ${JSON.stringify(value)}`);
}
