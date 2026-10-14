# Step 2.3 — Presented WebGPU parity and combined browser gate

## Implementation

- WebGPU now creates candidate-owned `rgba8unorm` textures with `COPY_DST | TEXTURE_BINDING | RENDER_ATTACHMENT`, uploads decoded images with `copyExternalImageToTexture`, and binds explicit linear/clamp samplers in WGSL group 2.
- Automatic uniforms remain in group 0 and numeric custom uniforms remain in group 1. Texture/sampler bindings follow artifact metadata without renumbering either existing group.
- WebGPU texture dimensions, sampled-texture limits, sampler limits, and binding ranges are validated before GPU allocation. Candidate GPU textures and decoded images are destroyed on preparation failure, supersession, replacement, disposal, and device loss.
- Existing serialized WebGPU error scopes and preflight rendering remain in use; stale generations cannot commit or overwrite the installed presentation.

## Verification

- `pnpm --filter @shdr/runtime check`: passed.
- `cd packages/runtime && node test/verify-textures.mjs`: passed with real Chromium WebGL 2 and presented WebGPU.
- `pnpm --filter @shdr/runtime test`: passed all runtime suites, including the combined texture browser gate.
- The combined browser test verifies presented WebGPU top-left, fractional linear, clamp, alpha, two-texture, numeric-update, failed-replacement, supersession, and disposal behavior alongside WebGL. WebGL additionally verifies `readPixels` and context loss.
- `pnpm --filter @shdr/runtime build`: passed.

This completes the Phase 2 renderer implementation; Vite and REPL integration remain Phase 3.
