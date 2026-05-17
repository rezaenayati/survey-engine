# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] — 2026-05-18

### Security & trust

- **`STRICT_AUTH=true` env flag** — when set, requests carrying `X-User-ID` must also pass
  the `API_KEY` check. Closes the "anonymous caller sets `X-User-ID: <victim>`" loophole on
  internet-reachable deployments. Default off (preserves trusted-gateway mode).
- **Signed user tokens (`X-User-Token`)** — opt-in HS256 JWTs verified server-side. Set
  `USER_TOKEN_SECRET` to enable; the SDK exposes a `userToken` option that sends the header.
  Combined with `STRICT_AUTH=true`, `X-User-ID` is rejected entirely — only signed tokens
  are honored. New `UserAuthGuard` runs alongside `ApiKeyGuard`.
- **`SECURITY.md` trust contract** rewritten with four supported deployment shapes
  (trusted gateway / API key / strict auth / signed tokens) and a minting example.
- **⚠️ Breaking: ownership semantics tightened.** `assertOwner` and `assertRespondent` no
  longer allow an anonymous caller to mutate an identified resource. Anonymous resources
  stay mutable by default; set `STRICT_AUTH=true` to make them read-only too.
- **⚠️ Breaking: drafts hidden from non-owners.** `GET /surveys/:id` now returns 404 for
  drafts/archived surveys the caller doesn't own (was returning the full body). Published
  surveys remain public; `GET /surveys/:id/runtime` is unchanged.

### Reliability

- **Durable webhook delivery (outbox pattern).** New `webhook_deliveries` table written
  in the same transaction as the response state change. New `WebhookDispatcherService`
  drains pending rows on an interval (`@nestjs/schedule`) with `FOR UPDATE SKIP LOCKED`
  for multi-instance safety. Tunables via env: `WEBHOOK_POLL_INTERVAL_MS` (default 1000),
  `WEBHOOK_MAX_ATTEMPTS` (3), `WEBHOOK_BATCH_SIZE` (10), `WEBHOOK_FETCH_TIMEOUT_MS` (10000),
  `WEBHOOK_DISPATCHER_ENABLED` (true). The fire-and-forget in-process loop is gone — a
  crash between response save and webhook POST no longer loses events.
- **⚠️ Breaking: `DB_SYNCHRONIZE` is now explicit.** TypeORM `synchronize` is opt-in via
  `DB_SYNCHRONIZE=true` (default off). The old `synchronize: NODE_ENV !== 'production'`
  meant any non-`production` env (staging, CI, mistyped NODE_ENV) silently auto-synced
  schema. Migrations run automatically on startup whenever `DB_SYNCHRONIZE` is not true.
  Local dev `.env` files should add `DB_SYNCHRONIZE=true`.

### Files

- **File uploads** with pluggable storage drivers — local filesystem (default),
  S3-compatible (MinIO, R2, etc.), and Firebase Storage. `POST /files`, `GET /files/:id`,
  `DELETE /files/:id`. Per-question file rules (`allowedFileTypes`, `maxFileSize`)
  enforced when `surveyId` + `questionId` are passed at upload time. SDK:
  `client.files.upload(file, options)`, `client.files.download(id)`,
  `client.files.delete(id)`.

### API

- **`POST /surveys/:id/duplicate`** — clone any survey into a fresh draft. The copy gets
  `(copy)` appended to its name and starts with no versions or responses. Ownership rules
  apply.
- **`POST /responses`** is now the canonical route for starting a response session.
  `POST /responses/start` is kept for backwards compatibility and responds with
  `Deprecation: true`, `Link: </responses>; rel="successor-version"`, and `Sunset` headers.
