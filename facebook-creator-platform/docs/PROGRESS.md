# Progress Log

> Claude updates this after every task. The **Resume point** is the first thing
> to read at the start of a session. Newest entries on top.

## Resume point
- **Next task:** `T3.3` — Analytics service scaffold (`services/analytics/`). DoD: consumer on `posts.published` → Graph API fetch → `post_metrics` upsert; HTTP `GET /workspaces/:id/metrics` + `GET /posts/:id/metrics`; tests.
- **Branch:** `nestjs-practice`
- **Notes:** 187 tests passing (169 apps/api + 18 services/billing). Run `pnpm migration:billing` then apply `Migration20260703000002_BillingEvents` (`cd services/billing && pnpm mikro-orm migration:up`) to create `billing.billing_events`. Set `STRIPE_WEBHOOK_SECRET` env var before using `POST /api/v1/webhooks/stripe`.
- **Pre-T2 follow-up (not in T1.5 DoD):** `acceptInvitation` endpoint — infrastructure ready; deferred.

## Log

### 2026-07-03 — T3.2 Billing state machine + Stripe webhook (addendum: TypeScript fixes)

**TypeScript diagnostic fixes (resolved follow-up from prior session):**
- `Ref<Plan>` property access (`sub.plan.code`, `.postLimit`) — replaced all occurrences with `unref(sub.plan).code` / `.postLimit` using MikroORM 7's `unref()` helper (see ADR-044). `unref()` returns the entity as-is if already unwrapped, so test helpers assigning plain objects still work.
- Stripe SDK v22 `Invoice.subscription` — the top-level field was removed in v22; subscription ID is now at `invoice.parent?.subscription_details?.subscription` (ADR-045). Updated both `handleInvoicePaymentSucceeded` and `handleInvoicePaymentFailed` + the corresponding spec event mocks.
- `SubscriptionActivatedPayload as Record<string, unknown>` — changed to `as unknown as Record<string, unknown>` (two non-overlapping interfaces require the intermediate unknown cast).
- Removed `IBillingEventRepository` from `BillingService` constructor (it was unused — idempotency check lives in `BillingWebhookController`). Updated spec to match.
- Spec: `vi.fn<Parameters<IStripeProvider['createCheckoutSession']>>()` → `vi.fn()` (Vitest 4 does not accept parameter-tuple as type arg); config mock `fallback: string` → `fallback: unknown`.
- Tests after fixes: 187/187 (18 billing + 169 api). Lint: clean.

**`libs/billing-contracts`** — added `SubscriptionActivatedPayload` + `SubscriptionCancelledPayload` event types (no PII); exported from `index.ts`.

**`services/billing` (state machine):**
- `ALLOWED_TRANSITIONS` guard table + `BillingService.transitionSubscription` — synchronous guard returning `Result`; persists `billing_events` row (from/to/workspaceId/planCode) in same UoW; caller owns `em.flush()`.
- BR-F10 free-plan guard inside `transitionSubscription` — free plan cannot enter `grace_period` or `cancelled`.
- `handleStripeEvent` routes: `checkout.session.completed` (update stripeIds), `invoice.payment_succeeded` (trialing/grace_period → active), `invoice.payment_failed` (active → grace_period), `customer.subscription.deleted` (→ cancelled). Unknown event types → no-op ok.
- Publishes `billing.subscription_activated` / `billing.subscription_cancelled` after `em.flush()` (§6).

**`services/billing` (webhook):**
- `BillingWebhookController POST /api/v1/webhooks/stripe` — reads `req.rawBody`; verifies `Stripe-Signature` header with `IStripeProvider.verifyWebhookSignature` (Stripe SDK `webhooks.constructEvent`, constant-time HMAC); idempotency check on `billing_events.stripe_event_id` before processing; returns 200.
- `rawBody: true` added to `NestFactory.create` in `main.ts`.

**New entities / ports / adapters:**
- `BillingEvent` entity (`billing.billing_events`); `IBillingEventRepository` port; `MikroOrmBillingEventRepository`.
- `IBillingEventBus` port; `BillingRabbitMqAdapter` (AmqpConnection.publish, publisher-only, `enableControllerDiscovery: false`).
- `IStripeProvider.verifyWebhookSignature` added; `ISubscriptionRepository.findByStripeSubscriptionId` added.
- `Migration20260703000002_BillingEvents` — `billing.billing_events` with UNIQUE on `stripe_event_id` (BR-R04) + 2 indexes.
- `RabbitMQModule.forRootAsync` added to `services/billing/app.module.ts`.

