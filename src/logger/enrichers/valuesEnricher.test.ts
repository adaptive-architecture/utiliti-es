import { describe, expect, it } from "vitest";
import { type ExtraParams, LogMessage } from "../contracts";
import { ValuesEnricher } from "./index";

describe("ValuesEnricher", () => {
  it("should enrich the message", () => {
    const item = new LogMessage();

    const enricher = new ValuesEnricher(
      {
        foo: "bar",
      },
      false,
    );

    expect(item.extraParams).to.equal(undefined);
    enricher.enrich(item);
    expect(item.extraParams).not.to.equal(undefined);
    expect(item.extraParams?.foo).to.equal("bar");
  });

  it("should not touch the message if values are missing", () => {
    const item = new LogMessage();

    const undefinedEnricher = new ValuesEnricher(undefined as unknown as ExtraParams, false);
    expect(item.extraParams).to.equal(undefined);
    undefinedEnricher.enrich(item);
    expect(item.extraParams).to.equal(undefined);

    const nullEnricher = new ValuesEnricher(null as unknown as ExtraParams, false);
    expect(item.extraParams).to.equal(undefined);
    nullEnricher.enrich(item);
    expect(item.extraParams).to.equal(undefined);
  });

  it("should enrich the message but not override", () => {
    const item = new LogMessage();

    const enricher = new ValuesEnricher(
      {
        foo: "bar",
      },
      false,
    );

    item.extraParams = {
      foo: "buzz",
    };

    enricher.enrich(item);
    expect(item.extraParams).not.to.equal(undefined);
    expect(item.extraParams?.foo).to.equal("buzz");
  });

  it("should enrich the message and override", () => {
    const item = new LogMessage();

    const enricher = new ValuesEnricher(
      {
        foo: "bar",
      },
      true,
    );

    item.extraParams = {
      foo: "buzz",
    };

    enricher.enrich(item);
    expect(item.extraParams).not.to.equal(undefined);
    expect(item.extraParams?.foo).to.equal("bar");
  });

  it("should skip prototype-polluting keys", () => {
    const item = new LogMessage();

    const enricher = new ValuesEnricher(
      JSON.parse('{"__proto__":{"polluted":1},"constructor":1,"prototype":1,"safe":"ok"}'),
      true,
    );

    enricher.enrich(item);
    expect(item.extraParams?.safe).to.equal("ok");
    expect(Object.hasOwn(item.extraParams ?? {}, "__proto__")).to.equal(false);
    expect(Object.hasOwn(item.extraParams ?? {}, "constructor")).to.equal(false);
    expect(Object.hasOwn(item.extraParams ?? {}, "prototype")).to.equal(false);
    expect(Object.getPrototypeOf(item.extraParams)).to.equal(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).to.equal(undefined);
  });

  it("should not copy inherited properties", () => {
    const item = new LogMessage();

    const values = Object.create({ inherited: "nope" });
    values.own = "yes";

    const enricher = new ValuesEnricher(values, true);
    enricher.enrich(item);

    expect(item.extraParams?.own).to.equal("yes");
    expect(Object.hasOwn(item.extraParams ?? {}, "inherited")).to.equal(false);
  });
});