- **Structured error codes** — every API error body now includes a stable `code` string
  alongside `statusCode` and `message`. Codes are machine-readable and safe to branch on
  without parsing the message text. Examples: `SURVEY_NOT_FOUND`,
  `RESPONSE_ALREADY_COMPLETED`, `FORBIDDEN`, `INVALID_SCHEMA`, `INVALID_USER_TOKEN`,
  `STRICT_AUTH_VIOLATION`, `FILE_TOO_LARGE`, `FILE_TYPE_NOT_ALLOWED`, `RATE_LIMITED`.
- **`X-Request-ID` response header** — every response now carries a traceable request ID.
  The value is the inbound `X-Correlation-ID` when present, or a freshly generated UUID
  otherwise.

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
  - Built-in functions: `ROUND(x, d?)`, `FLOOR`, `CEIL`, `ABS`, `MIN`, `MAX`, `SUM`,
    `CONCAT`, `IF`
  - Returns `null` on any parse or evaluation error (never throws)

### SDK

- **`survey-engine-sdk` published to npm** — `npm install survey-engine-sdk`
  ([npmjs.com/package/survey-engine-sdk](https://www.npmjs.com/package/survey-engine-sdk))
- **`userToken` client option** — forwards an HS256-signed JWT in `X-User-Token` (additive,
  backwards-compatible with 1.0.x).
- **`client.responses.start()` fallback** — calls `POST /responses` and falls back to the
  deprecated `POST /responses/start` on 404, so the SDK works against both pre- and
  post-rename backends.
- **`client.surveys.duplicate(id)`** — mirrors the new duplicate endpoint.
- **`client.files.*`** — upload, download, and delete files attached to file-question
  answers.
- **`SurveyEngineError.code`** — the `SurveyEngineError` class now exposes a `.code`
  property that reads the stable error code from the API response body.
- **`ListSurveysQuery.sortBy`** narrowed to `'createdAt' | 'updatedAt' | 'name' | 'status'`.
- **`ListResponsesQuery.sortBy`** narrowed to `'startedAt' | 'updatedAt' | 'completedAt'`.

### Internals

- **Analytics SQL hardening** — median completion time collapsed into the main aggregate
  (no more regex-rewritten subquery); all `ResponseStatus` interpolations replaced with
  bound parameters.
- **Error-code registry** — central `ErrorCodes` const + `codeForStatus(status)` fallback
  helper. Replaced the substring-match `deriveCode` tower in `HttpExceptionFilter`.
- **Guard split** — `ApiKeyGuard` shrunk to just the API-key concern; user-identity logic
  (token verification, strict-auth rules) lives in `UserAuthGuard`. Both honor the same
  `@SkipApiKey()` decorator.
- **Ownership unification** — `SurveyVersionsService` had its own private (buggy)
  `assertOwner`; folded into the canonical `SurveysService.assertOwner` (hybrid policy).
- **`request-context.decorator` cleanup** — correlation ID resolution centralised in
  `RequestIdMiddleware`; the decorator no longer carries its own deprecated `substr` /
  `Math.random` fallback.
- **`X-User-ID` resolution order** — `GetContext` now prefers `request.verifiedUserId`
  (set by `UserAuthGuard` after token verification) over the raw header.

### Tests

- 530 unit tests (up from 259 at the prior milestone) — broad coverage added for the auth
  guards, user-token verifier, webhook outbox + dispatcher, ownership policies, error
  filter, case-sensitivity flag, file validation, and analytics SQL composition.

### Developer experience

- **Pre-commit hooks** (husky + lint-staged) — Prettier + ESLint run on staged `src/` and
  `test/` files; `tsc --noEmit` runs on the full project before every commit.
- **4-space indentation** — Prettier `tabWidth` updated to 4; `.vscode/settings.json`
  added so Cursor/VSCode uses the same setting without manual configuration.
- **`package.json`** — added `repository`, `homepage`, and `bugs` fields pointing to the
  GitHub repository.
- **Husky-tolerant Docker build** — `prepare` script in `package.json` is `husky || true`,
  so the production-only `npm ci --omit=dev` doesn't fail when husky CLI isn't installed.

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
