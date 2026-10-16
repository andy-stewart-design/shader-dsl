// Browser bundle-boundary fixture: a static artifact and one runtime backend.
import { createWebGlRenderer } from "@shdr/runtime/webgl";
import shader from "./orbit-math.shdr.ts";

export function render(canvas: HTMLCanvasElement) {
  return createWebGlRenderer(canvas, shader, { animate: false });
}
