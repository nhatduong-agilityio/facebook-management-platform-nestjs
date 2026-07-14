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
- [x] **T2.6.5 Messaging schema migration** (~1h) — retroactive to T2.6: create `messaging.event_message_logs` + `messaging.dead_letter_messages` migration (per `fcp-ddl.sql`); wire `RabbitMqEventBus` publisher to write a `pending` row before sending and update to `processed` after ack (or `dlq` on permanent nack). These tables must exist from the point RabbitMQ is in use — DLQ rows written before the schema exists are silent failures. Also update `docs/reference/verify-seed.sql` row-count section to include `messaging.*` tables. DoD: migration runs cleanly; publisher writes `pending`/`processed` rows; DLQ handler writes a `dead_letter_messages` row; `verify-seed.sql` references `messaging.*` without error; tests.
- [x] **T2.8 Accept invitation endpoint** (~2h) — `POST /workspaces/:workspaceId/invitations/:token/accept` (unguarded — the token is the credential); find `Invitation` by token, check `status=pending` + `expiresAt > now()` (BR-F03); create `WorkspaceMember` with `role` from invitation; set `invitation.status=accepted`, `acceptedAt=now()`; flush; **emit `MemberJoinedEvent` (`workspace.member-joined`) after flush** (ADR-052: Notification Service projection consumer). Also add `PATCH /workspaces/:id/members/:userId/role` endpoint that changes member role and emits `MemberRoleChangedEvent` (`workspace.role-changed`) after flush. DoD: valid token creates member + marks invitation accepted + emits MemberJoinedEvent; expired token → err(VALIDATION_ERROR); already-accepted token → err(CONFLICT); role change emits MemberRoleChangedEvent; tests.
- [x] **T2.9 Publish Job + fallback poll + token-expiry scheduler** (~5h) — in `apps/api`: (1) `PublishJob` cron (every minute): finds `scheduled` posts where `scheduledAt <= now()` + `deletedAt IS NULL`; calls Facebook Graph API (`POST /{pageId}/feed` with page access token); on success: sets `facebookGraphPostId`, transitions to `publishing`; on error: transitions to `failed`. (2) `PublishFallbackPollJob` cron (every 5 min): finds `publishing` posts older than `PUBLISH_TTL_MINUTES` (env, default 30); calls `GET /{facebookGraphPostId}`; if live → `publishing→published`; if still pending after TTL × 3 → `failed`. (3) `FacebookTokenExpiryScheduler` cron (daily): finds `facebook_accounts` where `token_expires_at < now() + 7 days`; publishes `facebook.token_expiring` event for each (ADR-053); does NOT send email directly — Email Service consumes the event. DoD: scheduled post publishes + transitions; Graph API error → `failed`; fallback drives `publishing→published`; daily scan emits `facebook.token_expiring` events for near-expiry accounts; all three jobs unit-tested with mocked providers.

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
- [x] **T3.3 Analytics service** (~4h) — scaffold `services/analytics/` (full NestJS app, `analytics` schema); consumer on `posts.published` → Graph API fetch → `post_metrics` upsert (idempotent via UNIQUE `(post_id, metric_date)`); HTTP `GET /workspaces/:id/metrics` + `GET /posts/:id/metrics` (called by apps/api). Token resolution: consumer reads `facebookAccountId` from event, calls `GET /internal/facebook-accounts/:id` on `apps/api` (field `pageToken`) to get decrypted page token, then calls `GET /{post-id}/insights` on Facebook Graph API. Entity: `analytics.post_metrics` includes `workspace_id` (logical FK, no DB constraint, BR-R06 — ADR-046) + btree index. DoD: PostPublished triggers metrics fetch; idempotent upsert works on replay; overview + per-post endpoints return data; tests (consumer + HTTP endpoints).
- [x] **T3.4 Audit Service (MongoDB)** (~3h) — scaffold `services/audit/` (full NestJS app, MongoDB); consume **every** `fcp.events` topic event; schemaless `audit_events` doc (app-gen `_id` uuid v7, link `eventId`, no PII); idempotent via `eventId` unique index. DoD: every published event produces exactly one audit doc; no PII in doc; tests.
- [x] **T3.5 Audit read API + Analytics read API** (~3h) — in `apps/api`: `GET /workspaces/:id/audit-logs` + `/:auditId` calls `services/audit` HTTP; `GET /workspaces/:id/analytics` calls `services/analytics` HTTP. Owner-only; cross-workspace → 404; Swagger. DoD: Owner-only enforced; cross-workspace → 404; Swagger docs generated.
- [x] **T3.6 Billing lifecycle event completeness** (~2h) — extend `services/billing` Stripe webhook handler with two missing event arms: (1) `customer.subscription.updated` where `status === 'past_due'` → transition to `past_due`, publish `billing.subscription_past_due` event (payload: `{ workspaceId, planCode }`); (2) `invoice.payment_succeeded` where the subscription is already `active` (renewal, not first payment) → publish `billing.subscription_renewed` event (payload: `{ workspaceId, planCode, renewedAt }`). Both log to `billing_events`; both are idempotent via `stripe_event_id`. DoD: `past_due` state arm handles `customer.subscription.updated`; renewal arm handles `invoice.payment_succeeded` on active subscription; `billing.subscription_past_due` + `billing.subscription_renewed` events published; tests for both Stripe event arms; apps/api consumers wire up (T4.2 notification service consumes `billing.subscription_past_due`).

