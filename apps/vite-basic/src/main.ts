import type { FragmentShaderSource } from "shdr";

import fragmentShader from "./gradient.shdr.ts";
import expandedShader from "./expanded.shdr.ts";
import "./style.css";

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

const shader: FragmentShaderSource = fragmentShader;
const expanded: FragmentShaderSource = expandedShader;
if (!expanded.includes("vec3(")) {
  throw new Error("The expanded shader was not compiled by the Vite plugin.");
}
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("The Vite fixture requires an #app element.");

app.innerHTML = `
  <main>
    <h1>Shdr Vite/WebGL 2 fixture</h1>
    <canvas id="shader-canvas" width="512" height="512"></canvas>
    <p id="status" role="status">Compiling generated shader…</p>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#shader-canvas");
const status = document.querySelector<HTMLParagraphElement>("#status");
if (!canvas || !status) throw new Error("The shader fixture UI is incomplete.");

try {
  render(canvas, shader);
  canvas.dataset.renderStatus = "success";
  status.textContent = "Generated GLSL compiled, linked, and rendered.";
} catch (error) {
  canvas.dataset.renderStatus = "error";
  status.textContent = error instanceof Error ? error.message : String(error);
  throw error;
}

function render(
  target: HTMLCanvasElement,
  fragmentSource: FragmentShaderSource,
): void {
  const gl = target.getContext("webgl2", {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("WebGL 2 is unavailable.");

  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    FULLSCREEN_TRIANGLE_VERTEX_SHADER,
  );
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create a WebGL program.");

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      `WebGL link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`,
    );
  }

  const resolution = gl.getUniformLocation(program, "u_resolution");
  if (resolution === null) {
    throw new Error("Generated shader did not expose u_resolution.");
  }

  const vertexArray = gl.createVertexArray();
  if (!vertexArray) throw new Error("Unable to create a WebGL vertex array.");

  gl.viewport(0, 0, target.width, target.height);
  gl.useProgram(program);
  gl.uniform2f(resolution, target.width, target.height);
  gl.bindVertexArray(vertexArray);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.deleteVertexArray(vertexArray);
  gl.deleteProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shaderObject = gl.createShader(type);
  if (!shaderObject) throw new Error("Unable to create a WebGL shader.");

  gl.shaderSource(shaderObject, source);
  gl.compileShader(shaderObject);
  if (!gl.getShaderParameter(shaderObject, gl.COMPILE_STATUS)) {
    const stage = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
    throw new Error(
      `WebGL ${stage} compilation failed: ${gl.getShaderInfoLog(shaderObject) ?? "unknown error"}`,
    );
  }

  return shaderObject;
}
