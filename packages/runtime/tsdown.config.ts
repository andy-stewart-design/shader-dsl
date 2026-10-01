import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  entry: ["src/webgl.ts", "src/webgpu.ts", "src/errors.ts", "src/types.ts"],
  format: "esm",
});
