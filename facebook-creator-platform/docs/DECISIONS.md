# Decisions & Pinned Versions

Record every dependency version and notable choice here. Verify with
`pnpm view <pkg> version` before adding anything. Versions below were checked
on **2026-06-29**; use these as the floor and prefer the latest patch.

## Toolchain
| Tool | Version | Note |
|---|---|---|
| Node | 25.x | runtime |
| pnpm | 10.x | package manager + workspace |
| TypeScript | **~5.9.3** | Pinned to 5.9, NOT 6.0. TS 6.0 is brand-new (released ~Apr 2026); typescript-eslint 8 and some Nest tooling may lag. Revisit upgrading to 6.x once `typescript-eslint` ships full TS6 support. |
| @types/node | ^26.0.1 | matches Node 25/26 |

## Runtime dependencies (latest as of 2026-06-29)
| Package | Version | Purpose |
|---|---|---|
| @nestjs/core, @nestjs/common | ^11.1.27 | framework (engines: node >= 20, OK on 25) |
| @nestjs/platform-express | ^11.1.27 | HTTP adapter |
| @nestjs/config | ^4.0.4 | config |
| @nestjs/swagger | ^11.4.4 | OpenAPI |
| @nestjs/throttler | ^6.5.0 | rate limiting |
| @nestjs/microservices | ^11.1.27 | transport (if needed) |
| @mikro-orm/core | ^7.1.5 | ORM (Unit of Work) |
| @mikro-orm/postgresql | ^7.1.5 | PG driver |
| @mikro-orm/mongodb | ^7.1.5 | Audit Service driver |
| @mikro-orm/nestjs | ^7.0.2 | Nest integration |
| @mikro-orm/migrations | ^7.1.5 | migrations |
| @golevelup/nestjs-rabbitmq | ^9.0.2 | RabbitMQ event bus |
| @clerk/backend | ^3.9.0 | JWT verification at gateway (verified 2026-07-01) |
| stripe | ^22.3.0 | billing |
| algoliasearch | ^5.55.1 | search (NOT the empty `algolia` pkg) |
| ioredis | ^5.11.1 | Redis cache |
| neverthrow | ^8.2.0 | Result pattern |
| uuidv7 | ^1.x | app-generated time-ordered ids (verify: `pnpm view uuidv7 version`) |
| nestjs-pino + pino | ^4.6.1 / ^10.3.1 | logging |
| pino-pretty | ^13.1.3 | dev log formatting |
| class-validator | ^0.15.1 | DTO validation |
| class-transformer | ^0.5.1 | DTO transform |
| helmet | ^8.2.0 | security headers |
| reflect-metadata | ^0.2.2 | decorators |
| rxjs | ^7.8.2 | Nest peer dep |

## Dev dependencies
| Package | Version | Purpose |
|---|---|---|
| @nestjs/cli | ^11.0.23 | scaffolding |
| @nestjs/testing | ^11.1.27 | test utils |
| vitest | ^4.1.9 | test runner (replaces Jest) |
| @vitest/coverage-v8 | ^4.1.9 | coverage |
| unplugin-swc + @swc/core | ^1.5.9 / ^1.15.43 | fast TS transform for Vitest/Nest |
| artillery | ^2.0.33 | API + load testing |
| tsx | ^4.22.4 | run TS scripts |
| eslint | **^9.x** | Pinned to 9, NOT 10. ESLint 10 is very new; `typescript-eslint@8` targets ESLint 9 flat config. Revisit when typescript-eslint confirms ESLint 10. Verify: `pnpm view typescript-eslint peerDependencies`. |
| typescript-eslint | ^8.62.0 | TS linting (flat config) |
| prettier | ^3.9.3 | formatting |

> Rationale for not blindly taking "latest" on TypeScript and ESLint: both had
> major releases (TS 6.0, ESLint 10) within ~weeks of this date. The linting
> stack (`typescript-eslint@8`) is built against TS 5.x + ESLint 9. Pinning the
> two majors one notch back avoids a broken lint pipeline while keeping
> everything else on the newest supported release. Upgrade deliberately, not by default.

## Architecture decisions (mirror of CR-01 ADRs)
- ADR-011 MikroORM (Unit of Work + Identity Map) over TypeORM
- ADR-012 PII encryption at rest (AES-256-GCM) + log/event redaction
- ADR-013 Application-generated UUID v7 keys for separate services
- ADR-014 Soft delete + created/updated/deleted timestamp triplet
- ADR-015 Result pattern for domain errors
- ADR-016 Audit Service on MongoDB (schemaless, event-sourced)
- ADR-017 Guarded billing state machine with transition log
- ADR-018 Index all foreign keys (real + logical)

