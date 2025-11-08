import type { IPubSubHub, MessageData, MessageHandler } from "./contracts";

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
  timeouts: Array<TimeoutRef>;
};

const clearTimeoutRef = (tracker: SubscriptionTracker, timeout: TimeoutRef) => {
  clearTimeout(timeout.ref);
  timeout.ref = undefined;
  const ix = tracker.timeouts.indexOf(timeout);
  tracker.timeouts.splice(ix, 1);
};

/**
 * A PubSub implementation.
 */
export class PubSubHub implements IPubSubHub {
  private readonly _subscriptions: Map<string, Map<string, SubscriptionTracker>> = new Map();
  private readonly _options: PubSubHubOptions | undefined;

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

  /** @inheritdoc */
  publish(topic: string, message: MessageData): void {
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

    if (!context.topic) {
      throw new Error("Invalid topic.");
    }

    if (!context.message) {
      throw new Error("Invalid message.");
    }

    const subTrackers = this._subscriptions.get(context.topic);
    if (subTrackers) {
      for (const tracker of subTrackers.values()) {
        const timeout: TimeoutRef = {};
        tracker.timeouts.push(timeout);
        timeout.ref = setTimeout(
          (ctx, timeout, topic, message) => {
            ctx.handler(topic, message);
            clearTimeoutRef(tracker, timeout);
          },
          0,
          tracker,
          timeout,
          structuredClone(context.topic),
          structuredClone(context.message),
        );
      }
    }
  }

  /** @inheritdoc */
  subscribe(topic: string, handler: MessageHandler): string | null {
    if (!topic) {
      throw new Error("Invalid topic.");
    }

    if (!handler) {
      throw new Error("Invalid handler.");
    }

    let subscriptionTrackers = this._subscriptions.get(topic);
    if (!subscriptionTrackers) {
      subscriptionTrackers = new Map();
      this._subscriptions.set(structuredClone(topic), subscriptionTrackers);
    }

    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(16).slice(2)}`; // NOSONAR S2245 Non-cryptographic randomness is acceptable here
    subscriptionTrackers.set(subscriptionId, { handler: handler, timeouts: [] });
    return subscriptionId;
  }

  /** @inheritdoc */
  unsubscribe(subscriptionId: string): void {
    if (!subscriptionId) {
      return;
    }

    for (const subscriptionTrackers of this._subscriptions.values()) {
      for (const tracker of subscriptionTrackers.values()) {
        while (true) {
          const timeout = tracker.timeouts.pop();
          if (!timeout) {
            break;
          }
          clearTimeoutRef(tracker, timeout);
        }
      }

      if (subscriptionTrackers.delete(subscriptionId)) {
        return;
      }
    }
  }

  [Symbol.dispose]() {
    for (const subTrackers of this._subscriptions.values()) {
      for (const trackerId of subTrackers.keys()) {
        this.unsubscribe(trackerId);
      }
    }

    this._subscriptions.clear();

    if (this._options?.plugins) {
      for (const plugin of this._options.plugins) {
        const disposeFn = plugin[Symbol.dispose];
        if (!disposeFn) {
          continue;
        }
        disposeFn.call(plugin);
      }
    }

    return Promise.resolve();
  }
}
