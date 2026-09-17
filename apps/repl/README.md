# Shdr browser REPL

A React/Vite fixture that runs `@shdr/core` directly in the browser. One semantic lowering pass produces both GLSL ES 3.00 and WGSL output from the same typed IR.

```sh
pnpm --filter repl dev
pnpm --filter repl build
```

Edit the source and choose **Compile both targets**, or press Ctrl/Command+Enter. Source diagnostics are shared by both backends. Runtime GLSL and WGSL validation is added in the next implementation step, so generated outputs are explicitly marked as awaiting validation.
