import type { ExtraParams, ILogMessageEnricher, LogMessage } from "../contracts";

/**
 * A function that returns the values to add to the log.
 */
export type DynamicValuesFunction = () => ExtraParams;

export class DynamicValuesEnricher implements ILogMessageEnricher {
  private readonly _valuesFn: DynamicValuesFunction;
  private readonly _overrideExisting: boolean;

  /**
   * Constructor.
   *
   * @param {DynamicValuesFunction} valuesFunction The values to add to the log.
   * @param {boolean} overrideExisting Override a value if it already exists.
   */
  constructor(valuesFunction: DynamicValuesFunction, overrideExisting: boolean) {
    this._valuesFn = valuesFunction;
    this._overrideExisting = overrideExisting;
  }

  /**
   * @inheritdoc
   */
  enrich(message: LogMessage): void {
    const values = typeof this._valuesFn === "function" ? this._valuesFn() : undefined;
    if (!values) {
      return;
    }
    message.extraParams = message.extraParams || {};

    const existingKeys = Object.keys(message.extraParams);
    for (const name in values) {
      if (existingKeys.indexOf(name) !== -1 && !this._overrideExisting) {
        continue;
      }

      message.extraParams[name] = values[name];
    }
  }
}
