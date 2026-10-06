import { SHADER_BUILTINS } from "./shader-builtin.js";

// Common-subset output identifiers, not restrictions on authored Shdr names.
// Sources: https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf
// §3.8–3.9 and https://www.w3.org/TR/WGSL/#keyword-summary / #reserved-words.
// Prefer a fallback to emitting a spelling that one target could reinterpret.
const GLSL_WORDS = new Set(
  `
  const uniform layout centroid flat smooth break continue do for while switch case default
  if else in out inout float int void bool true false invariant discard return
  uint lowp mediump highp precision struct
  attribute varying coherent volatile restrict readonly writeonly resource atomic_uint
  noperspective patch sample subroutine common partition active asm class union enum typedef
  template this goto inline noinline public static extern external interface long short
  double half fixed unsigned superp input output sizeof cast namespace using
`
    .trim()
    .split(/\s+/),
);

const WGSL_WORDS = new Set(
  `
  alias break case const const_assert continue continuing default diagnostic discard else
  enable false fn for if let loop override requires return struct switch true var while
  NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto
  await become cast catch class co_await co_return co_yield coherent column_major
  common compile compile_fragment concept const_cast consteval constexpr constinit
  crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit
  export extends extern external fallthrough filter final finally friend from fxgroup
  get goto groupshared highp impl implements import inline instanceof interface
  layout lowp macro macro_rules match mediump meta mod module move mut mutable
  namespace new nil noexcept noinline nointerpolation non_coherent noncoherent
  noperspective null nullptr of operator package packoffset partition pass patch
  pixelfragment precise precision premerge priv protected pub public readonly ref
  regardless register reinterpret_cast require resource restrict self set shared
  sizeof smooth snorm static static_assert static_cast std subroutine super target
  template this thread_local throw trait try type typedef typeid typename typeof
  union unless unorm unsafe unsized use using varying virtual volatile wgsl where
  with writeonly yield
`
    .trim()
    .split(/\s+/),
);

const TARGET_CALLS_AND_TYPES = new Set(
  `
  abs acos acosh all any array arrayLength asin asinh atan atan2 atanh atomicAdd
  atomicAnd atomicCompareExchangeWeak atomicExchange atomicLoad atomicMax atomicMin
  atomicOr atomicStore atomicSub atomicXor bitcast bool ceil clamp cos cosh countLeadingZeros
  countOneBits countTrailingZeros cross degrees determinant distance dot dpdx dpdy
  exp exp2 extractBits faceForward firstLeadingBit firstTrailingBit floor fma fract
  frexp fwidth insertBits inverseSqrt inversesqrt isFinite isInf isNan ldexp length
  log log2 max min mix mod modf normalize pack2x16float pack4x8snorm pack4x8unorm
  pow radians reflect refract reverseBits round saturate select sign sin sinh smoothstep
  sqrt step tan tanh texture textureDimensions textureGather textureGatherCompare
  textureLoad textureNumLayers textureNumLevels textureNumSamples textureSample
  textureSampleBias textureSampleCompare textureSampleCompareLevel textureSampleGrad
  textureSampleLevel textureStore transpose trunc unpack2x16float unpack4x8snorm
  unpack4x8unorm workgroupBarrier workgroupUniformLoad storageBarrier
  f16 f32 i32 u32 sampler sampler_comparison ptr array atomic binding_array
  quantizeToF16 dFdx dFdy dFdxFine dFdyFine dFdxCoarse dFdyCoarse faceforward
  isinf isnan lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual
  matrixCompMult outerProduct inverse not floatBitsToInt floatBitsToUint
  intBitsToFloat uintBitsToFloat packUnorm2x16 packSnorm2x16 packHalf2x16
  unpackUnorm2x16 unpackSnorm2x16 unpackHalf2x16
`
    .trim()
    .split(/\s+/),
);

// These are module-level bindings even if the particular shader omits them.
const GENERATED_NAMES = new Set(
  `
  main ShdrCustomUniforms u_resolution u_mouse u_time
`
    .trim()
    .split(/\s+/),
);

/** True only for a spelling safely reusable as a local in both emitted targets. */
export function isSafeShaderLocalName(name: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name === "_") return false;
  if (name.includes("__") || name.startsWith("gl_") || name.startsWith("shdr_"))
    return false;
  if (
    GLSL_WORDS.has(name) ||
    WGSL_WORDS.has(name) ||
    TARGET_CALLS_AND_TYPES.has(name) ||
    Object.hasOwn(SHADER_BUILTINS, name) ||
    GENERATED_NAMES.has(name)
  )
    return false;
  // Target-specific type/constructor families, including future resource types.
  if (
    /^(?:(?:[biudfh]?vec[234]|vec[234][fiuh])|mat[234](?:x[234])?[fh]?|[iu]?sampler[A-Za-z0-9_]*|[iu]?image[A-Za-z0-9_]*|texture[A-Za-z0-9_]*|atomic[A-Za-z0-9_]*|subgroup[A-Za-z0-9_]*|quad[A-Za-z0-9_]*|pack[A-Za-z0-9_]*|unpack[A-Za-z0-9_]*)$/.test(
      name,
    )
  )
    return false;
  return true;
}
