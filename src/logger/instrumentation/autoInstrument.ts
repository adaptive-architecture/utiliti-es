import { type ILogger, LogLevel } from "../contracts";
import { createUrlMatcher, type GlobalScope, instrumentFetch, instrumentXhr, type LogFn } from "./networkCapture";

/**
 * Options for {@link autoInstrument}.
 */
export interface AutoInstrumentOptions {
  /**
   * Capture unhandled promise rejections ("unhandledrejection" events).
   *
   * @default true
   */
  captureUnhandledRejections?: boolean;
  /**
   * Capture resource load failures (`<img>`, `<script>`, `<link>`, ...).
   *
   * @default true
   */
  captureResourceErrors?: boolean;
  /**
   * Capture network-level failures of `fetch` and `XMLHttpRequest` requests by wrapping them.
   * The endpoints of the logger's own reporters (see `ILogsReporter.endpoints`) are excluded
   * automatically — read at request time, so endpoints configured after instrumentation are
   * still respected — preventing a failing log-shipping request from triggering further logs.
   * Note: this requires the logger to expose its reporter via `ILogger.reporter` (the `Logger`
   * class does); for custom `ILogger` implementations that do not, add the shipping endpoint
   * to `ignoreUrls` yourself.
   *
   * @default false
   */
  captureNetworkErrors?: boolean;
  /**
   * Also report responses with a failed HTTP status (400 or above) as warnings.
   * Opaque responses (`no-cors`, manual redirects; status 0) are not reported.
   * Only applies when `captureNetworkErrors` is enabled.
   *
   * @default false
   */
  captureFailedHttpStatus?: boolean;
  /**
   * URLs excluded from network capture, in addition to the reporter endpoints.
   * Strings are resolved against the current page URL and matched as path-boundary-aware
   * prefixes (`/logs` matches `/logs/batch` and `/logs?x=1`, but not `/logs-export`);
   * regular expressions are tested against the fully resolved request URL.
   *
   * @default []
   */
  ignoreUrls?: Array<string | RegExp>;
}

const instrumentedScopes = new WeakSet<EventTarget>();

/**
 * Register global listeners that automatically report errors to the provided logger.
 *
 * Captures:
 * - Uncaught JavaScript errors ("error" events carrying an `ErrorEvent`).
 * - Resource load failures (non-bubbling "error" events from elements, observed via a capture listener).
 * - Unhandled promise rejections ("unhandledrejection" events).
 * - Optionally (opt-in via `captureNetworkErrors`), network failures of `fetch`/`XMLHttpRequest` requests.
 *
 * Works in pages and in web/shared/service workers, attaching to whatever global scope it runs in
 * (`self`). Each worker is an isolated scope, so call this once in every context you want covered.
 * In scopes without `XMLHttpRequest` (service workers) only `fetch` is wrapped.
 *
 * Idempotent per scope: calling it again while instrumentation is active is a no-op that returns
 * a no-op restore. Call the original restore first to re-instrument with different options.
 *
 * Errors originating from cross-origin scripts are reported by the browser as "Script error." without
 * a stack trace unless the script tag has `crossorigin="anonymous"` and the server sends CORS headers.
 *
 * In non-browser environments (Node/SSR) this is a no-op.
 *
 * @param {ILogger} logger The logger used to report the captured errors.
 * @param {AutoInstrumentOptions} options The instrumentation options.
 * @returns {() => void} A function that removes all registered listeners and restores any wrapped globals.
 */
export function autoInstrument(logger: ILogger, options?: AutoInstrumentOptions): () => void {
  if (typeof self === "undefined" || typeof self.addEventListener !== "function") {
    return () => {};
  }

  const scope: GlobalScope = self;
  if (instrumentedScopes.has(scope)) {
    return () => {};
  }
  instrumentedScopes.add(scope);

  // Destructuring defaults (unlike an object spread) also apply when a property
  // is passed explicitly as undefined.
  const {
    captureUnhandledRejections = true,
    captureResourceErrors = true,
    captureNetworkErrors = false,
    captureFailedHttpStatus = false,
    ignoreUrls = [],
  } = options ?? {};

  const restoreCallbacks: Array<() => void> = [];

  // The capture pipeline must never throw into the host application — an escaping exception
  // would itself surface as a global error and re-enter the capture handlers.
  const log: LogFn = (level, message, error, params) => {
    try {
      logger.log(level, message, error, params);
    } catch {
      // Intentionally dropped; a broken logger must not take the instrumented app down with it.
    }
  };

  // Handles both uncaught JS errors and resource load failures.
  // Resource error events do not bubble, hence the `capture: true` registration below.
  // The `typeof` guards keep this safe in worker scopes, where the DOM types do not exist.
  const onError = (event: Event): void => {
    if (typeof ErrorEvent !== "undefined" && event instanceof ErrorEvent) {
      log(LogLevel.Error, `Uncaught error: ${event.message}`, event.error, {
        source: "window.onerror",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    } else if (captureResourceErrors && typeof HTMLElement !== "undefined" && event.target instanceof HTMLElement) {
      const target = event.target as HTMLElement & { src?: string; href?: string };
      log(LogLevel.Error, `Resource failed to load: <${target.tagName.toLowerCase()}>`, undefined, {
        source: "resource",
        url: target.src ?? target.href ?? null,
      });
    }
  };

  // The `reason` can be any value; `Logger.log` extracts the error details defensively.
  const onRejection = (event: Event): void => {
    log(LogLevel.Error, "Unhandled promise rejection", (event as PromiseRejectionEvent).reason, {
      source: "unhandledrejection",
    });
  };

  scope.addEventListener("error", onError, { capture: true });
  if (captureUnhandledRejections) {
    scope.addEventListener("unhandledrejection", onRejection);
  }
  restoreCallbacks.push(() => {
    scope.removeEventListener("error", onError, { capture: true });
    scope.removeEventListener("unhandledrejection", onRejection);
  });

  if (captureNetworkErrors) {
    // Exclude the reporter's own endpoints so a failing log-shipping request never loops back
    // into the logger. The endpoints are read per request, so late-configured endpoints count.
    const isIgnored = createUrlMatcher(scope, ignoreUrls, () => logger.reporter?.endpoints);
    restoreCallbacks.push(instrumentFetch(scope, log, isIgnored, captureFailedHttpStatus));
    restoreCallbacks.push(instrumentXhr(scope, log, isIgnored, captureFailedHttpStatus));
  }

  return () => {
    instrumentedScopes.delete(scope);
    for (const restoreCallback of restoreCallbacks) {
      restoreCallback();
    }
  };
}
