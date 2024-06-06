import { InMemoryReporter, LogLevel, Logger } from "../src";

export function createTestLogger(): { logger: Logger; reporter: InMemoryReporter } {
  const reporter = new InMemoryReporter();
  return {
    logger: new Logger({
      name: "TestLogger",
      minimumLevel: LogLevel.Trace,
      enrichers: [],
      reporter: reporter,
    }),
    reporter: reporter,
  };
}
