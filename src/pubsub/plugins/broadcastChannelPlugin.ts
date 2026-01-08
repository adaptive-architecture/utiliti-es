import type { IPubSubHub, MessageData } from "../contracts";
import type { MessageDataWithInternals } from "../internalContracts";
import type { PubSubPlugin, PubSubPluginContext } from "../pubsub";

type BroadcastMessage = {
  topic: string;
  message: MessageData;
};

/**
 * The plugin options.
 */
export type Options = {
  /** The broadcast channel name. */
  channelName: string;
};

/**
 * A plugin that broadcasts PubSub messages across browser tabs/windows using BroadcastChannel API.
 *
 * Automatically prevents infinite loops by tagging messages with a unique instance ID.
 * The internal metadata (__adaInternals) is stripped before messages reach subscribers.
 */
export class BroadcastChannelPlugin implements PubSubPlugin {
  private readonly _options: Options;
  private readonly _channel: BroadcastChannel;
  private readonly _instanceId: string;
  private _eventListeners: null | ((event: MessageEvent<BroadcastMessage>) => void) = null;

  /**
   * Constructor.
   *
   * @param {Options} options The options.
   */
  constructor(options: Options) {
    this._options = options;
    this._channel = new BroadcastChannel(this._options.channelName);
    this._instanceId = crypto.randomUUID();
  }

  /**
   * Adds internal metadata to a message.
   * Merges with existing __adaInternals if present.
   *
   * @param {MessageData} message The message to add internals to.
   * @param {Record<string, unknown>} internals The internals to add.
   * @returns {MessageData} The message with internals added.
   */
  private _addInternals(message: MessageData, internals: Record<string, unknown>): MessageData {
    const existing = (message as MessageDataWithInternals).__adaInternals || {};
    return {
      ...message,
      __adaInternals: {
        ...existing,
        ...internals,
      },
    } as MessageData;
  }

  /**
   * Removes __adaInternals from a message before it reaches subscribers.
   *
   * @param {MessageData} message The message to remove internals from.
   * @returns {MessageData} The message with internals removed.
   */
  private _removeInternals(message: MessageData): MessageData {
    const { __adaInternals, ...clean } = message as MessageDataWithInternals;
    return clean;
  }

  /** @inheritdoc */
  init(hub: IPubSubHub): void {
    if (this._eventListeners) {
      return;
    }

    this._eventListeners = (event: MessageEvent<BroadcastMessage>) => {
      const message = event.data;
      if (!message.topic || !message.message) {
        return;
      }

      // Add instance ID to prevent infinite loop due to broadcast
      const messageWithMetadata = this._addInternals(message.message, {
        fromBroadcast: this._instanceId,
      });
      hub.publish(message.topic, messageWithMetadata);
    };
    this._channel.addEventListener("message", this._eventListeners);
  }

  /** @inheritdoc */
  onPublish(context: PubSubPluginContext) {
    if (!context.topic || !context.message) {
      return;
    }

    // Check if this message originated from this plugin instance
    const internals = (context.message as MessageDataWithInternals).__adaInternals;
    const isFromThisInstance = internals?.fromBroadcast === this._instanceId;

    // Always clean __adaInternals metadata before subscribers receive it
    // (whether it came from broadcast or was manually added by user)
    if (internals) {
      context.message = this._removeInternals(context.message);
    }

    // Don't re-broadcast if this message came from this instance's broadcast channel
    if (isFromThisInstance) {
      return;
    }

    // Broadcast to other tabs (use the cleaned message)
    const message: BroadcastMessage = {
      topic: context.topic,
      message: context.message,
    };
    this._channel.postMessage(message);
  }

  [Symbol.dispose]() {
    if (this._eventListeners) {
      this._channel.removeEventListener("message", this._eventListeners);
    }
    this._channel.close();
  }
}
