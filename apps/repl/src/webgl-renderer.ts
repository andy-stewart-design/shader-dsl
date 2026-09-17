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

export function renderFragmentShader(
  canvas: HTMLCanvasElement,
  fragmentSource: string,
): void {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("WebGL 2 is unavailable in this browser.");

  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    FULLSCREEN_TRIANGLE_VERTEX_SHADER,
  );
  let fragment: WebGLShader | undefined;
  let program: WebGLProgram | undefined;
  let vertexArray: WebGLVertexArrayObject | undefined;

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

    vertexArray = gl.createVertexArray() ?? undefined;
    if (!vertexArray) throw new Error("WebGL could not create a vertex array.");

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    const resolution = gl.getUniformLocation(program, "u_resolution");
    if (resolution !== null) {
      gl.uniform2f(resolution, canvas.width, canvas.height);
    }
    gl.bindVertexArray(vertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      throw new Error(`WebGL draw failed with error 0x${error.toString(16)}.`);
    }
  } finally {
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    if (program) gl.deleteProgram(program);
    if (fragment) gl.deleteShader(fragment);
    gl.deleteShader(vertex);
  }
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
