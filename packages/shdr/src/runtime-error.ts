export function shaderSourceWasNotTransformed(apiName: string): never {
  throw new Error(
    `shdr: ${apiName}() cannot run because the shader source was not transformed.`,
  );
}
