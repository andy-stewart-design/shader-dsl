const FULLSCREEN_TRIANGLE_VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  vec2 position = vec2(
    float((gl_VertexID << 1) & 2),
    float(gl_VertexID & 2)
  );
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

type DefaultUniform = "resolution" | "mouse" | "time";

interface ShaderResources {
  readonly program: WebGLProgram;
  readonly vertex: WebGLShader;
  readonly fragment: WebGLShader;
  readonly locations: Readonly<Record<DefaultUniform, WebGLUniformLocation | null>>;
  readonly boundUniforms: readonly DefaultUniform[];
}

export class WebGlRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  readonly #vertexArray: WebGLVertexArrayObject;
  readonly #startedAt = performance.now();
  #resources: ShaderResources | undefined;
  #animationFrame: number | undefined;
  #mouseX = 0;
  #mouseY = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL 2 is unavailable in this browser.");
    const vertexArray = gl.createVertexArray();
    if (!vertexArray) throw new Error("WebGL could not create a vertex array.");

    this.#canvas = canvas;
    this.#gl = gl;
    this.#vertexArray = vertexArray;
    canvas.addEventListener("pointermove", this.#updateMouse);
    this.#animationFrame = requestAnimationFrame(this.#drawFrame);
  }

  setFragmentShader(fragmentSource: string): readonly DefaultUniform[] {
    const resources = this.#createResources(fragmentSource);
    const previous = this.#resources;

    try {
      this.#draw(resources, performance.now());
      this.#resources = resources;
      if (previous) this.#deleteResources(previous);
      this.#canvas.dataset.renderStatus = "success";
      this.#canvas.dataset.validationState = "success";
      this.#canvas.dataset.boundUniforms = resources.boundUniforms.join(",");
      return resources.boundUniforms;
    } catch (error) {
      this.#deleteResources(resources);
      this.#canvas.dataset.validationState = "error";
      if (!previous) this.#canvas.dataset.renderStatus = "error";
      throw error;
    }
  }

  dispose(): void {
    if (this.#animationFrame !== undefined) {
      cancelAnimationFrame(this.#animationFrame);
    }
    this.#canvas.removeEventListener("pointermove", this.#updateMouse);
    if (this.#resources) this.#deleteResources(this.#resources);
    this.#gl.deleteVertexArray(this.#vertexArray);
  }

  #createResources(fragmentSource: string): ShaderResources {
    const gl = this.#gl;
    const vertex = compileShader(
      gl,
      gl.VERTEX_SHADER,
      FULLSCREEN_TRIANGLE_VERTEX_SHADER,
    );
    let fragment: WebGLShader | undefined;
    let program: WebGLProgram | undefined;

    try {
      fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error("WebGL could not create a shader program.");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(
          `WebGL link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`,
        );
      }

      const locations = {
        resolution: gl.getUniformLocation(program, "u_resolution"),
        mouse: gl.getUniformLocation(program, "u_mouse"),
        time: gl.getUniformLocation(program, "u_time"),
      };
      const boundUniforms = (
        ["resolution", "mouse", "time"] as const
      ).filter((uniform) => locations[uniform] !== null);
      return { program, vertex, fragment, locations, boundUniforms };
    } catch (error) {
      if (program) gl.deleteProgram(program);
      if (fragment) gl.deleteShader(fragment);
      gl.deleteShader(vertex);
      throw error;
    }
  }

  #deleteResources(resources: ShaderResources): void {
    const gl = this.#gl;
    gl.deleteProgram(resources.program);
    gl.deleteShader(resources.vertex);
    gl.deleteShader(resources.fragment);
  }

  #draw(resources: ShaderResources, timestamp: number): void {
    const gl = this.#gl;
    this.#resizeDrawingBuffer();
    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    gl.useProgram(resources.program);
    gl.bindVertexArray(this.#vertexArray);

    const { locations } = resources;
    if (locations.resolution) {
      gl.uniform2f(
        locations.resolution,
        this.#canvas.width,
        this.#canvas.height,
      );
    }
    if (locations.mouse) {
      gl.uniform2f(locations.mouse, this.#mouseX, this.#mouseY);
    }
    const elapsedSeconds = (timestamp - this.#startedAt) / 1_000;
    if (locations.time) {
      gl.uniform1f(locations.time, elapsedSeconds);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      throw new Error(`WebGL draw failed with error 0x${error.toString(16)}.`);
    }

    this.#canvas.dataset.resolution = `${this.#canvas.width},${this.#canvas.height}`;
    this.#canvas.dataset.mouse = `${this.#mouseX},${this.#mouseY}`;
    this.#canvas.dataset.time = String(elapsedSeconds);
  }

  #resizeDrawingBuffer(): void {
    const rect = this.#canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
    }
  }

  #updateMouse = (event: PointerEvent): void => {
    const rect = this.#canvas.getBoundingClientRect();
    this.#mouseX =
      ((event.clientX - rect.left) / rect.width) * this.#canvas.width;
    this.#mouseY =
      ((event.clientY - rect.top) / rect.height) * this.#canvas.height;
  };

  #drawFrame = (timestamp: number): void => {
    if (this.#resources) this.#draw(this.#resources, timestamp);
    this.#animationFrame = requestAnimationFrame(this.#drawFrame);
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL could not create a shader.");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const stage = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
    const message = gl.getShaderInfoLog(shader) ?? "unknown error";
    gl.deleteShader(shader);
    throw new Error(`WebGL ${stage} compilation failed: ${message}`);
  }

  return shader;
}
