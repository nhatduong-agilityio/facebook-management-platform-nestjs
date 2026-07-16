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
- [x] **T4.4 Cross-cutting tests + docs** (~6h) — unit + API tests fill gaps; Swagger complete; ADRs current. DoD: coverage targets met; Swagger builds.

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

- [x] **TR.9 services/notification — migrate to hybrid + 11 consumers** (~3h) — same hybrid pattern; queue `notification_queue`; 11 `@EventPattern` handlers (4 projection consumers: `workspace.member-invited`, `workspace.member-joined`, `workspace.member-removed`, `workspace.role-changed`; 7 notification consumers); ensure `RequestContext.create()` wraps every handler (HTTP middleware does not fire for hybrid microservice routes). DoD: projection keeps `workspace_members_projection` consistent; notification consumers create rows + recipients; tests green; no `@golevelup`.

- [x] **TR.10 ADR + full workspace smoke test** (~1h) — append ADR to `docs/DECISIONS.md`: migration from `@golevelup/nestjs-rabbitmq` to `@nestjs/microservices` Transport.RMQ (date: 2026-07-13, mentor review); record known limitation: `ClientProxy.emit()` has no `ConfirmChannel` broker-ack (unlike `@golevelup`); record decision: broker topology (`fcp.retry.30s`, exchanges) declared via IaC, not application code. Run `pnpm lint && pnpm test` across all workspaces. DoD: ADR in DECISIONS.md; `pnpm test` green in all packages; `pnpm lint` clean.

- [x] **TR.11 Complete @golevelup removal** (~1h) — run `pnpm remove @golevelup/nestjs-rabbitmq` in every workspace that declares it (`apps/api`, `services/billing`, `services/email`, `services/audit`, `services/analytics`, `services/search`, `services/notification`). `amqplib` and `amqp-connection-manager` are already explicit deps from TR.1 and will not be lost when `@golevelup` is removed. Also remove `@types/amqplib` from root devDependencies — `amqplib@^2.0.1` bundles its own types. Delete all `@golevelup` wrapper modules (`RabbitmqModule` (old), `EmailMessagingModule`, and any equivalent `*MessagingModule` in other services); remove all remaining imports of `Nack`, `RabbitSubscribe`, `AmqpConnection` from `@golevelup/nestjs-rabbitmq`. **Do not delete `RabbitMqEventBus`** — the class stays; only its internals changed in TR.2 (`AmqpConnection` → `ClientProxy`). The `IEventBus` port and all domain-layer injections remain untouched:
  ```
  Service → IEventBus ← RabbitMqEventBus → ClientProxy
  ```
  DoD: `grep -r golevelup .` → zero results; `pnpm install` clean; `pnpm build` succeeds across all workspaces; no `ClientProxy` injected outside of adapter classes — domain services inject `IEventBus` only; `@nestjs/microservices` types do not leak into the domain layer.

## Week 5 — Hardening, Verification & Load Testing (verify, don't build)

- [x] **T5.1 MikroORM/UoW verification pass** (~2h) — confirm all entities use UoW; entity-level soft-delete `@Filter` (not global ORM filter — removed in T1.4 bugfix); no stray TypeORM; migrations match `fcp-ddl.sql` **modulo intentional divergences** (ADR-046: `workspace_id` on `post_metrics`; ADR-047: `core.audit_logs` not created; app-generated UUID v7 everywhere — no `DEFAULT gen_random_uuid()`). DoD: no unintended schema divergences; CI green.
- [x] **T5.2 Schema audit** (~2h) — no DB id `DEFAULT` on service-owned tables; all `BaseEntity` subclasses have the `createdAt`/`updatedAt`/`deletedAt` triplet; entities intentionally excluding `deletedAt` (WorkspaceMember, Invitation, Plan, Subscription, BillingEvent, service tables matching DDL) are documented exceptions; run `docs/reference/verify-seed.sql` after commenting out rows for `core.audit_logs` (ADR-047); `messaging.*` tables are created in T2.6.5 and require no comment-out. DoD: all active checks pass; no undocumented exceptions.
- [x] **T5.3 PII verification** (~2h) — all tokens via EncryptedText; redaction paths complete; event builders strip PII. DoD: integration run shows no token/email/fullName in logs or event payloads.
- [x] **T5.4 Result-pattern + FK-index pass** (~2h) — every service method returns Result (no domain throw); every real + logical FK indexed (R8). DoD: review/lint clean; schema check lists no unindexed FK.
- [x] **T5.5 Artillery smoke + load** (~3h) — scenarios vs capacity targets (read 150 rps p99 < 300ms; write p99 < 500ms; publish fan-out no DLQ growth; auth/RBAC cache-first). DoD: scenarios run; reports saved under test/load/reports.
- [x] **T5.6 Load-test fixes** (~3h) — address regressions in order: (1) add/fix missing indexes and run `EXPLAIN ANALYZE` on slow queries, (2) optimize MikroORM queries (N+1, pagination), (3) add Redis cache **only** for paths that still miss thresholds after steps 1–2, recording the before/after benchmark in DECISIONS.md. DoD: re-run meets thresholds.
- [x] **T5.7 Buffer** (~4h) — final review, docs sync, demo prep.

