import {
  createVirtualSource,
  mapOriginalOffsetToGenerated,
  ShaderDiagnosticCode,
  type TextRange,
  type VirtualSource,
} from "@shdr/core";
import { describe, expect, it } from "vitest";

import {
  routeShaderDiagnostics,
  type TypeScriptCheckerDiagnostic,
} from "../src/index.js";

function rangeOf(source: string, text: string, fromIndex = 0): TextRange {
  const start = source.indexOf(text, fromIndex);
  expect(start).toBeGreaterThanOrEqual(0);
  return { start, length: text.length };
}

function typeScriptDiagnostic(
  range: TextRange,
  code: number,
  message: string,
): TypeScriptCheckerDiagnostic {
  return { range, code, message, category: "error" };
}

function generatedDiagnostic(
  virtualSource: VirtualSource,
  originalRange: TextRange,
  code: number,
  message: string,
): TypeScriptCheckerDiagnostic {
  const start = mapOriginalOffsetToGenerated(
    virtualSource,
    originalRange.start,
  );
  expect(start).toBeDefined();
  return typeScriptDiagnostic(
    { start: start!, length: originalRange.length },
    code,
    message,
  );
}

const validSource = `import { createFragmentShader, vec4 } from "shdr";

const before: string = 1;

export default createFragmentShader(({ coord, uniforms }) => {
  const uv = coord.xy / uniforms.resolution;
  return vec4(uv.x, uv.y, 0, 1);
});

const after: string = 2;
`;

