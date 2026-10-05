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
        [shader("pow(vec3(2), 3)"), ShaderDiagnosticCode.InvalidBuiltin],
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
