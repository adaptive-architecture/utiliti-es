import { type ExtraParams, LogLevel, LogMessage } from "./contracts";
import type { LoggerOptions } from "./loggerOptions";

/**
 * Logging service.
 */
export class Logger implements AsyncDisposable {
  private readonly _options: LoggerOptions;

  /**
   * Constructor.
   *
   * @param {LoggerOptions} options The logger options.
   */
  constructor(options: LoggerOptions) {
    this._options = options;
  }

  /**
   * The core logging method.
   *
   * @param {LogMessage} message The message to log.
   */
  private logMessageCore(message: LogMessage): void {
    message.name = this._options.name;
    for (const enricher of this._options.enrichers) {
      enricher.enrich(message);
    }
    this._options.reporter?.register(message);
  }

  /**
   * @inheritdoc
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    await this._options.reporter?.[Symbol.asyncDispose]();
  }

  /**
   * Indicates if the specified level will be logged.
   *
   * @param {LogLevel} level The log level.
   */
  public isEnabled(level: LogLevel): boolean {
    return level !== LogLevel.None && level >= this._options.minimumLevel;
  }
  /**
   * Log trace.
   *
   * @param msg The message to log.
   */
  public trace(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Trace;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * Log debug.
   *
   * @param msg The message to log.
   */
  public debug(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Debug;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * Log information.
   *
   * @param msg The message to log.
   */
  public info(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Information;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * Log warning.
   *
   * @param msg The message to log.
   */
  public warn(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Warning;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * Log error.
   *
   * @param msg The message to log.
   */
  public error(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Error;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * Log error.
   *
   * @param msg The message to log.
   */
  public crit(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Critical;
    message.message = msg;
    this.logMessage(message);
  }

  /**
   * Log an event.
   *
   * @param {LogLevel} level The level to log the event.
   * @param {String} message Custom message.
   * @param {Error} e The error associated with the event.
   * @param {ExtraParams} params Extra parameters.
   */
  public log(level: LogLevel, message: string, e?: Error, params?: ExtraParams): void {
    const msg = new LogMessage();
    msg.level = level;
    msg.message = message;
    msg.errorMessage = e?.message;
    msg.stackTrace = e?.stack;
    msg.extraParams = params;

    this.logMessage(msg);
  }

  /**
   * Log a message.
   *
   * @param {LogMessage} message The message to log.
   */
  public logMessage(message: LogMessage): void {
    if (!this.isEnabled(message.level)) return;

    setTimeout(() => {
      this.logMessageCore(message);
    }, 1);
  }
}
