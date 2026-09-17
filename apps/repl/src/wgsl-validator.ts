export interface WgslValidationSuccess {
  readonly state: "success";
  readonly message: string;
}

export interface WgslValidationError {
  readonly state: "error";
  readonly message: string;
}

export interface WgslValidationUnavailable {
  readonly state: "unavailable";
  readonly message: string;
}

export type WgslValidationResult =
  | WgslValidationSuccess
  | WgslValidationError
  | WgslValidationUnavailable;

export async function validateWgsl(
  source: string,
): Promise<WgslValidationResult> {
  if (!navigator.gpu) {
    return {
      state: "unavailable",
      message: "WebGPU is unavailable; inspect WGSL in a WebGPU-capable browser.",
    };
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    return {
      state: "unavailable",
      message: "WebGPU exposed no adapter; WGSL could not be runtime-validated.",
    };
  }

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch (error) {
    return {
      state: "unavailable",
      message: `WebGPU device request failed: ${errorMessage(error)}`,
    };
  }

  try {
    device.pushErrorScope("validation");
    const module = device.createShaderModule({ code: source });
    const compilationInfo = await module.getCompilationInfo();
    const scopedError = await device.popErrorScope();
    const errors = compilationInfo.messages.filter(
      (message) => message.type === "error",
    );

    if (errors.length > 0 || scopedError) {
      const messages = errors.map(formatCompilationMessage);
      if (scopedError) messages.push(scopedError.message);
      return {
        state: "error",
        message: messages.join("\n"),
      };
    }

    const warningCount = compilationInfo.messages.filter(
      (message) => message.type === "warning",
    ).length;
    return {
      state: "success",
      message:
        warningCount === 0
          ? "WGSL shader module compiled successfully."
          : `WGSL compiled with ${warningCount} warning${warningCount === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return {
      state: "error",
      message: `WGSL validation failed: ${errorMessage(error)}`,
    };
  } finally {
    device.destroy();
  }
}

function formatCompilationMessage(message: GPUCompilationMessage): string {
  const location =
    message.lineNum > 0
      ? `Line ${message.lineNum}, column ${message.linePos}: `
      : "";
  return `${location}${message.message}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
