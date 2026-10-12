# Still-image textures and sampling specification

## Status

- Readiness: **Ready for planning**; not implemented. The plan must start with real-browser feasibility for image upload, color/alpha and Vite base paths; if those probes contradict this contract, stop for review rather than silently changing it.
- Blocking product decisions: none identified in the texture interview. Technical feasibility gates and unconfirmed defaults are recorded below.
- Source: the texture/sampler discussion and [follow-up notes](../notes.md#textures-and-samplers); existing [runtime](../../packages/runtime/README.md), [custom-uniform](../_completed/custom-uniforms/spec.md) and [Vite](../../packages/vite/src/index.ts) contracts.

## Problem and intended outcome

Shader authors cannot currently sample images. An author should be able to declare a still-image URL alongside other uniforms, sample it with normalized coordinates in a fragment shader, and see the image rendered by either browser backend. In a Vite app, `/photo.png` should work with Vite's `public/` convention; in the simple REPL, the source should use an external HTTPS image URL. Compilation, editor checking and CLI checking must not fetch or run authored `.shdr.ts` modules.

## Scope

Included:

- Typed `u.texture2D(url)` declarations in the existing `defineUniforms` schema, usable alongside numeric uniforms in the existing chained, named and imported-schema forms. One or more named still-image textures may be declared; resource limits are reported, never silently ignored.
- A direct sampling operation on that declared texture and an `Expr<Vec2<F32>>` UV, returning `Expr<Vec4<F32>>`. Normalized `(0, 0)` addresses the image's top-left. Fixed linear filtering and clamp-to-edge addressing.
- Vite `public/` URLs (including deployment base handling), externally hosted HTTPS images in the simple REPL, browser renderer loading/binding, and observable failures/recovery on both backends.

Non-goals:

- Host-driven texture swaps through `setUniforms`, `resetUniforms` or a new setter; live/video/per-frame images; REPL file picker or host image overrides; raw bytes, `ImageBitmap` or GPU textures as public host inputs.
- Author-configurable samplers (including nearest/repeat), mipmaps, depth/storage/array/3D textures, helper parameters/returns of texture handles, vertex-stage sampling, offscreen render targets, or general string expressions in shaders.
- Automatic canvas transparency, full color management for arbitrary embedded image profiles, bit-identical cross-GPU output, native renderers, or implicit loading of imported `.shdr.ts` modules in the REPL.

## Current behavior and evidence

- Static inspection: `packages/shdr/src/types.ts` and `packages/core/src/parse-custom-uniforms.ts` currently model only f32/vec2/vec3/vec4 literal defaults; shader expressions have no texture value or sampling call. `setUniforms` in `packages/runtime/src/types.ts` and `packages/runtime/src/uniforms.ts` is synchronous and numeric-only. Existing automatic inputs use WebGPU group 0, and numeric custom uniforms use group 1 binding 0. Preserve them.
- Static inspection: `packages/vite/src/index.ts` serializes the compiler artifact into a default export; Vite cannot infer an asset reference from a string buried in that JSON. The browser compiler and CLI do not execute shader modules. `apps/repl/src/App.tsx` is a single-textarea compiler and `use-shader-previews.ts` coordinates two independent renderers; neither currently supplies an image.
- The [custom-uniform contract](../_completed/custom-uniforms/spec.md) establishes complete schema/default metadata, original-source diagnostics, first-frame defaults, and preservation of an installed shader on failed replacement. The [Vite static-asset guide](https://vite.dev/guide/assets.html#the-public-directory) documents `public/photo.png` as `/photo.png` and the [build guide](https://vite.dev/guide/build.html#public-base-path) documents configured base paths. These are external Vite contracts, **not** observations that Shdr currently rewrites URLs or uploads textures. No image-sampling browser experiment has yet been run for this spec.

## Requirements and invariants

- **R1 — Typed declaration:** `u.texture2D("/photo.png")` statically declares a named texture-valued uniform. Its URL is a literal, not executable JavaScript. `uniforms.photo` is a compile-only texture handle, not an `Expr<F32>` or a numeric host patch. Numeric uniform types/defaults and the three automatic inputs remain unchanged. Invalid declarations and calls produce original-source Shdr diagnostics.
- **R2 — Sampling:** A texture handle and an `Expr<Vec2<F32>>` normalized UV produce `Expr<Vec4<F32>>` in the fragment callback. Existing helpers may calculate the UV or process the sampled color, but do not accept/capture texture handles in this slice. `(0, 0)` means top-left; filtering is linear and addressing clamps to the edge. Both targets implement the same observable convention, including on non-square images. No implicit image-size uniform or global capture is introduced.
- **R3 — Portable artifact:** One compile yields JSON-only GLSL/WGSL plus deterministic named texture kind/URL and per-target binding/reference metadata. No image bytes, browser objects, callback or fetch enters the artifact. The renderer validates metadata without parsing generated shader text; existing automatic and numeric custom-uniform binding contracts do not change. Unreferenced declarations remain in the schema but need not trigger a network request or GPU binding.
- **R4 — Host URL rules:** In a Vite app, a root-absolute declaration such as `/photo.png` targets the app's Vite `public/photo.png` asset in dev and after build, respecting the deployed Vite `base` rather than silently fetching a wrong origin-root URL. An absolute HTTPS URL is also a browser resource. The standalone compiler preserves literal URLs without assuming a Vite base; the Vite integration supplies its own deployment-aware resolution. The REPL accepts **only externally hosted HTTPS URLs** for textures and never fetches other shader modules. File-relative, protocol-relative, executable and dynamic URL expressions are not part of this slice.
- **R5 — Renderer ownership:** For every _referenced_ texture, creation and candidate `setShader` installation load, decode and upload the image before the first successful draw. Each renderer owns its own GPU objects; neither the compiler nor a renderer owns the server-hosted file. No silent placeholder is rendered for a missing image. Replacing a shader re-reads its declared URL; no old texture is implicitly reused because its name matches.
- **R6 — Atomic lifecycle:** A failed fetch/decode/upload rejects creation or replacement with an actionable resource/runtime error, not a compiler diagnostic. Failed replacement retains the prior installed shader/texture/clock when the surface is still valid. Later requests supersede earlier requests; stale successes, failures and late async uploads cannot commit, draw, or overwrite current status. Disposal and context/device loss stop pending resource work as far as possible and prevent later GPU commits, without promising network cancellation in all environments.
- **R7 — Image-channel policy:** The first slice targets ordinary browser-decodable **sRGB still images**, with shader sampling of normalized decoded RGB channel values without an additional implicit linear-light transform, and straight (unpremultiplied) alpha. Non-sRGB profile fidelity is not promised. The opaque-canvas contract is unchanged: sampled alpha can be computed in the shader but does not make the page canvas transparent. Cross-backend tolerances, image orientation, alpha and channel interpretation must be demonstrated in real browser tests before implementation acceptance; a feasibility contradiction requires contract review.
- **R8 — Consumer parity:** CLI/editor checking validates types and source, Vite's static consumer does not bundle the parser/compiler, and the REPL uses one source textarea with a URL literal and independent WebGL/WebGPU previews. A REPL URL that is not external HTTPS fails visibly before an unintended same-origin request. A missing CORS permission or network error is reported for that backend rather than represented as a shader syntax error.

## Behavior and contracts

Illustrative first-slice source shape, with a proposed `sample` name (not a user-approved spelling):

```ts
import { defineUniforms, sample } from "shdr";

export default defineUniforms((u) => ({
  photo: u.texture2D("/photo.png"),
})).createFragmentShader(({ coord, uniforms }) =>
  sample(uniforms.photo, coord.xy / uniforms.resolution),
);
```

The existing `createFragmentShader(callback, { uniforms })` form and imported `defineUniforms` schemas must express the same declaration; no new ambient capture rule applies. Within the REPL, replace the URL literal with an external HTTPS URL. Direct/aliased imports are subject to the existing graph rules; the REPL does not retrieve imported files.

Texture fields share the **author-facing** `uniforms` namespace but not numeric uniform storage or the synchronous host update interface. A texture declaration carries a required static URL default; it is not a `setUniforms`/`resetUniforms` key. The artifact contains enough stable ordering/usage metadata to distinguish texture resources from numeric declarations and associate the right image with each sample on both targets. Backend resource-limit failures are visible before successful installation. No new binding may displace automatic group 0 or numeric custom-uniform group 1.

| Event                                        | Expected state                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Compile/check a valid declaration            | Return typed artifact/diagnostics without fetching or decoding the image.                                                 |
| Create a renderer with a referenced image    | Load and upload before the initial presented frame; creation resolves only after that frame.                              |
| Install a new shader while another is active | Keep old shader/resource drawable until all candidate resources and the first candidate frame succeed; commit atomically. |
| Resource error on replacement                | Reject/report the candidate failure and keep the prior working installation when the surface is healthy; no placeholder.  |
| A newer install supersedes an older one      | The older request does not commit or overwrite newer status; release its temporary resources.                             |
| Dispose or lose context/device               | No further submission from obsolete image loads; retain existing terminal-loss semantics.                                 |

The first slice fixes minification/magnification to linear, clamp-to-edge, and **no mipmaps** (potential aliasing when heavily downscaled is accepted). Internal decoding/upload techniques and GPU binding indices beyond the existing reserved groups remain implementation choices, subject to observable semantics. Vite's base-aware conversion may make effective URL metadata differ from a standalone/REPL artifact for the **same authored source**, but the JSON schema and compiled GLSL/WGSL semantics remain shared. No Vite-specific base resolution is smuggled into core/browser compiler.

## Ownership and boundaries

The shader compiler/type checker owns statically analyzable declarations, source-located diagnostics, target-neutral sampling semantics and JSON binding metadata. The Vite plugin owns deployment-base adaptation for Vite public resources, without making core depend on Vite or bundling compiler code into static browser consumers. The REPL owns the HTTPS-only policy and displays per-backend resource errors without accessing imported source files. The separate browser renderers own loading, decoding, GPU uploads, binding, failure/supersession and disposal. Authored `.shdr.ts` code is **never** run as JavaScript by any of these paths. Hosts may serve or permit external images, but Shdr does not control a server's CORS headers or guarantee accessibility of remote URLs.

## Acceptance criteria

| ID  | Requirement(s) | Starting condition / action                                                                                                                                                                                                                                                                | Expected outcome                                                                                                                                                                                            | Verification approach                                                                      |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| AC1 | R1, R2         | Declare texture plus numeric fields in chained, named and imported-schema shaders; sample in the fragment while a helper computes UV or processes the resulting color. Then try nonliteral URL, scalar UV, unknown texture, helper capture/texture parameter, and use texture as a number. | Valid sources type-check and return a vec4 result; invalid sources produce authored-file/range diagnostics, no host evaluation or virtual-helper cascade.                                                   | Public types, core, TypeScript 7 editor and CLI fixtures.                                  |
| AC2 | R3             | Compile with both static and opt-in browser paths, with referenced and unused texture declarations alongside current numeric/automatic uniforms; inspect artifact and backend output.                                                                                                      | Same JSON resource schema and target-neutral shader meaning; complete deterministic declarations and only referenced bindings; existing group 0/group 1 assignments unchanged; no JS callbacks/image bytes. | Artifact/type tests, generated-target checks, static bundle audit.                         |
| AC3 | R2, R7         | Sample a known, non-square, multicolor sRGB PNG at top-left, non-center, fractional and out-of-range UVs; include one semi-transparent colored texel.                                                                                                                                      | Top-left orientation, linear interpolation, clamped edges, normalized RGB and straight alpha agree across WebGL and **presented WebGPU** within stated tolerances; no implicit canvas transparency.         | Real browser pixel readback and presented-WebGPU check, not shader-text snapshots alone.   |
| AC4 | R4, R8         | Serve Vite `public/photo.png` in dev and build an app deployed at a non-root configured `base`, then render a shader declaring `/photo.png`. Also compile the same source outside Vite.                                                                                                    | Both Vite app modes load the intended image without requesting the wrong root URL; standalone compiler performs no fetch or Vite-specific path rewrite.                                                     | Vite dev/build/network inspection and real browser pixels, including base-path deployment. |
| AC5 | R4, R6, R8     | Enter a CORS-enabled HTTPS image URL in REPL source; then use a blocked HTTPS URL, root-relative URL, or inaccessible host.                                                                                                                                                                | Valid URL reaches both independent previews; failures are explicit backend/policy errors and no `.shdr.ts` import is fetched. One failed backend does not claim success for the other.                      | Real REPL browser/network and UI checks.                                                   |
| AC6 | R5, R6         | Start a valid image shader, then replace with a missing/corrupt image; rapidly submit a valid third replacement; dispose during an in-flight load.                                                                                                                                         | No bad candidate replaces the last working shader; stale completions/errors never overwrite the newest status, resources are released, and no post-disposal draw occurs.                                    | Async protocol/state tests plus real browser WebGL/WebGPU replacement checks.              |
| AC7 | R1, R5, R8     | Call `setUniforms`/`resetUniforms` with a texture key; use an existing numeric uniform patch on a shader also declaring a texture.                                                                                                                                                         | Texture key rejected at public type/runtime boundary; numeric update/reset behaves as before without refetching the texture.                                                                                | Public types and runtime browser tests.                                                    |
| AC8 | R3, R5         | Supply malformed resource metadata or exceed a backend's texture-binding/resource limit.                                                                                                                                                                                                   | Renderer rejects installation with an actionable artifact/resource error and leaves a healthy previous installation intact; no wrong slot or silent missing binding.                                        | Runtime validation tests and target/browser limit probe.                                   |

## Assumptions

- **Proposed spelling:** `sample(texture, uv)` is inferred from discussion, not explicitly approved; a different direct-call name is acceptable if the type/result and original-source diagnostics above stay the same. Confirm it with a type-level fixture before locking public docs.
- **Still-image decoding and channels:** standard browser-decodable sRGB PNG/JPEG, normalized encoded RGB and straight alpha, no mipmaps or image-profile fidelity are recommended defaults, **not** explicit product approvals. Phase-0 raw-target/browser probes must validate parity; if they cannot, revise the contract before implementation rather than claim acceptance from text generation.
- **Multiple named textures:** inferred from the existing schema model; confirm target limits and metadata/binding feasibility in a small real-target probe. The contract does not promise unbounded textures. Resource-valued helper parameters can be revisited separately without treating the current f32/vector helper type system as already supporting them.
- **Vite base:** the declared behavior includes non-root deployments; a relative `base` such as `"./"` requires an explicit feasibility probe. Do not silently assume URL strings inside artifact JSON receive Vite's normal automatic asset rewrite or claim support for an untested base mode.

## Risks and open decisions

- Blocking for planning: none. **Blocking for implementation acceptance:** prove cross-backend decoded color/alpha/orientation, base-aware public URL resolution (including a decision on relative base after the probe), and correct atomic replacement under async load; review the contract if the probes fail.
- Non-blocking: cross-origin URLs may lack CORS permission; provide an actionable runtime message, not a workaround that taints pixels or evades browser policy. Image size/GPU limits and browser decoder differences may require explicit rejection. A changing file at the same URL may be HTTP cached; automatic public-asset hot reload is not promised. This contract does not imply publication-ready support outside the tested browsers.

## Deferred work

- Async host-driven texture URL updates and compatible replacement overrides; define supersession, validation and failure behavior before extending `setUniforms` or adding a setter.
- Configurable filtering/addressing, nearest/repeat, mipmaps and broader image/color-management modes; revisit for tiled/pixel-art or minified-image use cases.
- File-picker uploads and image overrides in a more capable REPL; video/live sources and raw/host GPU resource inputs; no new work on these is authorized by this first slice.
