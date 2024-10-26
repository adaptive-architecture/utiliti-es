/**
 * Get a promise that resolves after a certain duration.
 *
 * @param {number} duration The duration to wait before resolving the promise.
 * @param {Error?} error An optional error to throw instead of resolving the promise.
 * @returns {Promise<void>} A promise that resolves after a certain duration.
 */
export function delay(duration = 1, error?: Error): Promise<void> {
  return new Promise((res, rej) => {
    setTimeout(() => {
      error ? rej(error) : res();
    }, duration);
  });
}

/**
 * Await the next {count} ticks.
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
