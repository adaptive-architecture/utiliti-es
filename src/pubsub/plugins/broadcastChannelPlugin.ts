import { omitDangerousKeys } from "../../common/objectSafety";
import type { IPubSubHub, MessageData } from "../contracts";
import type { AdaInternals, MessageDataWithInternals } from "../internalContracts";
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

function newInstanceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bc-${Date.now()}-${Math.random().toString(16).slice(2)}`; // NOSONAR S2245 Non-cryptographic randomness is acceptable here
}

/**
 * A plugin that broadcasts PubSub messages across browser tabs/windows using BroadcastChannel API.
 *
 * Automatically prevents infinite loops by tagging messages with the channel they arrived on.
 * The internal metadata (__adaInternals) is stripped before messages reach subscribers.
 *
 * Messages received from the channel are untrusted input from any same-origin context: they are
 * validated (string topic, plain-object message) and prototype-polluting keys are removed before
 * they are republished to the hub. Subscribers should still treat the payload values as untrusted.
 */
export class BroadcastChannelPlugin implements PubSubPlugin {
  private readonly _options: Options;
  private readonly _channel: BroadcastChannel;
  private readonly _instanceId: string;
  private _eventListeners: null | ((event: MessageEvent<BroadcastMessage>) => void) = null;
  private _disposed = false;

  /**
   * Constructor.
   *
   * Throws when the BroadcastChannel API is not available in the current environment.
   *
   * @param {Options} options The options.
   */
  constructor(options: Options) {
    if (typeof BroadcastChannel === "undefined") {
      throw new Error("The BroadcastChannel API is not available in this environment.");
    }

    this._options = options;
    this._channel = new BroadcastChannel(this._options.channelName);
    this._instanceId = newInstanceId();
  }

  /**
   * Adds internal metadata to a message, replacing any existing __adaInternals.
   *
   * @param {MessageData} message The message to add internals to.
   * @param {AdaInternals} internals The internals to add.
   * @returns {MessageData} The message with internals added.
   */
  private _addInternals(message: MessageData, internals: AdaInternals): MessageData {
    return {
      ...this._removeInternals(message),
      __adaInternals: internals,
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

  /**
   * @inheritdoc
   *
   * Throws when the plugin has been disposed (its channel is closed and cannot be reused).
   */
  init(hub: IPubSubHub): void {
    if (this._disposed) {
      throw new Error("BroadcastChannelPlugin has been disposed.");
    }

    if (this._eventListeners) {
      return;
    }

    this._eventListeners = (event: MessageEvent<BroadcastMessage>) => {
      try {
        // Anything on the channel is untrusted input from any same-origin context.
        const data = event.data as unknown;
        if (typeof data !== "object" || data === null) {
          return;
        }

        const { topic, message } = data as { topic?: unknown; message?: unknown };
        if (typeof topic !== "string" || topic.length === 0) {
          return;
        }
        if (typeof message !== "object" || message === null || Array.isArray(message)) {
          return;
        }

        const sanitized = omitDangerousKeys(message as MessageData);

        // Tag with the receiving channel to prevent an infinite re-broadcast loop. Any
        // __adaInternals already on the wire is discarded (legitimate senders strip it).
        const messageWithMetadata = this._addInternals(sanitized, {
          fromBroadcast: {
            instanceId: this._instanceId,
            channelName: this._options.channelName,
          },
        });
        hub.publish(topic, messageWithMetadata);
      } catch {
        // Malformed or hostile cross-tab input must never throw into the host application.
      }
    };
    this._channel.addEventListener("message", this._eventListeners);
  }

  /** @inheritdoc */
  onPublish(context: PubSubPluginContext) {
    if (this._disposed || !context.topic || !context.message) {
      return;
    }

    // The message's internals, or the ones an earlier plugin already stripped from it.
    const internals = (context.message as MessageDataWithInternals).__adaInternals ?? context._adaInternals;

    // Always clean __adaInternals metadata before subscribers receive it, but preserve it on
    // the context so later plugins in the chain can still observe the message's origin.
    if ((context.message as MessageDataWithInternals).__adaInternals) {
      context._adaInternals = internals;
      context.message = this._removeInternals(context.message);
    }

    // Don't re-broadcast a message that arrived on this same channel: every peer already saw it.
    if (internals?.fromBroadcast?.channelName === this._options.channelName) {
      return;
    }

    // Broadcast to other tabs (use the cleaned message)
    const message: BroadcastMessage = {
      topic: context.topic,
      message: context.message,
    };
    this._channel.postMessage(message);
  }

  /**
   * Dispose the plugin: removes the channel listener and closes the channel. Idempotent;
   * the plugin cannot be re-initialized afterwards.
   */
  [Symbol.dispose]() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    if (this._eventListeners) {
      this._channel.removeEventListener("message", this._eventListeners);
      this._eventListeners = null;
    }
    this._channel.close();
  }
}
