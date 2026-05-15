# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-05-15

Initial public release.

### Added

**Core API**
- Survey management: create, update, publish, archive, and delete surveys
- Immutable survey versioning — every publish creates a SHA-256 checksummed snapshot
- Response collection: start, save partial progress, and complete responses
- Server-side logic evaluation: visibility, required, skip, and calculated-value rules
- Survey analytics: completion funnel, trends over time, per-question breakdowns, text-response word frequency

**Webhooks**
- Configure a `webhookUrl` per survey to receive `response.started` and `response.completed` events
- HMAC-SHA256 payload signing (`X-Survey-Engine-Signature`) with per-survey or global secret
- Fire-and-forget delivery with up to 3 automatic retries (exponential back-off: 1s / 2s / 4s)
- 10-second per-attempt timeout to prevent stalled background requests

**Security**
- Optional global API key (`API_KEY`) — supports `Authorization: Bearer` and `X-API-Key` headers
- Ownership-based access control: users can only list, update, and delete their own surveys and responses
- Helmet security headers
- Rate limiting (configurable via `THROTTLE_TTL` / `THROTTLE_LIMIT`)
- CORS with configurable allowed origins

**Operations**
- Structured JSON logging via Pino (`LOG_LEVEL` configurable)
- `/health` (liveness) and `/health/ready` (readiness with DB ping) endpoints
- Graceful shutdown hooks
- TypeORM migrations — schema is managed via explicit migration files in production

**Developer experience**
- OpenAPI / Swagger docs at `/api/docs`
- `@survey-engine/sdk` — TypeScript client with full type coverage
- 78 unit tests (jest) and integration tests (testcontainers/PostgreSQL)
- GitHub Actions CI: lint, build, unit tests with coverage, integration tests
- Docker Compose for local development
- Example: Express backend integration (`examples/express-backend/`)
- Example: React + SurveyJS frontend (`examples/react-frontend/`)
- `CONTRIBUTING.md`, `SECURITY.md`, and this `CHANGELOG.md`

---

> For unreleased changes, see the [commit history](https://github.com/your-org/survey-engine/commits/main).
