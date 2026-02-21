import { describe, expect, it } from "vitest";
import { LogLevel, LogMessage } from "../contracts";
import { ConsoleReporter } from "./consoleReporter";

class DummyConsole /* implements IReporterConsole */ {
  public messages: unknown[][] = [];

  private _pushData(...data: unknown[]): void {
    this.messages.push(data);
  }

  debug(...data: unknown[]): void {
    this._pushData(...data);
  }
  error(...data: unknown[]): void {
    this._pushData(...data);
  }
  info(...data: unknown[]): void {
    this._pushData(...data);
  }
  log(...data: unknown[]): void {
    this._pushData(...data);
  }
  trace(...data: unknown[]): void {
    this._pushData(...data);
  }
  warn(...data: unknown[]): void {
    this._pushData(...data);
  }
}

const logLevels: Array<keyof typeof LogLevel> = [];
for (const level in Object.keys(LogLevel)) {
  if (Number.isNaN(level)) {
    continue;
  }

  const actualLevel = LogLevel[level];
  if (actualLevel === undefined) {
    continue;
  }

  logLevels.push(LogLevel[level] as keyof typeof LogLevel);
}

async function publishAndVerifyMessage(dummy: DummyConsole, reporter: ConsoleReporter, item: LogMessage) {
  expect(dummy.messages.length).to.equal(0);
  reporter.register(item);

  const expectedCount = item.level === LogLevel.None ? 0 : 1;

  expect(dummy.messages.length).to.equal(expectedCount);

  if (expectedCount > 0) {
    expect(dummy.messages[0][0]).to.eql(item.message);
    expect(dummy.messages[0][1]).to.eql(item);
  }

  await reporter[Symbol.asyncDispose]();
  expect(dummy.messages.length).to.equal(expectedCount);
}

describe("ConsoleReporter", () => {
  it.each(
    logLevels,
  )("should not fail when reporting a '%s' message even if the 'console' is missing", async (level) => {
    try {
      const reporter = new ConsoleReporter(null as unknown as Console);
      const item = new LogMessage();
      item.level = LogLevel[level];

      reporter.register(item);
      await reporter[Symbol.asyncDispose]();
      expect(true).to.equal(true);
    } catch (error) {
      expect(false).to.equal(true, error as unknown as string);
    }
  });

  it(`should not "report" the "${LogLevel[LogLevel.None]}" message even after calling report`, async () => {
    const item = new LogMessage();
    const dummy = new DummyConsole();

    const reporter = new ConsoleReporter(dummy);

    expect(dummy.messages.length).to.equal(0);
    reporter.register(item);
    expect(dummy.messages.length).to.equal(0);

    await reporter[Symbol.asyncDispose]();
    expect(dummy.messages.length).to.equal(0);
  });

  it.each(logLevels)("should 'report' the '%s' message even before calling report", async (level) => {
    const dummy = new DummyConsole();
    const reporter = new ConsoleReporter(dummy);
    const item = new LogMessage();
    item.level = LogLevel[level];

    await publishAndVerifyMessage(dummy, reporter, item);
  });

  it.each(logLevels)("should 'report' the '%s' message even if instance has only the 'log' method", async (level) => {
    const dummy = new DummyConsole();
    Object.assign(dummy, { debug: null, trace: null, info: null, warn: null, error: null });
    const reporter = new ConsoleReporter(dummy);
    const item = new LogMessage();
    item.level = LogLevel[level];

    await publishAndVerifyMessage(dummy, reporter, item);
  });
});