---

## Post-T5.7 — Quality & Hardening (19 issues)

> All Week 1–5 tasks are complete. This section tracks production-readiness gaps
> identified after T5.7 final review. Work in order: Critical → High → Medium → Low.
> Each task follows the same ritual: `/start-task <id>` → code → tests →
> `pnpm lint && pnpm test` → update PROGRESS.md → `/finish-task`.

### Critical — Fix Before Any Production Deployment

- [x] **C-1 Outbox recovery job — pending/failed rows never retried** (~3h)
  - `RabbitMqEventBus.publish()` writes a `pending` row then emits. If the process crashes
    between `em.flush()` and `publish()`, the event is permanently lost. No recovery path
    exists for `failed` rows either.
  - Build: `OutboxRelayJob` in `apps/api/src/infrastructure/rabbitmq/jobs/outbox-relay.job.ts`;
    `@Cron(EVERY_30_SECONDS)`; queries `processing_status IN ('pending','failed') AND created_at
    < now() - interval '60 seconds'`; re-publishes via `IEventBus`; marks `processed` on success.
    Must use raw SQL (same pattern as `PostgresMessagingLogRepository`) — never ORM UoW for infra
    logging. Inject `MikroORM` (not `EntityManager`) and fork per run (ADR-030, ADR-054).
  - Migration: add `retry_count integer NOT NULL DEFAULT 0` and `last_retry_at timestamptz` to
    `messaging.event_message_logs`; follow naming `Migration20260XXX_OutboxRetryColumns.ts`.
  - Rules: `CLAUDE.md` §6 (relay job re-publishes already-committed rows ✓), §3 (fork EM);
    `docs/CODING-STANDARDS.md` §9 (JSDoc on job class + `run()`).
  - DoD: job publishes `pending` rows; `failed` rows incremented on error; migration runs cleanly;
    `pnpm lint && pnpm test` green; ADR appended to `docs/DECISIONS.md`.

- [x] **C-2 Fix empty `facebookAccountId` in `PostPublishedEvent`** (~1h)
  - `post.facebookAccount?.id ?? ''` in `PostsService.transitionStatus` falls back to `''` when
    the `Ref<FacebookAccount>` is not populated. `services/analytics` uses this ID to resolve the
    page token; an empty string causes silent analytics sync failure.
  - Fix: add `populate: ['facebookAccount']` to the `findById` call used for status-transition
    fetch, OR assert the ref is loaded and return `err(INTERNAL)` if missing.
  - Rules: `CLAUDE.md` §1 (missing FK is an explicit error, not `''`); §5 (cross-schema logical FK
    must be valid when post is in `publishing` state); BR-F11 (only the FK id in the event,
    never the token value).
  - DoD: `PostPublishedEvent.facebookAccountId` is never `''` for a post with a connected page;
    unit test asserts the error path when account ref is absent; `pnpm test` green.

- [x] **C-3 Graceful shutdown — `app.enableShutdownHooks()` missing from `main.ts`** (~30 min)
  - Without `enableShutdownHooks()`, a `SIGTERM` (k8s pod termination, `docker stop`) cuts
    in-flight HTTP requests and RabbitMQ consumers do not drain, causing message loss.
  - Fix: add `app.enableShutdownHooks()` in `apps/api/src/main.ts` after `NestFactory.create`
    and before `app.startAllMicroservices()`. No new dependency needed — built into NestJS.
  - Rules: verify `pnpm start:dev` still boots cleanly; `docs/CODING-STANDARDS.md` §9 (update
    JSDoc on `bootstrap()` to mention graceful shutdown).
  - DoD: `enableShutdownHooks()` present; dev server starts cleanly; health check spec passes.

### High — Fix Before Production Traffic

- [x] **H-4 Rate limiting — no protection on any endpoint** (~2h)
  - No rate limiting exists. The invite endpoint can be abused to send unlimited emails. Auth and
    webhook endpoints are also unprotected against burst abuse.
  - Run `pnpm view @nestjs/throttler version` → pin → `pnpm add @nestjs/throttler`.
    Add `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` to `AppModule` global imports +
    global `ThrottlerGuard`. Override per-route: invite → 5/min/IP; webhooks → exempt or higher
    limit (HMAC-verified); `DevAuthModule` token endpoint → 10/min.
  - Rules: `CLAUDE.md` (pnpm only, record version); `docs/DECISIONS.md` (ADR: invite limit
    rationale); `docs/CODING-STANDARDS.md` §9 (JSDoc on any new decorators/guards).
  - DoD: throttler wired globally; invite limited to 5/min/IP; `pnpm lint && pnpm test` green;
    ADR in `docs/DECISIONS.md`.

