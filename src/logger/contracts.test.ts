import { describe, expect, it } from "vitest";
import { LogLevel, LogMessage } from "./index";

describe("LogMessage", () => {
  it("should have the timestamp", () => {
    const t0 = Date.now();
    const lm = new LogMessage();
    const t1 = Date.now();

    expect(lm.timestamp >= t0).to.equal(true);
    expect(lm.timestamp <= t1).to.equal(true);
  });

  it("should have default values", () => {
    const lm = new LogMessage();

    expect(lm.level).to.equal(LogLevel.None);
    expect(lm.name).to.equal("");
    expect(lm.message).to.equal("");
    expect(lm.errorMessage).to.equal(undefined);
    expect(lm.stackTrace).to.equal(undefined);
    expect(lm.extraParams).to.equal(undefined);
  });

  it("should have properties", () => {
    const lm = new LogMessage();

    const date = new Date();
    lm.level = LogLevel.Trace;
    lm.name = "name";
    lm.message = "message";
    lm.errorMessage = "errorMessage";
    lm.stackTrace = "stacktrace";
    lm.extraParams = {
      p1: null,
      p2: 0,
      p3: "0",
      p4: date,
    };

    expect(lm.level).to.equal(LogLevel.Trace);
    expect(lm.name).to.equal("name");
    expect(lm.message).to.equal("message");
    expect(lm.errorMessage).to.equal("errorMessage");
    expect(lm.stackTrace).to.equal("stacktrace");
    expect(lm.extraParams).to.not.equal(undefined);
    expect(lm.extraParams.p1).to.equal(null);
    expect(lm.extraParams.p2).to.equal(0);
    expect(lm.extraParams.p3).to.equal("0");
    expect(lm.extraParams.p4).to.equal(date);
  });
});
