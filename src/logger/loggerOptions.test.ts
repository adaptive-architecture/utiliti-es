import { describe, expect, it } from "vitest";
import { LogLevel, LoggerOptions } from "./index";

describe("LoggerOptions", () => {
  it("should have default values", () => {
    const lo = new LoggerOptions();

    expect(lo.name).to.equal("");
    expect(lo.minimumLevel).to.equal(LogLevel.Warning);
    expect(lo.reporter).to.equal(null);
    expect(lo.enrichers).to.eql([]);
  });

  it("should parse values", () => {
    expect(LoggerOptions.getLevel("")).to.equal(LogLevel.None);
    expect(LoggerOptions.getLevel(null as unknown as string)).to.equal(LogLevel.None);
    expect(LoggerOptions.getLevel(undefined as unknown as string)).to.equal(LogLevel.None);
    expect(LoggerOptions.getLevel("trAce")).to.equal(LogLevel.Trace);
    expect(LoggerOptions.getLevel("deBug")).to.equal(LogLevel.Debug);
    expect(LoggerOptions.getLevel("InforMation")).to.equal(LogLevel.Information);
    expect(LoggerOptions.getLevel("wArning")).to.equal(LogLevel.Warning);
    expect(LoggerOptions.getLevel("ERROR")).to.equal(LogLevel.Error);
    expect(LoggerOptions.getLevel("critical")).to.equal(LogLevel.Critical);
    expect(LoggerOptions.getLevel("NoNe")).to.equal(LogLevel.None);
  });
});
