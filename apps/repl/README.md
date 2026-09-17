# Shdr browser REPL

A React/Vite fixture that runs `@shdr/core` directly in the browser. One semantic lowering pass produces both GLSL ES 3.00 and WGSL output from the same typed IR.

```sh
pnpm --filter repl dev
pnpm --filter repl build
```

Edit the source and choose **Compile both targets**, or press Ctrl/Command+Enter. Source diagnostics are shared by both backends. The generated GLSL is compiled, linked, and rendered in WebGL 2. When WebGPU is available, the generated WGSL is compiled as a shader module and its compilation info is displayed; otherwise the UI reports that validation is unavailable.

```sh
pnpm --filter repl test
```

The browser test verifies target selection, validation states, a visible render change after editing a literal, and preservation of the last successful frame when the current source is invalid.
