import { describe, expect, it } from "vitest";

import { corePackageName } from "../src/index.js";
import { readShaderFixture } from "./read-shader-fixture.js";

describe("@shdr/core package", () => {
  it("exports its package marker", () => {
    expect(corePackageName).toBe("@shdr/core");
  });

  it("reads shader fixtures as source text", async () => {
    const source = await readShaderFixture("gradient");

    expect(source).toContain("coord.xy / uniforms.resolution");
  });
});
