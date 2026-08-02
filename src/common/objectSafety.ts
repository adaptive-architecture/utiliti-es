/**
 * Keys that can alter an object's prototype chain or be abused for prototype pollution
 * when copied from untrusted input.
 */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Check whether a property key is unsafe to copy onto another object.
 *
 * @param {string} key The property key to check.
 * @returns {boolean} True when the key can be used for prototype pollution.
 */
export function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

/**
 * Copy the own enumerable properties of `source` onto `target`, skipping keys that
 * can be used for prototype pollution. Inherited properties are never copied.
 *
 * @param {Record<string, T>} target The object receiving the values.
 * @param {Record<string, T>} source The object providing the values.
 * @param {boolean} overrideExisting Override a value if it already exists on the target.
 */
export function assignSafeValues<T>(
  target: Record<string, T>,
  source: Record<string, T>,
  overrideExisting: boolean,
): void {
  for (const name of Object.keys(source)) {
    if (isDangerousKey(name)) {
      continue;
    }

    if (!overrideExisting && Object.hasOwn(target, name)) {
      continue;
    }

    target[name] = source[name];
  }
}

/**
 * Recursively rebuild a value, dropping own properties with keys that can be used for
 * prototype pollution. Plain objects and arrays are copied; other values are returned as-is.
 *
 * @param {T} value The value to sanitize.
 * @returns {T} A copy of the value without dangerous keys.
 */
export function omitDangerousKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => omitDangerousKeys(item)) as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const name of Object.keys(value)) {
      if (isDangerousKey(name)) {
        continue;
      }
      result[name] = omitDangerousKeys((value as Record<string, unknown>)[name]);
    }
    return result as T;
  }

  return value;
}
