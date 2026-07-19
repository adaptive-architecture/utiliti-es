import { type ILogger, LogLevel } from "../contracts";

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
}

const defaultOptions: Required<AutoInstrumentOptions> = {
  captureUnhandledRejections: true,
  captureResourceErrors: true,
};

/**
 * Register global browser listeners that automatically report errors to the provided logger.
 *
 * Captures:
 * - Uncaught JavaScript errors ("error" events carrying an `ErrorEvent`).
 * - Resource load failures (non-bubbling "error" events from elements, observed via a capture listener).
 * - Unhandled promise rejections ("unhandledrejection" events).
 *
 * Errors originating from cross-origin scripts are reported by the browser as "Script error." without
 * a stack trace unless the script tag has `crossorigin="anonymous"` and the server sends CORS headers.
 *
 * In non-browser environments (Node/SSR) this is a no-op.
 *
 * @param {ILogger} logger The logger used to report the captured errors.
 * @param {AutoInstrumentOptions} options The instrumentation options.
 * @returns {() => void} A function that removes all registered listeners.
 */
export function autoInstrument(logger: ILogger, options?: AutoInstrumentOptions): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const opts: Required<AutoInstrumentOptions> = { ...defaultOptions, ...options };

  // Handles both uncaught JS errors and resource load failures.
  // Resource error events do not bubble, hence the `capture: true` registration below.
  const onError = (event: Event): void => {
    if (event instanceof ErrorEvent) {
      logger.log(LogLevel.Error, `Uncaught error: ${event.message}`, event.error, {
        source: "window.onerror",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    } else if (opts.captureResourceErrors && event.target instanceof HTMLElement) {
      const target = event.target as HTMLElement & { src?: string; href?: string };
      logger.log(LogLevel.Error, `Resource failed to load: <${target.tagName.toLowerCase()}>`, undefined, {
        source: "resource",
        url: target.src ?? target.href ?? null,
      });
    }
  };

  // The `reason` can be any value; `Logger.log` extracts the error details defensively.
  const onRejection = (event: PromiseRejectionEvent): void => {
    logger.log(LogLevel.Error, "Unhandled promise rejection", event.reason, {
      source: "unhandledrejection",
    });
  };

  window.addEventListener("error", onError, { capture: true });
  if (opts.captureUnhandledRejections) {
    window.addEventListener("unhandledrejection", onRejection);
  }

  return () => {
    window.removeEventListener("error", onError, { capture: true });
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
