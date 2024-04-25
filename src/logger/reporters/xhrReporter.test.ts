// @vitest-environment jsdom

import { type SetupServerApi, setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getLogReporterHandlers } from "../../mocks/logReporterHandlers";
import { delay } from "../../utils";
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
  });
});

describe("XhrReporter", () => {
  let _server: SetupServerApi;
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
      const _r = new XhrReporter(null as unknown as XhrReporterOptions);
    }).to.throw();
  });

  it("should not fail if calling dispose multiple times", async () => {
    try {
      await _xhrReporter[Symbol.asyncDispose]();
      await delay(1);
      await _xhrReporter[Symbol.asyncDispose]();
      await delay(1);

      expect(true).to.eq(true);
    } catch (error) {
      expect(true).to.eq(false, error as unknown as string);
    }
  });

  it("should not fail when calling register after dispose", { retry: 5 }, async () => {
    let testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(0);

    await _xhrReporter[Symbol.asyncDispose]();
    await delay(1);
    _xhrReporter.register(newLogMessage(_testUuid));
    _xhrReporter.register(newLogMessage(_testUuid));
    _xhrReporter.register(newLogMessage(_testUuid));
    await delay(_xhrReporterOptions.interval + 5);

    testRequests = await filterRequest(_handledRequests, _testUuid);
    expect(testRequests.length).to.equal(0);
  });

  it.each([200, 201, 202, 204, 299])(
    "should consider HTTP '%i' a valid response from the reporting endpoint",
    { retry: 5 },
    async (httpResponseCode) => {
      _xhrReporterOptions.endpoint = `/logs?responseCode=${httpResponseCode}`;
      await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 0, -1);

      await addMessagesToReporter(_xhrReporterOptions, _testUuid, _xhrReporter);

      await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 1, 0);

      await delay(3 * _xhrReporterOptions.interval);

      await _xhrReporter[Symbol.asyncDispose]();

      await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 1, -1);
    },
  );

  it.each([400, 0, 1])(
    "should not consider HTTP '%i' a valid response and retry the messages next time",
    { retry: 5 },
    async (httpResponseCode) => {
      let apiCalls = 0;
      _xhrReporterOptions.endpoint = `/logs?responseCode=${httpResponseCode}`;
      _xhrReporterOptions.interval = 50;
      _xhrReporterOptions.batchSize = 5;
      _xhrReporterOptions.requestTransform = (request: XMLHttpRequest) => {
        apiCalls++; // Count the number of times the request is made

        if (httpResponseCode === -1) {
          request.timeout = 10;
        }
      };

      await delay(2 * _xhrReporterOptions.interval);
      await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 0, -1); // No requests should have been made since we have not added any messages

      await addMessagesToReporter(_xhrReporterOptions, _testUuid, _xhrReporter);

      expect(apiCalls).to.toBeGreaterThanOrEqual(1);

      await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, apiCalls, 0);
      _xhrReporterOptions.endpoint = "/logs?responseCode=200";
      const expectedCalls = 1 + apiCalls /* failed calls count */;

      await delay(2 * _xhrReporterOptions.interval);

      await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, expectedCalls, expectedCalls - 1);

      await delay(2 * _xhrReporterOptions.interval);

      await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, expectedCalls, -1);
    },
  );

  it("should handle a request abort and retry the messages next time", { retry: 5 }, async () => {
    let apiCalls = 0;
    _xhrReporterOptions.endpoint = "/logs?responseCode=-1";
    _xhrReporterOptions.interval = 50;
    _xhrReporterOptions.batchSize = 5;
    _xhrReporterOptions.requestTransform = (request: XMLHttpRequest) => {
      if (request.responseURL.indexOf("responseCode=-1") > 0) {
        setTimeout(() => {
          request.abort();
        }, 10);
      }
      apiCalls++; // Count the number of times the request is made
    };

    await delay(2 * _xhrReporterOptions.interval);
    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, 0, -1); // No requests should have been made since we have not added any messages

    await addMessagesToReporter(_xhrReporterOptions, _testUuid, _xhrReporter);

    expect(apiCalls).to.toBeGreaterThanOrEqual(1);

    await checkExpectedRequests(_handledRequests, _testUuid, _xhrReporterOptions, apiCalls, 0);
    _xhrReporterOptions.endpoint = "/logs?responseCode=200";
    const expectedCalls = 1 + apiCalls /* failed calls count */;

    await delay(2 * _xhrReporterOptions.interval);

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
