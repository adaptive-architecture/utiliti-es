// @vitest-environment jsdom

import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getLogReporterHandlers } from "../../../test/mocks/logReporterHandlers";
import { delay, nextTicks } from "../../utils";
import { LogMessage } from "../contracts";
import { XhrReporter, XhrReporterOptions } from "./xhrReporter";

async function filterRequest(request: Array<Request>, requestId: string): Promise<Array<Request>> {
  const results: Array<Request> = [];
  for (const r of request) {
    const clone = r.clone();
    const data = ((await clone.json()) as Array<LogMessage>) || [];
    if (data.some((d: LogMessage) => d.extraParams?.requestId === requestId)) {
      results.push(r.clone());
    }
  }
  return results;
}

function newLogMessage(uuid: string): LogMessage {
  const lm = new LogMessage();
  lm.extraParams = lm.extraParams || {};
  lm.extraParams.requestId = uuid;
  return lm;
}

async function checkExpectedRequests(
  handledRequests: Request[],
  testUuid: string,
  xhrReporterOptions: XhrReporterOptions,
  totalRequests: number,
  indexToCheck: number,
): Promise<void> {
  const testRequests = await filterRequest(handledRequests, testUuid);
  expect(testRequests.length).to.equal(totalRequests);

  if (indexToCheck < 0) {
    return;
  }

  expect(testRequests[indexToCheck].method).to.be.equal(xhrReporterOptions.verb);
  expect(testRequests[indexToCheck].url).to.be.contains(xhrReporterOptions.endpoint);
  const requestBody: LogMessage[] = ((await testRequests[indexToCheck].json()) as LogMessage[]) || [];
  expect(requestBody.length).to.equal(xhrReporterOptions.batchSize);

  for (const element of requestBody) {
    expect(element.message.indexOf("UNIT TEST")).to.equal(0, "Test message content.");
  }
}

async function addMessagesToReporter(
  xhrReporterOptions: XhrReporterOptions,
  testUuid: string,
  xhrReporter: XhrReporter,
): Promise<void> {
  let count = 0;
  while (count < xhrReporterOptions.batchSize) {
    count++;
    const lm = newLogMessage(testUuid);
    lm.message = `UNIT TEST ${count}`;
    xhrReporter.register(lm);
  }
  await delay(xhrReporterOptions.interval);
}

describe("HttpReporterOptions", () => {
  it("have default values", () => {
    const opt = new XhrReporterOptions();

    expect(opt.endpoint).to.equal("");
    expect(opt.verb).to.equal("POST");
    expect(opt.batchSize).to.equal(20);
    expect(opt.interval).to.equal(2000);
    expect(opt.maxQueueSize).to.equal(1000);
    expect(opt.maxBackoffInterval).to.equal(30000);
  });
});

