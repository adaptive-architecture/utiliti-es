/**
 * Get a promise that resolves after a certain duration.
 *
 * @param {number} duration The duration to wait before resolving the promise.
 * @param {Error?} error An optional error to throw instead of resolving the promise.
 * @param {AbortSignal?} signal An optional signal that cancels the delay; the promise rejects with the signal's abort reason.
 * @returns {Promise<void>} A promise that resolves after a certain duration.
 */
export function delay(duration = 1, error?: Error, signal?: AbortSignal): Promise<void> {
  return new Promise((res, rej) => {
    if (signal?.aborted) {
      rej(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timeoutRef);
      rej(signal?.reason);
    };

    const timeoutRef = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      error ? rej(error) : res();
    }, duration);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Await the next {count} ticks.
 *
 * Each tick is a macrotask (`setTimeout(0)`), so pending timer callbacks run between ticks.
 * Note: browsers clamp nested timeouts to ~4ms after a few levels of nesting, so large
 * counts take noticeably longer than 0ms per tick by design.
 *
 * @param {number} count The number of ticks to wait for.
 * @returns {Promise<void>} A promise that resolves after a certain number of ticks.
 */
export function nextTicks(count = 1): Promise<void> {
  if (count <= 0) {
    return Promise.resolve();
  }

  return delay(0).then(() => nextTicks(count - 1));
}
