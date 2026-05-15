# Contributing to Survey Engine

Thank you for your interest in contributing. This document explains how to set up a development environment and submit changes.

---

## Development setup

### Prerequisites

- Node.js 20+
- Docker (required for integration tests via testcontainers)
- PostgreSQL 16+ (or use the provided Docker Compose)

### Getting started

```bash
# Clone the repo
git clone https://github.com/rezaenayati/survey-engine.git
cd survey-engine

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start PostgreSQL
docker-compose up -d postgres

# Start dev server (auto-syncs schema)
npm run start:dev
```

The API will be at `http://localhost:3000` and Swagger docs at `http://localhost:3000/api/docs`.

---

## Running tests

```bash
# Unit tests (no Docker required)
npm test

# Unit tests in watch mode
npm run test:watch

# Unit tests with coverage
npm run test:cov

# Integration tests (requires Docker for testcontainers)
npm run test:e2e
```

Unit tests live in `test/unit/` mirroring the `src/` folder structure. Integration tests live in `test/integration/`.

---

## Project structure

```
src/
├── app.module.ts          Root module
├── main.ts                Entry point
├── common/                Shared utilities (context, DTOs, pagination)
├── database/
│   ├── typeorm.config.ts  TypeORM CLI config
│   └── migrations/        Database migrations
├── surveys/               Survey CRUD and versioning (publishing, runtime, logic evaluation)
├── responses/             Response collection (start, save, complete, validate)
├── analytics/             Analytics facade + aggregation, question analytics, export
├── schema/                Logic engine, schema validator, response validator
├── webhooks/              Webhook delivery with HMAC signing and retry logic
└── health/                Liveness + readiness endpoints

sdk/                       npm package (@survey-engine/sdk)
docs/                      In-depth documentation
examples/nextjs/           Full-stack Next.js example (SurveyJS Creator + survey-taking + analytics)
test/
├── unit/                  Unit tests (jest) — mirrors src/ structure
└── integration/           Integration (e2e) tests (testcontainers/PostgreSQL)
```

---

## Database migrations

When you add or change a TypeORM entity, generate a migration:

```bash
# Generate a new migration based on entity changes
npm run migration:generate -- src/database/migrations/MyMigrationName

# Apply pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert
```

Never modify an existing migration that has already been applied to a deployed database. Always add a new migration instead.

---

## Code style

- ESLint + Prettier handle formatting. Run `npm run lint` before committing.
- No `console.log` in production code — use the NestJS Logger or pino.
- No `any` types without an explanatory comment.
- Keep services free of HTTP concerns (no `@Req`, `@Res` in services).

---

## SDK changes

If you change a public API endpoint (add/remove fields, change status codes), update the corresponding types in `sdk/src/types/` so the SDK stays in sync.

---

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Make your changes with tests.
3. Run `npm run build && npm test && npm run test:e2e`.
4. Open a PR using the template — fill in all sections.
5. The CI must pass before merging.

---

## Reporting issues

Use the GitHub issue templates. For security vulnerabilities, do **not** open a public issue — email the maintainers directly.
