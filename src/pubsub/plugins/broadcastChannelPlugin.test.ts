import { randomUUID } from "node:crypto";
import { BroadcastChannel } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTicks } from "../../utils";
import { type MessageData, PubSubHub } from "../index";
import { BroadcastChannelPlugin } from "./broadcastChannelPlugin";

function createHubs(count: number) {
  const channelName = `test-channel-${randomUUID()}`;
  const plugins: BroadcastChannelPlugin[] = [];
  const hubs: PubSubHub[] = [];
  const messages: Array<Array<MessageData>> = [];

  for (let i = 0; i < count; i++) {
    const plugin = new BroadcastChannelPlugin({ channelName });
    const hub = new PubSubHub({ plugins: [plugin] });
    const hubMessages: Array<MessageData> = [];
    hub.subscribe("test", (_t, m) => hubMessages.push(m));

    plugins.push(plugin);
    hubs.push(hub);
    messages.push(hubMessages);
  }

  return {
    channelName,
    plugins,
    hubs,
    messages,
    dispose() {
      for (const hub of hubs) {
        hub[Symbol.dispose]();
      }
    },
  };
}

function expectCleanMessages(...messageLists: Array<Array<MessageData>>) {
  for (const messages of messageLists) {
    for (const msg of messages) {
      expect(msg).not.toHaveProperty("__adaInternals");
    }
  }
}

