import { config as reactConfig } from "@repo/eslint-config/react-internal";

export default [
  ...reactConfig,
  {
    ignores: [
      "src/routeTree.gen.ts",
      ".output/**",
      ".nitro/**",
      ".tanstack/**",
      "dist/**",
      "node_modules/**",
    ],
  },
];
