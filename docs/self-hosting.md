# Self-hosting Guide

> **Not affiliated with or endorsed by SurveyJS / Devsoft Baltic OÜ.**

---

## Quick start with Docker Compose

```bash
git clone https://github.com/your-org/survey-engine.git
cd survey-engine
cp .env.example .env          # Edit as needed
docker-compose up -d
```

This starts PostgreSQL 16 and the survey-engine service. The database schema is created automatically on first boot. The API is at `http://localhost:3000`.

---

## Production deployment

### 1. Prepare the database

Create a dedicated PostgreSQL database and user:

```sql
CREATE DATABASE survey_engine;
CREATE USER survey_engine WITH PASSWORD 'strong-password';
GRANT ALL PRIVILEGES ON DATABASE survey_engine TO survey_engine;
```

### 2. Secure the service

Set `API_KEY` to require authentication on every request. Choose a long random string:

```bash
# Generate a key
openssl rand -hex 32

# Set in .env
API_KEY=<generated-key>
```

Clients must send it as:
```http
Authorization: Bearer <key>
```

Leave `API_KEY` unset only when the service is deployed behind a gateway that already controls access (e.g., only reachable from within a private network).

### 3. Set environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | No (5432) | PostgreSQL port |
| `DB_USER` | Yes | PostgreSQL user |
| `DB_PASSWORD` | Yes | PostgreSQL password |
| `DB_NAME` | Yes | PostgreSQL database name |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | No (3000) | HTTP listen port |
| `CORS_ORIGINS` | No (`*`) | Comma-separated allowed origins |
| `THROTTLE_TTL` | No (60) | Rate-limit window in seconds |
| `THROTTLE_LIMIT` | No (100) | Max requests per window |
| `LOG_LEVEL` | No (info) | `trace` / `debug` / `info` / `warn` / `error` |

### 4. Run migrations

Before starting the production server, run any pending migrations:

```bash
NODE_ENV=production npm run migration:run
```

This is idempotent — safe to run on every deployment.

### 5. Start the service

```bash
NODE_ENV=production npm run start:prod
```

Or with Docker:

```bash
docker build -t survey-engine .
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_HOST=your-db-host \
  -e DB_PASSWORD=your-password \
  survey-engine
```

---

## Reverse proxy (nginx example)

```nginx
upstream survey_engine {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl;
    server_name surveys.example.com;

    location / {
        proxy_pass         http://survey_engine;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

---

## Kubernetes (Helm / manifest sketch)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: survey-engine
spec:
  replicas: 2
  selector:
    matchLabels:
      app: survey-engine
  template:
    spec:
      containers:
        - name: survey-engine
          image: your-registry/survey-engine:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: DB_HOST
              valueFrom:
                secretKeyRef:
                  name: survey-engine-db
                  key: host
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
```

---

## Health endpoints

| Endpoint | Returns 200 when | Used for |
|----------|-----------------|----------|
| `GET /health` | Process is running | Liveness probe |
| `GET /health/ready` | DB is reachable | Readiness probe |

---

## Scaling considerations

- Survey Engine is stateless — scale horizontally by running multiple instances behind a load balancer.
- All state lives in PostgreSQL. No Redis or shared memory is required.
- Rate limiting (`@nestjs/throttler`) is per-process. If you run multiple instances, use a Redis-backed throttler for global rate limiting (see `@nestjs/throttler` docs).

---

## Migrations runbook

```bash
# See which migrations have run
npm run migration:show

# Apply all pending migrations
npm run migration:run

# Rollback the last migration (careful in production)
npm run migration:revert

# Generate a new migration from entity changes (dev only)
npm run migration:generate -- src/database/migrations/MyChangeName
```
