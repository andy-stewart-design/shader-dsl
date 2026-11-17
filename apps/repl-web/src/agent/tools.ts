import { defineTool, z } from "app-mcp/zod";
import { imageResult } from "app-mcp/browser";
import {
  authoringUpdateSchema,
  type AuthoringUpdateInput,
} from "./authoring-schema.ts";
import { appStateFromController } from "./app-state.ts";
import { getDocumentation } from "./documentation.ts";
import type { AuthoringController } from "./controller-types.ts";
import { CapturePreviewError, type CapturePreviewPort } from "./snapshot.ts";

const emptyInputSchema = z.strictObject({});
const documentationInputSchema = z
  .strictObject({ topic: z.string().optional() })
  .default({});
const applyInputSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
});
const captureInputSchema = z.strictObject({
  expectedAppliedRevision: z.number().int().min(0),
  maxDimension: z
    .union([z.number().int().min(64).max(2048), z.literal("native")])
    .default(512),
});

export const AUTHORING_TOOL_NAMES = [
  "get_app_state",
  "get_documentation",
  "get_sketch",
  "update_sketch",
  "apply_sketch",
  "capture_preview",
] as const;

/**
 * Stable authoring catalog; Apply and capture are conditional site
 * capabilities. `available` means the tool is registered in this catalog;
 * `ready` is reserved for a live renderer/handle.
 */
export function createAuthoringTools(
  controller: AuthoringController,
  capturePortRef?: { current: CapturePreviewPort | null },
) {
  const { apply } = controller;
  return [
    defineTool({
      name: "get_app_state",
      description:
        "Read compact live draft, applied-preview, diagnostic, and tool capability state. Use this to understand readiness before mutating or capturing; it does not include language reference or source definitions.",
      input: emptyInputSchema,
      handler: () =>
        appStateFromController(controller, {
          captureAvailable: Boolean(capturePortRef),
          captureReady: capturePortRef?.current?.isReady?.() ?? false,
        }),
    }),
    defineTool({
      name: "get_documentation",
      description:
        "Read the Shader DSL reference for workflow guidance and language details. Request a topic for focused help or omit it for the overview and topic index.",
      input: documentationInputSchema,
      handler: (input) => getDocumentation(input),
    }),
    defineTool({
      name: "get_sketch",
      description:
        "Read cloned raw main/utils draft sources and editable uniform definitions with the current draft revision. This operation does not mutate the page.",
      input: emptyInputSchema,
      handler: () => controller.read(),
    }),
    defineTool({
      name: "update_sketch",
      description:
        "Atomically update one or more complete main/utils sources or editable uniform definitions using the expected draft revision. Source edits do not compile until the human uses Run.",
      input: authoringUpdateSchema,
      handler: (input) => updateSketch(controller, input),
    }),
    ...(apply
      ? [
          defineTool({
            name: "apply_sketch",
            description:
              "Compile the expected draft, install it in the active preview, and await the renderer's confirmed first frame. Returns structured diagnostics on failure.",
            input: applyInputSchema,
            handler: (input, context) =>
              apply({
                expectedRevision: input.expectedRevision,
                signal: context.signal,
              }),
          }),
        ]
      : []),
    ...(capturePortRef
      ? [
          defineTool({
            name: "capture_preview",
            description:
              'Capture the active applied preview canvas as a model-visible PNG. By default the PNG is downsampled to at most 512 pixels on its longest edge without upscaling; pass maxDimension as an integer from 64 to 2048 for another bound, or "native" for explicit full-resolution capture. The expected applied revision is guarded before and after encoding; this never applies drafts or changes runtime controls.',
            input: captureInputSchema,
            handler: async (input, context) => {
              const port = capturePortRef.current;
              if (!port) {
                return {
                  ok: false as const,
                  error: {
                    code: "not-ready",
                    message: "The preview renderer is not ready for capture.",
                  },
                };
              }
              try {
                const captured = await port.capture({
                  expectedAppliedRevision: input.expectedAppliedRevision,
                  maxDimension: input.maxDimension,
                  signal: context.signal,
                });
                const data = await blobToBase64(captured.blob);
                captured.assertCurrent();
                const draftRevision = controller.read().revision;
                return imageResult({
                  data,
                  mimeType: captured.mimeType,
                  metadata: {
                    kind: "preview-capture",
                    appliedRevision: captured.appliedRevision,
                    draftRevision,
                    draftDiffersFromApplied:
                      draftRevision !== captured.appliedRevision,
                    identity: {
                      appliedRevision: captured.appliedRevision,
                      backend: captured.backend,
                      width: captured.canvasWidth,
                      height: captured.canvasHeight,
                    },
                    backend: captured.backend,
                    width: captured.width,
                    height: captured.height,
                    canvasWidth: captured.canvasWidth,
                    canvasHeight: captured.canvasHeight,
                    uniforms: captured.uniforms,
                  },
                });
              } catch (error) {
                const captureError =
                  error instanceof CapturePreviewError
                    ? error
                    : new CapturePreviewError(
                        "encoding",
                        error instanceof Error ? error.message : String(error),
                      );
                return {
                  ok: false as const,
                  error: {
                    code: captureError.code,
                    message: captureError.message,
                  },
                };
              }
            },
          }),
        ]
      : []),
  ];
}

function updateSketch(
  controller: AuthoringController,
  input: AuthoringUpdateInput,
) {
  const result = controller.update(input);
  if (!result.ok) return result;
  return {
    ok: true as const,
    sketch: result.snapshot,
  };
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}
