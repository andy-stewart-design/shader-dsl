import {
  checkShaderGraph,
  createVirtualSource,
  ShaderDiagnosticCode,
  type VirtualSource,
} from "@shdr/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  routeShaderDiagnostics,
  TypeScript7CheckerAdapter,
} from "../src/index.js";

const projectDirectory = fileURLToPath(
  new URL("fixtures/project/", import.meta.url),
);
const fileName = join(projectDirectory, "gradient.shdr.ts");
const helperFileName = join(projectDirectory, "imported-helper.shdr.ts");

const source = `import { createFragmentShader, vec2, vec3, vec4 } from "shdr";

const RADIUS = 0.1;
const CENTER = vec2(0, RADIUS);
const TINT = vec3(RADIUS, 0.2, 0.3);
const HOST_COPY: number = RADIUS;

export default createFragmentShader(({ coord }) => {
  return vec4(coord.x * RADIUS, CENTER.x, TINT.x, 1);
});
`;

/**
 * Feasibility-only candidate: retain ordinary module declarations and add
 * shader-typed aliases/initializer expressions only in the generated shader
 * view. This intentionally does not change production transformation code.
 */
function candidateVirtualSource(): VirtualSource {
  const code = `import { __shdr_internal_f32, __shdr_internal_mul } from "shdr/internal";
${source
  .replace(
    "const CENTER = vec2(0, RADIUS);",
    "const CENTER = vec2(__shdr_internal_f32(0), __shdr_internal_f32(0.1));",
  )
  .replace(
    "const TINT = vec3(RADIUS, 0.2, 0.3);",
    "const TINT = vec3(__shdr_internal_f32(0.1), __shdr_internal_f32(0.2), __shdr_internal_f32(0.3));",
  )
  .replace(
    "return vec4(coord.x * RADIUS, CENTER.x, TINT.x, 1);",
    `const RADIUS = __shdr_internal_f32(0.1);
  return vec4(__shdr_internal_mul(coord.x, RADIUS), CENTER.x, TINT.x, __shdr_internal_f32(1));`,
  )}`;

  const mappings = [
    identityMapping(
      source,
      code,
      source.indexOf("const RADIUS") + 6,
      6,
      code.indexOf("const RADIUS") + 6,
    ),
    identityMapping(
      source,
      code,
      source.indexOf("RADIUS", source.indexOf("return")),
      6,
      code.lastIndexOf("RADIUS"),
    ),
    identityMapping(
      source,
      code,
      source.indexOf("CENTER", source.indexOf("return")),
      6,
      code.lastIndexOf("CENTER"),
    ),
    identityMapping(
      source,
      code,
      source.indexOf("TINT", source.indexOf("return")),
      4,
      code.lastIndexOf("TINT"),
    ),
  ];
  const callbackStart = source.indexOf("({ coord }) => {");
  const callbackEnd = source.indexOf("\n});", callbackStart) + 3;
  const moduleConstantsStart = source.indexOf("const RADIUS");
  const moduleConstantsEnd = source.indexOf("\n\nexport default");
  const shaderRegion = {
    start: callbackStart,
    length: callbackEnd - callbackStart,
  };

  return {
    code,
    mappings,
    operations: [],
    shaderRegion,
    shaderRegions: [
      {
        start: moduleConstantsStart,
        length: moduleConstantsEnd - moduleConstantsStart,
      },
      shaderRegion,
    ],
  };
}

const helperSource = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";

const SCALE = 0.5;
export const scale = defineShaderFunction((x: Expr<F32>) => x * SCALE);
`;

function helperCandidateVirtualSource(): VirtualSource {
  const code = `import { __shdr_internal_f32, __shdr_internal_mul } from "shdr/internal";
