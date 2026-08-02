---
outline: deep
---

# Utils

Common async utility functions.

## `delay`

Returns a promise that resolves after a given duration (in milliseconds). If an `error` argument is provided, the promise rejects with that error instead. An optional `AbortSignal` cancels the delay: the timer is cleared and the promise rejects with the signal's abort reason.

``` ts
import { delay } from "@adapt-arch/utiliti-es";

// Wait 500 ms
await delay(500);

// Reject after 1 second
try {
  await delay(1000, new Error("Timed out"));
} catch (err) {
  console.error(err.message); // "Timed out"
}

// Cancellable delay
const controller = new AbortController();
const pending = delay(10_000, undefined, controller.signal);
controller.abort(new Error("No longer needed")); // pending rejects, the timer is cleared
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `duration` | `number` | `1` | Milliseconds to wait before settling |
| `error` | `Error` | `undefined` | If provided, the promise rejects with this error |
| `signal` | `AbortSignal` | `undefined` | If provided, aborting cancels the timer and rejects with the abort reason |

## `nextTicks`

Waits for the specified number of event-loop ticks. Each tick is a `setTimeout(0)` call. Useful in tests to flush queued microtasks.

``` ts
import { nextTicks } from "@adapt-arch/utiliti-es";

// Flush 3 event-loop ticks
await nextTicks(3);
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `count` | `number` | `1` | Number of ticks to wait |

If `count` is `0` or negative the returned promise resolves immediately.

::: info
Browsers clamp nested timeouts to ~4 ms after a few levels of nesting, so waiting for a large number of ticks takes noticeably longer than 0 ms per tick. This is by design — each tick is a real macrotask so pending timer callbacks get a chance to run in between.
:::
