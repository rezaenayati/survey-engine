# Examples

Two runnable examples showing end-to-end integration with survey-engine.

## express-backend

A Node.js / Express service that delegates all survey logic to survey-engine.  
Shows the **backend-to-backend** integration pattern: your service authenticates users and forwards their ID to survey-engine via `X-User-ID`.

→ [examples/express-backend/README.md](./express-backend/README.md)

## react-frontend

A React + SurveyJS app that renders surveys and collects responses.  
Designed to sit in front of `express-backend`, but can also call survey-engine directly for internal tools or prototypes.

→ [examples/react-frontend/README.md](./react-frontend/README.md)

---

## Running the full stack

```bash
# 1. survey-engine + PostgreSQL
docker-compose up -d

# 2. Seed a demo survey (once)
cd examples/express-backend
npm install && npm run seed      # → prints SURVEY_ID

# 3. Backend service
npm start                        # http://localhost:4000

# 4. React frontend (new terminal)
cd ../react-frontend
npm install
VITE_SURVEY_ID=<paste-id> npm run dev   # http://localhost:5173
```
