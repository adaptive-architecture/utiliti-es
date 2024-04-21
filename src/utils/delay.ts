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