## Week 4 — Search, Notifications, Email

- [x] **T4.1 Search service** (~4h) — scaffold `services/search/` (full NestJS app, no Postgres schema — Algolia is the system of record, ADR-004); five idempotent consumers:
  - `posts.created` → `algolia.saveObject({ objectID: postId, workspaceId, title, content, status, scheduledAt, createdAt })`
  - `posts.updated` → `algolia.partialUpdateObject({ objectID: postId, title, content, scheduledAt, updatedAt })`
  - `posts.published` → `algolia.partialUpdateObject({ objectID: postId, status: 'published', facebookGraphPostId, publishedAt })`
  - `posts.failed` → `algolia.partialUpdateObject({ objectID: postId, status: 'failed', failedAt })` — keeps Algolia consistent with actual post state
  - `posts.deleted` → `algolia.deleteObject(postId)`

  No HTTP call back to `apps/api` — event payloads carry all indexable data (ADR-051/CQRS). HTTP `GET /workspaces/:id/search?q=` passthrough in `apps/api` calls `services/search` which proxies to Algolia. DoD: all five events trigger correct Algolia op; search returns hits; duplicate event is deduped by `eventId` (Redis NX); tests for all five consumers.
- [x] **T4.2 Notification service** (~5h) — scaffold `services/notification/` (full NestJS app, `notification` schema); two internal tables: `notifications` + `notification_recipients` (from DDL) + `workspace_members_projection` (CQRS projection — ADR-052); entities do NOT extend `BaseEntity` (DDL has no `updatedAt`/`deletedAt` on these tables).

  **Projection consumers** (maintain `workspace_members_projection` via upsert):
  - `workspace.member-invited` → upsert `(workspaceId, userId, role)`
  - `workspace.member-joined` → upsert `(workspaceId, userId, role)`
  - `workspace.member-removed` → delete row `(workspaceId, userId)`
  - `workspace.role-changed` → update `role` where `(workspaceId, userId)`

  **Notification consumers** (use projection to resolve recipients; no HTTP to apps/api):
  - `posts.published` → notify all workspace members (in-app + Slack alert)
  - `posts.failed` → notify post author only (in-app toast + Slack alert)
  - `billing.subscription_activated` → notify workspace members (in-app)
  - `billing.subscription_cancelled` → notify workspace members (in-app + Slack alert)
  - `billing.subscription_past_due` → notify workspace members (in-app + Slack alert) — added T3.6
  - `billing.payment_failed` → notify workspace members (in-app + Slack alert)
  - `facebook.token_expiring` → notify workspace members (in-app alert)

  **Channel routing** via `NotificationOrchestrator` — decides in-app and/or Slack per event.
  **Providers**: `ISlackProvider` port + `SlackWebhookProvider` (Slack Incoming Webhook URL from env). Future `ITeamsProvider` just needs a new implementation + orchestrator update.
  **BR-F08**: `read_status` is one-way (`false → true` only); enforced at application layer + DB trigger.
  **Projection cold-start reconciliation** (ADR-059): on service boot, for each distinct `workspace_id` already in `workspace_members_projection`, call `GET /internal/workspaces/:id/members` on `apps/api` and re-upsert all rows (same conflict-resolution logic as event consumers). This recovers from events missed during downtime without requiring full event replay. Skipped if projection is empty (first boot — events will populate it naturally).
  **HTTP endpoints** (called by `apps/api`): `GET /workspaces/:id/notifications` (recipient's unread + recent); `PATCH /notifications/:id/read`.
  DoD: projection stays consistent across all membership events; cold-start reconciliation re-upserts from `GET /internal/workspaces/:id/members` on boot; all notification events produce rows + recipients; `billing.subscription_past_due` triggers in-app + Slack; Slack alert fires on key events; read endpoint returns correct rows; `PATCH` marks read (one-way); BR-F08 revert attempt → err; tests for projection consumers + reconciliation + notification consumers + HTTP endpoints.
- [x] **T4.3 Email service** (~6h) — scaffold `services/email/` (full NestJS app, `email` schema). `EmailDeliveryLog` entity does NOT extend `BaseEntity` (DDL has `sent_at`/`created_at`, no `updatedAt`/`deletedAt`).

  **Provider**: `IEmailProvider` port + `ResendEmailProvider` implementation (ADR-056 — Resend is the initial impl; SES/SendGrid switchable). BullMQ job queue with `attempts: 3, backoff: exponential` for retry (ADR-055); on final failure → `EmailDeliveryLog.status = 'failed'`, `retry_count = 3`.

  **Consumers** — mapped to DDL `email_type CHECK ('invitation','publish_success','publish_failed','token_expiring','payment_failed')`:
  - `workspace.member-invited` → `email_type='invitation'`; recipient email in event payload; `related_entity_type='workspace', related_entity_id=workspaceId`
  - `posts.published` → `email_type='publish_success'`; recipient from `GET /internal/users/:id` (field `email`) using `createdByUserId` (ADR-050); `related_entity_type='post', related_entity_id=postId`
  - `posts.failed` → `email_type='publish_failed'`; recipient from `GET /internal/users/:id` (field `email`) using `createdByUserId`; `related_entity_type='post', related_entity_id=postId`
  - `billing.payment_failed` → `email_type='payment_failed'`; recipient from `GET /internal/workspaces/:id` (field `ownerEmail`) (ADR-050); `related_entity_type='workspace', related_entity_id=workspaceId`
  - `facebook.token_expiring` → `email_type='token_expiring'`; recipient from `GET /internal/workspaces/:id` (field `ownerEmail`); `related_entity_type='facebook_account', related_entity_id=facebookAccountId`

  Note: `billing.subscription_activated` and `billing.subscription_cancelled` do NOT trigger emails (no matching `email_type` in DDL); handled by Notification Service (in-app only).

  **Dedup** (BR-R08): `dedupe_key = '{eventId}:{recipientEmail}'`, UNIQUE on `email_delivery_logs`. DoD: all consumers create log rows; BullMQ retries 3× then marks failed; dedup prevents double-send on replay; `related_entity_type/id` populated; tests for all consumers + retry behavior.
- [ ] **T4.4 Cross-cutting tests + docs** (~6h) — unit + API tests fill gaps; Swagger complete; ADRs current. DoD: coverage targets met; Swagger builds.

## RabbitMQ Refactor — @golevelup → Transport.RMQ

> **Why:** Mentor review (2026-07-13) identified that `@golevelup/nestjs-rabbitmq` bypasses
> the NestJS microservices transport layer, breaking standard lifecycle, DI context,
> and serialization contracts. All services must migrate to `@nestjs/microservices`
> `Transport.RMQ` before T5 hardening. Reference architecture:
> `docs/diagrams/rabbitmq-transport-rmq.drawio`.
>
> **Wire-format break:** `ClientProxy.emit()` wraps every payload as
> `{ "pattern": "...", "data": {...} }`. `@EventPattern` unwraps `data` automatically.
> Publisher and consumer of each routing key **must** be migrated together — run
> TR.1–TR.9 in order, then TR.10 to verify end-to-end before proceeding to Week 5.
>
> **Design decision — `@MessagePattern` / `ClientProxy.send()` not used:** NestJS
> Transport.RMQ also supports request-response (`.send()` + `@MessagePattern`).
> This project intentionally uses **HTTP** for all sync inter-service calls (checkout,
> quota, metrics); RMQ is event-only. Do not add `@MessagePattern` without an ADR.
>
> **Retry architecture:** every service queue declares `x-dead-letter-exchange: fcp.dlq`.
> Transient failures → `channel.nack(msg, false, false)` → DLQ (operator-inspectable).
> The `fcp.retry.30s` TTL-queue from `@golevelup`'s `RetryQueueSetup` must be declared
> via Docker Compose init / `rabbitmqadmin definitions.json` / Terraform — **not** in
> application code. Applications must not own broker topology; raw `amqplib` inside a
> NestJS app is prohibited in this project.
>
> **Publisher Confirm (known limitation):** `ClientProxy.emit()` does not expose
> `ConfirmChannel` — there is no broker-level ack that the message was durably stored.
> `@golevelup` supported this via `AmqpConnection.publish()` on a `ConfirmChannel`.
> Acceptable for this training project; record as a known limitation in the TR.10 ADR.

- [x] **TR.1 Add `@nestjs/microservices` + AMQP peer deps + shared RMQ options factory** (~1h) — add `@nestjs/microservices`, `amqplib`, and `amqp-connection-manager` to `apps/api` and all `services/*` packages. `amqplib` and `amqp-connection-manager` are required peer deps of `@nestjs/microservices` RMQ transport; adding them explicitly now avoids a silent breakage when `@golevelup` is removed in TR.11 (currently they are only transitive deps via `@golevelup`). `amqplib@^2.0.1` bundles its own TS types — the `@types/amqplib@0.10.8` root devDep can be removed in TR.11 cleanup.

  Create a new shared lib `libs/rmq-options/` (`@fcp/rmq-options`) with **two** exported factory functions:
  - `getRmqOptions(queue, configService): MicroserviceOptions` — topic consumer (transport=Transport.RMQ, wildcards=true, exchange=fcp.events, exchangeType=topic, noAck=false, prefetchCount from **`RMQ_PREFETCH` env** (default 10), durable queue, `x-dead-letter-exchange: fcp.dlq`)
  - `getDlqRmqOptions(queue, configService): MicroserviceOptions` — DLQ consumer (exchange=fcp.dlq, exchangeType=fanout, noAck=false, prefetchCount from **`RMQ_DLQ_PREFETCH` env** (default 5), durable queue, no wildcards, no x-dead-letter-exchange)

  Add `@fcp/rmq-options: workspace:*` to all 7 packages so TR.2–TR.9 can import without re-install. Add `RMQ_PREFETCH` and `RMQ_DLQ_PREFETCH` to `.env.example`.

  No runtime behaviour changes yet. DoD: `@nestjs/microservices`, `amqplib`, `amqp-connection-manager` resolve in all packages; both factories compile; `pnpm lint` clean.

- [x] **TR.2 apps/api — migrate publisher (ClientProxy)** (~2h) — replace `AmqpConnection.publish()` in `RabbitMqEventBus` with `this.client.emit(event.routingKey, event)` where `client: ClientProxy` is injected via `@Inject('FCP_EVENT_BUS')`; replace `RabbitMQModule.forRootAsync` in `rabbitmq.module.ts` with `ClientsModule.registerAsync([{ name: 'FCP_EVENT_BUS', transport: Transport.RMQ, ... }])`; update `RabbitMqEventBus` spec to mock `ClientProxy` instead of `AmqpConnection`. DoD: publisher unit tests green; `apps/api` builds; no `@golevelup` import in publisher path.

- [x] **TR.3 apps/api — migrate consumers to `@EventPattern`** (~3h) — add **two** `connectMicroservice()` calls in `main.ts`:
  - `app.connectMicroservice(getRmqOptions('api_queue', ...))` — 6 domain event consumers
  - `app.connectMicroservice(getDlqRmqOptions('dlq.logger', ...))` — `DlqConsumer` (fanout binding to `fcp.dlq`)

  Then `await app.startAllMicroservices()`. Change every consumer class from `@Injectable()` to `@Controller()` and register in the owning module's `controllers` array; replace `@RabbitSubscribe` with `@EventPattern('routing.key')`, `@Payload() data`, `@Ctx() ctx: RmqContext`; replace `return new Nack(requeue)` with `channel.nack(msg, false, requeue)` / `channel.ack(msg)`; wrap each handler body in `await RequestContext.create(orm, async () => { ... })` (HTTP middleware does not run for microservice handlers). Update all consumer specs to mock `RmqContext`. DoD: all 6 domain consumers + `DlqConsumer` wired via Transport.RMQ on separate connections; `channel.ack/nack` called in every path; tests green.

- [x] **TR.4 services/billing — migrate publisher** (~1h) — replace `AmqpConnection.publish()` in `BillingRabbitMqAdapter` with `ClientProxy.emit(routingKey, payload)`; replace `RabbitMQModule.forRootAsync` in `app.module.ts` with `ClientsModule.registerAsync`; update adapter spec. DoD: billing events published via Transport.RMQ; tests green; no `@golevelup` in billing service.

- [x] **TR.5 services/email — migrate to pure microservice** (~3h) — change `main.ts` to `NestFactory.createMicroservice(AppModule, getRmqOptions('email_queue', ...))`; remove `EmailMessagingModule` and **delete `RetryQueueSetup` entirely** from `app.module.ts` (`managedChannel.addSetup` is unavailable under Transport.RMQ and broker topology must not live in application code — `fcp.retry.30s` TTL-queue is pre-declared via Docker Compose init / `definitions.json`); change all 5 consumers to `@Controller()` and move to `EmailModule.controllers`; replace `@RabbitSubscribe` with `@EventPattern` + `@Payload()` + `@Ctx() RmqContext`; replace `Nack` returns with `channel.ack/nack`; wrap handlers in `RequestContext.create()`. Update 5 consumer specs. DoD: email boots as pure microservice; all 5 event patterns bound to `email_queue`; tests green; no `@golevelup`; no raw `amqplib` in app code.

- [x] **TR.6 services/audit — migrate to hybrid + wildcard consumer** (~1h) — remove global `RabbitMQModule.forRootAsync` wrapper; add `app.connectMicroservice(getRmqOptions('audit_queue', ...))` + `startAllMicroservices()` in `main.ts`; change `AuditConsumer` to `@Controller()` with `@EventPattern('#')`; replace `Nack` with `channel.ack/nack`; add `RequestContext.create()` wrapper. Update spec. DoD: hybrid audit service receives all topic events via `#` wildcard; MongoDB write tested; no `@golevelup`.

- [x] **TR.7 services/analytics — migrate to hybrid + 1 consumer** (~1h) — same hybrid pattern as TR.6; queue `analytics_queue`; one `@EventPattern('posts.published')` handler. DoD: consumer receives `posts.published`; idempotent upsert test green; no `@golevelup`.

- [x] **TR.8 services/search — migrate to hybrid + 5 consumers** (~2h) — same hybrid pattern; queue `search_queue`; 5 `@EventPattern` handlers (`posts.created`, `posts.updated`, `posts.published`, `posts.failed`, `posts.deleted`). DoD: all 5 Algolia ops triggered correctly; Redis NX dedup path tested; no `@golevelup`.

- [ ] **TR.9 services/notification — migrate to hybrid + 11 consumers** (~3h) — same hybrid pattern; queue `notification_queue`; 11 `@EventPattern` handlers (4 projection consumers: `workspace.member-invited`, `workspace.member-joined`, `workspace.member-removed`, `workspace.role-changed`; 7 notification consumers); ensure `RequestContext.create()` wraps every handler (HTTP middleware does not fire for hybrid microservice routes). DoD: projection keeps `workspace_members_projection` consistent; notification consumers create rows + recipients; tests green; no `@golevelup`.

- [ ] **TR.10 ADR + full workspace smoke test** (~1h) — append ADR to `docs/DECISIONS.md`: migration from `@golevelup/nestjs-rabbitmq` to `@nestjs/microservices` Transport.RMQ (date: 2026-07-13, mentor review); record known limitation: `ClientProxy.emit()` has no `ConfirmChannel` broker-ack (unlike `@golevelup`); record decision: broker topology (`fcp.retry.30s`, exchanges) declared via IaC, not application code. Run `pnpm lint && pnpm test` across all workspaces. DoD: ADR in DECISIONS.md; `pnpm test` green in all packages; `pnpm lint` clean.

- [ ] **TR.11 Complete @golevelup removal** (~1h) — run `pnpm remove @golevelup/nestjs-rabbitmq` in every workspace that declares it (`apps/api`, `services/billing`, `services/email`, `services/audit`, `services/analytics`, `services/search`, `services/notification`). `amqplib` and `amqp-connection-manager` are already explicit deps from TR.1 and will not be lost when `@golevelup` is removed. Also remove `@types/amqplib` from root devDependencies — `amqplib@^2.0.1` bundles its own types. Delete all `@golevelup` wrapper modules (`RabbitmqModule` (old), `EmailMessagingModule`, and any equivalent `*MessagingModule` in other services); remove all remaining imports of `Nack`, `RabbitSubscribe`, `AmqpConnection` from `@golevelup/nestjs-rabbitmq`. **Do not delete `RabbitMqEventBus`** — the class stays; only its internals changed in TR.2 (`AmqpConnection` → `ClientProxy`). The `IEventBus` port and all domain-layer injections remain untouched:
  ```
  Service → IEventBus ← RabbitMqEventBus → ClientProxy
  ```
  DoD: `grep -r golevelup .` → zero results; `pnpm install` clean; `pnpm build` succeeds across all workspaces; no `ClientProxy` injected outside of adapter classes — domain services inject `IEventBus` only; `@nestjs/microservices` types do not leak into the domain layer.

## Week 5 — Hardening, Verification & Load Testing (verify, don't build)

- [ ] **T5.1 MikroORM/UoW verification pass** (~2h) — confirm all entities use UoW; entity-level soft-delete `@Filter` (not global ORM filter — removed in T1.4 bugfix); no stray TypeORM; migrations match `fcp-ddl.sql` **modulo intentional divergences** (ADR-046: `workspace_id` on `post_metrics`; ADR-047: `core.audit_logs` not created; app-generated UUID v7 everywhere — no `DEFAULT gen_random_uuid()`). DoD: no unintended schema divergences; CI green.
- [ ] **T5.2 Schema audit** (~2h) — no DB id `DEFAULT` on service-owned tables; all `BaseEntity` subclasses have the `createdAt`/`updatedAt`/`deletedAt` triplet; entities intentionally excluding `deletedAt` (WorkspaceMember, Invitation, Plan, Subscription, BillingEvent, service tables matching DDL) are documented exceptions; run `docs/reference/verify-seed.sql` after commenting out rows for `core.audit_logs` (ADR-047); `messaging.*` tables are created in T2.6.5 and require no comment-out. DoD: all active checks pass; no undocumented exceptions.
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
