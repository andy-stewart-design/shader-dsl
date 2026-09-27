import { lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";

export type ProjectSelection =
  | {
      readonly status: "project";
      readonly filePath: string;
      readonly configPath: string;
      readonly workspaceRoot: string;
    }
  | {
      readonly status: "excluded";
      readonly message: string;
      readonly configPath: string;
    }
  | {
      readonly status:
        "invalid-config" | "no-config" | "not-on-disk" | "outside-workspace";
      readonly message: string;
      readonly configPath?: string;
      readonly codes?: readonly number[];
    }
  | { readonly status: "ignored" };

/** Selects the nearest ancestor TypeScript project that includes a shader. */
export class ProjectDiscovery {
  readonly #roots: readonly string[];
  #api: API | undefined;

  public constructor(workspaceRoots: readonly string[]) {
    this.#roots = [
      ...new Set(workspaceRoots.map((root) => realpathSync(root))),
    ].sort((a, b) => b.length - a.length);
    if (this.#roots.some((root) => !statSync(root).isDirectory())) {
      throw new Error("Workspace roots must be directories.");
    }
  }

  public select(uri: string): ProjectSelection {
    let filePath: string;
    try {
      filePath = fileURLToPath(uri);
    } catch {
      return { status: "ignored" };
    }
    if (!filePath.endsWith(".shdr.ts")) return { status: "ignored" };

    // An unsaved new file has no configured-project membership yet. Resolve
    // its parent to still distinguish an external file from a missing one.
    let canonicalFile: string;
    try {
      canonicalFile = realpathSync(filePath);
    } catch {
      let parent: string;
      try {
        parent = realpathSync(dirname(filePath));
      } catch {
        return {
          status: "not-on-disk",
          message: `Save ${filePath} before Shdr can select a TypeScript project.`,
        };
      }
      if (!this.#rootFor(parent)) {
        return {
          status: "outside-workspace",
          message: `${filePath} is outside the configured Zed workspace.`,
        };
      }
      return {
        status: "not-on-disk",
        message: `Save ${filePath} before Shdr can select a TypeScript project.`,
      };
    }

    const root = this.#rootFor(canonicalFile);
    if (!root) {
      return {
        status: "outside-workspace",
        message: `${filePath} is outside the configured Zed workspace.`,
      };
    }

    let directory = dirname(canonicalFile);
    let nearestExcluded:
      Extract<ProjectSelection, { status: "excluded" }> | undefined;
    while (true) {
      const configFile = join(directory, "tsconfig.json");
      let configExists = false;
      try {
        lstatSync(configFile);
        configExists = true;
      } catch {
        // A missing config does not stop the upward search.
      }
      if (configExists) {
        const selection = this.#selectFromConfig(
          configFile,
          canonicalFile,
          root,
        );
        if (selection.status === "excluded") {
          nearestExcluded ??= selection;
        } else {
          return selection;
        }
      }
      if (directory === root) break;
      directory = dirname(directory);
    }
    if (nearestExcluded) {
      return {
        ...nearestExcluded,
        message: `No tsconfig.json within ${root} includes ${filePath}; nearest is ${nearestExcluded.configPath}.`,
      };
    }
    return {
      status: "no-config",
      message: `No tsconfig.json found for ${filePath} within ${root}.`,
    };
  }

  /** Discard TypeScript's cached config and directory reads after a file watcher event. */
  public invalidate(): void {
    const snapshot = this.#api?.updateSnapshot({
      fileChanges: { invalidateAll: true },
    });
    snapshot?.dispose();
  }

  public dispose(): void {
    this.#api?.close();
    this.#api = undefined;
  }

  #rootFor(filePath: string): string | undefined {
    return this.#roots.find((root) => contains(root, filePath));
  }

  #selectFromConfig(
    configFile: string,
    filePath: string,
    workspaceRoot: string,
  ): ProjectSelection {
    let configPath: string;
    try {
      configPath = realpathSync(configFile);
      if (
        !contains(workspaceRoot, configPath) ||
        !statSync(configPath).isFile()
      ) {
        throw new Error("Config is not a file inside the workspace.");
      }
    } catch {
      return {
        status: "invalid-config",
        configPath: configFile,
        message: `Cannot use tsconfig.json at ${configFile}: it must be a file inside ${workspaceRoot}.`,
      };
    }

    const api = (this.#api ??= new API({ cwd: workspaceRoot }));
    let opened = false;
    try {
      const snapshot = api.updateSnapshot({
        openProjects: [configPath],
        fileChanges: { changed: [configPath] },
      });
      opened = true;
      try {
        const project = snapshot.getProject(configPath);
        if (!project) throw new Error("TypeScript project was not loaded.");
        const errors = project.program.getConfigFileParsingDiagnostics();
        if (errors.length > 0) {
          return {
            status: "invalid-config",
            configPath,
            codes: errors.map((error) => error.code),
            message: `Invalid tsconfig.json at ${configPath}: ${errors.map((error) => error.text).join(" ")}`,
          };
        }
        if (!project.rootFiles.some((name) => sameFile(name, filePath))) {
          return {
            status: "excluded",
            configPath,
            message: `${filePath} is not included in tsconfig.json at ${configPath}.`,
          };
        }
        return { status: "project", filePath, configPath, workspaceRoot };
      } finally {
        snapshot.dispose();
      }
    } catch {
      return {
        status: "invalid-config",
        configPath,
        message: `Cannot load TypeScript project from tsconfig.json at ${configPath}.`,
      };
    } finally {
      if (opened) api.updateSnapshot({ closeProjects: [configPath] }).dispose();
    }
  }
}

function contains(root: string, filePath: string): boolean {
  const path = relative(root, filePath);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

function sameFile(left: string, right: string): boolean {
  try {
    return realpathSync(left) === right;
  } catch {
    return left === right;
  }
}
