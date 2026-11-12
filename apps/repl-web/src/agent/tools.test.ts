import assert from "node:assert/strict";
import test from "node:test";
import { createAuthoringTools } from "./tools.ts";
import type {
  AuthoringController,
  DraftSnapshot,
} from "./controller-types.ts";

function makeController() {
  let snapshot: DraftSnapshot = {
    revision: 4,
    main: "return color;",
    utils: "",
    uniforms: [
      {
        id: "uniform-0",
        name: "gain",
        type: "float",
        value: "0.5",
        min: "0",
        max: "1",
      },
    ],
  };
  const requests: unknown[] = [];
  const controller: AuthoringController = {
    read: () => structuredClone(snapshot),
    update: (request) => {
      requests.push(request);
      if (
        typeof request === "object" &&
        request !== null &&
        "expectedRevision" in request &&
        request.expectedRevision !== snapshot.revision
      ) {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "stale draft revision",
            currentRevision: snapshot.revision,
          },
        };
      }
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        ...(typeof request === "object" && request !== null
          ? request
          : {}),
      } as DraftSnapshot;
      return { ok: true, snapshot: structuredClone(snapshot) };
    },
  };
  return { controller, requests };
}

test("advertises exactly the three Phase 3 authoring tools", () => {
  const { controller } = makeController();
  const tools = createAuthoringTools(controller);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["get_authoring_context", "get_sketch", "update_sketch"],
  );
  assert.equal(tools[0]?.inputSchema.additionalProperties, false);
  assert.equal(tools[1]?.inputSchema.additionalProperties, false);
  assert.equal(tools[2]?.inputSchema.additionalProperties, false);
});

test("read tools clone current draft and update delegates the controller", async () => {
  const { controller, requests } = makeController();
  const tools = createAuthoringTools(controller);
  const context = (await tools[0]!.handler({}, { signal: new AbortController().signal })) as Record<string, unknown>;
  const sketch = (await tools[1]!.handler({}, { signal: new AbortController().signal })) as Record<string, unknown>;
  assert.equal(context.draftRevision, 4);
  assert.equal(sketch.revision, 4);
  assert.equal((sketch.preview as Record<string, unknown>).appliedRevision, null);

  const update = await tools[2]!.handler(
    { expectedRevision: 4, main: "raw invalid text" },
    { signal: new AbortController().signal },
  );
  assert.equal((update as Record<string, unknown>).ok, true);
  assert.deepEqual(requests, [{ expectedRevision: 4, main: "raw invalid text" }]);
});

test("stale update returns a readable conflict with the current revision", async () => {
  const { controller } = makeController();
  const tool = createAuthoringTools(controller)[2]!;
  const result = (await tool.handler(
    { expectedRevision: 3, utils: "new helpers" },
    { signal: new AbortController().signal },
  )) as Record<string, unknown>;
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "conflict",
      message: "stale draft revision",
      currentRevision: 4,
    },
  });
});
