import { setupWorker } from "msw/browser";
import { BroadcastChannelPlugin, PubSubHub, delay } from "../src/index.ts";
import { getLogReporterHandlers } from "../test/mocks/logReporterHandlers.ts";
import { logger } from "./logger.ts";

const worker = setupWorker(...getLogReporterHandlers());
worker.start().then(async () => {
  logger.debug("Initialing the app!");

  const pubSubHub = new PubSubHub({
    plugins: [new BroadcastChannelPlugin({ channelName: "myAppChannel" })],
  });

  pubSubHub.subscribe("appStarted", (_topic, message) => {
    logger.info(`${message.appName} is running at ${message.url}`);
  });

  await delay(1_000);
  pubSubHub.publish("appStarted", { appName: "My App", url: window.location.href });
});