describe("semantic diagnostic routing", () => {
  it("hides native callback cascades and preserves ordinary errors outside", () => {
    const virtual = createVirtualSource(validSource, "routing.shdr.ts");
    expect(virtual.ok).toBe(true);
    if (!virtual.ok) return;

    const before = rangeOf(validSource, "before");
    const slash = rangeOf(validSource, "/");
    const uvProperty = rangeOf(validSource, "uv.x");
    const after = rangeOf(validSource, "after");
    const shaderRegion = virtual.virtualSource.shaderRegion;
    const crossing = {
      start: shaderRegion.start - 2,
      length: 4,
    };

    const routed = routeShaderDiagnostics({
      virtualSource: virtual.virtualSource,
      originalSemanticDiagnostics: [
        typeScriptDiagnostic(before, 2322, "before error"),
        typeScriptDiagnostic(slash, 2362, "native division error"),
        typeScriptDiagnostic(uvProperty, 2339, "native cascade error"),
        typeScriptDiagnostic(after, 2322, "after error"),
        typeScriptDiagnostic(crossing, 9991, "cross-boundary error"),
      ],
      virtualSemanticDiagnostics: [
        generatedDiagnostic(
          virtual.virtualSource,
          before,
          2322,
          "virtual before error",
        ),
        generatedDiagnostic(
          virtual.virtualSource,
          after,
          2322,
          "virtual after error",
        ),
      ],
    });

    expect(routed).toEqual([
      expect.objectContaining({
        range: before,
        code: 2322,
        message: "before error",
        source: "typescript",
      }),
      expect.objectContaining({
        range: after,
        code: 2322,
        message: "after error",
        source: "typescript",
      }),
    ]);
  });

  it("maps and deduplicates virtual callback diagnostics", () => {
    const virtual = createVirtualSource(validSource, "virtual-routing.shdr.ts");
    expect(virtual.ok).toBe(true);
    if (!virtual.ok) return;

    const propertyAccess = rangeOf(validSource, "uv.x");
    const originalRange = {
      start: propertyAccess.start + "uv.".length,
      length: 1,
    };
    const diagnostic = generatedDiagnostic(
      virtual.virtualSource,
      originalRange,
      9994,
      "virtual callback error",
    );
    const routed = routeShaderDiagnostics({
      virtualSource: virtual.virtualSource,
      virtualSemanticDiagnostics: [diagnostic, diagnostic],
    });

    expect(routed).toEqual([
      {
        range: originalRange,
        code: 9994,
        category: "error",
        message: "virtual callback error",
        source: "typescript",
      },
    ]);
  });

  it("surfaces an invalid shader division exactly once", () => {
    const expression = "coord.xy / coord";
    const source = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  const invalid = ${expression};
  return vec4(invalid.x, invalid.y, 0, 1);
});
`;
    const virtual = createVirtualSource(source, "invalid-routing.shdr.ts");
    expect(virtual.ok).toBe(true);
    if (!virtual.ok) return;

    const originalExpression = rangeOf(source, expression);
    const generatedCall = virtual.virtualSource.code.indexOf(
      "__shdr_internal_div(",
    );
    const generatedOperand = {
      start: generatedCall + "__shdr_internal_div(".length,
      length: "coord.xy".length,
    };
    const operation = typeScriptDiagnostic(
      originalExpression,
      2769,
      'Operator "/" cannot be applied to types "Expr<Vec2<F32>>" and "Expr<Vec4<F32>>".',
    );

    const routed = routeShaderDiagnostics({
      virtualSource: virtual.virtualSource,
      originalSemanticDiagnostics: [
        typeScriptDiagnostic(
          rangeOf(source, "/"),
          2362,
          "native division error",
        ),
      ],
      virtualSemanticDiagnostics: [
        typeScriptDiagnostic(
          generatedOperand,
          2769,
          "No overload matches this call.",
        ),
        typeScriptDiagnostic(
          {
            start: generatedCall,
            length: "__shdr_internal_div".length,
          },
          9992,
          "Generated __shdr_internal_div diagnostic.",
        ),
        typeScriptDiagnostic(
          rangeOf(virtual.virtualSource.code, '"shdr/internal"'),
          2307,
          "Cannot find module 'shdr/internal'.",
        ),
      ],
      shaderOperationDiagnostics: [operation],
    });

    expect(routed).toEqual([
      expect.objectContaining({
        range: originalExpression,
        code: 2769,
        message: operation.message,
        source: "shdr",
      }),
    ]);
  });

  it("uses a core diagnostic for unsupported shader syntax", () => {
    const source = `import { createFragmentShader, vec4 } from "shdr";

export default createFragmentShader(({ coord, uniforms }) => {
  let value = uniforms.time;
  return vec4(value, coord.x, 0, 1);
});
`;
    const virtual = createVirtualSource(source, "unsupported-routing.shdr.ts");
    expect(virtual.ok).toBe(false);
    if (virtual.ok) return;

    const callbackStart = source.indexOf("({ coord, uniforms })");
    const callbackEnd = source.indexOf("});", callbackStart) + 2;
    const shaderRegion = {
      start: callbackStart,
      length: callbackEnd - callbackStart,
    };
    const routed = routeShaderDiagnostics({
      shaderRegion,
      originalSemanticDiagnostics: [
        typeScriptDiagnostic(
          rangeOf(source, "value"),
          9993,
          "native callback error",
        ),
      ],
      coreDiagnostics: virtual.diagnostics,
    });

    expect(routed).toEqual([
      expect.objectContaining({
        code: ShaderDiagnosticCode.InvalidVariableDeclaration,
        message: "Shader variables must use const declarations.",
        source: "shdr",
      }),
    ]);
  });

  it("preserves the original syntactic diagnostic without a core duplicate", () => {
    const range = { start: 10, length: 1 };
    const routed = routeShaderDiagnostics({
      originalSyntacticDiagnostics: [
        typeScriptDiagnostic(range, 1005, "'}' expected."),
      ],
      coreDiagnostics: [
        {
          code: ShaderDiagnosticCode.TypeScriptSyntax,
          message: "Unexpected token.",
          range,
          severity: "error",
        },
      ],
    });

    expect(routed).toEqual([
      {
        range,
        code: 1005,
        category: "error",
        message: "'}' expected.",
        source: "typescript",
      },
    ]);
  });
});
