import { describe, expect, it } from "vitest";

import { shdrPackageName } from "../src/index.js";

describe("shdr package", () => {
  it("exports its package marker", () => {
    expect(shdrPackageName).toBe("shdr");
  });
});
