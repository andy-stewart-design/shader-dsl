import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    extension: "src/extension.ts",
    "extension-test": "src/extension.test.ts",
  },
  deps: {
    alwaysBundle: ["@shdr/core", "@babel/parser"],
    neverBundle: ["vscode", "typescript/unstable/sync"],
    onlyBundle: false,
  },
  format: "cjs",
  platform: "node",
});
