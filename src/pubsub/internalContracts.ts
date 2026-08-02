import type { MessageData } from "./contracts";

/**
 * Internal metadata used by utiliti-es plugins and components.
 * This property is reserved for internal use and may be stripped or modified by the framework.
 * Users should not set this property manually.
 */
export type AdaInternals = {
  /** Identifies the BroadcastChannelPlugin that received this message from its channel. */
  fromBroadcast?: {
    /** UUID of the plugin instance that added this metadata. */
    instanceId: string;
    /** The channel the message arrived on; used to prevent re-broadcast loops on that channel. */
    channelName: string;
  };
  // Future extensions: hopCount?, timestamp?, sourceTab?, etc.
};

/**
 * Extended message data that may contain internal metadata.
 * @internal
 */
export type MessageDataWithInternals = MessageData & {
  __adaInternals?: AdaInternals;
};
