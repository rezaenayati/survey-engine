# Examples

## nextjs

A full-stack Next.js 15 application covering every survey-engine feature:
survey list, taking surveys (SurveyJS), auto-save, admin dashboard, schema editor with live preview, publish flow, analytics dashboard, and webhook configuration.

→ [examples/nextjs/README.md](./nextjs/README.md)

---

## basic

A minimal static HTML page with a sample SurveyJS schema — useful for understanding the raw JSON format without any build tooling.

→ [examples/basic/README.md](./basic/README.md)

---

## Running the full stack

```bash
# 1. Start survey-engine + PostgreSQL (from the project root)
docker compose up -d

# 2. Run the Next.js example
cd examples/nextjs
cp .env.local.example .env.local
npm install
PORT=4000 npm run dev       # → http://localhost:4000
```
