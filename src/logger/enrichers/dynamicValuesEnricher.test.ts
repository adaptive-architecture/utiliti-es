import { describe, expect, it } from "vitest";
import { LogMessage } from "../contracts";
import { DynamicValuesEnricher, type DynamicValuesFunction } from "./index";

describe("DynamicValuesEnricher", () => {
  it("should enrich the message", () => {
    const item = new LogMessage();

    const enricher = new DynamicValuesEnricher(() => {
      return { foo: "bar" };
    }, false);

    expect(item.extraParams).to.equal(undefined);
    enricher.enrich(item);
    expect(item.extraParams).not.to.equal(undefined);
    expect(item.extraParams?.foo).to.equal("bar");
  });

  it("should not touch the message if values are missing", () => {
    const item = new LogMessage();

    const undefinedEnricher = new DynamicValuesEnricher(undefined as unknown as DynamicValuesFunction, false);
    expect(item.extraParams).to.equal(undefined);
    undefinedEnricher.enrich(item);
    expect(item.extraParams).to.equal(undefined);

    const nullEnricher = new DynamicValuesEnricher(null as unknown as DynamicValuesFunction, false);
    expect(item.extraParams).to.equal(undefined);
    nullEnricher.enrich(item);
    expect(item.extraParams).to.equal(undefined);
  });

  it("should enrich the message but not override", () => {
    const item = new LogMessage();

    const enricher = new DynamicValuesEnricher(() => {
      return { foo: "bar" };
    }, false);

    item.extraParams = {
      foo: "buzz",
    };

    enricher.enrich(item);
    expect(item.extraParams).not.to.equal(undefined);
    expect(item.extraParams?.foo).to.equal("buzz");
  });

  it("should enrich the message and override", () => {
    const item = new LogMessage();

    const enricher = new DynamicValuesEnricher(() => {
      return { foo: "bar" };
    }, true);

    item.extraParams = {
      foo: "buzz",
    };

    enricher.enrich(item);
    expect(item.extraParams).not.to.equal(undefined);
    expect(item.extraParams?.foo).to.equal("bar");
  });

  it("should not touch the message if the values function throws", () => {
    const item = new LogMessage();

    const enricher = new DynamicValuesEnricher(() => {
      throw new Error("Boom");
    }, false);

    expect(() => enricher.enrich(item)).not.toThrow();
    expect(item.extraParams).to.equal(undefined);
  });

  it("should skip prototype-polluting keys", () => {
    const item = new LogMessage();

    const enricher = new DynamicValuesEnricher(() => JSON.parse('{"__proto__":{"polluted":1},"safe":"ok"}'), true);

    enricher.enrich(item);
    expect(item.extraParams?.safe).to.equal("ok");
    expect(Object.hasOwn(item.extraParams ?? {}, "__proto__")).to.equal(false);
    expect(Object.getPrototypeOf(item.extraParams)).to.equal(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).to.equal(undefined);
  });
});
