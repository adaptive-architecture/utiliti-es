import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestLogger } from "../../../test/testLoggerFactory";
import { type InMemoryReporter, type Logger, LogLevel } from "../../logger";
import { nextTicks } from "../../utils";
import { type MessageData, PubSubHub } from "../index";
import { LoggerPlugin } from "./loggerPlugin";

const logLevel: LogLevel = LogLevel.Debug;

describe("LoggerPlugin", () => {
  let _hub: PubSubHub;
  let _logger: Logger;
  let _reporter: InMemoryReporter;

  beforeEach(() => {
    const { logger, reporter } = createTestLogger();
    _logger = logger;
    _reporter = reporter;
    _hub = new PubSubHub({
      plugins: [new LoggerPlugin(_logger, logLevel)],
    });
  });

  afterEach(async () => {
    _hub[Symbol.dispose]();
    _hub = null as unknown as PubSubHub;
    await _logger[Symbol.asyncDispose]();
    _logger = null as unknown as Logger;
  });

  it("should log the published message", async () => {
    const publishedMessage: MessageData = {
      id: "test",
      data: {
        test: 1,
        someArray: [1, 2, 3],
      },
    };

    _hub.publish("test", publishedMessage);
    await nextTicks(2);

    const loggedItem = _reporter.messages[0];
    expect(loggedItem.message).to.eql("Publishing message to topic: test");
    expect(loggedItem.level).to.eql(logLevel);
    expect(loggedItem.extraParams).to.eql({
      topic: "test",
      message: publishedMessage,
    });
  });

  it("should log the message event if publishing fails", async () => {
    try {
      _hub.publish(undefined as unknown as string, undefined as unknown as MessageData);
      expect.fail("Should have thrown an error.");
    } catch (e) {
      expect(e).to.be.an.instanceOf(Error);
    }

    await nextTicks(2);

    const loggedItem = _reporter.messages[0];
    expect(loggedItem.message).to.eql("Publishing message to topic: undefined");
    expect(loggedItem.level).to.eql(logLevel);
    expect(loggedItem.extraParams).to.eql({
      topic: null,
      message: null,
    });
  });
});
