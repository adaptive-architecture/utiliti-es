import { describe, expect, it } from "vitest";
import { createTestLogger } from "../../../test/testLoggerFactory";
import { autoInstrument } from "./index";

describe("autoInstrument (non-browser environment)", () => {
  it("should be a no-op when 'window' is not available", () => {
    const { logger, reporter } = createTestLogger();

    const restore = autoInstrument(logger);

    expect(restore).to.be.a("function");
    expect(() => restore()).not.to.throw();
    expect(reporter.messages.length).to.equal(0);
  });
});
