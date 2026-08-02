import { type ExtraParams, type ILogger, type ILogsReporter, LogLevel, LogMessage } from "./contracts";
import type { LoggerOptions } from "./loggerOptions";

/**
 * The maximum length of an error serialized as a fallback message. Limits the size of
 * arbitrary object graphs (and any data they contain) ending up in shipped log messages.
 */
const MAX_SERIALIZED_ERROR_LENGTH = 2_048;

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeSerializeError(error: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(error);
  } catch {
    try {
      serialized = String(error);
    } catch {
      // Both serialization attempts failed; fall through to the placeholder.
    }
  }
  serialized ??= "[unserializable error]";
  return serialized.length > MAX_SERIALIZED_ERROR_LENGTH
    ? serialized.slice(0, MAX_SERIALIZED_ERROR_LENGTH)
    : serialized;
}

/**
 * Logging service.
 */
export class Logger implements ILogger {
  private readonly _options: LoggerOptions;
  private readonly _pending: LogMessage[] = [];
  private _flushTimeoutRef: ReturnType<typeof setTimeout> | undefined;
  private _disposed = false;

  /**
   * Constructor.
   *
   * @param {LoggerOptions} options The logger options.
   */
  constructor(options: LoggerOptions) {
    this._options = options;
  }

  /**
   * @inheritdoc
   */
  public get reporter(): ILogsReporter | null {
    return this._options.reporter;
  }

  /**
   * The core logging method.
   *
   * @param {LogMessage} message The message to log.
   */
  private logMessageCore(message: LogMessage): void {
    if (!this._options.reporter) {
      return;
    }

    message.name = this._options.name;
    for (const enricher of this._options.enrichers) {
      enricher.enrich(message);
    }
    this._options.reporter.register(message);
  }

  /**
   * @inheritdoc
   *
   * Pending messages are flushed to the reporter before it is disposed. Messages logged
   * after disposal are dropped.
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    clearTimeout(this._flushTimeoutRef);
    this._flushTimeoutRef = undefined;
    this._flushPending();

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
   *
   * Errors thrown by enrichers or the reporter are swallowed: logging runs in a deferred task,
   * where an escaping exception would surface as an uncaught global error — and re-enter any
   * global error capture (see `autoInstrument`) in an infinite loop.
   */
  public logMessage(message: LogMessage): void {
    if (this._disposed || !this.isEnabled(message.level)) return;

    this._pending.push(message);
    this._flushTimeoutRef ??= setTimeout(() => {
      this._flushTimeoutRef = undefined;
      this._flushPending();
    }, 1);
  }

  private _flushPending(): void {
    const pending = this._pending.splice(0);
    for (const message of pending) {
      try {
        this.logMessageCore(message);
      } catch {
        // Intentionally dropped; the logging pipeline must never throw into the host application.
      }
    }
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
          message: asOptionalString(record.message) ?? asOptionalString(record.Message),
          stack:
            asOptionalString(record.stack) ??
            asOptionalString(record.Stack) ??
            asOptionalString(record.stackTrace) ??
            asOptionalString(record.StackTrace),
        };

        r.message ??= safeSerializeError(error);
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
