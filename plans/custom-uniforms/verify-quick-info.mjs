// Gate-0 TypeScript 7 quick-info probe; these are draft type declarations,
// NOT compiler/editor-adapter integration tests for authored shader syntax.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { API } from "typescript/unstable/sync";

const cwd = process.cwd();
const projectFile = resolve("plans/custom-uniforms/tsconfig.typecheck.json");
const api = new API({ cwd });
let snapshot;
try {
  for (const name of ["inline", "named"]) {
    const file = resolve(`plans/custom-uniforms/test/fixtures/${name}.shdr.ts`);
    const source = readFileSync(file, "utf8");
    snapshot = api.updateSnapshot({
      openProjects: [projectFile],
      openFiles: [file],
    });
    const project = snapshot.getDefaultProjectForFile(file);
    assert.ok(project, `No TypeScript project for ${name}`);
    assert.deepEqual(project.program.getSemanticDiagnostics(file), []);

    for (const [suffix, expected] of [
      ["color", "Expr<Vec3<F32>>"],
      ["color.x", "Expr<F32>"],
      ["dpi", "Expr<F32>"],
    ]) {
      const fragment = `uniforms.${suffix}`;
      const start = source.indexOf(fragment);
      assert.ok(start !== -1, `Missing ${fragment} in ${name}`);
      const offset = start + fragment.lastIndexOf(".") + 1;
      const type = project.checker.getTypeAtPosition(file, offset);
      assert.equal(project.checker.typeToString(type), expected);
    }
    snapshot.dispose();
    snapshot = undefined;
  }
  console.log("Verified TypeScript 7 draft uniform QuickInfo for both forms.");
} finally {
  snapshot?.dispose();
  api.close();
}
