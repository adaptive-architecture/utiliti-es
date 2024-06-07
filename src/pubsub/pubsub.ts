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

/**
 * A PubSub implementation.
 */
export class PubSubHub implements IPubSubHub {
  private _subscriptions: Map<string, Map<string, MessageHandler>> = new Map();
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

    const handlers = this._subscriptions.get(context.topic);
    if (handlers) {
      for (const handler of handlers.values()) {
        const newTopic = structuredClone(context.topic);
        const newMessage = structuredClone(context.message);
        setTimeout(() => handler(newTopic, newMessage), 0);
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

    let handlers = this._subscriptions.get(topic);
    if (!handlers) {
      handlers = new Map();
      this._subscriptions.set(structuredClone(topic), handlers);
    }

    const subscriptionId = `sub-${Date.now()}`;
    handlers.set(subscriptionId, handler);
    return subscriptionId;
  }

  /** @inheritdoc */
  unsubscribe(subscriptionId: string): void {
    if (!subscriptionId) {
      return;
    }

    for (const handlers of this._subscriptions.values()) {
      if (handlers.delete(subscriptionId)) {
        return;
      }
    }
  }

  [Symbol.dispose]() {
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
