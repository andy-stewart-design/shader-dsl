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

export async function run(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  assert(workspace, "Expected the editor fixture workspace to be open.");

  const gradientUri = vscode.Uri.joinPath(workspace.uri, "gradient.shdr.ts");
  const gradient = await vscode.workspace.openTextDocument(gradientUri);
  assert.equal(gradient.languageId, "shdr-typescript");
  await vscode.window.showTextDocument(gradient);

  const gradientDiagnostics = await waitForDiagnostics(
    gradientUri,
    (diagnostics) => diagnostics.some((diagnostic) => diagnostic.code === 2322),
  );
  assert.deepEqual(
    gradientDiagnostics.map((diagnostic) => diagnostic.code),
    [2322],
  );

  const hoverLine = gradient
    .getText()
    .split("\n")
    .findIndex((line) => line.includes("return vec4"));
  const hoverCharacter = gradient.lineAt(hoverLine).text.indexOf("uv");
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    gradientUri,
    new vscode.Position(hoverLine, hoverCharacter),
  );
  const hoverText = hovers
    .flatMap((hover) => hover.contents)
    .map((content) =>
      content instanceof vscode.MarkdownString
        ? content.value
        : typeof content === "string"
          ? content
          : content.value,
    )
    .join("\n");
  assert.match(hoverText, /Expr<Vec2<F32>>/);

  const outsideLine = gradient
    .getText()
    .split("\n")
    .findIndex((line) => line.includes("ordinaryOutside"));
  const outsideCharacter = gradient
    .lineAt(outsideLine)
    .text.indexOf("ordinaryOutside");
  const outsideHovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    gradientUri,
    new vscode.Position(outsideLine, outsideCharacter),
  );
  const outsideHoverText = outsideHovers
    .flatMap((hover) => hover.contents)
    .map((content) =>
      content instanceof vscode.MarkdownString
        ? content.value
        : typeof content === "string"
          ? content
          : content.value,
    )
    .join("\n");
  assert.match(outsideHoverText, /string/);

  const invalidUri = vscode.Uri.joinPath(workspace.uri, "invalid.shdr.ts");
  const invalid = await vscode.workspace.openTextDocument(invalidUri);
  await vscode.window.showTextDocument(invalid);
  const invalidDiagnostics = await waitForDiagnostics(
    invalidUri,
    (diagnostics) => diagnostics.length > 0,
  );
  assert.equal(invalidDiagnostics.length, 1);
  assert.equal(invalidDiagnostics[0]?.code, "SHDR1100");
  assert.deepEqual(
    invalidDiagnostics[0]?.range.start,
    new vscode.Position(3, 2),
  );

  console.log("Real VS Code diagnostics and hover routing verified.");
}
