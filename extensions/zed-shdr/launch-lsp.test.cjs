const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");

const launcher = join(__dirname, "launch-lsp.cjs");

test("rejects an unrelated worktree with a visible checkout error", () => {
  const result = spawnSync(
    process.execPath,
    [launcher, join(tmpdir(), "unrelated-shdr-project")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /expected a shader-dsl checkout/);
  assert.equal(result.stdout, "");
});

test("reports a missing built LSP without writing to protocol stdout", () => {
  const root = mkdtempSync(join(tmpdir(), "shdr-local-launcher-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "shader-dsl" }),
    );
    const result = spawnSync(process.execPath, [launcher, root], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /run pnpm build at the repository root/);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
