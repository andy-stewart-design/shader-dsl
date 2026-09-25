export const HELP = `Usage: shdr check [paths...]

Check .shdr.ts files under the current directory, or under explicit files/directories.
Paths starting with - must follow --. No matches are an error.

Options:
  -h, --help  Show this help
`;

export type Command =
  | { readonly kind: "help" }
  | { readonly kind: "check"; readonly paths: readonly string[] };

export class CliInputError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CliInputError";
  }
}

/** Parses arguments following the `shdr` executable name. */
export function parseCommand(args: readonly string[]): Command {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return { kind: "help" };
  }
  if (args[0] !== "check") {
    throw new CliInputError(
      `Expected 'shdr check [paths...]'. Use 'shdr --help' for usage.`,
    );
  }

  const paths: string[] = [];
  let literalPaths = false;
  for (const arg of args.slice(1)) {
    if (!literalPaths && (arg === "--help" || arg === "-h")) {
      if (args.length === 2) return { kind: "help" };
      throw new CliInputError("Help cannot be combined with paths.");
    }
    if (!literalPaths && arg === "--") {
      literalPaths = true;
      continue;
    }
    if (!literalPaths && arg.startsWith("-")) {
      throw new CliInputError(`Unknown option ${JSON.stringify(arg)}.`);
    }
    if (arg.length === 0) {
      throw new CliInputError("Paths cannot be empty.");
    }
    paths.push(arg);
  }
  return { kind: "check", paths };
}

export type CheckOutcome = "clean" | "diagnostics" | "input-error";

/** No matches are an input error, not a successful clean check. */
export function exitCodeFor(outcome: CheckOutcome): 0 | 1 | 2 {
  switch (outcome) {
    case "clean":
      return 0;
    case "diagnostics":
      return 1;
    case "input-error":
      return 2;
  }
}
