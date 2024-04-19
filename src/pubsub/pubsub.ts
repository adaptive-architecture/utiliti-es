import type { IPubSubHub, MessageData, MessageHandler } from "./contracts";

/**
 * A PubSub implementation.
 */
export class PubSubHub implements IPubSubHub {
  private _subscriptions: Map<string, Map<string, MessageHandler>> = new Map();

  /** @inheritdoc */
  publish(topic: string, message: MessageData): void {
    if (!topic) {
      throw new Error("Invalid topic.");
    }

    if (!message) {
      throw new Error("Invalid message.");
    }

    const handlers = this._subscriptions.get(topic);
    if (handlers) {
      for (const handler of handlers.values()) {
        const newTopic = structuredClone(topic);
        const newMessage = structuredClone(message);
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
}
