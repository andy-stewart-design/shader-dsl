// @ts-check
import { fileURLToPath } from "node:url";

import react from "@astrojs/react";
import shdr from "@shdr/vite";

const galleryRoot = fileURLToPath(new URL("./", import.meta.url));

// Keep the Vite plugin in Astro's browser/server graph so authored shaders
// become static dual-target artifacts during the build. The source root is
// defined here because this config is loaded from its source location, while
// catalog.ts is bundled to a different location for production builds.
export default {
  integrations: [react()],
  vite: {
    define: {
      "import.meta.env.SHDR_GALLERY_ROOT": JSON.stringify(galleryRoot),
    },
    plugins: [shdr()],
  },
};
