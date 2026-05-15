# Survey Engine

> **Not affiliated with or endorsed by SurveyJS / Devsoft Baltic OÜ.**

A self-hostable backend for [SurveyJS](https://surveyjs.io/). Stores survey definitions as SurveyJS-native JSON, collects responses, and serves analytics — all as a plain REST API.

Deploy one instance. Integrate from any backend by making HTTP calls.

## What it does

- **Survey management** — create, update, publish, archive surveys. Schemas are stored as SurveyJS JSON (`pages[].elements[]`) so the frontend can pass them straight to `new Survey.Model(schema)`.
- **Versioning** — every publish creates an immutable, SHA-256 checksummed snapshot. Respondents always see a stable published schema; editors work against a live draft.
- **Response collection** — start a session, save progress page-by-page, submit. Supports anonymous and identified responses.
- **Webhooks** — get notified the instant a response starts or completes. Survey Engine POSTs to your endpoint with an HMAC-signed payload — no polling needed.
- **Analytics** — completion funnel, trends over time, per-question breakdowns, text-response word frequency.
- **Server-side logic** *(advanced, optional)* — evaluate visibility, required, skip, and calculated-value rules on the server without a browser. Useful for bots, integrations, or server-rendered flows. See [docs/schema-reference.md](docs/schema-reference.md#logic-schema-advanced).

## What it does NOT do

- No authentication — bring your own. Pass the resolved user ID via `X-User-ID` and the engine stores it for attribution and access control.
- No frontend — it is a pure REST API.
- No notifications or invitations.

---

## Quick Start

### 1. Run the service

```bash
# Option A — Docker Compose (recommended)
cp .env.example .env          # edit DB credentials if needed
docker-compose up -d          # starts PostgreSQL + survey-engine

# Option B — Manual
cp .env.example .env
npm install
docker-compose up -d postgres  # or point DB_* vars at an existing PostgreSQL
npm run start:dev
```

- **API**: `http://localhost:3000`
- **Swagger docs**: `http://localhost:3000/api/docs`

### 2. Install the SDK in your project

```bash
npm install @survey-engine/sdk
```

### 3. Call it from your backend

```typescript
import { SurveyEngineClient } from '@survey-engine/sdk';

const surveyEngine = new SurveyEngineClient({
  baseUrl: 'http://your-survey-engine-host:3000',
  userId: currentUser.id,   // resolved from your own auth
});

// Create a survey
const survey = await surveyEngine.surveys.create({
  name: 'Customer Feedback',
  schemaJson: { pages: [{ name: 'p1', elements: [{ name: 'score', type: 'rating' }] }] },
});

// Publish it
await surveyEngine.surveys.publish(survey.id);

// Later — start + complete a response
const response = await surveyEngine.responses.start({ surveyId: survey.id });
await surveyEngine.responses.update(response.id, { answersJson: { score: 8 } });
await surveyEngine.responses.complete(response.id);
```

See [`examples/`](examples/) for a full Next.js walkthrough.

---

## Integration

Survey Engine is auth-agnostic. Your service authenticates the user and forwards their ID as a header:

```http
POST /surveys HTTP/1.1
Host: survey-engine:3000
X-User-ID: user-abc123
Content-Type: application/json

{ "name": "Customer Feedback", "schemaJson": { ... } }
```

| Header | Required | Description |
|--------|----------|-------------|
| `X-User-ID` | No | Authenticated user ID — stored as `createdBy` / `respondentId` and used for ownership checks |
| `X-Correlation-ID` | No | Trace ID forwarded through logs |
| `X-API-Key` | When `API_KEY` is set | Global API key (see Security below) |

Requests without `X-User-ID` are accepted as anonymous.

### Typical SurveyJS flow

```
1. Load schema:    GET  /surveys/:id/runtime  → pass version.schemaJson to new Survey.Model()
2. Start session:  POST /responses/start      → store responseId
3. Save progress:  PATCH /responses/:id       → on every page change
4. Submit:         POST  /responses/:id/complete
```

See [`examples/`](examples/) for a working Next.js integration.

---

## Security

### Ownership

Resources are scoped to the user who created them. User A cannot list, modify, or delete surveys or responses that belong to User B. Anonymous resources (created without `X-User-ID`) are accessible to anyone.

### Optional API key

Set `API_KEY` in your environment to require a key on every request:

```bash
# .env
API_KEY=change-me-in-production
```

Callers must then provide it as:
```http
Authorization: Bearer change-me-in-production
# or
X-API-Key: change-me-in-production
```

Health endpoints (`/health`, `/health/ready`) are always exempt.

Leave `API_KEY` unset for deployments behind a trusted internal gateway.

### Webhooks

Receive real-time events when respondents start or complete a response.

Configure a webhook URL in your survey's `settings`:

```typescript
await surveyEngine.surveys.update(surveyId, {
  settings: {
    webhookUrl: 'https://your-service.example.com/webhooks/survey',
    webhookSecret: 'your-signing-secret',         // optional but recommended
    webhookEvents: ['response.completed'],         // omit to receive all events
  },
});
```

Survey Engine will POST a JSON payload to that URL:

```json
{
  "event": "response.completed",
  "timestamp": "2026-05-15T10:00:00.000Z",
  "surveyId": "...",
  "responseId": "...",
  "respondentId": "user-abc",
  "answersJson": { "q1": "Great product!" }
}
```

When `webhookSecret` is configured, every request includes a signature you can verify:

```http
X-Survey-Engine-Signature: sha256=<hmac-sha256-hex>
X-Survey-Engine-Event: response.completed
X-Survey-Engine-Delivery: <responseId>
```

**Verifying the signature (Node.js):**

```typescript
import { createHmac } from 'crypto';

function isValidSignature(body: string, header: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  return header === expected;
}
```

Delivery is best-effort with up to 3 automatic retries (1s → 2s → 4s backoff). Your endpoint should respond with a 2xx status within 10 seconds. Set a global fallback secret with `WEBHOOK_SECRET` in your environment if you prefer not to store it per-survey.

---

## API

### Surveys

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/surveys` | Create a draft survey |
| `GET` | `/surveys` | List your surveys (paginated) |
| `GET` | `/surveys/:id` | Get survey |
| `PATCH` | `/surveys/:id` | Update draft schema / settings |
| `DELETE` | `/surveys/:id` | Delete survey |
| `POST` | `/surveys/:id/publish` | Publish — creates an immutable version snapshot |
| `GET` | `/surveys/:id/versions` | List all versions |
| `GET` | `/surveys/:id/runtime` | Get the active published version (for respondents) |
| `GET` | `/surveys/:id/analytics` | Full analytics |

### Responses

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/responses/start` | Start a response session |
| `GET` | `/responses` | List your responses (or all for a survey you own) |
| `PATCH` | `/responses/:id` | Save partial answers |
| `POST` | `/responses/:id/complete` | Validate and submit |
| `DELETE` | `/responses/:id` | Delete response |

Full interactive docs at `/api/docs`.

---

## SurveyJS Compatibility

All question types are accepted and stored as-is:

`radiogroup`, `checkbox`, `text`, `comment`, `rating`, `matrix`, `matrixdropdown`, `dropdown`, `ranking`, `boolean`, `file`, `signaturepad`, `html`, `expression`, and any other type SurveyJS introduces.

Conditional logic (`visibleIf`, `enableIf`, `requiredIf`) embedded directly in the schema JSON is stored and served back to SurveyJS — SurveyJS evaluates it client-side as normal. No configuration required.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | `postgres` | PostgreSQL password |
| `DB_NAME` | `survey_engine` | PostgreSQL database |
| `NODE_ENV` | `development` | `production` disables synchronize, enables migrations |
| `PORT` | `3000` | HTTP listen port |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `API_KEY` | *(unset)* | Optional global API key |
| `WEBHOOK_SECRET` | *(unset)* | Global HMAC-SHA256 secret for webhook signing (per-survey secret takes priority) |
| `THROTTLE_LIMIT` | `100` | Max requests per window per IP |
| `THROTTLE_TTL` | `60` | Rate-limit window in seconds |
| `LOG_LEVEL` | `info` | `trace` / `debug` / `info` / `warn` / `error` |

---

## Scripts

```bash
npm run start:dev        # dev server with hot reload
npm run build            # production build
npm run start:prod       # run production build
npm test                 # unit tests
npm run test:e2e         # integration tests (requires Docker)
npm run test:cov         # unit tests with coverage report
npm run migration:run    # apply pending DB migrations
npm run migration:revert # roll back last migration
npm run lint             # lint & auto-fix
```

---

## License

MIT
