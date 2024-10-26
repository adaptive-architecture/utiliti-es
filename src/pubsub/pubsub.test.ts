import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTicks } from "../index";
import { type MessageData, type MessageHandler, PubSubHub } from "./index";
import type { PubSubPlugin } from "./pubsub";

describe("pubsub", () => {
  let _hub: PubSubHub;

  beforeEach(() => {
    _hub = new PubSubHub();
  });

  afterEach(() => {
    _hub[Symbol.dispose]();
    _hub = null as unknown as PubSubHub;
  });

  it("should publish to a subscriber", async () => {
    const publishedMessage: MessageData = {
      id: "test",
      data: {
        test: 1,
        someArray: [1, 2, 3],
      },
    };

    let receivedMessage: MessageData | undefined = undefined;
    _hub.subscribe("test", (_t, m) => {
      receivedMessage = m;
    });

    _hub.publish("test", publishedMessage);
    expect(receivedMessage).toBe(undefined); // The subscriber hasn't been called yet. Processing is async.

    await nextTicks(2);

    expect(receivedMessage)
      .to.eql(publishedMessage) // The received message should be the same as the published message.
      .but.not.equal(publishedMessage); // But it should be a different object.
  });

  it("should unsubscribe a subscriber", async () => {
    let called = 0;
    const subscriberId = _hub.subscribe("test", () => {
      called++;
    });

    if (!subscriberId) {
      expect.fail("SubscriberId is null.");
    }

    _hub.publish("test", {});
    await nextTicks(2);
    expect(called).to.equal(1);

    _hub.unsubscribe(subscriberId);

    _hub.publish("test", {});
    await nextTicks(2);
    expect(called).to.equal(1);
  });

  it("should throw on invalid call to publish", () => {
    expect(() => _hub.publish("", {})).to.throw();
    expect(() => _hub.publish("my-topic", undefined as unknown as MessageData)).to.throw();
  });

  it("should throw on invalid call to subscribe", () => {
    expect(() => _hub.subscribe("", () => {})).to.throw();
    expect(() => _hub.subscribe("my-topic", undefined as unknown as MessageHandler)).to.throw();
  });

  it("should handle invalid call to unsubscribe", () => {
    expect(() => _hub.unsubscribe("")).not.to.throw();
    expect(() => _hub.unsubscribe("some-non-existent-subscription")).not.to.throw();
  });

  it("should not fail if invalid plugin is provided", () => {
    _hub = new PubSubHub({ plugins: [{} as unknown as PubSubPlugin] });
    expect(() => _hub.publish("my-topic", {})).not.to.throw();
  });

  it("should trigger handler after dispose", async () => {
    let called = 0;
    const subscriberId = _hub.subscribe("test", () => {
      called++;
    });

    if (!subscriberId) {
      expect.fail("SubscriberId is null.");
    }

    _hub.publish("test", {});
    await nextTicks(2);
    expect(called).to.equal(1);

    _hub.publish("test", {});
    _hub[Symbol.dispose]();
    await nextTicks(2);

    expect(called).to.equal(1);
  });
});
