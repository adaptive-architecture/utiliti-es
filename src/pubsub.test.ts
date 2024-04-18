import { expect, test } from "vitest";
import { type IPubSubHub, PubSubHub } from "./index";

test("pubsub", () => {
  const hub: IPubSubHub = new PubSubHub();
  expect(hub).not.toBeNull();
});
