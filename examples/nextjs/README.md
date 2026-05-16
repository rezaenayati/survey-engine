# Next.js example (SurveyJS + survey-engine)

A full-stack **Next.js 15** app that demonstrates survey-engine end to end: **SurveyJS Creator**, taking surveys, **analytics**, and **file questions**. The UI talks to survey-engine through Next.js **API routes** (BFF). File uploads go **multipart → `POST /api/files` → survey-engine `POST /files`**, so answers store `{ fileId, … }` instead of base64 in JSON.

## What's included

| Route | What it shows |
| --- | --- |
| `/` | Public survey list — browse published surveys |
| `/surveys/:id` | Take a survey — SurveyJS rendering, auto-save, complete |
| `/surveys/:id/thank-you` | Completion confirmation |
| `/admin` | Survey management dashboard |
| `/admin/surveys/new` | Create a survey with a starter template (includes optional **screenshot** file question) |
| `/admin/surveys/:id` | **SurveyJS Creator** — designer, preview, logic, JSON; auto-saves schema to survey-engine |
| `/admin/surveys/:id/analytics` | Analytics — summary, funnel, question breakdowns, trends |

## Architecture

```
Browser
  └── Next.js (e.g. port 3001 — avoid clashing with the API)
        ├── /app/**  — Server & Client components
        └── /api/**  — Route handlers (BFF proxy)
              │ adds X-User-ID header
              ▼
        survey-engine (default port 3000)
              │
              ▼
        PostgreSQL
```

The BFF resolves the current user from a cookie and forwards requests with `X-User-ID`, matching a typical “your backend owns auth” setup.

## Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** running and a database for survey-engine
- This repo cloned locally

## 1. Start survey-engine

From the **repository root** (`survey-engine/`), configure the DB and (for file questions) local storage.

**Option A — Docker Compose** (if you use it in this repo):

```bash
# From project root
docker compose up -d          # PostgreSQL + survey-engine
# — or DB only + local dev API —
docker compose up -d postgres
npm install
npm run start:dev
```

**Option B — Local `npm run start:dev`** — create or edit **root `.env`**:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=survey_engine

# Local file storage (default). Bytes go under ./uploads (gitignored).
FILE_STORAGE_DRIVER=local
FILE_LOCAL_DIR=uploads
FILE_MAX_SIZE_BYTES=26214400

# So upload JSON includes a public URL; use the same host/port as the API.
FILE_PUBLIC_BASE_URL=http://localhost:3000
```

```bash
cd /path/to/survey-engine
npm install
# For a clean DB you can run: npm run migration:run
npm run start:dev
```

The API should listen on **http://localhost:3000**. Swagger: **http://localhost:3000/api/docs**.

## 2. Run the Next.js app

In a **second terminal**:

```bash
cd /path/to/survey-engine/examples/nextjs
npm install
cp .env.local.example .env.local
# If the API is not on localhost:3000, update SURVEY_ENGINE_URL / NEXT_PUBLIC_SURVEY_ENGINE_URL
npm run dev -- -p 3001
```

Open **http://localhost:3001** (or use `PORT=4000 npm run dev` if you prefer port 4000).

## 3. Create your first survey

1. Click **Admin** in the navbar.
2. Click **New Survey** — a starter template is pre-loaded (optional file question uses the upload flow).
3. In **SurveyJS Creator**, design the survey; changes auto-save to survey-engine.
   - **Preview**: test layout and behavior.
   - **Logic**: conditional rules (evaluated by survey-engine).
   - **JSON**: raw SurveyJS schema.
4. Click **Validate Schema** in the sidebar.
5. Click **Publish →**.

## 4. Take the survey

1. Click **Surveys** in the navbar.
2. Open your published survey.
3. Answers auto-save on page changes; submit to see the thank-you page.

## 5. Analytics

In Admin, click **Analytics** for summary, funnel, trends, and per-question breakdowns.

## Multi-user demo

Use the navbar **user switcher** (admin / alice / bob / charlie): create surveys as admin, take as different users, then inspect analytics.

## Environment variables

### survey-engine (repo root `.env`)

| Variable | Purpose |
| --- | --- |
| `DB_*` | PostgreSQL connection |
| `FILE_STORAGE_DRIVER` | e.g. `local` |
| `FILE_LOCAL_DIR` | Directory for uploaded files |
| `FILE_PUBLIC_BASE_URL` | Public base URL for file `url` in API responses |
| `API_KEY` | If set, clients must send `X-API-Key` |

### Next.js (`examples/nextjs/.env.local`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `SURVEY_ENGINE_URL` | `http://localhost:3000` | Server-side SDK base URL (BFF → engine) |
| `NEXT_PUBLIC_SURVEY_ENGINE_URL` | same | Browser preview/download if upload JSON has no `url` |
| `SURVEY_ENGINE_API_KEY` | _(none)_ | Must match engine when `API_KEY` is set |

Keep `SURVEY_ENGINE_URL` and `NEXT_PUBLIC_SURVEY_ENGINE_URL` aligned in local dev.

## Troubleshooting

- **Port clash**: Engine and Next both default to 3000 — run Next on another port (e.g. `-p 3001` or `PORT=4000`) and update `.env.local` if you reference those URLs.
- **`Cannot POST /responses`** (generic framework 404): The API you call with `SURVEY_ENGINE_URL` has **no matching route** for that path/method. A common mistake is pointing `SURVEY_ENGINE_URL` at the Next dev server (`:3001`); if **survey** calls also fail, fix that. If **only** `POST /responses` fails while `PATCH /surveys` etc. work, hit the engine directly:  
  `curl -X POST "$SURVEY_ENGINE_URL/responses" -H "Content-Type: application/json" -H "X-User-ID: admin" -d '{"surveyId":"<uuid>"}'` — you should get **201** for a published survey. If curl also 404s, the running API build may be too old (needs `POST /responses`) or a proxy is blocking `/responses`.
- **Upload 401**: Engine has `API_KEY` but `.env.local` is missing `SURVEY_ENGINE_API_KEY`.
- **Upload 400 / validation**: Example sends `surveyId` and `questionId`; check `acceptedTypes` and `maxSize` on the file question.
- **Broken image preview**: Set `FILE_PUBLIC_BASE_URL` on the engine and/or `NEXT_PUBLIC_SURVEY_ENGINE_URL` in the example.
