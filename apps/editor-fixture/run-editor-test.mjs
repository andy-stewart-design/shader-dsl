import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const executable =
  process.env.VSCODE_EXECUTABLE_PATH ??
  "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
const temporaryDirectory = await mkdtemp(join(tmpdir(), "shdr-vscode-test-"));

try {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        "--disable-extensions",
        `--user-data-dir=${join(temporaryDirectory, "user")}`,
        `--extensions-dir=${join(temporaryDirectory, "extensions")}`,
        `--extensionDevelopmentPath=${directory}`,
        `--extensionTestsPath=${join(directory, "dist/extension-test.cjs")}`,
        directory,
      ],
      { stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
