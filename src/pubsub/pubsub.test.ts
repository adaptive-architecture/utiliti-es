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

    let receivedMessage: MessageData | undefined;
    _hub.subscribe("test", (_t, m) => {
      receivedMessage = m;
    });

    _hub.subscribe("test", (_t, _m) => {
      // A second subscriber that does nothing.
    });

    _hub.publish("test", publishedMessage);
    expect(receivedMessage).toBeUndefined(); // The subscriber hasn't been called yet. Processing is async.

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
    assertNoHangingTimers(_hub);

    _hub.unsubscribe(subscriberId);

    _hub.publish("test", {});
    await nextTicks(2);
    expect(called).to.equal(1);

    // Should be safe to unsubscribe again.
    _hub.unsubscribe(subscriberId);

    _hub.publish("test", {});
    await nextTicks(2);
    expect(called).to.equal(1);
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

    assertNoHangingTimers(_hub);

    expect(called).to.equal(1);
  });

  it("should throw on invalid call to publish", () => {
    expect(() => _hub.publish("", {})).to.throw("Invalid topic.");
    expect(() => _hub.publish("my-topic", undefined as unknown as MessageData)).to.throw("Invalid message.");
  });

  it("should throw on invalid call to subscribe", () => {
    expect(() => _hub.subscribe("", () => {})).to.throw("Invalid topic.");
    expect(() => _hub.subscribe("my-topic", undefined as unknown as MessageHandler)).to.throw("Invalid handler.");
  });

  it("should handle invalid call to unsubscribe", () => {
    expect(() => _hub.unsubscribe("")).not.to.throw();
    expect(() => _hub.unsubscribe("some-non-existent-subscription")).not.to.throw();
  });

  it("should not fail if invalid plugin is provided", () => {
    _hub = new PubSubHub({ plugins: [{} as unknown as PubSubPlugin] });
    expect(() => _hub.publish("my-topic", {})).not.to.throw();
  });

  it("should not cancel other subscribers' pending deliveries on unsubscribe", async () => {
    let survivorCalls = 0;
    let sameTopicCalls = 0;

    _hub.subscribe("other-topic", () => {
      survivorCalls++;
    });
    _hub.subscribe("test", () => {
      sameTopicCalls++;
    });
    const unsubscribedId = _hub.subscribe("test", () => {
      expect.fail("The unsubscribed handler should not be called.");
    });

    // Queue deliveries for everyone, then unsubscribe one handler while they are still pending.
    _hub.publish("other-topic", {});
    _hub.publish("test", {});
    _hub.publish("test", {});
    _hub.unsubscribe(unsubscribedId);

    await nextTicks(2);

    expect(survivorCalls).to.equal(1);
    expect(sameTopicCalls).to.equal(2);
    assertNoHangingTimers(_hub);
  });

  it("should contain a throwing handler and not leak its timer tracking", async () => {
    let secondDelivery = 0;
    _hub.subscribe("test", () => {
      throw new Error("broken handler");
    });
    _hub.subscribe("test", () => {
      secondDelivery++;
    });

    _hub.publish("test", {});
    await nextTicks(2);
    _hub.publish("test", {});
    await nextTicks(2);

    expect(secondDelivery).to.equal(2);
    assertNoHangingTimers(_hub);
    assertNoTrackedTimeouts(_hub);
  });

  it("should remove a topic once its last subscriber unsubscribes", () => {
    const idA = _hub.subscribe("test", () => {});
    const idB = _hub.subscribe("test", () => {});

    // biome-ignore lint/suspicious/noExplicitAny: Looking at the internals of the hub for testing purposes.
    const subs = (_hub as any)._subscriptions as Map<string, unknown>;
    expect(subs.size).to.equal(1);

    _hub.unsubscribe(idA);
    expect(subs.size).to.equal(1);

    _hub.unsubscribe(idB);
    expect(subs.size).to.equal(0);
  });

  it("should validate arguments before any plugin runs", () => {
    let pluginCalls = 0;
    _hub = new PubSubHub({
      plugins: [
        {
          onPublish: () => {
            pluginCalls++;
          },
        },
      ],
    });

    expect(() => _hub.publish(5 as unknown as string, {})).to.throw("Invalid topic.");
    expect(() => _hub.publish("test", null as unknown as MessageData)).to.throw("Invalid message.");
    expect(() => _hub.publish("test", [] as unknown as MessageData)).to.throw("Invalid message.");
    expect(() => _hub.publish("test", 42 as unknown as MessageData)).to.throw("Invalid message.");
    expect(pluginCalls).to.equal(0);

    _hub.publish("test", {});
    expect(pluginCalls).to.equal(1);
  });

  it("should re-validate the context after plugins ran", () => {
    let invalidTopic = true;
    _hub = new PubSubHub({
      plugins: [
        {
          onPublish: (context) => {
            if (invalidTopic) {
              context.topic = "";
            } else {
              context.message = undefined;
            }
          },
        },
      ],
    });

    expect(() => _hub.publish("test", {})).to.throw("Invalid topic.");
    invalidTopic = false;
    expect(() => _hub.publish("test", {})).to.throw("Invalid message.");
  });

  describe("disposal", () => {
    it("should throw on publish and subscribe after dispose", () => {
      _hub[Symbol.dispose]();

      expect(() => _hub.publish("test", {})).to.throw("PubSubHub has been disposed.");
      expect(() => _hub.subscribe("test", () => {})).to.throw("PubSubHub has been disposed.");
    });

    it("should treat unsubscribe and dispose as no-ops after dispose", () => {
      const id = _hub.subscribe("test", () => {});
      _hub[Symbol.dispose]();

      expect(() => _hub.unsubscribe(id)).not.to.throw();
      expect(() => _hub[Symbol.dispose]()).not.to.throw();
    });

    it("should dispose the remaining plugins when one of them throws", () => {
      let disposed = false;
      _hub = new PubSubHub({
        plugins: [
          {
            [Symbol.dispose]: () => {
              throw new Error("broken plugin dispose");
            },
          },
          {
            [Symbol.dispose]: () => {
              disposed = true;
            },
          },
        ],
      });

      expect(() => _hub[Symbol.dispose]()).not.to.throw();
      expect(disposed).to.equal(true);
    });
  });
});

function assertNoTrackedTimeouts(hub: PubSubHub) {
  // biome-ignore lint/suspicious/noExplicitAny: Looking at the internals of the hub for testing purposes.
  const subs = (hub as any)._subscriptions;

  for (const [topic, topicSubs] of subs) {
    for (const [, sub] of topicSubs) {
      if (sub.timeouts.size > 0) {
        expect.fail(`Leaked timeout tracking for topic '${topic}'.`);
      }
    }
  }
}

function assertNoHangingTimers(hub: PubSubHub) {
  // biome-ignore lint/suspicious/noExplicitAny: Looking at the internals of the hub for testing purposes.
  const subs = (hub as any)._subscriptions;

  for (const [topic, topicSubs] of subs) {
    for (const [, sub] of topicSubs) {
      for (const timeout of sub.timeouts) {
        if (timeout.ref) {
          expect.fail(`Hanging timer for topic '${topic}'.`);
        }
      }
    }
  }
}
