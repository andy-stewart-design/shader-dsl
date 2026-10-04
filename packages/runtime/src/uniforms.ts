import type {
  CompiledFragmentArtifact,
  ShaderCustomUniformDeclaration,
  ShaderCustomUniformType,
  UniformValue,
} from "shdr";
import { ShdrRuntimeError, type RendererBackend } from "./errors.js";

export type DynamicUniformValue = UniformValue<ShaderCustomUniformType>;
export type UniformPatch = Readonly<Record<string, DynamicUniformValue>>;
type CustomMetadata = NonNullable<CompiledFragmentArtifact["custom"]>;
export interface CustomSchema extends CustomMetadata {
  /** Validated, copied declarations with their stable artifact indices. */
  readonly fields: ReadonlyMap<
    string,
    {
      readonly declaration: ShaderCustomUniformDeclaration;
      readonly index: number;
    }
  >;
}
export type UniformValues = ReadonlyMap<string, DynamicUniformValue>;

const reserved = new Set([
  "resolution",
  "mouse",
  "time",
  "__proto__",
  "prototype",
  "constructor",
]);
const identifier = /^[$_\p{ID_Start}][$_\p{ID_Continue}]*$/u;
const lengthOf = { f32: 1, vec2: 2, vec3: 3, vec4: 4 } as const;

function fail(
  backend: RendererBackend,
  kind: "artifact" | "uniform",
  message: string,
): never {
  throw new ShdrRuntimeError(backend, kind, message);
}

function numeric(
  value: unknown,
  backend: RendererBackend,
  kind: "artifact" | "uniform",
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isFinite(Math.fround(value))
  )
    fail(backend, kind, "Uniform components must be finite f32 numbers.");
  return Math.fround(value);
}

function copyValue(
  value: unknown,
  type: "f32",
  backend: RendererBackend,
  kind: "artifact" | "uniform",
): number;
function copyValue(
  value: unknown,
  type: "vec2",
  backend: RendererBackend,
  kind: "artifact" | "uniform",
): UniformValue<"vec2">;
function copyValue(
  value: unknown,
  type: "vec3",
  backend: RendererBackend,
  kind: "artifact" | "uniform",
): UniformValue<"vec3">;
function copyValue(
  value: unknown,
  type: "vec4",
  backend: RendererBackend,
  kind: "artifact" | "uniform",
): UniformValue<"vec4">;
function copyValue(
  value: unknown,
  type: ShaderCustomUniformType,
  backend: RendererBackend,
  kind: "artifact" | "uniform",
): DynamicUniformValue;
function copyValue(
  value: unknown,
  type: ShaderCustomUniformType,
  backend: RendererBackend,
  kind: "artifact" | "uniform",
): DynamicUniformValue {
  if (type === "f32") return numeric(value, backend, kind);
  if (!Array.isArray(value) || value.length !== lengthOf[type])
    fail(
      backend,
      kind,
      `Uniform ${type} requires exactly ${lengthOf[type]} components.`,
    );
  // Array.from visits holes as undefined; Array#map would silently skip them.
  const components = Array.from(value, (component: unknown) =>
    numeric(component, backend, kind),
  );
  switch (type) {
    case "vec2":
      return [components[0]!, components[1]!];
    case "vec3":
      return [components[0]!, components[1]!, components[2]!];
    case "vec4":
      return [components[0]!, components[1]!, components[2]!, components[3]!];
    default:
      throw new Error(
        `Unsupported validated uniform type: ${type satisfies never}`,
      );
  }
}

function copyDeclaration(
  declaration: ShaderCustomUniformDeclaration,
  backend: RendererBackend,
): ShaderCustomUniformDeclaration {
  const { name, type } = declaration;
  switch (type) {
    case "f32":
      return {
        name,
        type,
        default: copyValue(declaration.default, type, backend, "artifact"),
      };
    case "vec2":
      return {
        name,
        type,
        default: copyValue(declaration.default, type, backend, "artifact"),
      };
    case "vec3":
      return {
        name,
        type,
        default: copyValue(declaration.default, type, backend, "artifact"),
      };
    case "vec4":
      return {
        name,
        type,
        default: copyValue(declaration.default, type, backend, "artifact"),
      };
    default:
      throw new Error(
        `Unsupported validated uniform type: ${type satisfies never}`,
      );
  }
}

