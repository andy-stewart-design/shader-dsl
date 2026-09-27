// Repo-local Zed dev launcher. Keep stdout reserved for LSP frames.
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const root = process.argv[2];
const bin = join(root, "packages/lsp/dist/bin.mjs");
let name;
try {
  name = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name;
} catch {
  // Report the same actionable checkout error as a mismatched package name.
}
if (name !== "shader-dsl") {
  console.error(`Shdr LSP: expected a shader-dsl checkout at ${root}`);
  process.exit(1);
}
if (!existsSync(bin)) {
  console.error(
    `Shdr LSP: missing ${bin}; run pnpm build at the repository root.`,
  );
  process.exit(1);
}
import(pathToFileURL(bin).href).catch((error) => {
  console.error(`Shdr LSP: cannot start ${bin}`, error);
  process.exitCode = 1;
});
