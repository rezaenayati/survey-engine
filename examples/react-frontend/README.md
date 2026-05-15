# Frontend Integration Example — React + SurveyJS

A React app that renders a survey-engine survey using the [SurveyJS](https://surveyjs.io) React library.

---

## Architecture

This example shows **two integration patterns** — pick the one that fits your setup:

### Option A — Via your backend (recommended for production)

```
Browser (React + SurveyJS)
      │  /api/surveys/:id/schema
      ▼
Your backend (examples/express-backend)   ← your auth lives here
      │  X-User-ID: <resolvedUserId>
      ▼
survey-engine
```

Your backend authenticates the user and forwards the resolved user ID. survey-engine is never exposed to the internet.

### Option B — Direct to survey-engine (useful for internal tools or prototypes)

```
Browser (React + SurveyJS)
      │  /survey-engine/surveys/:id/runtime
      ▼
survey-engine  (CORS must allow your origin)
```

Switch between them by changing `BASE_URL` in `src/surveyEngineApi.ts`.

---

## Run it

### Prerequisites

Start survey-engine and (for Option A) the express-backend:

```bash
# Terminal 1 — survey-engine
docker-compose up -d

# Terminal 2 — express backend (Option A only)
cd examples/express-backend
npm install && npm run seed    # prints a SURVEY_ID
npm start
```

### Start the React app

```bash
cd examples/react-frontend
npm install

# Pass the survey ID from the seed script
VITE_SURVEY_ID=<paste-id> npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Click the user ID button to set a simulated user (stored in `localStorage`). This is forwarded as `X-API-Key` to the express-backend, which resolves it to an `X-User-ID` for survey-engine.

---

## Key files

| File | What it does |
|------|-------------|
| `src/surveyEngineApi.ts` | Thin API wrapper — change `BASE_URL` to switch Option A/B |
| `src/SurveyWidget.tsx` | Loads schema, starts session, saves progress, submits |
| `src/App.tsx` | Minimal shell with survey ID config and user ID picker |
| `vite.config.ts` | Dev server proxy rules for both options |

---

## Adapting to your app

The `SurveyWidget` component is self-contained. Drop it into any React app:

```tsx
import SurveyWidget from './SurveyWidget';

function MyPage() {
  return (
    <SurveyWidget
      surveyId="your-survey-id"
      onComplete={(responseId) => {
        // Redirect, show thank-you page, update state, etc.
        console.log('Response saved:', responseId);
      }}
    />
  );
}
```

The `surveyEngineApi.ts` layer is the only place that knows about URLs and headers — update it once to match your backend and the component stays unchanged.
