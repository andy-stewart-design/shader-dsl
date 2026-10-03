// Gate 0 compile-only probe: fixtures import draft declarations, not public APIs.
// They model the TypeScript types of normal Vite imports from .shdr.ts files.
import {
  vec4,
  type CompiledFragmentArtifact,
  type Expr,
  type F32,
  type Vec3,
} from "../../packages/shdr/src/index.js";
import type {
  Renderer,
  RendererOptions,
} from "../../packages/runtime/src/types.js";
import {
  compileEditedSource,
  createFragmentShader,
  createWebGlRenderer,
  createWebGpuRenderer,
  defineUniforms,
  type UniformContext,
  type CustomUniformErrorKind,
} from "./contract-draft.js";
import different from "./fixtures/different.shdr.js";
import inline from "./fixtures/inline.shdr.js";
import named from "./fixtures/named.shdr.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

declare const canvas: HTMLCanvasElement;
const existingOptions: RendererOptions = { animate: false };
const existingRenderer: Renderer | undefined = undefined;
void existingOptions;
void existingRenderer;

// Both forms infer the same callback uniform types, without a second type map.
const uniformDefinition = defineUniforms((u) => ({
  color: u.vec3(0, 0, 1),
  dpi: u.f32(12),
}));
type Context = UniformContext<typeof uniformDefinition.schema>;
type _Tint = Expect<Equal<Context["uniforms"]["color"], Expr<Vec3<F32>>>>;
type _TintX = Expect<Equal<Context["uniforms"]["color"]["x"], Expr<F32>>>;
type _Dpi = Expect<Equal<Context["uniforms"]["dpi"], Expr<F32>>>;
type _Time = Expect<Equal<Context["uniforms"]["time"], Expr<F32>>>;
const invalidHostValueKind: CustomUniformErrorKind = "uniform";
void invalidHostValueKind;

// No change to the previously accepted callback-only form.
const legacy = createFragmentShader(({ uniforms }) =>
  vec4(uniforms.time, uniforms.time, uniforms.time, uniforms.time),
);
void legacy;
async function noCustomHost(): Promise<void> {
  const renderer = await createWebGlRenderer(canvas, legacy);
  await renderer.setShader(legacy);
  // @ts-expect-error A no-custom shader has no host-settable uniforms.
  renderer.setUniforms({ dpi: 2 });
  // @ts-expect-error No custom uniform names can be reset.
  renderer.resetUniforms("dpi");
  // @ts-expect-error First-frame overrides are not defined for this shader.
  await createWebGlRenderer(canvas, legacy, { uniforms: { dpi: 2 } });
  renderer.dispose();
}

// Incompatibility must be detected even if only one name or type differs.
const changedType = defineUniforms((u) => ({
  color: u.f32(1),
  dpi: u.f32(12),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color, uniforms.dpi, uniforms.color, uniforms.dpi),
);
const addedName = defineUniforms((u) => ({
  color: u.vec3(0, 0, 1),
  dpi: u.f32(12),
  spin: u.f32(0),
})).createFragmentShader(({ uniforms }) =>
  vec4(uniforms.color.x, uniforms.dpi, uniforms.spin, uniforms.dpi),
);

async function staticHost(): Promise<void> {
  const renderer = await createWebGlRenderer(canvas, inline, {
    animate: false,
    uniforms: { color: [0, 1, 0], dpi: 2 },
  }); // Defaults or overrides must be installed before the first draw.
  renderer.setUniforms({ dpi: 0.5 });
  renderer.setUniforms({ color: [0.1, 0.2, 0.3] });
  renderer.resetUniforms("dpi");
  renderer.resetUniforms("dpi", "color");
  renderer.resetUniforms();
  const installed = await renderer.setShader(named); // Same schema, new defaults.
  if (installed.status === "installed") await renderer.draw();

  // @ts-expect-error Scalar values must be numbers.
  renderer.setUniforms({ dpi: "0.5" });
  // @ts-expect-error Vec3 requires exactly three components.
  renderer.setUniforms({ color: [1, 2] });
  const unexpectedPatch = { dpi: 2, missing: 1 };
  // @ts-expect-error Unknown names in variables must not bypass exactness.
  renderer.setUniforms(unexpectedPatch);
  // @ts-expect-error Custom names are schema-checked.
  renderer.setUniforms({ missing: 1 });
  // @ts-expect-error Automatic uniforms cannot be set as custom values.
  renderer.setUniforms({ time: 1 });
  // @ts-expect-error Only declared custom names can be reset.
  renderer.resetUniforms("missing");
  // @ts-expect-error Different names and types cannot retain the typed renderer.
  await renderer.setShader(different);
  // @ts-expect-error Changing a type with the same name is incompatible.
  await renderer.setShader(changedType);
  // @ts-expect-error Adding only one field is also incompatible.
  await renderer.setShader(addedName);
  // @ts-expect-error Different schema cannot sneak through initial options.
  await createWebGlRenderer(canvas, inline, { uniforms: { radius: 1 } });
  const unexpectedOptions = { uniforms: { dpi: 2, radius: 1 } };
  // @ts-expect-error A variable with extra names must also fail.
  await createWebGlRenderer(canvas, inline, unexpectedOptions);
  // @ts-expect-error A string cannot bypass the typed overload by widening to legacy.
  await createWebGlRenderer(canvas, inline, { uniforms: { dpi: "2" } });
  const legacyArtifact: CompiledFragmentArtifact = inline; // Explicit erasure.
  const legacyRenderer = await createWebGlRenderer(canvas, legacyArtifact);
  legacyRenderer.setUniforms({ dpi: 2 }); // Name/type validated at runtime.
  // @ts-expect-error Legacy erasure cannot bypass typed creation-time checks.
  await createWebGlRenderer(canvas, legacyArtifact, { uniforms: { dpi: 2 } });
  legacyRenderer.dispose();
  renderer.dispose();
}

async function staticGpuHost(): Promise<void> {
  const renderer = await createWebGpuRenderer(canvas, named);
  renderer.setUniforms({ dpi: 1 });
  await renderer.setShader(inline);
  renderer.resetUniforms();
  renderer.dispose();
}

async function browserEditor(source: string): Promise<void> {
  const initial = compileEditedSource(source);
  if (!initial.ok) return;
  const renderer = await createWebGlRenderer(canvas, initial.artifact);
  const next = compileEditedSource(source);
  if (!next.ok) return;
  await renderer.setShader(next.artifact); // Any runtime schema is allowed.
  renderer.setUniforms({ dpi: 2, color: [0, 1, 0] });
  renderer.resetUniforms("dpi"); // Both calls are runtime-validated.
  // @ts-expect-error Even dynamic hosts cannot send strings as numeric data.
  renderer.setUniforms({ dpi: "2" });
  await renderer.setShader(named); // Explicitly dynamic renderer; runtime validates.
  renderer.dispose();
}

void staticHost;
void noCustomHost;
void staticGpuHost;
void browserEditor;
