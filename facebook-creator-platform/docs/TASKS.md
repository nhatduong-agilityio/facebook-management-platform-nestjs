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
- [ ] **T1.3 Identity module** (~3h)
  - Clerk JWT guard at gateway; `getOrCreateUser`; `GET /auth/me`; RBAC roles (Owner/Editor/Viewer) resolver.
  - DoD: protected route 401 without token / 200 with; role guard unit-tested; Result used.
- [ ] **T1.4 Workspace module — core** (~3h)
  - Workspace entity + service + role resolution. Entities extend BaseEntity.
  - DoD: create/list/get endpoints; tests + Swagger; Result used.
- [ ] **T1.5 Workspace module — members & invitations** (~4h)
  - Members + invitations entities; invite flow; sole-owner guard (BR-R02); emit events.
  - DoD: invite endpoint; sole-owner removal -> err(FORBIDDEN); tests.

## Week 2 — Facebook + Posts + Event Bus  (resume point after foundation)

- [ ] **T2.1 Facebook OAuth connect-url** (~2h) — `GET /workspaces/:id/facebook/connect-url` (Owner/Editor). DoD: returns provider URL + state; test; Swagger.
- [ ] **T2.2 Facebook OAuth callback -> connect Page** (~3h) — `POST /workspaces/:id/facebook/pages`; **token persisted via EncryptedText from the first write** (already available from T1.2); same-workspace guard (BR-R05). DoD: ciphertext in DB, token never returned; cross-workspace -> err(CROSS_WORKSPACE).
- [ ] **T2.3 Facebook token refresh + Graph API service** (~3h) — refresh flow + typed client. DoD: refresh updates encrypted token; tests.
- [ ] **T2.4 Posts entity + CRUD + quota** (~4h) — create/list/update/delete (soft); content length (BR-F02); plan-quota check. DoD: validation + Result + tests.
- [ ] **T2.5 Post status state machine** (~3h) — `PATCH /posts/:id/status`; guarded transitions; scheduled_at future (BR-F06). DoD: illegal transition -> err(INVALID_STATE_TRANSITION); tests.
- [ ] **T2.6 RabbitMQ event infrastructure** (~6h) — @golevelup; **publish-after-commit**; idempotent consumer base; DLQ + retry + dedup. DoD: publish PostCreated/PostPublished; consumer processes once; failing msg -> DLQ after retries.

## Week 3 — Billing + Analytics + Audit Service

- [ ] **T3.1 Plans + subscriptions entities** (~3h) (app-gen ids, timestamps) + Stripe checkout. DoD: seed plans; `POST .../billing/checkout`; tests.
- [ ] **T3.2 Billing state machine + webhook** (~5h) — guarded transitions + `billing_events` transition log; free-plan guard (BR-F10); `POST /billing/webhooks/stripe` (signature-verified, idempotent). DoD: webhook drives state machine; illegal transition -> err; matches `docs/reference/billing-state-machine.svg`.
- [ ] **T3.3 Analytics service** (~4h) — consume PostPublished; Graph API metrics sync; `post_metrics` (logical postId, indexed). DoD: overview + per-post endpoints read analytics schema.
- [ ] **T3.4 Audit Service (MongoDB)** (~3h) — schemaless `audit.events`; consume **every** event; app-gen `_id` (uuid v7); link `eventId` (idempotent). DoD: events produce audit docs once; no PII leak.
- [ ] **T3.5 Audit read API + Analytics API** (~3h) — `GET /workspaces/:id/audit-logs` + `/:auditId` (Owner-only, read-only, pagination); analytics read endpoints. DoD: Owner-only enforced; cross-workspace -> 404; Swagger.

## Week 4 — Search, Notifications, Email

- [ ] **T4.1 Search service** (~3h) — Algolia index consumer + query passthrough (search schema owns no tables, ADR-004). DoD: PostCreated indexes; search returns hits.
- [ ] **T4.2 Notification service** (~3h) — in-app + Slack; one-way read status (BR-F08). DoD: `GET /notifications`, `PATCH /:id/read`; tests.
- [ ] **T4.3 Email service** (~4h) — invitation/publish-result/subscription/token emails; dedupe_key unique (BR-R08). DoD: consumers + provider abstraction; dedupe enforced.
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
