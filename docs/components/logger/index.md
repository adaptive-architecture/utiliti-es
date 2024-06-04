---
outline: deep
---

# Logger

The `Logger` components allows you to log different events that happen in your code.

## Creating a logger

Import the logger from the utilities and create a new instance. Once you have create the instance you should keep a hold of it as long as you need to.

``` ts
import * as l from "@adapt-arch/utiliti-es/logger";

const loggerOptions = /*Omitted for this sample*/;

const logger = new l.Logger(loggerOptions);

// Log some messages using the shorthand version.
logger.trace("Logger initialized.");
logger.debug("Debug message here.");
logger.info("This is an information.");
logger.warn("This might not be a good idea.");
logger.error("Something bad happened");
logger.crit("It is critical that you get this message");

const err = new Error("A super critical error.");

// Log using the 'log' method.
logger.log(l.LogLevel.Critical, "Something went seriously wrong.", err, {
  user: "Awesome User",
  user_level: 12345,
});

```


## Options

When creating a new logger instance you need to provide some options:
* `name` - the name of the logger. In you application you might have multiple instances and this might be useful to filter the log items.
* `minimumLevel` - the minimum level that an item should have in order to be logged. Any items with a level lower than this will not be logged.
* `reporter` - the component that is responsible to forward/display the logs.

``` ts
import * as l from "@adapt-arch/utiliti-es/logger";

const loggerOptions = new l.LoggerOptions();
loggerOptions.name = "MyComponent";
loggerOptions.minimumLevel = l.LogLevel.Warning;
loggerOptions.reporter = new l.ConsoleReporter(console);
```


## Reporters

In order to send the messages to a place where they can be observed you need to configure a reporter.

Currently the library provides the following reporters:
* `ConsoleReporter` - this will output the logs to the console.
* `InMemoryReporter` - this can be used to store the logs in memory. On use case for this is unit tests, where you do not want to send the logs to an actual remote server or you want to test that a message was logged.
* `XhrReporter` - this uses a `XMLHttpRequest` to send the logs to a remote endpoint.
* `MultipleReporter` - this can be used to combine together multiple reporters.

Sample
``` ts
import * as l from "@adapt-arch/utiliti-es/logger";

const isDev = true; // Depending on your build environment, you can set this to the appropriate value

const xhrReporterOptions = new l.XhrReporterOptions();
xhrReporterOptions.endpoint = "/api/logs";
xhrReporterOptions.verb = "POST";

const xhrReporter = new l.XhrReporter(xhrReporterOptions);

const loggerOptions = new l.LoggerOptions();
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
```

## Enrichers

In some cases you might want to automatically enrich the log items with certain values. For example you might need to know the user agent and the current page in order to debug certain errors.

This can be achieved by using an enricher.

``` ts
import * as l from "@adapt-arch/utiliti-es/logger";

loggerOptions.enrichers.push(
  new l.ValuesEnricher(
    {
      userAgentString: window.navigator.userAgent,
      currentPage: window.location.href,
    },
    false,
  ),
);
```