describe("BroadcastChannelPlugin", () => {
  let _hub: PubSubHub;
  let _channelName: string;
  let _plugin: BroadcastChannelPlugin;

  beforeEach(() => {
    _channelName = `test-channel-${randomUUID()}`;
    _plugin = new BroadcastChannelPlugin({ channelName: _channelName });
    _hub = new PubSubHub({
      plugins: [_plugin],
    });
  });

  afterEach(async () => {
    _hub[Symbol.dispose]();
    _hub = null as unknown as PubSubHub;
    _plugin = null as unknown as BroadcastChannelPlugin;
  });

  it("should not affect regular pub/sub functionality", async () => {
    const publishedMessage: MessageData = { id: "test", data: null };

    let receivedMessage: MessageData | undefined;
    _hub.subscribe("test", (_t, m) => {
      receivedMessage = m;
    });
    _hub.publish("test", publishedMessage);
    await nextTicks(2);

    expect(receivedMessage).to.eql(publishedMessage);
  });

  it("should not fail if dispose before init", async () => {
    const p = new BroadcastChannelPlugin({ channelName: "test" });
    try {
      p[Symbol.dispose]();
    } catch (e) {
      expect(e).toBeUndefined();
    }
  });

  it("should not fail if bad dat is published", async () => {
    const p = new BroadcastChannelPlugin({ channelName: "test" });
    try {
      p.init(_hub);
      p.onPublish({ topic: "test", message: undefined });
      p.onPublish({ topic: undefined, message: {} });
    } catch (e) {
      expect(e).toBeUndefined();
    } finally {
      p[Symbol.dispose]();
    }
  });

  it("should send a message to the broadcast channel", async () => {
    const publishedMessage: MessageData = { id: "test", data: null };

    let receivedMessage: unknown;
    const chanel = new BroadcastChannel(_channelName);
    chanel.onmessage = (e) => {
      receivedMessage = (e as unknown as MessageEvent<unknown>).data;
    };

    _hub.publish("test", publishedMessage);
    await nextTicks(2);
    chanel.close();

    expect(receivedMessage).to.eql({ topic: "test", message: publishedMessage });
  });

  it("should receive a message from the broadcast channel", async () => {
    const publishedMessage: MessageData = { id: "test", data: null };
    const chanelA = new BroadcastChannel(_channelName);
    const chanelB = new BroadcastChannel(_channelName);

    _plugin.init(_hub);
    _plugin.init(_hub);

    const hubMessages: Array<MessageData> = [];
    const chanelAMessages: Array<unknown> = [];
    const chanelBMessages: Array<unknown> = [];
    _hub.subscribe("test", (_t, m) => {
      hubMessages.push(m);
    });
    chanelA.onmessage = (e) => {
      chanelAMessages.push((e as unknown as MessageEvent<unknown>).data);
    };
    chanelB.onmessage = (e) => {
      chanelBMessages.push((e as unknown as MessageEvent<unknown>).data);
    };
    chanelA.postMessage({ topic: "test", message: publishedMessage });
    expect(chanelAMessages.length).to.eql(0);
    expect(chanelBMessages.length).to.eql(0);

    await nextTicks(10);

    expect(hubMessages.length).to.eql(
      1,
      "Only one message should be received even though 'init' was called multiple times.",
    );
    expect(hubMessages[0]).to.eql(publishedMessage);
    expect(hubMessages[0]).not.toHaveProperty("__adaInternals");

    await nextTicks(10);
    chanelA.close();
    chanelB.close();

    // Check that the hub did not re-broadcast the message. This would cause an infinite loop.
    expect(chanelAMessages.length).to.eql(0, "The original chanel should not have received any message.");
    expect(chanelBMessages.length).to.eql(
      1,
      "The second chanel should have received only the message from the first channel.",
    );
  });

  it("should not receive a message from the broadcast channel if it's missing the topic of the payload", async () => {
    const publishedMessage: MessageData = { id: "test", data: null };
    const chanel = new BroadcastChannel(_channelName);

    const receivedMessages: Array<MessageData> = [];
    _hub.subscribe("test", (_t, m) => {
      receivedMessages.push(m);
    });
    chanel.postMessage({ topic: undefined, message: publishedMessage });
    chanel.postMessage({ topic: "test", message: undefined });
    await nextTicks(10);
    chanel.close();

    expect(receivedMessages.length).to.eql(0);
  });

  it("should strip __adaInternals metadata before delivering to subscribers", async () => {
    const publishedMessage: MessageData = { id: "test", data: "value" };
    const channel = new BroadcastChannel(_channelName);

    const receivedMessages: Array<MessageData> = [];
    _hub.subscribe("test", (_t, m) => {
      receivedMessages.push(m);
    });

    // Simulate receiving a message from another tab
    channel.postMessage({ topic: "test", message: publishedMessage });
    await nextTicks(10);
    channel.close();

    expect(receivedMessages.length).to.eql(1);
    expect(receivedMessages[0]).to.eql(publishedMessage);
    expect(receivedMessages[0]).not.toHaveProperty("__adaInternals");
  });

  it("should handle multiple plugin instances with different UUIDs correctly", async () => {
    const { hubs, messages, dispose } = createHubs(2);

    const message: MessageData = { id: "test", data: "hello" };
    hubs[0].publish("test", message);
    await nextTicks(10);

    expect(messages[0].length).to.eql(1);
    expect(messages[0][0]).to.eql(message);
    expect(messages[1].length).to.eql(1);
    expect(messages[1][0]).to.eql(message);
    expectCleanMessages(...messages);

    dispose();
  });

  it("should prevent infinite loop when a single hub receives its own broadcast", async () => {
    const publishedMessage: MessageData = { id: "test", data: "value" };
    const externalChannel = new BroadcastChannel(_channelName);

    let publishCount = 0;
    const receivedMessages: Array<MessageData> = [];

    // Track how many times messages are published
    _hub.subscribe("test", (_t, m) => {
      publishCount++;
      receivedMessages.push(m);
    });

    // Publish a message from the hub
    _hub.publish("test", publishedMessage);
    await nextTicks(10);

    // The message should be:
    // 1. Delivered to local subscriber (once)
    // 2. Broadcast to the channel (once)
    // 3. NOT re-broadcast when received back from the channel
    expect(publishCount).to.eql(1, "Message should only be delivered once to subscribers");
    expect(receivedMessages.length).to.eql(1);
    expect(receivedMessages[0]).to.eql(publishedMessage);
    expect(receivedMessages[0]).not.toHaveProperty("__adaInternals");

    // Verify only one message was broadcast to the channel
    let channelMessageCount = 0;
    externalChannel.onmessage = () => {
      channelMessageCount++;
    };

    await nextTicks(10);
    expect(channelMessageCount).to.eql(0, "No additional messages should be broadcast");

    externalChannel.close();
  });

  it("should prevent infinite loop between multiple hub instances", async () => {
    const { hubs, messages, dispose } = createHubs(3);

    const message: MessageData = { id: "test", data: "hello" };
    hubs[0].publish("test", message);
    await nextTicks(20);

    expect(messages[0].length).to.eql(1, "Hub1 should receive its own message once");
    expect(messages[1].length).to.eql(1, "Hub2 should receive the broadcast once");
    expect(messages[2].length).to.eql(1, "Hub3 should receive the broadcast once");
    expectCleanMessages(...messages);

    expect(messages[0][0]).to.eql(message);
    expect(messages[1][0]).to.eql(message);
    expect(messages[2][0]).to.eql(message);

    dispose();
  });

  it("should handle rapid successive messages without infinite loops", async () => {
    const { hubs, messages, dispose } = createHubs(2);

    const messageCount = 10;
    for (let i = 0; i < messageCount; i++) {
      hubs[0].publish("test", { id: i, data: `message-${i}` });
    }

    await nextTicks(30);

    expect(messages[0].length).to.eql(messageCount, "Hub1 should receive all its own messages");
    expect(messages[1].length).to.eql(messageCount, "Hub2 should receive all broadcast messages");
    expectCleanMessages(...messages);

    dispose();
  });

  it("should handle messages that already have __adaInternals property", async () => {
    const { hubs, messages, dispose } = createHubs(2);

    // User publishes a message with __adaInternals (shouldn't happen, but test for safety)
    const message: MessageData = {
      id: "test",
      data: "value",
      __adaInternals: { someUserData: "foo" },
    } as MessageData;

    hubs[0].publish("test", message);
    await nextTicks(20);

    expect(messages[0].length).to.eql(1);
    expect(messages[1].length).to.eql(1);
    expectCleanMessages(...messages);

    expect(messages[0][0]).to.have.property("id", "test");
    expect(messages[0][0]).to.have.property("data", "value");

    dispose();
  });

  it("should prevent ping-pong infinite loops between two hubs", async () => {
    const { hubs, messages, dispose } = createHubs(2);

    hubs[0].publish("test", { id: 1, data: "from-hub1" });
    await nextTicks(10);

    hubs[1].publish("test", { id: 2, data: "from-hub2" });
    await nextTicks(10);

    expect(messages[0].length).to.eql(2, "Hub1 should receive 2 messages total");
    expect(messages[1].length).to.eql(2, "Hub2 should receive 2 messages total");

    const hub1Ids = messages[0].map((m) => m.id);
    const hub2Ids = messages[1].map((m) => m.id);
    expect(hub1Ids).to.have.members([1, 2]);
    expect(hub2Ids).to.have.members([1, 2]);
    expectCleanMessages(...messages);

    dispose();
  });
});
