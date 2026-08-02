---
outline: deep
---

# PubSub

In certain scenarios you might want to react to changes in other components without taking a direct dependency to them. The `PubSubHub` allows you to do just that.

## Basic usage

``` ts
import { PubSubHub } from "@adapt-arch/utiliti-es";

const hub = new PubSubHub();

hub.subscribe("appStarted", (topic, message) => {
  alert(`${message.appName} is running...`);
});

hub.publish("appStarted", { appName: "My App" });
```

## Unsubscribe

`subscribe()` returns a subscription ID that you can pass to `unsubscribe()` to stop receiving messages.

``` ts
import { PubSubHub } from "@adapt-arch/utiliti-es";

const hub = new PubSubHub();

const subId = hub.subscribe("events", (topic, message) => {
  console.log(topic, message);
});

// Later, when you no longer need to listen:
hub.unsubscribe(subId);
```

## Message isolation

Published messages are passed through `structuredClone` before they reach subscribers. This means each handler receives its own independent copy — mutating a message inside one handler will not affect other handlers.

## Async delivery

Messages are delivered asynchronously via `setTimeout(0)`. This means that `publish()` returns immediately and handlers are invoked on the next event-loop tick. Keep this in mind when writing tests — you may need to `await nextTicks()` to flush pending deliveries.

## Error isolation

A subscriber whose handler throws does not affect other subscribers or later deliveries — the exception is contained by the hub.

## Validation

Both `publish()` and `subscribe()` validate their arguments before anything else happens:

* `topic` must be a non-empty string.
* `message` must be a non-null plain object (arrays and primitives are rejected).
* `subscribe()` throws if the `handler` is not a function.

Validation runs **before any plugin sees the message**, so a plugin (e.g. `BroadcastChannelPlugin`) can never broadcast an invalid payload; the context is validated again after the plugins ran, since plugins may modify it.

## Disposal

`PubSubHub` implements `Symbol.dispose`. When disposed, all pending deliveries are cancelled, all active subscriptions are cleared and any registered plugins are disposed. Disposal is idempotent; after disposal, `publish()` and `subscribe()` throw, while `unsubscribe()` is a safe no-op.

``` ts
import { PubSubHub } from "@adapt-arch/utiliti-es";

{
  using hub = new PubSubHub();

  hub.subscribe("events", (topic, message) => {
    console.log(topic, message);
  });

  hub.publish("events", { action: "init" });
} // hub is disposed here — all subscriptions are cleaned up
```
