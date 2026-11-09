export type ShaderUniformDefinition =
  | {
      readonly name: string;
      readonly type: "f32";
      readonly default: number;
    }
  | {
      readonly name: string;
      readonly type: "vec3";
      readonly default: readonly [number, number, number];
    };

export type GeneratedUniformsResult =
  | { readonly ok: true; readonly source: string }
  | {
      readonly ok: false;
      readonly diagnostics: readonly UniformDefinitionDiagnostic[];
    };

export interface UniformDefinitionDiagnostic {
  readonly code: "SHDR1210";
  readonly message: string;
  readonly range: { readonly start: number; readonly length: number };
  readonly severity: "error";
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_NAMES = new Set([
  "resolution",
  "mouse",
  "time",
  "__proto__",
  "prototype",
  "constructor",
]);

/** Validates neutral UI data before putting it into generated source. */
export function generateUniformsSource(
  definitions: readonly ShaderUniformDefinition[],
): GeneratedUniformsResult {
  const names = new Set<string>();
  for (const [index, definition] of definitions.entries()) {
    if (!definition || typeof definition !== "object") {
      return invalid("Uniform definitions must be objects.", index);
    }
    if (typeof definition.name !== "string") {
      return invalid("Uniform names must be strings.", index);
    }
    if (!IDENTIFIER.test(definition.name)) {
      return invalid(
        `Uniform name ${JSON.stringify(definition.name)} must be a valid identifier.`,
        index,
      );
    }
    if (RESERVED_NAMES.has(definition.name)) {
      return invalid(
        `Uniform name ${JSON.stringify(definition.name)} is reserved.`,
        index,
      );
    }
    if (names.has(definition.name)) {
      return invalid(
        `Duplicate uniform name ${JSON.stringify(definition.name)}.`,
        index,
      );
    }
    names.add(definition.name);

    if (definition.type !== "f32" && definition.type !== "vec3") {
      return invalid("Uniform has an unsupported type.", index);
    }
    if (
      definition.type === "f32" &&
      typeof definition.default !== "number"
    ) {
      return invalid(
        `Uniform ${JSON.stringify(definition.name)} must have a numeric default.`,
        index,
      );
    }
    if (
      definition.type === "vec3" &&
      (!Array.isArray(definition.default) || definition.default.length !== 3)
    ) {
      return invalid(
        `Uniform ${JSON.stringify(definition.name)} must have three numeric defaults.`,
        index,
      );
    }
    const values: readonly number[] =
      definition.type === "f32" ? [definition.default] : definition.default;
    if (
      !values.every(
        (value) =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          Number.isFinite(Math.fround(value)),
      )
    ) {
      return invalid(
        `Uniform ${JSON.stringify(definition.name)} must have finite f32 values.`,
        index,
      );
    }
  }

  const fields = definitions
    .map(
      ({ name, type, default: value }) =>
        `${name}: u.${type}(${serializeValue(value)})`,
    )
    .join(", ");
  return {
    ok: true,
    source: `const uniforms = defineUniforms((u) => ({ ${fields} }));\n`,
  };
}

function serializeValue(value: number | readonly number[]): string {
  if (typeof value === "number") return serializeNumber(value);
  return value.map(serializeNumber).join(", ");
}

function serializeNumber(value: number): string {
  // JSON.stringify gives a canonical representation and turns -0 into 0.
  return JSON.stringify(Object.is(value, -0) ? 0 : value);
}

function invalid(message: string, index: number): GeneratedUniformsResult {
  return {
    ok: false,
    diagnostics: [
      {
        code: "SHDR1210",
        message,
        range: { start: index, length: 1 },
        severity: "error",
      },
    ],
  };
}
