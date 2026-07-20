# API (NestJS)

A REST API for the Facebook Creator Platform — workspace management, Facebook page connect,
post scheduling/publishing, analytics, billing, and notifications.

Built with **TypeScript 5**, **NestJS 11**, **PostgreSQL 16** via **MikroORM 7** — managed
by **pnpm 10**.

---

## Table of Contents

- [API (NestJS)](#api-nestjs)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Project Structure](#project-structure)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [API Reference](#api-reference)
  - [Jobs / Background Workers](#jobs--background-workers)
  - [Database & Migrations](#database--migrations)
  - [Testing](#testing)

---

## Features

| Area | Description |
| --- | --- |
| Auth | Clerk JWT guard; `GET /auth/me`; RBAC (Owner / Editor / Viewer) |
| Workspaces | CRUD; member invite + accept + role change; soft-delete with cascade |
| Facebook | OAuth connect-url; page token storage (AES-256-GCM); Graph API refresh; webhook verification |
| Posts | CRUD + content-length quota (BR-F02); keyset-paginated list |
| Post state machine | `draft → scheduled → publishing → published \| failed`; guarded transitions |
| Billing | Stripe Checkout proxy; subscription read; quota enforcement (BR-F10) |
| Analytics | Workspace-level + per-post metrics (proxied from `services/analytics` via TCP) |
| Audit logs | Owner-only read of MongoDB event log (proxied from `services/audit` via TCP) |
| Notifications | Unread list + mark-read one-way (BR-F08); proxied from `services/notification` |
| Search | Full-text post search (proxied from `services/search` via TCP) |
| Health | `GET /health` — Postgres + Redis + heap probes via `@nestjs/terminus` |
| Webhooks | Facebook (`X-Hub-Signature-256`); Clerk (Svix); Stripe (in `services/billing`) |
| Rate limiting | Global 100 req/min; invite 5/min/IP; webhook endpoints exempt |
| Swagger | Auto-generated at `/api/docs` via `@nestjs/swagger` |

---

## Project Structure

```text
apps/api/
├── src/
│   ├── main.ts                   # Bootstrap: HTTP + 2 RabbitMQ microservices
│   ├── app.module.ts             # Root module (ConfigModule, Pino, ThrottlerModule, TraceModule)
│   │
│   ├── modules/                  # Domain modules
│   │   ├── identity/             # Clerk JWT guard + GET /auth/me + Clerk webhook
│   │   ├── workspace/            # Workspace CRUD + members + invitations + purge job
│   │   ├── facebook/             # OAuth + Graph API + token refresh + webhook consumer
│   │   ├── posts/                # CRUD + state machine + publish/fallback jobs
│   │   ├── billing/              # Checkout proxy + quota adapter (TCP → services/billing)
│   │   ├── analytics/            # Metrics read API (TCP → services/analytics)
│   │   ├── audit/                # Audit log read API (TCP → services/audit)
│   │   ├── notification/         # Notifications read API (TCP → services/notification)
│   │   ├── search/               # Search API (TCP → services/search)
│   │   └── dev-auth/             # Dev-only token endpoint (excluded in production)
│   │
│   ├── infrastructure/
│   │   └── rabbitmq/             # RabbitMqEventBus (ClientProxy), OutboxRelayJob, messaging log
│   │
│   ├── common/
│   │   ├── errors/               # AppError types + DownstreamServiceError
│   │   ├── events/               # DomainEvent abstract class + IEventBus port
│   │   ├── consumers/            # IdempotentConsumer base (dedup via Redis)
│   │   ├── guards/               # InternalSecretGuard
│   │   ├── crypto/               # AES-256-GCM EncryptedText + aes-gcm util
│   │   └── trace/                # TraceContextService (AsyncLocalStorage request ID)
│   │
│   ├── health/                   # HealthController + RedisHealthIndicator
│   └── migrations/               # MikroORM migrations for the core schema
│
├── docker-compose.yml            # Postgres 16, MongoDB 7, Redis 7, RabbitMQ 3 (dev)
├── mikro-orm.config.ts           # MikroORM config (TsMorphMetadataProvider)
└── .env.example                  # → use root .env.example
```

### Module layout (canonical pattern)

```text
src/modules/<module>/
├── contracts/      # Zod schemas + request/response contracts (API boundary)  [where used]
├── controller/     # HTTP handlers + route registration
├── service/        # Business logic (returns Result<T, AppError>)
├── repository/     # MikroORM queries + persistence
├── entity/         # MikroORM entities (extend BaseEntity where applicable)
├── events/         # Domain event classes
├── consumers/      # @EventPattern RabbitMQ consumers (@Controller)
├── jobs/           # @Cron scheduled jobs
├── providers/      # 3rd-party adapters (Graph API, Stripe, …)
├── ports/          # Interfaces for dependency inversion
└── <module>.module.ts
```

---

## Requirements

| Tool | Version |
| --- | --- |
| Node.js | ≥ 25 |
| pnpm | ≥ 10 |
| Docker | any recent version |

---

## Installation

From the monorepo root:

```bash
pnpm install
cp .env.example .env   # fill in CLERK_*, FACEBOOK_*, STRIPE_*, ALGOLIA_*, RESEND_*
```

**Docker — dev mode** (hot-reload, `DevAuthModule` active, `NODE_ENV=development`):

```bash
docker compose build    # builds fcp-app-dev (Dockerfile builder stage)
docker compose up -d    # migrations run automatically, then all services start
                        # apps/api/src/ is mounted for live reload via nest --watch
```

**Docker — production mode** (compiled runner image, no DevAuthModule):

```bash
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d
```

**Local processes** (infra in Docker, API on host):

```bash
docker compose up -d postgres mongodb redis rabbitmq
pnpm migration          # run core schema migrations
pnpm start:dev          # apps/api → :3000, hot-reload
```

---

## Environment Variables

Create `.env` at the repo root (shared by all services):

```bash
cp .env.example .env
```

Variables consumed by `apps/api`:

| Variable | Example | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_URL` | `postgres://fcp:fcp@localhost:5432/fcp` | Postgres connection |
| `MONGODB_URI` | `mongodb://localhost:27017/fcp_audit` | Not used directly; audit service owns it |
| `REDIS_URL` | `redis://localhost:6379` | Consumer dedup keys |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | Event bus publisher + consumer |
| `RMQ_PREFETCH` | `10` | Domain consumer prefetch count |
| `RMQ_DLQ_PREFETCH` | `5` | DLQ consumer prefetch count |
| `CLERK_SECRET_KEY` | `sk_test_…` | JWT verification (local crypto — no API call) |
| `CLERK_WEBHOOK_SIGNING_SECRET` | `…` | Svix signature for Clerk webhooks |
| `FACEBOOK_APP_ID` | `…` | OAuth authorize URL + webhook hub.verify |
| `FACEBOOK_APP_SECRET` | `…` | `X-Hub-Signature-256` HMAC verification |
| `FACEBOOK_REDIRECT_URI` | `https://<ngrok>/api/v1/facebook/callback` | Must match Facebook App Dashboard |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | `<random hex>` | Hub challenge verification |
| `STRIPE_SECRET_KEY` | `sk_test_…` | Proxied to `services/billing` (TCP) |
| `PII_ENCRYPTION_KEY` | `<base64 32 bytes>` | AES-256-GCM for Facebook page tokens |
| `PII_ENCRYPTION_KEY_ID` | `v1` | Key rotation identifier |
| `BILLING_TCP_HOST` | `localhost` | Connect address for `services/billing` |
| `BILLING_TCP_PORT` | `4001` | TCP port for `services/billing` |
| `ANALYTICS_TCP_HOST` | `localhost` | Connect address for `services/analytics` |
| `ANALYTICS_TCP_PORT` | `3002` | |
| `AUDIT_TCP_HOST` | `localhost` | Connect address for `services/audit` |
| `AUDIT_TCP_PORT` | `3003` | |
| `SEARCH_TCP_HOST` | `localhost` | Connect address for `services/search` |
| `SEARCH_TCP_PORT` | `3004` | |
| `NOTIFICATION_TCP_HOST` | `localhost` | Connect address for `services/notification` |
| `NOTIFICATION_TCP_PORT` | `3005` | |
| `ALLOWED_ORIGINS` | `http://localhost:4000` | CORS allowed origins (comma-separated) |
| `HTTP_CLIENT_TIMEOUT_MS` | `5000` | Timeout for outbound HTTP calls (ms) |
| `INTERNAL_API_SECRET` | `<random hex>` | `x-internal-secret` header for `/internal/*` routes |
| `APPS_API_INTERNAL_URL` | `http://localhost:3000/api/v1` | Used by services for reverse internal calls |
| `NODE_ENV` | `development` | `production` disables `DevAuthModule` |

---

## API Reference

Base URL (local): `http://localhost:3000`

All public routes are prefixed with `/api/v1`.

| Group | Prefix | Role required |
| --- | --- | --- |
| Auth | `GET /api/v1/auth/me` | Any authenticated user |
| Workspaces | `/api/v1/workspaces` | Owner / Editor / Viewer |
| Members | `/api/v1/workspaces/:id/members` | Owner / Editor / Viewer |
| Facebook | `/api/v1/workspaces/:id/facebook` | Owner / Editor |
| Posts | `/api/v1/workspaces/:id/posts` | Owner / Editor / Viewer (read); Owner / Editor (write) |
| Billing | `/api/v1/workspaces/:id/billing` | Owner |
| Analytics | `/api/v1/workspaces/:id/analytics` | Owner |
| Audit logs | `/api/v1/workspaces/:id/audit-logs` | Owner |
| Notifications | `/api/v1/workspaces/:id/notifications` | Any member |
| Search | `/api/v1/workspaces/:id/search?q=` | Any member |
| Health | `GET /api/v1/health` | None |

Docs:

- Swagger UI: `GET /api/docs`
- Health: `GET /api/v1/health` → `{ status: 'ok' | 'error', details: { … } }`

Authentication: send `Authorization: Bearer <clerk_jwt>` on all protected routes.
In `NODE_ENV=development`, use `POST /api/v1/dev-auth/token` to obtain a real Clerk JWT for
a seeded test user (throttled to 10 req/min).

---

## Jobs / Background Workers

All jobs run inside the `apps/api` process using `@nestjs/schedule`.

| Job class | Schedule | Purpose |
| --- | --- | --- |
| `PublishJob` | Every minute | Finds `scheduled` posts where `scheduledAt ≤ now()`; calls Graph API `POST /{pageId}/feed`; transitions to `publishing` on success or `failed` on error |
| `PublishFallbackPollJob` | Every 5 minutes | Finds `publishing` posts older than `PUBLISH_TTL_MINUTES` (default 30 min); calls `GET /{facebookGraphPostId}` to drive `publishing → published`; marks `failed` after TTL × 3 |
| `FacebookTokenExpiryScheduler` | Daily at midnight | Finds `facebook_accounts` expiring within 7 days; emits `facebook.token_expiring` event (consumed by `FacebookTokenExpiryConsumer` for auto-refresh and by `services/notification` + `services/email` for alerts) |
| `OutboxRelayJob` | Every 30 seconds | Re-publishes `pending` / `failed` outbox rows older than 60 s; guards against message loss on process crash between `em.flush()` and RabbitMQ publish |
| `WorkspacePurgeJob` | Daily at 02:00 | Hard-deletes workspaces + children soft-deleted more than 90 days ago; runs in FK-safe order (posts → facebook_accounts → workspaces) in batches of 500 |

---

## Database & Migrations

Start Postgres (and other datastores) via Docker:

```bash
docker compose up -d
```

MikroORM migration commands (run from repo root):

```bash
# Apply all pending migrations
pnpm migration

# Generate a new migration (edit generated file before committing)
pnpm --filter @fcp/api mikro-orm migration:create -- --name=YourMigrationName

# Revert the last migration
pnpm --filter @fcp/api mikro-orm migration:down
```

Migration files live in `apps/api/src/migrations/`. The schema reference is
`docs/reference/fcp-ddl.sql` — keep entities in sync with it; divergences must be recorded
in `docs/DECISIONS.md`.

---

## Testing

```bash
# Unit tests (Vitest)
pnpm test:api          # from monorepo root
pnpm test              # inside apps/api/

# Watch mode
pnpm --filter @fcp/api test:watch

# Coverage
pnpm --filter @fcp/api test:cov

# E2E / load tests (require a running stack)
pnpm e2e               # Artillery e2e suites (auth, workspaces, posts)
pnpm load:smoke        # Quick smoke test
pnpm load:read         # Read-path load test (target: p99 < 300 ms at 150 rps)
pnpm load:write        # Write-path load test (target: p99 < 500 ms)
```
