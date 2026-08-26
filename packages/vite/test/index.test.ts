import { describe, expect, it } from "vitest";

import { vitePackageName } from "../src/index.js";

describe("@shdr/vite package", () => {
  it("exports its package marker", () => {
    expect(vitePackageName).toBe("@shdr/vite");
  });
});