**`apps/api`:** `BillingSubscriptionConsumer` — idempotent placeholder consumers on `api.billing.subscription_activated` + `api.billing.subscription_cancelled` (durable, DLX → `fcp.dlq`); extends `IdempotentConsumer`; logs only (full logic in T4.2/T4.3).

- Tests: 18 services/billing (12 new state machine + handleStripeEvent tests), 169 apps/api. Total 187/187. Lint: clean.
- **Setup required:** `cd services/billing && pnpm mikro-orm migration:up` + add `STRIPE_WEBHOOK_SECRET=whsec_...` to `.env`.

### 2026-07-03 — T3.1 (addendum) — `@fcp/billing-contracts` shared library

- **`libs/billing-contracts/`** (new workspace package) — plain TypeScript interfaces only; no NestJS/ORM deps.
  - `CheckoutRequest`, `CheckoutResponse` — HTTP boundary shape for `POST /checkout`.
  - `QuotaResponse` — HTTP boundary shape for `GET /workspaces/:id/quota`.
  - `BillingErrorCode`, `BillingErrorResponse` — wire error shape so consumers can deserialise without guessing.
- **`pnpm-workspace.yaml`** — added `libs/*` glob.
- **`services/billing`** updated: `CreateCheckoutDto implements CheckoutRequest`; `AppError.code` typed as `BillingErrorCode`; `toHttpException` response body typed as `BillingErrorResponse`.
- **`apps/api`** updated: `IBillingHttpClient` methods use `CheckoutRequest`/`CheckoutResponse`; adapter casts quota response to `QuotaResponse`; `BillingController` return type uses `CheckoutResponse`.
- Decision: `libs/billing-client` deferred until a second caller (analytics, notification) needs it — ADR-039.
- Tests: 175/175. Lint: clean.

### 2026-07-03 — T3.1 Plans + subscriptions + Stripe checkout (architecture corrected)

**Architecture correction (ADR-032/033):** Initial T3.1 built billing inside `apps/api/src/modules/billing/`.
Corrected after reviewing ERD (`fcp-database.d2`): billing is `billing-service`, separate from `core (apps/api)`.
Moved all billing domain code to `services/billing/`. `apps/api` now holds a thin HTTP proxy only.

**`services/billing/` (new NestJS app, `@fcp/billing`):**
- `Plan` entity (`billing.plans`) — uuid v7 pk; no `deletedAt` (ADR-036).
- `Subscription` entity (`billing.subscriptions`) — uuid v7 pk; `workspaceId` logical FK (scalar + `@Index`, BR-R06/R08); `plan` real FK; `status` state; factory `Subscription.create(workspaceId, plan)`.
- Ports: `IPlanRepository`, `ISubscriptionRepository`, `IStripeProvider`.
- `StripeAdapter` — `stripe.checkout.sessions.create`, stores `workspaceId` in metadata for T3.2.
- `BillingService` — `getPostLimit(workspaceId)` + `createCheckoutSession(workspaceId, planCode)`.
- HTTP endpoints: `POST /checkout`, `GET /workspaces/:id/quota`.
- Migration `Migration20260703000001_BillingSchema` — `billing` schema + tables + 3 seeded plans (ADR-037).
- Port: 3001 (configurable via `BILLING_PORT` env var).
- Tests: 6 (service ×6).

**`apps/api` thin proxy (no entities/migrations):**
- `BillingHttpClientAdapter` — wraps `fetch` to `BILLING_SERVICE_URL` (default: `http://localhost:3001`).
- `BillingQuotaAdapter` — implements `IPostQuotaProvider` via HTTP; falls back to 10 on outage.
- `BillingController` — `POST /workspaces/:id/billing/checkout` with Clerk JWT + role guard, forwards to billing service.
- `PostsModule` imports `BillingModule` and receives `IPostQuotaProvider` from it.

**Root workspace:** `pnpm test` changed to `pnpm -r test` (runs apps/api + services/billing in parallel). 175/175 tests passing. Lint: clean. `stripe` removed from `apps/api`; `@mikro-orm/decorators` added to `services/billing`.

**Setup required:** `pnpm migration:billing` (or `cd services/billing && pnpm mikro-orm migration:up`) to apply `Migration20260703000001_BillingSchema`.

### 2026-07-03 — T2.7 Facebook webhooks

