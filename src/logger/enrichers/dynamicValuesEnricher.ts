import { assignSafeValues } from "../../common/objectSafety";
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
    let values: ExtraParams | undefined;
    try {
      values = typeof this._valuesFn === "function" ? this._valuesFn() : undefined;
    } catch {
      // A throwing values function must not break the logging pipeline.
      return;
    }
    if (!values) {
      return;
    }
    message.extraParams = message.extraParams || {};

    assignSafeValues(message.extraParams, values, this._overrideExisting);
  }
}
