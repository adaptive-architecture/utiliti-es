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

The plugin prevents infinite loops by tagging messages with a unique instance ID, and internal metadata is stripped before messages reach subscribers.

``` ts
import { PubSubHub, BroadcastChannelPlugin } from "@adapt-arch/utiliti-es";

const hub = new PubSubHub({
  plugins: [new BroadcastChannelPlugin({ channelName: "myAppChannel" })],
});

// Messages published here will also be delivered to
// other tabs/windows using the same channel name.
hub.publish("user.loggedIn", { userId: "42" });
```

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
