import type { ILogsReporter, LogMessage } from "../contracts";

/**
 * An implementations that can report to multiple implementations of `ILogsReporter`.
 */
export class MultipleReporter implements ILogsReporter {
  private readonly _reporters: ILogsReporter[];
  private _cachedEndpoints: string[] | undefined;

  constructor(reporters: ILogsReporter[]) {
    this._reporters = reporters || [];
  }

  /**
   * @inheritdoc
   *
   * The returned array reference is stable while the child endpoints are unchanged, so hot-path
   * consumers (network capture) can cheaply detect changes.
   */
  get endpoints(): string[] {
    const fresh = this._reporters.flatMap((reporter) => reporter.endpoints ?? []);
    const cached = this._cachedEndpoints;
    if (cached && cached.length === fresh.length && cached.every((value, ix) => value === fresh[ix])) {
      return cached;
    }

    this._cachedEndpoints = fresh;
    return fresh;
  }

  /**
   * @inheritdoc
   *
   * A reporter that throws does not prevent the remaining reporters from receiving the message.
   */
  register(message: LogMessage): void {
    for (const reporter of this._reporters) {
      try {
        reporter.register(message);
      } catch {
        // Isolate reporters from each other; the logging pipeline must never throw.
      }
    }
  }

  /**
   * @inheritdoc
   *
   * All reporters are disposed even when some of them reject.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    const proms: PromiseLike<void>[] = [];

    for (const reporter of this._reporters) {
      try {
        proms.push(reporter[Symbol.asyncDispose]());
      } catch {
        // A synchronously throwing dispose must not prevent disposing the remaining reporters.
      }
    }

    if (proms.length) {
      await Promise.allSettled(proms);
    }
  }
}
