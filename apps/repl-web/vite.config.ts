import { fileURLToPath } from "node:url";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
  server: {
    fs: {
      // Dependencies are installed at the monorepo root, outside this app's workspace.
      allow: [fileURLToPath(new URL("../../", import.meta.url))],
    },
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
