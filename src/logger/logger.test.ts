import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { delay } from "../index";
import { InMemoryReporter, LogLevel, LogMessage, Logger, LoggerOptions, ValuesEnricher } from "./index";

describe("Logger", () => {
  let opt: LoggerOptions;
  let logger: Logger;

  afterEach(async () => {
    await logger[Symbol.asyncDispose]();
  });

  beforeEach(() => {
    opt = new LoggerOptions();
    opt.name = "Test logger";
    opt.minimumLevel = LogLevel.Warning;
    logger = new Logger(opt);
  });

  it("should be enabled for error", () => {
    expect(logger.isEnabled(LogLevel.Error)).to.equal(true);
  });

  it("should be disabled for info", () => {
    expect(logger.isEnabled(LogLevel.Information)).to.equal(false);
  });

  it("should not fail if no reporter is configured", () => {
    expect(() => {
      const msg = new LogMessage();
      msg.level = LogLevel.Critical;
      logger.logMessage(msg);
    }).not.to.throw();
  });

  it("should log", async () => {
    const rep = new InMemoryReporter();
    opt.reporter = rep;
    opt.enrichers.push(
      new ValuesEnricher(
        {
          extra: "value",
        },
        false,
      ),
    );

    const message = new LogMessage();
    message.level = LogLevel.Critical;
    message.message = "critical message";

    logger.logMessage(message);
    logger.logMessage(new LogMessage());

    await delay(1);

    expect(rep.messages.length).to.equal(1);
    expect(rep.messages[0].level).to.equal(LogLevel.Critical);
    expect(rep.messages[0].message).to.equal("critical message");
    expect(rep.messages[0].name).to.equal(opt.name);
    expect(rep.messages[0].extraParams).to.not.equal(undefined);
    expect(rep.messages[0].extraParams?.extra).to.equal("value");
  });

  describe("log method", () => {
    let rep: InMemoryReporter;
    beforeEach(() => {
      rep = new InMemoryReporter();
      opt.reporter = rep;
    });

    it("should require only a level and a message", async () => {
      expect(rep.messages.length).to.equal(0);
      logger.log(LogLevel.Error, "some message");

      await delay(1);

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Error);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it("should copy the error message and stack trace", async () => {
      expect(rep.messages.length).to.equal(0);
      const err = new Error("error message");
      logger.log(LogLevel.Error, "some message", err);

      await delay(1);

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Error);
      expect(rep.messages[0].message).to.equal("some message");
      expect(rep.messages[0].errorMessage).to.equal(err.message);
      expect(rep.messages[0].stackTrace).to.equal(err.stack);
    });
  });

  describe("log shorthand methods", () => {
    let rep: InMemoryReporter;
    beforeEach(() => {
      rep = new InMemoryReporter();
      opt.reporter = rep;
      opt.minimumLevel = LogLevel.Trace;
    });

    it('should have a shorthand method for "trace"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.trace("some message");

      await delay(1);

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Trace);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "debug"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.debug("some message");

      await delay(1);

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Debug);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "info"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.info("some message");

      await delay(1);

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Information);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "warn"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.warn("some message");

      await delay(1);

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Warning);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "error"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.error("some message");

      await delay(1);

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Error);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "crit"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.crit("some message");

      await delay(1);

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Critical);
      expect(rep.messages[0].message).to.equal("some message");
    });
  });
});
