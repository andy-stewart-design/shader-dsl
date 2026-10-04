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
  throw new Error(
    `Timed out waiting for diagnostics for ${uri.toString()}: ${JSON.stringify(vscode.languages.getDiagnostics(uri).map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message })))}`,
  );
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

  const expandedUri = vscode.Uri.joinPath(workspace.uri, "expanded.shdr.ts");
  const expanded = await vscode.workspace.openTextDocument(expandedUri);
  assert.equal(expanded.languageId, "shdr-typescript");
  await vscode.window.showTextDocument(expanded);
  await waitForDiagnostics(
    expandedUri,
    (diagnostics) => diagnostics.length === 0,
  );
  await waitForHoverText(expanded, "reordered.x", /Expr<Vec3<F32>>/);
  await waitForHoverText(expanded, "repeated.x", /Expr<Vec4<F32>>/);
  const validMultiply = "uniforms.time * uniforms.time";
  const invalidMultiply = "uniforms.time * coord.xy";
  await replaceText(expanded, validMultiply, invalidMultiply);
  const expandedErrors = await waitForDiagnostics(
    expandedUri,
    (diagnostics) => diagnostics.length === 1 && diagnostics[0]?.code === 2769,
  );
  assert.equal(expanded.getText(expandedErrors[0]?.range), invalidMultiply);
  assert.doesNotMatch(expandedErrors[0]!.message, /__shdr_internal/);
  await replaceText(expanded, invalidMultiply, validMultiply);
  await waitForDiagnostics(
    expandedUri,
    (diagnostics) => diagnostics.length === 0,
  );

  const mathUri = vscode.Uri.joinPath(workspace.uri, "math-builtins.shdr.ts");
  const math = await vscode.workspace.openTextDocument(mathUri);
  assert.equal(math.languageId, "shdr-typescript");
  await vscode.window.showTextDocument(math);
  await waitForDiagnostics(mathUri, (diagnostics) => diagnostics.length === 0);
  await waitForHoverText(math, "waves)", /Expr<Vec2<F32>>/);
  await waitForHoverText(math, "mask.x", /Expr<Vec2<F32>>/);
  await waitForHoverText(math, "light * mask.x", /Expr<F32>/);

  const goodStep = "smoothstep(vec2(0.2), vec2(0.8), uv)";
  const equalStep = "smoothstep(vec2(0.2), vec2(0.2), uv)";
  await replaceText(math, goodStep, equalStep);
  const domainErrors = await waitForDiagnostics(
    mathUri,
    (diagnostics) =>
      diagnostics.length === 1 && diagnostics[0]?.code === "SHDR1209",
  );
  assert.equal(math.getText(domainErrors[0]?.range), equalStep);
  assert.doesNotMatch(
    domainErrors[0]!.message,
    /__shdr_internal|shdr_internal_smoothstep/,
  );
  await replaceText(math, equalStep, goodStep);
  await waitForDiagnostics(mathUri, (diagnostics) => diagnostics.length === 0);

  const validDot = "dot(uv, axis)";
  const wrongDot = "dot(uv, axis, uv)";
  await replaceText(math, validDot, wrongDot);
  const signatureErrors = await waitForDiagnostics(
    mathUri,
    (diagnostics) =>
      diagnostics.length === 1 && diagnostics[0]?.code === "SHDR1208",
  );
  assert.equal(math.getText(signatureErrors[0]?.range), wrongDot);
  assert.doesNotMatch(
    signatureErrors[0]!.message,
    /__shdr_internal|shdr_internal_smoothstep/,
  );
  await replaceText(math, wrongDot, validDot);
  await waitForDiagnostics(mathUri, (diagnostics) => diagnostics.length === 0);

  const geometryUri = vscode.Uri.joinPath(
    workspace.uri,
    "geometry-math.shdr.ts",
  );
  const geometry = await vscode.workspace.openTextDocument(geometryUri);
  assert.equal(geometry.languageId, "shdr-typescript");
  await vscode.window.showTextDocument(geometry);
  await waitForDiagnostics(
    geometryUri,
    (diagnostics) => diagnostics.length === 0,
  );
  await waitForHoverText(geometry, "rounded, uv", /Expr<Vec2<F32>>/);
  await waitForHoverText(geometry, "separation, normal", /Expr<F32>/);
  await waitForHoverText(geometry, "normal.z", /Expr<Vec3<F32>>/);
  const validCross = "cross(vec3(1, 0, 0), vec3(0, 1, 0))";
  const invalidCross = "cross(uv, uv)";
  await replaceText(geometry, validCross, invalidCross);
  const crossErrors = await waitForDiagnostics(
    geometryUri,
    (diagnostics) =>
      diagnostics.length === 1 && diagnostics[0]?.code === "SHDR1208",
  );
  assert.equal(geometry.getText(crossErrors[0]?.range), invalidCross);
  await replaceText(geometry, invalidCross, validCross);
  await waitForDiagnostics(
    geometryUri,
    (diagnostics) => diagnostics.length === 0,
  );

  const vectorUri = vscode.Uri.joinPath(
    workspace.uri,
    "vector-arithmetic.shdr.ts",
  );
  const vector = await vscode.workspace.openTextDocument(vectorUri);
  assert.equal(vector.languageId, "shdr-typescript");
  await vscode.window.showTextDocument(vector);
  await waitForDiagnostics(
    vectorUri,
    (diagnostics) => diagnostics.length === 0,
  );
  await waitForHoverText(vector, "rgb + 0.1", /Expr<Vec3<F32>>/);
  await waitForHoverText(vector, "bgr", /Expr<Vec3<F32>>/);
  const validPacking = "vec3(uv, 0.6)";
  const invalidPacking = "vec3(uv, coord)";
  await replaceText(vector, validPacking, invalidPacking);
  const packingErrors = await waitForDiagnostics(
    vectorUri,
    (diagnostics) => diagnostics.length === 1 && diagnostics[0]?.code === 2345,
  );
  assert.equal(vector.getText(packingErrors[0]?.range), "coord");
  assert.doesNotMatch(packingErrors[0]!.message, /__shdr_internal/);
  await replaceText(vector, invalidPacking, validPacking);
  await waitForDiagnostics(
    vectorUri,
    (diagnostics) => diagnostics.length === 0,
  );
  const validArithmetic = "1 - rgb + 0.1";
  const invalidArithmetic = "1 - rgb + coord";
  await replaceText(vector, validArithmetic, invalidArithmetic);
  const arithmeticErrors = await waitForDiagnostics(
    vectorUri,
    (diagnostics) => diagnostics.length === 1 && diagnostics[0]?.code === 2769,
  );
  assert.equal(vector.getText(arithmeticErrors[0]?.range), invalidArithmetic);
  assert.doesNotMatch(arithmeticErrors[0]!.message, /__shdr_internal/);
  await replaceText(vector, invalidArithmetic, validArithmetic);
  await waitForDiagnostics(
    vectorUri,
    (diagnostics) => diagnostics.length === 0,
  );

  const invalidUri = vscode.Uri.joinPath(
    workspace.uri,
    "test/fixtures/invalid.shdr.ts",
  );
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

  const invalidMathUri = vscode.Uri.joinPath(
    workspace.uri,
    "test/fixtures/invalid-math.shdr.ts",
  );
  const invalidMath = await vscode.workspace.openTextDocument(invalidMathUri);
  await vscode.window.showTextDocument(invalidMath);
  const staticEdgeErrors = await waitForDiagnostics(
    invalidMathUri,
    (diagnostics) =>
      diagnostics.length === 1 && diagnostics[0]?.code === "SHDR1209",
  );
  assert.equal(
    invalidMath.getText(staticEdgeErrors[0]?.range),
    "smoothstep(0.5, 0.5, coord.x)",
  );

  // The standard TypeScript provider for ordinary .ts files is intentionally
  // covered by the manual editor check, not this isolated extension-host test.
  // This test launches with extensions disabled and should only assert behavior
  // owned by the Shdr extension.
  const ordinaryUri = vscode.Uri.joinPath(workspace.uri, "ordinary.ts");
  const ordinary = await vscode.workspace.openTextDocument(ordinaryUri);
  assert.equal(ordinary.languageId, "typescript");

  console.log(
    "Complete real VS Code Shdr extension and math builtin checklist verified.",
  );
}
