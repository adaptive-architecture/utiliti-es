import type { IPubSubHub, MessageData, MessageHandler } from "./contracts";
import type { AdaInternals } from "./internalContracts";

/**
 * The context for a PubSubPlugin action.
 */
export type PubSubPluginContext = {
  /**
   * The topic of the message.
   */
  topic?: string;
  /**
   * The message data.
   */
  message?: MessageData;
  /**
   * Internal metadata stripped from the message, preserved so every plugin in the chain can
   * still observe it. Reserved for internal use.
   *
   * @internal
   */
  _adaInternals?: AdaInternals;
};

/**
 * A plugin to extend the PubSubHub.
 */
export type PubSubPlugin = {
  /**
   * Called when the plugin is initialized.
   */
  init?(hub: IPubSubHub): void;

  /**
   * Called right before a message is published.
   */
  onPublish?(context: PubSubPluginContext): void;

  /**
   * Dispose of the plugin.
   */
  [Symbol.dispose]?(): void;
};

/**
 * The options for the PubSubHub.
 */
export type PubSubHubOptions = {
  /**
   * The plugins to use.
   */
  plugins?: Array<PubSubPlugin>;
};

type TimeoutRef = {
  ref?: ReturnType<typeof setTimeout>;
};

type SubscriptionTracker = {
  handler: MessageHandler;
  timeouts: Set<TimeoutRef>;
};

const clearTimeoutRef = (tracker: SubscriptionTracker, timeout: TimeoutRef) => {
  clearTimeout(timeout.ref);
  timeout.ref = undefined;
  tracker.timeouts.delete(timeout);
};

const clearTrackerTimeouts = (tracker: SubscriptionTracker) => {
  for (const timeout of tracker.timeouts) {
    clearTimeout(timeout.ref);
    timeout.ref = undefined;
  }
  tracker.timeouts.clear();
};

function isValidTopic(topic: unknown): topic is string {
  return typeof topic === "string" && topic.length > 0;
}

function isValidMessage(message: unknown): message is MessageData {
  return typeof message === "object" && message !== null && !Array.isArray(message);
}

/**
 * A PubSub implementation.
 */
export class PubSubHub implements IPubSubHub {
  private readonly _subscriptions: Map<string, Map<string, SubscriptionTracker>> = new Map();
  private readonly _options: PubSubHubOptions | undefined;
  private _disposed = false;

  /**
   *
   */
  constructor(options?: PubSubHubOptions) {
    this._options = options;

    if (this._options?.plugins) {
      for (const plugin of this._options.plugins) {
        if (!plugin.init) {
          continue;
        }
        plugin.init(this);
      }
    }
  }

  /**
   * @inheritdoc
   *
   * The topic and message are validated before any plugin runs, so plugins never observe
   * (or broadcast) an invalid payload. Handler exceptions are contained and do not affect
   * other subscribers. Throws when the hub has been disposed.
   */
  publish(topic: string, message: MessageData): void {
    this._throwIfDisposed();

    if (!isValidTopic(topic)) {
      throw new Error("Invalid topic.");
    }

    if (!isValidMessage(message)) {
      throw new Error("Invalid message.");
    }

    const context: PubSubPluginContext = {
      topic,
      message,
    };

    if (this._options?.plugins) {
      for (const plugin of this._options.plugins) {
        if (!plugin.onPublish) {
          continue;
        }
        plugin.onPublish(context);
      }
    }

    // Plugins may replace the context values; re-validate before delivery.
    if (!isValidTopic(context.topic)) {
      throw new Error("Invalid topic.");
    }

    if (!isValidMessage(context.message)) {
      throw new Error("Invalid message.");
    }

    const subTrackers = this._subscriptions.get(context.topic);
    if (subTrackers) {
      for (const tracker of subTrackers.values()) {
        const timeout: TimeoutRef = {};
        tracker.timeouts.add(timeout);
        timeout.ref = setTimeout(
          (ctx: SubscriptionTracker, timeoutRef: TimeoutRef, msgTopic: string, msgData: MessageData) => {
            try {
              ctx.handler(msgTopic, msgData);
            } catch {
              // Contain subscriber exceptions; they must not surface as uncaught timer errors.
            } finally {
              clearTimeoutRef(ctx, timeoutRef);
            }
          },
          0,
          tracker,
          timeout,
          context.topic,
          structuredClone(context.message),
        );
      }
    }
  }

  /**
   * @inheritdoc
   *
   * Throws when the hub has been disposed.
   */
  subscribe(topic: string, handler: MessageHandler): string {
    this._throwIfDisposed();

    if (!isValidTopic(topic)) {
      throw new Error("Invalid topic.");
    }

    if (typeof handler !== "function") {
      throw new TypeError("Invalid handler.");
    }

    let subscriptionTrackers = this._subscriptions.get(topic);
    if (!subscriptionTrackers) {
      subscriptionTrackers = new Map();
      this._subscriptions.set(topic, subscriptionTrackers);
    }

    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(16).slice(2)}`; // NOSONAR S2245 Non-cryptographic randomness is acceptable here
    subscriptionTrackers.set(subscriptionId, { handler: handler, timeouts: new Set() });
    return subscriptionId;
  }

  /**
   * @inheritdoc
   *
   * Cancels only this subscription's pending deliveries; other subscribers are unaffected.
   * Safe to call multiple times and after dispose.
   */
  unsubscribe(subscriptionId: string): void {
    if (!subscriptionId || this._disposed) {
      return;
    }

    for (const [topic, subscriptionTrackers] of this._subscriptions) {
      const tracker = subscriptionTrackers.get(subscriptionId);
      if (!tracker) {
        continue;
      }

      clearTrackerTimeouts(tracker);
      subscriptionTrackers.delete(subscriptionId);
      if (subscriptionTrackers.size === 0) {
        this._subscriptions.delete(topic);
      }
      return;
    }
  }

  /**
   * Dispose the hub: cancels all pending deliveries, removes all subscriptions and disposes
   * the plugins. Idempotent; `publish` and `subscribe` throw after disposal.
   */
  [Symbol.dispose](): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    for (const subscriptionTrackers of this._subscriptions.values()) {
      for (const tracker of subscriptionTrackers.values()) {
        clearTrackerTimeouts(tracker);
      }
    }
    this._subscriptions.clear();

    if (this._options?.plugins) {
      for (const plugin of this._options.plugins) {
        const disposeFn = plugin[Symbol.dispose];
        if (!disposeFn) {
          continue;
        }
        try {
          disposeFn.call(plugin);
        } catch {
          // A throwing plugin must not prevent disposing the remaining plugins.
        }
      }
    }
  }

  private _throwIfDisposed(): void {
    if (this._disposed) {
      throw new Error("PubSubHub has been disposed.");
    }
  }
}
