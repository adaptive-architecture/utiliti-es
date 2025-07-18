import { describe, expect, it } from "vitest";
import { type ILogsReporter, LogMessage } from "../contracts";
import { InMemoryReporter } from "./inMemoryReporter";
import { MultipleReporter } from "./multipleReporter";

describe("MultipleReporter", () => {
  it("should report the messages to child reporters", async () => {
    const item = new LogMessage();

    const childReporter_A = new InMemoryReporter();
    const childReporter_B = new InMemoryReporter();
    const reporter = new MultipleReporter([childReporter_A, childReporter_B]);

    expect(childReporter_A.messages.length).to.equal(0);
    expect(childReporter_B.messages.length).to.equal(0);
    reporter.register(item);

    await reporter[Symbol.asyncDispose]();
    expect(childReporter_A.messages.length).to.equal(1);
    expect(childReporter_A.messages[0]).to.eql(item);
    expect(childReporter_B.messages.length).to.equal(1);
    expect(childReporter_B.messages[0]).to.eql(item);
  });

  it("should not fail if not child reporters", async () => {
    try {
      const item = new LogMessage();
      const reporter = new MultipleReporter([]);
      reporter.register(item);
      await reporter[Symbol.asyncDispose]();
      expect(true).to.equal(true);
    } catch (error) {
      expect(typeof error === "undefined").to.be.true("Expected no error, but got one");
    }
  });

  it("should not fail if not child reporters", async () => {
    try {
      const item = new LogMessage();
      const reporter = new MultipleReporter(null as unknown as ILogsReporter[]);
      reporter.register(item);
      await reporter[Symbol.asyncDispose]();
      expect(true).to.equal(true);
    } catch (error) {
      expect(typeof error === "undefined").to.be.true("Expected no error, but got one");
    }
  });
});
