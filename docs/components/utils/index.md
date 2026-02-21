---
outline: deep
---

# Utils

Common async utility functions.

## `delay`

Returns a promise that resolves after a given duration (in milliseconds). If an `error` argument is provided, the promise rejects with that error instead.

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
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `duration` | `number` | `1` | Milliseconds to wait before settling |
| `error` | `Error` | `undefined` | If provided, the promise rejects with this error |

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
