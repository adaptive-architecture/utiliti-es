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

  it("should enrich the message but not override", () => {
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
});