## MikroORM v7 packages (added T1.2, verified 2026-06-30)
| Package | Version | Purpose |
|---|---|---|
| @mikro-orm/core | ^7.1.5 | ORM core (Unit of Work) |
| @mikro-orm/postgresql | ^7.1.5 | PostgreSQL driver |
| @mikro-orm/mongodb | ^7.1.5 | MongoDB driver (Audit Service) |
| @mikro-orm/nestjs | ^7.0.2 | NestJS integration module |
| @mikro-orm/migrations | ^7.1.5 | SQL migration runner |
| @mikro-orm/cli | ^7.1.5 | CLI for migration:create / schema:create |
| @mikro-orm/decorators | ^7.1.5 | **Required in v7** — decorator API moved here from core |
| @mikro-orm/reflection | ^7.1.5 | TsMorphMetadataProvider for TS type inference |
| neverthrow | ^8.2.0 | Result pattern (`ok` / `err`) |
| uuidv7 | ^1.2.1 | App-generated time-ordered UUIDs (ADR-013) |
| @swc-node/register | ^1.11.1 | SWC loader for mikro-orm CLI TypeScript support |

> **ADR-021 MikroORM v7 decorator API moved to `@mikro-orm/decorators`:**
> In v7.1.5, `@Entity`, `@PrimaryKey`, `@Property`, `@Filter`, `@Index`, `@Unique`,
> `@ManyToOne` etc. are NOT exported from `@mikro-orm/core`. They live in
> `@mikro-orm/decorators/legacy` (for TypeScript legacy `experimentalDecorators`)
> and `@mikro-orm/decorators/es` (for TC39 stage-3 decorators). Import from
> `@mikro-orm/decorators/legacy` in all entities.
>
> **ADR-022 `TsMorphMetadataProvider` required for type inference:**
> Without `emitDecoratorMetadata` reaching MikroORM at runtime (the CLI uses `tsx`
> which doesn't emit it), MikroORM v7 cannot infer property types from TypeScript
> metadata. Use `TsMorphMetadataProvider` from `@mikro-orm/reflection` in both the
> CLI config (`mikro-orm.config.ts`) and the runtime NestJS module. This reads
> TypeScript source files directly (via `ts-morph`) to extract type information.
>
> **ADR-023 Migration generation without Docker:** `mikro-orm migration:create --initial`
> requires a live DB connection even for `--initial`. Use `mikro-orm schema:create --dump`
> to preview the DDL, then write the migration file manually. Run `migration:up` once
> Docker is running to apply it.

## Clerk webhook verification (added post-T1.3, verified 2026-07-01)
| Package | Version | Purpose |
|---|---|---|
| svix | ^1.96.1 | HMAC signature verification for Clerk webhook payloads (Standard Webhooks spec) |

> **ADR-026 Clerk webhook verification via `svix` + raw body:**
> Clerk delivers webhook events signed with a per-endpoint secret using the Standard Webhooks
> spec (standardwebhooks.com). Verification requires the *exact* raw request bytes — a
> re-parsed JSON object produces a different byte sequence and fails the HMAC check.
> `NestFactory.create` is called with `rawBody: true` so NestJS stores the unmodified buffer
> on `req.rawBody` before the JSON body parser consumes the stream.
> `ClerkWebhookService` receives that buffer and the three signature headers (`svix-id`,
> `svix-timestamp`, `svix-signature`) from the controller and calls
> `new Webhook(secret).verify(body, headers)` from the `svix` package — the direct,
> synchronous API for Express-based servers.
> Types (`UserWebhookEvent`) are imported from `@clerk/backend` (already a dependency).
> Endpoint: `POST /api/v1/webhooks/clerk`.

## @clerk/backend (added T1.3, verified 2026-07-01)
| Package | Version | Purpose |
|---|---|---|
| @clerk/backend | ^3.9.0 | JWT verification (`verifyToken`) + user profile fetch (`users.getUser`) |
| @types/express | ^5.0.6 | Express `Request` types for guards (dev dep) |

> **ADR-024 Clerk JWT guard strategy — verify locally, fetch profile on first sign-in only:**
> `verifyToken` (from `@clerk/backend`) validates the JWT signature locally (no network hop).
> The `sub` claim is the Clerk user id. User profile data (email, name, avatar) is NOT in
> the JWT payload; it is fetched via `clerkClient.users.getUser(sub)` only when the user
> does not yet exist in our `core.users` table. After the first sign-in, all subsequent
> requests resolve the user via a local DB lookup by `clerkUserId` — no Clerk API call.
> This avoids per-request network latency while keeping profile data in sync at sign-in time.
> If profile sync on every request becomes a requirement, revisit in T5.x.

## Additional dev tooling (added T1.1, verified 2026-06-30)
| Package | Version | Purpose |
|---|---|---|
| husky | ^9.1.7 | git hooks manager |
| lint-staged | ^17.0.8 | run linters on staged files |
| @eslint/js | ^9.39.4 | ESLint 9 base rules (pinned to 9.x — 10.x requires eslint 10) |
| globals | ^17.7.0 | browser/node globals for ESLint flat config |

> **ADR-020 `unplugin-swc` warning with vitest 4:** `unplugin-swc@1.5.9` internally
> sets `esbuild: false` in the Vite config. Vitest 4 replaced esbuild with oxc and
> prints a warning that `esbuild: false` is deprecated (oxc: false should be used).
> The SWC transform still works — tests pass and decorator metadata is supported.
> This is a cosmetic warning from `unplugin-swc` not yet updating for vitest 4.
> Revisit when a newer `unplugin-swc` is released.

## Scheduler (added T2.9, verified 2026-07-06)
| Package | Version | Purpose |
|---|---|---|
| @nestjs/schedule | ^6.1.3 | Cron-based background jobs (`@Cron`, `ScheduleModule.forRoot()`) |

> **ADR-053 Token-expiry events via cron scan (not eager push):**
> `FacebookTokenExpiryScheduler` runs daily at midnight and scans all `facebook_accounts`
> where `tokenExpiresAt < now() + 7 days`. It emits one `FacebookTokenExpiringEvent`
> per account (routing key `facebook.token_expiring`). The Email Service (T4.3) consumes
> the event and sends the renewal reminder. The scheduler does NOT send email directly —
> keeping email logic out of `apps/api`. Token values are never included in the event
> payload (BR-F11). No PII is emitted; `pageId` is a Facebook-issued external identifier.
>
> **ADR-054 Jobs use forked EntityManager per run (ADR-030 extension):**
> `PublishJob`, `PublishFallbackPollJob`, and `FacebookTokenExpiryScheduler` all inject
> `MikroORM` (not `EntityManager`) and call `orm.em.fork()` at the start of each cron
> run. This follows the same pattern established for consumers (ADR-030): forked EM
> provides a clean identity map and transaction scope isolated from all other runs.
> Each post is flushed individually inside the publish loop so a single Graph API failure
> does not block other posts in the same tick.

## RabbitMQ + Redis (added T2.6, verified 2026-07-03)
| Package | Version | Purpose |
|---|---|---|
| @golevelup/nestjs-rabbitmq | ^9.0.2 | RabbitMQ consumer/publisher via `@RabbitSubscribe` + `AmqpConnection` |
| ioredis | ^5.11.1 | Redis client for consumer dedup keys (`dedup:<eventId>`) |

> **ADR-028 Global `RabbitmqModule` provides `IEventBus` + `IOREDIS_CLIENT`:**
> `RabbitmqModule` is `@Global()` so `IEventBus` (→ `RabbitMqEventBus`) and
> `IOREDIS_CLIENT` (shared `ioredis` instance) are available project-wide without
> explicit per-module imports. Feature modules no longer declare their own `IEventBus`
> provider. `connectionInitOptions: { wait: false }` prevents startup blocking when
> the broker is temporarily unavailable; the app still boots and RabbitMQ reconnects.
> Exchange declaration: `fcp.events` (topic, durable) for all domain events;
> `fcp.dlq` (fanout, durable) receives messages that are permanently nacked.
>
> **ADR-029 `DomainEvent.routingKey` drives AMQP routing:**
> Each event subclass declares a `readonly routingKey = 'domain.action' as const`
> property. `RabbitMqEventBus.publish` reads it to route to the correct binding
> on `fcp.events`. This keeps routing logic with the event definition, not in the
> publisher, and makes routing keys discoverable by grepping event files.

## Services architecture + T3.1 (corrected 2026-07-03)

> **ADR-032 Billing is a separate NestJS service (`services/billing/`), NOT an `apps/api` module.**
> The ERD (`fcp-database.d2`) labels each schema by owner: `core (apps/api)`, `billing (billing-service)`,
> `analytics (analytics-service)`, etc. The pnpm workspace has `services/*` alongside `apps/*`.
> Initial T3.1 implementation incorrectly placed billing inside `apps/api/src/modules/billing/` — corrected.
>
> **ADR-033 Inter-service communication: sync HTTP for immediate responses, async RabbitMQ for propagation.**
> - `apps/api → services/billing`: sync HTTP (checkout, quota check).
> - `services/billing → platform`: async RabbitMQ events (subscription activated / cancelled — T3.2).
> - Stripe webhooks go **directly** to `services/billing` on its own port; not proxied through `apps/api`.
> - Same model applies to analytics (T3.3), notification (T4.2), email (T4.3), search (T4.1), audit (T3.4).
>
> **ADR-034 `apps/api` billing module is a thin HTTP proxy only.**
> `apps/api/src/modules/billing/` owns no entities, migrations, or ORM repositories. It provides:
> (1) `BillingController` — enforces Clerk JWT + workspace role guard, then forwards checkout to `services/billing`;
> (2) `BillingHttpClientAdapter` — wraps `fetch` calls to `services/billing` (BILLING_SERVICE_URL env var);
> (3) `BillingQuotaAdapter` — implements `IPostQuotaProvider` via HTTP; falls back to 10 on billing outage.
>
> **ADR-035 `stripe@^22.3.0` pinned in `services/billing/package.json` (verified 2026-07-03).**
> `pnpm view stripe version` = `22.3.0`. Also added `@mikro-orm/decorators@^7.1.5` (required for
> `@mikro-orm/decorators/legacy` decorator imports — same pattern as `apps/api`).
>
> **ADR-036 Plan + Subscription entities do not extend `BaseEntity`.**
> DDL has no `deleted_at` on either table. Plans are static reference data; subscriptions use `status`
> for lifecycle (T3.2 state machine). Extending `BaseEntity` would add a soft-delete filter and column
> that the schema does not have.
>
> **ADR-037 Plan seed embedded in `services/billing` migration (`ON CONFLICT DO NOTHING`).**
> Three rows (free/pro/team) seeded in `Migration20260703000001_BillingSchema` with fixed UUID v7 values.
> Idempotent across environments. MikroORM seeders not chosen — extra package for 3 static rows.
>
> **ADR-038 Root `pnpm test` updated to `pnpm -r test`** — runs all workspace packages in parallel.
> Added per-service aliases: `pnpm test:api`, `pnpm test:billing`, `pnpm migration:billing`.
>
> **ADR-039 `libs/billing-contracts/` — shared HTTP boundary types only; no `libs/billing-client` yet.**
> `@fcp/billing-contracts` exports plain TypeScript interfaces (`CheckoutRequest`, `CheckoutResponse`,
> `QuotaResponse`, `BillingErrorCode`, `BillingErrorResponse`) used by both `apps/api` and `services/billing`.
> No NestJS or runtime dependencies — pure types. `libs/billing-client` (a reusable HTTP client wrapper)
> deferred until a second service caller exists (analytics or notification); premature extraction before
> that would add abstraction with zero reuse benefit. `pnpm-workspace.yaml` now includes `libs/*`.

## Facebook webhook consumers (added T2.7, 2026-07-03)

> **ADR-030 Consumers use `orm.em.fork()` instead of injected `EntityManager`:**
> RabbitMQ consumers run outside any HTTP request context. The `EntityManager` provided
> by `@mikro-orm/nestjs` is request-scoped; injecting it directly in a consumer gives
> the global EM whose identity map is shared across all messages — a bug waiting to happen.
> `MikroORM` is injected instead; each handler calls `this.orm.em.fork()` to get a
> fresh, isolated EM per message. This pattern is recommended by MikroORM docs for
> workers and queue processors.
>
> **ADR-031 `FacebookAccount.deletedAt` added via migration (T2.7):**
> `FacebookAccount` does not extend `BaseEntity` (T2.2 decision — DDL has no `deleted_at`).
> T2.7 needs to soft-delete accounts on deauthorization, so `deleted_at timestamptz NULL`
> is added via `Migration20260703000000_FacebookAccountSoftDelete`. No global ORM filter
> is applied — repository queries filter `{ deletedAt: null }` explicitly. T5.2 schema
> audit will evaluate whether a `@Filter` should be added.

## Pre-T3.3 architecture decisions — task audit (2026-07-03)

> **ADR-049 `PostPublishedEvent` gains `facebookAccountId` and `createdByUserId`.**
> The event previously carried only `postId`, `workspaceId`, `facebookGraphPostId`.
> Two consuming services need extra fields:
> - `services/analytics` (T3.3) needs `facebookAccountId` to resolve a page access token via
>   `GET /internal/facebook-accounts/:id/token` on `apps/api`, which it needs to call the Graph API
>   for post insights (`reach`, `impressions`). The `Post.facebookAccount` field (a `Ref<FacebookAccount>`)
>   always exposes its PK even when unpopulated, so no extra DB query is needed at publish time.
> - `services/email` (T4.3) needs `createdByUserId` to resolve the recipient's email via
>   `GET /internal/users/:id/email` on `apps/api`.
> Both fields are UUIDs — not PII.
>
> **ADR-050 Internal endpoint pattern for cross-service PII resolution (consolidated resource design).**
> Supporting services (`analytics`, `email`, `notification`) sometimes need data that lives in the `core`
> schema owned by `apps/api` (page tokens, user emails, workspace membership). These are not included in
> event payloads (PII rule). Instead: `apps/api` exposes a set of **internal-only HTTP routes** under
> `/internal/` that are not Swagger-documented and are secured by a shared internal secret
> (`INTERNAL_API_SECRET` env var, compared in a dedicated guard). Consuming services include this header
> on every internal call. Endpoints are resource-based (not action-scoped) so new callers add fields
> rather than new endpoints:
> - `GET /internal/facebook-accounts/:id` — returns `{ id, pageToken }` (decrypted AES token); used by `services/analytics`.
> - `GET /internal/users/:id` — returns `{ id, email }`; used by `services/email`.
> - `GET /internal/workspaces/:id` — returns `{ id, ownerId, ownerEmail }`; used by `services/email` for billing events.
> - `GET /internal/workspaces/:id/members` — returns `[{ userId, role }]`; used by `services/notification` for projection cold-start reconciliation (ADR-059).
> All internal endpoints return 404 on unknown ID and 401 on missing/bad secret. No Swagger. No Clerk JWT.
> Design rule: never add a new `/internal/<resource>/:id/<field>` path — extend the resource response DTO instead.

## Pre-T3.3 architecture decisions (2026-07-03)

> **ADR-046 `analytics.post_metrics` gets `workspace_id` (DDL divergence, intentional).**
> The reference DDL omits `workspace_id` from `analytics.post_metrics`; a cross-schema Postgres view
> (`core.vw_post_metrics_enriched`) joins to `core.posts` to recover it. That join is impossible inside
> `services/analytics` — it is a separate NestJS app with its own DB connection scoped to the `analytics`
> schema. `PostPublishedEvent` already carries `workspaceId`, so the consumer has the value at insert time.
> Solution: add `workspace_id uuid NOT NULL` as a logical scalar FK (no DB constraint per BR-R06) with a
> btree index (BR-R08). This is the only way to serve `GET /workspaces/:id/metrics` from a self-contained service.
>
> **ADR-047 `core.audit_logs` (Postgres, DDL) is superseded by MongoDB `audit_events` (services/audit).**
> The reference DDL contains `core.audit_logs` — a structured Postgres table (actor, action, entity, old/new values).
> This design pre-dates the event-sourcing pivot captured in ADR-016 and TASKS.md T3.4. The final design uses
> `services/audit` (a separate NestJS app) writing schemaless docs to MongoDB, fed by consuming all RabbitMQ
> events with routing key `#`. `GET /workspaces/:id/audit-logs` in `apps/api` calls `services/audit` HTTP.
> The `core.audit_logs` Postgres table will NOT be created; its migration is skipped.
>
> **ADR-048 `analytics.*` routing key reserved; analytics service does NOT publish events in T3.3.**
> The architecture diagram shows `analytics.*` as a routing key on the bus. T3.3 scope is: consume
> `posts.published`, fetch Graph API metrics, upsert `post_metrics`. No downstream publish step.
> If `analytics.metrics_updated` events are needed in a later task (e.g. for notification or audit), they
> can be added then — adding them now without a confirmed consumer would be premature.

## Architecture decisions — post-review additions (2026-07-06)

> **ADR-058 Background jobs stay in `apps/api` for current scale; extraction deferred.**
> `PublishJob`, `PublishFallbackPollJob`, and `FacebookTokenExpiryScheduler` currently live in `apps/api`.
> Architecturally they are not HTTP-request handlers — they are long-running workers that happen to share
> the same process. At current scale this is acceptable: shared DB connection pool, no independent scaling
> requirement, single deploy unit. The extraction trigger is any of: (1) jobs delay API startup, (2) jobs
> need independent horizontal scaling, (3) job deploy frequency diverges from API deploy frequency.
> If extracted, the target is `services/jobs/` — a separate NestJS app consuming RabbitMQ and running
> `@nestjs/schedule` crons, with its own process but sharing the same `core` schema. Do not extract
> until at least one trigger is observed.

> **ADR-059 Notification Service projection cold-start reconciliation via internal snapshot.**
> `workspace_members_projection` is built from RabbitMQ events. If the Notification Service goes down
> and misses membership events, the projection silently drifts. On service boot, the Notification Service
> reads all distinct `workspace_id` values already present in its projection, calls
> `GET /internal/workspaces/:id/members` on `apps/api` for each, and re-upserts the result using the
> same conflict-resolution logic (`INSERT … ON CONFLICT DO UPDATE`) as the event consumers. This recovers
> from missed events without full event replay. Skipped for workspaces not yet in the projection (first
> boot) — event consumers will populate them naturally. Added to T4.2 DoD.
> Limitation: on the very first deploy, if membership events were published before the Notification
> Service was running, those workspaces will never appear in the projection until a new membership event
> arrives. Acceptable for current scale; full event sourcing / replay is the long-term fix.

> **ADR-060 Billing lifecycle events extended to cover `past_due` and `subscription_renewed`.**
> T3.2 published only `billing.subscription_activated` and `billing.subscription_cancelled`.
> Two additional Stripe lifecycle events are needed for a complete notification surface:
> - `customer.subscription.updated` with `status: past_due` → transition to `past_due`, publish
>   `billing.subscription_past_due`. Notification Service alerts workspace members (in-app + Slack).
> - `invoice.payment_succeeded` where subscription is already `active` (renewal, not initial checkout)
>   → publish `billing.subscription_renewed`. No downstream notification required at current scope;
>   recorded in `billing_events` log. Available for future Audit / Analytics consumers.
> Both are idempotent via `stripe_event_id` unique key (same pattern as T3.2). Added as T3.6.

## Pre-T4.x architecture decisions — Week 4 audit (2026-07-03)

> **ADR-051 Full post event set: `PostCreatedEvent` enriched + `PostUpdatedEvent`, `PostFailedEvent`, `PostDeletedEvent` added.**
>
> The original `PostCreatedEvent` only carried `postId`, `workspaceId`, `createdByUserId`. This forced the
> Search Service (T4.1) to call `GET /internal/posts/:id` to obtain indexable content — a runtime HTTP
> dependency that violates CQRS principles (read models should be built from events, not back-channel reads).
> Decision: events carry enough fields for downstream read-model construction without any callback.
>
> `PostCreatedEvent` now includes `title`, `content`, `status`, `scheduledAt`, `createdAt`.
> Three new events added so Search, Email, and Notification are fully event-driven:
> - `posts.updated` (`PostUpdatedEvent`) — emitted by `updatePost()`; Search Service updates Algolia record.
> - `posts.failed` (`PostFailedEvent`) — emitted by `transitionStatus()` on `→ failed`; carries `createdByUserId`
>   (for email recipient resolution) and `lastError`. Consumed by Notification, Email, Audit, Analytics.
> - `posts.deleted` (`PostDeletedEvent`) — emitted by `deletePost()`; Search Service removes Algolia record.
>
> **ADR-052 CQRS projection pattern for workspace membership — no internal HTTP for member lists.**
>
> The Notification Service (T4.2) needs the list of user IDs in a workspace to populate
> `notification_recipients`. Instead of calling `GET /internal/workspaces/:id/members` (runtime HTTP
> dependency), the Notification Service maintains its own `workspace_members_projection` table:
> ```
> workspace_members_projection(workspace_id, user_id, role, synced_at)
> ```
> `apps/api` publishes four workspace membership events:
> - `workspace.member-invited`  (MemberInvitedEvent — already exists)
> - `workspace.member-joined`   (MemberJoinedEvent — added to T2.8: acceptInvitation)
> - `workspace.member-removed`  (MemberRemovedEvent — already exists)
> - `workspace.role-changed`    (MemberRoleChangedEvent — added to T2.8 scope or a dedicated PATCH endpoint)
>
> The projection consumer uses UPSERT semantics (`INSERT ... ON CONFLICT DO UPDATE`) to be order-safe
> under replay. `synced_at` stores the event timestamp so stale updates can be rejected.
> This makes `services/notification` fully autonomous — no runtime dependency on `apps/api`.
>
> **ADR-053 `facebook.token_expiring` event triggers token-reminder emails (not a cross-schema scan).**
>
> `email_delivery_logs` has `email_type IN ('... token_expiring ...')`. The Email Service must NOT
> scan `core.facebook_accounts.token_expires_at` directly (cross-schema, BR-R06).
> Instead: a new cron job in `apps/api` (`FacebookTokenExpiryScheduler`) runs daily, finds accounts
> where `token_expires_at < now() + 7 days`, publishes `facebook.token_expiring` events.
> The Email Service consumes `facebook.token_expiring` and sends the reminder email.
> The Notification Service also consumes it for an in-app alert. Cron added to T2.9 scope.
>
> **ADR-054 `billing.payment_failed` event added to `services/billing` webhook handler.**
>
> `email_delivery_logs` has `email_type = 'payment_failed'` but the billing service previously only
> published `billing.subscription_activated` and `billing.subscription_cancelled`.
> `handleInvoicePaymentFailed` now also publishes `billing.payment_failed` after transitioning to
> `grace_period`. Payload: `{ workspaceId, planCode }` (no PII, no `stripeSubscriptionId`).
> Email Service sends `payment_failed` email; Notification Service sends in-app alert.
>
> **ADR-055 BullMQ for email retry — not in-process retry in `services/email`.**
>
> `email_delivery_logs.retry_count` implies retries. The retry strategy is BullMQ (Redis-backed job queue):
> the email job producer enqueues a job with `attempts: 3, backoff: { type: 'exponential' }`.
> On final failure BullMQ moves the job to a failed queue; the `services/email` failure handler updates
> `EmailDeliveryLog.status = 'failed'` and `retry_count = 3`.
> BullMQ is preferred over NestJS `@Retry` decorators because it survives process restarts and provides
> a job dashboard. Added as a dependency of T4.3.
>
> **ADR-056 Email provider in T4.3 is Resend (not SendGrid), per DDL CHECK constraint.**
>
> DDL `email_delivery_logs.provider CHECK ('Resend', 'SES', 'SendGrid')`. Resend is chosen as the
> initial `IEmailProvider` implementation (simpler API, TypeScript-native SDK, lower cost tier).
> `IEmailProvider` abstraction allows swapping to SES or SendGrid without changing consumers.
>
> **ADR-057 Slack alerts in Notification Service — `ISlackProvider` + `NotificationOrchestrator`.**
>
> Architecture diagram `svc_notif` lists "In-App Notifications, Slack Alerts, Orchestration".
> T4.2 includes `ISlackProvider` (Slack Incoming Webhook) + `SlackWebhookProvider` implementation.
> `NotificationOrchestrator` decides per event which channels are triggered (in-app and/or Slack).
> This makes it trivially extensible to Microsoft Teams (`ITeamsProvider`) later by adding an
> implementation and updating `NotificationOrchestrator` — no consumer changes required.

## Change log
| Date | Decision |
|---|---|
| 2026-07-06 | **Architectural review improvements applied to TASKS.md.** (1) T5.8 messaging schema migration moved to T2.6.5 — tables must exist from the point RabbitMQ is in use, not as a Week 5 cleanup. (2) T3.6 added: billing lifecycle event completeness (`billing.subscription_past_due`, `billing.subscription_renewed`). (3) T4.1 gains `posts.failed → Algolia` consumer (five consumers, not four). (4) T4.2 gains `billing.subscription_past_due` notification consumer + projection cold-start reconciliation (ADR-059). (5) ADR-050 internal endpoints consolidated to resource-based design: `/internal/facebook-accounts/:id`, `/internal/users/:id`, `/internal/workspaces/:id`, `/internal/workspaces/:id/members` — no more action-scoped sub-paths. (6) ADR-058 documents services/jobs extraction trigger conditions (deferred). |
| 2026-06-29 | Initial version pinning; TS held at 5.9, ESLint at 9 (see rationale). |
| 2026-06-29 | **Roadmap reorder (no effort change, ~222h):** moved MikroORM, BaseEntity (uuid v7 + timestamps + soft delete), PII `EncryptedText`, and the Result pattern from Week 5 into Week 1 (T1.2). These are foundational/cross-cutting — every feature inherits them, so building features first and "migrating" later would force a full rewrite of entities, repositories, and service signatures. Moved the Audit Service to Week 3 (after the event bus is stable, so audit can be exercised end-to-end). Week 5 is now verification + Artillery load testing, not building. This removes hidden rework and de-risks the schedule. |
| 2026-06-30 | **T1.2 complete.** MikroORM v7 wired to PG + Mongo; BaseEntity (uuid v7 + timestamps + soft-delete); AppError + toHttpException; EncryptedText (AES-256-GCM); Pino logger with PII redaction; User entity + initial migration. See ADR-021/022/023 for v7 decorator split, TsMorph metadata provider, and offline migration workflow. |
| 2026-06-30 | **T1.2 boot-verification fixes.** (1) Removed `exports: [MikroOrmModule]` from DatabaseModule — `@mikro-orm/nestjs` registers providers globally so explicit export is not needed, and re-exporting dynamic modules by class reference throws `UnknownExportException` in NestJS. (2) Added `discovery: { warnWhenNoEntities: false }` to the MongoDB context so startup is not blocked until Audit Service entities are added in T3.x. |
| 2026-07-01 | **T1.3 complete.** Clerk JWT guard (`ClerkAuthGuard`), `IdentityService.getOrCreateUser` (DB upsert with Clerk API fallback on first sign-in), `GET /auth/me`, RBAC role types + `WorkspaceRolesGuard`. ADR-024 below. |
| 2026-07-01 | **T2.1 complete.** Facebook OAuth connect-url. CSRF state = `base64url(payload).<hmac-sha256>` signed with `FACEBOOK_APP_SECRET` — no DB/Redis storage needed; callback verifies signature. No new npm deps; `node:crypto` handles HMAC. Scopes: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`. |
| 2026-07-03 | **T3.2 complete.** Billing state machine + Stripe webhook. ADR-040: `stripe_event_id` UNIQUE on `billing.billing_events` is the idempotency key — find-before-insert in the webhook controller (rather than INSERT ON CONFLICT) avoids exception-based flow control. ADR-041: `services/billing` publishes to `fcp.events` exchange via `BillingRabbitMqAdapter` (`AmqpConnection.publish`) with `enableControllerDiscovery: false` — billing is a publisher-only service, not a consumer. ADR-042: `BillingService.transitionSubscription` is synchronous (returns `Result`, no flush) — callers own the single `em.flush()` per request (§6). ADR-043: free-plan guard (BR-F10) lives inside `transitionSubscription` alongside the `ALLOWED_TRANSITIONS` check — one guard function, not two separate layers. `rawBody: true` added to `services/billing/src/main.ts` for Stripe-Signature verification. ADR-044: `unref()` from `@mikro-orm/core` used for `Ref<T>` property access — `Ref<Plan>` exposes only primary key properties at the TypeScript level; `unref(ref)` returns the unwrapped entity (or the plain object as-is if not a Reference instance, making it safe in unit tests with plain object stubs). ADR-045: Stripe SDK v22 moved `Invoice.subscription` (top-level) to `invoice.parent.subscription_details.subscription`; updated both invoice handlers and test mocks. |
| 2026-07-03 | **T2.7 complete.** `POST /webhooks/facebook` with `X-Hub-Signature-256` HMAC verification; `FacebookFeedConsumer` drives `publishing→published`; `FacebookPageDeauthorizedConsumer` soft-deletes account + bulk-cancels posts. ADR-030/031 below. |
| 2026-07-03 | **T2.6 complete.** `RabbitmqModule` (global) wires `IEventBus → RabbitMqEventBus`; `IOREDIS_CLIENT` for consumer dedup. `PostCreatedConsumer` + `PostPublishedConsumer` in `PostsModule` (idempotent; DLX → `fcp.dlq`). ADR-028/029 below. |
| 2026-07-02 | **Graph API version bumped to `v25.0`** (released 2026-02-18, current stable; v21.0 was used in T2.1). Both `FacebookOAuthAdapter` and `FacebookGraphApiAdapter` share the `GRAPH_VERSION` constant. v26.0 is due later in 2026 — revisit when released. |
| 2026-07-02 | **T2.2 complete.** `POST /workspaces/:id/facebook/pages` OAuth callback. `IFacebookGraphApiProvider` port + `FacebookGraphApiAdapter` uses native `fetch` (Node 18+, no extra dep) — three Graph API calls: code→short token→long-lived token→/me/accounts. `timingSafeEqual` comparison (hex strings, equal-length) for CSRF HMAC verification — avoids buffer-length-mismatch throw on malformed state. `FacebookAccount` entity does NOT extend `BaseEntity` — DDL uses `connected_at`/`updated_at`, no `deleted_at` (same rationale as `WorkspaceMember`; T5.2 audit pass will evaluate). `MikroOrmFacebookAccountRepository.connectPage` uses `em.getReference(Workspace, id)` to set the FK without a SELECT — safe because `WorkspaceRolesGuard` already verified workspace existence. ADR-027 (fetch). |
| 2026-07-01 | **Global ORM filter removed.** `database.module.ts` had `filters: { softDelete: ... }` at the ORM level (applies to all entities) AND `BaseEntity` had `@Filter` (entity-scoped, inherited). The global filter caused runtime 500s on `WorkspaceMember`/`Invitation` queries (no `deletedAt` column). Removed the global one; `@Filter` on `BaseEntity` is the sole mechanism — it inherits to all `BaseEntity` subclasses and does not affect entities that opt out. |
| 2026-07-01 | **T1.5 complete.** `Invitation` entity + invite/remove member endpoints. `WorkspaceMember` and `Invitation` use `@ManyToOne(() => Workspace)` with `Ref<Workspace>` — type-safe same-module relations. Static factory methods (`forOwner`, `forAcceptedInvite`, `Invitation.create`) keep `ref()` inside entity files so services stay ORM-free (§14). `IEventBus` port + `NoopEventBus` adapter wired; T2.6 swaps for RabbitMQ publisher. BR-R02 sole-owner guard enforced in `removeMember`. `WorkspaceRolesGuard` activates on `POST :workspaceId/members/invite` (Owner/Editor) and `DELETE :workspaceId/members/:memberId` (Owner). |
| 2026-07-01 | **T1.4 complete.** Workspace + WorkspaceMember entities; Ports & Adapters (`IWorkspaceRepository`, `IWorkspaceMemberWriteRepository`); `WorkspaceService.create/listForUser/getById` (Result pattern); migration adds `core.workspaces` + `core.workspace_members`. `WorkspaceMember` does NOT extend BaseEntity — DDL has no `deletedAt` for this table (members are hard-deleted on removal). `findAllByUserId` uses raw SQL join to respect the cross-aggregate boundary (BR-R06). |
| 2026-07-01 | **Post-T1.3 enhancements.** (1) Hexagonal Architecture refactor: repository + identity-provider ports; MikroORM + Clerk adapters; `IdentityService` now depends only on abstract ports — zero ORM/SDK/ConfigService imports; §13 added to CODING-STANDARDS.md. (2) `DevAuthModule`: `POST /dev-auth/token` calls Clerk Backend API to return a real JWT for Postman (dev only). (3) Clerk webhook receiver: `POST /webhooks/clerk` syncs `user.created/updated/deleted` to `core.users` using `verifyWebhook` from `@clerk/backend/webhooks`; no separate `svix` dep. ADR-026. `rawBody: true` added to bootstrap. 60 tests passing. |
| 2026-06-30 | **T1.1 complete.** pnpm workspace, NestJS 11 app, ESLint 9 flat config, vitest 4 + unplugin-swc, husky pre-commit (hooksPath set via `git rev-parse --show-prefix`), Docker Compose (PG 16, Mongo 7, Redis 7, RabbitMQ 3). Note ADR-020 above re vitest/swc cosmetic warning. |
| 2026-06-30 | **ADR-019 Performance optimization order — Index → Query → Cache.** Redis caching (response cache, RBAC cache, query cache) is Week 5-only and requires T5.5 Artillery benchmark data to justify. Most p99 regressions are solved by a missing index or an N+1 query; adding cache without that evidence buys invalidation complexity, stale-read risk, and extra monitoring for no proven gain. Consumer deduplication keys (`dedup:<eventId>`) are the only pre-T5 Redis use — they are idempotency infrastructure, not a performance cache. When cache is added in T5.6, record the before/after p99 and load level in this file. |
