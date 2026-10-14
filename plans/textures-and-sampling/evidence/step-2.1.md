# Step 2.1 — Shared loading and asynchronous state boundary

## Implementation

- Added browser-only `packages/runtime/src/texture-resources.ts` for referenced texture loading.
- Metadata is validated before loading; declarations without target references never call `fetch`.
- Fetches use CORS mode and decode through `createImageBitmap`, with separate `resource` errors for fetch/decode failures and `artifact` errors for resource-count and binding-slot limits. WebGPU sampled-texture and sampler counts are checked independently from WGSL binding-slot ranges.
- Each renderer creates candidate-local abortable loading state. Superseded, disposed, or lost candidates abort pending work; generation checks prevent stale results from committing or reporting errors.
- Decoded images are explicitly closed on failed, superseded, disposed, and successful-replacement paths. GPU upload and sampling remain deferred to Steps 2.2–2.3.

## Verification

- `pnpm --filter @shdr/runtime check`: passed.
- Focused `texture-resources` and metadata tests: 12 tests passed, including nine active textures with bindings `0, 2, …, 16` under a device limit of 16 sampled textures and samplers.
- `pnpm --filter @shdr/runtime test`: passed all existing browser verification scripts, including WebGL and presented-WebGPU numeric/default, replacement, loss, disposal, and isolation coverage.
- New injected-dependency tests cover referenced-only fetches, idempotent cleanup, fetch/CORS and decode classification, independent resource-count and binding-slot limits, backend texture limits before fetch, abort during decode, and late-bitmap cleanup.

This step does not claim GPU texture upload or sampled pixels; those remain gated by Steps 2.2–2.3.
