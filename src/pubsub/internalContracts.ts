import type { MessageData } from "./contracts";

/**
 * Internal metadata used by utiliti-es plugins and components.
 * This property is reserved for internal use and may be stripped or modified by the framework.
 * Users should not set this property manually.
 */
export type AdaInternals = {
  /** UUID of the BroadcastChannelPlugin instance that added this message */
  fromBroadcast?: string;
  // Future extensions: hopCount?, timestamp?, sourceTab?, etc.
};

/**
 * Extended message data that may contain internal metadata.
 * @internal
 */
export type MessageDataWithInternals = MessageData & {
  __adaInternals?: AdaInternals;
};
