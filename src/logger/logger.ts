import { type ExtraParams, type ILogger, LogLevel, LogMessage } from "./contracts";
import type { LoggerOptions } from "./loggerOptions";

/**
 * Logging service.
 */
export class Logger implements ILogger {
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
   * @inheritdoc
   */
  public isEnabled(level: LogLevel): boolean {
    return level !== LogLevel.None && level >= this._options.minimumLevel;
  }
  /**
   * @inheritdoc
   */
  public trace(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Trace;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * @inheritdoc
   */
  public debug(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Debug;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * @inheritdoc
   */
  public info(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Information;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * @inheritdoc
   */
  public warn(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Warning;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * @inheritdoc
   */
  public error(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Error;
    message.message = msg;
    this.logMessage(message);
  }
  /**
   * @inheritdoc
   */
  public crit(msg: string): void {
    const message = new LogMessage();
    message.level = LogLevel.Critical;
    message.message = msg;
    this.logMessage(message);
  }

  /**
   * @inheritdoc
   */
  public log(level: LogLevel, message: string, error?: unknown, params?: ExtraParams): void {
    const msg = new LogMessage();
    const errorDetails = this._extractErrorDetails(error);
    msg.level = level;
    msg.message = message;
    msg.errorMessage = errorDetails?.message;
    msg.stackTrace = errorDetails?.stack;
    msg.extraParams = params;

    this.logMessage(msg);
  }

  /**
   * @inheritdoc
   */
  public logMessage(message: LogMessage): void {
    if (!this.isEnabled(message.level)) return;

    setTimeout(() => {
      this.logMessageCore(message);
    }, 1);
  }

  private _extractErrorDetails(error: unknown): { message?: string; stack?: string } | undefined {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }

    switch (typeof error) {
      case "string":
        return { message: error };
      case "object": {
        const record = error as Record<string, unknown>;
        if (record === null) {
          break;
        }

        const r = {
          message: (record.message ?? record.Message) as string | undefined,
          stack: (record.stack ?? record.Stack ?? record.stackTrace ?? record.StackTrace) as string | undefined,
        };

        if (r.message === undefined) {
          r.message = JSON.stringify(error);
        }

        return r;
      }
      default: {
        const str = error as { toString?: () => string };
        if (typeof str?.toString === "function") {
          return { message: str.toString() };
        }
        break;
      }
    }

    return undefined;
  }
}
