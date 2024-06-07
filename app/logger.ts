import * as l from "../src/logger";

class HtmlReporter implements l.ILogsReporter {
  _element: HTMLElement;

  constructor() {
    this._element = document.getElementById("logs") as HTMLElement;
  }

  register(message: l.LogMessage): void {
    const logItem = document.createElement("li");
    logItem.textContent = `[${new Date(message.timestamp).toISOString()}] [${message.level}] ${message.message} ${
      message.errorMessage ?? "N/A"
    } ${message.extraParams ? JSON.stringify(message.extraParams) : ""}`;
    this._element.appendChild(logItem);
  }
  [Symbol.asyncDispose](): PromiseLike<void> {
    this._element.innerHTML = "";
    return Promise.resolve();
  }
}

const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

const xhrReporterOptions = new l.XhrReporterOptions();
xhrReporterOptions.endpoint = "/api/logs";
xhrReporterOptions.verb = "POST";

const xhrReporter = new l.XhrReporter(xhrReporterOptions);

const loggerOptions = new l.LoggerOptions();
loggerOptions.name = "MyAppLogger";
loggerOptions.minimumLevel = isDev ? l.LogLevel.Trace : l.LogLevel.Warning;
loggerOptions.reporter = isDev // For development, log to both the XHR endpoint and the console
  ? new l.MultipleReporter([new HtmlReporter(), new l.ConsoleReporter(console), xhrReporter])
  : new l.MultipleReporter([new HtmlReporter(), xhrReporter]);

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