- [x] **H-5 CORS configuration missing from `main.ts`** (~30 min)
  - `app.enableCors()` is absent. All browser cross-origin requests from the web dashboard are
    blocked. Swagger UI at `/api/docs` also fails from a different origin.
  - Fix: add `app.enableCors({ origin: ..., credentials: true, methods: [...] })` in `main.ts`
    reading `ALLOWED_ORIGINS` from `ConfigService`. Add `ALLOWED_ORIGINS=http://localhost:4000`
    to `.env.example`. No new dependency needed.
  - Rules: `CLAUDE.md` guardrails (only CORS in this change); `docs/DECISIONS.md` (ADR: allowed
    origins, credentials: true rationale); BR-F12 (`Authorization` already redacted by Pino).
  - DoD: CORS enabled; `.env.example` updated; `pnpm test` green; ADR appended.

- [x] **H-6 `FacebookTokenExpiringEvent` emitted but never consumed for auto-refresh** (~3h)
  - `FacebookTokenExpiryScheduler` emits `facebook.token_expiring` (routing key). No consumer in
    `apps/api` triggers a token refresh. Token expiry silently breaks publishing.
  - Build: `FacebookTokenExpiryConsumer` in
    `apps/api/src/modules/facebook/consumers/facebook-token-expiry.consumer.ts`; extend
    `IdempotentConsumer`; `@Controller()` + `@EventPattern('facebook.token_expiring')`; call
    `FacebookService.refreshAccountToken(workspaceId, accountId)` inside `withDedup`; return
    `'nack'` on `NOT_FOUND` (permanent); throw on network error (transient → requeue). Register in
    `FacebookModule.controllers`.
  - Rules: `CLAUDE.md` §6 (`refreshAccountToken` handles decrypt→refresh→re-encrypt after flush);
    BR-F11 (no plaintext token returned from `refreshAccountToken`);
    `docs/CODING-STANDARDS.md` §9 (JSDoc on consumer class and handler).
  - DoD: consumer registered in `FacebookModule`; spec covers success, dedup, transient error;
    `pnpm test` green.

- [x] **H-7 Health check is process-only — no dependency probes** (~2h)
  - `GET /api/v1/health` returns `{ status: 'ok' }` if the NestJS process starts. No Postgres,
    Redis, or RabbitMQ probe. Container orchestrators route traffic to unhealthy instances.
  - Run `pnpm view @nestjs/terminus version` → pin → `pnpm add @nestjs/terminus`. Update
    `HealthModule` / `HealthController` to use `HealthCheckService`, a Postgres probe (MikroORM or
    raw ping), `MemoryHealthIndicator`, and a custom Redis ping. Response shape must stay
    backward-compatible: `{ status: 'ok' | 'error', details: {...} }`. Update existing spec to
    mock new indicators.
  - Rules: `CLAUDE.md` (pnpm + pin + ADR); `docs/CODING-STANDARDS.md` §9 (JSDoc on controller
    and indicators).
  - DoD: endpoint probes Postgres + Redis; returns 503 on dependency failure; `pnpm test` green;
    ADR in `docs/DECISIONS.md`.

- [ ] **H-8 Internal routes have no network isolation — only shared secret header** (~1h)
  - `/internal/*` endpoints are protected only by `x-internal-secret`. If `apps/api` is
    internet-accessible these endpoints are reachable from the public internet. No ingress rule
    blocks public access.
  - Required: record in `docs/DECISIONS.md` — "Internal routes (`/internal/*`) must be blocked at
    the ingress/LB from public traffic; `x-internal-secret` is secondary defence only." Optional
    code hardening: add CIDR whitelist check in `InternalSecretGuard`.
  - Rules: `CLAUDE.md` guardrails (do not refactor outside scope); `docs/CODING-STANDARDS.md` §9
    (update `InternalSecretGuard` JSDoc to explain dual-layer model); `docs/DECISIONS.md` (ADR).
  - DoD: ADR in `docs/DECISIONS.md`; `InternalSecretGuard` JSDoc updated; `pnpm lint` clean.

### Medium — Fix Before Scale Validation

- [ ] **M-9 No correlation ID / distributed trace across HTTP requests and events** (~3h)
  - When a `PostCreatedEvent` fails in `services/search` three hops from the HTTP request, there
    is no shared ID to correlate log entries across services and the event bus.
  - Build: add `traceId: string` (UUID v7) to the `DomainEvent` abstract class in
    `event-bus.port.ts`. Add a NestJS middleware that generates a `requestId` and assigns it to
    the Pino logger context (`logger.assign({ requestId })`). Pass `requestId` as `traceId` when
    constructing domain events in service methods. Consumers log `traceId` on every handler.
    Do NOT add OpenTelemetry SDK without measuring overhead — record decision in `docs/DECISIONS.md`.
  - Rules: `CLAUDE.md` §2 (UUID v7 for `traceId`); §1 (middleware must not throw for domain
    errors); `docs/CODING-STANDARDS.md` §9 (JSDoc on updated `DomainEvent` abstract class).
  - DoD: `DomainEvent.traceId` populated in all event emissions; Pino logs include `requestId`
    on HTTP path; all event spec mocks updated; `pnpm test` green.

