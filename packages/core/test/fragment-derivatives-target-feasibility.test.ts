import { chromium } from "playwright";
import { expect, it } from "vitest";

// Raw target probes only: deliberately bypass Shdr types, lowering and emitters.
const glsl = `#version 300 es
precision highp float;
out vec4 color;
float probe(float x) { return dFdy(x); }
vec2 probe(vec2 x) { return dFdy(x); }
vec3 probe(vec3 x) { return dFdy(x); }
vec4 probe(vec4 x) { return dFdy(x); }
void main() {
  vec2 coord = vec2(gl_FragCoord.x, gl_FragCoord.y);
  float downY = 64.0 - coord.y;
  float a = dFdx(coord.x);
  float b = -probe(downY);
  float d = fwidth(coord.y);
  vec2 v2 = vec2(coord.x, coord.y);
  vec3 v3 = vec3(coord.x, coord.y, 2.0*coord.x);
  vec4 v4 = vec4(coord.x, coord.y, 2.0*coord.x, 3.0*coord.y);
  vec4 allOps = vec4(dFdx(v2).x + dFdy(v3).x + fwidth(v4).x,
                     dFdx(v3).y + dFdy(v4).y + fwidth(v2).y,
                     dFdx(v4).z + dFdy(v2).x + fwidth(v3).z,
                     dFdx(v2).y + dFdy(v4).w + fwidth(v3).z) * 0.0;
  color = vec4(0.5 + 0.25*a, 0.5 + 0.25*b, 0.5 + 0.25*fwidth(v4).z, 0.5 + 0.25*d) + allOps;
}`;

const wgsl = `struct Out { @builtin(position) position: vec4<f32>, @location(0) color: vec4<f32> };
fn probe(x: f32) -> f32 { return dpdy(x); }
fn probe2(x: vec2<f32>) -> vec2<f32> { return dpdy(x); }
fn probe3(x: vec3<f32>) -> vec3<f32> { return dpdy(x); }
fn probe4(x: vec4<f32>) -> vec4<f32> { return dpdy(x); }
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
 let p = array<vec2<f32>, 3>(vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
 return vec4(p[i],0.0,1.0);
}
@fragment fn fragment(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
 let x = dpdx(p.x); let y = probe(p.y); let w = fwidth(p.y);
 let a2 = dpdx(vec2(p.x,p.y)); let b2 = dpdy(vec2(p.x,p.y)); let c2 = fwidth(vec2(p.x,p.y));
 let a3 = dpdx(vec3(p.x,p.y,p.x*2.0)); let b3 = dpdy(vec3(p.x,p.y,p.x*2.0)); let c3 = fwidth(vec3(p.x,p.y,p.x*2.0));
 let a4 = dpdx(vec4(p.x,p.y,p.x*2.0,p.y*3.0)); let b4 = dpdy(vec4(p.x,p.y,p.x*2.0,p.y*3.0)); let c4 = fwidth(vec4(p.x,p.y,p.x*2.0,p.y*3.0));
 return vec4(x, y, a2.x, w) + vec4(a3.x+b3.y+c3.z+a4.w+b4.x+c4.y, b2.x, probe2(vec2(p.x,p.y)).y, probe3(vec3(p.x,p.y,p.x)).z)*0.0;
}`;

it("compiles, links, and renders raw derivative/helper probes on WebGL 2 and validates a WGSL pipeline", async () => {
  const browser = await chromium.launch({ headless: true, args: [
    "--enable-webgl", "--enable-unsafe-swiftshader", "--enable-unsafe-webgpu", "--use-angle=swiftshader",
  ] });
  try {
    const page = await browser.newPage();
    await page.setContent("<canvas width=96 height=64></canvas>");
    const result = await page.evaluate(async ({ glsl, wgsl }) => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL 2 unavailable");
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "GLSL compile failed");
        return shader;
      };
      const vs = compile(gl.VERTEX_SHADER, `#version 300 es\nvoid main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`);
      const fs = compile(gl.FRAGMENT_SHADER, glsl);
      const program = gl.createProgram()!; gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "GLSL link failed");
      gl.useProgram(program); gl.viewport(0,0,96,64); gl.drawArrays(gl.TRIANGLES,0,3);
      const pixel = new Uint8Array(4); gl.readPixels(48,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      console.info("WebGL derivative pixel:", JSON.stringify({ pixel:Array.from(pixel), renderer:gl.getParameter(gl.RENDERER) }));
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("WebGPU adapter unavailable");
      const device = await adapter.requestDevice();
      try {
        const module = device.createShaderModule({code:wgsl});
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(m=>m.type === "error");
        if (errors.length) throw new Error(errors.map(e=>e.message).join("\n"));
        const pipeline = device.createRenderPipeline({layout:"auto",vertex:{module,entryPoint:"vertex"},fragment:{module,entryPoint:"fragment",targets:[{format:"bgra8unorm"}]},primitive:{topology:"triangle-list"}});
        await pipeline.getBindGroupLayout(0);
        return {pixel:Array.from(pixel), renderer:gl.getParameter(gl.RENDERER), adapter:adapter.info?.description ?? "unknown WebGPU adapter", wgslValidated:true, wgslPipeline:true};
      } finally { device.destroy(); }
    }, { glsl, wgsl });
    expect(result.wgslValidated).toBe(true);
    expect(result.wgslPipeline).toBe(true);
    // 0.5 + 0.25*slope encodes an expected unit magnitude as ~191/255.
    // 8-bit quantization plus SwiftShader variation: +/- 4 codes (~0.063 slope).
    expect(result.pixel).toEqual(expect.arrayContaining([expect.any(Number)]));
    for (const channel of result.pixel) expect(channel).toBeGreaterThanOrEqual(187);
    for (const channel of result.pixel) expect(channel).toBeLessThanOrEqual(195);
    console.info("fragment derivative feasibility target:", JSON.stringify(result));
  } finally { await browser.close(); }
}, 60_000);
