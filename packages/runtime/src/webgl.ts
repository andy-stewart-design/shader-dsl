import type {
  CompiledFragmentArtifact,
  DynamicCompiledFragmentArtifact,
  HostUniforms,
  ShaderDefaultUniform,
  TypedCompiledFragmentArtifact,
  UniformSchema,
} from "shdr";
import {
  readCustomMetadata,
  readResourceMetadata,
  type CustomSchema,
  type ResourceSchema,
  type UniformValues,
} from "./uniforms.js";
import { ShdrRuntimeError, runtimeError } from "./errors.js";
import {
  loadTextureResources,
  type LoadedTextureResources,
} from "./texture-resources.js";
import {
  aborted,
  CanvasRenderer,
  checkArtifact,
  claim,
  epoch,
  release,
  type InternalRendererOptions,
} from "./shared.js";
import type {
  RendererOptions,
  ShaderInstallOptions,
  ShaderInstallResult,
  StaticRenderer,
  StaticRendererOptions,
  DynamicRendererOptions,
  LegacyRendererOptions,
} from "./types.js";

const VERTEX = `#version 300 es
precision highp float;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;
interface Program {
  readonly program: WebGLProgram;
  readonly vertex: WebGLShader;
  readonly fragment: WebGLShader;
  readonly uniforms: Readonly<
    Record<ShaderDefaultUniform, WebGLUniformLocation | null>
  >;
  readonly boundUniforms: readonly ShaderDefaultUniform[];
  readonly custom?: CustomSchema;
  readonly customLocations: readonly (WebGLUniformLocation | null)[];
  readonly textures: LoadedTextureResources;
  readonly textureObjects: ReadonlyMap<string, WebGLTexture>;
  readonly textureBindings: readonly { name: string; binding: number }[];
}

export class WebGlRenderer extends CanvasRenderer {
  private program?: Program;
  private readonly vao: WebGLVertexArrayObject;
  private pendingTextureLoad?: AbortController;
  private constructor(
    canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    vao: WebGLVertexArrayObject,
    options: RendererOptions,
  ) {
    super(canvas, "webgl", options);
    this.vao = vao;
    canvas.addEventListener("webglcontextlost", this.contextLost);
  }
  static create<
    const S extends UniformSchema,
    const V extends Partial<HostUniforms<S>> = never,
  >(
    canvas: HTMLCanvasElement,
    artifact: TypedCompiledFragmentArtifact<S>,
    options?: StaticRendererOptions<S, V>,
  ): Promise<StaticRenderer<S>>;
  static create(
    canvas: HTMLCanvasElement,
    artifact: DynamicCompiledFragmentArtifact,
    options?: DynamicRendererOptions,
  ): Promise<WebGlRenderer>;
  static create(
    canvas: HTMLCanvasElement,
    artifact: CompiledFragmentArtifact,
    options?: LegacyRendererOptions,
  ): Promise<WebGlRenderer>;
  static async create(
    canvas: HTMLCanvasElement,
    artifact: CompiledFragmentArtifact,
    options: InternalRendererOptions = {},
  ): Promise<WebGlRenderer> {
    aborted("webgl", options.signal);
    claim(canvas, "webgl");
    let renderer: WebGlRenderer | undefined;
    try {
      checkArtifact(artifact, "webgl");
      const custom = readCustomMetadata(artifact, "webgl");
      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl)
        throw new ShdrRuntimeError(
          "webgl",
          "unavailable",
          "WebGL 2 canvas context unavailable.",
        );
      const vao = gl.createVertexArray();
      if (!vao)
        throw new ShdrRuntimeError(
          "webgl",
          "surface",
          "Could not create a WebGL vertex array.",
        );
      renderer = new WebGlRenderer(canvas, gl, vao, options);
      renderer.uniformState.creation(custom, options.uniforms);
      aborted("webgl", options.signal);
      await renderer.setShader(artifact, { startedAt: options.startedAt });
      aborted("webgl", options.signal);
      return renderer;
    } catch (error) {
      renderer?.dispose();
      if (!renderer) release(canvas);
      throw runtimeError("webgl", "shader", error);
    }
  }
  private contextLost = (event: Event): void => {
    event.preventDefault();
    this.pendingTextureLoad?.abort();
    this.terminal("WebGL context lost; recreate the renderer on a new canvas.");
    this.program?.textures.dispose();
    this.program = undefined;
  };
  async setShader(
    artifact: CompiledFragmentArtifact,
    options: ShaderInstallOptions = {},
  ): Promise<ShaderInstallResult> {
    this.assertUsable();
    this.pendingTextureLoad?.abort();
    const loadController = new AbortController();
    this.pendingTextureLoad = loadController;
    const generation = ++this.generation;
    const gl = this.gl;
    let candidate: Program | undefined;
    let textures: LoadedTextureResources | undefined;
    try {
      checkArtifact(artifact, "webgl");
      const custom = readCustomMetadata(artifact, "webgl");
      const resources = readResourceMetadata(artifact, "webgl");
      textures = await loadTextureResources(resources, "webgl", {
        signal: loadController.signal,
        maxTextures: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
        maxTextureDimension: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      });
      if (!this.current(generation)) return { status: "superseded" };
      candidate = this.makeProgram(
        artifact.glsl,
        artifact.defaults.glsl,
        custom,
        textures,
        resources,
      );
      if (!this.current(generation)) return { status: "superseded" };
      const requestedEpoch =
        options.startedAt === undefined
          ? undefined
          : epoch(options.startedAt, "webgl");
      // Preflight offscreen: a failed candidate draw must not replace the last canvas frame.
      this.size();
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      if (!texture || !framebuffer) {
        if (texture) gl.deleteTexture(texture);
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        throw new Error("Could not create a WebGL preflight target.");
      }
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          this.canvas.width,
          this.canvas.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0,
        );
        if (
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
        )
          throw new Error("WebGL preflight framebuffer incomplete.");
        this.submit(
          candidate,
          requestedEpoch === undefined
            ? 0
            : Math.max(0, (performance.now() - requestedEpoch) / 1000),
          this.uniformState.resolve(custom),
        );
      } catch (error) {
        throw runtimeError("webgl", "draw", error);
      } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
      }
      if (!this.current(generation)) return { status: "superseded" };
      const startedAt = requestedEpoch ?? performance.now();
      const values = this.uniformState.resolve(custom);
      try {
        this.submit(
          candidate,
          Math.max(0, (performance.now() - startedAt) / 1000),
          values,
        );
      } catch (error) {
        throw runtimeError("webgl", "draw", error);
      }
      const previous = this.program;
      this.program = candidate;
      this.uniformState.commit(custom, values);
      candidate = undefined;
      if (previous) this.deleteProgram(previous);
      this.installed(startedAt);
      return {
        status: "installed",
        boundUniforms: this.program.boundUniforms,
        warnings: [],
      };
    } catch (error) {
      if (!this.current(generation)) return { status: "superseded" };
      throw runtimeError("webgl", "shader", error);
    } finally {
      if (this.pendingTextureLoad === loadController)
        this.pendingTextureLoad = undefined;
      if (candidate) this.deleteProgram(candidate);
      else textures?.dispose();
    }
  }
  protected async performDraw(timestamp: number): Promise<void> {
    const program = this.program;
    if (!program) throw new Error("No installed WebGL shader.");
    this.size();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.submit(program, this.elapsed(timestamp));
  }
  private submit(
    resource: Program,
    seconds: number,
    values: UniformValues = this.uniformState.current(),
  ): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(resource.program);
    gl.bindVertexArray(this.vao);
    for (const binding of resource.textureBindings) {
      gl.activeTexture(gl.TEXTURE0 + binding.binding);
      gl.bindTexture(
        gl.TEXTURE_2D,
        resource.textureObjects.get(binding.name) ?? null,
      );
    }
    if (resource.uniforms.resolution)
      gl.uniform2f(
        resource.uniforms.resolution,
        this.canvas.width,
        this.canvas.height,
      );
    if (resource.uniforms.mouse)
      gl.uniform2f(
        resource.uniforms.mouse,
        this.mouseX * this.canvas.width,
        this.mouseY * this.canvas.height,
      );
    if (resource.uniforms.time) gl.uniform1f(resource.uniforms.time, seconds);
    resource.custom?.declarations.forEach((item, index) => {
      const location = resource.customLocations[index];
      if (!location) return;
      const value = values.get(item.name)!;
      if (item.type === "f32") gl.uniform1f(location, value as number);
      else {
        const components = value as readonly number[];
        switch (item.type) {
          case "vec2":
            gl.uniform2f(location, components[0]!, components[1]!);
            break;
          case "vec3":
            gl.uniform3f(
              location,
              components[0]!,
              components[1]!,
              components[2]!,
            );
            break;
          case "vec4":
            gl.uniform4f(
              location,
              components[0]!,
              components[1]!,
              components[2]!,
              components[3]!,
            );
            break;
        }
      }
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const error = gl.getError();
    if (error !== gl.NO_ERROR)
      throw new Error(`WebGL draw failed: 0x${error.toString(16)}.`);
  }
  private makeProgram(
    source: string,
    declared: readonly ShaderDefaultUniform[],
    custom: CustomSchema | undefined,
    textures: LoadedTextureResources,
    resources: ResourceSchema | undefined,
  ): Program {
    const gl = this.gl;
    const compile = (kind: number, text: string): WebGLShader => {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error("Could not create WebGL shader.");
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`WebGL shader compilation failed: ${message}`);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    let fragment: WebGLShader | undefined;
    let program: WebGLProgram | undefined;
    const textureObjects = new Map<string, WebGLTexture>();
    try {
      fragment = compile(gl.FRAGMENT_SHADER, source);
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error("Could not create WebGL program.");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`WebGL link failed: ${gl.getProgramInfoLog(program)}`);
      gl.useProgram(program);
      const uniforms = {
        resolution: gl.getUniformLocation(program, "u_resolution"),
        mouse: gl.getUniformLocation(program, "u_mouse"),
        time: gl.getUniformLocation(program, "u_time"),
      };
      // Optimizers may discard declared but unused uniforms. Never supply undeclared ones.
      const boundUniforms = declared.filter((name) => uniforms[name] !== null);
      if (
        (["resolution", "mouse", "time"] as const).some(
          (name) => uniforms[name] !== null && !declared.includes(name),
        )
      )
        throw new ShdrRuntimeError(
          "webgl",
          "artifact",
          "GLSL uniform metadata does not match active bindings.",
        );
      const customLocations =
        custom?.declarations.map((item, index) =>
          gl.getUniformLocation(program!, `shdr_custom_${index}`),
        ) ?? [];
      if (
        custom?.declarations.some(
          (item, index) =>
            customLocations[index] !== null &&
            !custom.referenced.glsl.includes(item.name),
        )
      )
        throw new ShdrRuntimeError(
          "webgl",
          "artifact",
          "GLSL custom uniform metadata does not match active bindings.",
        );
      const textureBindings = resources?.bindings ?? [];
      const textureDeclarations = resources?.textures ?? [];
      for (const binding of textureBindings) {
        const loaded = textures.textures.get(binding.name);
        const index = textureDeclarations.findIndex(
          ({ name }) => name === binding.name,
        );
        const location = gl.getUniformLocation(
          program,
          `shdr_texture_${index}`,
        );
        if (!loaded || index < 0 || !location)
          throw new ShdrRuntimeError(
            "webgl",
            "artifact",
            `GLSL texture metadata does not match active binding ${JSON.stringify(binding.name)}.`,
          );
        const texture = gl.createTexture();
        if (!texture)
          throw new Error("Could not create a WebGL texture resource.");
        textureObjects.set(binding.name, texture);
        gl.activeTexture(gl.TEXTURE0 + binding.binding);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          loaded.image,
        );
        if (gl.getError() !== gl.NO_ERROR)
          throw new Error(
            `WebGL texture upload failed for ${JSON.stringify(binding.name)}.`,
          );
        gl.uniform1i(location, binding.binding);
      }
      return {
        program,
        vertex,
        fragment,
        uniforms,
        boundUniforms,
        custom,
        customLocations,
        textures,
        textureObjects,
        textureBindings: [...textureBindings],
      };
    } catch (error) {
      for (const texture of textureObjects.values()) gl.deleteTexture(texture);
      if (program) gl.deleteProgram(program);
      if (fragment) gl.deleteShader(fragment);
      gl.deleteShader(vertex);
      throw error;
    }
  }
  private deleteProgram(resource: Program): void {
    for (const texture of resource.textureObjects.values())
      this.gl.deleteTexture(texture);
    resource.textures.dispose();
    this.gl.deleteProgram(resource.program);
    this.gl.deleteShader(resource.vertex);
    this.gl.deleteShader(resource.fragment);
  }
  protected cleanup(): void {
    this.pendingTextureLoad?.abort();
    this.pendingTextureLoad = undefined;
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    if (this.program && !this.lost) this.deleteProgram(this.program);
    this.program = undefined;
    if (!this.lost) this.gl.deleteVertexArray(this.vao);
  }
}

/** Public factory shares the class's overloads and implementation verbatim. */
export const createWebGlRenderer: typeof WebGlRenderer.create =
  WebGlRenderer.create;
