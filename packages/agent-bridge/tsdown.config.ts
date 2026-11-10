import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/bin.ts",
    "src/index.ts",
    "src/protocol.ts",
    "src/browser.ts",
    "src/server.ts",
  ],
  format: "esm",
  dts: true,
});
