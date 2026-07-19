// @vitest-environment jsdom

import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogReporterHandlers } from "../../../test/mocks/logReporterHandlers";
import { createTestLogger } from "../../../test/testLoggerFactory";
import { type ILogsReporter, InMemoryReporter, MultipleReporter, XhrReporter, XhrReporterOptions } from "../../index";
import { delay, nextTicks } from "../../utils";
import { Logger, LogLevel } from "../index";
import { autoInstrument } from "./index";
import { type GlobalScope, instrumentFetch, instrumentXhr } from "./networkCapture";

const server = setupServer(...getLogReporterHandlers());

/**
 * MSW replaces the global XMLHttpRequest with its own proxy, which bypasses prototype
 * patching, so the XHR unit tests run against this deterministic stand-in instead and
 * simulate outcomes by dispatching the corresponding events.
 */
class FakeXMLHttpRequest extends EventTarget {
  public status = 0;
  public open(_method: string, _url: string | URL): void {
    /* no-op */
  }
  public send(_body?: unknown): void {
    /* no-op */
  }
}

describe("autoInstrument network capture", () => {
  let restore: (() => void) | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch;

  beforeAll(() => {
    server.listen();
  });

  beforeEach(() => {
    originalFetch = window.fetch;
    fetchMock = vi.fn();
    window.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.unstubAllGlobals();
    window.fetch = originalFetch;
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  describe("fetch", () => {
    it("should log network-level failures", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch("https://api.example.com/data")).rejects.toThrow("Failed to fetch");
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      const message = reporter.messages[0];
      expect(message.level).to.equal(LogLevel.Error);
      expect(message.message).to.equal("Network error for https://api.example.com/data");
      expect(message.errorMessage).to.equal("Failed to fetch");
      expect(message.extraParams?.source).to.equal("fetch");
      expect(message.extraParams?.url).to.equal("https://api.example.com/data");
    });

    it("should log failed HTTP statuses when enabled", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true, captureFailedHttpStatus: true });

      fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
      await window.fetch("/api/data");
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      expect(reporter.messages[0].level).to.equal(LogLevel.Warning);
      expect(reporter.messages[0].message).to.equal("HTTP 503 for /api/data");
    });

    it("should not log failed HTTP statuses by default", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
      await window.fetch("/api/data");
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(0);
    });

    it("should not log opaque responses (status 0) as failed statuses", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true, captureFailedHttpStatus: true });

      fetchMock.mockResolvedValue({ ok: false, status: 0 } as Response);
      await window.fetch("https://cdn.example.com/pixel");
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(0);
    });

    it("should not log successful responses", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true, captureFailedHttpStatus: true });

      fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);
      const response = await window.fetch("/api/data");
      await nextTicks(2);

      expect(response.status).to.equal(200);
      expect(reporter.messages.length).to.equal(0);
    });

    it("should skip URLs matching the ignore list", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, {
        captureNetworkErrors: true,
        ignoreUrls: ["", /analytics/, "/api/telemetry", "/cdn/"],
      });

      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch("https://analytics.example.com/track")).rejects.toThrow();
      await expect(window.fetch("/api/telemetry")).rejects.toThrow();
      await expect(window.fetch("/api/telemetry/batch")).rejects.toThrow();
      await expect(window.fetch("/api/telemetry?flush=1")).rejects.toThrow();
      await expect(window.fetch("/cdn/asset.js")).rejects.toThrow();
      await nextTicks(2);

      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(reporter.messages.length).to.equal(0);
    });

    it("should not skip URLs that merely share an ignored prefix without a path boundary", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true, ignoreUrls: ["/api/telemetry"] });

      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch("/api/telemetry-export/data")).rejects.toThrow();
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      expect(reporter.messages[0].message).to.equal("Network error for /api/telemetry-export/data");
    });

    it("should extract the URL from Request instances", async () => {
      class FakeRequest {
        public readonly url = "https://api.example.com/from-request";
      }
      vi.stubGlobal("Request", FakeRequest);

      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch(new FakeRequest() as unknown as Request)).rejects.toThrow();
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      expect(reporter.messages[0].message).to.equal("Network error for https://api.example.com/from-request");
    });

    it("should stringify the input when the Request global is not available", async () => {
      vi.stubGlobal("Request", undefined);

      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch(new URL("https://api.example.com/from-url"))).rejects.toThrow();
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      expect(reporter.messages[0].message).to.equal("Network error for https://api.example.com/from-url");
    });

    it("should capture requests whose URL cannot be parsed", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true, ignoreUrls: ["/api/telemetry"] });

      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch("http://")).rejects.toThrow();
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      expect(reporter.messages[0].message).to.equal("Network error for http://");
    });

    it("should not wrap fetch twice", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });
      const restoreSecond = autoInstrument(logger, { captureNetworkErrors: true });

      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch("/api/data")).rejects.toThrow();
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);

      restoreSecond();
      restore();
      restore = undefined;
      expect(window.fetch).to.equal(fetchMock);
    });

    it("should not restore fetch if another tool wrapped it afterwards", () => {
      const { logger } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      const foreignFetch = vi.fn() as unknown as typeof fetch;
      window.fetch = foreignFetch;

      restore();
      restore = undefined;
      expect(window.fetch).to.equal(foreignFetch);
    });

    it("should do nothing when fetch is not available", () => {
      (window as { fetch?: typeof fetch }).fetch = undefined;

      const { logger } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });
      restore();
      restore = undefined;

      expect(window.fetch).to.equal(undefined);
    });
  });

  describe("XMLHttpRequest", () => {
    beforeEach(() => {
      vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    });

    function sendXhr(url: string): FakeXMLHttpRequest {
      const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
      xhr.open("GET", url);
      xhr.send();
      return xhr;
    }

    it("should log network-level failures", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      sendXhr("/api/data").dispatchEvent(new Event("error"));
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      const message = reporter.messages[0];
      expect(message.level).to.equal(LogLevel.Error);
      expect(message.message).to.equal("Network error for /api/data");
      expect(message.extraParams?.source).to.equal("xhr");
      expect(message.extraParams?.url).to.equal("/api/data");
    });

    it("should log timeouts", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      sendXhr("/api/data").dispatchEvent(new Event("timeout"));
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      expect(reporter.messages[0].level).to.equal(LogLevel.Error);
      expect(reporter.messages[0].message).to.equal("Network timeout for /api/data");
    });

    it("should log failed HTTP statuses when enabled", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true, captureFailedHttpStatus: true });

      const failed = sendXhr("/api/data");
      failed.status = 500;
      failed.dispatchEvent(new Event("load"));

      const succeeded = sendXhr("/api/data");
      succeeded.status = 200;
      succeeded.dispatchEvent(new Event("load"));
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      expect(reporter.messages[0].level).to.equal(LogLevel.Warning);
      expect(reporter.messages[0].message).to.equal("HTTP 500 for /api/data");
    });

    it("should not log failed HTTP statuses by default", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      const xhr = sendXhr("/api/data");
      xhr.status = 500;
      xhr.dispatchEvent(new Event("load"));
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(0);
    });

    it("should skip URLs matching the ignore list", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true, ignoreUrls: [/ignored/] });

      sendXhr("/ignored/resource").dispatchEvent(new Event("error"));
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(0);
    });

    it("should leave requests opened before instrumentation untouched", async () => {
      const { logger, reporter } = createTestLogger();

      const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
      xhr.open("GET", "/api/data");
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      xhr.send();
      xhr.dispatchEvent(new Event("error"));
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(0);
    });

    it("should not wrap XMLHttpRequest twice", async () => {
      const originalOpen = FakeXMLHttpRequest.prototype.open;

      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });
      const restoreSecond = autoInstrument(logger, { captureNetworkErrors: true });

      sendXhr("/api/data").dispatchEvent(new Event("error"));
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);

      restoreSecond();
      restore();
      restore = undefined;
      expect(FakeXMLHttpRequest.prototype.open).to.equal(originalOpen);
    });

    it("should log once with the current URL when an XHR instance is reused", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      const xhr = sendXhr("/first");
      xhr.open("GET", "/second");
      xhr.send();
      xhr.dispatchEvent(new Event("error"));
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(1);
      expect(reporter.messages[0].message).to.equal("Network error for /second");
    });

    it("should not log from previously instrumented XHR instances after restore", async () => {
      const { logger, reporter } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      const xhr = sendXhr("/api/data");
      restore();
      restore = undefined;

      xhr.dispatchEvent(new Event("error"));
      await nextTicks(2);

      expect(reporter.messages.length).to.equal(0);
    });

    it("should not restore a foreign send-only wrapper", () => {
      const { logger } = createTestLogger();
      const originalOpen = FakeXMLHttpRequest.prototype.open;
      const originalSend = FakeXMLHttpRequest.prototype.send;
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      const foreignSend = function (this: FakeXMLHttpRequest): void {
        /* no-op */
      } as unknown as FakeXMLHttpRequest["send"];
      FakeXMLHttpRequest.prototype.send = foreignSend;

      restore();
      restore = undefined;
      expect(FakeXMLHttpRequest.prototype.open).to.equal(originalOpen);
      expect(FakeXMLHttpRequest.prototype.send).to.equal(foreignSend);

      FakeXMLHttpRequest.prototype.send = originalSend;
    });

    it("should not restore XMLHttpRequest if another tool wrapped it afterwards", () => {
      const { logger } = createTestLogger();
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      const foreignOpen = function (this: FakeXMLHttpRequest): void {
        /* no-op */
      } as unknown as FakeXMLHttpRequest["open"];
      FakeXMLHttpRequest.prototype.open = foreignOpen;

      restore();
      restore = undefined;
      expect(FakeXMLHttpRequest.prototype.open).to.equal(foreignOpen);
    });
  });

  describe("reporter endpoint exclusion", () => {
    it("should not capture the failing requests of the logger's own XhrReporter", async () => {
      const inMemoryReporter = new InMemoryReporter();
      const xhrReporterOptions = new XhrReporterOptions();
      xhrReporterOptions.endpoint = "/logs?responseCode=500";
      xhrReporterOptions.interval = 10;
      const xhrReporter = new XhrReporter(xhrReporterOptions);

      const logger = new Logger({
        name: "TestLogger",
        minimumLevel: LogLevel.Trace,
        enrichers: [],
        reporter: new MultipleReporter([inMemoryReporter, xhrReporter]),
      });
      restore = autoInstrument(logger, { captureNetworkErrors: true, captureFailedHttpStatus: true });

      // The shared MSW handler answers "/logs?responseCode=500" with HTTP 500, so shipping fails.
      // Without the endpoint exclusion this would loop: failed shipping -> new log -> failed shipping -> ...
      logger.error("original failure");
      await delay(150);

      // A failing fetch to the reporter endpoint must be excluded as well.
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch("/logs?responseCode=500")).rejects.toThrow();
      await nextTicks(2);

      expect(inMemoryReporter.messages.length).to.equal(1);
      expect(inMemoryReporter.messages[0].message).to.equal("original failure");

      restore();
      restore = undefined;

      // Let the reporter drain its queue so no request fires after the test environment is torn down.
      server.use(http.post("*/logs*", () => new HttpResponse(null, { status: 200 })));
      await logger[Symbol.asyncDispose]();
    });

    it("should exclude endpoints configured after instrumentation", async () => {
      const endpoints: string[] = [""];
      const inMemoryReporter = new InMemoryReporter();
      const shippingReporter: ILogsReporter = {
        register: () => {},
        endpoints,
        [Symbol.asyncDispose]: () => Promise.resolve(),
      };
      const logger = new Logger({
        name: "TestLogger",
        minimumLevel: LogLevel.Trace,
        enrichers: [],
        reporter: new MultipleReporter([inMemoryReporter, shippingReporter]),
      });
      restore = autoInstrument(logger, { captureNetworkErrors: true });

      // Simulates async configuration: the endpoint becomes known only after instrumentation.
      endpoints.push("/late-endpoint");
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch("/late-endpoint")).rejects.toThrow();
      await nextTicks(2);

      expect(inMemoryReporter.messages.length).to.equal(0);
    });
  });

  describe("idempotence across library copies", () => {
    // A second bundled copy of the library shares the Symbol.for marker but not module state,
    // so the wrappers themselves must refuse to re-wrap; exercised by calling them directly.
    it("should not re-wrap an already instrumented fetch or XMLHttpRequest", () => {
      class LocalXhr extends EventTarget {
        public status = 0;
        public open(_method: string, _url: string | URL): void {
          /* no-op */
        }
        public send(_body?: unknown): void {
          /* no-op */
        }
      }
      const originalFetch = vi.fn() as unknown as typeof fetch;
      const scope = { fetch: originalFetch, XMLHttpRequest: LocalXhr } as unknown as GlobalScope;
      const isIgnored = () => false;
      const noopLog = () => {};
      const originalOpen = LocalXhr.prototype.open;

      const restoreFetch = instrumentFetch(scope, noopLog, isIgnored, false);
      const restoreFetchSecond = instrumentFetch(scope, noopLog, isIgnored, false);
      const wrappedFetch = scope.fetch;
      restoreFetchSecond();
      expect(scope.fetch).to.equal(wrappedFetch);
      restoreFetch();
      expect(scope.fetch).to.equal(originalFetch);

      const restoreXhr = instrumentXhr(scope, noopLog, isIgnored, false);
      const restoreXhrSecond = instrumentXhr(scope, noopLog, isIgnored, false);
      const wrappedOpen = LocalXhr.prototype.open;
      restoreXhrSecond();
      expect(LocalXhr.prototype.open).to.equal(wrappedOpen);
      restoreXhr();
      expect(LocalXhr.prototype.open).to.equal(originalOpen);
    });
  });
});
