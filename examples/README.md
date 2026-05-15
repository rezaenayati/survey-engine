# survey-engine — Next.js Example

A full-stack Next.js 15 application that demonstrates every survey-engine feature through a clean, real-world UI.

## What's included

| Route | What it shows |
|---|---|
| `/` | Public survey list — browse published surveys |
| `/surveys/:id` | Take a survey — SurveyJS rendering, auto-save, complete |
| `/surveys/:id/thank-you` | Completion confirmation |
| `/admin` | Survey management dashboard |
| `/admin/surveys/new` | Create a survey with a starter template |
| `/admin/surveys/:id` | **SurveyJS Creator** — drag-and-drop designer, built-in preview, logic editor, JSON view; auto-saves schema to survey-engine |
| `/admin/surveys/:id/analytics` | Analytics dashboard — summary, funnel, question breakdowns, trends |

## Architecture

```
Browser
  └── Next.js (port 4000)
        ├── /app/**  — Server & Client components
        └── /api/**  — Route handlers (BFF proxy)
              │ adds X-User-ID header
              ▼
        survey-engine (port 3000)
              │
              ▼
        PostgreSQL (port 5432)
```

The Next.js **API routes** act as a BFF (Backend-for-Frontend): they resolve the current user from a cookie and forward requests to survey-engine with the correct `X-User-ID`. This matches the real-world integration pattern where your backend owns authentication.

## Quick start

### 1. Start survey-engine

```bash
# From the project root
docker compose up -d          # starts PostgreSQL + survey-engine
# — or for hot-reload —
docker compose up -d postgres
npm run start:dev
```

### 2. Install dependencies

```bash
cd examples/nextjs
cp .env.local.example .env.local   # adjust SURVEY_ENGINE_URL if needed
npm install
```

### 3. Run the example

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — wait, Next.js defaults to port 3000 too. Set a different port:

```bash
PORT=4000 npm run dev
```

Open [http://localhost:4000](http://localhost:4000).

### 4. Create your first survey

1. Click **Admin** in the navbar
2. Click **New Survey** — a Customer Feedback template is pre-loaded
3. The **SurveyJS Creator** opens — drag questions from the palette on the left to design your survey. Every change auto-saves to survey-engine.
   - **Preview** tab: test how the survey looks and behaves
   - **Logic** tab: add conditional visibility / required rules (uses survey-engine's logic evaluation)
   - **JSON** tab: view or paste raw SurveyJS schema JSON
4. Click **Validate Schema** in the left sidebar to run survey-engine's server-side validation
5. Click **Publish →** in the sidebar

### 5. Take the survey

1. Click **Surveys** in the navbar
2. Click **Take Survey** on your published survey
3. Fill it in — answers auto-save on every page navigation
4. Submit → you'll see the thank-you page

### 6. View analytics

Back in Admin, click **Analytics** next to your survey. You'll see:
- Total / completed / completion rate / average time
- Response funnel (started → in-progress → completed → abandoned)
- Daily trend chart
- Per-question distribution, averages, and word frequency for text questions

## Multi-user demo

The navbar has a **user switcher** (admin / alice / bob / charlie). Switch users to:
- Create surveys as **admin** and see ownership-based access control in action
- Take the same survey as **alice** and **bob** to generate multiple responses
- Check the analytics page to see aggregated results

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `SURVEY_ENGINE_URL` | `http://localhost:3000` | Base URL of the survey-engine API |
| `SURVEY_ENGINE_API_KEY` | _(none)_ | API key, if survey-engine is configured with `API_KEY` |
