// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { createTestLogger } from "../../../test/testLoggerFactory";
import { nextTicks } from "../../utils";
import { LogLevel } from "../contracts";
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
});