- [ ] **M-10 Pagination missing from `listMembers` and `listForUser`** (~3h)
  - `WorkspaceService.listMembers` and `WorkspaceService.listForUser` return all records in one
    query, inconsistent with the paginated posts list (T5.6). An agency with 200 members returns
    the full set unbounded.
  - Build: keyset cursor pagination (same cursor: `base64url(JSON({ createdAt, id }))`) on
    `IWorkspaceMemberRepository.findAllByWorkspaceId` and `IWorkspaceRepository.findAllByUserId`.
    Update `WorkspaceController` to accept `?limit=&cursor=` query params. Add
    `ListWorkspaceMembersQueryDto` + `WorkspaceMembersPageDto` (matching the `PostsPageDto` shape).
    Verify endpoint URL against `docs/reference/fcp-api-documentation.docx`.
  - Rules: `CLAUDE.md` §1 (pagination returns `Result<Page, AppError>`); §2 (UUID v7 as cursor
    component); `docs/CODING-STANDARDS.md` §9 (JSDoc on new DTOs + updated port methods).
  - DoD: `GET /workspaces/:id/members` paginated; response shape matches `PostsPageDto`; `pnpm test`
    green.

- [ ] **M-11 Missing query indexes for quota count and publish cron** (~1h)
  - `postRepo.countByWorkspace(workspaceId)` runs on every `createPost` without a partial index on
    `workspace_id WHERE deleted_at IS NULL`. `PublishJob` queries `WHERE status='scheduled' AND
    scheduledAt <= now()` without a composite index.
  - Migration `Migration20260XXX_PerfIndexesV2.ts`:
    ```sql
    CREATE INDEX idx_posts_workspace_active ON core.posts (workspace_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX idx_posts_scheduled_due ON core.posts (status, scheduled_at)
      WHERE status = 'scheduled' AND deleted_at IS NULL;
    ```
    Check `Migration20260715000001_PerfIndexes.ts` first to avoid duplicate indexes.
  - Rules: `CLAUDE.md` (`pnpm mikro-orm migration:create` then edit; `migration:up` to apply);
    `docs/reference/fcp-ddl.sql` (schema reference); `docs/CODING-STANDARDS.md` §5 / R8
    (every FK and query-pattern column indexed).
  - DoD: migration runs cleanly; `EXPLAIN ANALYZE` on both queries confirms index scan.

- [ ] **M-12 Invitation acceptance endpoint is internal-only — needs a public route** (~2h)
  - `WorkspaceService.acceptInvitation()` is implemented (T2.8) but the only HTTP surface is
    `InternalInvitationController`. Invitation acceptance must be triggered by an invited user
    clicking an email link — requiring a **public** authenticated endpoint.
  - Build: `POST /workspaces/:workspaceId/invitations/:token/accept` in `WorkspaceController`;
    body `{ token: string }`; `ClerkAuthGuard` only (no `WorkspaceRolesGuard` — user not yet a
    member; token is the credential); calls `WorkspaceService.acceptInvitation(...)`; returns 201
    with `WorkspaceMemberDto`. Verify URL matches `docs/reference/fcp-api-documentation.docx`.
  - Rules: `CLAUDE.md` §1 (Result pattern); §7 (`MemberJoinedEvent` already emitted by service);
    BR-F03 (expiry validation already in service); `docs/CODING-STANDARDS.md` §9 (JSDoc on
    new controller method).
  - DoD: endpoint reachable at documented URL; expired token → 400; already-accepted → 409;
    `pnpm test` green with new spec.

- [ ] **M-13 `scheduledAt` not validated as strict ISO 8601 UTC at DTO layer** (~1h)
  - `scheduledAt` validates as a future datetime but accepts `2026-08-01T10:00:00` (no timezone
    offset), which is silently interpreted as server local time instead of UTC.
  - Fix: add `@IsISO8601({ strict: true })` to `scheduledAt` in `CreatePostDto` and
    `UpdatePostStatusDto`. Update `@ApiProperty` description to require timezone offset.
    Add unit test asserting `2026-08-01T10:00:00` (no offset) → 400 and
    `2026-08-01T10:00:00.000Z` → passes.
  - Rules: `docs/reference/fcp-api-documentation.docx` general info ("Timestamps: ISO 8601 UTC");
    BR-F06 (`scheduledAt` must be future); `CLAUDE.md` §1 (VALIDATION_ERROR → 400);
    `docs/CODING-STANDARDS.md` §9 (JSDoc on `scheduledAt` in DTOs).
  - DoD: missing timezone offset rejected with 400; unit test green; `pnpm test` green.

- [ ] **M-14 No explicit timeout config or fail-open fallback on downstream HTTP** (~3h)
  - `FetchHttpClientAdapter` uses `AbortSignal.timeout(5000)` (ADR-065). Verify all adapter paths
    are covered. Add configurable per-path timeouts and a fail-open fallback for
    `BillingQuotaAdapter` — billing outage must not block post creation entirely.
  - Fix: expose `timeoutMs` via `HTTP_CLIENT_TIMEOUT_MS` in `ConfigService` (read in adapter
    constructor; default 3000ms reads, 5000ms writes). In `BillingQuotaAdapter.getPostLimit`:
    catch `DownstreamServiceError(503)` and return `ok(FREE_PLAN_LIMIT)` with a warning log —
    hardcoded constant, NOT a Redis cache (safe before T5.5 results). Add `HTTP_CLIENT_TIMEOUT_MS`
    to `.env.example`.
  - Rules: `CLAUDE.md` §1 (timeout → `err(AppError.serviceUnavailable(...))`, not unhandled throw);
    `CLAUDE.md` guardrails (fail-open limit is a constant — not Redis cache before T5.5);
    `docs/DECISIONS.md` (ADR: timeout values, fail-open quota strategy);
    `docs/CODING-STANDARDS.md` §9 (JSDoc on updated `FetchHttpClientAdapter`).
  - DoD: timeout configurable; `BillingQuotaAdapter` returns `FREE_PLAN_LIMIT` on 503; unit test
    covers fail-open path; `pnpm test` green; ADR appended.

