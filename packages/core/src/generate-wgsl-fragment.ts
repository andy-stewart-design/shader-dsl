import {
  generateWgslExpression,
  type GeneratedWgslExpression,
} from "./generate-wgsl-expression.js";
import type {
  ShaderDefaultUniform,
  ShaderModule,
  ShaderStatement,
} from "./shader-ir.js";
import type { ShaderValueType } from "./shader-type.js";

const UNIFORM_ORDER: readonly ShaderDefaultUniform[] = [
  "resolution",
  "mouse",
  "time",
];
const FRAGMENT_POSITION_NAME = "shdr_coord";

interface GeneratedStatement {
  readonly code: string;
  readonly expression: GeneratedWgslExpression;
}

/**
 * Generates one standalone WGSL fragment module from typed IR.
 * Default uniforms use group 0 with fixed bindings: resolution 0, mouse 1,
 * and time 2. Unreferenced bindings are omitted without renumbering.
 */
export function generateWgslFragment(module: ShaderModule): string {
  if (module.stage !== "fragment") {
    return assertNever(module.stage);
  }

  const statements = module.statements.map(generateStatement);
  const referencedUniforms = new Set<ShaderDefaultUniform>();
  let usesFragmentPosition = false;

  for (const statement of statements) {
    usesFragmentPosition ||= statement.expression.usesFragmentPosition;
    for (const uniform of statement.expression.referencedUniforms) {
      referencedUniforms.add(uniform);
    }
  }

  const sections: string[] = [];
  const uniformDeclarations = UNIFORM_ORDER.filter((uniform) =>
    referencedUniforms.has(uniform),
  ).map(uniformDeclaration);
  if (uniformDeclarations.length > 0) {
    sections.push(uniformDeclarations.join("\n"));
  }

  const parameters = usesFragmentPosition
    ? `\n  @builtin(position) ${FRAGMENT_POSITION_NAME}: vec4<f32>,\n`
    : "";
  const body = statements.map((statement) => statement.code).join("\n");
  sections.push(
    `@fragment\nfn shdr_fragment_main(${parameters}) -> @location(0) vec4<f32> {\n${body}\n}`,
  );

  return `${sections.join("\n\n")}\n`;
}

function generateStatement(statement: ShaderStatement): GeneratedStatement {
  switch (statement.kind) {
    case "const-declaration": {
      const expression = generateWgslExpression(statement.initializer, {
        fragmentPositionName: FRAGMENT_POSITION_NAME,
      });
      return {
        code: `  let ${statement.name}: ${wgslTypeName(statement.initializer.type)} = ${expression.code};`,
        expression,
      };
    }

    case "return-statement": {
      const expression = generateWgslExpression(statement.expression, {
        fragmentPositionName: FRAGMENT_POSITION_NAME,
      });
      return {
        code: `  return ${expression.code};`,
        expression,
      };
    }

    default:
      return assertNever(statement);
  }
}

function uniformDeclaration(uniform: ShaderDefaultUniform): string {
  switch (uniform) {
    case "resolution":
      return "@group(0) @binding(0) var<uniform> shdr_resolution: vec2<f32>;";
    case "mouse":
      return "@group(0) @binding(1) var<uniform> shdr_mouse: vec2<f32>;";
    case "time":
      return "@group(0) @binding(2) var<uniform> shdr_time: f32;";
    default:
      return assertNever(uniform);
  }
}

function wgslTypeName(type: ShaderValueType): string {
  switch (type.kind) {
    case "scalar":
      switch (type.scalar) {
        case "f32":
          return "f32";
        default:
          return assertNever(type.scalar);
      }
    case "vector":
      switch (type.scalar) {
        case "f32":
          return `vec${type.size}<f32>`;
        default:
          return assertNever(type.scalar);
      }
    default:
      return assertNever(type);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported WGSL module IR value: ${JSON.stringify(value)}.`);
}
