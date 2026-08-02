import { describe, expect, it } from "vitest";
import { assignSafeValues, isDangerousKey, omitDangerousKeys } from "./objectSafety";

describe("isDangerousKey", () => {
  it("should flag prototype-polluting keys", () => {
    expect(isDangerousKey("__proto__")).to.equal(true);
    expect(isDangerousKey("constructor")).to.equal(true);
    expect(isDangerousKey("prototype")).to.equal(true);
    expect(isDangerousKey("safe")).to.equal(false);
  });
});

describe("assignSafeValues", () => {
  it("should copy own keys and respect overrideExisting", () => {
    const target: Record<string, unknown> = { existing: "old" };

    assignSafeValues(target, { existing: "new", added: 1 }, false);
    expect(target.existing).to.equal("old");
    expect(target.added).to.equal(1);

    assignSafeValues(target, { existing: "new" }, true);
    expect(target.existing).to.equal("new");
  });

  it("should skip dangerous keys", () => {
    const target: Record<string, unknown> = {};

    assignSafeValues(target, JSON.parse('{"__proto__":{"polluted":1},"safe":"ok"}'), true);
    expect(target.safe).to.equal("ok");
    expect(Object.hasOwn(target, "__proto__")).to.equal(false);
    expect(({} as Record<string, unknown>).polluted).to.equal(undefined);
  });
});

describe("omitDangerousKeys", () => {
  it("should return primitives and dates unchanged", () => {
    const date = new Date();
    expect(omitDangerousKeys("text")).to.equal("text");
    expect(omitDangerousKeys(42)).to.equal(42);
    expect(omitDangerousKeys(null)).to.equal(null);
    expect(omitDangerousKeys(date)).to.equal(date);
  });

  it("should drop dangerous keys recursively", () => {
    const input = JSON.parse(
      '{"safe":"ok","__proto__":{"polluted":1},"nested":{"constructor":1,"keep":true},"list":[{"prototype":1,"x":2}]}',
    );

    const result = omitDangerousKeys(input) as Record<string, unknown>;

    expect(result.safe).to.equal("ok");
    expect(Object.hasOwn(result, "__proto__")).to.equal(false);
    expect(Object.hasOwn(result.nested as object, "constructor")).to.equal(false);
    expect((result.nested as Record<string, unknown>).keep).to.equal(true);
    const first = (result.list as Array<Record<string, unknown>>)[0];
    expect(Object.hasOwn(first, "prototype")).to.equal(false);
    expect(first.x).to.equal(2);
  });
});
