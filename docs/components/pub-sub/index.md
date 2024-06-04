---
outline: deep
---

# PubSub

In certain scenarios you might want to react to changes in other components without taking a direct dependency to them. The `PubSubHub` allows you to do just that.

# Basic usage

``` ts
import * as pubSub from "@adapt-arch/utiliti-es/pubsub";

const pubSubHub = new pubSub.PubSubHub();

pubSubHub.subscribe("appStarted", (topic, message) => {
  alert(`${message.appName} is running...`);
});

pubSubHub.publish("appStarted", { appName: "My App" });
```

