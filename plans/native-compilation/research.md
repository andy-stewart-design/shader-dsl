# Native and additional shader targets: feasibility research

Status: research and analysis, not an implementation plan or a commitment to support additional targets. Shdr currently generates GLSL ES 3.00 and WGSL. No Metal or AGSL backend was implemented as part of this investigation.

## Summary

The current compiler architecture is well suited to additional output languages. Metal Shading Language (MSL) is a highly feasible incremental backend for the accepted language subset. Android Graphics Shading Language (AGSL) is also a strong fit, especially for procedural 2D graphics and UI effects, but it cannot reproduce every aspect of a general GPU fragment-stage interface.

The distinction between **source generation**, **semantic compatibility**, and **native execution** matters:

- Generating another language from the current typed IR is relatively small work.
- Preserving coordinates, numeric behavior, alpha, color spaces, and resource bindings requires explicit contracts and tests.
- Providing a supported native runtime is a separate undertaking from adding a compiler output target.

| Candidate                    | Source-generation assessment                                     | Main qualification                                                            |
| ---------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| MSL / Metal                  | Highly feasible; small independent emitter                       | Native binding contract and rendering validation                              |
| AGSL / Android RuntimeShader | Highly feasible for the current 2D effects subset; close to GLSL | Local 2D coordinates, premultiplied alpha, and color management               |
| Desktop GLSL / OpenGL        | Low incremental effort relative to the current GLSL backend      | Version/profile, coordinates, and host integration still need validation      |
| HLSL / Direct3D              | Highly feasible for the current subset                           | Builtin differences, resource bindings, and pipeline integration              |
| SPIR-V / Vulkan              | Feasible through established tooling                             | Prefer an existing compiler/translator over hand-emitting binary SPIR-V       |
| CPU / JavaScript evaluator   | Plausible as a reference/testing target                          | Deliberate f32 rounding and builtin semantics; not automatically a GPU oracle |

These effort assessments are relative judgments, not delivery estimates or claims of working backends.

## Existing architectural boundary

The current output languages are GLSL ES 3.00 and WGSL; WebGL 2 and WebGPU are their respective execution environments. Similarly, MSL source generation and a Metal renderer are separate pieces. AGSL source is consumed by Android's RuntimeShader and drawing pipeline.

Relevant compiler boundaries:

- [`shader-ir.ts`](../../packages/core/src/shader-ir.ts): typed expressions, semantic builtin identities, default uniforms, local symbol IDs, and source ranges. The IR contains neither GLSL nor WGSL syntax.
- [`generate-fragment.ts`](../../packages/core/src/generate-fragment.ts): the finite `ShaderTarget` union, target validation, and dispatch to independent generators.
- [`compile-fragment.ts`](../../packages/core/src/compile-fragment.ts): lowering followed by generation of the requested target.
- [`generate-glsl-fragment.ts`](../../packages/core/src/generate-glsl-fragment.ts) and [`generate-wgsl-fragment.ts`](../../packages/core/src/generate-wgsl-fragment.ts): target-specific module wrappers and uniform declarations.
- [`backend-parity.test.ts`](../../packages/core/test/backend-parity.test.ts): generation from the exact same frozen IR, without introducing target syntax or mutating semantic metadata.

The accepted language is deliberately small: f32 scalars and vectors, numeric literals, arithmetic, constructors, read swizzles, fourteen builtin names with 51 signatures, immutable locals, three default uniforms, and a final four-component fragment result. There are no custom uniforms, textures, matrices, control flow, or user functions yet.

For this subset, an MSL or AGSL emitter should not need new authoring syntax or parser rules. Target-specific restrictions may nevertheless need diagnostics—for example, AGSL cannot faithfully supply fragment depth or reciprocal W.

The IR is expression-target-neutral, but it is **not stage-general**: `ShaderStage` currently permits only `"fragment"`. Vertex and compute authoring would require stage/interface design, not merely another output-language name.

## Metal / MSL

### Evidence from a native compiler probe

A temporary Swift probe was created at `/tmp/shdr-metal-feasibility.swift` and run with:

```sh
swift /tmp/shdr-metal-feasibility.swift
```

The probe used `MTLCreateSystemDefaultDevice()` and `device.makeLibrary(source:options:)` on an **Apple M5 Max**, with `fastMathEnabled = false`. It confirmed that the fragment function could be retrieved from the resulting library. The temporary probe is not a repository fixture and may not persist.

The raw source exercised equivalents of all **51 current builtin signatures**, plus:

- Scalar splats, vector construction, and mixed vector/scalar packing used by the current subset.
- Chained and repeated-component swizzles.
- Arithmetic and unary negation.
- A `float4` fragment-position parameter annotated with `[[position]]`.
- A `constant` uniform-structure reference bound with `[[buffer(0)]]`.
- A `float4` fragment return value.

The first compilation rejected two direct translations:

