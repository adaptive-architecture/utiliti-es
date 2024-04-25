import { describe, expect, it } from "vitest";
import { delay } from "./index";

describe("delay", () => {
  it("should delay for 50ms", async () => {
    const start = Date.now();
    await delay(50);
    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(40); // Timeout is not really accurate
  });

  it("should delay for 50ms but fail", async () => {
    const start = Date.now();
    try {
      await delay(50, new Error("Test error"));
      expect(true, "The delay should have thrown an error.").toBe(false);
    } catch (e) {
      expect(e).not.toBeNull();
      expect(e.message).toBe("Test error");
    }

    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(40); // Timeout is not really accurate
  });
});
