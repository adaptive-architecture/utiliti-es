import { http, HttpResponse, delay } from "msw";

// https://mswjs.io/docs/basics/mocking-responses
export function getLogReporterHandlers(handledRequestsContainer?: Array<Request>) {
  return [
    http.post("*/logs*", async ({ request }) => {
      if (handledRequestsContainer) {
        handledRequestsContainer.push(request.clone());
      }

      // Get the responseCode from the query string
      const responseCode = new URL(request.url).searchParams.get("responseCode");
      let status = responseCode ? Number.parseInt(responseCode) : 200;

      if (Number.isNaN(status)) {
        status = 200;
      }

      if (status < 200 || status < 300) {
        await delay(60); // Simulate network latency
      }

      if (status === 0) {
        // Simulate a network error
        return HttpResponse.error();
      }

      return new HttpResponse(null, {
        status: status,
      });
    }),
  ];
}
