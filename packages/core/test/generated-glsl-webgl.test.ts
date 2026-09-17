import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

import { generateGlslFragment } from "../src/generate-glsl-fragment.js";
import { lowerFragment } from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

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

interface ShaderStatus {
  readonly compiled: boolean;
  readonly log: string;
}

interface ProgramStatus {
  readonly linked: boolean;
  readonly log: string;
}

interface WebGlValidationResult {
  readonly contextAvailable: boolean;
  readonly renderer?: string;
  readonly vertex?: ShaderStatus;
  readonly fragment?: ShaderStatus;
  readonly program?: ProgramStatus;
}

describe("generated GLSL in WebGL 2", () => {
  it(
    "compiles and links the target shader in a real browser context",
    async () => {
      const source = await readShaderFixture("gradient");
      const lowered = lowerFragment(source);
      expect(lowered.ok).toBe(true);
      if (!lowered.ok) return;
      const fragmentSource = generateGlslFragment(lowered.ir);

      const browser = await chromium.launch({
        headless: process.env.SHDR_WEBGL_HEADED !== "1",
        args: [
          "--enable-webgl",
          "--enable-unsafe-swiftshader",
          "--use-angle=swiftshader",
        ],
      });

      try {
        const page = await browser.newPage();
        await page.setContent("<!doctype html><canvas id=canvas></canvas>");
        const result = await page.evaluate<WebGlValidationResult, {
          vertexSource: string;
          fragmentSource: string;
        }>(
          ({ vertexSource, fragmentSource }) => {
            const canvas = document.querySelector("canvas");
            const gl = canvas?.getContext("webgl2");
            if (!gl) return { contextAvailable: false };

            const compile = (
              type: typeof gl.VERTEX_SHADER | typeof gl.FRAGMENT_SHADER,
              shaderSource: string,
            ) => {
              const shader = gl.createShader(type);
              if (!shader) throw new Error("WebGL failed to create a shader.");
              gl.shaderSource(shader, shaderSource);
              gl.compileShader(shader);
              return {
                shader,
                status: {
                  compiled: gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean,
                  log: gl.getShaderInfoLog(shader) ?? "",
                },
              };
            };

            const vertex = compile(gl.VERTEX_SHADER, vertexSource);
            const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
            const program = gl.createProgram();
            if (!program) throw new Error("WebGL failed to create a program.");
            gl.attachShader(program, vertex.shader);
            gl.attachShader(program, fragment.shader);
            gl.linkProgram(program);

            const result = {
              contextAvailable: true,
              renderer: gl.getParameter(gl.RENDERER) as string,
              vertex: vertex.status,
              fragment: fragment.status,
              program: {
                linked: gl.getProgramParameter(program, gl.LINK_STATUS) as boolean,
                log: gl.getProgramInfoLog(program) ?? "",
              },
            };

            gl.deleteProgram(program);
            gl.deleteShader(vertex.shader);
            gl.deleteShader(fragment.shader);
            return result;
          },
          { vertexSource: FULLSCREEN_TRIANGLE_VERTEX_SHADER, fragmentSource },
        );

        expect(result.contextAvailable).toBe(true);
        expect(result.renderer).toBeTruthy();
        expect(result.vertex?.compiled, result.vertex?.log).toBe(true);
        expect(result.fragment?.compiled, result.fragment?.log).toBe(true);
        expect(result.program?.linked, result.program?.log).toBe(true);
        expect(result.vertex?.log.toLowerCase()).not.toContain("error");
        expect(result.fragment?.log.toLowerCase()).not.toContain("error");
        expect(result.program?.log.toLowerCase()).not.toContain("error");
      } finally {
        await browser.close();
      }
    },
    30_000,
  );
});