| Shdr operation          | Probe result                                                        | Adaptation that compiled |
| ----------------------- | ------------------------------------------------------------------- | ------------------------ |
| Scalar `length(x)`      | Ambiguous MSL call; available geometric overloads were vector forms | `abs(x)`                 |
| Scalar `distance(a, b)` | Ambiguous MSL call; available geometric overloads were vector forms | `abs(a - b)`             |

With those scalar adaptations, all 51 signature equivalents compiled. The other builtin calls in the probe used their existing names directly.

**Limits of the evidence:** this was raw MSL, not generated Shdr IR output. There was no render-pipeline creation, draw, pixel readback, numerical comparison, pinned MSL language version, or multi-device coverage. It establishes useful syntax/type feasibility on one native compiler, not full backend support. The scalar adaptations are reasonable for ordinary finite values but do not establish bit-exact equivalence for extreme or exceptional inputs.

The standalone `xcrun metal` utility was unavailable in this environment; compilation through the native Metal runtime API still worked. Offline library compilation and runtime source compilation are distinct integration choices.

### Source-generation fit

The existing expression/module generator split maps naturally to MSL:

- `f32` becomes `float`; vectors become `float2`, `float3`, and `float4`.
- Constructors and swizzles have close equivalents.
- Arithmetic remains component-wise for the supported vector forms.
- The module wrapper supplies the fragment entry point, input attributes, and resource parameters.
- Scalar geometric functions require explicit adaptation rather than blind name substitution.

A target name such as `"msl"` would match the existing language-oriented names better than `"metal"`, but this is a naming suggestion, not an API decision.

Local names should be made safe for the target. The IR already has `symbolId`, so an emitter can use generated names rather than assuming authored identifiers are valid C++/MSL identifiers or cannot collide with generated resources and builtin functions.

### Host and semantic questions

The source emitter cannot settle the native runtime contract on its own:

- Whether resolution, mouse, and time occupy separate fixed buffer indices or one uniform structure.
- Buffer byte layout, alignment, padding, and resource lifetime.
- Entry-point naming and color-attachment/pixel-format assumptions.
- Full coordinate semantics, including depth and reciprocal W, not just XY orientation.
- Math optimization settings and tolerances for cross-target comparisons.

Metal's top-left pixel-coordinate orientation is a good match for Shdr's canonical XY convention. That is not sufficient evidence for the complete `coord` contract; native rendering tests would still need to cover its components and host assumptions.

Generating MSL can remain a browser-compatible compiler operation. Executing MSL directly is not a standard browser capability; a native host or bridge would be required. WebGPU running over Metal internally does not make arbitrary MSL source an accepted WebGPU shader format.

## AGSL / Android RuntimeShader

### Execution model

AGSL is closely related to GLSL ES 1.0 and is available through `android.graphics.RuntimeShader` on **Android 13 / API level 33 and above**.

Unlike a standalone GLSL fragment shader, an AGSL program contributes a function to Android's larger Canvas/RenderNode graphics pipeline. Android owns coverage, clipping, blending, color conversion, and the final underlying GPU shader composition.

An illustrative output for the current opaque gradient is:

```glsl
uniform float2 u_resolution;

float4 main(float2 position) {
  float2 uv = position / u_resolution;
  return float4(uv, 0.0, 1.0);
}
```

This is an illustrative translation, not output from an implemented backend or a compiled Android fixture.

Compared with Shdr's GLSL ES 3.00 module wrapper:

- AGSL takes a two-component local coordinate parameter and returns the color from `main`.
- GLSL-style preprocessor directives, including `#version`, are not supported.
- Both GLSL-style vector names and `float2`/`float3`/`float4` spellings are available.
- Named primitive uniforms are initialized through methods such as `RuntimeShader.setFloatUniform(...)`.
- A RuntimeShader can be used with a Paint for Canvas drawing or through a RenderEffect, without constructing an application-owned vertex shader/render pipeline.

Much of the GLSL expression-emission logic is therefore reusable in principle, although an independent AGSL wrapper and target-specific adaptations are preferable to treating AGSL as unchanged GLSL output.

### Coordinate compatibility is the largest API mismatch

AGSL receives **local 2D coordinates**, normally top-left-origin. These can be affected by Canvas transformations, the shader's local matrix, or arbitrary coordinate changes made by a parent shader.

Shdr currently promises pixel coordinates in physical drawing-buffer space and exposes `coord` as a Vec4. AGSL does not provide equivalent fragment-depth and reciprocal-W inputs.

Two possible policies are materially different:

| Policy              | Consequence                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Strict portability  | Diagnose dependencies on unavailable Z/W values; require a host coordinate mapping for canonical XY                             |
| Explicit 2D profile | Construct a value such as `float4(position, 0, 1)` and document Z/W as profile constants, not actual fragment depth/perspective |

Silently synthesizing those components would overstate compatibility. Even strict rejection needs to account for whole-vector uses and intermediate expressions, not just literal `.z`/`.w` accesses.

For an untransformed, full-size rectangle in pixel units, AGSL XY is a close match to the existing previews. Resolution and mouse would have to use that same coordinate space. Supporting arbitrary Canvas transforms is a separate host-contract question.

### Alpha and color spaces

