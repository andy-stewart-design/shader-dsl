import type { RendererBackend } from "./errors.js";
import { ShdrRuntimeError } from "./errors.js";
import type { ResourceSchema } from "./uniforms.js";

export interface TextureResourceDependencies {
  readonly fetch: typeof fetch;
  readonly decode: (
    blob: Blob,
    options?: ImageBitmapOptions,
  ) => Promise<ImageBitmap>;
}

export interface TextureResourceLoadOptions {
  readonly signal?: AbortSignal;
  readonly maxTextures?: number;
  readonly dependencies?: TextureResourceDependencies;
}

export interface LoadedTexture {
  readonly name: string;
  readonly url: string;
  readonly image: ImageBitmap;
}

export interface LoadedTextureResources {
  readonly textures: ReadonlyMap<string, LoadedTexture>;
  dispose(): void;
}

const browserDependencies: TextureResourceDependencies = {
  fetch: (...args) => globalThis.fetch(...args),
  decode: (blob, options) => globalThis.createImageBitmap(blob, options ?? {}),
};

function checkAborted(
  signal: AbortSignal | undefined,
  backend: RendererBackend,
): void {
  if (signal?.aborted)
    throw new ShdrRuntimeError(
      backend,
      "aborted",
      "Texture resource loading was aborted.",
    );
}

function resourceFailure(
  backend: RendererBackend,
  name: string,
  url: string,
  phase: "fetch" | "decode",
  error: unknown,
): ShdrRuntimeError {
  const detail = error instanceof Error ? error.message : String(error);
  return new ShdrRuntimeError(
    backend,
    "resource",
    `Texture ${phase} failed for ${JSON.stringify(name)} at ${JSON.stringify(url)}: ${detail}`,
    { cause: error },
  );
}

function close(image: ImageBitmap): void {
  try {
    image.close();
  } catch {
    /* A decoder may have already released the image. */
  }
}

class TextureResources implements LoadedTextureResources {
  readonly textures: ReadonlyMap<string, LoadedTexture>;
  #disposed = false;

  constructor(textures: ReadonlyMap<string, LoadedTexture>) {
    this.textures = textures;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const texture of this.textures.values()) close(texture.image);
  }
}

/**
 * Load only active artifact textures. GPU ownership is deliberately separate;
 * the returned decoded images are candidate-local and must be disposed by the
 * renderer whether installation succeeds, fails, or is superseded.
 */
export async function loadTextureResources(
  schema: ResourceSchema | undefined,
  backend: RendererBackend,
  options: TextureResourceLoadOptions = {},
): Promise<LoadedTextureResources> {
  const referenced = schema?.referenced ?? [];
  const maxTextures = options.maxTextures;
  if (
    maxTextures !== undefined &&
    (referenced.length > maxTextures ||
      schema?.bindings?.some(({ binding }) => binding >= maxTextures))
  )
    throw new ShdrRuntimeError(
      backend,
      "artifact",
      `Texture resources exceed the ${backend} binding limit of ${options.maxTextures}.`,
    );

  const declarations = new Map(
    (schema?.textures ?? []).map((texture) => [texture.name, texture] as const),
  );
  const dependencies = options.dependencies ?? browserDependencies;
  const loaded = new Map<string, LoadedTexture>();
  try {
    for (const name of referenced) {
      const declaration = declarations.get(name);
      if (!declaration)
        throw new ShdrRuntimeError(
          backend,
          "artifact",
          `Texture resource ${JSON.stringify(name)} is not declared.`,
        );
      checkAborted(options.signal, backend);
      let response: Response;
      try {
        response = await dependencies.fetch(declaration.url, {
          mode: "cors",
          signal: options.signal,
        });
      } catch (error) {
        checkAborted(options.signal, backend);
        throw resourceFailure(backend, name, declaration.url, "fetch", error);
      }
      checkAborted(options.signal, backend);
      if (!response.ok)
        throw resourceFailure(
          backend,
          name,
          declaration.url,
          "fetch",
          new Error(`HTTP ${response.status} ${response.statusText}`.trim()),
        );
      let blob: Blob;
      try {
        blob = await response.blob();
      } catch (error) {
        throw resourceFailure(backend, name, declaration.url, "fetch", error);
      }
      checkAborted(options.signal, backend);
      let image: ImageBitmap;
      try {
        image = await dependencies.decode(blob, {
          colorSpaceConversion: "none",
          premultiplyAlpha: "none",
        });
      } catch (error) {
        checkAborted(options.signal, backend);
        throw resourceFailure(backend, name, declaration.url, "decode", error);
      }
      try {
        checkAborted(options.signal, backend);
      } catch (error) {
        close(image);
        throw error;
      }
      loaded.set(name, { name, url: declaration.url, image });
    }
    return new TextureResources(loaded);
  } catch (error) {
    for (const texture of loaded.values()) close(texture.image);
    throw error;
  }
}
