import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CliInputError,
  HELP,
  discoverShaderFiles,
  exitCodeFor,
  parseCommand,
} from "../src/index.js";

async function inTemporaryDirectory(
  test: (cwd: string) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "shdr-cli-contract-"));
  try {
    await test(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

describe("command contract", () => {
  it("provides help without invoking a checker", () => {
    expect(parseCommand(["--help"])).toEqual({ kind: "help" });
    expect(parseCommand(["-h"])).toEqual({ kind: "help" });
    expect(parseCommand(["check", "--help"])).toEqual({ kind: "help" });
    expect(HELP).toContain("shdr check [paths...]");
  });

  it("distinguishes default and explicit paths, including literal dash paths", () => {
    expect(parseCommand(["check"])).toEqual({ kind: "check", paths: [] });
    expect(parseCommand(["check", "one", "two"])).toEqual({
      kind: "check",
      paths: ["one", "two"],
    });
    expect(parseCommand(["check", "--", "-test.shdr.ts"])).toEqual({
      kind: "check",
      paths: ["-test.shdr.ts"],
    });
  });

  it("rejects unsupported commands and options", () => {
    for (const args of [
      [],
      ["compile"],
      ["check", "--unknown"],
      ["check", "--help", "file.shdr.ts"],
      ["check", ""],
    ]) {
      expect(() => parseCommand(args)).toThrow(CliInputError);
    }
  });

  it("assigns distinct success, diagnostic, and input-error exit codes", () => {
    expect(exitCodeFor("clean")).toBe(0);
    expect(exitCodeFor("diagnostics")).toBe(1);
    expect(exitCodeFor("input-error")).toBe(2);
  });
});

describe("path discovery contract", () => {
  it("fails closed on no matches, missing paths, and non-shader files", async () => {
    await inTemporaryDirectory(async (cwd) => {
      await expect(discoverShaderFiles([], cwd)).rejects.toThrow(
        "No .shdr.ts files found",
      );
      await expect(discoverShaderFiles(["missing"], cwd)).rejects.toThrow(
        'Cannot access path "missing"',
      );
      await writeFile(join(cwd, "ordinary.ts"), "");
      await expect(discoverShaderFiles(["ordinary.ts"], cwd)).rejects.toThrow(
        "Expected a .shdr.ts file or directory",
      );
    });
  });

  it("recurses deterministically, deduplicates and ignores generated directories", async () => {
    await inTemporaryDirectory(async (cwd) => {
      for (const directory of [
        "nested",
        "dist",
        "node_modules",
        "nested/build",
      ]) {
        await mkdir(join(cwd, directory), { recursive: true });
      }
      for (const name of [
        "z.shdr.ts",
        "nested/a.shdr.ts",
        "dist/ignored.shdr.ts",
        "node_modules/ignored.shdr.ts",
        "nested/build/ignored.shdr.ts",
      ]) {
        await writeFile(join(cwd, name), "");
      }
      const names = (files: readonly string[]) =>
        files.map((file) => relative(cwd, file));
      expect(names(await discoverShaderFiles([], cwd))).toEqual([
        "nested/a.shdr.ts",
        "z.shdr.ts",
      ]);
      expect(
        names(await discoverShaderFiles(["nested", "nested/a.shdr.ts"], cwd)),
      ).toEqual(["nested/a.shdr.ts"]);
      expect(names(await discoverShaderFiles(["dist"], cwd))).toEqual([
        "dist/ignored.shdr.ts",
      ]);
      expect(
        names(await discoverShaderFiles(["node_modules/ignored.shdr.ts"], cwd)),
      ).toEqual(["node_modules/ignored.shdr.ts"]);
    });
  });

  it("does not follow directory symlinks or explicit symlinks", async () => {
    await inTemporaryDirectory(async (cwd) => {
      await mkdir(join(cwd, "source"));
      await writeFile(join(cwd, "source/valid.shdr.ts"), "");
      await symlink(join(cwd, "source"), join(cwd, "linked"));
      const files = await discoverShaderFiles([], cwd);
      expect(files).toEqual([join(cwd, "source/valid.shdr.ts")]);
      await expect(discoverShaderFiles(["linked"], cwd)).rejects.toThrow(
        "Symlinks are not followed",
      );
    });
  });
});