- **`verifyWebhookSignature(rawBody, sigHeader)`** added to `IFacebookOAuthProvider` port + `FacebookOAuthAdapter` — strips `sha256=` prefix, `createHmac('sha256', appSecret).update(rawBody)`, `timingSafeEqual` with hex buffers.
- **`FacebookWebhookPayload` type + `processWebhookPayload(rawBody, sigHeader, payload)`** added to `FacebookService` — HMAC check → `err(FORBIDDEN)`; iterates `entry[].changes[]`; publishes `FacebookFeedEvent` (field=feed, verb=add) or `FacebookPageDeauthorizedEvent` (field=page); `IEventBus` added as dependency.
- **`POST /webhooks/facebook`** added to `FacebookWebhookController` — unguarded; reads raw body from `req.rawBody`; delegates to `processWebhookPayload`; returns HTTP 200 (Facebook requires 200 within 20s).
- **Two new domain events:** `FacebookFeedEvent` (`routingKey = 'facebook.feed'`) and `FacebookPageDeauthorizedEvent` (`routingKey = 'facebook.page.deauthorized'`).
- **`FacebookFeedConsumer`** (`posts/consumers/`) — `@RabbitSubscribe` on `api.facebook.feed` (durable, DLX → `fcp.dlq`); `orm.em.fork()` per message (ADR-030); finds `Post` by `facebookGraphPostId` in `publishing` state; sets `status=published`, `publishedAt=now()`; flushes; emits `PostPublishedEvent` after flush (§6).
- **`FacebookPageDeauthorizedConsumer`** (`facebook/consumers/`) — `@RabbitSubscribe` on `api.facebook.deauthorized`; finds `FacebookAccount` by `pageId`; `em.transactional` — sets `account.deletedAt=now()` + `nativeUpdate(Post, …, {status:'failed'})` for `scheduled`/`publishing` posts (§13 cross-module entity access).
- **`FacebookAccount.deletedAt`** added + `Migration20260703000000_FacebookAccountSoftDelete` (ADR-031). `findByPageId` updated to filter `{ deletedAt: null }`.
- Tests: 12 new (service ×4, feed consumer ×4, deauth consumer ×4). 169/169 total. Lint: clean.
- **Setup required:** `pnpm mikro-orm migration:up` to apply `Migration20260703000000_FacebookAccountSoftDelete`.

### 2026-07-03 — T2.6 RabbitMQ event infrastructure

- **`RabbitmqModule`** (`src/infrastructure/rabbitmq/rabbitmq.module.ts`) — `@Global()` module; wires `RabbitMQModule.forRootAsync` (exchanges: `fcp.events` topic, `fcp.dlq` fanout, both durable); provides `IEventBus → RabbitMqEventBus`; provides `IOREDIS_CLIENT` (shared `ioredis` instance from `REDIS_URL`); exports both for all feature modules.
- **`RabbitMqEventBus`** (`src/common/events/rabbitmq-event-bus.ts`) — `extends IEventBus`; injects `AmqpConnection`; `publish(event)` → `amqp.publish('fcp.events', event.routingKey, { ...event, occurredAt: iso })`. Replaces `NoopEventBus` globally.
- **`DomainEvent.routingKey`** (abstract) added to `event-bus.port.ts` — routing key is declared on the event class, not the publisher. All four existing events updated: `posts.created`, `posts.published`, `workspace.member-invited`, `workspace.member-removed`.
- **`IdempotentConsumer`** (`src/common/consumers/idempotent-consumer.base.ts`) — abstract base; `withDedup(eventId, fn)` gates logic behind Redis `SET NX EX 86400`; clears key and re-throws on transient error so RabbitMQ redelivers; callers return `Nack(false)` for permanent failures.
- **`PostCreatedConsumer`** + **`PostPublishedConsumer`** (`src/modules/posts/consumers/`) — `@RabbitSubscribe` on `api.posts.created` / `api.posts.published` queues (durable, DLX → `fcp.dlq`); extend `IdempotentConsumer`; T2.6 placeholder (log only — full logic in T3.3/T4.1).
- **`PostsModule`** — removed local `IEventBus` provider (global replaces it); added both consumers to `providers`.
- **`WorkspaceModule`** — removed local `IEventBus` provider.
- **`AppModule`** — imports `RabbitmqModule` before feature modules.
- Tests: 7 new (`rabbitmq-event-bus.spec.ts` × 3, `post-created.consumer.spec.ts` × 4). 157/157 total. Lint: clean.
- **Setup required:** Docker must be running (`docker compose up rabbitmq redis`). `RABBITMQ_URL` and `REDIS_URL` already in `.env.example`.

### 2026-07-02 — T2.5 Post status state machine

