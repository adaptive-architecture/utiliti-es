import { type ILogger, LogLevel } from "../../logger";
import type { PubSubPlugin, PubSubPluginContext } from "../pubsub";

/**
 * A plugin to log messages.
 */
export class LoggerPlugin implements PubSubPlugin {
  private readonly _logger: ILogger;
  private readonly _logLevel: LogLevel;

  /**
   * Constructor.
   *
   * @param {Logger} logger The logger.
   * @param {LogLevel} logLevel The log level.
   */
  constructor(logger: ILogger, logLevel: LogLevel = LogLevel.Information) {
    this._logger = logger;
    this._logLevel = logLevel;
  }

  /** @inheritdoc */
  onPublish(context: PubSubPluginContext) {
    this._logger.log(this._logLevel, `Publishing message to topic: ${context.topic}`, undefined, {
      topic: context.topic ?? null,
      message: context.message ?? null,
    });
  }
}
