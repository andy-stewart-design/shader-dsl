import { createWebGlRenderer } from "@shdr/runtime/webgl";
import type { ShdrRuntimeError } from "@shdr/runtime/errors";

import texture from "./texture.shdr.ts";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#texture-canvas");
const status = document.querySelector<HTMLParagraphElement>("#texture-status");
if (!canvas || !status) throw new Error("Texture example UI is incomplete.");

try {
  const renderer = await createWebGlRenderer(canvas, texture, {
    animate: false,
    onError(error: ShdrRuntimeError) {
      canvas.dataset.renderStatus = "error";
      status.textContent = error.message;
    },
  });
  canvas.dataset.renderStatus = "success";
  status.textContent = "Public texture sampled with WebGL 2.";
  renderer.dispose();
} catch (error) {
  canvas.dataset.renderStatus = "error";
  status.textContent = error instanceof Error ? error.message : String(error);
}
