# Shdr Gallery

A static Astro gallery for the seven translated reference shaders. The authored
`.shdr.ts` sources live in [`src/shaders`](src/shaders); each page displays the
source and its generated GLSL/WGSL artifact and renders a WebGL preview. The
original GLSL baselines remain in [`apps/vite-basic/src/references`](../vite-basic/src/references)
for parity tests.

## Commands

Run these from the workspace root or this app directory:

```sh
pnpm --filter shdr-gallery check
pnpm --filter shdr-gallery build
pnpm --filter shdr-gallery test
```

The Astro config anchors source loading to this app's source directory, so the
production build does not depend on the current working directory or the sibling
Vite fixture's authored shader files.
