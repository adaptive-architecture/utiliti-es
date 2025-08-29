import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTicks } from "../index";
import { InMemoryReporter, Logger, LoggerOptions, LogLevel, LogMessage, ValuesEnricher } from "./index";

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

    await nextTicks();

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

      await nextTicks();

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Error);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it("should copy the error message and stack trace", async () => {
      expect(rep.messages.length).to.equal(0);
      const err = new Error("error message");
      logger.log(LogLevel.Error, "some message", err);

      await nextTicks();

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

      await nextTicks();

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Trace);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "debug"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.debug("some message");

      await nextTicks();

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Debug);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "info"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.info("some message");

      await nextTicks();

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Information);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "warn"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.warn("some message");

      await nextTicks();

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Warning);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "error"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.error("some message");

      await nextTicks();

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Error);
      expect(rep.messages[0].message).to.equal("some message");
    });

    it('should have a shorthand method for "crit"', async () => {
      expect(rep.messages.length).to.equal(0);
      logger.crit("some message");

      await nextTicks();

      expect(rep.messages.length).to.equal(1);
      expect(rep.messages[0].level).to.equal(LogLevel.Critical);
      expect(rep.messages[0].message).to.equal("some message");
    });
  });

  describe("_extractErrorDetails", () => {
    function getTestFunction(): (e: unknown) => { message?: string; stack?: string } | undefined {
      return (
        logger as unknown as { _extractErrorDetails: (e: unknown) => { message?: string; stack?: string } }
      )._extractErrorDetails.bind(logger);
    }

    it("should return undefined for undefined", () => {
      expect(getTestFunction()(undefined)).to.equal(undefined);
    });

    it("should return undefined for null", () => {
      expect(getTestFunction()(null)).to.equal(undefined);
    });

    it("should return message for string", () => {
      expect(getTestFunction()("some error")).to.deep.equal({ message: "some error" });
    });

    it("should return message and stack for Error", () => {
      const err = new Error("some error");
      expect(getTestFunction()(err)).to.deep.equal({ message: err.message, stack: err.stack });
    });

    it("should return correct value for number", () => {
      expect(getTestFunction()(42)?.message).to.equal("42");
    });

    it("should return correct value for boolean", () => {
      expect(getTestFunction()(true)?.message).to.equal("true");
    });

    it("should return correct value for symbol", () => {
      expect(getTestFunction()(Symbol("sym"))?.message).to.equal("Symbol(sym)");
    });

    it("should return correct value for bigint", () => {
      expect(getTestFunction()(BigInt(42))?.message).to.equal("42");
    });

    it("should return correct value for object", () => {
      expect(getTestFunction()({ key: "value" })?.message).to.equal(JSON.stringify({ key: "value" }));
    });

    it("should return correct value for array", () => {
      expect(getTestFunction()([1, 2, 3])?.message).to.equal(JSON.stringify([1, 2, 3]));
    });
  });
});
