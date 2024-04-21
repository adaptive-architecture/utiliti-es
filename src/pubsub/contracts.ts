import type { SerializableValues } from "../common";

/**
 * The types of message values that can be published.
 */
export type MessageValue = SerializableValues;

/**
 * The type of a message.
 */
export type MessageData = Record<string, MessageValue>;

/**
 * A simple message handler.
 */
export type MessageHandler = (topic: string, message: MessageData) => void;

/**
 * A simple pub/sub component.
 */
export interface IPubSubHub {
  /**
   * Publish a message to a topic.
   *
   * @param {string} topic The topic to publish to.
   * @param {MessageData} message The message to publish.
   **/
  publish(topic: string, message: MessageData): void;
  /**
   * Subscribe to a topic.
   *
   * @param {string} topic  The topic to subscribe to.
   * @param {MessageHandler} handler The handler to call when a message is published.
   * @returns {string} The id of the handler subscription if the subscription is successful.
   **/
  subscribe(topic: string, handler: MessageHandler): string | null;

  /**
   * Unsubscribe from a topic.
   *
   * @param {string} subscriptionId The subscription id to unsubscribe.
   **/
  unsubscribe(subscriptionId: string): void;
}
