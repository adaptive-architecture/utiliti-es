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

    expect(childReporter_A.messages.length).to.equal(1);
    expect(childReporter_A.messages[0]).to.eql(item);
    expect(childReporter_B.messages.length).to.equal(1);
    expect(childReporter_B.messages[0]).to.eql(item);

    await reporter[Symbol.asyncDispose]();
  });

  it("should not fail if not child reporters", async () => {
    try {
      const item = new LogMessage();
      const reporter = new MultipleReporter([]);
      reporter.register(item);
      await reporter[Symbol.asyncDispose]();
      expect(true).to.equal(true);
    } catch (error) {
      expect(error).to.be.undefined("Expected no error, but got one");
    }
  });

  it("should not fail if child reporters are null", async () => {
    try {
      const item = new LogMessage();
      const reporter = new MultipleReporter(null as unknown as ILogsReporter[]);
      reporter.register(item);
      await reporter[Symbol.asyncDispose]();
      expect(true).to.equal(true);
    } catch (error) {
      expect(error).to.be.undefined("Expected no error, but got one");
    }
  });

  it("should keep reporting to the remaining reporters when one of them throws", () => {
    const item = new LogMessage();
    const workingReporter = new InMemoryReporter();
    const brokenReporter: ILogsReporter = {
      register: () => {
        throw new Error("broken reporter");
      },
      [Symbol.asyncDispose]: () => Promise.resolve(),
    };

    const reporter = new MultipleReporter([brokenReporter, workingReporter]);
    expect(() => reporter.register(item)).not.toThrow();
    expect(workingReporter.messages.length).to.equal(1);
  });

  it("should dispose all reporters even when one of them rejects or throws", async () => {
    let disposed = false;
    const rejectingReporter: ILogsReporter = {
      register: () => {},
      [Symbol.asyncDispose]: () => Promise.reject(new Error("rejecting dispose")),
    };
    const throwingReporter: ILogsReporter = {
      register: () => {},
      [Symbol.asyncDispose]: () => {
        throw new Error("throwing dispose");
      },
    };
    const trackingReporter: ILogsReporter = {
      register: () => {},
      [Symbol.asyncDispose]: () => {
        disposed = true;
        return Promise.resolve();
      },
    };

    const reporter = new MultipleReporter([rejectingReporter, throwingReporter, trackingReporter]);
    await expect(reporter[Symbol.asyncDispose]()).resolves.to.equal(undefined);
    expect(disposed).to.equal(true);
  });

  describe("endpoints", () => {
    function reporterWithEndpoints(endpoints: () => string[]): ILogsReporter {
      return {
        get endpoints(): string[] {
          return endpoints();
        },
        register: () => {},
        [Symbol.asyncDispose]: () => Promise.resolve(),
      };
    }

    it("should aggregate child endpoints and skip reporters without any", () => {
      const reporter = new MultipleReporter([
        reporterWithEndpoints(() => ["/logs-a"]),
        new InMemoryReporter(),
        reporterWithEndpoints(() => ["/logs-b", "/logs-c"]),
      ]);

      expect(reporter.endpoints).to.deep.equal(["/logs-a", "/logs-b", "/logs-c"]);
    });

    it("should return a stable array reference while child endpoints are unchanged", () => {
      let endpoint = "/logs-a";
      const reporter = new MultipleReporter([reporterWithEndpoints(() => [endpoint])]);

      const first = reporter.endpoints;
      expect(reporter.endpoints).to.equal(first);

      endpoint = "/logs-b";
      const updated = reporter.endpoints;
      expect(updated).not.to.equal(first);
      expect(updated).to.deep.equal(["/logs-b"]);
    });
  });
});
