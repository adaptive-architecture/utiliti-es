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

/**
 * The logging callback the wrappers report through.
 */
export type LogFn = ILogger["log"];

const instrumentedMarker = Symbol.for("@adapt-arch/utiliti-es/network-instrumented");

function markInstrumented(fn: object): void {
  (fn as Record<symbol, boolean>)[instrumentedMarker] = true;
}

function isInstrumented(fn: object): boolean {
  return (fn as Record<symbol, boolean>)[instrumentedMarker] === true;
}

/**
 * Duck-typed rather than `instanceof Request`: works for Request objects from other
 * realms and in scopes where the Request global is absent.
 */
function getRequestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function resolveUrl(url: string, base: string | undefined): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

const boundaryChars = new Set(["/", "?", "#"]);

/**
 * Path-boundary-aware prefix match: `/logs` matches `/logs`, `/logs/batch` and `/logs?x=1`,
 * but not `/logs-export`.
 */
function matchesPrefix(resolved: string, prefix: string): boolean {
  if (!resolved.startsWith(prefix)) {
    return false;
  }
  if (resolved.length === prefix.length || boundaryChars.has(prefix.at(-1) as string)) {
    return true;
  }
  return boundaryChars.has(resolved[prefix.length]);
}

/**
 * Build a matcher for the URLs excluded from network capture.
 *
 * String patterns are resolved against the scope's location and matched as path-boundary-aware
 * prefixes, so relative endpoints such as `/api/logs` work as expected without also matching
 * unrelated siblings like `/api/logs-export`. Regular expressions are tested against the fully
 * resolved request URL. Reporter endpoints are read through `getEndpoints` at request time, so
 * endpoints configured after instrumentation are still excluded.
 *
 * @param {GlobalScope} scope The global scope whose location resolves relative URLs.
 * @param {Array<string | RegExp>} patterns The URL patterns to exclude.
 * @param {() => string[] | undefined} getEndpoints Live accessor for the reporter endpoints to exclude.
 * @returns {UrlMatcher} The matcher.
 */
export function createUrlMatcher(
  scope: GlobalScope,
  patterns: Array<string | RegExp>,
  getEndpoints: () => string[] | undefined,
): UrlMatcher {
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
    const endpoints = getEndpoints() ?? [];
    if (regexps.length === 0 && prefixes.length === 0 && endpoints.length === 0) {
      return false;
    }

    const resolved = resolveUrl(url, base);
    return (
      regexps.some((regexp) => regexp.test(resolved)) ||
      prefixes.some((prefix) => matchesPrefix(resolved, prefix)) ||
      endpoints.some((endpoint) => !!endpoint && matchesPrefix(resolved, resolveUrl(endpoint, base)))
    );
  };
}

/**
 * Wrap the scope's `fetch` to report network-level failures (and, optionally, 4xx/5xx responses).
 *
 * @param {GlobalScope} scope The global scope whose `fetch` is wrapped.
 * @param {LogFn} log The callback used to report the captured failures.
 * @param {UrlMatcher} isIgnored The matcher for URLs excluded from capture.
 * @param {boolean} captureFailedHttpStatus Also report responses with a status of 400 or above as warnings.
 * @returns {() => void} A function that restores the original `fetch`.
 */
export function instrumentFetch(
  scope: GlobalScope,
  log: LogFn,
  isIgnored: UrlMatcher,
  captureFailedHttpStatus: boolean,
): () => void {
  const originalFetch = scope.fetch;
  if (typeof originalFetch !== "function" || isInstrumented(originalFetch)) {
    return () => {};
  }

  const wrappedFetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const url = getRequestUrl(args[0]);
    if (isIgnored(url)) {
      return originalFetch(...args);
    }

    try {
      const response = await originalFetch(...args);
      // `status >= 400` rather than `!response.ok`: opaque responses (no-cors, manual redirects)
      // report ok=false with status 0 even on success and must not be logged as failures.
      if (captureFailedHttpStatus && response.status >= 400) {
        log(LogLevel.Warning, `HTTP ${response.status} for ${url}`, undefined, { source: "fetch", url });
      }
      return response;
    } catch (error) {
      // fetch only rejects on network-level failures (DNS, offline, CORS, abort).
      log(LogLevel.Error, `Network error for ${url}`, error, { source: "fetch", url });
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
 * @param {LogFn} log The callback used to report the captured failures.
 * @param {UrlMatcher} isIgnored The matcher for URLs excluded from capture.
 * @param {boolean} captureFailedHttpStatus Also report responses with a status of 400 or above as warnings.
 * @returns {() => void} A function that restores the original `XMLHttpRequest` methods.
 */
export function instrumentXhr(
  scope: GlobalScope,
  log: LogFn,
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
  const attachedXhrs = new WeakSet<XMLHttpRequest>();
  let active = true;

  const wrappedOpen = function (this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest["open"]>): void {
    requestUrls.set(this, String(args[1]));
    originalOpen.apply(this, args);
  } as XMLHttpRequest["open"];

  const wrappedSend = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    // Listeners are attached once per instance; XHR objects are legally reusable (open/send again),
    // and per-send listeners would accumulate and re-fire with stale URLs.
    if (!attachedXhrs.has(this)) {
      attachedXhrs.add(this);

      // The URL is read at event time so a reused instance always reports its current request.
      // It is unknown when `open` was called before the instrumentation was installed.
      const report = (level: LogLevel, message: (url: string) => string): void => {
        const url = requestUrls.get(this);
        if (!active || url === undefined || isIgnored(url)) {
          return;
        }
        log(level, message(url), undefined, { source: "xhr", url });
      };
      this.addEventListener("error", () => report(LogLevel.Error, (url) => `Network error for ${url}`));
      this.addEventListener("timeout", () => report(LogLevel.Error, (url) => `Network timeout for ${url}`));
      if (captureFailedHttpStatus) {
        this.addEventListener("load", () => {
          if (this.status >= 400) {
            report(LogLevel.Warning, (url) => `HTTP ${this.status} for ${url}`);
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
    // Deactivate the per-instance listeners and unpatch each method independently:
    // a foreign tool may have wrapped only one of them after us, and clobbering it
    // would break its chain.
    active = false;
    if (proto.open === wrappedOpen) {
      proto.open = originalOpen;
    }
    if (proto.send === wrappedSend) {
      proto.send = originalSend;
    }
  };
}
