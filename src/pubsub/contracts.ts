/**
 * The basic type of message values that can be published.
 */
export type MessageValueBasicTypes = string | number | boolean | null | undefined | Date;

/**
 * The type of message values that can be published.
 */
export type MessageValue = MessageValueBasicTypes | MessageValueBasicTypes[] | Record<string, MessageValueBasicTypes>;

/**
 * The type of a message.
 */
export type MessageType = Record<string, MessageValue>;

/**
 * A simple message handler.
 */
export type MessageHandler = (topic: string, message: MessageType) => void;

/**
 * A simple pub/sub component.
 */
export interface IPubSubHub {
  /**
   * Publish a message to a topic.
   *
   * @param {string} topic The topic to publish to.
   * @param {MessageType} message The message to publish.
   **/
  publish(topic: string, message: MessageType): void;
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
