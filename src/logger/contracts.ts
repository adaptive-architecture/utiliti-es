import type { SerializableValues } from "../common";

/**
 * Log level
 */
export enum LogLevel {
  /**
   * Logs that contain the most detailed messages. These messages may contain sensitive application data. These messages are disabled by default and should never be enabled in a production environment.
   */
  Trace = 0,
  /**
   * Logs that are used for interactive investigation during development. These logs should primarily contain information useful for debugging and have no long-term value.
   */
  Debug = 1,
  /**
   * Logs that track the general flow of the application. These logs should have long-term value.
   */
  Information = 2,
  /**
   * Logs that highlight an abnormal or unexpected event in the application flow, but do not otherwise cause the application execution to stop.
   */
  Warning = 3,
  /**
   * Logs that highlight when the current flow of execution is stopped due to a failure. These should indicate a failure in the current activity, not an application-wide failure.
   */
  Error = 4,
  /**
   * Logs that describe an unrecoverable application or system crash, or a catastrophic failure that requires immediate attention.
   */
  Critical = 5,
  /**
   * Not used for writing log messages. Specifies that a logging category should not write any messages.
   */
  None = 6,
}

/**
 * Extra parameters to log.
 */
export type ExtraParams = { [id: string]: SerializableValues };

/**
 * Base logging message
 */
export class LogMessage {
  /**
   * The timestamp of the log message.
   */
  public timestamp: number = new Date().getTime();
  /**
   * The level of the log message.
   */
  public level: LogLevel = LogLevel.None;
  /**
   * The name of the logger.
   */
  public name = "";
  /**
   * The message to log.
   */
  public message = "";
  /**
   * The error message.
   */
  public errorMessage?: string;
  /**
   * The stack trace of the error.
   */
  public stackTrace?: string;
  /**
   * Any extra parameters to log.
   */
  public extraParams?: ExtraParams;
}

/**
 * Contract for the component responsible for reporting the logs.
 */
export interface ILogsReporter extends AsyncDisposable {
  /**
   * Register a message to be reported immediately or queue for reporting at a latter point.
   *
   * @param {LogMessage} message The message to register.
   */
  register(message: LogMessage): void;
}

/**
 * Enrich the log message with extra information.
 */
export interface ILogMessageEnricher {
  /**
   * Enrich the log message with extra information.
   *
   * @param message The log message.
   */
  enrich(message: LogMessage): void;
}

/**
 * Logging service.
 */
/**
 * Interface for logging operations.
 */
export interface ILogger extends AsyncDisposable {
  /**
   * Indicates if the specified level will be logged.
   */
  isEnabled(level: LogLevel): boolean;

  /**
   * Log trace.
   */
  trace(msg: string): void;

  /**
   * Log debug.
   */
  debug(msg: string): void;

  /**
   * Log information.
   */
  info(msg: string): void;

  /**
   * Log warning.
   */
  warn(msg: string): void;

  /**
   * Log error.
   */
  error(msg: string): void;

  /**
   * Log critical.
   */
  crit(msg: string): void;

  /**
   * Log an event.
   */
  log(level: LogLevel, message: string, e?: Error, params?: ExtraParams): void;

  /**
   * Log a message.
   */
  logMessage(message: LogMessage): void;
}
