import { describe, expect, it } from "vitest";

import { languageServicePackageName } from "../src/index.js";

describe("@shdr/language-service package", () => {
  it("exports its package marker", () => {
    expect(languageServicePackageName).toBe("@shdr/language-service");
  });
});
