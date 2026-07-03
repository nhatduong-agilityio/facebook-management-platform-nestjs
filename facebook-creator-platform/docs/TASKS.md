# Tasks — Facebook Creator Platform

One task = one reviewable unit of work with a clear Definition of Done (DoD).
Work top to bottom. Mark `[x]` when the DoD is met. Don't start the next task
until the current one is green (`pnpm lint && pnpm test`) and PROGRESS.md is updated.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[b]` blocked

For blocked tasks always append an inline note on the same line:
`[b] **T2.1 ...** — blocked: <reason> · unblock: <what needs to happen>`

> **Ordering principle:** Foundational, cross-cutting concerns are built **first**,
> in Week 1, before any feature code — because every feature inherits them.
> MikroORM (Unit of Work), the `BaseEntity` (uuid v7 + timestamps + soft delete),
> PII encryption (`EncryptedText`) and the Result pattern are NOT a late
> "migration" — building features on a wrong foundation and rewriting later is
> pure waste. The Audit Service lands in Week 3 (right after the event bus is
> stable). Week 5 is **verification + load testing**, not building. (See
> DECISIONS.md, 2026-06-29 reorder note.)

---

## Week 1 — Foundation (build it right before any feature)

- [x] **T1.1 Monorepo + tooling + datastores** (~4h)
  - pnpm workspace; apps/api + services/* packages; tsconfig base; eslint(9)+prettier; vitest+swc; husky pre-commit (lint+test). Docker Compose: PostgreSQL 16, **MongoDB**, Redis, RabbitMQ. `.env.example`.
  - DoD: `pnpm install/lint/test` clean on an empty app; `docker compose up` brings all four datastores up; `/health` 200.
- [x] **T1.2 Persistence + cross-cutting foundation** (~6h)  (the keystone task)
  - MikroORM (UoW) wired to Postgres (per-schema) **and** Mongo; `BaseEntity` (uuid v7, createdAt/updatedAt/deletedAt, global soft-delete filter); `AppError` + `toHttpException`; Result helpers; `EncryptedText` (AES-256-GCM) + aes-gcm util; Pino logger with PII redaction; FK-index migration convention.
  - DoD: unit tests for AppError mapping, encrypt/decrypt round-trip, logger redacts a token; a sample entity migrates and matches `docs/reference/fcp-ddl.sql`; soft delete hides rows by default.
- [x] **T1.3 Identity module** (~3h)
  - Clerk JWT guard at gateway; `getOrCreateUser`; `GET /auth/me`; RBAC roles (Owner/Editor/Viewer) resolver.
  - DoD: protected route 401 without token / 200 with; role guard unit-tested; Result used.
- [x] **T1.4 Workspace module — core** (~3h)
  - Workspace entity + service + role resolution. Entities extend BaseEntity.
  - DoD: create/list/get endpoints; tests + Swagger; Result used.
- [x] **T1.5 Workspace module — members & invitations** (~4h)
  - Members + invitations entities; invite flow; sole-owner guard (BR-R02); emit events.
  - DoD: invite endpoint; sole-owner removal -> err(FORBIDDEN); tests.

## Week 2 — Facebook + Posts + Event Bus  (resume point after foundation)

- [x] **T2.1 Facebook OAuth connect-url** (~2h) — `GET /workspaces/:id/facebook/connect-url` (Owner/Editor). DoD: returns provider URL + state; test; Swagger.
- [x] **T2.2 Facebook OAuth callback -> connect Page** (~3h) — `POST /workspaces/:id/facebook/pages`; **token persisted via EncryptedText from the first write** (already available from T1.2); same-workspace guard (BR-R05). DoD: ciphertext in DB, token never returned; cross-workspace -> err(CROSS_WORKSPACE).
- [x] **T2.3 Facebook token refresh + Graph API service** (~3h) — `refreshPageToken` on `IFacebookGraphApiProvider`; updates encrypted token in DB; `GET /webhooks/facebook` hub.challenge verification endpoint (unguarded; `FACEBOOK_WEBHOOK_VERIFY_TOKEN` compared with `hub.verify_token`; unblocks Facebook App Dashboard webhook registration). DoD: refresh updates encrypted token; challenge endpoint returns `hub.challenge` on valid token / 403 on mismatch; tests.
- [x] **T2.4 Posts entity + CRUD + quota** (~4h) — create/list/update/delete (soft); content length (BR-F02); plan-quota check. DoD: validation + Result + tests.
- [x] **T2.5 Post status state machine** (~3h) — `PATCH /posts/:id/status`; four states: `draft → scheduled → publishing → published | failed`; `publishing` is set synchronously by the Publish Job when `facebook_graph_post_id` is captured from the Graph API response; `published` is confirmed by webhook (T2.7) or fallback poll; guarded transitions; `scheduled_at` future (BR-F06). DoD: illegal transition -> err(INVALID_STATE_TRANSITION); `publishing` state + `facebook_graph_post_id` field exist; tests.
- [x] **T2.6 RabbitMQ event infrastructure** (~6h) — @golevelup; **publish-after-commit**; idempotent consumer base; DLQ + retry + dedup. DoD: publish PostCreated/PostPublished; consumer processes once; failing msg -> DLQ after retries.
- [x] **T2.7 Facebook webhooks** (~3h) — `POST /webhooks/facebook`; verify `X-Hub-Signature-256` (HMAC-SHA256 with `FACEBOOK_APP_SECRET`); normalize event payload; publish to RabbitMQ (`fcp.events` exchange). Consumers: `PostPublishedConsumer` (match incoming `post_id` against stored `facebook_graph_post_id` → `publishing→published`); `FacebookPageDeauthorizedConsumer` (soft-delete `FacebookAccount` + cancel scheduled posts for that page). Fallback: if webhook does not arrive within configurable TTL, a poll job calls `GET /{graph_post_id}` to drive the final transition. DoD: spoofed `X-Hub-Signature-256` → 403; valid `pages/feed` event drives `publishing→published`; deauth soft-deletes account and cancels posts; tests.

## Week 3 — Billing + Analytics + Audit Service

> **Architecture note (corrected 2026-07-03):** Each "service" in Week 3–4 is a
> **separate NestJS app** under `services/<name>/` with its own `package.json`,
> `main.ts`, database connection (owns its Postgres schema), and RabbitMQ consumers.
> `apps/api` communicates with services via **sync HTTP** (immediate-response calls
> like checkout and quota) and receives **async RabbitMQ events** published by
> services (subscription state changes, analytics, etc.).
> Stripe webhooks go directly to `services/billing`, not through `apps/api`.
> See `docs/CODING-STANDARDS.md` §10 for the full service roster and IPC rules.

- [x] **T3.1 Plans + subscriptions + Stripe checkout** (~4h) — scaffold `services/billing/` as a full NestJS app (own DB connection to `billing` schema, migrations, entities); `POST /checkout` + `GET /workspaces/:id/quota` HTTP endpoints (called by apps/api); thin billing proxy in `apps/api` (`POST /workspaces/:id/billing/checkout` → HTTP → services/billing; `BillingHttpQuotaAdapter` implements `IPostQuotaProvider`). DoD: seed plans; checkout endpoint; quota adapter reads real plan limit; tests.
- [x] **T3.2 Billing state machine + webhook** (~5h) — in `services/billing`: guarded transitions + `billing_events` log; free-plan guard (BR-F10); `POST /webhooks/stripe` (signature-verified, idempotent via `stripe_event_id`); publishes `billing.subscription_activated` / `billing.subscription_cancelled` events to `fcp.events`. DoD: webhook drives state machine; illegal transition → err; matches `docs/reference/billing-state-machine.svg`; apps/api consumers wire up.
- [ ] **T3.3 Analytics service** (~4h) — scaffold `services/analytics/` (full NestJS app, `analytics` schema); consumer on `posts.published` → Graph API fetch → `post_metrics` upsert; HTTP `GET /workspaces/:id/metrics` + `GET /posts/:id/metrics` (called by apps/api). DoD: PostPublished triggers metrics fetch; overview + per-post endpoints return data; tests.
- [ ] **T3.4 Audit Service (MongoDB)** (~3h) — scaffold `services/audit/` (full NestJS app, MongoDB); consume **every** `fcp.events` topic event; schemaless `audit_events` doc (app-gen `_id` uuid v7, link `eventId`, no PII); idempotent via `eventId` unique index. DoD: every published event produces exactly one audit doc; no PII in doc; tests.
- [ ] **T3.5 Audit read API + Analytics read API** (~3h) — in `apps/api`: `GET /workspaces/:id/audit-logs` + `/:auditId` calls `services/audit` HTTP; `GET /workspaces/:id/analytics` calls `services/analytics` HTTP. Owner-only; cross-workspace → 404; Swagger. DoD: Owner-only enforced; cross-workspace → 404; Swagger docs generated.

## Week 4 — Search, Notifications, Email

- [ ] **T4.1 Search service** (~3h) — scaffold `services/search/` (full NestJS app, no Postgres tables — Algolia is the system of record, ADR-004); consumer on `posts.created` / `posts.published` → Algolia index; optional HTTP `GET /search?q=` passthrough in apps/api. DoD: PostCreated/Published trigger Algolia index; search returns hits; tests.
- [ ] **T4.2 Notification service** (~3h) — scaffold `services/notification/` (full NestJS app, `notification` schema); consumers on workspace + posts + billing events → insert `notifications` + `notification_recipients`; HTTP `GET /workspaces/:id/notifications` + `PATCH /:id/read` (called by apps/api). DoD: events produce notification rows; read status (BR-F08); tests.
- [ ] **T4.3 Email service** (~4h) — scaffold `services/email/` (full NestJS app, `email` schema); consumers on `workspace.member-invited`, `posts.published`, `billing.subscription_*`; provider abstraction (SendGrid / SES); `dedupe_key` unique enforced (BR-R08); logs to `email_delivery_logs`. DoD: consumers + provider abstraction; dedupe enforced; tests.
- [ ] **T4.4 Cross-cutting tests + docs** (~6h) — unit + API tests fill gaps; Swagger complete; ADRs current. DoD: coverage targets met; Swagger builds.

## Week 5 — Hardening, Verification & Load Testing (verify, don't build)

- [ ] **T5.1 MikroORM/UoW verification pass** (~2h) — confirm all entities use UoW; global soft-delete filter; no stray TypeORM; full migration matches fcp-ddl.sql. DoD: schema diff clean; CI green.
- [ ] **T5.2 Schema audit** (~2h) — no DB id defaults on service tables; every table has the timestamp triplet; run `docs/reference/verify-seed.sql`. DoD: all checks pass.
- [ ] **T5.3 PII verification** (~2h) — all tokens via EncryptedText; redaction paths complete; event builders strip PII. DoD: integration run shows no token/email/fullName in logs or event payloads.
- [ ] **T5.4 Result-pattern + FK-index pass** (~2h) — every service method returns Result (no domain throw); every real + logical FK indexed (R8). DoD: review/lint clean; schema check lists no unindexed FK.
- [ ] **T5.5 Artillery smoke + load** (~3h) — scenarios vs capacity targets (read 150 rps p99 < 300ms; write p99 < 500ms; publish fan-out no DLQ growth; auth/RBAC cache-first). DoD: scenarios run; reports saved under test/load/reports.
- [ ] **T5.6 Load-test fixes** (~3h) — address regressions in order: (1) add/fix missing indexes and run `EXPLAIN ANALYZE` on slow queries, (2) optimize MikroORM queries (N+1, pagination), (3) add Redis cache **only** for paths that still miss thresholds after steps 1–2, recording the before/after benchmark in DECISIONS.md. DoD: re-run meets thresholds.
- [ ] **T5.7 Buffer** (~4h) — final review, docs sync, demo prep.

---

## Adding a task

Append under the right week with: a one-line scope, the relevant business
rules / endpoints, a time estimate (~Xh), and a concrete DoD. Keep tasks <= ~1 day;
split if bigger. Put foundational/cross-cutting concerns in Week 1, features after,
validation last.
