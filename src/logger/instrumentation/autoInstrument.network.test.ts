// @vitest-environment jsdom

import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../../test/testLoggerFactory";
import { InMemoryReporter, MultipleReporter, XhrReporter, XhrReporterOptions } from "../../index";
import { delay, nextTicks } from "../../utils";
import { Logger, LogLevel } from "../index";
import { autoInstrument } from "./index";

const server = setupServer(http.post("*/logs*", () => new HttpResponse(null, { status: 500 })));

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
        ignoreUrls: ["", /analytics/, "/api/telemetry"],
      });

      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(window.fetch("https://analytics.example.com/track")).rejects.toThrow();
      await expect(window.fetch("/api/telemetry/batch")).rejects.toThrow();
      await nextTicks(2);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(reporter.messages.length).to.equal(0);
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
      xhrReporterOptions.endpoint = "/logs";
      xhrReporterOptions.interval = 10;
      const xhrReporter = new XhrReporter(xhrReporterOptions);

      const logger = new Logger({
        name: "TestLogger",
        minimumLevel: LogLevel.Trace,
        enrichers: [],
        reporter: new MultipleReporter([inMemoryReporter, xhrReporter]),
      });
      restore = autoInstrument(logger, { captureNetworkErrors: true, captureFailedHttpStatus: true });

      // The MSW handler answers "/logs" with HTTP 500, so shipping this message fails.
      // Without the endpoint exclusion this would loop: failed shipping -> new log -> failed shipping -> ...
      logger.error("original failure");
      await delay(150);

      expect(inMemoryReporter.messages.length).to.equal(1);
      expect(inMemoryReporter.messages[0].message).to.equal("original failure");

      restore();
      restore = undefined;

      // Let the reporter drain its queue so no request fires after the test environment is torn down.
      server.use(http.post("*/logs*", () => new HttpResponse(null, { status: 200 })));
      await logger[Symbol.asyncDispose]();
    });
  });
});
