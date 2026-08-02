import type { ILogsReporter, LogMessage } from "../contracts";

/**
 * An implementations that keeps the messages in memory in a collection.
 * DO NOT user this in production. This is meant for unit tests.
 */
export class InMemoryReporter implements ILogsReporter {
  private readonly _messages: LogMessage[] = [];
  private readonly _maxMessages: number | undefined;

  /**
   * Constructor.
   *
   * @param {number?} maxMessages Optional maximum number of retained messages; when exceeded the
   * oldest messages are dropped. Unbounded when omitted.
   */
  constructor(maxMessages?: number) {
    this._maxMessages = maxMessages;
  }

  public get messages(): LogMessage[] {
    return this._messages.slice();
  }

  /**
   * @inheritdoc
   */
  register(message: LogMessage): void {
    this._messages.push(message);
    if (this._maxMessages !== undefined && this._messages.length > this._maxMessages) {
      this._messages.splice(0, this._messages.length - this._maxMessages);
    }
  }

  /**
   * @inheritdoc
   *
   * Clears the retained messages.
   */
  [Symbol.asyncDispose](): Promise<void> {
    this._messages.length = 0;
    return Promise.resolve();
  }
}
