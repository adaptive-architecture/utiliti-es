import { PubSubHub, delay } from "../src/index.ts";

const pubSubHub = new PubSubHub();

pubSubHub.subscribe("appStarted", (_data, message) => {
  alert(`${message.appName} is running...`);
});

await delay(1_000);
pubSubHub.publish("appStarted", { appName: "My App" });