RuntimeShader expects the returned color to be **premultiplied**: `[r*a, g*a, b*a, a]`.

Shdr needs an explicit output-alpha convention before choosing an adaptation. If the DSL adopts straight-alpha output, the AGSL boundary can multiply RGB by alpha. If a shader already returns premultiplied values, applying that conversion again would be wrong. Opaque shaders do not expose this difference; transparent fixtures are necessary evidence.

AGSL also runs in Android's color-managed pipeline. Returned RGB values are interpreted in the working color space. A controlled sRGB destination is useful for parity testing; arbitrary Canvas/display configurations cannot be assumed to match browser preview pixels.

AGSL exposes color-conversion intrinsics and `layout(color)` uniforms, but the current numeric resolution/mouse/time uniforms are not color uniforms and should remain plain numeric values.

### Builtins and precision

Android's quick reference documents the builtin names required by Shdr. Its geometric-function table specifies vector forms for `length` and `distance`, so scalar lowering to `abs(x)` and `abs(a - b)` avoids depending on undocumented scalar overloads. Native compilation is still needed to verify the complete 51-signature matrix.

Use full-precision `float` types rather than introducing `half` as an unreviewed optimization. AGSL's precision documentation does not establish bit-exact IEEE-f32 equivalence across devices or parity with GLSL/WGSL; finite-value tolerance tests remain appropriate.

**Evidence level:** AGSL was assessed from Android documentation and the existing Shdr architecture. No AGSL source was compiled or rendered on Android during this investigation.

### Longer-term fit

AGSL is especially attractive for procedural backgrounds, gradients, animated UI effects, and image filters. It is a less natural fit for a future general-purpose GPU-stage DSL.

Textures would also need a semantic adapter: AGSL evaluates child `shader` objects with `eval(...)`, including BitmapShader and other RuntimeShader instances, rather than exposing conventional GLSL sampler types. Image coordinates are not automatically normalized texture coordinates. The present DSL has no texture API, so this is a future design constraint rather than a current blocker.

## Direct emitters versus a translation toolchain

Two routes are plausible for Metal and several other native APIs:

| Route                                  | Advantages                                                                                                    | Costs                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Shdr typed IR → target source directly | Small for the current subset; browser-compatible implementation; explicit control over bindings and semantics | Each backend needs maintained adapters and validation                                               |
| Shdr → WGSL → Naga → native target     | Reuses an established shader translator; opens multiple native targets                                        | Additional toolchain or WASM integration, versioning, binding configuration, and diagnostic mapping |

Naga documents WGSL input and MSL, HLSL, GLSL, and SPIR-V outputs. That makes it a credible option for exploring multiple native APIs. It does **not** establish AGSL output support; AGSL would still need its own route.

For today's small Shdr subset, direct MSL and AGSL emitters look proportionate. A translator becomes more attractive if several native APIs or substantially richer shader features become immediate requirements. Neither route removes the need to specify and test host semantics.

## Cross-cutting conclusions and unresolved questions

The current `generateFragment(...)` API returns a string. Native consumers would benefit from an accompanying description of entry points, referenced uniforms, bindings/layouts, and coordinate/output conventions. The REPL's current generated-source inspection is a fixture-local approach, not a durable native resource API. Adding metadata need not require redesigning the IR or replacing the existing string API.

The main uncertainties are semantic rather than syntactic:

- Can all targets share one `coord` contract, or should capabilities/2D profiles be explicit?
- What is the DSL's output-alpha and color-space policy?
- How should unsupported target capabilities become original-source diagnostics?
- Which numeric domains and tolerances define portable behavior?
- Is the product goal compiler output only, or a supported native renderer/runtime?

Compilation, pipeline construction, successful drawing, and representative pixel comparisons are progressively stronger evidence; none should be substituted for the next. Source generation alone is not proof of usable native rendering.

Overall, **Metal is an incremental backend addition**, while **AGSL is an incremental backend with a narrower 2D semantic envelope**. The current restricted language makes both feasible. The substantial compatibility work is preserving and documenting meaning at the host boundary, not translating arithmetic expressions.

## Sources

- [Shdr language reference and target contracts](../../README.md)
- [Apple: Metal Shading Language specification](https://developer.apple.com/metal/Metal-Shading-Language-Specification.pdf)
- [Naga: supported inputs, outputs, and conversion tooling](https://github.com/gfx-rs/wgpu/tree/trunk/naga)
- [Android: AGSL overview](https://developer.android.com/develop/ui/views/graphics/agsl)
- [Android: differences between AGSL and GLSL](https://developer.android.com/develop/ui/views/graphics/agsl/agsl-vs-glsl)
- [Android: AGSL quick reference](https://developer.android.com/develop/ui/views/graphics/agsl/agsl-quick-reference)
- [Android: RuntimeShader API, coordinates, uniforms, alpha, and color spaces](https://developer.android.com/reference/android/graphics/RuntimeShader)

External specifications and library support evolve. The Metal probe is one-machine compilation evidence; the AGSL conclusions are documentation-based. Neither is a claim of released Shdr support.
