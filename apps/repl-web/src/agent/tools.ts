import type { BridgeTool } from "@shdr/agent-bridge/browser";
import type { JsonObject, JsonValue } from "@shdr/agent-bridge/protocol";
import {
  authoringUpdateJsonSchema,
  type AuthoringUpdateInput,
} from "./authoring-schema.ts";
import { createAuthoringContext, sketchFromSnapshot } from "./context.ts";
import type { AuthoringController } from "./controller-types.ts";

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
] as const;

/** Stable, deliberately narrow catalog for Phase 3 authoring. */
export function createAuthoringTools(
  controller: AuthoringController,
): readonly BridgeTool[] {
  return [
    {
      name: "get_authoring_context",
      description:
        "Read the compact REPL language, uniform-definition, explicit-Run, and draft-authoring context. This operation does not mutate the page.",
      inputSchema: emptySchema,
      handler: () => toJson(createAuthoringContext(controller)),
    },
    {
      name: "get_sketch",
      description:
        "Read cloned raw main/utils draft sources, editable uniform definitions, the current draft revision, and honest pre-Phase-4 preview status. This operation does not mutate the page.",
      inputSchema: emptySchema,
      handler: () => toJson(sketchFromSnapshot(controller.read())),
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
}

function updateSketch(
  controller: AuthoringController,
  input: AuthoringUpdateInput,
) {
  const result = controller.update(input);
  if (!result.ok) return result;
  return {
    ok: true as const,
    sketch: sketchFromSnapshot(result.snapshot),
  };
}

function toJson(value: unknown): JsonValue {
  return value as JsonValue;
}
