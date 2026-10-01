import shdr from "@shdr/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [shdr()],
  // Audit the production browser module graph, not just minified text.
  build: { sourcemap: true },
});
