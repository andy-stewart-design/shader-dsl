# Step 2.2 — WebGL sampled first frame and replacement

## Implementation

- WebGL now uploads each active decoded image into a candidate-owned texture with `RGBA8`, linear min/mag filtering, clamp-to-edge addressing, no mipmaps, and the Phase 0 orientation/alpha pixel-store policy.
- Samplers are assigned from artifact binding metadata and rebound on every preflight/presented draw. The preflight framebuffer texture remains a separate resource.
- Candidate texture objects are destroyed on failed compilation/upload/preflight, supersession, replacement, disposal, and context loss. The previous program and textures remain installed on resource failure.
- Numeric custom uniform updates continue without re-fetching the active image.

## Verification

- `cd packages/runtime && node test/verify-textures.mjs`: passed; its WebGL portion verifies the following behavior.
- `pnpm --filter @shdr/runtime check`: passed.
- `pnpm --filter @shdr/runtime test`: passed all existing browser suites plus the combined texture suite.
- The real Chromium WebGL 2 portion verifies presented screenshot pixels and `readPixels` for top-left orientation, fractional linear filtering, out-of-range clamp, straight-alpha channel behavior, two textures, numeric updates, failed fetch/decode replacement, rapid supersession, disposal, and context loss.

Presented WebGPU and cross-backend parity remain gated by Step 2.3.
