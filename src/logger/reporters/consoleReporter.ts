import { type ILogsReporter, LogLevel, type LogMessage } from "../contracts";

/**
 * Abstraction over the `Console` API.
 */
export interface IReporterConsole {
  debug(...data: unknown[]): void;
  error(...data: unknown[]): void;
  info(...data: unknown[]): void;
  log(...data: unknown[]): void;
  trace(...data: unknown[]): void;
  warn(...data: unknown[]): void;
}

/**
 * An implementations that outputs the messages to the console.
 * DO NOT user this in production. This is meant for development only.
 * Depending on the browser settings some messages might noy be output to the console.
 */
export class ConsoleReporter implements ILogsReporter {
  private _console: IReporterConsole;

  /**
   * Constructor.
   *
   * @param {Console} console The current console reference.
   */
  constructor(console: IReporterConsole) {
    this._console = console;
  }

  /**
   * @inheritdoc
   */
  register(message: LogMessage): void {
    let fn: unknown = null;
    if (this._console) {
      /* eslint-disable @typescript-eslint/unbound-method */
      switch (message.level) {
        case LogLevel.Trace:
          fn = this._console.trace || this._console.log;
          break;
        case LogLevel.Debug:
          fn = this._console.debug || this._console.log;
          break;
        case LogLevel.Information:
          fn = this._console.info || this._console.log;
          break;
        case LogLevel.Warning:
          fn = this._console.warn || this._console.log;
          break;
        case LogLevel.Error:
          fn = this._console.error || this._console.log;
          break;
        case LogLevel.Critical:
          fn = this._console.error || this._console.log;
          break;
        // case LogLevel.None: // Do not log.
        default:
          fn = null;
          break;
      }
      /* eslint-enable @typescript-eslint/unbound-method */
    }

    if (typeof fn === "function") {
      /* eslint-disable @typescript-eslint/no-unsafe-member-access */
      /* eslint-disable @typescript-eslint/no-unsafe-call */
      fn.call(this._console, message.message, message);
      /* eslint-enable @typescript-eslint/no-unsafe-call */
      /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    }
  }

  /**
   * @inheritdoc
   */
  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}
