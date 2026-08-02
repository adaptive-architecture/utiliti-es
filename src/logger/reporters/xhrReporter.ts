import type { ILogsReporter, LogMessage } from "../contracts";

/**
 * HTTP Reporter options.
 */
export class XhrReporterOptions {
  /**
   * Endpoint that receives the logs. Required; the reporter throws when it is empty.
   */
  public endpoint = "";
  /**
   * HTTP verb used when calling the endpoint.
   */
  public verb = "POST";
  /**
   * The number of items to send in a batch.
   */
  public batchSize = 20;
  /**
   * The maximum interval, in milliseconds, to wait for the batch size to be achieved before reporting.
   */
  public interval = 2_000;
  /**
   * The maximum number of messages retained while the endpoint is unreachable.
   * The oldest messages are dropped first.
   */
  public maxQueueSize = 1_000;
  /**
   * The maximum retry interval, in milliseconds. After a failed delivery the retry interval
   * doubles on each consecutive failure up to this value, and resets on success.
   */
  public maxBackoffInterval = 30_000;

  /**
   * A function that can be used to transform the request before sending it.
   */
  public requestTransform?: (request: XMLHttpRequest) => void;
}

export class XhrReporter implements ILogsReporter {
  private readonly _messageQueue: LogMessage[];
  private readonly _options: XhrReporterOptions;
  private _reportActionTimeoutRef: ReturnType<typeof setTimeout> | undefined;
  private _reportActionPromise: Promise<void> | null;
  private _disposed: boolean;
  private _consecutiveFailures: number;

  constructor(options: XhrReporterOptions) {
    if (!options) {
      throw new Error('Argument "options" is required');
    }

    if (!options.endpoint) {
      throw new Error('A non-empty "endpoint" is required.');
    }

    if (!/^[A-Za-z]+$/.test(options.verb)) {
      throw new Error(`Invalid HTTP verb "${options.verb}".`);
    }

    this._messageQueue = [];
    this._options = options;
    this._reportActionTimeoutRef = undefined;
    this._reportActionPromise = null;
    this._disposed = false;
    this._consecutiveFailures = 0;
  }

  /**
   * @inheritdoc
   */
  public get endpoints(): string[] {
    return [this._options.endpoint];
  }

  /**
   * @inheritdoc
   */
  public register(message: LogMessage): void {
    if (this._disposed) {
      return;
    }

    this._messageQueue.push(message);
    this._trimQueue();

    if (
      this._reportActionTimeoutRef &&
      !this._reportActionPromise &&
      this._consecutiveFailures === 0 &&
      this._messageQueue.length >= this._options.batchSize
    ) {
      // A full batch accelerates a pending long-interval flush.
      clearTimeout(this._reportActionTimeoutRef);
      this._reportActionTimeoutRef = undefined;
    }

    this._scheduleNextProcessAction();
  }

  /**
   * @inheritdoc
   *
   * Stops the flush timer and attempts one final delivery of the queued messages;
   * messages that cannot be delivered are dropped.
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    clearTimeout(this._reportActionTimeoutRef);
    this._reportActionTimeoutRef = undefined;

    if (this._reportActionPromise) {
      await this._reportActionPromise;
    }

    await this._processMessages();
    this._messageQueue.length = 0;
  }

  private _trimQueue(): void {
    const overflow = this._messageQueue.length - this._options.maxQueueSize;
    if (overflow > 0) {
      this._messageQueue.splice(0, overflow);
    }
  }

  private _scheduleNextProcessAction(): void {
    if (this._disposed || this._reportActionTimeoutRef || this._reportActionPromise) {
      return; // Disposed, already scheduled, or currently processing.
    }

    if (this._messageQueue.length === 0) {
      return; // Nothing to deliver; the next register() schedules a flush.
    }

    let interval = this._messageQueue.length >= this._options.batchSize ? 0 : this._options.interval;
    if (this._consecutiveFailures > 0) {
      interval = Math.min(this._options.interval * 2 ** this._consecutiveFailures, this._options.maxBackoffInterval);
    }

    this._reportActionTimeoutRef = setTimeout(() => {
      this._reportActionTimeoutRef = undefined;
      this._reportActionPromise = this._processMessages().finally(() => {
        this._reportActionPromise = null;
        this._scheduleNextProcessAction();
      });
    }, interval);
  }

  private async _processMessages(): Promise<void> {
    while (this._messageQueue.length > 0) {
      const messages = this._messageQueue.splice(0, Math.min(this._messageQueue.length, this._options.batchSize));

      let body: string;
      try {
        body = JSON.stringify(messages);
      } catch {
        continue; // A batch that cannot be serialized is dropped; later batches still ship.
      }

      let success: boolean;
      try {
        success = await this._sendMessagesBatch(body);
      } catch {
        success = false;
      }

      if (!success) {
        this._consecutiveFailures += 1;
        if (!this._disposed) {
          this._messageQueue.unshift(...messages);
          this._trimQueue();
        }
        return;
      }

      this._consecutiveFailures = 0;
    }
  }

  private _sendMessagesBatch(body: string): Promise<boolean> {
    return new Promise((resolve) => {
      const failureHandler = () => {
        resolve(false);
      };
      const request = new XMLHttpRequest();
      request.open(this._options.verb, this._options.endpoint);
      request.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
      if (this._options.requestTransform) {
        this._options.requestTransform(request);
      }
      request.onload = function () {
        resolve(this.status >= 200 && this.status < 300);
      };
      request.onerror = failureHandler;
      request.onabort = failureHandler;
      request.send(body);
    });
  }
}
