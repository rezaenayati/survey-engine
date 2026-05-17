# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### API

- **`POST /surveys/:id/duplicate`** — clone any survey into a fresh draft. The copy gets `(copy)` appended
  to its name and starts with no versions or responses. Ownership rules apply.
- **`POST /responses`** is now the canonical route for starting a response session.
  `POST /responses/start` is kept for backwards compatibility and responds with
  `Deprecation: true`, `Link: </responses>; rel="successor-version"`, and `Sunset` headers.
- **Structured error codes** — every API error body now includes a stable `code` string alongside
  `statusCode` and `message`. Codes are machine-readable and safe to branch on without parsing
  the message text. Examples: `SURVEY_NOT_FOUND`, `RESPONSE_ALREADY_COMPLETED`, `FORBIDDEN`,
  `INVALID_SCHEMA`, `RATE_LIMITED`.
- **`X-Request-ID` response header** — every response now carries a traceable request ID.
  The value is the inbound `X-Correlation-ID` when present, or a freshly generated UUID otherwise.

### Logic engine

- **⚠️ Breaking: string equality is now case-sensitive by default.** The `EQUALS` and
  `CONTAINS` operators previously lower-cased both sides before comparing — so
  `"Yes" === "yes"` and `"World" CONTAINS "world"` evaluated true. This was inconsistent
  with `STARTS_WITH`/`ENDS_WITH`/`MATCHES` (which were already case-sensitive) and could
  mask real bugs.

  To restore the previous behaviour for a survey, set
  `logicJson.globalSettings.caseSensitiveStringComparison = false`. Existing surveys whose
  rules happened to match by case-insensitive luck will start producing different results
  on upgrade — review your conditions or set the flag.

- **`CALCULATED` rule expression evaluation** — calculated field rules now evaluate their
  `expression` string instead of storing it raw. Supported syntax:
  - `{questionId}` substitution from current answers
  - Arithmetic: `+`, `-`, `*`, `/`, `%`, `**` with correct precedence and parentheses
  - String concatenation when either operand is a string
  - Built-in functions: `ROUND(x, d?)`, `FLOOR`, `CEIL`, `ABS`, `MIN`, `MAX`, `SUM`, `CONCAT`, `IF`
  - Returns `null` on any parse or evaluation error (never throws)

### SDK

- **`survey-engine-sdk` published to npm** — `npm install survey-engine-sdk`
  ([npmjs.com/package/survey-engine-sdk](https://www.npmjs.com/package/survey-engine-sdk))
- **`client.surveys.duplicate(id)`** — mirrors the new duplicate endpoint
- **`SurveyEngineError.code`** — the `SurveyEngineError` class now exposes a `.code` property
  that reads the stable error code from the API response body
- **`ListSurveysQuery.sortBy`** narrowed to `'createdAt' | 'updatedAt' | 'name' | 'status'`
- **`ListResponsesQuery.sortBy`** narrowed to `'startedAt' | 'updatedAt' | 'completedAt'`
- **`client.responses.start()`** now calls `POST /responses` (the new canonical route)

### Tests

- 288 unit tests (up from 259) — added coverage for `duplicate`, expression evaluator
  (arithmetic, built-in functions, error handling), and `CALCULATED` rule integration

### Developer experience

- **Pre-commit hooks** (husky + lint-staged) — Prettier + ESLint run on staged `src/` and
  `test/` files; `tsc --noEmit` runs on the full project before every commit
- **4-space indentation** — Prettier `tabWidth` updated to 4; `.vscode/settings.json` added
  so Cursor/VSCode uses the same setting without manual configuration
- **`package.json`** — added `repository`, `homepage`, and `bugs` fields pointing to the
  GitHub repository

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
- `survey-engine-sdk` — TypeScript client with full type coverage
- 259 unit tests (jest) and integration tests (testcontainers/PostgreSQL)
- GitHub Actions CI: lint, build, unit tests with coverage, integration tests
- Docker Compose for local development
- Example: full-stack Next.js app with SurveyJS Creator, survey-taking, and analytics (`examples/nextjs/`)
- `CONTRIBUTING.md`, `SECURITY.md`, and this `CHANGELOG.md`

---

> For unreleased changes, see the [commit history](https://github.com/rezaenayati/survey-engine/commits/main).
