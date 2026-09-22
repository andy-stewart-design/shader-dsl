import assert from "node:assert/strict";
import * as vscode from "vscode";

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForDiagnostics(
  uri: vscode.Uri,
  predicate: (diagnostics: readonly vscode.Diagnostic[]) => boolean,
): Promise<readonly vscode.Diagnostic[]> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (predicate(diagnostics)) return diagnostics;
    await delay(100);
  }
  throw new Error(`Timed out waiting for diagnostics for ${uri.toString()}.`);
}

async function waitForHoverText(
  document: vscode.TextDocument,
  sourceText: string,
  expected: RegExp,
): Promise<string> {
  const offset = document.getText().indexOf(sourceText);
  assert.notEqual(
    offset,
    -1,
    `Expected to find ${JSON.stringify(sourceText)}.`,
  );

  let lastText = "";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      document.uri,
      document.positionAt(offset),
    );
    const text = hovers
      .flatMap((hover) => hover.contents)
      .map((content) =>
        content instanceof vscode.MarkdownString
          ? content.value
          : typeof content === "string"
            ? content
            : content.value,
      )
      .join("\n");
    lastText = text;
    if (expected.test(text)) return text;
    await delay(100);
  }

  throw new Error(
    `Timed out waiting for hover for ${JSON.stringify(sourceText)} matching ${expected.toString()}. Last hover text: ${JSON.stringify(lastText)}`,
  );
}

async function replaceText(
  document: vscode.TextDocument,
  oldText: string,
  newText: string,
): Promise<void> {
  const offset = document.getText().indexOf(oldText);
  assert.notEqual(offset, -1, `Expected to find ${JSON.stringify(oldText)}.`);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(
      document.positionAt(offset),
      document.positionAt(offset + oldText.length),
    ),
    newText,
  );
  assert.equal(await vscode.workspace.applyEdit(edit), true);
}

export async function run(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  assert(workspace, "Expected the editor fixture workspace to be open.");

  const gradientUri = vscode.Uri.joinPath(workspace.uri, "gradient.shdr.ts");
  const gradient = await vscode.workspace.openTextDocument(gradientUri);
  assert.equal(gradient.languageId, "shdr-typescript");
  await vscode.window.showTextDocument(gradient);

  const ordinaryOutsideDiagnostics = await waitForDiagnostics(
    gradientUri,
    (diagnostics) => diagnostics.length === 1 && diagnostics[0]?.code === 2322,
  );
  assert.equal(ordinaryOutsideDiagnostics[0]?.source, "ts");
  await waitForHoverText(gradient, "uv.x", /Expr<Vec2<F32>>/);
  await waitForHoverText(gradient, "ordinaryOutside", /string/);

  const validDivision = "coord.xy / uniforms.resolution";
  const invalidDivision = "coord.xy / coord";
  await replaceText(gradient, validDivision, invalidDivision);
  const editedDiagnostics = await waitForDiagnostics(
    gradientUri,
    (diagnostics) =>
      diagnostics.length === 2 &&
      diagnostics.some((diagnostic) => diagnostic.code === 2769),
  );
  const mappedDivision = editedDiagnostics.find(
    (diagnostic) => diagnostic.code === 2769,
  );
  assert(mappedDivision);
  assert.equal(gradient.getText(mappedDivision.range), invalidDivision);
  assert.match(mappedDivision.message, /^Operator "\/" cannot be applied/);
  assert.doesNotMatch(mappedDivision.message, /__shdr_internal/);

  const nestedDivision =
    "(coord.xy / uniforms.resolution) / uniforms.resolution";
  await replaceText(gradient, invalidDivision, nestedDivision);
  await waitForDiagnostics(
    gradientUri,
    (diagnostics) => diagnostics.length === 1 && diagnostics[0]?.code === 2322,
  );
  await waitForHoverText(gradient, "uv.x", /Expr<Vec2<F32>>/);

  await replaceText(gradient, nestedDivision, validDivision);
  await waitForDiagnostics(
    gradientUri,
    (diagnostics) => diagnostics.length === 1 && diagnostics[0]?.code === 2322,
  );

  const invalidUri = vscode.Uri.joinPath(workspace.uri, "invalid.shdr.ts");
  const invalid = await vscode.workspace.openTextDocument(invalidUri);
  assert.equal(invalid.languageId, "shdr-typescript");
  await vscode.window.showTextDocument(invalid);
  const invalidDiagnostics = await waitForDiagnostics(
    invalidUri,
    (diagnostics) => diagnostics.length === 1,
  );
  assert.equal(invalidDiagnostics[0]?.code, 2769);
  assert.equal(
    invalid.getText(invalidDiagnostics[0]?.range),
    "coord.xy / coord",
  );

  // The standard TypeScript provider for ordinary .ts files is intentionally
  // covered by the manual editor check, not this isolated extension-host test.
  // This test launches with extensions disabled and should only assert behavior
  // owned by the Shdr extension.
  const ordinaryUri = vscode.Uri.joinPath(workspace.uri, "ordinary.ts");
  const ordinary = await vscode.workspace.openTextDocument(ordinaryUri);
  assert.equal(ordinary.languageId, "typescript");

  console.log("Complete real VS Code Shdr extension checklist verified.");
}
