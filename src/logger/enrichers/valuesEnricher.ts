import type { ExtraParams, ILogMessageEnricher, LogMessage } from "../contracts";

export class ValuesEnricher implements ILogMessageEnricher {
  private _values: ExtraParams;
  private _overrideExisting: boolean;

  /**
   * Constructor.
   *
   * @param {ExtraParams} values The values to add to the log.
   * @param {boolean} overrideExisting Override a value if it already exists.
   */
  constructor(values: ExtraParams, overrideExisting: boolean) {
    this._values = values;
    this._overrideExisting = overrideExisting;
  }

  /**
   * @inheritdoc
   */
  enrich(message: LogMessage): void {
    if (!this._values) {
      return;
    }
    message.extraParams = message.extraParams || {};

    const existingKeys = Object.keys(message.extraParams);
    for (const name in this._values) {
      if (existingKeys.indexOf(name) !== -1 && !this._overrideExisting) {
        continue;
      }

      message.extraParams[name] = this._values[name];
    }
  }
}
