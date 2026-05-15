# Backend Integration Example — Express

Shows how an existing backend service delegates all survey logic to survey-engine while keeping its own authentication.

**The key idea:** Your service authenticates the user however it already does (JWT, session, API key…), then passes the resolved user ID as `X-User-ID` when calling survey-engine. survey-engine never sees your auth tokens — it just records who submitted what.

---

## Architecture

```
Your users
    │  HTTP
    ▼
Your backend (this example)
    │  authenticates user → resolves userId
    │  HTTP + X-User-ID: <userId>
    ▼
survey-engine
    │  SQL
    ▼
PostgreSQL
```

---

## Run it

### 1. Start survey-engine

```bash
# From the repo root
docker-compose up -d
```

### 2. Install & seed demo data

```bash
cd examples/express-backend
npm install
npm run seed
# → prints a Survey ID — copy it
```

### 3. Start the example backend

```bash
SURVEY_ID=<paste-id-here> npm start
# Running on http://localhost:4000
```

---

## Try the API

The `X-API-Key` header acts as the user ID in this example — replace with real auth in production.

```bash
SURVEY_ID="your-survey-id"
USER="alice"

# 1. Fetch the schema (frontend would use this to render the survey)
curl http://localhost:4000/surveys/$SURVEY_ID/schema | jq .

# 2. Start a response session
RESPONSE=$(curl -s -X POST http://localhost:4000/surveys/$SURVEY_ID/responses \
  -H "X-API-Key: $USER" | jq -r .responseId)
echo "Response ID: $RESPONSE"

# 3. Save partial progress (page 1)
curl -X PATCH http://localhost:4000/surveys/$SURVEY_ID/responses/$RESPONSE \
  -H "X-API-Key: $USER" \
  -H "Content-Type: application/json" \
  -d '{"answers": {"score": 8, "reason": "Great onboarding"}}'

# 4. Submit
curl -X POST http://localhost:4000/surveys/$SURVEY_ID/responses/$RESPONSE/submit \
  -H "X-API-Key: $USER" \
  -H "Content-Type: application/json" \
  -d '{"answers": {"role": "developer"}}'

# 5. Check analytics
curl http://localhost:4000/surveys/$SURVEY_ID/analytics \
  -H "X-API-Key: admin" | jq .
```

---

## Adapting to your stack

The integration pattern is the same regardless of framework:

1. Import `SurveyEngineClient` from `@survey-engine/sdk`
2. On each request, create a client instance with the authenticated `userId`
3. Call the appropriate SDK methods — the client handles headers and serialisation

```typescript
import { SurveyEngineClient } from '@survey-engine/sdk';

// Per-request: forward authenticated userId to survey-engine
const se = new SurveyEngineClient({
  baseUrl: process.env.SURVEY_ENGINE_URL,
  userId: req.user.id,
});

const version  = await se.surveys.getRuntime(surveyId);
const response = await se.responses.start({ surveyId });
await se.responses.update(response.id, { answersJson: answers });
await se.responses.complete(response.id);
```