- **`ALLOWED_TRANSITIONS` guard table** — module-level constant in `posts.service.ts`; illegal `(from, to)` pairs return `err(INVALID_STATE_TRANSITION)` (HTTP 409).
- **`transitionStatus(workspaceId, postId, dto)`** — loads post (workspace-scoped), guards transition, applies side-effects: `→ scheduled` sets `scheduledAt` + BR-F06 future check; `→ publishing` requires + stores `facebookGraphPostId`; `→ published` auto-sets `publishedAt` + emits `PostPublishedEvent` after flush; `→ failed` stores `lastError`; `failed → draft` clears `lastError`.
- **`PostPublishedEvent extends DomainEvent`** — carries `postId`, `workspaceId`, `facebookGraphPostId`; no PII; dedup key `eventId = uuidv7()`; consumed by T2.6 (RabbitMQ), T3.3 (analytics), T4.1 (Algolia).
- **`UpdatePostStatusDto`** — `status: PostStatus` (`@IsIn`); optional `scheduledAt`, `facebookGraphPostId`, `lastError`.
- **`PATCH /workspaces/:workspaceId/posts/:postId/status`** — Owner/Editor; HTTP 200; Swagger `@ApiConflictResponse` for `INVALID_STATE_TRANSITION`.
- Tests: 12 new `transitionStatus` tests covering all transitions + BR-F06 + NOT_FOUND. 150/150 total. Lint: clean.

### 2026-07-02 — T2.4 Posts entity + CRUD + quota

- **`Post` entity** — extends `BaseEntity`; `PostStatus` type `'draft'|'scheduled'|'publishing'|'published'|'failed'` (all 5 states included now per T2.5 design); `@ManyToOne` relations to `Workspace` + `FacebookAccount`; `createdByUserId` scalar (cross-module logical FK — BR-R06); `facebookGraphPostId` nullable (set by Publish Job in T2.5/T2.7); static `Post.create()` factory.
- **`IPostRepository` port** — `findById` (workspace-scoped), `findAll` (soft-delete filter applies), `countByWorkspace` (quota), `facebookAccountBelongsToWorkspace` (BR-R05; imports `FacebookAccount` entity directly per §13), `createPost` (em.getReference + factory + persist + flush), `save` (flush only).
- **`IPostQuotaProvider` port + `HardcodedPostQuotaAdapter`** — returns 10 (free-plan limit); T3.1 swaps for real billing lookup without changing service or port.
- **`PostCreatedEvent extends DomainEvent`** — carries `postId`, `workspaceId`, `createdByUserId`; no PII; published after `em.flush()` (§6).
- **`PostsService`** — 5 methods: `createPost` (quota + BR-R05 + flush + event); `listPosts`; `getPost`; `updatePost` (rejects `publishing`/`published` posts with FORBIDDEN); `deletePost` (sets `deletedAt` + flush).
- **`PostsController`** — 5 routes on `POST|GET|GET :id|PATCH :id|DELETE :id`; writes Owner/Editor; reads all roles; full Swagger.
- **Migration** — `core.posts` with uuid v7 PK (no DB DEFAULT), `deleted_at` (soft-delete), CHECK on all 5 statuses, 5 indexes (workspace_id, facebook_account_id, created_by_user_id, status, partial on scheduled_at).
- Tests: 16 new service tests covering all 5 methods + err paths. 138/138 total. Lint: clean.

### 2026-07-02 — T2.3 Facebook token refresh + Graph API service

- **`refreshPageToken`** added to `IFacebookGraphApiProvider` port + `FacebookGraphApiAdapter` — calls `GET /oauth/access_token?grant_type=fb_exchange_token`; returns `RefreshedToken { accessToken, expiresAt }`; `expiresAt` is `null` for non-expiring Page tokens (common when derived from a long-lived user token).
- **`findByIdAndWorkspace` + `save`** added to `IFacebookAccountRepository` port + `MikroOrmFacebookAccountRepository` — `findByIdAndWorkspace` queries `{ id, workspace: workspaceId }` for scope enforcement; `save` calls `em.flush()` on an already-tracked entity.
- **`refreshAccountToken(workspaceId, accountId)`** added to `FacebookService` — loads account (workspace-scoped → NOT_FOUND if missing), passes decrypted token to `graphApi.refreshPageToken`, calls `account.updateToken()`, flushes. Returns `ok(undefined)` — token never returned (BR-F11).
- **`POST /workspaces/:workspaceId/facebook/pages/:accountId/refresh-token`** added to `FacebookController` (Owner/Editor, HTTP 200, Swagger).
- **Webhook verification** (`GET /webhooks/facebook` hub.challenge, `FacebookWebhookController`, `verifyWebhookToken`, `verifyWebhookChallenge`) — implemented as part of T2.2/T2.3 follow-up; confirmed live with ngrok.
- Tests: 12 new (adapter ×3, service ×3, oauth-adapter ×3 for `verifyWebhookToken` + `extractWorkspaceId`, service ×3 for `verifyWebhookChallenge`). 122/122 total. Lint: clean.

### 2026-07-02 — T2.2 Facebook OAuth callback → connect Page