describe("XhrReporter", () => {
  let _server: ReturnType<typeof setupServer>;
  let _xhrReporterOptions: XhrReporterOptions;
  let _xhrReporter: XhrReporter;
  let _testUuid: string;
  let _handledRequests: Array<Request>;

  beforeAll(() => {
    _handledRequests = [];
    _server = setupServer(...getLogReporterHandlers(_handledRequests));
    _server.listen();
  });

  beforeEach((ctx) => {
    _server.resetHandlers();

    _xhrReporterOptions = new XhrReporterOptions();
    _xhrReporterOptions.endpoint = "/logs";
    _xhrReporterOptions.verb = "POST";
    _xhrReporterOptions.batchSize = 1;
    _xhrReporterOptions.interval = 5;

    _xhrReporter = new XhrReporter(_xhrReporterOptions);
    _testUuid = `XhrReporter_${ctx.task.name}_${Date.now()}`;
  });

  afterEach(async () => {
    await _xhrReporter[Symbol.asyncDispose]();
    _handledRequests.length = 0;
    _server.resetHandlers();
  });

  afterAll(() => {
    _server.close();
    _handledRequests = [];
  });

  it("should throw an exception if options are not provided", () => {
    expect(() => {
      new XhrReporter(null as unknown as XhrReporterOptions);
    }).to.throw('Argument "options" is required');
  });

  it("should throw an exception if the endpoint is empty", () => {
    expect(() => {
      new XhrReporter(new XhrReporterOptions());
    }).to.throw('A non-empty "endpoint" is required.');
  });

  it("should throw an exception if the verb is not a plain HTTP token", () => {
    const options = new XhrReporterOptions();
    options.endpoint = "/logs";
    options.verb = "PO ST\r\nX-Injected: 1";
    expect(() => {
      new XhrReporter(options);
    }).to.throw('Invalid HTTP verb "PO ST\r\nX-Injected: 1".');
  });

  it("should drop a batch that cannot be serialized and still deliver later batches", { retry: 5 }, async () => {
    const poison = newLogMessage(_testUuid);
    poison.message = "POISON";
    // biome-ignore lint/suspicious/noExplicitAny: intentionally invalid payload
    (poison.extraParams as any).bad = BigInt(1); // JSON.stringify throws on BigInt
    const good = newLogMessage(_testUuid);
    good.message = "GOOD";

    _xhrReporter.register(poison);
    await delay(_xhrReporterOptions.interval + 5);
    _xhrReporter.register(good);
    await delay(_xhrReporterOptions.interval + 5);

    const testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(1);
    const body = ((await testRequests[0].json()) as LogMessage[]) || [];
    expect(body.length).to.equal(1);
    expect(body[0].message).to.equal("GOOD");
  });

  it("should drop the oldest messages when the queue exceeds maxQueueSize", { retry: 5 }, async () => {
    _xhrReporterOptions.batchSize = 10;
    _xhrReporterOptions.interval = 20;
    _xhrReporterOptions.maxQueueSize = 2;
    _xhrReporter = new XhrReporter(_xhrReporterOptions);

    for (let ix = 1; ix <= 5; ix++) {
      const lm = newLogMessage(_testUuid);
      lm.message = `MSG ${ix}`;
      _xhrReporter.register(lm);
    }

    await delay(_xhrReporterOptions.interval + 100);

    const testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(1);
    const body = ((await testRequests[0].json()) as LogMessage[]) || [];
    expect(body.map((m) => m.message)).to.deep.equal(["MSG 4", "MSG 5"]);
  });

  it("should accelerate a pending flush once a full batch is available", { retry: 5 }, async () => {
    _xhrReporterOptions.batchSize = 3;
    _xhrReporterOptions.interval = 60_000;
    _xhrReporter = new XhrReporter(_xhrReporterOptions);

    _xhrReporter.register(newLogMessage(_testUuid));
    _xhrReporter.register(newLogMessage(_testUuid));
    _xhrReporter.register(newLogMessage(_testUuid));

    await delay(200);

    const testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(1);
    const body = ((await testRequests[0].json()) as LogMessage[]) || [];
    expect(body.length).to.equal(3);
  });

  it("should back off after a failed delivery instead of retrying at the base interval", { retry: 5 }, async () => {
    let apiCalls = 0;
    _xhrReporterOptions.endpoint = "/logs?responseCode=400";
    _xhrReporterOptions.batchSize = 1;
    _xhrReporterOptions.interval = 100;
    _xhrReporterOptions.requestTransform = () => {
      apiCalls++;
    };
    _xhrReporter = new XhrReporter(_xhrReporterOptions);

    _xhrReporter.register(newLogMessage(_testUuid));

    // First attempt fires immediately (full batch) and fails after the mocked ~60ms latency.
    await delay(100);
    expect(apiCalls).to.equal(1);

    // The retry is scheduled with backoff (2 * interval = 200ms), so nothing fires yet.
    await delay(100);
    expect(apiCalls).to.equal(1);

    await delay(250);
    expect(apiCalls).to.equal(2);
  });

  it("should flush the remaining queue on dispose", { retry: 5 }, async () => {
    _xhrReporterOptions.batchSize = 10;
    _xhrReporterOptions.interval = 60_000;
    _xhrReporter = new XhrReporter(_xhrReporterOptions);

    _xhrReporter.register(newLogMessage(_testUuid));
    _xhrReporter.register(newLogMessage(_testUuid));
    _xhrReporter.register(newLogMessage(_testUuid));

    await _xhrReporter[Symbol.asyncDispose]();

    const testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(1);
    const body = ((await testRequests[0].json()) as LogMessage[]) || [];
    expect(body.length).to.equal(3);
  });

  it("should await an in-flight delivery when disposing", { retry: 5 }, async () => {
    _xhrReporter.register(newLogMessage(_testUuid));
    await delay(_xhrReporterOptions.interval + 5); // Let the flush timer fire; the request is now in flight.

    await _xhrReporter[Symbol.asyncDispose]();

    const testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(1);
  });

  it("should drop undeliverable messages on dispose instead of retrying forever", { retry: 5 }, async () => {
    _xhrReporterOptions.endpoint = "/logs?responseCode=400";
    _xhrReporterOptions.batchSize = 10;
    _xhrReporterOptions.interval = 60_000;
    _xhrReporter = new XhrReporter(_xhrReporterOptions);

    _xhrReporter.register(newLogMessage(_testUuid));

    await _xhrReporter[Symbol.asyncDispose]();
    await delay(100);

    const testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(1); // The single failed flush attempt; nothing rearms.
  });

  it("should treat a throwing requestTransform as a failed delivery and recover", { retry: 5 }, async () => {
    let shouldThrow = true;
    _xhrReporterOptions.batchSize = 1;
    _xhrReporterOptions.interval = 50;
    _xhrReporterOptions.requestTransform = () => {
      if (shouldThrow) {
        shouldThrow = false;
        throw new Error("broken transform");
      }
    };
    _xhrReporter = new XhrReporter(_xhrReporterOptions);

    _xhrReporter.register(newLogMessage(_testUuid));
    await delay(300); // Failed attempt at ~0ms, successful retry after backoff (~100ms).

    const testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(1);
  });

  it("should not fail if calling dispose multiple times", async () => {
    try {
      await _xhrReporter[Symbol.asyncDispose]();
      await nextTicks();
      await _xhrReporter[Symbol.asyncDispose]();
      await nextTicks();

      expect(true).to.eq(true);
    } catch (error) {
      expect(true).to.eq(false, error as unknown as string);
    }
  });

  it("should not fail when calling register after dispose", { retry: 5 }, async () => {
    let testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(0);

    await _xhrReporter[Symbol.asyncDispose]();
    await nextTicks();
    _xhrReporter.register(newLogMessage(_testUuid));
    _xhrReporter.register(newLogMessage(_testUuid));
    _xhrReporter.register(newLogMessage(_testUuid));
    await delay(_xhrReporterOptions.interval + 5);

    testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(0);
  });

  it.each([200, 201, 202, 204, 299])("should consider HTTP '%i' a valid response from the reporting endpoint", {
    retry: 5,
  }, async (httpResponseCode) => {
    _xhrReporterOptions.endpoint = `/logs?responseCode=${httpResponseCode}`;
    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 0, -1);

    await addMessagesToReporter(_xhrReporterOptions, _testUuid, _xhrReporter);

    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 1, 0);

    await delay(3 * _xhrReporterOptions.interval);

    await _xhrReporter[Symbol.asyncDispose]();

    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 1, -1);
  });

  it.each([400, 0, -1, -2])("should not consider HTTP '%i' a valid response and retry the messages next time", {
    retry: 5,
  }, async (httpResponseCode) => {
    let apiCalls = 0;
    _xhrReporterOptions.endpoint = `/logs?responseCode=${httpResponseCode}`;
    _xhrReporterOptions.interval = 50;
    _xhrReporterOptions.batchSize = 5;
    _xhrReporterOptions.requestTransform = (request: XMLHttpRequest) => {
      apiCalls++; // Count the number of times the request is made

      if (httpResponseCode === -1) {
        request.timeout = 10; // Simulate timeout
      }

      if (httpResponseCode === -2) {
        setTimeout(() => {
          request.abort(); // Simulate abort
        }, 10);
      }
    };

    await delay(2 * _xhrReporterOptions.interval);
    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 0, -1); // No requests should have been made since we have not added any messages

    await addMessagesToReporter(_xhrReporterOptions, _testUuid, _xhrReporter);

    expect(apiCalls).to.toBeGreaterThanOrEqual(1);

    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, apiCalls, 0);
    _xhrReporterOptions.endpoint = "/logs?responseCode=200";
    const expectedCalls = 1 + apiCalls /* failed calls count */;

    // After a failure the retry is delayed by exponential backoff (2 * interval for the first retry).
    await delay(4 * _xhrReporterOptions.interval);

    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, expectedCalls, expectedCalls - 1);

    await delay(2 * _xhrReporterOptions.interval);

    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, expectedCalls, -1);
  });

  it("should wait for reporting to finish before disposing", { retry: 5 }, async () => {
    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 0, -1);

    const lm = newLogMessage(_testUuid);
    lm.message = "UNIT TEST";
    _xhrReporter.register(lm);

    const disposeProm = _xhrReporter[Symbol.asyncDispose]();
    await delay(_xhrReporterOptions.interval);

    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 1, 0);

    await delay(3 * _xhrReporterOptions.interval);

    await disposeProm;

    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 1, -1);
  });
});