/** Validate and copy *all* metadata before candidate GPU allocation. */
export function readCustomMetadata(
  value: CompiledFragmentArtifact,
  backend: RendererBackend,
): CustomSchema | undefined {
  if (value.custom === undefined) return undefined;
  const custom: unknown = value.custom;
  if (!custom || typeof custom !== "object")
    fail(backend, "artifact", "Invalid custom uniform metadata.");
  const { declarations, referenced } = custom as CustomMetadata;
  if (
    !Array.isArray(declarations) ||
    !referenced ||
    typeof referenced !== "object"
  )
    fail(backend, "artifact", "Invalid custom uniform metadata.");
  const fields = new Map<
    string,
    { declaration: ShaderCustomUniformDeclaration; index: number }
  >();
  const copied: ShaderCustomUniformDeclaration[] = [];
  for (const declaration of declarations) {
    if (
      !declaration ||
      typeof declaration !== "object" ||
      typeof declaration.name !== "string" ||
      !identifier.test(declaration.name) ||
      reserved.has(declaration.name) ||
      fields.has(declaration.name) ||
      !Object.hasOwn(lengthOf, declaration.type)
    )
      fail(backend, "artifact", "Invalid custom uniform declaration.");
    const validated = copyDeclaration(declaration, backend);
    fields.set(validated.name, {
      declaration: validated,
      index: copied.length,
    });
    copied.push(validated);
  }
  const ordered = (entries: readonly string[], target: string): string[] => {
    if (!Array.isArray(entries))
      fail(backend, "artifact", `Invalid ${target} custom binding metadata.`);
    let previous = -1;
    return entries.map((name) => {
      const index = fields.get(name)?.index;
      if (index === undefined || index <= previous)
        fail(backend, "artifact", `Invalid ${target} custom binding metadata.`);
      previous = index;
      return name;
    });
  };
  return {
    declarations: copied,
    referenced: {
      glsl: ordered(referenced.glsl, "glsl"),
      wgsl: ordered(referenced.wgsl, "wgsl"),
    },
    fields,
  };
}

function patch(
  schema: CustomSchema | undefined,
  values: unknown,
  backend: RendererBackend,
): Map<string, DynamicUniformValue> {
  if (
    !values ||
    typeof values !== "object" ||
    Array.isArray(values) ||
    (Object.getPrototypeOf(values) !== Object.prototype &&
      Object.getPrototypeOf(values) !== null) ||
    Object.getOwnPropertySymbols(values).length
  )
    fail(
      backend,
      "uniform",
      "Expected a plain custom uniform object with string keys.",
    );
  const entries = new Map<string, DynamicUniformValue>();
  for (const name of Object.keys(values)) {
    const declaration = schema?.fields.get(name)?.declaration;
    if (!declaration)
      fail(
        backend,
        "uniform",
        `Unknown custom uniform ${JSON.stringify(name)}.`,
      );
    entries.set(
      name,
      copyValue(
        (values as Record<string, unknown>)[name],
        declaration.type,
        backend,
        "uniform",
      ),
    );
  }
  return entries;
}

export class UniformState {
  private schema?: CustomSchema;
  private values: Map<string, DynamicUniformValue> = new Map();
  private overrides = new Map<
    string,
    { type: ShaderCustomUniformType; value: DynamicUniformValue }
  >();
  private initial?: Map<string, DynamicUniformValue>;
  private revision = 0;
  constructor(private readonly backend: RendererBackend) {}

  creation(schema: CustomSchema | undefined, values: unknown): void {
    this.initial =
      values === undefined ? undefined : patch(schema, values, this.backend);
  }
  resolve(schema: CustomSchema | undefined): Map<string, DynamicUniformValue> {
    const values = new Map(
      schema?.declarations.map((item) => [item.name, item.default] as const) ??
        [],
    );
    if (!this.schema && this.initial)
      for (const [name, value] of this.initial) values.set(name, value);
    for (const item of schema?.declarations ?? []) {
      const override = this.overrides.get(item.name);
      if (override?.type === item.type) values.set(item.name, override.value);
    }
    return values;
  }
  commit(
    schema: CustomSchema | undefined,
    values: Map<string, DynamicUniformValue>,
  ): void {
    this.schema = schema;
    this.values = values;
    this.initial = undefined;
    for (const [name, override] of this.overrides) {
      if (schema?.fields.get(name)?.declaration.type !== override.type)
        this.overrides.delete(name);
    }
  }
  current(): UniformValues {
    return this.values;
  }
  version(): number {
    return this.revision;
  }
  set(values: UniformPatch): void {
    const changes = patch(this.schema, values, this.backend);
    for (const [name, value] of changes) {
      const type = this.schema!.fields.get(name)!.declaration.type;
      this.values.set(name, value);
      this.overrides.set(name, { type, value });
    }
    if (changes.size) this.revision++;
  }
  reset(...names: readonly string[]): void {
    const targets = names.length
      ? names
      : (this.schema?.declarations.map((item) => item.name) ?? []);
    for (const name of targets) {
      if (!this.schema?.fields.has(name))
        fail(
          this.backend,
          "uniform",
          `Unknown custom uniform ${JSON.stringify(name)}.`,
        );
    }
    for (const name of targets) {
      const declaration = this.schema!.fields.get(name)!.declaration;
      this.overrides.delete(name);
      this.values.set(name, declaration.default);
    }
    if (targets.length) this.revision++;
  }
}