### Low — Polish & Documentation

- [ ] **L-15 Swagger missing `@ApiBadRequestResponse` on `PATCH /posts/:id/status`** (~30 min)
  - `PATCH /posts/:id/status` can return 400 (`VALIDATION_ERROR`) when `scheduledAt` is missing or
    in the past. Only `@ApiConflictResponse` is documented; the 400 path is invisible in Swagger UI.
  - Fix: add `@ApiBadRequestResponse({ description: 'scheduledAt missing or not a future datetime
    (BR-F06, VALIDATION_ERROR)' })` to `PostsController.transitionStatus`. Check `createPost` too —
    `PLAN_LIMIT_EXCEEDED` → 409 description should mention the code explicitly.
  - Rules: `docs/reference/fcp-api-documentation.docx` (all error responses documented in Swagger);
    `docs/CODING-STANDARDS.md` §9 (Swagger decorators are part of exported-code docs). No new tests.
  - DoD: Swagger UI shows 400 on `PATCH /posts/:id/status`; `pnpm lint` clean.

- [ ] **L-16 API versioning strategy not defined or documented** (~30 min)
  - Routes use `api/v1` prefix. No policy exists for introducing `v2` endpoints. Without a defined
    strategy, the first breaking change forces full controller duplication.
  - Append ADR to `docs/DECISIONS.md` defining: (1) additive changes are non-breaking — no version
    bump; (2) breaking changes require `v2` via NestJS `@Version('2')` on specific controller
    methods only, not a full duplicate module; (3) `v1` supported N months after `v2` launch.
    No code changes needed at this stage.
  - Rules: `CLAUDE.md` ("when you make a notable choice, append a one-line ADR");
    `docs/reference/fcp-api-documentation.docx` (API version is `v1` — upgrade path needed);
    `docs/DECISIONS.md` (mandatory location).
  - DoD: ADR in `docs/DECISIONS.md` with the versioning policy; no code change needed.

- [ ] **L-17 Workspace soft-delete policy undefined** (~30 min)
  - `Workspace` has `deletedAt` (from `BaseEntity`) but no delete endpoint and no retention job.
    It is unclear if this is permanently out-of-scope or deferred.
  - Choose: Option A — permanently out-of-scope (record in ADR). Option B — deferred, with
    cascade domain events + 90-day retention job (record ADR + add placeholder task in TASKS.md
    with full scope: endpoint, cascade events, retention job, e2e test).
  - Rules: `CLAUDE.md` §3 (soft delete only; hard purge via retention jobs); §7 (audit trail —
    `WorkspaceDeletedEvent` needed if Option B); BR-R02 (sole-owner edge case when workspace deleted);
    `docs/DECISIONS.md` (mandatory ADR for either choice).
  - DoD: ADR in `docs/DECISIONS.md`; if Option B, placeholder task appended to TASKS.md; no
    code change needed for Option A.

- [ ] **L-18 `PublishFallbackPollJob` threshold undocumented** (~30 min)
  - The threshold (how long to wait in `publishing` before polling Facebook to confirm) is not
    documented. Too short risks a race with the webhook consumer; too long leaves users seeing
    stale `publishing` status.
  - Read `apps/api/src/modules/posts/jobs/publish-fallback-poll.job.ts`. Document in the job's
    JSDoc: the threshold value, why it was chosen, the poll mechanism, and how the state machine
    guard prevents a double-transition race with the webhook consumer. Record the threshold in
    `docs/DECISIONS.md`. Verify the job uses a forked EM (ADR-030/054).
  - Rules: `docs/CODING-STANDARDS.md` §9 (the WHY of the threshold is exactly the non-obvious
    constraint that belongs in a comment); `CLAUDE.md` ("when you make a notable choice, append ADR").
  - DoD: JSDoc on `PublishFallbackPollJob` class + `run()` explains threshold and race handling;
    ADR in `docs/DECISIONS.md`; `pnpm lint` clean.

