import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/bin.ts",
    "src/index.ts",
    "src/protocol.ts",
    "src/browser.ts",
    "src/server.ts",
    "src/zod.ts",
    "src/react.tsx",
  ],
  format: "esm",
  dts: true,
  deps: {
    neverBundle: ["../package.json"],
  },
});
