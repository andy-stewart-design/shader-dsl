import { describe, expect, it, vi } from "vitest";

import type { ResourceSchema } from "../src/uniforms.js";
import {
  loadTextureResources,
  type TextureResourceDependencies,
} from "../src/texture-resources.js";

function schema(referenced: readonly string[]): ResourceSchema {
  return {
    textures: [
      {
        name: "photo",
        type: "texture2D",
        url: "/photo.png",
        urlKind: "root-absolute",
      },
      {
        name: "unused",
        type: "texture2D",
        url: "/unused.png",
        urlKind: "root-absolute",
      },
    ],
    referenced,
  };
}

function image(): ImageBitmap & { readonly close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn() } as unknown as ImageBitmap & {
    readonly close: ReturnType<typeof vi.fn>;
  };
}

function dependencies(
  fetch: TextureResourceDependencies["fetch"],
  decode: TextureResourceDependencies["decode"],
): TextureResourceDependencies {
  return { fetch, decode };
}

describe("texture resource loading", () => {
  it("loads only referenced declarations and closes decoded images", async () => {
    const calls: string[] = [];
    const decoded = image();
    const resources = await loadTextureResources(schema(["photo"]), "webgl", {
      dependencies: dependencies(
        async (input) => {
          calls.push(String(input));
          return new Response(new Blob(["image"]), { status: 200 });
        },
        async () => decoded,
      ),
    });

    expect(calls).toEqual(["/photo.png"]);
    expect([...resources.textures.keys()]).toEqual(["photo"]);
    resources.dispose();
    resources.dispose();
    expect(decoded.close).toHaveBeenCalledTimes(1);
  });

  it("rejects resource fetch and decode failures distinctly", async () => {
    const fetchFailure = await loadTextureResources(
      schema(["photo"]),
      "webgl",
      {
        dependencies: dependencies(
          async () => {
            throw new Error("CORS denied");
          },
          async () => image(),
        ),
      },
    ).catch((error: unknown) => error);
    expect(fetchFailure).toMatchObject({ backend: "webgl", kind: "resource" });
    expect(fetchFailure).toHaveProperty(
      "message",
      expect.stringContaining("fetch"),
    );

    const decodeFailure = await loadTextureResources(
      schema(["photo"]),
      "webgpu",
      {
        dependencies: dependencies(
          async () => new Response(new Blob(["not an image"]), { status: 200 }),
          async () => {
            throw new Error("unsupported image");
          },
        ),
      },
    ).catch((error: unknown) => error);
    expect(decodeFailure).toMatchObject({
      backend: "webgpu",
      kind: "resource",
    });
    expect(decodeFailure).toHaveProperty(
      "message",
      expect.stringContaining("decode"),
    );
  });

  it("checks the backend texture limit before fetching", async () => {
    const fetch = vi.fn<TextureResourceDependencies["fetch"]>();
    await expect(
      loadTextureResources(schema(["photo", "unused"]), "webgpu", {
        maxTextures: 1,
        dependencies: dependencies(fetch, async () => image()),
      }),
    ).rejects.toMatchObject({ backend: "webgpu", kind: "artifact" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts stale decode work and releases the late bitmap", async () => {
    let resolveDecode!: (value: ImageBitmap) => void;
    let resolveDecodeStarted!: () => void;
    const decoded = image();
    const decode = new Promise<ImageBitmap>((resolve) => {
      resolveDecode = resolve;
    });
    const decodeStarted = new Promise<void>((resolve) => {
      resolveDecodeStarted = resolve;
    });
    const controller = new AbortController();
    const loading = loadTextureResources(schema(["photo"]), "webgl", {
      signal: controller.signal,
      dependencies: dependencies(
        async () => new Response(new Blob(["image"]), { status: 200 }),
        async () => {
          resolveDecodeStarted();
          return decode;
        },
      ),
    });
    await decodeStarted;
    controller.abort();
    resolveDecode(decoded);

    await expect(loading).rejects.toMatchObject({
      backend: "webgl",
      kind: "aborted",
    });
    expect(decoded.close).toHaveBeenCalledTimes(1);
  });
});
