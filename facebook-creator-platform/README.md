# Facebook Creator Platform

A backend-focused SaaS practice monorepo for managing Facebook content, scheduling posts,
collecting analytics, and enforcing Free/Pro subscriptions.

Built with **TypeScript 5**, **NestJS 11**, **PostgreSQL 16** via **MikroORM 7**, validated
with **class-validator** — managed by **pnpm 10**.

---

## Table of Contents

- [Facebook Creator Platform](#facebook-creator-platform)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Project Structure](#project-structure)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [API Reference](#api-reference)
  - [Architecture & Design](#architecture--design)
  - [Code Quality](#code-quality)

---

## Features

| App / Area | Description |
| --- | --- |
| `apps/api` | NestJS 11 REST API + Swagger UI, MikroORM 7 (PostgreSQL), class-validator |
| `apps/api` (jobs) | Background workers using `@nestjs/schedule` — publish, poll, token expiry, outbox relay, workspace purge |
| Authentication | Clerk-based auth (JWT bearer token verified at API layer) |
| Billing | Stripe Checkout + webhook state machine (`services/billing`) |
| Facebook integration | OAuth connect + page token storage (AES-256-GCM) + Graph API calls |
| Search | Algolia full-text search (`services/search`) |
| Analytics | Post metrics snapshots from Graph API (`services/analytics`) |
| Notifications | In-app + Slack alerts (`services/notification`) |
| Email | Transactional email via Resend (`services/email`) |
| Audit trail | Schemaless event log in MongoDB (`services/audit`) |

---

## Project Structure

```text
facebook-creator-platform/
├── apps/
│   └── api/                          # NestJS API — the primary application
│       ├── src/
│       │   ├── main.ts               # HTTP server entry point
│       │   ├── app.module.ts         # Root module (global config, Pino, throttler)
│       │   ├── modules/              # Domain modules (auth, facebook, posts, …)
│       │   ├── infrastructure/       # RabbitMQ event bus + outbox relay job
│       │   ├── common/               # Shared errors, guards, crypto, trace
│       │   ├── health/               # /health endpoint (Terminus probes)
│       │   └── migrations/           # MikroORM migrations (core schema)
│       ├── docker-compose.yml        # Postgres, MongoDB, Redis, RabbitMQ (dev)
│       └── mikro-orm.config.ts
│
├── services/
│   ├── billing/                      # Stripe state machine; HTTP + TCP hybrid
│   ├── analytics/                    # Post metrics from Graph API; pure TCP
│   ├── audit/                        # MongoDB event log; pure TCP + RMQ wildcard
│   ├── search/                       # Algolia indexing; pure TCP + 5 RMQ consumers
│   ├── notification/                 # In-app + Slack alerts; pure TCP + 11 consumers
│   └── email/                        # Resend transactional email; pure RMQ microservice
│
├── libs/
│   ├── rmq-options/                  # Shared RabbitMQ factory (@fcp/rmq-options)
│   ├── billing-contracts/            # Shared wire types for billing TCP calls
│   ├── analytics-contracts/          # Shared wire types for analytics TCP calls
│   ├── audit-contracts/              # Shared wire types for audit TCP calls
│   └── constants/                    # Shared constants (exchange names, tokens)
│
├── docs/
│   ├── TASKS.md                      # Ordered task list with DoD
│   ├── PROGRESS.md                   # Resume point + log
│   ├── DECISIONS.md                  # Architecture Decision Records (ADRs)
│   ├── CODING-STANDARDS.md           # Patterns, conventions, Three-Transport Model
│   └── reference/                    # CR-01 deliverables (DDL, API spec, diagrams)
│
├── test/
│   ├── e2e/                          # Artillery e2e scenarios
│   └── load/                         # Artillery load-test scenarios + reports
│
├── .env.example                      # Single shared env template for all services
├── docker-compose.yml                # All datastores + service containers
├── pnpm-workspace.yaml               # pnpm workspace (apps/*, services/*, libs/*)
└── package.json                      # Workspace scripts
```

See the app-level README:

- [`apps/api/README.md`](apps/api/README.md)

---

## Requirements

| Tool | Version |
| --- | --- |
| Node.js | ≥ 25 |
| pnpm | ≥ 10 |
| Docker | any recent version (for local datastores) |

---

## Installation

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env — fill in CLERK_*, STRIPE_*, FACEBOOK_*, ALGOLIA_*, RESEND_* keys

# 3. Start all datastores (Postgres, MongoDB, Redis, RabbitMQ)
docker compose up -d

# 4. Run migrations for each service that owns a Postgres schema
pnpm migration                  # apps/api  → core schema
pnpm migration:billing          # services/billing
pnpm migration:analytics        # services/analytics
pnpm migration:notification     # services/notification
pnpm migration:email            # services/email

# 5. Start all processes (7 terminals or a process manager)
pnpm start:dev          # apps/api          → :3000
pnpm start:billing      # services/billing  → :3001 (HTTP) + :4001 (TCP)
pnpm start:analytics    # services/analytics → :3002 (TCP)
pnpm start:audit        # services/audit    → :3003 (TCP)
pnpm start:search       # services/search   → :3004 (TCP)
pnpm start:notification # services/notification → :3005 (TCP)
pnpm start:email        # services/email    → pure RabbitMQ microservice
```

---

## Environment Variables

All services share a single `.env.example` at the repo root. Copy it to `.env` and fill in
the required values.

Key variables:

| Variable | Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://fcp:fcp@localhost:5432/fcp` | Main Postgres DB |
| `MONGODB_URI` | `mongodb://localhost:27017/fcp_audit` | Audit service |
| `REDIS_URL` | `redis://localhost:6379` | Consumer dedup keys |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | Event bus |
| `CLERK_SECRET_KEY` | `sk_test_…` | JWT verification |
| `FACEBOOK_APP_ID` | `…` | OAuth + webhooks |
| `FACEBOOK_APP_SECRET` | `…` | Webhook HMAC + token refresh |
| `FACEBOOK_REDIRECT_URI` | `https://<ngrok>/api/v1/facebook/callback` | Must match Facebook App Dashboard |
| `STRIPE_SECRET_KEY` | `sk_test_…` | Billing |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | Stripe webhook signature |
| `ALGOLIA_APP_ID` / `ALGOLIA_API_KEY` | `…` | Search indexing |
| `RESEND_API_KEY` | `re_…` | Transactional email |
| `PII_ENCRYPTION_KEY` | `<base64 32 bytes>` | AES-256-GCM for Facebook tokens |

See `.env.example` for the full list including TCP ports, Slack webhook URL, and email
template IDs.

---

## API Reference

All routes are served by `apps/api` under the global prefix `/api/v1`.

| Group | Prefix | Auth |
| --- | --- | --- |
| Auth | `/api/v1/auth` | Clerk JWT |
| Workspaces | `/api/v1/workspaces` | Clerk JWT |
| Posts | `/api/v1/workspaces/:id/posts` | Clerk JWT + RBAC |
| Facebook | `/api/v1/workspaces/:id/facebook` | Clerk JWT + RBAC |
| Billing | `/api/v1/workspaces/:id/billing` | Clerk JWT + RBAC |
| Analytics | `/api/v1/workspaces/:id/analytics` | Clerk JWT (Owner) |
| Audit logs | `/api/v1/workspaces/:id/audit-logs` | Clerk JWT (Owner) |
| Notifications | `/api/v1/workspaces/:id/notifications` | Clerk JWT |
| Search | `/api/v1/workspaces/:id/search` | Clerk JWT |
| Webhooks | `/api/v1/webhooks/*` | HMAC-verified, no JWT |
| Health | `/api/v1/health` | None |

Docs (local):

- Swagger UI: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/api/v1/health`

---

## Architecture & Design

`apps/api` is a **NestJS modular monolith** that owns the public HTTP surface. Background
processing and domain concerns are split across six independent NestJS microservices under
`services/`. Services communicate over three transports (ADR-094):

| Transport | When to use |
| --- | --- |
| **HTTP** | External clients → `apps/api`; inbound webhooks (Stripe, Facebook, Clerk) |
| **TCP `@MessagePattern`** | `apps/api` → internal service sync queries (quota, checkout, metrics) |
| **RabbitMQ `@EventPattern`** | Async fire-and-forget domain events between all services |

Each service owns its own Postgres schema and runs its own MikroORM migrations. Cross-schema
references are plain `uuid` columns with no FK constraint (BR-R06); integrity is enforced
via domain events.

Further reading:

- `docs/CODING-STANDARDS.md` — patterns, PII rules, Three-Transport Model (§15)
- `docs/DECISIONS.md` — all Architecture Decision Records
- `docs/reference/` — CR-01 deliverables: DDL, API spec, state-machine diagrams

---

## Code Quality

```bash
pnpm lint           # ESLint across all workspaces
pnpm format         # Prettier
pnpm build          # TypeScript compile all packages
pnpm test           # Vitest (all packages)
pnpm test:api       # Vitest (apps/api only)
pnpm load:smoke     # Artillery smoke test (requires live stack)
pnpm load:read      # Artillery read-path load test
pnpm load:write     # Artillery write-path load test
```
