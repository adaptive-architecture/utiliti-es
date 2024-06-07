import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestLogger } from "../../../test/testLoggerFactory";
import { type InMemoryReporter, LogLevel, type Logger } from "../../logger";
import { delay } from "../../utils";
import { type MessageData, PubSubHub } from "../index";
import { BroadcastChannelPlugin } from "./broadcastChannelPlugin";

const logLevel: LogLevel = LogLevel.Debug;

describe("BroadcastChannelPlugin", () => {
  let _hub: PubSubHub;
  let _logger: Logger;
  let _reporter: InMemoryReporter;

  beforeEach(() => {
    const { logger, reporter } = createTestLogger();
    _logger = logger;
    _reporter = reporter;
    _hub = new PubSubHub({
      plugins: [new BroadcastChannelPlugin({ channelName: "test" })],
    });
  });

  afterEach(async () => {
    _hub[Symbol.dispose]();
    _hub = null as unknown as PubSubHub;
    await _logger[Symbol.asyncDispose]();
    _logger = null as unknown as Logger;
  });

  it("should not affect regular pub/sub functionality", async () => {
    const publishedMessage: MessageData = { id: "test", data: null };

    let receivedMessage: MessageData | undefined = undefined;
    _hub.subscribe("test", (_t, m) => {
      receivedMessage = m;
    });
    _hub.publish("test", publishedMessage);
    await delay(10);

    expect(receivedMessage).to.eql(publishedMessage);
  });

  it("should not fail if bad dat is published", async () => {
    const p = new BroadcastChannelPlugin({ channelName: "test" });
    try {
      p.init(_hub);
      p.init(_hub); // Should not fail if called twice.
      p.onPublish({ topic: "test", message: undefined });
      p.onPublish({ topic: undefined, message: {} });
    } catch (e) {
      expect(e).toBeUndefined();
    } finally {
      p[Symbol.dispose]();
    }
  });
});
