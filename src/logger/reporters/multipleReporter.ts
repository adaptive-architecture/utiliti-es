import type { ILogsReporter, LogMessage } from "../contracts";

/**
 * An implementations that can report to multiple implementations of `ILogsReporter`.
 */
export class MultipleReporter implements ILogsReporter {
  private readonly _reporters: ILogsReporter[];

  constructor(reporters: ILogsReporter[]) {
    this._reporters = reporters || [];
  }

  /**
   * @inheritdoc
   */
  register(message: LogMessage): void {
    for (const reporter of this._reporters) {
      reporter.register(message);
    }
  }

  /**
   * @inheritdoc
   */
  async [Symbol.asyncDispose](): Promise<void> {
    const proms: PromiseLike<void>[] = [];

    for (const reporter of this._reporters) {
      proms.push(reporter[Symbol.asyncDispose]());
    }

    if (proms.length) {
      await Promise.all(proms);
    }
  }
}
