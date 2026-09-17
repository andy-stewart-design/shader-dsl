import {
  generateGlslExpression,
  type GeneratedGlslExpression,
} from "./generate-glsl-expression.js";
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
  readonly expression: GeneratedGlslExpression;
}

/** Generates one standalone GLSL ES 3.00 fragment module from typed IR. */
export function generateGlslFragment(module: ShaderModule): string {
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

  const sections = ["#version 300 es\nprecision highp float;"];
  const uniformDeclarations = UNIFORM_ORDER.filter((uniform) =>
    referencedUniforms.has(uniform),
  ).map(uniformDeclaration);
  if (uniformDeclarations.length > 0) {
    sections.push(uniformDeclarations.join("\n"));
  }

  sections.push("out vec4 shdr_fragment_color;");

  const body: string[] = [];
  if (usesFragmentPosition) {
    body.push(
      `  vec4 ${FRAGMENT_POSITION_NAME} = vec4(\n` +
        "    gl_FragCoord.x,\n" +
        "    u_resolution.y - gl_FragCoord.y,\n" +
        "    gl_FragCoord.z,\n" +
        "    gl_FragCoord.w\n" +
        "  );",
    );
  }
  body.push(...statements.map((statement) => statement.code));
  sections.push(`void main() {\n${body.join("\n")}\n}`);

  return `${sections.join("\n\n")}\n`;
}

function generateStatement(statement: ShaderStatement): GeneratedStatement {
  switch (statement.kind) {
    case "const-declaration": {
      const expression = generateGlslExpression(statement.initializer, {
        fragmentPositionName: FRAGMENT_POSITION_NAME,
      });
      return {
        code: `  ${glslTypeName(statement.initializer.type)} ${statement.name} = ${expression.code};`,
        expression,
      };
    }

    case "return-statement": {
      const expression = generateGlslExpression(statement.expression, {
        fragmentPositionName: FRAGMENT_POSITION_NAME,
      });
      return {
        code: `  shdr_fragment_color = ${expression.code};`,
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
      return "uniform vec2 u_resolution;";
    case "mouse":
      return "uniform vec2 u_mouse;";
    case "time":
      return "uniform float u_time;";
    default:
      return assertNever(uniform);
  }
}

function glslTypeName(type: ShaderValueType): string {
  switch (type.kind) {
    case "scalar":
      switch (type.scalar) {
        case "f32":
          return "float";
        default:
          return assertNever(type.scalar);
      }
    case "vector":
      switch (type.scalar) {
        case "f32":
          return `vec${type.size}`;
        default:
          return assertNever(type.scalar);
      }
    default:
      return assertNever(type);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported GLSL module IR value: ${JSON.stringify(value)}.`);
}
