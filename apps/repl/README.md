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

The browser test verifies target selection, validation states, visible render changes, every default uniform binding, canonical coordinate orientation, responsive drawing-buffer sizing, and preservation of the last successful frame when the current source is invalid.

## Runtime uniforms

- `resolution` is the WebGL drawing-buffer size in physical pixels. The canvas backing size follows its displayed size and device pixel ratio.
- `mouse` is the pointer position in those pixels with a top-left origin, +X right, and +Y down. Browser pointer coordinates enter this convention without a Y flip.
- `time` is elapsed time in seconds since the renderer was created.

Only uniforms active in the generated GLSL program are bound. Referencing `coord` implicitly activates `resolution` for GLSL's `u_resolution.y - gl_FragCoord.y` conversion. WGSL uses its fragment-position built-in directly.
