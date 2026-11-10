import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL("../../dist/preview-probe", import.meta.url)),
    emptyOutDir: true,
  },
});
