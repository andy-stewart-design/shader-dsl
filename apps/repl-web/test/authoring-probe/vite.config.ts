import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL("../../dist/authoring-probe", import.meta.url)),
    emptyOutDir: true,
  },
});