- **Created `FacebookAccount` entity** — `core.facebook_accounts`; no BaseEntity (DDL uses `connected_at`/`updated_at`, no `deleted_at`); uuid v7 PK; `workspace: Ref<Workspace>` (`@ManyToOne`, same schema, real FK); `pageId` (`@Unique`); `accessToken` (`EncryptedText` — never returned/logged); static factory `connect()` + `updateToken()` method.
- **Created ports:**
  - `ports/facebook-graph-api.provider.port.ts` — `IFacebookGraphApiProvider` with `exchangeCodeForPages(code): Promise<FacebookPageData[]>`
  - `ports/facebook-account.repository.port.ts` — `IFacebookAccountRepository` with `findByPageId` + `connectPage` (upsert)
- **Created adapters:**
  - `adapters/facebook-graph-api.adapter.ts` — three Graph API calls (code→short token→long-lived token→`/me/accounts`); native `fetch` (Node 18+, no extra dep)
  - `adapters/facebook-oauth.adapter.ts` — added `verifyState(state, workspaceId): boolean`; HMAC re-computed and compared via `timingSafeEqual` (hex string comparison, equal-length to avoid throw)
- **Created `repositories/mikro-orm-facebook-account.repository.ts`** — upsert: existing page → `updateToken()` + flush; new page → `em.getReference(Workspace, id)` + `FacebookAccount.connect()` + persist + flush.
- **Added `dto/connect-page.dto.ts`** — `ConnectPageDto` (code, state) + `ConnectedPageResponseDto` (id, pageId, pageName, connectedAt — **no accessToken**).
- **Added `POST :workspaceId/facebook/pages`** to controller (Owner/Editor, HTTP 201, Swagger); service `connectPage` returns `err(CROSS_WORKSPACE)` on state failure, `err(NOT_FOUND)` if user has no pages.
- **Updated** `facebook.module.ts`, `database.module.ts`, `mikro-orm.config.ts` with `FacebookAccount`.
- **Migration:** `Migration20260702000000_FacebookAccountsSchema` — creates `core.facebook_accounts`; no `DEFAULT gen_random_uuid()` on PK (ADR-013).
- Tests: 15 new tests (service ×5, graph-api adapter ×6, oauth adapter ×4). 105/105 total. Lint: clean.
- **Setup required:** `pnpm mikro-orm migration:up` to apply `Migration20260702000000_FacebookAccountsSchema`.

### 2026-07-01 — T2.1 Facebook OAuth connect-url

