import { describe, expect, it } from "vitest";
import { AgentBridgeProvider, useAgentBridge } from "../src/react.js";

describe("React entrypoint", () => {
  it("is safe to import during SSR", () => {
    expect(typeof AgentBridgeProvider).toBe("function");
    expect(typeof useAgentBridge).toBe("function");
    expect(typeof window).toBe("undefined");
  });
});
