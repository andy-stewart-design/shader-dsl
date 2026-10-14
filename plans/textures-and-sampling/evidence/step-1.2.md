# Step 1.2 evidence

## Implemented

- Added the direct imported `sample(texture, uv)` marker/signature to `shdr`.
- Added a resource-specific texture IR expression and texture-sample call target; texture handles cannot participate in numeric constructors/operators/builtins.
- Added authored-range diagnostics for wrong sample arity, non-texture arguments, invalid UV shapes, unimported sample calls, and helper texture capture/parameters.
- Added GLSL ES 3.00 `sampler2D` generation and WGSL `texture_2d<f32>` plus explicit `sampler` generation. Texture resources use group 2, leaving automatic group 0 and numeric custom group 1 unchanged.
- Added deterministic per-target referenced texture and binding metadata. Unreferenced declarations remain in `resources.textures` without emitted resource bindings.
- Added editor virtual-source/hover coverage and CLI checking coverage for a sampled texture shader.
- Added artifact-boundary validation for referenced texture names and target binding metadata while retaining compatibility with declaration-only resource metadata. Binding-number collisions are rejected, including adjacent texture/sampler collisions in WGSL.

The generated targets were browser-compiled and linked in the core test harness using real WebGL 2 program linking; WGSL was compiled and used to create a real render pipeline on a presented-WebGPU-capable device. This step makes no first-frame rendering claim; GPU loading/binding remains Phase 2.

## Verification

- `pnpm --filter shdr check && pnpm --filter shdr test`: passed, 7 tests.
- `pnpm --filter @shdr/core check && pnpm --filter @shdr/core test`: passed, 47 files / 430 tests, including real GLSL/WGSL compilation for sampled output.
- `pnpm --filter @shdr/language-service check && pnpm --filter @shdr/language-service test`: passed, 16 files / 94 tests, including imported-schema invalid-sample range routing and unsaved-edit recovery.
- `pnpm --filter @shdr/cli check && pnpm --filter @shdr/cli test`: passed, 25 tests, including sampled-texture CLI checking.
- `pnpm --filter @shdr/lsp check && pnpm --filter @shdr/lsp test`: passed, 3 files / 17 tests.
- `pnpm --filter @shdr/runtime check && pnpm --filter @shdr/runtime test`: passed all existing browser suites.
- Focused runtime metadata tests: passed, 7 tests, including duplicate target binding rejection.
- `git diff --check` and Prettier checks passed.

No browser image fetch/upload or presented sampled-pixel acceptance was claimed here; those are Steps 2.1–2.3.