- [ ] **L-19 `DevAuthModule` token compatibility with `ClerkAuthGuard` unverified** (~1h)
  - `ClerkAuthGuard` calls `verifyToken(token, { secretKey: CLERK_SECRET_KEY })`. For a
    `DevAuth`-issued token to pass, it must be a real Clerk JWT. This is unverified.
  - Verify: read `dev-auth.service.ts` + `dev-auth.controller.ts`. If `DevAuthModule` creates a
    custom JWT (not via Clerk SDK), the guard will reject it in any real dev environment.
  - If fix needed — Option A: use Clerk SDK to mint a real session token for a seeded test user.
    Option B: `ClerkAuthGuard` dev bypass — non-production accepts tokens signed with
    `DEV_JWT_SECRET` without calling Clerk. The bypass must be zero-footprint in production
    (conditionally compiled, same pattern as `DevAuthModule` DI exclusion on `NODE_ENV=production`).
  - Rules: security — bypass must not exist at all in production builds; `docs/DECISIONS.md`
    (ADR: chosen approach + security rationale); `docs/CODING-STANDARDS.md` §9 (JSDoc on new
    guards or bypass logic).
  - DoD: finding documented in `docs/DECISIONS.md`; if fix needed, implemented with spec;
    `pnpm test` green.

---

## Three-Transport Migration (TM.1 – TM.12)

> Migrates all internal sync `apps/api → service` communication from HTTP to TCP
> `@MessagePattern` (ADR-094). Async RabbitMQ events are unchanged.
> Run tasks in order: TM.1 (foundation) → TM.2/3 (billing) → TM.4/5 (analytics) →
> TM.6/7 (search) → TM.8/9 (notification) → TM.10/11 (audit) → TM.12 (cleanup).
>
> Each pair is: (even) service adds `@MessagePattern`, (odd) `apps/api` swaps adapter to TCP.
> Migrate and test one service pair before moving to the next.
>
> **Reference:** ADR-094 in `docs/DECISIONS.md` · Canonical patterns in `docs/CODING-STANDARDS.md` §15.

- [ ] **TM.1 Foundation — ADR + TCP env vars + `docker-compose` TCP ports** (~1h)
  - Record ADR-094 in `docs/DECISIONS.md` ✅ (already done).
  - Add TCP port env vars to `.env.example`:
    ```
    BILLING_TCP_PORT=4001   BILLING_TCP_HOST=localhost
    ANALYTICS_TCP_PORT=4002 ANALYTICS_TCP_HOST=localhost
    AUDIT_TCP_PORT=4003     AUDIT_TCP_HOST=localhost
    SEARCH_TCP_PORT=4004    SEARCH_TCP_HOST=localhost
    NOTIFICATION_TCP_PORT=4005 NOTIFICATION_TCP_HOST=localhost
    ```
  - In `docker-compose.yml`: expose each TCP port on the service container (e.g.
    `billing: ports: ["4001:4001"]`). Services on the same Docker network can communicate
    on any port; exposure is needed for host-to-container TCP (local dev without Docker).
  - No new package needed — `@nestjs/microservices` and `Transport.TCP` are already in all
    packages from TR.1.
  - No shared `libs/tcp-options/` factory needed — TCP options are two fields (`host`, `port`),
    unlike RMQ which has 8+ fields. Inline in each `main.ts`.
  - Rules: `CLAUDE.md` §8 (Three-Transport Model); `docs/CODING-STANDARDS.md` §15 (TCP patterns).
  - DoD: `.env.example` has all 10 TCP vars; `docker-compose.yml` exposes ports 4001–4005; `pnpm lint` clean.

- [ ] **TM.2 `services/billing` — add TCP `@MessagePattern` handlers** (~2h)
  - Add `app.connectMicroservice({ transport: Transport.TCP, options: { host: '0.0.0.0', port: BILLING_TCP_PORT } })`
    in `main.ts` alongside the existing RMQ transport (ADR-084 hybrid bootstrap pattern).
  - Create `apps/api/src/modules/billing/billing.message-controller.ts` with:
    - `@MessagePattern('billing.get-quota')` → `BillingService.getPostLimit(workspaceId)` → `{ limit }`
    - `@MessagePattern('billing.get-subscription')` → `BillingService.findSubscription(workspaceId)` → `SubscriptionResponse`
    - `@MessagePattern('billing.checkout')` → `BillingService.createCheckoutSession(workspaceId, planCode)` → `CheckoutResponse`
    - Each handler: `result.match(ok → return plain object, err → throw new RpcException({ code, message }))`
  - Register in `BillingModule.controllers[]`. Keep HTTP server (Stripe webhook, redirect controller).
  - Rules: `docs/CODING-STANDARDS.md` §15 (handler shape); `CLAUDE.md` §1 (Result pattern);
    `docs/DECISIONS.md` ADR-094.
  - DoD: `BillingMessageController` registered; all 3 patterns respond correctly; spec covers ok + RpcException
    paths for each; `pnpm test` green in `services/billing`.

