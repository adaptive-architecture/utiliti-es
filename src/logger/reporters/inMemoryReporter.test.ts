import { describe, expect, it } from "vitest";
import { LogMessage } from "../contracts";
import { InMemoryReporter } from "./inMemoryReporter";

function newLogMessage(text: string): LogMessage {
  const lm = new LogMessage();
  lm.message = text;
  return lm;
}

describe("InMemoryReporter", () => {
  it("should keep all messages when no cap is configured", () => {
    const reporter = new InMemoryReporter();

    for (let ix = 0; ix < 5; ix++) {
      reporter.register(newLogMessage(`message ${ix}`));
    }

    expect(reporter.messages.length).to.equal(5);
  });

  it("should drop the oldest messages beyond maxMessages", () => {
    const reporter = new InMemoryReporter(2);

    reporter.register(newLogMessage("first"));
    reporter.register(newLogMessage("second"));
    reporter.register(newLogMessage("third"));

    expect(reporter.messages.map((m) => m.message)).to.deep.equal(["second", "third"]);
  });

  it("should return a copy from the messages getter", () => {
    const reporter = new InMemoryReporter();
    reporter.register(newLogMessage("only"));

    const copy = reporter.messages;
    copy.pop();

    expect(reporter.messages.length).to.equal(1);
  });

  it("should clear the messages on dispose", async () => {
    const reporter = new InMemoryReporter();
    reporter.register(newLogMessage("gone"));

    await reporter[Symbol.asyncDispose]();

    expect(reporter.messages.length).to.equal(0);
  });
});
