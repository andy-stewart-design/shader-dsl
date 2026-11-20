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
    "src/zustand.ts",
  ],
  format: "esm",
  dts: true,
  deps: {
    neverBundle: ["../package.json", "zustand/vanilla"],
  },
});
