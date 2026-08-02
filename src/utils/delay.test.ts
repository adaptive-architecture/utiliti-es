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
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toBe("Test error");
    }

    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(40); // Timeout is not really accurate
  });

  it("should reject immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Aborted before start"));

    const start = Date.now();
    await expect(delay(50, undefined, controller.signal)).rejects.toThrow("Aborted before start");
    expect(Date.now() - start).toBeLessThan(40);
  });

  it("should reject when aborted mid-delay and not fire the timeout", async () => {
    const controller = new AbortController();

    const pending = delay(5_000, undefined, controller.signal);
    controller.abort(new Error("Aborted mid-delay"));

    await expect(pending).rejects.toThrow("Aborted mid-delay");
  });

  it("should still reject with the provided error when a signal is present but not aborted", async () => {
    const controller = new AbortController();

    await expect(delay(10, new Error("Test error"), controller.signal)).rejects.toThrow("Test error");

    // Aborting after settlement is a no-op.
    controller.abort();
  });
});
