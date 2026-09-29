## Language extentsion: built-ins

The complications are mostly about choosing a shared GLSL/WGSL contract, not adding the names to the compiler:

- **mix** — Both targets support a scalar blend factor for vector inputs. We’d need overloads for that as well as same-shape vectors. GLSL also has a boolean-mask form, which is outside Shdr’s current value types. [GLSL](https://docs.gl/el3/mix) · [WGSL](https://www.w3.org/TR/WGSL/#mix-builtin)
- **clamp** — Bound ordering needs a policy: WGSL rejects constant low > high at shader creation, while GLSL leaves results undefined for low >= high. GLSL also offers scalar bounds for vectors; WGSL’s builtin requires matching shapes. [GLSL](https://docs.gl/el3/clamp) · [WGSL](https://www.w3.org/TR/WGSL/#clamp)
- **step** — GLSL accepts a scalar edge with a vector input; WGSL requires matching shapes. We’d either exclude step(0.5, uv) or generate a vector edge for WGSL. No smoothstep-style edge-order issue. [GLSL](https://docs.gl/el3/step) · [WGSL](https://www.w3.org/TR/WGSL/#step-builtin)
- **pow** — Signatures are straightforward, but the numerical contract isn’t: negative bases are outside the portable domain, and GLSL also leaves pow(0, y) undefined for y <= 0. We’d decide which known-invalid calls to diagnose versus document as runtime preconditions. [GLSL](https://docs.gl/el3/pow) · [WGSL](https://www.w3.org/TR/WGSL/#pow-builtin)

## Language extentsion: comparisons and selection

- Design scalar `F32` comparisons yielding a shader boolean, then same-type selection arms.
- Decide `&&`/`||`/`!`, scalar versus vector conditions, and especially **eager versus lazy arm evaluation** before choosing GLSL/WGSL lowering; WGSL has no source-style `?:` expression.
- General `if` statements and loops remain deferred.

## Client runtime

- Add a blessed function (`createProgram` or some such) for running a shader in the browser. Should support both runtimes (might should be separate functions).
- This is likely prerequisite for adding texture and custom uniform support

## Language extentsion: texture

## Custom Uniforms

## Composable custom utility functions

- Add support for fuctions that can be defined outside of `createFragmentShader` that can be composed within it.

## REPL: add WebGPU rendering
