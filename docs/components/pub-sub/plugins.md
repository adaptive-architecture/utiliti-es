---
outline: deep
---

# Plugins

The `PubSubHub` offers the possibility to extend it's functionality using a plugin system.

# Included plugins

Out of the box the library offers the following plugins.

## LoggerPlugin

A basic plugin to log all the messages that are published. This could be useful in unit tests.

## BroadcastChannelPlugin

A plugin that takes advantage of the [Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API) in order to enable cross context propagation of the messages.

``` ts
import * as pubSub from "@adapt-arch/utiliti-es/pubsub";

const pubSubHub = new pubSub.PubSubHub({
  plugins: [new pubSub.BroadcastChannelPlugin({ channelName: "myAppChannel" })],
});
```

