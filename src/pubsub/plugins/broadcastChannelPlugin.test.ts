import { randomUUID } from "node:crypto";
import { BroadcastChannel } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { delay } from "../../utils";
import { type MessageData, PubSubHub } from "../index";
import { BroadcastChannelPlugin } from "./broadcastChannelPlugin";

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

    let receivedMessage: MessageData | undefined = undefined;
    _hub.subscribe("test", (_t, m) => {
      receivedMessage = m;
    });
    _hub.publish("test", publishedMessage);
    await delay(10);

    expect(receivedMessage).to.eql(publishedMessage);
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

    let receivedMessage: unknown = undefined;
    const chanel = new BroadcastChannel(_channelName);
    chanel.onmessage = (e) => {
      receivedMessage = (e as MessageEvent<unknown>).data;
    };

    _hub.publish("test", publishedMessage);
    await delay(10);
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
      chanelAMessages.push((e as MessageEvent<unknown>).data);
    };
    chanelB.onmessage = (e) => {
      chanelBMessages.push((e as MessageEvent<unknown>).data);
    };
    chanelA.postMessage({ topic: "test", message: publishedMessage });
    expect(chanelAMessages.length).to.eql(0);
    expect(chanelBMessages.length).to.eql(0);

    await delay(50);

    expect(hubMessages.length).to.eql(
      1,
      "Only one message should be received even though 'init' was called multiple times.",
    );
    expect(hubMessages[0]).to.eql(publishedMessage);

    await delay(50);
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
    await delay(50);
    chanel.close();

    expect(receivedMessages.length).to.eql(0);
  });
});
