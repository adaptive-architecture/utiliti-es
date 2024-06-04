/// <reference types="vite" />

import * as l from "../src/logger";

const isDev = !!import.meta.env.DEV;

const xhrReporterOptions = new l.XhrReporterOptions();
xhrReporterOptions.endpoint = "/api/logs";
xhrReporterOptions.verb = "POST";

const xhrReporter = new l.XhrReporter(xhrReporterOptions);

const loggerOptions = new l.LoggerOptions();
loggerOptions.name = "MyAppLogger";
loggerOptions.minimumLevel = isDev ? l.LogLevel.Trace : l.LogLevel.Warning;
loggerOptions.reporter = isDev // For development, log to both the XHR endpoint and the console
  ? new l.MultipleReporter([new l.ConsoleReporter(console), xhrReporter])
  : xhrReporter;

// We want to add the user agent string to each of the log items.
loggerOptions.enrichers.push(
  new l.ValuesEnricher(
    {
      ua: window.navigator.userAgent,
      page: window.location.href,
    },
    false,
  ),
);

const logger = new l.Logger(loggerOptions);

export { logger };
