import { describe, expect, it } from "vitest";
import { readResourceMetadata, UniformState } from "../src/uniforms.js";
import { ShdrRuntimeError } from "../src/errors.js";
import type { CompiledFragmentArtifact } from "shdr";

const base: CompiledFragmentArtifact = {
  glsl: "",
  wgsl: "",
  defaults: { glsl: [], wgsl: [] },
};

function withTextures(textures: unknown): CompiledFragmentArtifact {
  return { ...base, resources: { textures } as never };
}

describe("texture artifact metadata", () => {
  it("validates unused resources without loading them", () => {
    const artifact = withTextures([
      {
        name: "photo",
        type: "texture2D",
        url: "/photo.png",
        urlKind: "root-absolute",
      },
    ]);
    expect(readResourceMetadata(artifact, "webgl")).toEqual({
      textures: [
        {
          name: "photo",
          type: "texture2D",
          url: "/photo.png",
          urlKind: "root-absolute",
        },
      ],
    });
  });

  it.each([
    [
      [
        {
          name: "photo",
          type: "texture2D",
          url: "/photo.png",
          urlKind: "https",
        },
      ],
      "url kind",
    ],
    [
      [
        {
          name: "photo",
          type: "texture2D",
          url: "photo.png",
          urlKind: "root-absolute",
        },
      ],
      "url",
    ],
    [
      [
        {
          name: "photo",
          type: "texture2D",
          url: "/photo.png",
          urlKind: "root-absolute",
        },
        {
          name: "photo",
          type: "texture2D",
          url: "/other.png",
          urlKind: "root-absolute",
        },
      ],
      "duplicate",
    ],
    [
      [
        {
          name: "time",
          type: "texture2D",
          url: "/photo.png",
          urlKind: "root-absolute",
        },
      ],
      "reserved",
    ],
  ] as const)("rejects malformed %s metadata", (textures, _label) => {
    expect(() =>
      readResourceMetadata(withTextures(textures), "webgpu"),
    ).toThrow(
      expect.objectContaining<Partial<ShdrRuntimeError>>({ kind: "artifact" }),
    );
  });

  it("validates referenced texture bindings for each backend", () => {
    const artifact = {
      ...withTextures([
        {
          name: "photo",
          type: "texture2D",
          url: "/photo.png",
          urlKind: "root-absolute",
        },
      ]),
      resources: {
        textures: [
          {
            name: "photo",
            type: "texture2D",
            url: "/photo.png",
            urlKind: "root-absolute",
          },
        ],
        referenced: { glsl: ["photo"], wgsl: ["photo"] },
        bindings: {
          glsl: [{ name: "photo", binding: 0 }],
          wgsl: [{ name: "photo", binding: 0 }],
        },
      },
    } satisfies CompiledFragmentArtifact;
    expect(readResourceMetadata(artifact, "webgl")).toEqual({
      textures: artifact.resources.textures,
      referenced: ["photo"],
      bindings: [{ name: "photo", binding: 0 }],
    });
    expect(() =>
      readResourceMetadata(
        {
          ...artifact,
          resources: {
            ...artifact.resources,
            referenced: { glsl: ["missing"], wgsl: ["missing"] },
          },
        },
        "webgl",
      ),
    ).toThrow(
      expect.objectContaining<Partial<ShdrRuntimeError>>({ kind: "artifact" }),
    );
  });

  it("keeps texture names outside numeric uniform updates", () => {
    const state = new UniformState("webgl");
    state.commit(undefined, new Map());
    expect(() => state.set({ photo: 1 })).toThrow(
      expect.objectContaining<Partial<ShdrRuntimeError>>({ kind: "uniform" }),
    );
  });
});
