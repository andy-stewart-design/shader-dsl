import { imageResult, type BridgeTool } from "@shdr/agent-bridge/browser";
import type { JsonObject, JsonValue } from "@shdr/agent-bridge/protocol";
import {
  authoringUpdateJsonSchema,
  type AuthoringUpdateInput,
} from "./authoring-schema.ts";
import { createAuthoringContext, sketchFromSnapshot } from "./context.ts";
import type { AuthoringController } from "./controller-types.ts";
import {
  CapturePreviewError,
  type CapturePreviewPort,
} from "./snapshot.ts";

const emptySchema: JsonObject = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

const updateSchema: JsonObject = {
  ...authoringUpdateJsonSchema,
  anyOf: [
    { required: ["main"] },
    { required: ["utils"] },
    { required: ["uniforms"] },
  ],
} as unknown as JsonObject;

export const AUTHORING_TOOL_NAMES = [
  "get_authoring_context",
  "get_sketch",
  "update_sketch",
  "apply_sketch",
  "capture_preview",
] as const;

/** Stable, deliberately narrow authoring catalog; Apply is conditional on a real controller. */
export function createAuthoringTools(
  controller: AuthoringController,
  capturePortRef?: { current: CapturePreviewPort | null },
): readonly BridgeTool[] {
  const tools: BridgeTool[] = [
    {
      name: "get_authoring_context",
      description:
        "Read the compact REPL language, uniform-definition, explicit-Run, and draft-authoring context. This operation does not mutate the page.",
      inputSchema: emptySchema,
      handler: () => toJson(createAuthoringContext(controller, Boolean(capturePortRef))),
    },
    {
      name: "get_sketch",
      description:
        "Read cloned raw main/utils draft sources, editable uniform definitions, the current draft revision, and correlated applied/diagnostic status. This operation does not mutate the page.",
      inputSchema: emptySchema,
      handler: () =>
        toJson(sketchFromSnapshot(controller.read(), controller.getApplyState?.())),
    },
    {
      name: "update_sketch",
      description:
        "Atomically update one or more complete main/utils sources or editable uniform definitions using the expected draft revision. Source edits do not compile until the human uses Run.",
      inputSchema: updateSchema,
      handler: (input) =>
        toJson(
          updateSketch(controller, input as AuthoringUpdateInput),
        ),
    },
  ];
  if (controller.apply) {
    tools.push({
      name: "apply_sketch",
      description:
        "Compile the expected draft, install it in the active preview, and await the renderer's confirmed first frame. Returns structured diagnostics on failure.",
      inputSchema: {
        type: "object",
        properties: { expectedRevision: { type: "integer", minimum: 0 } },
        required: ["expectedRevision"],
        additionalProperties: false,
      },
      handler: async (input, context) => {
        const expectedRevision = (input as { expectedRevision?: unknown }).expectedRevision;
        if (typeof expectedRevision !== "number") {
          return toJson({ ok: false, error: { code: "stale", message: "expectedRevision is required." }, diagnostics: [] });
        }
        return toJson(await controller.apply!({ expectedRevision, signal: context.signal }));
      },
    });
  }
  if (capturePortRef) {
    tools.push({
      name: "capture_preview",
      description:
        "Capture the active applied preview canvas as a model-visible PNG. The expected applied revision is guarded before and after encoding; this never applies drafts or changes runtime controls.",
      inputSchema: {
        type: "object",
        properties: { expectedAppliedRevision: { type: "integer", minimum: 0 } },
        required: ["expectedAppliedRevision"],
        additionalProperties: false,
      },
      handler: async (input, context) => {
        const expectedAppliedRevision = (input as { expectedAppliedRevision?: unknown }).expectedAppliedRevision;
        if (typeof expectedAppliedRevision !== "number") {
          return toJson({
            ok: false,
            error: { code: "identity-mismatch", message: "expectedAppliedRevision is required." },
          });
        }
        const port = capturePortRef.current;
        if (!port) {
          return toJson({
            ok: false,
            error: { code: "not-ready", message: "The preview renderer is not ready for capture." },
          });
        }
        try {
          const captured = await port.capture({
            expectedAppliedRevision,
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
              draftDiffersFromApplied: draftRevision !== captured.appliedRevision,
              identity: {
                appliedRevision: captured.appliedRevision,
                backend: captured.backend,
                width: captured.width,
                height: captured.height,
              },
              backend: captured.backend,
              width: captured.width,
              height: captured.height,
              uniforms: captured.uniforms,
            },
          });
        } catch (error) {
          const captureError = error instanceof CapturePreviewError
            ? error
            : new CapturePreviewError(
                "encoding",
                error instanceof Error ? error.message : String(error),
              );
          return toJson({
            ok: false,
            error: { code: captureError.code, message: captureError.message },
          });
        }
      },
    });
  }
  return tools;
}

function updateSketch(
  controller: AuthoringController,
  input: AuthoringUpdateInput,
) {
  const result = controller.update(input);
  if (!result.ok) return result;
  return {
    ok: true as const,
    sketch: sketchFromSnapshot(result.snapshot, controller.getApplyState?.()),
  };
}

function toJson(value: unknown): JsonValue {
  return value as JsonValue;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
