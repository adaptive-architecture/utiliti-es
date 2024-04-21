import { type ILogMessageEnricher, type ILogsReporter, LogLevel } from "./contracts";

/**
 * Options class for logger configuration.
 */
export class LoggerOptions {
  /**
   * The name of the logger.
   */
  public name = "";

  /**
   * The reporter for the messages.
   */
  public reporter: ILogsReporter | null = null;

  /**
   * The minimum log level.
   */
  public minimumLevel: LogLevel = LogLevel.Warning;

  /**
   * Log enrichers.
   */
  public enrichers: ILogMessageEnricher[] = [];

  /**
   * Get the LogLevel from a string value.
   *
   * @param {String} level The log level as string.
   */
  public static getLevel(level: string): LogLevel {
    switch ((level || "").toUpperCase()) {
      case "TRACE":
        return LogLevel.Trace;
      case "DEBUG":
        return LogLevel.Debug;
      case "INFORMATION":
        return LogLevel.Information;
      case "WARNING":
        return LogLevel.Warning;
      case "ERROR":
        return LogLevel.Error;
      case "CRITICAL":
        return LogLevel.Critical;
      case "NONE":
        return LogLevel.None;
      default:
        return LogLevel.None;
    }
  }
}
