---
outline: deep
---

# Components

The library offers a set of components to allow you to focus on business code instead of boilerplate.

## [Logger](/components/logger/)

Structured logging with configurable reporters and enrichers. Supports console output, in-memory collection, HTTP batching, and multiple simultaneous reporters.

## [PubSub](/components/pub-sub/)

Event-based publish/subscribe hub with plugin support. Messages are delivered asynchronously and structurally cloned for isolation. Extend with the built-in [plugins](/components/pub-sub/plugins) for cross-tab messaging and logging.

## [Utils](/components/utils/)

Common async utility functions — `delay` for timed promises and `nextTicks` for flushing event-loop ticks.
