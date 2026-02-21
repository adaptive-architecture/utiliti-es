# AGENTS.md

This file provides guidance for AI coding agents working on the utiliti-es project.

## Project Overview

**utiliti-es** is a TypeScript utilities library providing reusable components for adaptive architecture patterns. It includes three main modules:

- **Logger**: Structured logging with configurable reporters and enrichers
- **PubSub**: Event-based publish/subscribe system with plugin support
- **Utils**: Common utility functions (delay, nextTicks)

## Setup

```bash
npm install
```

## Build & Test

### Development
```bash
npm run dev          # Start Vite dev server
npm run build        # Build the library (TypeScript + Vite)
npm run test         # Run tests with coverage
npm run test:watch   # Run tests in watch mode
```

### Code Quality
```bash
npm run lint         # Format and check code with Biome
npm run lint:fix     # Auto-fix linting issues
```

### Documentation
```bash
npm run docs:dev     # Start documentation dev server
npm run docs:build   # Build documentation site
npm run typedoc      # Generate API documentation
```

## Code Quality Standards

### Coverage Requirements
- **100% code coverage is mandatory** for all metrics (branches, functions, lines, statements)
- Tests must pass before any code changes are committed
- Use `npm run test` to verify coverage

### TypeScript Standards
- **Strict mode enabled** - all TypeScript strict checks must pass
- Provide explicit types for function parameters and return values
- Use interfaces from `contracts.ts` files for type definitions
- Target: ESNext with DOM support

### Code Style
- Formatting is enforced by **Biome** (configuration in `biome.json`)
- Use tabs for indentation
- Line width: 120 characters
- Always run `npm run lint` before committing

## Project Structure

```
src/
├── common/              # Shared types (SerializableValues)
├── logger/              # Logger module
│   ├── contracts.ts     # ILogger, LogLevel interfaces
│   ├── logger.ts        # Core Logger class
│   ├── enrichers/       # Log enrichment plugins
│   └── reporters/       # Log output handlers
├── pubsub/              # PubSub module
│   ├── contracts.ts     # IPubSubHub interface
│   ├── pubsub.ts        # Core PubSubHub class
│   └── plugins/         # PubSub extensions
└── utils/               # Utility functions
```

## Development Guidelines

### Adding New Features

1. **Create interface first**: Define contracts in `contracts.ts` files
2. **Implement with tests**: Write tests alongside implementation (TDD encouraged)
3. **Update documentation**: Add examples to `docs/components/` directory
4. **Verify coverage**: Ensure 100% coverage is maintained

### Module Patterns

#### Logger Module
- Uses **Reporter pattern** for output handling
- Supports **Enrichers** to add metadata to logs
- All reporters implement `ILogReporter` interface
- Supports async disposal via `Symbol.dispose`

#### PubSub Module
- Uses **plugin architecture** for extensibility
- Messages are **structurally cloned** for isolation
- Topics are string-based for flexibility
- Supports cross-tab communication via BroadcastChannel plugin

#### Utils Module
- Pure functions with no side effects
- Async utilities use Promises
- Comprehensive JSDoc comments required

### Testing Guidelines

- Use **Vitest** for all tests
- Mock HTTP requests with **MSW** (Mock Service Worker)
- Use **JSDOM** for DOM-related tests
- Test files should mirror source structure: `src/logger/logger.ts` → `src/logger/logger.test.ts`
- Write tests for:
  - Happy path scenarios
  - Error conditions
  - Edge cases (null, undefined, empty values)
  - Async behavior and timing

### Error Handling

- Use `try/catch` for async operations
- Log errors appropriately using the Logger module
- Provide meaningful error messages
- Extract and include stack traces where relevant

## Security Considerations

- **No eval() or Function constructor**: Avoid dynamic code execution
- **Sanitize log data**: Be careful with PII in logs
- **XHR Reporter**: Only send logs to trusted endpoints
- **Input validation**: Validate all external inputs

## Documentation Updates

When modifying code:

1. **Update JSDoc comments**: Keep inline documentation current
2. **Update VitePress docs**: Modify files in `docs/components/`
3. **Update README**: If public API changes
4. **Regenerate TypeDoc**: Run `npm run typedoc` for API docs

## Build Output

The library builds to multiple formats:
- **ESM**: Modern JavaScript modules
- **CommonJS**: Node.js compatibility
- **UMD**: Browser compatibility
- **IIFE**: Standalone browser bundle

Entry point: `src/index.ts` (exports all public APIs)

## CI/CD Integration

- **GitHub Actions** workflows run on push/PR
- **SonarCloud** integration for code quality analysis
- **Dependabot** manages dependency updates
- Tests and linting must pass before merging

## Common Tasks

### Adding a New Reporter
1. Create new file in `src/logger/reporters/`
2. Implement `ILogReporter` interface
3. Add tests with 100% coverage
4. Export from `src/logger/index.ts`
5. Document in `docs/components/logger/`

### Adding a New PubSub Plugin
1. Create new file in `src/pubsub/plugins/`
2. Implement `IPubSubPlugin` interface
3. Add tests with 100% coverage
4. Export from `src/pubsub/index.ts`
5. Document in `docs/components/pub-sub/`

### Adding a New Utility Function
1. Create function in `src/utils/`
2. Add comprehensive JSDoc
3. Write thorough tests
4. Export from `src/utils/index.ts`
5. Update main `src/index.ts` if public API

### LLM.txt (`docs/public/llm.txt`)

The `docs/public/llm.txt` file follows the [llmstxt.org](https://llmstxt.org/) specification and is served at the root of the GitHub Pages site. It provides a machine-readable summary of the project documentation for AI agents.

- **Keep it in sync** with documentation changes: when docs pages are added, removed, or renamed, update `llm.txt` accordingly
- It is included in the site build via VitePress's `public` directory
- Links must point to the rendered pages at `https://adaptive-architecture.github.io/utiliti-es/<page>`
- Follow the spec structure: H1 (project name), blockquote (summary), body (modules), H2 sections (file lists with URLs)

## Troubleshooting

- **Coverage failing**: Check `vite.config.ts` thresholds and ensure all code paths are tested
- **Build errors**: Verify TypeScript types and check `tsconfig.json` settings
- **Lint errors**: Run `npm run lint:fix` to auto-fix formatting issues
- **Test failures**: Check MSW handlers in `test/` directory for mock setup

## Key Files to Review

- `package.json`: Scripts, dependencies, and package configuration
- `tsconfig.json`: TypeScript compiler settings
- `vite.config.ts`: Build and test configuration
- `biome.json`: Linting and formatting rules
- `docs/.vitepress/config.ts`: Documentation site configuration
