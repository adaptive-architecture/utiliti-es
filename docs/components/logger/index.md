---
outline: deep
---

# Logger

The `Logger` component allows you to log different events that happen in your code.

## Creating a logger

Import the logger from the package and create a new instance. Once you have created the instance you should keep a hold of it as long as you need to.

``` ts
import { Logger, LoggerOptions, LogLevel, ConsoleReporter } from "@adapt-arch/utiliti-es";

const loggerOptions = new LoggerOptions();
loggerOptions.name = "MyComponent";
loggerOptions.minimumLevel = LogLevel.Warning;
loggerOptions.reporter = new ConsoleReporter(console);

const logger = new Logger(loggerOptions);

// Log some messages using the shorthand methods.
logger.trace("Logger initialized.");
logger.debug("Debug message here.");
logger.info("This is an information.");
logger.warn("This might not be a good idea.");
logger.error("Something bad happened");
logger.crit("It is critical that you get this message");

const err = new Error("A super critical error.");

// Log using the 'log' method with extra params.
logger.log(LogLevel.Critical, "Something went seriously wrong.", err, {
  user: "Awesome User",
  user_level: 12345,
});
```

## Options

When creating a new logger instance you need to provide some options:
* `name` — the name of the logger. In your application you might have multiple instances and this is useful to filter the log items.
* `minimumLevel` — the minimum level that an item should have in order to be logged. Any items with a level lower than this will not be logged.
* `reporter` — the component that is responsible for forwarding/displaying the logs.
* `enrichers` — an array of `ILogMessageEnricher` instances that add metadata to every log message.

``` ts
import { LoggerOptions, LogLevel, ConsoleReporter } from "@adapt-arch/utiliti-es";

const loggerOptions = new LoggerOptions();
loggerOptions.name = "MyComponent";
loggerOptions.minimumLevel = LogLevel.Warning;
loggerOptions.reporter = new ConsoleReporter(console);
```

### Parsing log levels from strings

`LoggerOptions.getLevel()` converts a string (case-insensitive) into a `LogLevel` enum value. This is useful when reading the log level from configuration or environment variables.

``` ts
import { LoggerOptions, LogLevel } from "@adapt-arch/utiliti-es";

LoggerOptions.getLevel("warning");   // LogLevel.Warning
LoggerOptions.getLevel("DEBUG");     // LogLevel.Debug
LoggerOptions.getLevel("unknown");   // LogLevel.None
```

## Reporters

In order to send the messages to a place where they can be observed you need to configure a reporter.

Currently the library provides the following reporters:
* `ConsoleReporter` — outputs the logs to the console.
* `InMemoryReporter` — stores the logs in memory. One use case for this is unit tests, where you do not want to send the logs to an actual remote server or you want to assert that a message was logged.
* `XhrReporter` — uses `XMLHttpRequest` to send the logs to a remote endpoint in batches.
* `MultipleReporter` — combines multiple reporters so a single log message is sent to all of them.

``` ts
import {
  LoggerOptions,
  ConsoleReporter,
  XhrReporter,
  XhrReporterOptions,
  MultipleReporter,
} from "@adapt-arch/utiliti-es";

const isDev = true; // Depending on your build environment

const xhrOptions = new XhrReporterOptions();
xhrOptions.endpoint = "/api/logs";
xhrOptions.verb = "POST";

const xhrReporter = new XhrReporter(xhrOptions);

const loggerOptions = new LoggerOptions();
loggerOptions.reporter = isDev
  ? new MultipleReporter([new ConsoleReporter(console), xhrReporter])
  : xhrReporter;
```

### XhrReporter options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `endpoint` | `string` | `""` | The URL that receives the logs |
| `verb` | `string` | `"POST"` | HTTP method used when calling the endpoint |
| `batchSize` | `number` | `20` | Number of messages to accumulate before sending a batch |
| `interval` | `number` | `2000` | Maximum time (ms) to wait before flushing the current batch |
| `requestTransform` | `(request: XMLHttpRequest) => void` | `undefined` | A callback to modify the `XMLHttpRequest` before it is sent (e.g. to add auth headers) |

``` ts
import { XhrReporterOptions, XhrReporter } from "@adapt-arch/utiliti-es";

const options = new XhrReporterOptions();
options.endpoint = "/api/logs";
options.batchSize = 50;
options.interval = 5_000;
options.requestTransform = (xhr) => {
  xhr.setRequestHeader("Authorization", "Bearer my-token");
};

const reporter = new XhrReporter(options);
```

## Enrichers

In some cases you might want to automatically enrich the log items with certain values. For example you might need to know the user agent and the current page in order to debug certain errors.

### ValuesEnricher

Adds a fixed set of key/value pairs to every log message.

``` ts
import { LoggerOptions, ValuesEnricher } from "@adapt-arch/utiliti-es";

const loggerOptions = new LoggerOptions();
loggerOptions.enrichers.push(
  new ValuesEnricher(
    {
      userAgentString: window.navigator.userAgent,
      currentPage: window.location.href,
    },
    false, // overrideExisting
  ),
);
```

### DynamicValuesEnricher

Like `ValuesEnricher`, but the values are computed at log time by calling a function. This is useful for values that change over time, such as the current URL in a single-page application.

``` ts
import { LoggerOptions, DynamicValuesEnricher } from "@adapt-arch/utiliti-es";

const loggerOptions = new LoggerOptions();
loggerOptions.enrichers.push(
  new DynamicValuesEnricher(
    () => ({
      currentPage: window.location.href,
      timestamp: Date.now(),
    }),
    false, // overrideExisting
  ),
);
```

### The `overrideExisting` parameter

Both `ValuesEnricher` and `DynamicValuesEnricher` accept an `overrideExisting` boolean as their second argument.

* When `false` (recommended default) — if the log message already has an extra parameter with the same key, the enricher will **not** overwrite it.
* When `true` — the enricher value always wins, even if the log message already contains that key.

## Checking log level

Use `isEnabled()` to check whether a particular level would be logged before performing expensive work to build a message.

``` ts
import { LogLevel } from "@adapt-arch/utiliti-es";

if (logger.isEnabled(LogLevel.Debug)) {
  const details = computeExpensiveDebugInfo();
  logger.log(LogLevel.Debug, "Debug details", undefined, details);
}
```

## Logging pre-built messages

If you need full control over the log message you can construct a `LogMessage` instance yourself and pass it to `logMessage()`.

``` ts
import { LogMessage, LogLevel } from "@adapt-arch/utiliti-es";

const msg = new LogMessage();
msg.level = LogLevel.Information;
msg.message = "Custom message";
msg.extraParams = { key: "value" };

logger.logMessage(msg);
```

## Disposal

`Logger` implements `AsyncDisposable`. Disposing the logger disposes its reporter, which is important for the `XhrReporter` to flush any remaining batched messages.

``` ts
import { Logger, LoggerOptions, LogLevel, XhrReporter, XhrReporterOptions } from "@adapt-arch/utiliti-es";

const xhrOptions = new XhrReporterOptions();
xhrOptions.endpoint = "/api/logs";

const loggerOptions = new LoggerOptions();
loggerOptions.name = "MyApp";
loggerOptions.minimumLevel = LogLevel.Information;
loggerOptions.reporter = new XhrReporter(xhrOptions);

{
  await using logger = new Logger(loggerOptions);

  logger.info("Application started");
  // ...
} // logger is disposed here — XhrReporter flushes remaining messages
```
