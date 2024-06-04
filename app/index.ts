import { PubSubHub, delay } from "../src/index.ts";
import { logger } from "./logger.ts";

logger.info("Initialing the app!");

const pubSubHub = new PubSubHub();

pubSubHub.subscribe("appStarted", (_topic, message) => {
  alert(`${message.appName} is running...`);
});

await delay(1_000);
pubSubHub.publish("appStarted", { appName: "My App" });

