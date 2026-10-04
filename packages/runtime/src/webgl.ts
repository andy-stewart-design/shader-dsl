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
  type CustomMetadata,
  type UniformValues,
} from "./uniforms.js";
import { ShdrRuntimeError, runtimeError } from "./errors.js";
import {
  aborted,
  CanvasRenderer,
  checkArtifact,
  claim,
  epoch,
  release,
} from "./shared.js";
import type {
  RendererOptions,
  ShaderInstallOptions,
  ShaderInstallResult,
  StaticRenderer,
  StaticRendererOptions,
  DynamicRendererOptions,
  LegacyRendererOptions,
  InternalRendererOptions,
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
  readonly custom?: CustomMetadata;
  readonly customLocations: readonly (WebGLUniformLocation | null)[];
}

export class WebGlRenderer extends CanvasRenderer {
  private program?: Program;
  private readonly vao: WebGLVertexArrayObject;
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
    this.terminal("WebGL context lost; recreate the renderer on a new canvas.");
    this.program = undefined;
  };
  async setShader(
    artifact: CompiledFragmentArtifact,
    options: ShaderInstallOptions = {},
  ): Promise<ShaderInstallResult> {
    this.assertUsable();
    const generation = ++this.generation;
    checkArtifact(artifact, "webgl");
    const custom = readCustomMetadata(artifact, "webgl");
    const gl = this.gl;
    let candidate: Program | undefined;
    try {
      candidate = this.makeProgram(
        artifact.glsl,
        artifact.defaults.glsl,
        custom,
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
      if (candidate) this.deleteProgram(candidate);
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
    custom: CustomMetadata | undefined,
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
    try {
      fragment = compile(gl.FRAGMENT_SHADER, source);
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error("Could not create WebGL program.");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`WebGL link failed: ${gl.getProgramInfoLog(program)}`);
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
      return {
        program,
        vertex,
        fragment,
        uniforms,
        boundUniforms,
        custom,
        customLocations,
      };
    } catch (error) {
      if (program) gl.deleteProgram(program);
      if (fragment) gl.deleteShader(fragment);
      gl.deleteShader(vertex);
      throw error;
    }
  }
  private deleteProgram(resource: Program): void {
    this.gl.deleteProgram(resource.program);
    this.gl.deleteShader(resource.vertex);
    this.gl.deleteShader(resource.fragment);
  }
  protected cleanup(): void {
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    if (this.program && !this.lost) this.deleteProgram(this.program);
    this.program = undefined;
    if (!this.lost) this.gl.deleteVertexArray(this.vao);
  }
}

export function createWebGlRenderer<
  const S extends UniformSchema,
  const V extends Partial<HostUniforms<S>> = never,
>(
  canvas: HTMLCanvasElement,
  artifact: TypedCompiledFragmentArtifact<S>,
  options?: StaticRendererOptions<S, V>,
): Promise<StaticRenderer<S>>;
export function createWebGlRenderer(
  canvas: HTMLCanvasElement,
  artifact: DynamicCompiledFragmentArtifact,
  options?: DynamicRendererOptions,
): Promise<WebGlRenderer>;
export function createWebGlRenderer(
  canvas: HTMLCanvasElement,
  artifact: CompiledFragmentArtifact,
  options?: LegacyRendererOptions,
): Promise<WebGlRenderer>;
export function createWebGlRenderer(
  canvas: HTMLCanvasElement,
  artifact: CompiledFragmentArtifact,
  options?: InternalRendererOptions,
): Promise<WebGlRenderer> {
  return WebGlRenderer.create(
    canvas,
    artifact,
    options as LegacyRendererOptions,
  );
}