- **Created `FacebookModule`** — Ports & Adapters structure under `src/modules/facebook/`:
  - `ports/facebook-oauth.provider.port.ts` — `IFacebookOAuthProvider` abstract class + `ConnectUrl` interface
  - `adapters/facebook-oauth.adapter.ts` — reads `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `FACEBOOK_REDIRECT_URI` from `ConfigService`; builds Graph API v21.0 OAuth URL; scopes: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
  - `dto/connect-url-response.dto.ts` — `ConnectUrlResponseDto` with Swagger
  - `facebook.service.ts` — `getConnectUrl(workspaceId)`: `Result<ConnectUrl, AppError>`; no ORM/ConfigService imports (§14)
  - `facebook.controller.ts` — `GET /workspaces/:workspaceId/facebook/connect-url`; `WorkspaceRolesGuard` Owner/Editor
  - `facebook.module.ts` — wires `IFacebookOAuthProvider → FacebookOAuthAdapter`
- **CSRF state format:** `base64url(JSON.stringify({ workspaceId, nonce })).<hmac-sha256-hex>` — signed with `FACEBOOK_APP_SECRET`; callback (T2.2) must verify before accepting the OAuth code.
- **Added `FacebookModule` to `app.module.ts`.**
- Tests: 9 new tests (service × 2, adapter × 7). 90/90 total. Lint: clean.
- **Setup required:** add `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI` to `.env` (see `.env.example`).

### 2026-07-01 — Week 1 wrap-up (post-T1.5 bug fix)

- **Bug:** `GET /workspaces` and `GET /workspaces/:id` returned 500 — `Trying to query by not existing property WorkspaceMember.deletedAt`.
- **Root cause:** `database.module.ts` registered a global ORM filter `filters: { softDelete: { cond: { deletedAt: null }, default: true } }`. Global ORM filters apply to ALL entities; `WorkspaceMember` and `Invitation` have no `deletedAt`. The `@Filter` on `BaseEntity` already handles soft-delete correctly for its subclasses.
- **Fix:** Removed the global filter from `database.module.ts`. Entity-level `@Filter` on `BaseEntity` (inherited by `Workspace` and `User`) is the single source of truth.
- **Not implemented (pre-T2 follow-up):** `POST /workspaces/:workspaceId/invitations/:token/accept` — outside T1.5 DoD but infrastructure (`Invitation` entity, `WorkspaceMember.forAcceptedInvite` factory) is in place.
- Tests: 79/79. Lint: clean.

### 2026-07-01 — T1.5 Workspace module members & invitations

- **Entity relationships added:**
  - `WorkspaceMember.workspace: Ref<Workspace>` with `@ManyToOne` (replaces scalar `workspaceId`); static factories `forOwner` / `forAcceptedInvite` keep `ref()` out of service code (§14)
  - `Workspace.members: Collection<WorkspaceMember>` and `Workspace.invitations: Collection<Invitation>` with `@OneToMany` (inverse side)
  - `Invitation.workspace: Ref<Workspace>` with `@ManyToOne`; static factory `Invitation.create()`
- **Created:**
  - `src/common/events/event-bus.port.ts` — `DomainEvent` base + `IEventBus` port
  - `src/common/events/noop-event-bus.ts` — no-op adapter (T2.6 swaps for RabbitMQ)
  - `src/modules/workspace/events/member-invited.event.ts` — `MemberInvitedEvent`
  - `src/modules/workspace/events/member-removed.event.ts` — `MemberRemovedEvent`
  - `src/modules/workspace/entities/invitation.entity.ts` — `Invitation` (no BaseEntity; custom PK; token = 64-char hex; expiresAt = +7d)
  - `src/modules/workspace/dto/invite-member.dto.ts` — `InviteMemberDto` + `InvitationResponseDto`
  - `src/modules/workspace/ports/invitation.repository.port.ts` — `IInvitationRepository`
  - `src/modules/workspace/repositories/mikro-orm-invitation.repository.ts`
  - `src/migrations/Migration20260701000001_InvitationsSchema.ts` — `core.invitations`
- **Updated:**
  - `workspace-member.repository.port.ts` — renamed `IWorkspaceMemberWriteRepository` → `IWorkspaceMemberRepository`; added `findByWorkspaceAndId`, `countOwners`, `remove`
  - `mikro-orm-workspace-member.repository.ts` (workspace) — implemented new methods; filters use `workspace` relation key
  - `mikro-orm-workspace-member.repository.ts` (identity) — filter updated to `{ userId, workspace: workspaceId }`
  - `workspace.service.ts` — added `inviteMember` + `removeMember`; `create` uses `WorkspaceMember.forOwner` factory
  - `workspace.controller.ts` — `POST :workspaceId/members/invite` (Owner/Editor) + `DELETE :workspaceId/members/:memberId` (Owner)
  - `workspace.module.ts` — wired `Invitation`, `IInvitationRepository`, `IEventBus → NoopEventBus`
  - `database.module.ts` + `mikro-orm.config.ts` — added `Invitation`
- Tests: 79/79 passing. Lint: clean.
- **Setup required:** `pnpm mikro-orm migration:up` to apply `Migration20260701000001_InvitationsSchema`.

### 2026-07-01 — T1.4 Workspace module core

- **Created:**
  - `src/modules/workspace/entities/workspace.entity.ts` — `Workspace extends BaseEntity`; fields: `name`, `slug`, `description`, `status`, `ownerUserId` (indexed); `@Entity({ tableName: 'workspaces', schema: 'core' })`
  - `src/modules/workspace/entities/workspace-member.entity.ts` — `WorkspaceMember` (no BaseEntity — DDL has no `deletedAt`); own uuid v7 PK; fields: `workspaceId`, `userId`, `role`, `invitedAt`, `acceptedAt`, `joinedAt`; `@Unique` on `(workspaceId, userId)` (BR-R01); btree indexes on both FK columns (BR-R08)
  - `src/modules/workspace/ports/workspace.repository.port.ts` — `IWorkspaceRepository`
  - `src/modules/workspace/ports/workspace-member.repository.port.ts` — `IWorkspaceMemberWriteRepository` (write-side port for seeding owner on create)
  - `src/modules/workspace/repositories/mikro-orm-workspace.repository.ts` — `MikroOrmWorkspaceRepository`; `findAllByUserId` uses raw SQL join (workspace_members cross-aggregate, no ORM relation — BR-R06)
  - `src/modules/workspace/repositories/mikro-orm-workspace-member.repository.ts` — `MikroOrmWorkspaceMemberRepository` (persist only, no flush)
  - `src/modules/workspace/dto/workspace.dto.ts` — `CreateWorkspaceDto` + `WorkspaceResponseDto` with Swagger
  - `src/modules/workspace/workspace.service.ts` — `WorkspaceService.create/listForUser/getById`; all return `Result<T, AppError>`; `create` generates slug, checks CONFLICT, persists workspace + owner membership in one flush
  - `src/modules/workspace/workspace.service.spec.ts` — 10 unit tests (ok + err paths)
  - `src/modules/workspace/workspace.controller.ts` — `WorkspaceController`; `POST /workspaces`, `GET /workspaces`, `GET /workspaces/:id`; maps Result → HTTP
  - `src/modules/workspace/workspace.module.ts` — imports `IdentityModule` (for `ClerkAuthGuard`); registers entities + port bindings
  - `src/migrations/Migration20260701000000_WorkspaceSchema.ts` — creates `core.workspaces` + `core.workspace_members` with all constraints and indexes; no DB-generated UUIDs
- **Updated:**
  - `src/app.module.ts` — added `WorkspaceModule`
  - `src/modules/identity/repositories/mikro-orm-workspace-member.repository.ts` — removed incorrect `deleted_at IS NULL` filter (`workspace_members` has no `deletedAt` per DDL)
- Tests: 70/70 passing. Lint: clean.
- **Setup required:** `pnpm mikro-orm migration:up` to apply `Migration20260701000000_WorkspaceSchema`.

### 2026-07-01 — Post-T1.3 enhancements (no task id — out-of-band)

- **Hexagonal Architecture refactor of IdentityModule:**
  - Created ports: `src/modules/identity/ports/user.repository.port.ts` (`IUserRepository`), `workspace-member.repository.port.ts` (`IWorkspaceMemberRepository`), `identity-provider.port.ts` (`IIdentityProvider`)
  - Created adapters: `repositories/mikro-orm-user.repository.ts`, `repositories/mikro-orm-workspace-member.repository.ts`, `repositories/clerk-identity-provider.ts`
  - Rewrote `identity.service.ts` — zero ORM / SDK / ConfigService imports; depends only on ports
  - Updated `docs/CODING-STANDARDS.md §13` with Ports & Adapters rules: services never import ORM types, SDKs, or ConfigService; no `vi.mock('@clerk/backend')` in service specs
- **BaseEntity / User — MikroORM v7 `Opt` fix:** `createdAt`, `updatedAt` (`BaseEntity`), `status` (`User`) typed as `T & Opt` so `em.create()` does not require caller to supply properties that have in-class defaults
- **DevAuthModule** (`NODE_ENV !== 'production'` only):
  - `POST /api/v1/dev-auth/token` — accepts `{ userId?, email?, template? }`, calls Clerk Backend API with `CLERK_SECRET_KEY`, returns a real Clerk JWT ready to paste into Postman's Authorization header
  - Falls back to a sign-in token URL if no active session exists for the user
- **Clerk webhook receiver:**
  - `POST /api/v1/webhooks/clerk` — receives `user.created`, `user.updated`, `user.deleted` events from Clerk
  - Signature verification via `verifyWebhook` from `@clerk/backend/webhooks` (no separate `svix` dep — it is bundled inside `@clerk/backend`)
  - `rawBody: true` added to `NestFactory.create` so the unmodified buffer is available for HMAC verification
  - `user.created` / `user.updated` → upsert email, name, avatar in `core.users`; `user.deleted` → soft-delete (idempotent)
  - ADR-026 filed in DECISIONS.md
- **Deleted:** `dev-auth.guard.ts` + spec (Bearer `dev:<userId>` bypass — rejected in favour of real Clerk JWTs)
- Tests: 60/60 passing. Lint: clean.
- **Setup required:** add `CLERK_WEBHOOK_SIGNING_SECRET=whsec_...` to `.env`; register `POST /api/v1/webhooks/clerk` in Clerk Dashboard → Webhooks, subscribe to `user.created`, `user.updated`, `user.deleted`.

### 2026-07-01 — T1.3 Identity module

- **Created:**
  - `src/modules/identity/types/workspace-role.type.ts` — `WorkspaceRole` type + `ROLE_HIERARCHY` map (`owner=3 > editor=2 > viewer=1`)
  - `src/modules/identity/decorators/current-user.decorator.ts` — `@CurrentUser()` param decorator
  - `src/modules/identity/decorators/roles.decorator.ts` — `@Roles()` metadata decorator + `ROLES_KEY`
  - `src/modules/identity/dto/auth-me-response.dto.ts` — `AuthMeResponseDto` with Swagger
  - `src/modules/identity/guards/clerk-auth.guard.ts` — `ClerkAuthGuard` (JWT verify via `verifyToken`, user upsert, 401 on failure/inactive)
  - `src/modules/identity/guards/roles.guard.ts` — `WorkspaceRolesGuard` (reads `@Roles` metadata, queries `core.workspace_members`)
  - `src/modules/identity/identity.service.ts` — `getOrCreateUser` (DB-first, Clerk API on first sign-in) + `getUserWorkspaceRole`
  - `src/modules/identity/identity.controller.ts` — `GET /auth/me`
  - `src/modules/identity/identity.module.ts` — exports guards + service
- **Updated:** `src/app.module.ts` (added `IdentityModule`), `apps/api/package.json` (added `@clerk/backend@^3.9.0`)
- **ADR-024:** Clerk JWT guard strategy: `verifyToken` (local crypto, no API call) + Clerk `users.getUser` only on first sign-in. See DECISIONS.md.
- Tests: 50/50 passing. Lint: clean.
- `WorkspaceRolesGuard.getUserWorkspaceRole` queries `core.workspace_members` which is created in T1.4; the guard is unit-tested with mocks and will work at runtime after T1.4's migration.

<!-- Format:
### YYYY-MM-DD — <task id> <title>
- What changed (files/modules)
- Decisions made (also append to DECISIONS.md if notable)
- Tests added; lint/test status
- Follow-ups / TODOs discovered
- **Parking lot** (only if mid-task session end): what's done so far, exact next step within the task
-->

### 2026-06-30 — T1.2 Persistence + cross-cutting foundation

- **Common infrastructure created:**
  - `src/common/errors/app-error.ts` — AppError + AppErrorCode (9 codes)
  - `src/common/http/to-http-exception.ts` — maps AppError.code → HttpStatus
  - `src/common/crypto/aes-gcm.ts` — AES-256-GCM encrypt/decrypt (key from PII_ENCRYPTION_KEY)
  - `src/common/crypto/encrypted-text.type.ts` — MikroORM Type for PII columns
  - `src/common/entities/base.entity.ts` — uuid v7 id, timestamps, softDelete filter
- **MikroORM wired:**
  - `src/database/database.module.ts` — PostgreSQL (primary) + MongoDB (named context 'mongo')
  - `apps/api/mikro-orm.config.ts` — CLI config with TsMorphMetadataProvider
- **Sample entity + migration:**
  - `src/modules/identity/entities/user.entity.ts` — User entity in core.users
  - `src/migrations/Migration20260630000000_InitialSchema.ts` — creates core schema + core.users
- **Updated:** `src/app.module.ts` (DatabaseModule + LoggerModule/Pino PII redaction), `src/main.ts` (Pino logger)
- **Key MikroORM v7 findings (ADR-021/022/023):** decorators split to `@mikro-orm/decorators/legacy`; type inference needs `TsMorphMetadataProvider`; migration generation needs live DB for `--initial` but `schema:create --dump` works offline.
- **Boot-verification fixes:** removed `exports: [MikroOrmModule]` from DatabaseModule (dynamic module instances can't be re-exported by class reference — `@mikro-orm/nestjs` registers providers globally so export is unnecessary); added `discovery: { warnWhenNoEntities: false }` to MongoDB context so it defers entity validation until T3.x Audit Service entities exist.
- Tests: 30/30 passing. Lint: clean. App boots to `Application listening on port 3000` with all modules initialized.
- `pnpm mikro-orm migration:up` will apply the initial schema once Docker is running.

### 2026-06-30 — T1.1 Monorepo + tooling + datastores

- Created: `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `eslint.config.mjs` (ESLint 9 flat config), `.prettierrc`, `.prettierignore`, `docker-compose.yml`, `.husky/pre-commit`
- Created: `apps/api/` — `package.json` (@fcp/api), `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `vitest.config.ts`, `src/main.ts`, `src/app.module.ts`, `src/health/` (controller + module + spec)
- Decisions: `@eslint/js` pinned to `^9.39.4` (not 10, which requires ESLint 10); `husky` prepare script uses `git rev-parse --show-prefix` to set `core.hooksPath` because `.git` is one level above the project root; `pnpm.onlyBuiltDependencies` allows `@swc/core` native binary install; ADR-020 filed for vitest 4 + unplugin-swc cosmetic warning.
- Tests: 1 file / 1 test (health controller) — passing.
- Lint: clean, zero warnings.
- `docker compose up` verified by config (PG 16, Mongo 7, Redis 7-alpine, RabbitMQ 3-management).
- **`/health` endpoint:** `GET /api/v1/health` → `{ status: 'ok' }` — requires `pnpm start:dev` to verify live.

### 2026-06-29 — Project bootstrap

- Created Claude Code control files: CLAUDE.md, docs/CODING-STANDARDS.md,
  docs/DECISIONS.md, docs/TASKS.md, this file, .claude/ commands + skills,
  .mcp.json, .env.example, Artillery skeleton.
- No application code yet. Start at T1.1, or T2.1 if Week 1 already exists.
