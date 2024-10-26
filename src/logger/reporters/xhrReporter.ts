import type { ILogsReporter, LogMessage } from "../contracts";

/**
 * HTTP Reporter options.
 */
export class XhrReporterOptions {
  /**
   * Endpoint that receives the logs.
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

  constructor(options: XhrReporterOptions) {
    if (!options) {
      throw new Error('Argument "options" is required');
    }

    this._messageQueue = [];
    this._options = options;
    this._reportActionTimeoutRef = undefined;
    this._reportActionPromise = null;
    this._disposed = false;
  }

  /**
   * @inheritdoc
   */
  public register(message: LogMessage): void {
    if (this._disposed) {
      return;
    }

    this._messageQueue.push(message);
    this._scheduleNextProcessAction();
  }

  /**
   * @inheritdoc
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    if (this._disposed) {
      return Promise.resolve();
    }

    await (this._reportActionPromise ?? this._processMessages());
    this._disposed = true;
  }

  private _scheduleNextProcessAction(): void {
    if (this._reportActionTimeoutRef) {
      return; // Already scheduled
    }

    const interval = this._messageQueue.length >= this._options.batchSize ? 0 : this._options.interval;

    this._reportActionTimeoutRef = setTimeout(() => {
      this._reportActionPromise = this._processMessages().then(() => {
        const prevRef = this._reportActionTimeoutRef;
        this._reportActionTimeoutRef = undefined;
        clearTimeout(prevRef);
        this._reportActionPromise = null;
        this._scheduleNextProcessAction();
      });
    }, interval);
  }

  private async _processMessages(): Promise<void> {
    let messages: Array<LogMessage>;
    let success: boolean;

    while (this._messageQueue.length > 0) {
      messages = this._messageQueue.splice(0, Math.min(this._messageQueue.length, this._options.batchSize));
      success = await this._sendMessagesBatch(messages);
      if (!success) {
        this._messageQueue.unshift(...messages);
        return;
      }
    }
  }

  private _sendMessagesBatch(messages: Array<LogMessage>): Promise<boolean> {
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
      request.send(JSON.stringify(messages));
    });
  }
}