- [ ] **TM.3 `apps/api` → billing TCP adapter** (~2h)
  - Create `apps/api/src/modules/billing/adapters/billing-tcp.adapter.ts` implementing `IBillingClient`
    (same port as old `BillingHttpClientAdapter`). Inject `@Inject(BILLING_TCP_CLIENT) ClientProxy`.
    Each method: `firstValueFrom(client.send('billing.*', dto).pipe(timeout(3_000)))` → map result;
    catch `RpcException` → `new AppError(...)`; other errors → `AppError.serviceUnavailable('billing')`.
  - Add `ClientsModule.registerAsync([{ name: BILLING_TCP_CLIENT, Transport.TCP, host, port }])` in
    `BillingModule`. Provider binding: `{ provide: IBillingClient, useClass: BillingTcpAdapter }`.
  - Update `BillingQuotaAdapter` to call the same `IBillingClient` port (no change needed if it
    already uses the port, or fold into `BillingTcpAdapter`).
  - Remove `FetchHttpClientAdapter` + `IHttpClient` binding from `BillingModule` (no longer needed
    for billing). Keep `BILLING_SERVICE_URL` only for `BillingRedirectController` (Stripe browser
    redirect; not a service-to-service call).
  - Rules: `docs/CODING-STANDARDS.md` §15 (adapter shape); `CLAUDE.md` §1 (Result pattern);
    ADR-080 (`ClientsModule` in same module as adapter).
  - DoD: `BillingTcpAdapter` wired; `BillingModule` has no `FetchHttpClientAdapter`; billing
    controller specs pass with mocked `IBillingClient`; `pnpm test` green in `apps/api`.

- [ ] **TM.4 `services/analytics` — add TCP `@MessagePattern` handlers** (~2h)
  - Add TCP transport in `main.ts` (alongside existing RMQ). Port: `ANALYTICS_TCP_PORT`.
  - Create `analytics.message-controller.ts` with:
    - `@MessagePattern('analytics.workspace-metrics')` → `AnalyticsService.getWorkspaceMetrics(workspaceId)`
    - `@MessagePattern('analytics.post-metrics')` → `AnalyticsService.getPostMetrics(postId)`
  - Register in `AnalyticsModule.controllers[]`. Keep `@EventPattern('posts.published')` consumer.
  - HTTP server: can be removed (no external clients) — change `app.listen(port)` to TCP-only hybrid
    OR keep for health check / ops. Decision to document in DoD.
  - Rules: `docs/CODING-STANDARDS.md` §15; ADR-094.
  - DoD: message controller registered; spec covers ok + RpcException; `pnpm test` green in
    `services/analytics`.

- [ ] **TM.5 `apps/api` → analytics TCP adapter** (~1h)
  - Create `analytics-tcp.adapter.ts` implementing `IAnalyticsClient`. Two methods:
    `getWorkspaceMetrics(workspaceId)` and `getPostMetrics(postId)` — both `client.send(...).pipe(timeout(3_000))`.
  - Add `ANALYTICS_TCP_CLIENT` + `ClientsModule.registerAsync` in `AnalyticsModule`.
  - Swap provider binding from `AnalyticsHttpClientAdapter` to `AnalyticsTcpAdapter`.
  - Remove `AnalyticsHttpClientAdapter` and its `IHttpClient` dependency from `AnalyticsModule`.
  - Rules: `docs/CODING-STANDARDS.md` §15; ADR-080.
  - DoD: analytics controller specs pass with mocked `IAnalyticsClient`; `pnpm test` green in `apps/api`.

- [ ] **TM.6 `services/search` — replace HTTP with TCP `@MessagePattern`** (~2h)
  - Add TCP transport in `main.ts`. Port: `SEARCH_TCP_PORT`.
  - Create `search.message-controller.ts` with `@MessagePattern('search.query')` →
    `SearchService.search(workspaceId, query)` → `SearchResultDto[]`.
  - Register in `SearchModule.controllers[]` alongside 5 `@EventPattern` consumers.
  - Remove HTTP server entirely — `services/search` has no external clients or webhooks.
    Change bootstrap from `NestFactory.create + app.listen` to TCP+RMQ hybrid without HTTP:
    the `app.listen()` call can be omitted if no HTTP port is needed. Document the decision.
  - Remove `SearchController` (existing HTTP GET /search) — no external HTTP needed.
  - Rules: `docs/CODING-STANDARDS.md` §15; ADR-094; `pnpm lint` (no unused imports).
  - DoD: search query responds via TCP; no HTTP server started; 5 RMQ consumers still active;
    `pnpm test` green in `services/search`.

- [ ] **TM.7 `apps/api` → search TCP adapter** (~1h)
  - Create `search-tcp.adapter.ts` implementing `ISearchClient`.
  - Add `SEARCH_TCP_CLIENT` + `ClientsModule.registerAsync` in `SearchModule`.
  - Swap provider binding from `SearchHttpClientAdapter` to `SearchTcpAdapter`.
  - Remove `SearchHttpClientAdapter` and `IHttpClient` from `SearchModule`.
  - Rules: `docs/CODING-STANDARDS.md` §15; ADR-080.
  - DoD: search controller spec passes with mocked `ISearchClient`; `pnpm test` green in `apps/api`.

