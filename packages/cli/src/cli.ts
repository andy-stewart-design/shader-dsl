import { checkShaderPaths } from "./check.js";
import { CliInputError, HELP, exitCodeFor, parseCommand } from "./contract.js";

export interface CliOutput {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export async function runCli(
  args: readonly string[],
  cwd: string,
  output: CliOutput,
): Promise<0 | 1 | 2> {
  try {
    const command = parseCommand(args);
    if (command.kind === "help") {
      output.stdout(HELP);
      return 0;
    }

    const result = await checkShaderPaths(command.paths, cwd);
    if (result.outcome === "clean") {
      const noun = result.fileCount === 1 ? "file" : "files";
      output.stdout(
        `Checked ${result.fileCount} shader ${noun}: no Shdr diagnostics.\n`,
      );
    } else {
      for (const line of result.lines) output.stdout(`${line}\n`);
    }
    return exitCodeFor(result.outcome);
  } catch (error) {
    if (error instanceof CliInputError) {
      const cause = error.cause;
      const code = isNodeError(cause) ? ` (${cause.code})` : "";
      output.stderr(`shdr: ${error.message}${code}\n`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      output.stderr(`shdr: Unexpected checker failure: ${message}\n`);
    }
    return exitCodeFor("input-error");
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error && "code" in error && typeof error.code === "string"
  );
}
