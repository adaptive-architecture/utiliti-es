// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { createTestLogger } from "../../../test/testLoggerFactory";
import { delay, nextTicks } from "../../utils";
import { type ILogger, LogLevel } from "../contracts";
import { autoInstrument } from "./index";

function dispatchRejectionEvent(reason: unknown): void {
  const event = new Event("unhandledrejection") as PromiseRejectionEvent;
  Object.defineProperty(event, "reason", { value: reason });
  window.dispatchEvent(event);
}

function dispatchResourceError(element: HTMLElement): void {
  document.body.appendChild(element);
  element.dispatchEvent(new Event("error"));
  element.remove();
}

describe("autoInstrument", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("should log uncaught errors", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "boom",
        error: new Error("boom"),
        filename: "app.js",
        lineno: 12,
        colno: 34,
      }),
    );
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    const message = reporter.messages[0];
    expect(message.level).to.equal(LogLevel.Error);
    expect(message.message).to.equal("Uncaught error: boom");
    expect(message.errorMessage).to.equal("boom");
    expect(message.stackTrace).not.to.equal(undefined);
    expect(message.extraParams?.source).to.equal("window.onerror");
    expect(message.extraParams?.filename).to.equal("app.js");
    expect(message.extraParams?.lineno).to.equal(12);
    expect(message.extraParams?.colno).to.equal(34);
  });

  it("should log resource load failures using the 'src' attribute", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    const img = document.createElement("img");
    img.src = "https://example.com/missing.png";
    dispatchResourceError(img);
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    const message = reporter.messages[0];
    expect(message.level).to.equal(LogLevel.Error);
    expect(message.message).to.equal("Resource failed to load: <img>");
    expect(message.extraParams?.source).to.equal("resource");
    expect(message.extraParams?.url).to.equal("https://example.com/missing.png");
  });

  it("should log resource load failures using the 'href' attribute", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    const link = document.createElement("link");
    link.href = "https://example.com/missing.css";
    dispatchResourceError(link);
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    expect(reporter.messages[0].message).to.equal("Resource failed to load: <link>");
    expect(reporter.messages[0].extraParams?.url).to.equal("https://example.com/missing.css");
  });

  it("should log resource load failures without a URL", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    dispatchResourceError(document.createElement("div"));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    expect(reporter.messages[0].message).to.equal("Resource failed to load: <div>");
    expect(reporter.messages[0].extraParams?.url).to.equal(null);
  });

  it("should not log resource load failures when disabled", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger, { captureResourceErrors: false });

    const img = document.createElement("img");
    dispatchResourceError(img);
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(0);
  });

  it("should ignore error events without an element target", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    window.dispatchEvent(new Event("error"));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(0);
  });

  it("should log unhandled promise rejections", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    dispatchRejectionEvent(new Error("nope"));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    const message = reporter.messages[0];
    expect(message.level).to.equal(LogLevel.Error);
    expect(message.message).to.equal("Unhandled promise rejection");
    expect(message.errorMessage).to.equal("nope");
    expect(message.extraParams?.source).to.equal("unhandledrejection");
  });

  it("should log unhandled promise rejections with non-Error reasons", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    dispatchRejectionEvent("plain string reason");
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    expect(reporter.messages[0].errorMessage).to.equal("plain string reason");
  });

  it("should not log unhandled promise rejections when disabled", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger, { captureUnhandledRejections: false });

    dispatchRejectionEvent(new Error("nope"));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(0);
  });

  it("should stop logging after restore is called", async () => {
    const { logger, reporter } = createTestLogger();
    const restoreNow = autoInstrument(logger);
    restoreNow();

    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    dispatchRejectionEvent(new Error("nope"));
    const img = document.createElement("img");
    dispatchResourceError(img);
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(0);
  });

  it("should be idempotent per scope while instrumentation is active", async () => {
    const { logger, reporter } = createTestLogger();
    const restoreFirst = autoInstrument(logger);
    const restoreSecond = autoInstrument(logger);

    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    await nextTicks(2);
    expect(reporter.messages.length).to.equal(1);

    restoreSecond(); // no-op: the first instrumentation stays active
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    await nextTicks(2);
    expect(reporter.messages.length).to.equal(2);

    restoreFirst();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    await nextTicks(2);
    expect(reporter.messages.length).to.equal(2);

    restore = autoInstrument(logger); // re-instrumenting after restore works
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    await nextTicks(2);
    expect(reporter.messages.length).to.equal(3);
  });

  it("should apply defaults when options are passed explicitly as undefined", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger, {
      captureUnhandledRejections: undefined,
      captureResourceErrors: undefined,
      captureNetworkErrors: true,
      captureFailedHttpStatus: undefined,
      ignoreUrls: undefined,
    });

    dispatchRejectionEvent(new Error("still captured"));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    expect(reporter.messages[0].errorMessage).to.equal("still captured");
  });

  it("should not throw when the logger itself throws", () => {
    const throwingLogger = {
      log: () => {
        throw new Error("broken logger");
      },
    } as unknown as ILogger;
    restore = autoInstrument(throwingLogger);

    expect(() => {
      window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    }).not.to.throw();
  });

  it("should truncate very long resource URLs", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    const img = document.createElement("img");
    img.src = `data:image/png;base64,${"A".repeat(5_000)}`;
    dispatchResourceError(img);
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    expect((reporter.messages[0].extraParams?.url as string).length).to.equal(2_048);
  });

  it("should support disposal via Symbol.dispose", async () => {
    const { logger, reporter } = createTestLogger();
    const restoreNow = autoInstrument(logger);

    restoreNow[Symbol.dispose]();

    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(0);
  });

  describe("rate limiting", () => {
    it("should cap captured events per window and log a single warning", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { maxEventsPerWindow: 3 });

      for (let ix = 0; ix < 10; ix++) {
        window.dispatchEvent(new ErrorEvent("error", { message: `boom ${ix}` }));
      }
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(4);
      expect(reporter.messages[0].message).to.equal("Uncaught error: boom 0");
      expect(reporter.messages[2].message).to.equal("Uncaught error: boom 2");
      expect(reporter.messages[3].level).to.equal(LogLevel.Warning);
      expect(reporter.messages[3].message).to.contain("rate limit exceeded");
      expect(reporter.messages[3].extraParams?.source).to.equal("autoInstrument");
    });

    it("should resume capturing when the window rolls over", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { maxEventsPerWindow: 1, rateLimitWindowMs: 50 });

      window.dispatchEvent(new ErrorEvent("error", { message: "first window" }));
      window.dispatchEvent(new ErrorEvent("error", { message: "dropped" }));
      await delay(60);
      window.dispatchEvent(new ErrorEvent("error", { message: "second window" }));
      await nextTicks(2);

      const texts = reporter.messages.map((m) => m.message);
      expect(texts[0]).to.equal("Uncaught error: first window");
      expect(texts[1]).to.contain("rate limit exceeded");
      expect(texts[2]).to.equal("Uncaught error: second window");
      expect(reporter.messages.length).to.equal(3);
    });

    it("should disable rate limiting when maxEventsPerWindow is Infinity", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { maxEventsPerWindow: Number.POSITIVE_INFINITY });

      for (let ix = 0; ix < 200; ix++) {
        window.dispatchEvent(new ErrorEvent("error", { message: `boom ${ix}` }));
      }
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(200);
    });
  });
});
