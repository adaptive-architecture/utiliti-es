import { describe } from "node:test";
import { expect, it } from "vitest";
import { delay } from "./index";

describe("delay", () => {
  it("should delay for 3ms", async () => {
    const start = Date.now();
    await delay(3);
    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(3);
  });

  it("should delay for 3ms but fail", async () => {
    const start = Date.now();
    try {
      await delay(3, new Error("Test error"));
      expect(true, "The delay should have thrown an error.").toBe(false);
    } catch (e) {
      expect(e).not.toBeNull();
      expect(e.message).toBe("Test error");
    }

    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(3);
  });
});
