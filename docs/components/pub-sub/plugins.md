---
outline: deep
---

# Plugins

The `PubSubHub` offers the possibility to extend its functionality using a plugin system.

## Included plugins

Out of the box the library offers the following plugins.

### LoggerPlugin

A plugin that logs every published message through an `ILogger` instance. You can optionally set the log level (defaults to `Information`).

``` ts
import { PubSubHub, LoggerPlugin, Logger, LoggerOptions, LogLevel, ConsoleReporter } from "@adapt-arch/utiliti-es";

const loggerOptions = new LoggerOptions();
loggerOptions.name = "PubSub";
loggerOptions.minimumLevel = LogLevel.Trace;
loggerOptions.reporter = new ConsoleReporter(console);

const logger = new Logger(loggerOptions);

const hub = new PubSubHub({
  plugins: [new LoggerPlugin(logger, LogLevel.Debug)],
});

hub.publish("order.created", { orderId: "abc-123" });
// Logger will output: "Publishing message to topic: order.created"
```

### BroadcastChannelPlugin

A plugin that takes advantage of the [Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API) to propagate messages across browser tabs and windows. Messages published in one tab are automatically received by subscribers in other tabs using the same channel name.

The plugin prevents infinite loops by tagging messages with the channel they arrived on (so even two plugins sharing a channel cannot amplify a message), and internal metadata is stripped before messages reach subscribers.

``` ts
import { PubSubHub, BroadcastChannelPlugin } from "@adapt-arch/utiliti-es";

const hub = new PubSubHub({
  plugins: [new BroadcastChannelPlugin({ channelName: "myAppChannel" })],
});

// Messages published here will also be delivered to
// other tabs/windows using the same channel name.
hub.publish("user.loggedIn", { userId: "42" });
```

::: warning Treat channel messages as untrusted input
A `BroadcastChannel` is readable and writable by **any same-origin context** — other scripts, iframes or extensions that know the channel name can inject messages. The plugin validates every incoming message (non-empty string topic, plain-object payload), strips prototype-polluting keys (`__proto__`, `constructor`, `prototype`) and discards spoofed internal metadata before republishing, and a malformed message can never throw into your application. The payload *values* still originate from outside your tab, though — never feed them into `innerHTML` or similar sinks without your own validation.
:::

Environment and lifecycle notes:

* The constructor throws a descriptive error when the `BroadcastChannel` API is not available (very old browsers, some non-browser runtimes).
* Disposing the plugin (directly or via the hub) closes the channel permanently: disposal is idempotent, publishing afterwards is safely skipped, and calling `init()` on a disposed plugin throws.
* If you combine it with a `LoggerPlugin`, order the `BroadcastChannelPlugin` **first** so internal metadata is stripped before the message is logged.

## Custom plugins

You can create your own plugins by implementing the `PubSubPlugin` type. All methods are optional.

``` ts
import type { PubSubPlugin, PubSubPluginContext, IPubSubHub } from "@adapt-arch/utiliti-es";

const myPlugin: PubSubPlugin = {
  init(hub: IPubSubHub) {
    // Called once when the PubSubHub is created.
    // You receive a reference to the hub so you can subscribe or publish.
  },

  onPublish(context: PubSubPluginContext) {
    // Called right before a message is delivered to subscribers.
    // You can inspect or modify context.topic and context.message.
    console.log(`Publishing to ${context.topic}`);
  },

  [Symbol.dispose]() {
    // Called when the PubSubHub is disposed.
    // Clean up any resources held by the plugin.
  },
};

const hub = new PubSubHub({ plugins: [myPlugin] });
```

| Method | Description |
|--------|-------------|
| `init(hub)` | Called once during `PubSubHub` construction. Receives the hub instance. |
| `onPublish(context)` | Called before each `publish()`. Can read or mutate `context.topic` and `context.message`. |
| `[Symbol.dispose]()` | Called when the hub is disposed. Use for cleanup. |