- [ ] **TM.8 `services/notification` — add TCP `@MessagePattern` handlers** (~2h)
  - Add TCP transport in `main.ts`. Port: `NOTIFICATION_TCP_PORT`.
  - Create `notification.message-controller.ts` with:
    - `@MessagePattern('notification.list')` → `NotificationService.getNotifications(workspaceId, userId)`
    - `@MessagePattern('notification.mark-read')` → `NotificationService.markRead(notificationId)` — BR-F08
      (read_status one-way; handler returns `'nack'` / `RpcException` on revert attempt)
  - Register in `NotificationModule.controllers[]` alongside all 11 `@EventPattern` consumers.
  - Remove HTTP server (no external clients). `WorkspaceMemberReconciler.onModuleInit` still calls
    apps/api's `/internal/workspaces/:id/members` via HTTP — this is the reverse direction and stays HTTP.
  - Rules: `docs/CODING-STANDARDS.md` §15; BR-F08 (one-way read status); ADR-094.
  - DoD: both patterns respond via TCP; 11 RMQ consumers still active; spec covers ok + RpcException
    + BR-F08 revert attempt → RpcException; `pnpm test` green in `services/notification`.

- [ ] **TM.9 `apps/api` → notification TCP adapter** (~1h)
  - Create `notification-tcp.adapter.ts` implementing `INotificationClient`.
  - Add `NOTIFICATION_TCP_CLIENT` + `ClientsModule.registerAsync` in `NotificationModule`.
  - Swap from `NotificationHttpClientAdapter` to `NotificationTcpAdapter`.
  - Remove `NotificationHttpClientAdapter` and `IHttpClient` from `NotificationModule`.
  - Rules: `docs/CODING-STANDARDS.md` §15; ADR-080.
  - DoD: notification controller spec passes; `pnpm test` green in `apps/api`.

- [ ] **TM.10 `services/audit` — add TCP `@MessagePattern` handlers** (~2h)
  - Add TCP transport in `main.ts`. Port: `AUDIT_TCP_PORT`.
  - Create `audit.message-controller.ts` with:
    - `@MessagePattern('audit.get-logs')` → `AuditService.getWorkspaceAuditLogs(workspaceId, cursor, limit)`
    - `@MessagePattern('audit.get-log')` → `AuditService.getAuditEvent(auditId)`
  - Register in `AuditModule.controllers[]` alongside `@EventPattern('#')` wildcard consumer.
  - Remove HTTP server (no external clients). MongoDB connection is internal — no change.
  - Rules: `docs/CODING-STANDARDS.md` §15; ADR-094; `CLAUDE.md` §7 (audit read-only via apps/api).
  - DoD: both patterns respond via TCP; wildcard RMQ consumer still active; spec covers ok +
    RpcException + NOT_FOUND path; `pnpm test` green in `services/audit`.

- [ ] **TM.11 `apps/api` → audit TCP adapter** (~1h)
  - Create `audit-tcp.adapter.ts` implementing `IAuditClient`.
  - Add `AUDIT_TCP_CLIENT` + `ClientsModule.registerAsync` in `AuditModule`.
  - Swap from `AuditHttpClientAdapter` to `AuditTcpAdapter`.
  - Remove `AuditHttpClientAdapter` and `IHttpClient` from `AuditModule`.
  - Rules: `docs/CODING-STANDARDS.md` §15; ADR-080.
  - DoD: audit controller spec passes; `pnpm test` green in `apps/api`.

- [ ] **TM.12 Cleanup + full test pass** (~2h)
  - Remove `FetchHttpClientAdapter` and `IHttpClient` from `apps/api` entirely — after TM.3/5/7/9/11
    no `apps/api` module uses them for outbound calls. (Services' internal `InternalApiHttpAdapter`
    files are separate — they are not `apps/api`'s `FetchHttpClientAdapter`.)
  - Remove `*_SERVICE_URL` env vars from `apps/api`'s usage for services that migrated to TCP
    (`ANALYTICS_SERVICE_URL`, `SEARCH_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `AUDIT_SERVICE_URL`).
    Keep `BILLING_SERVICE_URL` only if referenced by `BillingRedirectController` (Stripe browser
    redirect — that is a URL template, not an internal HTTP call).
  - Update `apps/api/src/infrastructure/` comment in §10 (CODING-STANDARDS.md is already updated).
  - Remove `common/http/fetch-http-client.adapter.ts` and `common/http/http-client.port.ts` from
    `apps/api` if no other modules reference them. If `DownstreamServiceError` is still needed
    by some path, keep the error class but delete the adapter.
  - Run `pnpm -r lint && pnpm -r test` across all 8 packages.
  - Run `pnpm load:smoke` against a live stack to confirm no regressions.
  - Update `docs/PROGRESS.md` to note Three-Transport Migration complete.
  - Rules: `CLAUDE.md` guardrails (do not delete if still referenced); `docs/CODING-STANDARDS.md`
    §15; ADR-094.
  - DoD: `grep -r 'FetchHttpClientAdapter\|IHttpClient' apps/api/src` returns zero results
    (or only the class definition files if retained for future use); all `*_SERVICE_URL` internal
    vars removed from `apps/api` env usage; `pnpm -r test` green across all packages;
    `pnpm load:smoke` passes.

---

## Adding a task

Append under the right week with: a one-line scope, the relevant business
rules / endpoints, a time estimate (~Xh), and a concrete DoD. Keep tasks <= ~1 day;
split if bigger. Put foundational/cross-cutting concerns in Week 1, features after,
validation last.
