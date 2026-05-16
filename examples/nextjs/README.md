# Next.js example (SurveyJS + survey-engine)

This app is a small **admin + respondent** UI that talks to a running **survey-engine** backend through Next.js API routes (BFF). File questions upload binaries to survey-engine (`POST /files`) via `POST /api/files`, so answers store `{ fileId, … }` instead of huge base64 payloads.

## Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** running and a database for survey-engine
- This monorepo cloned locally

## 1. Survey-engine (API) — local file storage

From the **repository root** (`survey-engine/`), configure storage and the DB, then start the API.

Create or edit `.env` in the repo root:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=survey_engine

# Local file storage (default). Uploaded bytes go under ./uploads (gitignored).
FILE_STORAGE_DRIVER=local
FILE_LOCAL_DIR=uploads
FILE_MAX_SIZE_BYTES=26214400

# So upload JSON includes a public download URL; use the same host/port as the API.
FILE_PUBLIC_BASE_URL=http://localhost:3000
```

Install, migrate (if `NODE_ENV=production`), and start:

```bash
cd /path/to/survey-engine
npm install
# Development: TypeORM synchronize often applies schema; for a clean DB you can still run:
# npm run migration:run
npm run start:dev
```

The API should listen on **http://localhost:3000** (check the log). Open **http://localhost:3000/api/docs** for Swagger.

## 2. Next.js example

In a **second terminal**:

```bash
cd /path/to/survey-engine/examples/nextjs
npm install
cp .env.local.example .env.local
# Edit .env.local if your API is not on localhost:3000
npm run dev
```

The app defaults to **http://localhost:3001** (Next.js). Visit the admin UI, create a survey, publish it, then open the public take URL. New surveys include an optional **screenshot** file question that uses the upload flow.

### Environment variables (`examples/nextjs/.env.local`)

| Variable | Purpose |
|----------|---------|
| `SURVEY_ENGINE_URL` | Server-side SDK base URL (Next API routes → engine) |
| `NEXT_PUBLIC_SURVEY_ENGINE_URL` | Browser-side preview/download URL base if upload response omits `url` |
| `SURVEY_ENGINE_API_KEY` | Set if engine has `API_KEY` |

Keep `SURVEY_ENGINE_URL` and `NEXT_PUBLIC_SURVEY_ENGINE_URL` aligned in local dev.

## Troubleshooting

- **Upload 401**: Engine has `API_KEY` set but `.env.local` is missing `SURVEY_ENGINE_API_KEY`.
- **Upload 400 / validation**: Pass `surveyId` + `questionId` from the form; the example sends both. Check file type/size against the question (`acceptedTypes`, `maxSize`).
- **Broken image preview**: Set `FILE_PUBLIC_BASE_URL` on the engine and/or `NEXT_PUBLIC_SURVEY_ENGINE_URL` in the example.
- **Port clash**: If something else uses 3000, change the engine `PORT` and update both URLs in `.env.local`.
