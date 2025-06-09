# DMR Server

Backend server for  DMR project.

## Requirements

- Node.js >=22.16.0 (LTS)
- pnpm >=10.12.1

## Project Setup

```bash
# Install dependencies
pnpm install
```

## Development

```bash
# Start development server with hot reload
pnpm run start:dev

# Start development server with debug mode
pnpm run start:debug
```

## Production

```bash
# Build for production
pnpm run build

# Start production server
pnpm run start:prod
```

## Testing

The project uses Vitest for both unit and E2E testing.

```bash
# Run unit tests
pnpm test

# Run unit tests in watch mode
pnpm test:watch

# Run E2E tests
pnpm test:e2e

# Generate test coverage report
pnpm test:coverage
```

## Code Quality

```bash
# Run ESLint
pnpm run lint

# Format code with Prettier
pnpm run format
```

## Project Structure

```
src/
├── health/              # Health check module (example)
│   ├── health.controller.ts
│   ├── health.module.ts
│   ├── health.service.ts
│   └── health.service.spec.ts
└── main.ts             # Application entry point

test/
└── health.e2e-spec.ts  # E2E tests
```

## License

[MIT licensed](LICENSE)
