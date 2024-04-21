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
   * The minimum number of items to send in a batch.
   */
  public minimumBatchSize = 20;
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
  private _messageQueue: LogMessage[];
  private _options: XhrReporterOptions;
  private _reportActionTimeoutRef: ReturnType<typeof setTimeout> | null;
  private _reportActionPromise: Promise<void> | null;
  private _disposed: boolean;

  constructor(options: XhrReporterOptions) {
    if (!options) {
      throw new Error('Argument "options" is required');
    }

    this._messageQueue = [];
    this._options = options;
    this._reportActionTimeoutRef = null;
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
    this._signalReport(false);
  }

  /**
   * @inheritdoc
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    if (this._disposed) {
      return Promise.resolve();
    }

    this._signalReport(true);
    const result = this._reportActionPromise === null ? Promise.resolve() : this._reportActionPromise;

    await result;
    this._disposed = true;
    this._clearPreviousTimeout();
  }

  private _signalReport(triggerNow: boolean): void {
    if (this._reportActionPromise !== null || this._messageQueue.length === 0) {
      return; // We are in the process of reporting now.
    }

    if (triggerNow || this._messageQueue.length >= this._options.minimumBatchSize) {
      this._reportActionPromise = this._reportCore().then(() => {
        // Reset promise and signal a new reporting action.
        this._reportActionPromise = null;
        this._signalReport(false);
      });
      // Once reporting is done a new interval shall be started.
      this._clearPreviousTimeout();
    } else {
      this._scheduleNextReportAction();
    }
  }

  private _clearPreviousTimeout(): void {
    if (!this._reportActionTimeoutRef) {
      return;
    }

    clearTimeout(this._reportActionTimeoutRef);
    this._reportActionTimeoutRef = null;
  }

  private _scheduleNextReportAction(): void {
    if (this._reportActionTimeoutRef) {
      return;
    }

    this._clearPreviousTimeout();
    this._reportActionTimeoutRef = setTimeout(() => {
      this._clearPreviousTimeout();
      this._signalReport(true);
    }, this._options.interval);
  }

  private _reportCore(): Promise<void> {
    const messages = this._messageQueue.splice(0);
    return new Promise((resolve) => {
      const completeFn = (success: boolean) => {
        if (!success) {
          this._messageQueue = this._messageQueue.concat(messages);
        }

        resolve();
      };

      const request = new XMLHttpRequest();
      request.open(this._options.verb, this._options.endpoint);
      request.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
      if (this._options.requestTransform) {
        this._options.requestTransform(request);
      }
      request.onload = function () {
        completeFn(this.status >= 200 && this.status < 300);
      };
      request.onerror = () => {
        completeFn(false);
      };
      request.onabort = () => {
        completeFn(false);
      };
      request.send(JSON.stringify(messages));
    });
  }
}
