import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lowerFragment, ShaderDiagnosticCode } from "@shdr/core";
import { describe, expect, it } from "vitest";

import { checkShaderPaths } from "../src/check.js";
import { CliInputError } from "../src/contract.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = resolve(packageRoot, "../..");
const executable = join(packageRoot, "dist/bin.mjs");
const fixtureRoot = join(packageRoot, "test/fixtures");

async function withProject(
  test: (cwd: string) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "shdr-cli-integration-"));
  try {
    await test(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function fixture(
  cwd: string,
  name: string,
  target = name,
): Promise<void> {
  const destination = join(cwd, target);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(fixtureRoot, name), destination);
}

function invoke(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("installed executable", () => {
  it("checks helper-only and aliased graph entries through a selected tsconfig", async () => {
    await withProject(async (cwd) => {
      await mkdir(join(cwd, "src/lib"), { recursive: true });
      await writeFile(
        join(cwd, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            noEmit: true,
            paths: { "@shader/*": ["./src/lib/*.shdr.ts"] },
          },
          include: ["src/**/*.shdr.ts"],
        }),
      );
      await writeFile(
        join(cwd, "src/lib/math.shdr.ts"),
        `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
export const gain = defineShaderFunction((x: Expr<F32>) => x * 2);`,
      );
      await writeFile(
        join(cwd, "src/scene.shdr.ts"),
        `import { createFragmentShader, vec4 } from "shdr";
import { gain } from "@shader/math";
export default createFragmentShader(({ uniforms }) => vec4(gain(uniforms.time)));`,
      );
      const result = invoke(cwd, "check");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        "Checked 2 shader files: no Shdr diagnostics.\n",
      );
      expect(result.stderr).toBe("");
    });
  });

  it("checks module constants through helper edits and rejects constant imports/defaults", async () => {
    await withProject(async (cwd) => {
      await mkdir(join(cwd, "src"), { recursive: true });
      await writeFile(
        join(cwd, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { noEmit: true },
          include: ["src/**/*.shdr.ts"],
        }),
      );
      const helper = join(cwd, "src/helper.shdr.ts");
      const entry = join(cwd, "src/scene.shdr.ts");
      const helperSource = `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
const SCALE = 0.5;
export const scale = defineShaderFunction((x: Expr<F32>) => x * SCALE);
`;
      const entrySource = `import { createFragmentShader, vec4 } from "shdr";
import { scale } from "./helper.shdr.ts";
export default createFragmentShader(({ uniforms }) => vec4(scale(uniforms.time), 0, 0, 1));
`;
      await writeFile(helper, helperSource);
      await writeFile(entry, entrySource);
      const valid = invoke(cwd, "check");
      expect(valid.status).toBe(0);
      expect(valid.stdout).toBe(
        "Checked 2 shader files: no Shdr diagnostics.\n",
      );

      await writeFile(
        helper,
        helperSource.replace("const SCALE = 0.5;", "const SCALE = hostScale;"),
      );
      const invalidHelper = invoke(cwd, "check");
      expect(invalidHelper.status).toBe(1);
      expect(invalidHelper.stdout).toMatch(/helper\.shdr\.ts:3:15: SHDR1108: /);
      expect(invalidHelper.stdout).not.toMatch(/scene\.shdr\.ts:.*SHDR1108/);

      await writeFile(helper, helperSource);
      const restored = invoke(cwd, "check");
      expect(restored.status).toBe(0);

      await writeFile(
        join(cwd, "src/constants.shdr.ts"),
        "export const VALUE = 0.25;\n",
      );
      await writeFile(
        entry,
        `import { createFragmentShader, vec4 } from "shdr";
import { VALUE } from "./constants.shdr.ts";
export default createFragmentShader(() => vec4(VALUE, 0, 0, 1));
`,
      );
      const imported = invoke(cwd, "check");
      expect(imported.status).toBe(1);
      expect(imported.stdout).toMatch(/scene\.shdr\.ts:3:.*SHDR1108: /);

      await writeFile(
        entry,
        `import { createFragmentShader, defineUniforms, vec4 } from "shdr";
const GAIN = 0.5;
const uniforms = defineUniforms((u) => ({ gain: u.f32(GAIN) }));
export default createFragmentShader(({ uniforms }) => vec4(uniforms.gain), { uniforms });
`,
      );
      const invalidDefault = invoke(cwd, "check");
      expect(invalidDefault.status).toBe(1);
      expect(invalidDefault.stdout).toMatch(/scene\.shdr\.ts:3:.*SHDR1210: /);
    });
  });

  it("checks mixed-shape clamp/pow calls through local and imported entries", async () => {
    await withProject(async (cwd) => {
      await mkdir(join(cwd, "src/lib"), { recursive: true });
      await writeFile(
        join(cwd, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { noEmit: true },
          include: ["src/**/*.shdr.ts"],
        }),
      );
      await writeFile(
        join(cwd, "src/lib/mixed.shdr.ts"),
        `import { clamp, defineShaderFunction, pow, vec3 } from "shdr";
import type { Expr, F32, Vec3 } from "shdr";
export const mixed = defineShaderFunction((value: Expr<Vec3<F32>>, exponent: Expr<F32>) =>
  pow(clamp(value, exponent, vec3(2)), exponent)
);`,
      );
      await writeFile(
        join(cwd, "src/scene.shdr.ts"),
        `import { clamp, createFragmentShader, pow, vec2, vec3, vec4 } from "shdr";
import { mixed } from "./lib/mixed.shdr.ts";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const a = clamp(v2, s, s);
  const b = clamp(v2, s, v2);
  const c = clamp(v2, v2, s);
  const d = pow(v2, s);
  const e = clamp(v3, s, s);
  const f = clamp(v3, s, v3);
  const g = clamp(v3, v3, s);
  const h = pow(v3, s);
  const i = clamp(v4, s, s);
  const j = clamp(v4, s, v4);
  const k = clamp(v4, v4, s);
  const l = pow(v4, s);
  const m = mixed(v3, s);
  return vec4(a.x + b.x + c.x + d.x, e.x + f.x + g.x + h.x, i.x + j.x + k.x + l.x, m.x);
});`,
      );
      const result = invoke(cwd, "check");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        "Checked 2 shader files: no Shdr diagnostics.\n",
      );
      expect(result.stderr).toBe("");

      await writeFile(
        join(cwd, "src/scene.shdr.ts"),
        `import { createFragmentShader, pow, vec4 } from "shdr";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  return vec4(pow(s, coord.xyz));
});`,
      );
      const invalid = invoke(cwd, "check");
      expect(invalid.status).toBe(1);
      expect(invalid.stdout).toMatch(/scene\.shdr\.ts:4:15: SHDR1208: /);
      expect(invalid.stdout).not.toContain("shdr_internal_");
    });
  });

  it("checks relative dependencies outside the config-search root and rejects aliases without a project", async () => {
    await withProject(async (cwd) => {
      const external = await mkdtemp(join(tmpdir(), "shdr-cli-external-"));
      try {
        await mkdir(join(external, "scenes"), { recursive: true });
        await mkdir(join(external, "lib"), { recursive: true });
        const entry = join(external, "scenes/scene.shdr.ts");
        await writeFile(
          entry,
          `import { createFragmentShader, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";
import { helper } from "../lib/helper.shdr.ts";
export default createFragmentShader(({ uniforms }) => vec4(helper(uniforms.time)));`,
        );
        await writeFile(
          join(external, "lib/helper.shdr.ts"),
          `import { defineShaderFunction } from "shdr";
import type { Expr, F32 } from "shdr";
export const helper = defineShaderFunction((x: Expr<F32>) => x);`,
        );
        const relativeResult = invoke(cwd, "check", entry);
        expect(relativeResult.status).toBe(0);
        expect(relativeResult.stdout).toBe(
          "Checked 1 shader file: no Shdr diagnostics.\n",
        );

        await writeFile(
          entry,
          `import { createFragmentShader, vec4 } from "shdr";
import type { Expr, F32 } from "shdr";
import { helper } from "@shader/helper";
export default createFragmentShader(({ uniforms }) => vec4(helper(uniforms.time)));`,
        );
        const aliasResult = invoke(cwd, "check", entry);
        expect(aliasResult.status).toBe(1);
        expect(aliasResult.stdout).toMatch(/scene\.shdr\.ts:3:24: SHDR1301: /);
      } finally {
        await rm(external, { recursive: true, force: true });
      }
    });
  });

  it("reports one shared helper fault for multiple dependent entries", async () => {
    await withProject(async (cwd) => {
      await mkdir(join(cwd, "src"), { recursive: true });
      await writeFile(
        join(cwd, "src/shared.shdr.ts"),
        `import { defineShaderFunction, sqrt } from "shdr";
import type { Expr, F32 } from "shdr";
export const bad = defineShaderFunction((x: Expr<F32>) => sqrt(-1));`,
      );
      for (const name of ["a", "b"]) {
        await writeFile(
          join(cwd, `src/${name}.shdr.ts`),
          `import { bad } from "./shared.shdr.ts";\nexport default bad;\n`,
        );
      }
      const result = invoke(cwd, "check");
      expect(result.status).toBe(1);
      expect(result.stdout.match(/SHDR1209/g)).toHaveLength(1);
    });
  });

  it("checks valid shaders from another working directory without checking ordinary TS", async () => {
    await withProject(async (cwd) => {
      await fixture(cwd, "valid.shdr.ts", "folder with spaces/valid.shdr.ts");
      const result = invoke(cwd, "check");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        "Checked 1 shader file: no Shdr diagnostics.\n",
      );
      expect(result.stderr).toBe("");
      expect(
        invoke(cwd, "check", "folder with spaces/valid.shdr.ts").stdout,
      ).toBe("Checked 1 shader file: no Shdr diagnostics.\n");
      await fixture(cwd, "valid.shdr.ts", "another.shdr.ts");
      expect(invoke(cwd, "check").stdout).toBe(
        "Checked 2 shader files: no Shdr diagnostics.\n",
      );
    });
  });

  it("reports boundary, syntax, and semantic failures across files in path order", async () => {
    await withProject(async (cwd) => {
      for (const [source, target] of [
        ["semantic.shdr.ts", "z.shdr.ts"],
        ["unsupported.shdr.ts", "b.shdr.ts"],
        ["nested.shdr.ts", "nested/n.shdr.ts"],
        ["bad-boundary.shdr.ts", "a.shdr.ts"],
      ]) {
        await fixture(cwd, source!, target!);
      }
      const result = invoke(cwd, "check");
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      const lines = result.stdout.trimEnd().split("\n");
      expect(lines).toHaveLength(4);
      expect(lines[0]).toMatch(/^a\.shdr\.ts:1:1: SHDR1005: /);
      expect(lines[1]).toMatch(/^b\.shdr\.ts:4:14: SHDR1103: /);
      expect(lines[2]).toMatch(/^nested\/n\.shdr\.ts:4:14: SHDR1205: /);
      expect(lines[3]).toMatch(/^z\.shdr\.ts:4:14: SHDR1205: /);
      expect(result.stdout).not.toContain("__shdr_internal_");
    });
  });

  it("prints every diagnostic returned for a single source in source order", async () => {
    await withProject(async (cwd) => {
      await writeFile(
        join(cwd, "imports.shdr.ts"),
        'import { createFragmentShader, brokenA, brokenB } from "shdr";\n',
      );
      const result = invoke(cwd, "check");
      expect(result.status).toBe(1);
      expect(result.stdout.trimEnd().split("\n")).toEqual([
        expect.stringMatching(/^imports\.shdr\.ts:1:32: SHDR1007: /),
        expect.stringMatching(/^imports\.shdr\.ts:1:41: SHDR1007: /),
      ]);
    });
  });

  it("reports new arithmetic diagnostics matching the core", async () => {
    await withProject(async (cwd) => {
      await fixture(cwd, "invalid-arithmetic.shdr.ts");
      const source = await readFile(
        join(cwd, "invalid-arithmetic.shdr.ts"),
        "utf8",
      );
      const lowered = lowerFragment(source);
      expect(lowered.ok).toBe(false);
      if (lowered.ok) return;
      const result = invoke(cwd, "check");
      expect(result.status).toBe(1);
      expect(result.stdout).toBe(
        `invalid-arithmetic.shdr.ts:4:18: SHDR1205: ${lowered.diagnostics[0]!.message}\n`,
      );
    });
  });

  it("rejects non-finite and f32-overflowed literals before target generation", async () => {
    await withProject(async (cwd) => {
      const file = join(cwd, "overflow.shdr.ts");
      for (const literal of ["1e300", "1e999"]) {
        await writeFile(
          file,
          `import { createFragmentShader, vec4 } from "shdr";\nexport default createFragmentShader(({ coord, uniforms }) => {\n  return vec4(${literal}, 0, 0, 1);\n});\n`,
        );
        const result = invoke(cwd, "check", "overflow.shdr.ts");
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(
          /^overflow\.shdr\.ts:3:15: SHDR1211: Shader numeric literals must be finite without f32 overflow\./,
        );
        expect(result.stderr).toBe("");
      }
    });
  });

  it("checks math builtin calls and preserves SHDR1208/SHDR1209 in CLI output", async () => {
    await withProject(async (cwd) => {
      const file = join(cwd, "math.shdr.ts");
      const shader = (expression: string) =>
        `import { createFragmentShader, vec4, sin, smoothstep, ceil, distance, cross } from "shdr";\nexport default createFragmentShader(({ coord, uniforms }) => {\n  const value = ${expression};\n  return vec4(value, 0, 0, 1);\n});\n`;
      await writeFile(file, shader("sin(uniforms.time)"));
      expect(invoke(cwd, "check").status).toBe(0);
      await writeFile(file, shader("smoothstep(0.8, 0.2, uniforms.time)"));
      expect(invoke(cwd, "check").status).toBe(0);
      await writeFile(
        file,
        shader(
          "ceil(distance(coord.xy, coord.xy)) + cross(coord.xyz, coord.xyz).x",
        ),
      );
      expect(invoke(cwd, "check").status).toBe(0);
      await writeFile(file, shader("cross(coord.xy, coord.xy).x"));
      expect(invoke(cwd, "check").stdout).toMatch(
        /SHDR1208: No matching "cross" builtin/,
      );
      await writeFile(file, shader("sin(uniforms.time, coord.xy)"));
      expect(invoke(cwd, "check").stdout).toMatch(
        /^math\.shdr\.ts:3:17: SHDR1208: No matching "sin" builtin/,
      );
      await writeFile(file, shader("smoothstep(0, 0, uniforms.time)"));
      expect(invoke(cwd, "check").stdout).toMatch(
        /^math\.shdr\.ts:3:17: SHDR1209: smoothstep requires distinct edges/,
      );
    });
  });

  it("checks all orbit signatures and imported helper parity through the executable", async () => {
    await withProject(async (cwd) => {
      await mkdir(join(cwd, "src/lib"), { recursive: true });
      await writeFile(
        join(cwd, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { noEmit: true },
          include: ["src/**/*.shdr.ts"],
        }),
      );
      await writeFile(
        join(cwd, "src/lib/orbit.shdr.ts"),
        `import { atan, defineShaderFunction, mod } from "shdr";
import type { Expr, F32, Vec3 } from "shdr";
export const orbit = defineShaderFunction((y: Expr<Vec3<F32>>, x: Expr<Vec3<F32>>) => mod(atan(y, x), 2));
`,
      );
      const valid = `import { acos, asin, atan, createFragmentShader, degrees, mod, radians, vec2, vec3, vec4 } from "shdr";
import { orbit } from "./lib/orbit.shdr.ts";
export default createFragmentShader(({ coord, uniforms }) => {
  const s = uniforms.time;
  const v2 = coord.xy;
  const v3 = coord.xyz;
  const v4 = coord;
  const a0 = asin(s); const a1 = asin(v2); const a2 = asin(v3); const a3 = asin(v4);
  const b0 = acos(s); const b1 = acos(v2); const b2 = acos(v3); const b3 = acos(v4);
  const c0 = atan(s); const c1 = atan(v2); const c2 = atan(v3); const c3 = atan(v4);
  const d0 = atan(s, s); const d1 = atan(v2, v2); const d2 = atan(v3, v3); const d3 = atan(v4, v4);
  const e0 = radians(s); const e1 = radians(v2); const e2 = radians(v3); const e3 = radians(v4);
  const f0 = degrees(s); const f1 = degrees(v2); const f2 = degrees(v3); const f3 = degrees(v4);
  const g0 = mod(s, s); const g1 = mod(v2, v2); const g2 = mod(v2, s);
  const g3 = mod(v3, v3); const g4 = mod(v3, s); const g5 = mod(v4, v4); const g6 = mod(v4, s);
  const h = orbit(v3, v3);
  return vec4(a0 + b0 + c0 + d0 + e0 + f0 + g0 + g2.x + h.x, a1.x + b1.x + c1.x + d1.x + e1.x + f1.x + g1.x + g3.x, a2.x + b2.x + c2.x + d2.x + e2.x + f2.x + g4.x + h.y, a3.x + b3.x + c3.x + d3.x + e3.x + f3.x + g5.x + g6.x);
});
`;
      const validFile = join(cwd, "src/scene.shdr.ts");
      await writeFile(validFile, valid);
      const accepted = invoke(cwd, "check");
      expect(accepted.status).toBe(0);
      expect(accepted.stdout).toBe(
        "Checked 2 shader files: no Shdr diagnostics.\n",
      );
      expect(accepted.stderr).toBe("");

      for (const expression of ["atan(v2, s)", "atan(3e38 + 3e38)"]) {
        const source = valid.replace(
          "  const h = orbit(v3, v3);",
          `  const h = ${expression};`,
        );
        await writeFile(validFile, source);
        const lowered = lowerFragment(source);
        expect(lowered.ok, expression).toBe(false);
        if (lowered.ok) continue;
        const diagnostic = lowered.diagnostics[0]!;
        const result = invoke(cwd, "check", "src/scene.shdr.ts");
        expect(result.status, expression).toBe(1);
        expect(result.stdout, expression).toBe(
          `src/scene.shdr.ts:${source.slice(0, diagnostic.range.start).split("\n").length}:${source.slice(0, diagnostic.range.start).split("\n").at(-1)!.length + 1}: ${diagnostic.code}: ${diagnostic.message}\n`,
        );
        expect(result.stdout).not.toContain("shdr_internal_");
      }
    });
  });

  it("checks the complete square-matrix vocabulary and imported helper boundaries", async () => {
    await withProject(async (cwd) => {
      await mkdir(join(cwd, "src/lib"), { recursive: true });
      await writeFile(
        join(cwd, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { noEmit: true },
          include: ["src/**/*.shdr.ts"],
        }),
      );
      await writeFile(
        join(cwd, "src/lib/matrices.shdr.ts"),
        `import { defineShaderFunction, mat2, mat3, mat4 } from "shdr";
import type { Expr, F32, Mat3 } from "shdr";
export const diagonal2 = defineShaderFunction((value: Expr<F32>) => mat2(value));
export const copy3 = defineShaderFunction((value: Expr<Mat3<F32>>): Expr<Mat3<F32>> => mat3(value));
export const diagonal4 = defineShaderFunction((value: Expr<F32>) => mat4(value));
`,
      );
      const entry = `import { createFragmentShader, mat2, mat3, mat4, vec2, vec3, vec4 } from "shdr";
import { copy3, diagonal2, diagonal4 } from "./lib/matrices.shdr.ts";
export default createFragmentShader(({ uniforms }) => {
  const m2d = diagonal2(uniforms.time);
  const m2f = mat2(uniforms.time, uniforms.time, uniforms.time, uniforms.time);
  const m2c = mat2(vec2(uniforms.time), vec2(uniforms.time));
  const m2x = mat2(m2d);
  const m3d = mat3(uniforms.time);
  const m3f = mat3(uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time);
  const m3c = mat3(vec3(uniforms.time), vec3(uniforms.time), vec3(uniforms.time));
  const m3x = copy3(m3d);
  const m4d = diagonal4(uniforms.time);
  const m4f = mat4(uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time, uniforms.time);
  const m4c = mat4(vec4(uniforms.time), vec4(uniforms.time), vec4(uniforms.time), vec4(uniforms.time));
  const m4x = mat4(m4d);
  const a2 = m2d + m2f; const b2 = m2d - m2f; const c2 = m2d * uniforms.time; const d2 = uniforms.time * m2d; const e2 = m2d * vec2(uniforms.time); const f2 = vec2(uniforms.time) * m2d; const g2 = m2d * m2f;
  const a3 = m3d + m3f; const b3 = m3d - m3f; const c3 = m3d * uniforms.time; const d3 = uniforms.time * m3d; const e3 = m3d * vec3(uniforms.time); const f3 = vec3(uniforms.time) * m3d; const g3 = m3d * m3f;
  const a4 = m4d + m4f; const b4 = m4d - m4f; const c4 = m4d * uniforms.time; const d4 = uniforms.time * m4d; const e4 = m4d * vec4(uniforms.time); const f4 = vec4(uniforms.time) * m4d; const g4 = m4d * m4f;
  return vec4(e2.x + f2.x, e3.x + f3.x, e4.x + f4.x, 1);
});
`;
      const entryFile = join(cwd, "src/scene.shdr.ts");
      await writeFile(entryFile, entry);
      const accepted = invoke(cwd, "check");
      expect(accepted.status).toBe(0);
      expect(accepted.stdout).toBe(
        "Checked 2 shader files: no Shdr diagnostics.\n",
      );
      expect(accepted.stderr).toBe("");

      const changed = entry.replace("copy3(m3d)", "copy3(m2d)");
      await writeFile(entryFile, changed);
      const rejected = invoke(cwd, "check", "src/scene.shdr.ts");
      expect(rejected.status).toBe(1);
      expect(rejected.stdout).toMatch(
        /src\/scene\.shdr\.ts:\d+:\d+: SHDR1213: /,
      );
      expect(rejected.stdout).not.toContain("shdr_internal_");
    });
  });

  it("checks direct texture sampling through the executable", async () => {
    await withProject(async (cwd) => {
      await fixture(cwd, "sample-valid.shdr.ts");
      const result = invoke(cwd, "check", "sample-valid.shdr.ts");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        "Checked 1 shader file: no Shdr diagnostics.\n",
      );
      expect(result.stderr).toBe("");
    });
  });

  it("checks mix/step signatures and source-mapped boundary failures through the executable", async () => {
    await withProject(async (cwd) => {
      await fixture(cwd, "mix-step-valid.shdr.ts");
      const accepted = invoke(cwd, "check", "mix-step-valid.shdr.ts");
      expect(accepted.status).toBe(0);
      expect(accepted.stdout).toBe(
        "Checked 1 shader file: no Shdr diagnostics.\n",
      );
      expect(accepted.stderr).toBe("");

      for (const [name, code] of [
        ["mix-step-bad-shape.shdr.ts", ShaderDiagnosticCode.InvalidBuiltin],
        ["mix-step-nested.shdr.ts", ShaderDiagnosticCode.InvalidBuiltin],
        ["mix-step-unimported.shdr.ts", ShaderDiagnosticCode.UnsupportedCall],
        ["mix-step-aliased.shdr.ts", ShaderDiagnosticCode.ImportAlias],
      ] as const) {
        await fixture(cwd, name);
        const source = await readFile(join(cwd, name), "utf8");
        const lowered = lowerFragment(source);
        expect(lowered.ok, name).toBe(false);
        if (lowered.ok) continue;
        expect(lowered.diagnostics, name).toHaveLength(1);
        const diagnostic = lowered.diagnostics[0]!;
        expect(diagnostic.code, name).toBe(code);
        const before = source.slice(0, diagnostic.range.start).split("\n");
        const line = before.length;
        const column = before.at(-1)!.length + 1;
        const result = invoke(cwd, "check", name);
        expect(result.status, name).toBe(1);
        expect(result.stdout, name).toBe(
          `${name}:${line}:${column}: ${code}: ${diagnostic.message}\n`,
        );
        expect(result.stderr, name).toBe("");
      }
    });
  });

  it("checks PR 3 math signatures, domains and import boundaries through the executable", async () => {
    await withProject(async (cwd) => {
      const fileName = "pr3.shdr.ts";
      const file = join(cwd, fileName);
      const shader = (
        expression: string,
        imports = "sqrt, exp, tanh, clamp, pow, vec2, vec3, vec4",
      ) =>
        `import { createFragmentShader, ${imports} } from "shdr";\nexport default createFragmentShader(({ uniforms }) => {\n  const value = ${expression};\n  return vec4(value, 0, 0, 1);\n});\n`;
      for (const text of [
        shader("sqrt(9) + exp(0) + tanh(1000) + clamp(2, 0, 1) + pow(2, 3)"),
        shader("pow(vec3(2), vec3(3))", "pow, vec3, vec4").replace(
          "return vec4(value, 0, 0, 1)",
          "return vec4(value, 1)",
        ),
      ]) {
        await writeFile(file, text);
        const result = invoke(cwd, "check", fileName);
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(
          "Checked 1 shader file: no Shdr diagnostics.\n",
        );
      }
      for (const [text, code] of [
        [shader("pow(3, vec3(2))"), ShaderDiagnosticCode.InvalidBuiltin],
        [shader("sqrt(-1)"), ShaderDiagnosticCode.InvalidBuiltinDomain],
        [shader("clamp(0.5, 1, 0)"), ShaderDiagnosticCode.InvalidBuiltinDomain],
        [shader("pow(0, 0)"), ShaderDiagnosticCode.InvalidBuiltinDomain],
        [shader("exp(1000)"), ShaderDiagnosticCode.InvalidBuiltinDomain],
        [
          shader("tanh(3e38 + 3e38)"),
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        ],
        [
          shader("tanh(vec2(uniforms.time, 3e38 + 3e38))"),
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        ],
        [
          shader("sqrt(vec2(uniforms.time, -1))"),
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        ],
        [
          shader("exp(vec2(uniforms.time, 1000))"),
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        ],
        [
          shader("clamp(vec2(0), vec2(uniforms.time, 2), vec2(1))"),
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        ],
        [
          shader("sqrt(alias.yx)").replace(
            "  const value =",
            "  const alias = vec2(-1, uniforms.time);\n  const value =",
          ),
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        ],
        [shader("pow(2, 130)"), ShaderDiagnosticCode.InvalidBuiltinDomain],
        [shader("pow(10, 39)"), ShaderDiagnosticCode.InvalidBuiltinDomain],
        [
          shader("sqrt(3e38 + 3e38)"),
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        ],
        [
          shader("sqrt(sin(3e38 + 3e38))", "sqrt, sin, vec4"),
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        ],
        [
          shader("sqrt(vec2(uniforms.time, 3e38 + 3e38).x)"),
          ShaderDiagnosticCode.InvalidBuiltinDomain,
        ],
        [shader("sqrt(1)", "vec3, vec4"), ShaderDiagnosticCode.UnsupportedCall],
        [
          shader("sqrt(1)", "sqrt as root, vec3, vec4"),
          ShaderDiagnosticCode.ImportAlias,
        ],
      ] as const) {
        await writeFile(file, text);
        const lowered = lowerFragment(text);
        expect(lowered.ok, text).toBe(false);
        if (lowered.ok) continue;
        expect(lowered.diagnostics).toHaveLength(1);
        const diagnostic = lowered.diagnostics[0]!;
        expect(diagnostic.code).toBe(code);
        const before = text.slice(0, diagnostic.range.start).split("\n");
        const result = invoke(cwd, "check", fileName);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe(
          `${fileName}:${before.length}:${before.at(-1)!.length + 1}: ${code}: ${diagnostic.message}\n`,
        );
        expect(result.stderr).toBe("");
      }
    });
  });

  it("preserves original UTF-16 offsets, including CRLF and characters outside the BMP", async () => {
    await withProject(async (cwd) => {
      const source = await readFile(
        join(fixtureRoot, "semantic.shdr.ts"),
        "utf8",
      );
      await writeFile(
        join(cwd, "emoji.shdr.ts"),
        `// 🎨\r\n${source.replace("  const uv =", "  /*🎨*/ const uv =").replaceAll("\n", "\r\n")}`,
      );
      const result = invoke(cwd, "check", "emoji.shdr.ts");
      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(/^emoji\.shdr\.ts:5:21: SHDR1205: /);
    });
  });

  it("fails closed for no matches, invalid paths/options, and non-shader files", async () => {
    await withProject(async (cwd) => {
      await writeFile(join(cwd, "ordinary.ts"), "const value = 1;\n");
      for (const args of [
        ["check"],
        ["check", "missing"],
        ["check", "ordinary.ts"],
        ["check", "--invalid"],
        ["compile"],
      ]) {
        const result = invoke(cwd, ...args);
        expect(result.status).toBe(2);
        expect(result.stdout).toBe("");
        expect(result.stderr).toMatch(/^shdr: /);
      }
      expect(invoke(cwd, "check", "missing").stderr).toContain("ENOENT");
      const help = invoke(cwd, "check", "--help");
      expect(help.status).toBe(0);
      expect(help.stdout).toContain("shdr check [paths...]");
    });
  });

  it("respects default ignores while accepting explicit ignored files", async () => {
    await withProject(async (cwd) => {
      await fixture(cwd, "valid.shdr.ts", "src/valid.shdr.ts");
      await fixture(cwd, "semantic.shdr.ts", "dist/semantic.shdr.ts");
      await fixture(cwd, "semantic.shdr.ts", "test/fixtures/semantic.shdr.ts");
      expect(invoke(cwd, "check").stdout).toBe(
        "Checked 1 shader file: no Shdr diagnostics.\n",
      );
      expect(invoke(cwd, "check", "dist/semantic.shdr.ts").status).toBe(1);
      expect(invoke(cwd, "check", "test/fixtures").status).toBe(1);
    });
  });

  it("is reachable through the root workspace script", () => {
    const result = spawnSync("pnpm", ["shdr", "check"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /Checked [1-9]\d* shader files?: no Shdr diagnostics\./,
    );
    expect(result.stderr).not.toContain("shdr: ");
  });
});

describe("checker API", () => {
  it("does not return partial diagnostics when reading another file fails", async () => {
    await withProject(async (cwd) => {
      await fixture(cwd, "semantic.shdr.ts", "a.shdr.ts");
      await fixture(cwd, "valid.shdr.ts", "b.shdr.ts");
      await expect(
        checkShaderPaths(["a.shdr.ts", "b.shdr.ts"], cwd, async (file) => {
          if (file.endsWith("b.shdr.ts")) {
            throw Object.assign(new Error("Permission denied"), {
              code: "EACCES",
            });
          }
          return readFile(file, "utf8");
        }),
      ).rejects.toThrow(CliInputError);
      const result = await checkShaderPaths(["a.shdr.ts", "b.shdr.ts"], cwd);
      expect(result.outcome).toBe("diagnostics");
      expect(result.fileCount).toBe(2);
      expect(result.lines).toHaveLength(1);
    });
  });
});