${helperSource.replace(
  "export const scale = defineShaderFunction((x: Expr<F32>) => x * SCALE);",
  `export const scale = defineShaderFunction((x: Expr<F32>) => {
  const SCALE = __shdr_internal_f32(0.5);
  return __shdr_internal_mul(x, SCALE);
});`,
)}`;
  const originalUse = helperSource.indexOf("SCALE", helperSource.indexOf("=>"));
  const generatedUse = code.lastIndexOf("SCALE");
  return {
    code,
    mappings: [
      {
        original: { start: originalUse, length: "SCALE".length },
        generated: { start: generatedUse, length: "SCALE".length },
        kind: "identity",
      },
    ],
    operations: [],
    shaderRegion: { start: 0, length: 0 },
    shaderRegions: [
      {
        start: helperSource.indexOf("export const scale"),
        length:
          "export const scale = defineShaderFunction((x: Expr<F32>) => x * SCALE);"
            .length,
      },
    ],
  };
}

function identityMapping(
  original: string,
  generated: string,
  originalStart: number,
  length: number,
  generatedStart?: number,
): VirtualSource["mappings"][number] {
  const token = original.slice(originalStart, originalStart + length);
  const actualGeneratedStart =
    generatedStart ??
    generated.indexOf(token, generated.indexOf("export default"));
  if (actualGeneratedStart < 0) {
    throw new Error(
      `Could not map ${JSON.stringify(token)} in candidate source.`,
    );
  }
  return {
    original: { start: originalStart, length },
    generated: { start: actualGeneratedStart, length },
    kind: "identity",
  };
}

describe("module constant feasibility characterization", () => {
  it("confirms current capture behavior and a bounded scalar/vector virtual bridge", () => {
    const current = createVirtualSource(source, fileName);
    expect(current.ok, JSON.stringify(current)).toBe(true);
    if (!current.ok) return;

    const checker = new TypeScript7CheckerAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    try {
      const original = checker.checkSource(fileName, source);
      const originalDiagnostics = [
        ...original.syntacticDiagnostics,
        ...original.semanticDiagnostics,
      ];
      expect(
        originalDiagnostics.some((diagnostic) => diagnostic.code === 2345),
      ).toBe(true);
      original.dispose();

      const candidate = candidateVirtualSource();
      const checked = checker.checkVirtualSource(fileName, candidate);
      try {
        expect(checked.syntacticDiagnostics).toEqual([]);
        expect(checked.semanticDiagnostics).toEqual([]);

        const radiusDeclaration = checked.getQuickInfoAtGeneratedPosition(
          candidate.code.indexOf("RADIUS"),
        );
        expect(radiusDeclaration?.display).not.toContain("Expr<F32>");
        expect(radiusDeclaration?.display).toBe("0.1");

        const radiusUse = source.indexOf("RADIUS", source.indexOf("return"));
        expect(checked.getQuickInfoAtOriginalPosition(radiusUse)).toMatchObject(
          {
            name: "RADIUS",
            display: "Expr<F32>",
            range: { start: radiusUse, length: "RADIUS".length },
          },
        );

        const routed = routeShaderDiagnostics({
          virtualSource: candidate,
          shaderRegions: candidate.shaderRegions,
          originalSyntacticDiagnostics: original.syntacticDiagnostics,
          originalSemanticDiagnostics: original.semanticDiagnostics,
          virtualSemanticDiagnostics: checked.semanticDiagnostics,
        });
        expect(routed).toEqual([]);
      } finally {
        checked.dispose();
      }
    } finally {
      checker.dispose();
    }
  });

  it("applies the same bounded bridge to helper-only virtual regions", () => {
    const current = createVirtualSource(helperSource, helperFileName);
    expect(current.ok, JSON.stringify(current)).toBe(true);
    if (!current.ok) return;

    const checker = new TypeScript7CheckerAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    try {
      const checked = checker.checkVirtualSource(
        helperFileName,
        helperCandidateVirtualSource(),
      );
      try {
        expect(checked.syntacticDiagnostics).toEqual([]);
        expect(checked.semanticDiagnostics).toEqual([]);
        const use = helperSource.indexOf("SCALE", helperSource.indexOf("=>"));
        expect(checked.getQuickInfoAtOriginalPosition(use)).toMatchObject({
          name: "SCALE",
          display: "Expr<F32>",
          range: { start: use, length: "SCALE".length },
        });
      } finally {
        checked.dispose();
      }
    } finally {
      checker.dispose();
    }
  });

  it("keeps graph ownership in the defining file and has no constant import kind", () => {
    const invalidHelper = helperSource.replace(
      "const SCALE = 0.5;",
      "const SCALE = hostScale;",
    );
    const graph = checkShaderGraph({
      entry: "/work/entry.shdr.ts",
      files: {
        "/work/entry.shdr.ts": `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./helper.shdr.ts";
export default createFragmentShader(({ uniforms }) => vec4(scale(uniforms.time), 0, 0, 1));`,
        "/work/helper.shdr.ts": invalidHelper,
      },
    });
    expect(graph.ok).toBe(false);
    if (!graph.ok) {
      expect(graph.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.ClosureCapture,
        fileName: "/work/helper.shdr.ts",
      });
      expect(graph.diagnostics[0]?.range.start).toBe(
        invalidHelper.indexOf("hostScale"),
      );
    }

    const importedConstant = checkShaderGraph({
      entry: "/work/entry.shdr.ts",
      files: {
        "/work/entry.shdr.ts": `import { createFragmentShader, vec4 } from "shdr";
import { RADIUS } from "./constants.shdr.ts";
export default createFragmentShader(() => vec4(RADIUS, 0, 0, 1));`,
        "/work/constants.shdr.ts": "export const RADIUS = 0.1;",
      },
    });
    expect(importedConstant.ok).toBe(false);
    if (!importedConstant.ok) {
      expect(importedConstant.diagnostics[0]).toMatchObject({
        code: ShaderDiagnosticCode.ClosureCapture,
        fileName: "/work/entry.shdr.ts",
      });
    }
  });

  it("leaves unused top-level host code outside the shader boundary", () => {
    const result = createVirtualSource(
      `import { createFragmentShader, vec4 } from "shdr";
const HOST_VALUE = Math.random();
export default createFragmentShader(() => vec4(0, 0, 0, 1));`,
      fileName,
    );
    expect(result.ok).toBe(true);
  });

  it("leaves ordinary TypeScript number usage unchanged", () => {
    const checker = new TypeScript7CheckerAdapter({
      cwd: projectDirectory,
      projectFileName: "tsconfig.json",
    });
    try {
      const ordinary = checker.checkSource(
        join(projectDirectory, "ordinary.ts"),
        "const RADIUS = 0.1;\nconst copy: number = RADIUS;\n",
      );
      try {
        expect(ordinary.syntacticDiagnostics).toEqual([]);
        expect(ordinary.semanticDiagnostics).toEqual([]);
      } finally {
        ordinary.dispose();
      }
    } finally {
      checker.dispose();
    }
  });
});
