import type { IPubSubHub, MessageData } from "../contracts";
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
 * A plugin to log messages.
 */
export class BroadcastChannelPlugin implements PubSubPlugin {
  private _options: Options;
  private _channel: BroadcastChannel;
  private _eventListeners: null | ((event: MessageEvent<BroadcastMessage>) => void) = null;

  /**
   * Constructor.
   *
   * @param {Options} options The options.
   */
  constructor(options: Options) {
    this._options = options;
    this._channel = new BroadcastChannel(this._options.channelName);
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

      hub.publish(message.topic, message.message);
    };
    this._channel.addEventListener("message", this._eventListeners);
  }

  /** @inheritdoc */
  onPublish(context: PubSubPluginContext) {
    if (!context.topic || !context.message) {
      return;
    }
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
