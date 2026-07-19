import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../../test/testLoggerFactory";
import type { ILogsReporter } from "../../index";
import { InMemoryReporter, Logger, LogLevel, MultipleReporter } from "../../index";
import { nextTicks } from "../../utils";
import { autoInstrument } from "./index";

type WorkerScope = EventTarget & { fetch?: typeof fetch };

/**
 * Worker global scopes expose ErrorEvent; the plain node test environment does not,
 * so the worker simulation provides this minimal stand-in.
 */
class FakeErrorEvent extends Event {
  public readonly message: string;
  public readonly filename = "worker.js";
  public readonly lineno = 3;
  public readonly colno = 7;
  public readonly error: unknown;

  constructor(message: string, error?: unknown) {
    super("error");
    this.message = message;
    this.error = error;
  }
}

function dispatchRejectionEvent(scope: WorkerScope, reason: unknown): void {
  const event = new Event("unhandledrejection");
  Object.defineProperty(event, "reason", { value: reason });
  scope.dispatchEvent(event);
}

describe("autoInstrument (worker scope)", () => {
  let scope: WorkerScope;
  let restore: (() => void) | undefined;

  beforeEach(() => {
    // Simulate a worker global scope: an EventTarget without window, DOM types or XMLHttpRequest.
    scope = new EventTarget();
    vi.stubGlobal("self", scope);
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.unstubAllGlobals();
  });

  it("should log uncaught errors", async () => {
    vi.stubGlobal("ErrorEvent", FakeErrorEvent);
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    scope.dispatchEvent(new FakeErrorEvent("boom", new Error("boom")));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    const message = reporter.messages[0];
    expect(message.level).to.equal(LogLevel.Error);
    expect(message.message).to.equal("Uncaught error: boom");
    expect(message.errorMessage).to.equal("boom");
    expect(message.extraParams?.filename).to.equal("worker.js");
  });

  it("should ignore plain error events when the DOM types are not available", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    scope.dispatchEvent(new Event("error"));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(0);
  });

  it("should log unhandled promise rejections", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger);

    dispatchRejectionEvent(scope, new Error("nope"));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    expect(reporter.messages[0].message).to.equal("Unhandled promise rejection");
    expect(reporter.messages[0].errorMessage).to.equal("nope");
  });

  it("should capture fetch failures using the scope's own fetch", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    scope.fetch = fetchMock as unknown as typeof fetch;

    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger, { captureNetworkErrors: true });

    expect(scope.fetch).not.to.equal(fetchMock);
    await expect(scope.fetch("https://api.example.com/data")).rejects.toThrow("Failed to fetch");
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    expect(reporter.messages[0].message).to.equal("Network error for https://api.example.com/data");

    restore();
    restore = undefined;
    expect(scope.fetch).to.equal(fetchMock);
  });

  it("should match relative ignore patterns even without a location", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    scope.fetch = fetchMock as unknown as typeof fetch;

    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger, { captureNetworkErrors: true, ignoreUrls: ["/relative"] });

    await expect(scope.fetch("/relative/resource")).rejects.toThrow();
    await nextTicks(2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reporter.messages.length).to.equal(0);
  });

  it("should exclude the logger's reporter endpoints from capture", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    scope.fetch = fetchMock as unknown as typeof fetch;

    const inMemoryReporter = new InMemoryReporter();
    const shippingReporter: ILogsReporter = {
      register: () => {},
      endpoints: ["https://logs.example.com/ingest"],
      [Symbol.asyncDispose]: () => Promise.resolve(),
    };
    const logger = new Logger({
      name: "WorkerLogger",
      minimumLevel: LogLevel.Trace,
      enrichers: [],
      reporter: new MultipleReporter([inMemoryReporter, shippingReporter]),
    });
    restore = autoInstrument(logger, { captureNetworkErrors: true });

    await expect(scope.fetch("https://logs.example.com/ingest")).rejects.toThrow();
    await expect(scope.fetch("https://api.example.com/data")).rejects.toThrow();
    await nextTicks(2);

    expect(inMemoryReporter.messages.length).to.equal(1);
    expect(inMemoryReporter.messages[0].message).to.equal("Network error for https://api.example.com/data");
  });

  it("should tolerate scopes without fetch or XMLHttpRequest, like service workers without XHR", async () => {
    const { logger, reporter } = createTestLogger();
    restore = autoInstrument(logger, { captureNetworkErrors: true });

    dispatchRejectionEvent(scope, new Error("still works"));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(1);
    expect(reporter.messages[0].errorMessage).to.equal("still works");
  });

  it("should be a no-op when the scope does not support event listeners", () => {
    // Simulates SSR setups that shim `globalThis.self = globalThis` without an EventTarget global.
    vi.stubGlobal("self", {});
    const { logger, reporter } = createTestLogger();

    const restoreNow = autoInstrument(logger);

    expect(() => restoreNow()).not.to.throw();
    expect(reporter.messages.length).to.equal(0);
  });

  it("should stop logging after restore is called", async () => {
    vi.stubGlobal("ErrorEvent", FakeErrorEvent);
    const { logger, reporter } = createTestLogger();
    const restoreNow = autoInstrument(logger);
    restoreNow();

    scope.dispatchEvent(new FakeErrorEvent("boom"));
    dispatchRejectionEvent(scope, new Error("nope"));
    await nextTicks(2);

    expect(reporter.messages.length).to.equal(0);
  });
});
