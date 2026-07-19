import { type ILogger, LogLevel } from "../contracts";

/**
 * The global scope the instrumentation is attached to: a `Window` in pages,
 * a `WorkerGlobalScope` in web/shared/service workers.
 */
export type GlobalScope = EventTarget & {
  fetch?: typeof fetch;
  XMLHttpRequest?: typeof XMLHttpRequest;
  location?: { href: string };
};

/**
 * A predicate that decides whether a request URL should be excluded from network capture.
 */
export type UrlMatcher = (url: string) => boolean;

const instrumentedMarker = Symbol.for("@adapt-arch/utiliti-es/network-instrumented");

function markInstrumented(fn: object): void {
  (fn as Record<symbol, boolean>)[instrumentedMarker] = true;
}

function isInstrumented(fn: object): boolean {
  return (fn as Record<symbol, boolean>)[instrumentedMarker] === true;
}

function resolveUrl(url: string, base: string | undefined): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/**
 * Build a matcher for the URLs excluded from network capture.
 *
 * String patterns are resolved against the scope's location and matched as prefixes,
 * so relative endpoints such as `/api/logs` work as expected.
 * Regular expressions are tested against the fully resolved request URL.
 *
 * @param {GlobalScope} scope The global scope whose location resolves relative URLs.
 * @param {Array<string | RegExp>} patterns The URL patterns to exclude.
 * @returns {UrlMatcher} The matcher.
 */
export function createUrlMatcher(scope: GlobalScope, patterns: Array<string | RegExp>): UrlMatcher {
  const base = scope.location?.href;
  const regexps: RegExp[] = [];
  const prefixes: string[] = [];

  for (const pattern of patterns) {
    if (pattern instanceof RegExp) {
      regexps.push(pattern);
    } else if (pattern) {
      prefixes.push(resolveUrl(pattern, base));
    }
  }

  return (url: string): boolean => {
    const resolved = resolveUrl(url, base);
    return regexps.some((regexp) => regexp.test(resolved)) || prefixes.some((prefix) => resolved.startsWith(prefix));
  };
}

/**
 * Wrap the scope's `fetch` to report network-level failures (and, optionally, non-2xx responses).
 *
 * @param {GlobalScope} scope The global scope whose `fetch` is wrapped.
 * @param {ILogger} logger The logger used to report the captured failures.
 * @param {UrlMatcher} isIgnored The matcher for URLs excluded from capture.
 * @param {boolean} captureFailedHttpStatus Also report responses that are not `ok` as warnings.
 * @returns {() => void} A function that restores the original `fetch`.
 */
export function instrumentFetch(
  scope: GlobalScope,
  logger: ILogger,
  isIgnored: UrlMatcher,
  captureFailedHttpStatus: boolean,
): () => void {
  const originalFetch = scope.fetch;
  if (typeof originalFetch !== "function" || isInstrumented(originalFetch)) {
    return () => {};
  }

  const wrappedFetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const url = typeof Request !== "undefined" && args[0] instanceof Request ? args[0].url : String(args[0]);
    if (isIgnored(url)) {
      return originalFetch(...args);
    }

    try {
      const response = await originalFetch(...args);
      if (captureFailedHttpStatus && !response.ok) {
        logger.log(LogLevel.Warning, `HTTP ${response.status} for ${url}`, undefined, { source: "fetch", url });
      }
      return response;
    } catch (error) {
      // fetch only rejects on network-level failures (DNS, offline, CORS, abort).
      logger.log(LogLevel.Error, `Network error for ${url}`, error, { source: "fetch", url });
      throw error;
    }
  };

  markInstrumented(wrappedFetch);
  scope.fetch = wrappedFetch;

  return () => {
    // Another tool may have wrapped fetch after us; unpatching would break its chain.
    if (scope.fetch === wrappedFetch) {
      scope.fetch = originalFetch;
    }
  };
}

/**
 * Wrap the scope's `XMLHttpRequest` to report network-level failures, timeouts
 * (and, optionally, failed statuses). A no-op in scopes without `XMLHttpRequest`,
 * such as service workers.
 *
 * @param {GlobalScope} scope The global scope whose `XMLHttpRequest` is wrapped.
 * @param {ILogger} logger The logger used to report the captured failures.
 * @param {UrlMatcher} isIgnored The matcher for URLs excluded from capture.
 * @param {boolean} captureFailedHttpStatus Also report responses with a status of 400 or above as warnings.
 * @returns {() => void} A function that restores the original `XMLHttpRequest` methods.
 */
export function instrumentXhr(
  scope: GlobalScope,
  logger: ILogger,
  isIgnored: UrlMatcher,
  captureFailedHttpStatus: boolean,
): () => void {
  const xhrClass = scope.XMLHttpRequest;
  if (!xhrClass) {
    return () => {};
  }

  const proto = xhrClass.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;
  if (isInstrumented(originalOpen)) {
    return () => {};
  }

  const requestUrls = new WeakMap<XMLHttpRequest, string>();

  const wrappedOpen = function (this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest["open"]>): void {
    requestUrls.set(this, String(args[1]));
    originalOpen.apply(this, args);
  } as XMLHttpRequest["open"];

  const wrappedSend = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    // The URL is unknown when `open` was called before the instrumentation was installed.
    const url = requestUrls.get(this);
    if (url !== undefined && !isIgnored(url)) {
      this.addEventListener("error", () => {
        logger.log(LogLevel.Error, `Network error for ${url}`, undefined, { source: "xhr", url });
      });
      this.addEventListener("timeout", () => {
        logger.log(LogLevel.Error, `Network timeout for ${url}`, undefined, { source: "xhr", url });
      });
      if (captureFailedHttpStatus) {
        this.addEventListener("load", () => {
          if (this.status >= 400) {
            logger.log(LogLevel.Warning, `HTTP ${this.status} for ${url}`, undefined, { source: "xhr", url });
          }
        });
      }
    }
    originalSend.call(this, body);
  };

  markInstrumented(wrappedOpen);
  proto.open = wrappedOpen;
  proto.send = wrappedSend;

  return () => {
    // Same guard as for fetch: only unpatch if we are still the outermost wrapper.
    if (proto.open === wrappedOpen) {
      proto.open = originalOpen;
      proto.send = originalSend;
    }
  };
}
