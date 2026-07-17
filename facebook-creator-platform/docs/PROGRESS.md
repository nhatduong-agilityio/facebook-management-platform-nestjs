# Progress Log

> Claude updates this after every task. The **Resume point** is the first thing
> to read at the start of a session. Newest entries on top.

## Resume point

- **Next task:** TM.10 — `services/audit` add TCP `@MessagePattern` handlers
- **Branch:** `nestjs-practice`
- **Notes:** TM.9 complete. 354 apps/api tests green (5 new). Lint: 0 errors.

## Log

### 2026-07-17 — TM.9 `apps/api` → notification TCP adapter

- **`apps/api/src/modules/notification/adapters/notification-tcp.adapter.ts`** (new): Extends `INotificationClient`. Injects `NOTIFICATION_TCP_CLIENT` `ClientProxy`. `getNotifications` sends `notification.list` with `{ workspaceId, userId }`; `markAsRead` sends `notification.mark-read` with `{ notificationId, userId }` (discards `{ updated }` return, port returns `void`). Both `pipe(timeout(3_000))`. Error mapping: `RpcException` → `DownstreamServiceError(500)`, other → `DownstreamServiceError(503)`.
- **`apps/api/src/modules/notification/adapters/notification-tcp.adapter.spec.ts`** (new): 5 tests — getNotifications ok, RpcException→500, timeout→503; markAsRead resolves void, RpcException→500.
- **`apps/api/src/modules/notification/notification.module.ts`**: Replaced `NotificationHttpClientAdapter` + `IHttpClient` + `FetchHttpClientAdapter` with `NotificationTcpAdapter`; added `ClientsModule.registerAsync` (Transport.TCP, reads `NOTIFICATION_TCP_HOST`/`NOTIFICATION_TCP_PORT`, defaults `localhost:4005`); updated module JSDoc.
- **`apps/api/src/modules/notification/ports/notification.client.port.ts`**: Updated JSDoc — removed stale `NotificationHttpClientAdapter` reference.
- `NotificationController` and `notification.controller.spec.ts` unchanged.
- Tests: 354 apps/api passed (5 new). Lint: 0 errors.

## Log

### 2026-07-17 — TM.8 `services/notification` — TCP `@MessagePattern` handlers

- **`services/notification/src/notification.message-controller.ts`** (new): 2 `@MessagePattern` handlers — `notification.list` → `NotificationService.getNotificationsForUser(workspaceId, userId)` → `NotificationResponseDto[]`; `notification.mark-read` → `NotificationService.markAsRead(notificationId, userId)` → `{ updated: boolean }`. BR-F08 one-way documented in JSDoc: `updated: false` is a silent no-op (already read), not an error. Both catch and re-throw as `RpcException({ code: 'INTERNAL' })`.
- **`services/notification/src/notification.message-controller.spec.ts`** (new): 5 tests — list ok, list RpcException, mark-read updated=true, mark-read already-read (updated=false, no throw), mark-read RpcException.
- **`services/notification/src/notification.module.ts`**: Replaced `NotificationController` with `NotificationMessageController` in `controllers[]`; updated JSDoc (no HTTP, TCP only; reverse-direction HTTP from reconciler noted).
- **`services/notification/src/main.ts`**: Applied pure-microservice-hybrid pattern — `enableShutdownHooks()`, all config via `ConfigService`, added TCP transport (`NOTIFICATION_TCP_HOST`/`NOTIFICATION_TCP_PORT`, defaults `0.0.0.0:4005`), removed Swagger + ValidationPipe + `setGlobalPrefix` + `app.listen()`.
- **`services/notification/src/notification.controller.ts`** (deleted): HTTP read + seed-projection endpoints removed; `apps/api` will call via TCP after TM.9.
- Tests: 45 notification passed (5 new). Lint: 0 errors.

## Log

### 2026-07-17 — TM.7 `apps/api` → search TCP adapter

- **`apps/api/src/modules/search/adapters/search-tcp.adapter.ts`** (new): Extends `ISearchClient`. Injects `SEARCH_TCP_CLIENT` `ClientProxy`. `search(workspaceId, query)` calls pattern `search.query` via `firstValueFrom(client.send(...).pipe(timeout(3_000)))`. Error mapping: `RpcException` → `DownstreamServiceError(500, 'search')`, timeout/connection → `DownstreamServiceError(503, 'search')`.
- **`apps/api/src/modules/search/adapters/search-tcp.adapter.spec.ts`** (new): 4 tests — returns results, returns empty array, `RpcException` → 500, connection error → 503. Uses `of()` / `throwError()` from rxjs.
- **`apps/api/src/modules/search/search.module.ts`**: Replaced `SearchHttpClientAdapter` + `IHttpClient` + `FetchHttpClientAdapter` with `SearchTcpAdapter`; added `ClientsModule.registerAsync` (Transport.TCP, reads `SEARCH_TCP_HOST`/`SEARCH_TCP_PORT`, defaults `localhost:4004`); updated module JSDoc.
- **`apps/api/src/modules/search/ports/search.client.port.ts`**: Updated JSDoc — removed stale `SearchHttpClientAdapter` reference, now references `SearchTcpAdapter`.
- `SearchController` and `search.controller.spec.ts` unchanged — both depend only on `ISearchClient` port.
- Tests: 349 apps/api passed (4 new). Lint: 0 errors.

## Log

### 2026-07-17 — TM.6 `services/search` — replace HTTP with TCP `@MessagePattern`

- **`services/search/src/search.message-controller.ts`** (new): `@MessagePattern('search.query')` → `SearchService.search(dto.workspaceId, dto.query)` → `SearchResultDto[]`; catches and re-throws as `RpcException({ code: 'INTERNAL', message })`.
- **`services/search/src/search.message-controller.spec.ts`** (new): 2 tests — returns results array on success; throws `RpcException` on Algolia failure.
- **`services/search/src/search.module.ts`**: Replaced `SearchController` with `SearchMessageController` in `controllers[]`; updated JSDoc (no HTTP, TCP only).
- **`services/search/src/main.ts`**: Applied pure-microservice-hybrid pattern — `enableShutdownHooks()`, all config via `ConfigService`, added TCP transport (`SEARCH_TCP_HOST`/`SEARCH_TCP_PORT`, defaults `0.0.0.0:4004`), removed Swagger + ValidationPipe + `setGlobalPrefix` + `app.listen()`.
- **`services/search/src/search.controller.ts`** (deleted): HTTP `GET /search` endpoint removed; `apps/api` will call via TCP after TM.7.
- Tests: 17 search passed (2 new). Lint: 0 errors.

## Log

### 2026-07-17 — TM.5 `apps/api` → analytics TCP adapter

- **`apps/api/src/modules/analytics/adapters/analytics-tcp.adapter.ts`** (new): Extends `IAnalyticsClient`. Injects `ANALYTICS_TCP_CLIENT` `ClientProxy`. `getWorkspaceMetrics` calls pattern `analytics.workspace-metrics`; `getPostMetrics` calls `analytics.post-metrics`. Both use `firstValueFrom(client.send(...).pipe(timeout(3_000)))`. Error mapping: any `RpcException` → `DownstreamServiceError(500, 'analytics')`, timeout/connection → `DownstreamServiceError(503, 'analytics')`. Preserves the `DownstreamServiceError` contract so `AnalyticsController` is unchanged.
- **`apps/api/src/modules/analytics/adapters/analytics-tcp.adapter.spec.ts`** (new): 7 tests — ok + RpcException(500) + connection-failure(503) for `getWorkspaceMetrics`; ok + empty array + RpcException(500) + timeout(503) for `getPostMetrics`. Uses `of()` / `throwError()` from rxjs to mock `ClientProxy.send()`.
- **`apps/api/src/modules/analytics/analytics.module.ts`**: Replaced `AnalyticsHttpClientAdapter` + `IHttpClient` + `FetchHttpClientAdapter` with `AnalyticsTcpAdapter`; added `ClientsModule.registerAsync` (Transport.TCP, reads `ANALYTICS_TCP_HOST`/`ANALYTICS_TCP_PORT` from config, defaults `localhost:4002`); updated module JSDoc.
- Tests: 345 apps/api passed (7 new). Lint: 0 errors.

### 2026-07-17 — TM.4 `services/analytics` — TCP `@MessagePattern` handlers

- **`services/analytics/src/analytics.message-controller.ts`** (new): 2 `@MessagePattern` handlers — `analytics.workspace-metrics` → `AnalyticsService.getWorkspaceMetrics(workspaceId)`, `analytics.post-metrics` → `AnalyticsService.getPostMetrics(postId)`. Both catch and re-throw as `RpcException({ code: 'INTERNAL', message })`.
- **`services/analytics/src/analytics.message-controller.spec.ts`** (new): 4 tests — ok + RpcException path for each handler.
- **`services/analytics/src/analytics.module.ts`**: Added `AnalyticsMessageController` to `controllers[]`.
- **`services/analytics/src/main.ts`**: Added TCP transport (`ANALYTICS_TCP_PORT`, default 4002) alongside existing RMQ; HTTP server kept (health / Swagger — TM.12 decides final port strategy).
- Tests: 13 analytics passed (4 new). Lint: 0 errors.

### 2026-07-17 — TM.3 `apps/api` → billing TCP adapter

- **`apps/api/src/modules/billing/adapters/billing-tcp.adapter.ts`** (new): Extends `IBillingHttpClient`. Injects `BILLING_TCP_CLIENT` `ClientProxy`. Each method uses `firstValueFrom(client.send(...).pipe(timeout(3_000)))`. Error mapping: `RpcException(NOT_FOUND)` → `DownstreamServiceError(404)`, other `RpcException` → `DownstreamServiceError(500)`, timeout/connection → `DownstreamServiceError(503)`. Preserves the `DownstreamServiceError` contract so `BillingController` and `BillingQuotaAdapter` are unchanged.
- **`apps/api/src/modules/billing/adapters/billing-tcp.adapter.spec.ts`** (new): 7 tests — ok + error paths for `getPostLimit`, `getSubscription` (including NOT_FOUND 404), and `createCheckoutSession`. Uses `of()` / `throwError()` from rxjs to mock `ClientProxy.send()`.
- **`apps/api/src/modules/billing/billing.module.ts`**: Replaced `BillingHttpClientAdapter` with `BillingTcpAdapter`; added `ClientsModule.registerAsync` (Transport.TCP, reads `BILLING_TCP_HOST`/`BILLING_TCP_PORT` from config); updated module JSDoc.
- Tests: 338 apps/api passed (7 new). Lint: 0 errors.

### 2026-07-17 — TM.2 `services/billing` TCP `@MessagePattern` handlers

- **`services/billing/src/main.ts`**: Added `app.connectMicroservice({ transport: Transport.TCP, options: { host: '0.0.0.0', port: BILLING_TCP_PORT } })` + `await app.startAllMicroservices()` before `app.listen()`. Service is now a hybrid app (HTTP + TCP). Updated JSDoc.
- **`services/billing/src/billing.message-controller.ts`** (new): 3 `@MessagePattern` handlers — `billing.get-quota` → `{ postLimit }`, `billing.get-subscription` → `SubscriptionResponse` or `RpcException(NOT_FOUND)`, `billing.checkout` → `{ url }` or `RpcException` with domain error code.
- **`services/billing/src/billing.module.ts`**: Added `BillingMessageController` to `controllers[]`. Updated module JSDoc.
- **`services/billing/src/billing.message-controller.spec.ts`** (new): 7 tests — ok + error paths for all 3 patterns. Fixed stub: `unref()` returns the value as-is when not a MikroORM `Reference`, so `plan` must be a plain object with fields directly.
- Tests: 33 billing + 331 apps/api (unchanged) = all green. Lint: 0 errors.

### 2026-07-17 — TM.1 Three-Transport Migration foundation

- **`.env.example`**: Added `# --- TCP (internal RPC) ---` section with 10 vars: `{BILLING,ANALYTICS,AUDIT,SEARCH,NOTIFICATION}_TCP_{HOST,PORT}`. Host = `localhost` for dev; services listen on `0.0.0.0` inside Docker.
- **`docker-compose.yml`**: Each of the 5 app services now exposes its TCP port (`4001`–`4005`) alongside the existing HTTP port, and carries `*_TCP_PORT` + `*_TCP_HOST: '0.0.0.0'` in `environment:`.
- ADR-094 was already present — no new ADR needed.
- No new packages, no TypeScript changes.
- Tests: 331 passed (unchanged). Lint: 0 errors.

### 2026-07-17 — L-19 `DevAuthModule` token compatibility verified

- **Investigation**: traced `DevAuthService.generateToken` → `POST /v1/sessions/{id}/tokens` (Clerk REST API) → genuine Clerk-signed JWT. `ClerkAuthGuard` uses `verifyToken(token, { secretKey })` (local crypto, no API call). Tokens are cryptographically compatible. No bypass needed; none added.
- **`docs/DECISIONS.md`**: ADR-107 added — compatibility verdict, flow description, two-step login-URL fallback, note that `DevAuthModule` is already excluded from production (`NODE_ENV !== 'production'` guard in `AppModule`).
- No code changes, no new packages.
- Tests: 331 passed (unchanged). Lint: 0 errors.

### 2026-07-17 — L-18 `PublishFallbackPollJob` threshold documented

- **`apps/api/src/modules/posts/jobs/publish-fallback-poll.job.ts`**: Expanded class JSDoc with threshold rationale (30 min covers Facebook's ~25 min webhook retry cycle), race mitigation (`status='publishing'` query filter + Redis dedup keys as backstop), and TTL×3 (90 min) failure threshold rationale. Expanded `run()` JSDoc to describe cutoff vs. triple-cutoff logic. Confirmed forked EM at line 49 (ADR-030/054 compliant). No logic changes.
- **`docs/DECISIONS.md`**: ADR-106 added — 30-minute threshold choice, race mitigation strategy, TTL×3 failure window, and note to revisit after T5.5 load-test results.
- Tests: 331 passed (unchanged). Lint: 0 errors.

### 2026-07-17 — L-17 Workspace soft-delete policy — Option B deferred

- **`docs/DECISIONS.md`**: ADR-105 added — chose Option B (deferred, not permanently out-of-scope). Key rationale: `ON DELETE RESTRICT` FKs on `posts` and `facebook_accounts` require domain-layer cascade; Stripe subscription cancellation + `WorkspaceDeletedEvent` + 90-day GDPR retention job are all architecturally ready to implement.
- **`docs/TASKS.md`**: Placeholder task `W-1` appended under new `## Deferred — Workspace Lifecycle` section — full scope: delete endpoint, domain-layer cascade order, BR-R02 sole-owner guard, `WorkspaceDeletedEvent`, retention job, unit + e2e tests.
- No code changes, no new packages.
- Tests: 331 passed (unchanged). Lint: 0 errors.

### 2026-07-17 — L-16 API versioning strategy ADR

- **`docs/DECISIONS.md`**: ADR-104 added — documents current state (`api/v1` via `setGlobalPrefix`, no `enableVersioning`), non-breaking change rule (additive = no bump), breaking-change migration path (`VersioningType.URI` + `@Version('1')` default + `@Version('2')` on specific methods), and 6-month `v1` deprecation window with `Sunset` header.
- No code changes, no new packages.
- Tests: 331 passed (unchanged). Lint: 0 errors.

### 2026-07-17 — L-15 Swagger `@ApiBadRequestResponse` on `PATCH /posts/:id/status`

- **`apps/api/src/modules/posts/posts.controller.ts`**: Added `ApiBadRequestResponse` to the `@nestjs/swagger` import; added `@ApiBadRequestResponse({ description: 'scheduledAt missing or not a future datetime (BR-F06, VALIDATION_ERROR)' })` decorator to `transitionStatus`. `createPost` `@ApiConflictResponse` already mentioned `PLAN_LIMIT_EXCEEDED` — no change needed.
- No new packages, no new tests (DoD: lint clean + Swagger UI shows 400 path).
- Tests: 331 passed (unchanged). Lint: 0 errors.

### 2026-07-17 — M-14 HTTP timeout config + fail-open quota strategy

- **`apps/api/src/common/http/fetch-http-client.adapter.ts`**: Injected `ConfigService`; reads `HTTP_CLIENT_TIMEOUT_MS` (default 5 000 ms) via `config.get`; applies `AbortSignal.timeout(this.timeoutMs)` on every request.
- **`apps/api/src/modules/billing/adapters/billing-http-client.adapter.ts`**: Injected `ConfigService`; reads `BILLING_SERVICE_URL` (getOrThrow) and `HTTP_CLIENT_TIMEOUT_MS`; applies `AbortSignal.timeout` to all 3 fetch calls; removed silent fallback from `getPostLimit` (now throws `DownstreamServiceError`).
- **`apps/api/src/modules/billing/adapters/billing-quota.adapter.ts`**: Exported `FREE_PLAN_LIMIT = 10`; added `Logger`; `getPostLimit` catches `DownstreamServiceError` → returns fallback with `logger.warn`; re-throws unexpected errors.
- **`apps/api/src/modules/billing/adapters/billing-quota.adapter.spec.ts`** (new): 3 tests — normal path, fail-open `DownstreamServiceError`, unexpected error re-throw.
- **`.env.example`**: Added `HTTP_CLIENT_TIMEOUT_MS=5000` under `# --- App ---`.
- **`docs/DECISIONS.md`**: ADR-103 added — timeout env var + fail-open policy rationale.
- Tests: 331 passed (3 new). Lint: 0 errors.

### 2026-07-17 — M-13 `scheduledAt` ISO 8601 UTC validation

- **`apps/api/src/modules/posts/dto/post.dto.ts`**: Replaced `@IsDateString()` with `@IsISO8601({ strict: true })` + `@Matches(/...(Z|[+-]\d{2}:\d{2})$/)` on `CreatePostDto.scheduledAt` and `UpdatePostDto.scheduledAt` (same file, same import). Updated `@ApiPropertyOptional` descriptions to state timezone offset required. Removed `IsDateString` import; added `IsISO8601`, `Matches`.
- **`apps/api/src/modules/posts/dto/update-post-status.dto.ts`**: Same decorator swap on `UpdatePostStatusDto.scheduledAt`. Removed `IsDateString` import; added `IsISO8601`, `Matches`.
- **`apps/api/src/modules/posts/dto/post.dto.spec.ts`** (new): 4 DTO validation tests — `CreatePostDto` and `UpdatePostStatusDto` each: no-timezone-offset string → `scheduledAt` error; `Z`-suffixed string → no error. Uses `class-validator`'s `validate()` + `class-transformer`'s `plainToInstance` directly (no NestJS bootstrap needed).
- **Why `@Matches` alongside `@IsISO8601`**: `validator.js@13` `isISO8601({ strict: true })` only validates calendar-date correctness — timezone is optional in the underlying regex. `@Matches` enforces the timezone requirement.
- Tests: 328 passed (4 new). Lint: 0 errors.

## Log

### 2026-07-17 — M-11 Missing query indexes for quota count and publish cron

- **`Migration20260717000001_PerfIndexesV2.ts`** (new): Two partial indexes on `core.posts`:
  - `idx_posts_workspace_active (workspace_id) WHERE deleted_at IS NULL` — covers `countByWorkspace` quota check on every `POST /posts`.
  - `idx_posts_scheduled_due (status, scheduled_at) WHERE status = 'scheduled' AND deleted_at IS NULL` — covers `PublishJob` cron query (`WHERE status='scheduled' AND scheduledAt <= now()`).
- **`docs/DECISIONS.md`**: ADR-102 added — rationale for each index, partial predicate size impact, note on EXPLAIN ANALYZE verification against live DB.
- No application code changes. No new packages.
- Tests: 324 passed. Lint: 0 errors.

### 2026-07-17 — M-10 Pagination for `listMembers` and `listForUser`

- **`workspace-member.repository.port.ts`**: Added `ListMembersCursor`, `ListMembersQuery`, `MembersPage` interfaces; updated `findAllByWorkspaceId` signature to return `MembersPage`.
- **`workspace.repository.port.ts`**: Added `ListWorkspacesCursor`, `ListWorkspacesQuery`, `WorkspacesPage` interfaces; updated `findAllByUserId` signature to return `WorkspacesPage`.
- **`invite-member.dto.ts`**: Added `ListWorkspaceMembersQueryDto` + `WorkspaceMembersPageDto` (matching `PostsPageDto` shape).
- **`workspace.dto.ts`**: Added `ListWorkspacesQueryDto` + `WorkspacesPageDto`.
- **`mikro-orm-workspace-member.repository.ts`**: Implemented keyset pagination in `findAllByWorkspaceId` — `$or [joinedAt > cursor] OR [joinedAt = cursor AND id > cursor]`, `ASC`, `limit + 1` probe.
- **`mikro-orm-workspace.repository.ts`**: Implemented keyset pagination in `findAllByUserId` — two-step ID resolve + cursor on workspace query, `createdAt DESC`.
- **`workspace.service.ts`**: Threaded `ListMembersQuery` / `ListWorkspacesQuery` through `listMembers` + `listForUser`; updated return types to `MembersPage` / `WorkspacesPage`.
- **`workspace.controller.ts`**: Both `listMembers` and `list` now accept `@Query()` and return page DTOs with `nextCursor`; Swagger updated.
- **`workspace.service.spec.ts`** + **`workspace.controller.spec.ts`**: Updated mock returns and assertions; added 2 new controller tests (nextCursor forwarding).
- **`docs/DECISIONS.md`**: ADR-101 — `joinedAt` cursor for members.
- Tests: 324 passed. Lint: 0 errors.

### 2026-07-17 — M-9 Correlation ID / distributed trace

- **`apps/api/src/common/trace/trace.context.ts`** (new): `TraceContextService` — `@Injectable()` singleton wrapping `AsyncLocalStorage<string>`; `run(id, fn)` + `getRequestId()`.
- **`apps/api/src/common/trace/trace.module.ts`** (new): `@Global() TraceModule` — provides and exports `TraceContextService` as a singleton across all modules.
- **`apps/api/src/common/trace/request-id.middleware.ts`** (new): `RequestIdMiddleware` — reads `req.id` (pino-http `genReqId`-generated UUID v7) and calls `traceCtx.run(requestId, next)`.
- **`apps/api/src/common/events/event-bus.port.ts`**: Added `traceId: string = uuidv7()` to `DomainEvent`; default UUID v7 so cron events are always correlated.
- **`apps/api/src/common/events/rabbitmq-event-bus.ts`**: Injected `TraceContextService`; `publish()` stamps `event.traceId` from ALS before serializing.
- **`apps/api/src/common/events/rabbitmq-event-bus.spec.ts`**: Added `mockTraceCtx` as 3rd constructor arg.
- **`apps/api/src/app.module.ts`**: Added `genReqId: () => uuidv7()` to pinoHttp; imported `TraceModule`; implemented `NestModule.configure()` to apply `RequestIdMiddleware` globally.
- **5 consumer files**: Added `traceId?: string` to payload interfaces; added `traceId: data.traceId` to all `logger.log`/`logger.warn` calls.
- **5 consumer spec files**: Added `traceId: 'trace-abc'` to sampleData; updated exact-arg log assertions in `post-created` and `post-published` specs.
- **`docs/DECISIONS.md`**: ADR-100 added — ALS + genReqId approach; why not OpenTelemetry; why event bus adapter sets traceId; change-log row added.
- Tests: 322 passed. Lint: 0 errors.

### 2026-07-17 — H-8 Internal route network isolation

- **`apps/api/src/common/guards/internal-secret.guard.ts`** (updated): Rewrote JSDoc to document the dual-layer security model — primary control is ingress/LB blocking `/internal/*` from public internet (nginx, k8s `NetworkPolicy`, AWS WAF); `x-internal-secret` check is secondary defence-in-depth. No logic changes.
- **`docs/DECISIONS.md`**: ADR-099 added — explains why shared secret alone is insufficient, required ingress/LB rule patterns for each platform, rationale for not adding a CIDR whitelist to the guard (`X-Forwarded-For` spoofable without LB stripping; network layer is the correct trust boundary). Change-log row added.
- Lint: 0 errors.



### 2026-07-16 — H-7 Health check dependency probes

- **`apps/api/package.json`**: added `@nestjs/terminus@^11.1.1`.
- **`apps/api/src/health/indicators/redis.health-indicator.ts`** (new): `RedisHealthIndicator` using terminus v11 `HealthIndicatorService` API (not deprecated base class); sends `PING`, asserts `PONG`; returns `.down({ message })` for unexpected responses or errors.
- **`apps/api/src/health/health.controller.ts`** (updated): now injects `HealthCheckService`, `MikroOrmHealthIndicator`, `RedisHealthIndicator`, `MemoryHealthIndicator`; `@HealthCheck()` decorator; probes Postgres (`pingCheck`), Redis (`isHealthy`), heap (`checkHeap` at 300 MB). Updated JSDoc.
- **`apps/api/src/health/health.module.ts`** (updated): imports `TerminusModule`; provides `RedisHealthIndicator`.
- **`apps/api/src/health/health.controller.spec.ts`** (updated): mocks all four dependencies; tests all-healthy, three probe delegation tests, and unhealthy propagation.
- **`apps/api/src/health/indicators/redis.health-indicator.spec.ts`** (new): tests PONG success, non-PONG down, and ping-throws down.
- ADR-098 logged in `docs/DECISIONS.md`.
- Tests: 322/322. Lint: 0 errors.

### 2026-07-16 — H-6 `FacebookTokenExpiryConsumer`

- **`apps/api/src/modules/facebook/consumers/facebook-token-expiry.consumer.ts`** (new): `FacebookTokenExpiryConsumer` extends `IdempotentConsumer`, binds `@EventPattern('facebook.token_expiring')`. Inside `withDedup`, calls `FacebookService.refreshAccountToken(workspaceId, accountId)`. Returns `'nack'` on `NOT_FOUND` (permanent failure → DLX); throws on any other `err` or rejection (transient → requeue). Token never present in payload (BR-F11).
- **`apps/api/src/modules/facebook/consumers/facebook-token-expiry.consumer.spec.ts`** (new): 5 tests — duplicate ack, success ack, NOT_FOUND permanent nack, transient throw nack+requeue, unexpected err nack+requeue.
- **`apps/api/src/modules/facebook/facebook.module.ts`**: added `FacebookTokenExpiryConsumer` to `controllers[]`.
- Tests: 315/315. Lint: 0 errors.

### 2026-07-16 — H-5 CORS configuration

- **`apps/api/src/main.ts`**: moved `configService` acquisition before middleware setup; added `app.enableCors({ origin: allowedOrigins, credentials: true, methods: [...], allowedHeaders: [...] })` immediately after `enableShutdownHooks`. `allowedOrigins` is split from `ALLOWED_ORIGINS` env var (comma-separated, default `http://localhost:4000`). Updated `bootstrap()` JSDoc.
- **`.env.example`**: added `ALLOWED_ORIGINS=http://localhost:4000` with comment under new `# --- App ---` section.
- ADR-097 logged in `docs/DECISIONS.md`.
- Tests: 430/430. Lint: 0 errors.

### 2026-07-16 — H-4 Rate limiting

- **`apps/api/package.json`**: added `@nestjs/throttler@^6.5.0`.
- **`apps/api/src/app.module.ts`**: added `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` to imports; `{ provide: APP_GUARD, useClass: ThrottlerGuard }` to providers. Updated JSDoc.
- **`workspace.controller.ts`**: `@Throttle({ default: { ttl: 60_000, limit: 5 } })` on `inviteMember`; JSDoc updated.
- **`dev-auth.controller.ts`**: `@Throttle({ default: { ttl: 60_000, limit: 10 } })` on `token`; JSDoc updated.
- **`facebook-webhook.controller.ts`**: `@SkipThrottle()` on controller class; JSDoc updated with rationale.
- **`clerk-webhook.controller.ts`**: `@SkipThrottle()` on controller class; JSDoc updated with rationale.
- ADR-096 logged in `docs/DECISIONS.md`.
- Tests: 430/430. Lint: 0 errors.

### 2026-07-16 — C-3 Graceful shutdown

- **`apps/api/src/main.ts`** (updated): Added `app.enableShutdownHooks()` immediately after `NestFactory.create`. Updated `bootstrap()` JSDoc to document the graceful-shutdown behaviour. No new dependency — built into `@nestjs/core`.
- Tests: 430/430. Lint: 0 errors.

### 2026-07-16 — C-2 Fix empty `facebookAccountId` in `PostPublishedEvent`

- **`apps/api/src/modules/posts/posts.service.ts`** (fixed): In the `→ published` branch of `transitionStatus`, extracted `accountId = post.facebookAccount?.id`. If `accountId` is falsy, returns `err(AppError.internal(...))` instead of passing `''` to `PostPublishedEvent`. Removed the misleading `// Ref<T> always exposes the PK — no population needed` comment that had masked the null case.
- **`apps/api/src/modules/posts/posts.service.spec.ts`** (updated): Added `facebookAccount: { id: PAGE_ACCOUNT_ID }` stub to the existing `publishing → published` test so it continues to pass after the guard. Added new test `'publishing → published: returns err(INTERNAL) when facebookAccount is absent'` — confirms the error path and that `eventBus.publish` is not called.
- Tests: 430/430. Lint: 0 errors.

### 2026-07-16 — C-1 Outbox recovery job

- **`apps/api/src/migrations/Migration20260716000001_OutboxRetryColumns.ts`** (new): adds `last_retry_at timestamptz` to `messaging.event_message_logs`. (`retry_count` already existed from the initial schema — only this column was missing.)
- **`apps/api/src/common/events/messaging-log.port.ts`** (extended): added `PendingLogRow` interface + `findPendingForRelay(olderThanSeconds)` and `incrementRetry(eventId)` abstract methods.
- **`apps/api/src/infrastructure/rabbitmq/messaging-log.repository.ts`** (extended): implemented both new methods via raw SQL — no ORM UoW, `getConnection().execute()` only (infra log pattern).
- **`apps/api/src/infrastructure/rabbitmq/jobs/outbox-relay.job.ts`** (new): `OutboxRelayJob` — `@Cron('*/30 * * * * *')`; queries `pending`/`failed` rows older than 60 s; re-emits each stored payload via `@Inject(FCP_EVENT_BUS) ClientProxy`; `markProcessed` on success; `incrementRetry` + log on broker error; per-row isolation (one row failure does not abort others).
- **`apps/api/src/infrastructure/rabbitmq/rabbitmq.module.ts`** (updated): registered `OutboxRelayJob` in `providers[]`.
- **`apps/api/src/infrastructure/rabbitmq/jobs/outbox-relay.job.spec.ts`** (new): 4 tests — empty rows (no-op), successful relay (markProcessed), broker error (incrementRetry), two-row isolation (first ok, second fails independently).
- ADR-095 logged in `docs/DECISIONS.md`.
- Tests: 429/429. Lint: 0 errors.

### 2026-07-15 — API gap closure (post-T5.7)

Three endpoints specified in the CR-01 API design tab but missing from the implementation were identified and added:

- **`GET /workspaces/:id/facebook/pages`**: added `IFacebookAccountRepository.findAllByWorkspace` (port + MikroORM adapter), `FacebookService.listPages`, and `GET :workspaceId/facebook/pages` to `FacebookController`. Returns `ConnectedPageResponseDto[]` sorted by `connectedAt DESC`. Access tokens excluded (BR-F11).
- **`GET /workspaces/:id/billing/subscription`**: added `SubscriptionResponse` + `PlanSummary` wire types to `@fcp/billing-contracts`; `GET /workspaces/:id/subscription` to `services/billing BillingController`; `BillingService.findSubscription` thin delegation; `IBillingHttpClient.getSubscription` + `BillingHttpClientAdapter`; `SubscriptionResponseDto` + `GET billing/subscription` to `apps/api BillingController`. 404 → `NOT_FOUND`; 5xx → `SERVICE_UNAVAILABLE`.
- **`GET /workspaces/:id/posts/:postId/analytics`**: added `PostMetricsResponse` wire type to `@fcp/analytics-contracts`; `PostMetricsDayDto` to `analytics.dto.ts`; `IAnalyticsClient.getPostMetrics` + adapter impl (calls `GET /posts/:postId/metrics` on analytics service, already implemented since T3.3); `GET posts/:postId/analytics` to `apps/api AnalyticsController`.
- 11 new tests across 4 spec files. ADR-092 logged.
- Tests: 425/425. Lint: 0 errors.

### 2026-07-15 — T5.7 Buffer / final review / docs sync

- Removed all deferred "T5.2 audit pass will evaluate/reconcile" comments from 2 migrations; replaced with the T5.2 decisions (ADR-036 intentional, ADR-031 explicit repo filter confirmed).
- Replaced "For T2.6/T3.2 this is a placeholder" framing in 3 consumer JSDoc blocks with current descriptions of what each consumer does and where downstream work lives.
- Removed "(T3.2 placeholders; full logic in T4.2/T4.3)" from `billing.module.ts` JSDoc.
- Updated `DECISIONS.md` ADR-031 trailing sentence and changelog row 793 inline evaluation note.
- Updated `SETUP.md` bootstrapping section: replaced "no application code yet / start T1.1" with live demo instructions (docker compose, migrations, all 7 processes, load-test commands).
- Tests: 414/414. Lint: 0 errors.

### 2026-07-15 — T5.6 Load-test fixes

- **`Migration20260715000001_PerfIndexes`**: composite index `idx_invitations_workspace_email_status (workspace_id, email, status)` covers `findPendingByWorkspaceAndEmail`; partial composite index `idx_posts_ws_created_at (workspace_id, created_at DESC, id DESC) WHERE deleted_at IS NULL` covers paginated `listPosts`.
- **Keyset pagination**: `IPostRepository.findAll` now accepts `ListPostsQuery { limit?, cursor? }` and returns `PostsPage { data, nextCursor }`. Adapter uses `LIMIT + 1` trick; cursor is `base64url(JSON({ createdAt, id }))`. Controller exposes `?limit=50&cursor=<opaque>`; response shape changed from `PostResponseDto[]` to `PostsPageDto`.
- **`WorkspaceService.getById`**: replaced 3 serial queries (findById + findAllByUserId's 2 round-trips) with `Promise.all([findById, findByWorkspaceAndUserId])` — 2 parallel queries, both on unique indexes.
- **Redis cache**: not added per §12 / ADR-019 — no live load-test data yet to justify.
- ADR-091 logged.
- Tests: 414/414. Lint: 0 errors.

### 2026-07-15 — T5.5 Artillery smoke + load

- **`artillery@^2.0.33`** added to root `devDependencies`; 4 npm scripts added: `load:smoke`, `load:read`, `load:write`, `load:fanout`.
- **`test/load/read-dashboard.yml`**: ramp 10→150 rps (60s), sustain 150 rps (120s); exercises `/health`, `/api/v1/auth/me`, `/api/v1/workspaces`, posts, members; `ensure p99: 300`.
- **`test/load/write-posts.yml`**: ramp 2→30 wps (30s), burst 30 wps (60s), cooldown 5 wps (30s); POST then GET post; `ensure p99: 500`.
- **`test/load/publish-fanout.yml`**: seed (30s, 2/s) → wait 90s for cron → observe outcome (30s, 2/s); `ensure maxErrorRate: 1`; instructions to check RabbitMQ management UI for DLQ depth.
- **`test/load/reports/.gitkeep`**: ensures reports directory exists; contents gitignored.
- Actual load-test execution requires live stack. Run order: `pnpm load:smoke` (fast CI gate), then `load:read`, `load:write`, `load:fanout` for full capacity verification.
- ADR-090 logged.
- Tests: 411/411. Lint: 0 errors.

### 2026-07-15 — T5.4 Result-pattern + FK-index pass

- **Result pattern**: All domain service methods return `Result<T, AppError>`. `ClerkWebhookService.handleEvent()` (`Promise<void>`) and `DevAuthService` (`Promise<DevAuthTokenResponseDto>`) are documented exceptions — infrastructure webhook handler and dev-only utility respectively.
- **FK indexes**: All 13 FK/logical-FK columns confirmed indexed in migration SQL. `email.email_delivery_logs.related_entity_id` intentionally unindexed: polymorphic optional context field, no access pattern queries on it, reference DDL omits the index.
- **No code changes** — clean verification pass.
- ADR-089 logged. ADR-087/ADR-088 renumbered (previous T5.1/T5.3 ADRs had numbers already taken in the changelog).
- Tests: 411/411. Lint: 0 errors.

### 2026-07-15 — T5.3 PII verification

- **`apps/api/src/app.module.ts`** (FIXED): Added `'*.pageToken'` to Pino redact paths. The `GET /internal/facebook-accounts/:id` endpoint returns `{ id, pageToken }` where `pageToken` is the decrypted access token — this field was not covered by the previous `*.accessToken` / `*.token` paths.
- **`services/notification/src/app.module.ts`** (FIXED): Added `redact: { paths: ['*.email', '*.fullName', '*.accessToken', '*.pageToken'] }`. The `workspace.member-invited` consumer receives `MemberInvitedPayload.email`; redaction is defence-in-depth.
- **`services/audit/src/app.module.ts`** (FIXED): Same redact config. The wildcard consumer sees ALL events (including `MemberInvitedEvent` with `email`); `stripPii()` already strips before DB insert but Pino-level redaction prevents any accidental `logger.log({ data })` from leaking.
- **`services/analytics/src/app.module.ts`** and **`services/search/src/app.module.ts`** (FIXED): Same redact config for consistency — these services consume post-only events with no PII today, but the config guards future event additions.
- **`docs/DECISIONS.md`**: ADR-068 added.
- Checked: `services/billing` (already redacts Stripe IDs) and `services/email` (already redacts `email`/`recipientEmail`) — no change needed.
- Tests: 411/411. Lint: 0 errors.

### 2026-07-15 — T5.2 Schema audit

- **`docs/reference/verify-seed.sql`** (FIXED): Commented out `core.audit_logs` row in Section 1 — this table does not exist in Postgres (ADR-047; audit records live in MongoDB `audit_events`). `messaging.*` rows were already present and correct.
- **`docs/DECISIONS.md` ADR-036** (EXPANDED): Replaced the two-line Plan/Subscription note with a full table enumerating all 12 entities that intentionally exclude `BaseEntity` (`WorkspaceMember`, `Invitation`, `FacebookAccount`, `Plan`, `Subscription`, `BillingEvent`, `PostMetrics`, `AuditEvent`, `EmailDeliveryLog`, `Notification`, `NotificationRecipient`, `WorkspaceMemberProjection`), each with a documented reason. Closes the open "T5.2 audit pass will evaluate" note from T2.2 for `FacebookAccount`.
- No DB `DEFAULT gen_random_uuid()` on any service-owned PK column — confirmed (carry-over from T5.1).
- All `BaseEntity` subclasses (`User`, `Workspace`, `Post`) have the full `createdAt`/`updatedAt`/`deletedAt` triplet — confirmed.
- Tests: 411/411. Lint: 0 errors.

### 2026-07-15 — T5.1 MikroORM/UoW verification pass

- **All checks PASS except one**: No global ORM filter (entity-level `@Filter` on `BaseEntity` only); no TypeORM; all service-owned PKs use app-generated uuid v7 (`uuidv7()`); UoW pattern correct (`em.flush()` once per repository method; `publish.job.ts` multi-flush is intentional per-post isolation in a forked EM, ADR-054).
- **Bug found and fixed**: `billing.subscriptions` CHECK constraint (`chk_subscriptions_status`) only listed `('trialing', 'active', 'grace_period', 'cancelled')`. T3.6 (ADR-060) added `'past_due'` to `SubscriptionStatus` in the TypeScript entity but no DB migration was written. Any write with `status = 'past_due'` would have thrown a check violation at runtime.
- **Fix**: Created `services/billing/src/migrations/Migration20260714000001_SubscriptionPastDueStatus.ts` — drops and recreates the constraint to include `'past_due'`. Documented as ADR-067 in DECISIONS.md.
- Tests: 411/411. Lint: 0 errors.

### 2026-07-15 — T4.4 Cross-cutting tests + docs

- **`apps/api/src/common/events/rabbitmq-event-bus.spec.ts`** (FIXED): Changed `FCP_EVENTS_EXCHANGE` import from `'./rabbitmq-event-bus'` to `'@fcp/constants'` — the constant moved to the shared constants lib in TR.1 but the spec was not updated, causing a `undefined !== 'fcp.events'` mismatch.
- **13 new spec files** added (`identity.controller`, `facebook.controller`, `facebook-callback.controller`, `facebook-webhook.controller`, `internal-api.controller`, `posts.controller`, `workspace.controller`, `billing.controller`, `billing-redirect.controller`, `notification.controller`, `search.controller`, `dev-auth.controller`): Cover all previously untested controllers in `apps/api`. Each spec covers the happy path and at least one primary error path per endpoint.
- **Swagger**: All existing public controllers already had `@ApiResponse` decorators; no gaps found.
- **ADRs**: DECISIONS.md current as of TR.11 (2026-07-14); no new decisions introduced in T4.4.
- Tests: 291/291 `apps/api`, 411/411 total workspace. Lint: 0 errors.



### 2026-07-14 — TR.11 Complete @golevelup removal

- **7 × `package.json`** (`apps/api`, `services/billing`, `services/email`, `services/audit`, `services/analytics`, `services/search`, `services/notification`): Removed `"@golevelup/nestjs-rabbitmq": "^9.0.2"` from `dependencies`.
- **Root `package.json`**: Removed `"@types/amqplib": "0.10.8"` from `devDependencies`. (`amqplib@^2.0.1` bundles its own types; `@types/amqplib` targeted the incompatible 0.10.x API.)
- **`pnpm install`**: Lockfile updated — 9 packages removed from the install.
- **5 × `app.module.ts`** (`services/notification`, `services/search`, `services/audit`, `services/email`, `services/analytics`): Stripped JSDoc comment lines that named `@golevelup` (historical removal notes). This was required to pass `grep -r golevelup . → 0 results`.
- Verification: `grep -r golevelup . --include="*.ts" --include="*.json" --exclude-dir=node_modules` → 0 hits. `ClientProxy` only in `apps/api/src/common/events/rabbitmq-event-bus.ts` (adapter) and a JSDoc in `rabbitmq.module.ts`/`services/billing/src/app.module.ts`. All 7 packages build. 345/345 tests. 0 lint errors.
- No new dependencies added. No code logic changed.

### 2026-07-14 — TR.10 ADR-085 + full workspace smoke test

- **`docs/DECISIONS.md`** (EDITED): Added `## ADR-085` section (before Change log) covering the complete `@golevelup/nestjs-rabbitmq → @nestjs/microservices` migration: context (library unmaintained since 2023, mentor-recommended 2026-07-13), decision summary (TR.1–TR.9 task breakdown), canonical consumer shape, pure microservice vs hybrid bootstrap patterns, two known limitations (no publisher-confirms, no `managedChannel.addSetup` topology assertion), and packages-affected table (30 consumers across 7 packages). Change log entry added.
- Smoke test: `pnpm lint` — 0 errors. `pnpm -r test` — 345/345 tests across all packages (billing 27, audit 9, analytics 9, email 20, search 15, api 225, notification 40).
- No code changes — documentation-only task.

### 2026-07-14 — TR.9 Migrate services/notification to hybrid app + 11 consumers

- **`services/notification/src/main.ts`** (REWRITTEN): Hybrid bootstrap — `app.connectMicroservice(getRmqOptions('notification_queue', configService))` + `await app.startAllMicroservices()` before `app.listen`. All existing HTTP setup retained.
- **`services/notification/src/app.module.ts`** (REWRITTEN): Removed `NotificationMessagingModule` (`@Global()` `RabbitMQModule.forRootAsync` wrapper) and `@golevelup` import. `NotificationRedisModule` + `MikroOrmModule` kept.
- **`services/notification/src/notification.module.ts`** (REWRITTEN): All 11 consumers moved from `providers[]` to `controllers[]`. `NotificationController` + services remain.
- **`member-invited.consumer.ts`** (REWRITTEN): Dedup-only consumer — `@Controller()`, `@EventPattern('workspace.member-invited')`, no ORM. Logs event ID; acks on new or duplicate; nacks on Redis failure.
- **`member-joined.consumer.ts`, `member-removed.consumer.ts`, `member-role-changed.consumer.ts`** (REWRITTEN): Projection consumers — added `MikroORM` as first constructor param + `RequestContext.create` (their `INotificationRepository` injects `EntityManager` directly; without this, `allowGlobalContext: false` would throw at runtime).
- **All 7 notification consumers** (`post-published`, `post-failed`, `billing-*`, `facebook-token-expiring`) (REWRITTEN): `@Controller()`, `@EventPattern(routingKey)`, `channel.ack/nack`. Existing `MikroORM` + `RequestContext.create` retained.
- **9 spec files** (REWRITTEN): `mockChannel`/`mockMsg`/`mockCtx` added; all handler calls pass `mockCtx`; success+dedup assert `ack(mockMsg)`; error tests assert `nack(mockMsg, false, true)`.
- **2 new spec files** created: `billing-subscription-cancelled.consumer.spec.ts`, `billing-subscription-past-due.consumer.spec.ts` (3 tests each: success+ack, dedup+ack, error+nack).
- Decision: projection consumers required `MikroORM` injection even though they don't call `em` directly — their repository port impl injects `EntityManager`, which needs a request context in microservice handlers.
- Tests: 40/40 notification, 345/345 total. Lint: 0 errors.

### 2026-07-14 — TR.8 Migrate services/search to hybrid app + 5 consumers

- **`services/search/src/main.ts`** (EDITED): Hybrid bootstrap — `app.connectMicroservice(getRmqOptions('search_queue', configService))` + `await app.startAllMicroservices()` before `app.listen`. All existing HTTP setup (Swagger, ValidationPipe, global prefix) retained.
- **`services/search/src/app.module.ts`** (REWRITTEN): Removed `SearchMessagingModule` (the `@Global()` `RabbitMQModule.forRootAsync` wrapper) and `@golevelup` import entirely. `SearchRedisModule` kept — all 5 consumers still inject `Redis` for dedup.
- **`services/search/src/search.module.ts`** (EDITED): All 5 consumers moved from `providers[]` to `controllers[]`. `SearchService` stays in `providers[]`.
- **All 5 consumer files** (REWRITTEN): `@Injectable()` → `@Controller()`; `@RabbitSubscribe(...)` → `@EventPattern('posts.<event>')` from `@nestjs/microservices`; handler gains `@Ctx() ctx: RmqContext` second param; duplicate → `channel.ack(msg)` + return; success → `channel.ack(msg)`; error → `redis.del(dedupKey)` + `channel.nack(msg, false, true)`. `Nack` import removed. No `RequestContext.create` — no ORM (Algolia-only service).
- **All 5 spec files** (REWRITTEN): `mockChannel`/`mockMsg`/`mockCtx` added to `makeConsumer`; handler calls updated to pass `mockCtx`; success+dedup assert `ack(mockMsg)`; error tests assert `nack(mockMsg, false, true)` instead of `rejects.toThrow`.
- Tests: 15/15 search, 337/337 total. Lint: 0 errors.

### 2026-07-14 — TR.7 Migrate services/analytics to hybrid app + posts.published consumer

- **`services/analytics/src/main.ts`** (EDITED): Hybrid bootstrap — `app.connectMicroservice(getRmqOptions('analytics.posts.published', configService))` + `await app.startAllMicroservices()` before `app.listen`. All existing HTTP setup (Swagger, ValidationPipe, global prefix) retained.
- **`services/analytics/src/app.module.ts`** (REWRITTEN): Removed `AnalyticsMessagingModule` (`@Global()` `RabbitMQModule.forRootAsync` wrapper). `RedisModule` kept — consumer still injects `Redis` for dedup. `@golevelup` import removed.
- **`services/analytics/src/analytics.consumer.ts`** (REWRITTEN): `@Injectable()` → `@Controller()`; `@RabbitSubscribe(...)` → `@EventPattern('posts.published')`; handler `onPostPublished(@Payload() data, @Ctx() ctx: RmqContext)`; `MikroORM` injected for `RequestContext.create` (wraps `metrics.upsert` — `MikroOrmPostMetricsRepository` injects `EntityManager` directly); duplicate → `channel.ack`; success → `channel.ack`; error → `redis.del(dedupKey)` + `channel.nack(msg, false, true)`.
- **`services/analytics/src/analytics.module.ts`** (EDITED): `PostPublishedConsumer` moved from `providers[]` to `controllers[]`.
- **`services/analytics/src/analytics.consumer.spec.ts`** (REWRITTEN): `vi.mock('@mikro-orm/core', ...)` for `RequestContext`; `makeConsumer` factory extended with `orm` stub + `mockChannel`/`mockMsg`/`mockCtx`; all 5 tests updated — error tests now assert `nack(mockMsg, false, true)` instead of `rejects.toThrow`; success/dedup tests assert `channel.ack`.
- Tests: 295/295 total (9 analytics passing). Lint: 0 errors.

### 2026-07-14 — TR.6 Migrate services/audit to hybrid app + wildcard consumer

- **`services/audit/src/main.ts`** (EDITED): Changed to hybrid bootstrap — `NestFactory.create` keeps HTTP server; `app.connectMicroservice(getRmqOptions('audit.all', configService))` adds RMQ transport (queue `audit.all`, exchange `fcp.events` topic, `wildcards: true`, DLX → `fcp.dlq`); `await app.startAllMicroservices()` called before `await app.listen(port)`. `ConfigService` available post-`create`, no `process.env` workaround needed.
- **`services/audit/src/app.module.ts`** (REWRITTEN): Removed `AuditMessagingModule` — the `@Global() @Module` wrapper class containing `RabbitMQModule.forRootAsync`. `RabbitMQModule` import from `@golevelup` removed entirely.
- **`services/audit/src/audit.consumer.ts`** (REWRITTEN): `@Injectable()` → `@Controller()`; `@RabbitSubscribe(...)` → `@EventPattern('#')`; handler now `onEvent(@Payload() data, @Ctx() ctx: RmqContext)`; `MikroORM` injected for `RequestContext.create` (required because `MikroOrmAuditEventRepository` injects `EntityManager` directly — HTTP middleware does not run for hybrid microservice routes); routing key from `ctx.getMessage().fields.routingKey` (same AMQP field as old `amqpMsg.fields.routingKey`); missing `eventId` → `nack(false, false)`; DB success → `ack`; transient error → `nack(true)`.
- **`services/audit/src/audit.module.ts`** (EDITED): `AuditConsumer` moved from `providers[]` to `controllers[]`.
- **`services/audit/src/audit.consumer.spec.ts`** (REWRITTEN): Removed `Nack` + `amqpMsg` second param; added `RequestContext` vi.mock; `mockChannel`/`mockMsg`/`mockCtx` pattern; `MikroORM` stub passed to constructor; 5 tests: success+ack, PII strip+ack, missing eventId→nack(false,false), null workspaceId+ack, transient error→nack(true).
- Tests: 295/295 total (9 audit passing). Lint: 0 errors.

### 2026-07-14 — TR.5 Migrate services/email to pure microservice

- **`services/email/src/main.ts`** (REWRITTEN): `NestFactory.createMicroservice<MicroserviceOptions>` — no HTTP server, no `setGlobalPrefix`; transport options read directly from `process.env` (bootstrap chicken-and-egg: `ConfigService` not available before module init). Exchange `fcp.events` topic, queue `email_queue`, DLX → `fcp.dlq`.
- **`services/email/src/app.module.ts`** (REWRITTEN): Removed `EmailMessagingModule` (the `@Global()` `@golevelup` wrapper) and `RetryQueueSetup` (`OnApplicationBootstrap` that asserted `fcp.retry.30s` via `managedChannel.addSetup` — unavailable under Transport.RMQ). `ConfigModule`, `LoggerModule`, `MikroOrmModule`, `EmailRedisModule`, `EmailModule` retained.
- **`services/email/src/email.module.ts`** (EDITED): All 5 consumers moved from `providers[]` to `controllers[]` (NestJS microservices discovers `@EventPattern` handlers in controllers, not providers).
- **`services/email/src/utils/email-retry.util.ts`** (DELETED): `getDeathCount` / `MAX_EMAIL_RETRIES` / `QUEUE_NAME` death-count logic superseded — DLX routes dead-lettered messages automatically via `nack(false, false)`.
- **All 5 consumers rewritten** (`member-invited`, `post-published`, `post-failed`, `billing-payment-failed`, `facebook-token-expiring`): `@Injectable()` → `@Controller()`; `@RabbitSubscribe` → `@EventPattern`; handler params `(@Payload() data, @Ctx() ctx: RmqContext)`; `AmqpConnection` dependency removed; `channel.ack/nack` replaces `return new Nack(...)` / `return` (implicit ack). Permanent errors → `nack(false, false)` (DLX → `fcp.dlq`); transient → `redis.del(dedupKey)` + `nack(true)` (requeue). `updateFailed` still called on `PermanentEmailError` with fixed `1` attempt count (x-death counting removed).
- **All 5 consumer specs rewritten**: `AmqpConnection` mock + `makeMockAmqpMsg` removed; `mockChannel = { ack, nack }` + `mockCtx = { getChannelRef, getMessage }` pattern; assertions on `channel.ack/nack` calls; 4 tests per consumer (success, duplicate, transient, permanent). 20/20 passing.
- **Retry strategy change**: Old strategy used `fcp.retry.30s` TTL queue with `x-death` death-count tracking (3 max retries) routed manually via `AmqpConnection.publish`. New strategy: permanent → DLX routes to `fcp.dlq` automatically; transient → immediate requeue via `nack(true)`. Broker topology pre-declared via Docker Compose / `definitions.json`.
- Tests: 290/290 total (20 email + 270 remaining). Lint: 0 errors.

### 2026-07-14 — TR.4 Migrate services/billing publisher to ClientProxy

- **`services/billing/src/adapters/billing-rabbitmq.adapter.ts`:** Replaced `AmqpConnection` with `@Inject(BILLING_EVENT_BUS) ClientProxy`; publish call changed to `await lastValueFrom(this.client.emit(routingKey, payload), { defaultValue: undefined })`. Exported `BILLING_EVENT_BUS = 'BILLING_EVENT_BUS'` token constant.
- **`services/billing/src/app.module.ts`:** Removed `BillingMessagingModule` (the `@Global()` `@golevelup` `RabbitMQModule` wrapper).
- **`services/billing/src/billing.module.ts`:** `ClientsModule.registerAsync([{ name: BILLING_EVENT_BUS, transport: Transport.RMQ, options: { noAssert: true, exchange: 'fcp.events', exchangeType: 'topic' } }])` registered here (not `AppModule`) — NestJS DI doesn't cross module boundaries; `BillingRabbitMqAdapter` lives in `BillingModule`, so the token must be provided there (ADR-080).
- **`services/billing/src/adapters/billing-rabbitmq.adapter.spec.ts`** *(new)*: 3 tests — emits correct routing key + payload; resolves on success; throws on broker error.
- **`libs/rmq-options/src/index.ts`:** Both factory functions (`getRmqOptions`, `getDlqRmqOptions`) inlined directly; `src/rmq-options.ts` sub-module deleted; `package.json main`/`types` restored to `src/index.ts`. Node.js 24 type-stripping loads `index.ts` directly with no sub-import to resolve, eliminating the extensionless-bare-import resolution failure.
- Tests: 27/27 billing passing (24 existing + 3 new). Lint: 0 errors.

### 2026-07-14 — TR.3 Migrate apps/api consumers to @EventPattern

- **`apps/api/src/main.ts`:** Added `app.connectMicroservice(getRmqOptions('api_queue', configService))` + `app.connectMicroservice(getDlqRmqOptions('dlq.logger', configService))` + `await app.startAllMicroservices()` before `app.listen()`.
- **`apps/api/src/app.module.ts`:** Moved `RabbitmqModule` import to LAST position so domain exact patterns register before `DlqConsumer`'s `#` wildcard in the shared handler Map.
- **`libs/rmq-options/src/rmq-options.ts`:** `getDlqRmqOptions` changed from `wildcards: false` → `wildcards: true` (required for `@EventPattern('#')` to act as catch-all on the DLQ fanout exchange).
- **`apps/api/src/common/consumers/idempotent-consumer.base.ts`:** `withDedup` signature changed from `(eventId, fn)` to `(eventId, channel, msg, fn)`; ack/nack now live inside the base class; `fn` returns `void | 'nack'` instead of `void | Nack`.
- **6 consumer files migrated** (dlq, post-created, post-published, facebook-feed, facebook-deauthorized, billing-subscription): `@Injectable()` → `@Controller()`; `@RabbitSubscribe` → `@EventPattern('routing.key')`; handler params changed to `(@Payload() data, @Ctx() ctx: RmqContext)`; `channel.ack/nack` replaces `return new Nack(...)`.
- **4 module files updated** (rabbitmq, posts, facebook, billing): consumers moved from `providers[]` to `controllers[]`.
- **4 existing specs updated + 2 new specs created** (post-published, billing-subscription): mock `RmqContext` pattern with `{ getChannelRef: () => mockChannel, getMessage: () => mockMsg }`; assertions on `channel.ack/nack` instead of return values; transient error path now asserts `channel.nack(mockMsg, false, true)` instead of `rejects.toThrow`.
- **Known limitation recorded in `DlqConsumer` JSDoc:** Messages with a `pattern` field matching a registered domain consumer route to that consumer, not `DlqConsumer`, because both transports share the NestJS handler registry. Acceptable for training project.
- Tests: 225/225 `apps/api` passing. Lint: 0 errors.

### 2026-07-14 — TR.2 Migrate apps/api publisher to ClientProxy

- **`apps/api/src/common/events/rabbitmq-event-bus.ts`:** Replaced `AmqpConnection` from `@golevelup` with `@Inject('FCP_EVENT_BUS') ClientProxy` from `@nestjs/microservices`. Publish call changed from `await this.amqp.publish(exchange, key, payload)` to `await lastValueFrom(this.client.emit(routingKey, payload), { defaultValue: undefined })`. `FCP_EVENTS_EXCHANGE` constant retained for messaging log. New `FCP_EVENT_BUS` token constant exported.
- **`apps/api/src/infrastructure/rabbitmq/rabbitmq.module.ts`:** Removed `RabbitMQModule.forRootAsync` (and `@golevelup` import). Added `ClientsModule.registerAsync` with `name: 'FCP_EVENT_BUS'`, `transport: Transport.RMQ`, `exchange: 'fcp.events'`, `exchangeType: 'topic'`, `noAssert: true` (publisher never asserts its own queue). Removed `RabbitMQModule` from exports. `DlqConsumer` stays in providers (inert until TR.3). Updated JSDoc.
- **`apps/api/src/common/events/rabbitmq-event-bus.spec.ts`:** Replaced `AmqpConnection` mock with `ClientProxy` stub. `emit` mocked to return `of(undefined)` (happy path) and `throwError()` (error path). Assertions updated from 3-arg `amqp.publish(exchange, key, payload)` to 2-arg `client.emit(key, payload)`.
- **Decision:** `noAssert: true` on the publisher `ClientProxy` — prevents NestJS from asserting a consumer queue on the broker. The `fcp.events` exchange is still asserted by `ClientRMQ.setupChannel` on connection. Consumer queue assertion happens in TR.3 via `connectMicroservice`.
- Tests: 215/215 `apps/api` passing. Lint: 0 errors.

### 2026-07-14 — TR.1 @nestjs/microservices + AMQP peer deps + shared RMQ options factory

- **New packages (all 7 packages — `apps/api` + 6 `services/*`):** `@nestjs/microservices@^11.1.28`, `amqplib@^2.0.1`, `amqp-connection-manager@^5.0.0`, `@fcp/rmq-options@workspace:*`.
- **New workspace lib `libs/rmq-options/` (`@fcp/rmq-options`):**
  - `src/rmq-options.ts` — `getRmqOptions(queue, configService)` (topic, `fcp.events`, wildcards, DLX → `fcp.dlq`, `RMQ_PREFETCH` env default 10) and `getDlqRmqOptions(queue, configService)` (fanout, `fcp.dlq`, no wildcards, `RMQ_DLQ_PREFETCH` env default 5). Both JSDoc-documented per CODING-STANDARDS.md §9.
  - `src/index.ts` — barrel export.
  - `package.json` — deps: `@nestjs/microservices`, `@nestjs/config`; devDeps: `@types/node`, `typescript`.
  - `tsconfig.json` — extends `../../tsconfig.base.json`.
- **`.env.example`:** `RMQ_PREFETCH=10` and `RMQ_DLQ_PREFETCH=5` added under the RabbitMQ section.
- **Decision:** `amqplib` and `amqp-connection-manager` added in TR.1 (not deferred to TR.2+) because they are required peer deps of `@nestjs/microservices` RMQ transport and would silently disappear when `@golevelup` is removed in TR.11 (ADR-075). `amqplib@^2.0.1` bundles its own TS types — `@types/amqplib@0.10.8` at workspace root to be removed in TR.11 (ADR-075). Factories in `libs/rmq-options/` to avoid 7-way duplication (ADR-076).
- No runtime behaviour changes — factories are scaffolded only; nothing wires them yet.
- Tests: 327/327 passing (215 apps/api + 24 billing + 9 analytics + 9 audit + 25 email + 15 search + 30 notification). Lint: 0 errors.

### 2026-07-08 — T4.3 RabbitMQ native retry (x-death, fcp.retry)

- **Retry strategy:** `fcp.retry` exchange (topic) declared in `EmailMessagingModule`. `RetryQueueSetup` (`OnApplicationBootstrap`) asserts `fcp.retry.30s` queue (30 s TTL, dead-letters back to `fcp.events`) via `managedChannel.addSetup`. `@types/amqplib@0.10.8` added to workspace root devDeps (no bundled types in `amqplib@0.10.9`).
- **`email-retry.util.ts`** (NEW) — `MAX_EMAIL_RETRIES = 3`; `getDeathCount(amqpMsg, queueName)` reads `x-death[].count` for the specific queue.
- **`updateFailed(id, attempts)`** signature updated — records actual attempt count in `retry_count`.
- **All 5 consumers updated:** `queueOptions.deadLetterExchange: 'fcp.retry'` (was `'fcp.dlq'`); `AmqpConnection` injected; handler receives `(msg, amqpMsg: ConsumeMessage)`; on catch: permanent or `deathCount >= 3` → `updateFailed` + manual `amqpConnection.publish('fcp.dlq', ...)` + `return` (Ack); transient + retries remaining → `redis.del(dedupKey)` + `return new Nack(false)` (→ retry queue → 30 s → redeliver).
- **All 5 spec files updated:** `makeMockAmqpMsg(deathCount)` helper; `amqpConnection.publish` mock; 5 tests each (happy-path, duplicate-skip, transient-nack, permanent-DLQ, exhausted-DLQ). 25/25 tests, lint clean.

### 2026-07-08 — T4.3 post-task security & runtime fixes (continuation)

- **Security fix — invitation token off the event bus (ADR-072):** `MemberInvitedEvent` only carries `invitationId`; the Email Service now calls `GET /api/v1/internal/invitations/:id` (`InternalInvitationController`, `InternalSecretGuard`) to obtain `{ token, workspaceId, role, expiresAt }` before sending. `acceptUrl` constructed locally in `MemberInvitedEmailConsumer` using `API_URL` + token. Token never transits RabbitMQ.
- **`PermanentEmailError` DLQ pattern (ADR-073):** `ResendEmailProvider` throws `PermanentEmailError` for Resend 4xx (not 429). All 5 email consumers catch it, log, and `return new Nack(false)` without clearing the Redis dedup key — prevents infinite retry on permanently-failing addresses.
- **`GET /workspaces/:workspaceId/members/:memberId`** endpoint added (`WorkspaceController` + `WorkspaceService.getMember`); any workspace role allowed.
- **`acceptInvitation` 409 guard:** pre-checks `findByWorkspaceAndUserId` before inserting `WorkspaceMember`; returns `CONFLICT` instead of surfacing a DB unique-constraint 500.
- **Tests:** `InternalInvitationController.spec.ts` (2 tests); `member-invited.consumer.spec.ts` updated with `getInvitationEmailContext` mock + permanent-error DLQ test. 261/261 total. Lint: 0 errors.
- **Setup:** No new migration. `API_URL` in `services/email/.env` must point to the running `apps/api` (e.g. `http://localhost:3000`). Resend `member-invitation` template must use `{{acceptUrl}}` as button link.

### 2026-07-08 — T4.3 Resend dashboard templates

- **`ResendEmailProvider` updated** to use Resend's `template.id + template.variables` API when a `RESEND_TEMPLATE_*` env var is set; falls back to inline HTML if absent (for local dev).
- **5 HTML templates** authored for copy-paste into the Resend dashboard: `member-invitation`, `post-published`, `post-failed`, `payment-failed`, `token-expiring`. Variable syntax: `{{variableName}}` per Resend spec.
- **`.env.example`** extended with `RESEND_TEMPLATE_MEMBER_INVITATION`, `RESEND_TEMPLATE_POST_PUBLISHED`, `RESEND_TEMPLATE_POST_FAILED`, `RESEND_TEMPLATE_PAYMENT_FAILED`, `RESEND_TEMPLATE_TOKEN_EXPIRING`.
- `TEMPLATE_ENV_KEYS` map in provider coerces `data: Record<string,unknown>` → `Record<string,string>` for Resend's `variables` field.
- No new dependencies; no new tests (provider logic is a thin SDK call, template content is in Resend's dashboard not in source).

### 2026-07-08 — T4.3 post-task BullMQ removal

- **Removed BullMQ entirely** (ADR-070 supersedes ADR-055): `@nestjs/bullmq`, `bullmq` removed from `services/email/package.json`. `SendEmailProcessor` + spec deleted. `BullModule` removed from `app.module.ts` and `email.module.ts`.
- **Each consumer now calls `IEmailProvider.send()` directly.** On failure: dedup key cleared + error rethrown → RabbitMQ redelivers to DLX. Matches pattern used by notification/search/analytics/audit consumers.
- `IEmailDeliveryLogRepository.updateFailed()` removed (nothing calls it; RabbitMQ handles retry exhaustion via DLX).
- All 5 consumer specs rewritten to assert `emailProvider.send` + `emailLogRepo.updateSent` instead of `emailQueue.add`.
- Tests: 315/315. Lint: 0 errors.

### 2026-07-08 — T4.3 Email service

- **`apps/api` internal endpoints added (ADR-050):**
  - `IUserRepository.findById(id)` + `MikroOrmUserRepository` adapter.
  - `InternalUserController` → `GET /internal/users/:id` → `{ id, email }` (guarded by `InternalSecretGuard`).
  - `InternalWorkspaceController` extended with `GET /internal/workspaces/:id` → `{ id, ownerId, ownerEmail }` (uses `EntityManager` cross-entity for `User` email lookup — §13).
  - 5 new tests in `apps/api` (identity controller ×2, workspace controller ×3).
- **`services/email/` scaffolded:**
  - `EmailDeliveryLog` entity — no `BaseEntity`; app-gen UUID v7 id (diverges from DDL `DEFAULT gen_random_uuid()`, ADR-070); `@Unique({ properties: ['dedupeKey'] })`.
  - Migration `Migration20260708000001_EmailSchema` — `email` schema, `email_delivery_logs` table, CHECK constraints, 3 btree indexes.
  - Ports: `IEmailProvider`, `IInternalApiClient`, `IEmailDeliveryLogRepository`.
  - Adapters: `ResendEmailProvider` (`resend@6.17.1`), `InternalApiAdapter` (calls `/internal/users/:id` + `/internal/workspaces/:id`).
  - `MikroOrmEmailDeliveryLogRepository` — silently no-ops on `dedupeKey` duplicate.
  - `SendEmailProcessor` (BullMQ `@Processor('email')`) — `process()` calls Resend → updates log `sent`; `@OnWorkerEvent('failed')` → updates log `failed` on final attempt.
  - 5 consumers (`workspace.member-invited`, `posts.published`, `posts.failed`, `billing.payment_failed`, `facebook.token_expiring`) — all idempotent (Redis `SET NX EX` + DB `dedupeKey` UNIQUE); enqueue BullMQ job (`attempts: 3, backoff: exponential`).
- **Root:** `start:email`, `migration:email`, `test:email` scripts added; `.env.example` extended with `EMAIL_PORT`, `RESEND_API_KEY`, `EMAIL_FROM`.
- Tests: 19 new (5 consumers × 3 + processor × 4). 319/319 total. Lint: clean. ADR-070.
- **Setup:** `cd services/email && pnpm mikro-orm migration:up`. Add `EMAIL_PORT=3006`, `RESEND_API_KEY=re_...`, `EMAIL_FROM=noreply@...` to `.env`.

### 2026-07-07 — T4.2 post-task runtime fixes

- **`RequestContext.create` for RabbitMQ consumers (ADR-068):** All 7 notification consumers now wrap their orchestrator call in `RequestContext.create(this.orm.em, async () => { ... })`. `UseRequestContext` from `@mikro-orm/nestjs` v7.0.2 does not exist; `RequestContext.create` from `@mikro-orm/core` is the correct API. Without this, `em.find()` / `em.flush()` threw `cannotUseGlobalContext` because RabbitMQ handlers are not HTTP requests and `MikroOrmMiddleware` never runs for them.
- **Lazy projection seeding in `NotificationOrchestrator` (ADR-069):** When `getMembersForWorkspace` returns 0 rows, `notifyWorkspace` now fetches from `GET /internal/workspaces/:id/members`, upserts the projection, then retries. Eliminates the need for a manual seed step after first deployment. `IInternalApiClient` injected into orchestrator.
- **`reconcileWorkspace(workspaceId)` public method + `POST /internal/workspaces/:workspaceId/seed-projection`** endpoint added (idempotent ops-utility; lazy seeding makes it optional day-to-day).
- **`WorkspaceMemberReconciler.onModuleInit` try/catch** — service no longer crashes when the migration hasn't been run yet.
- Tests: still 295/295. Lint: clean.

### 2026-07-07 — T4.2 Notification service

- **`libs/billing-contracts/src/events.ts`** — added `PaymentFailedPayload`; exported from `index.ts`.
- **`services/billing/src/billing.service.ts`** — `handleInvoicePaymentFailed` now publishes `billing.payment_failed` after `em.flush()` (ADR-054 compliance).
- **`apps/api InternalWorkspaceController`** (new) — `GET /internal/workspaces/:id/members`; guarded by `InternalSecretGuard`; returns `[{ userId, role }]`; registered in `WorkspaceModule`.
- **`apps/api NotificationModule`** (new thin proxy) — `INotificationClient` port + `NotificationHttpClientAdapter`; `GET /workspaces/:id/notifications` + `PATCH /notifications/:id/read`; Clerk JWT + any-role guard. `IHttpClient` extended with `patch()` method (`FetchHttpClientAdapter` refactored to shared `request()` helper).
- **`services/notification/`** scaffolded:
  - 3 entities: `Notification`, `NotificationRecipient`, `WorkspaceMemberProjection` (none extend `BaseEntity` — no `updatedAt`/`deletedAt` per DDL).
  - Migration `Migration20260707000001_NotificationSchema` — `notification` schema, 3 tables, BR-F08 trigger, 4 btree indexes.
  - 3 ports: `INotificationRepository`, `ISlackProvider`, `IInternalApiClient`.
  - 3 adapters: `MikroOrmNotificationRepository`, `SlackWebhookProvider`, `InternalApiAdapter`.
  - `NotificationOrchestrator` — `notifyWorkspace` + `notifyUser` (fan-out + optional Slack).
  - `WorkspaceMemberReconciler` — `OnModuleInit` cold-start reconciliation from `GET /internal/workspaces/:id/members` (ADR-059); skips if projection empty (first boot).
  - 4 projection consumers (member-invited/joined/removed/role-changed) — idempotent Redis dedup; `member-invited` dedup-only (invitee userId unknown at invite time).
  - 7 notification consumers (posts.published/failed, billing.subscription_activated/cancelled/past_due/payment_failed, facebook.token_expiring).
  - `NotificationService` + `NotificationController` for HTTP read API.
- **Setup:** `cd services/notification && pnpm mikro-orm migration:up`. Add `NOTIFICATION_PORT=3005`, `NOTIFICATION_SERVICE_URL=http://localhost:3005/api/v1`, `APPS_API_INTERNAL_URL=http://localhost:3000/api/v1`, `INTERNAL_API_SECRET=<secret>`, `SLACK_WEBHOOK_URL=<optional>` to `.env`.
- Tests: 30 new (4 projection consumers × 3 + 7 notification consumers × 2 + service × 4 + reconciler × 3). 295/295 total. Lint: clean. ADR-067 added.

### 2026-07-07 — T4.1 Search service

- **`services/search/`** scaffolded as a full NestJS app (`@fcp/search`, port 3004 via `SEARCH_PORT`). No MikroORM — Algolia is the system of record (no Postgres schema).
- **`IAlgoliaSearchProvider`** port + **`AlgoliaSearchAdapter`** (`algoliasearch@^5.55.1`): `saveObject`, `partialUpdateObject`, `deleteObject`, `search`; reads `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY`, `ALGOLIA_POSTS_INDEX` via `getOrThrow`.
- **Five idempotent consumers** (Redis `SET NX EX` dedup on `dedup:search:<eventId>`; DLX → `fcp.dlq`):
  - `PostCreatedConsumer` → `saveObject` (queue `search.posts.created`)
  - `PostUpdatedConsumer` → `partialUpdateObject` mutable fields (queue `search.posts.updated`)
  - `PostPublishedConsumer` → `partialUpdateObject` status/facebookGraphPostId/publishedAt (queue `search.posts.published`)
  - `PostFailedConsumer` → `partialUpdateObject` status:'failed'/failedAt (queue `search.posts.failed`)
  - `PostDeletedConsumer` → `deleteObject` (queue `search.posts.deleted`)
- **`SearchService`** — read-side `search(workspaceId, query)` facade returning `Result<SearchResultDto[], never>`.
- **`SearchController`** — `GET /search?workspaceId=…&q=…`; internal endpoint (no auth on service side; auth enforced by `apps/api`).
- **`apps/api SearchModule`** (thin proxy): `ISearchClient` port + `SearchHttpClientAdapter` (reuses existing `IHttpClient`/`FetchHttpClientAdapter`); `GET /workspaces/:workspaceId/search?q=` with Clerk JWT + any-role guard; `SEARCH_SERVICE_URL` via `getOrThrow`.
- `.env.example` — added `SEARCH_PORT=3004`, `SEARCH_SERVICE_URL`, `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY`, `ALGOLIA_POSTS_INDEX`. Renamed pre-existing `ALGOLIA_ADMIN_KEY` → `ALGOLIA_API_KEY`.
- Tests: 15 new (3 per consumer). 265/265 total. Lint: clean. ADR-066 added.
- **Setup:** No migration needed. Add `SEARCH_PORT`, `SEARCH_SERVICE_URL`, `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY`, `ALGOLIA_POSTS_INDEX` to `.env`.

### 2026-07-06 — Week 3 close: shared contract libs

- **`libs/analytics-contracts/`** (new `@fcp/analytics-contracts`) — `MetricsSummaryResponse` (wire type for `GET /workspaces/:id/metrics`); `PostPublishedPayload` (RabbitMQ event shape consumed by analytics).
- **`libs/audit-contracts/`** (new `@fcp/audit-contracts`) — `AuditEventResponse` (wire type for audit HTTP endpoints).
- **`services/analytics`** — `analytics.consumer.ts` imports `PostPublishedPayload` from contracts; `post-metrics.repository.port.ts` re-exports `MetricsSummaryResponse as MetricsSummary` (type alias, backwards-compatible for internal callers).
- **`apps/api`** — `analytics-http-client.adapter.ts` replaces inline `RawMetricsSummary` with `MetricsSummaryResponse`; `audit-http-client.adapter.ts` replaces inline `RawAuditEvent` with `AuditEventResponse`.
- tsc: 0 new errors introduced (26 pre-existing spec-file errors in apps/api unchanged). 250/250 tests. Lint: clean.

### 2026-07-06 — T3.6 Billing lifecycle event completeness

- **`libs/billing-contracts/src/events.ts`** — added `SubscriptionPastDuePayload` (`{ eventId, workspaceId, planCode, occurredAt }`) and `SubscriptionRenewedPayload` (`{ eventId, workspaceId, planCode, renewedAt }`); exported from `index.ts`.
- **`services/billing/src/entities/subscription.entity.ts`** — `'past_due'` added to `SubscriptionStatus` union (was `trialing | active | grace_period | cancelled`).
- **`services/billing/src/billing.service.ts`**:
  - `ALLOWED_TRANSITIONS` — added `past_due` row; `active/trialing/grace_period` can now enter `past_due`; `past_due` exits to `active` or `cancelled`.
  - BR-F10 guard extended to block free plan from `past_due` (same rule as `grace_period`).
  - `handleStripeEvent` switch — added `customer.subscription.updated` case.
  - `handleSubscriptionUpdated` (new private) — guards `stripeSub.status !== 'past_due'` (ignores all other update events); idempotent on already-`past_due`/`cancelled`; transitions, flushes, publishes `billing.subscription_past_due`.
  - `handleInvoicePaymentSucceeded` refactored — three explicit branches: `active` (renewal: log billing event + publish `billing.subscription_renewed`, no state change), `trialing/grace_period/past_due` (activation: transition + publish `billing.subscription_activated`), `cancelled` (no-op).
  - `BILLING_SUCCESS_URL` / `BILLING_CANCEL_URL` fallback paths updated to include `/api/v1` prefix.
- **`apps/api/src/modules/billing/billing-redirect.controller.ts`** (new) — `GET /api/v1/billing/success` + `GET /api/v1/billing/cancel`; no auth guard; `@ApiExcludeController`; handles Stripe browser redirects for API-only deployments.
- **`apps/api/src/modules/billing/billing.module.ts`** — registered `BillingRedirectController`.
- **`.env.example`** — added `BILLING_SUCCESS_URL` and `BILLING_CANCEL_URL` with the correct `api/v1`-prefixed defaults.
- Tests: 6 new + 1 updated in `billing.service.spec.ts` (past_due arm ×4, renewal arm ×2, stale no-op test corrected). 250/250 total. Lint: clean.
- **Follow-up (T4.2):** `apps/api` billing event consumers should react to `billing.subscription_past_due` (notify workspace members) — deferred to T4.2 notification service.

### 2026-07-06 — T3.5 Audit read API + Analytics read API

- **`apps/api/src/common/http/http-client.port.ts`** — `IHttpClient` abstract class (transport-agnostic GET) + `DownstreamServiceError` (carries HTTP status; 503 on connection failure — ECONNREFUSED never reaches clients).
- **`apps/api/src/common/http/fetch-http-client.adapter.ts`** — `FetchHttpClientAdapter`: native fetch with `AbortSignal.timeout(5000)`; any network/timeout failure → `DownstreamServiceError(503)`.
- **`apps/api/src/common/errors/app-error.ts`** — `SERVICE_UNAVAILABLE` code added + `AppError.serviceUnavailable()` factory.
- **`apps/api/src/common/http/to-http-exception.ts`** — `SERVICE_UNAVAILABLE` → HTTP 503.
- **`apps/api/src/modules/audit/`** — thin proxy module for audit read operations.
  - `IAuditClient` port — transport-agnostic; `getWorkspaceAuditLogs` + `getAuditEvent`.
  - `AuditHttpClientAdapter` — injects `IHttpClient`; `AUDIT_SERVICE_URL` via `getOrThrow`; `RawAuditEvent → AuditLogResponseDto` mapper (`receivedAt` string→Date); 404 from downstream → `null`.
  - `AuditController` — `GET /workspaces/:workspaceId/audit-logs` + `GET /workspaces/:workspaceId/audit-logs/:auditId`; Owner-only; full Swagger incl. `@ApiServiceUnavailableResponse`.
  - `AuditModule` — wires `IHttpClient → FetchHttpClientAdapter`, `IAuditClient → AuditHttpClientAdapter`.
- **`apps/api/src/modules/analytics/`** — thin proxy module for analytics read operations.
  - `IAnalyticsClient` port — transport-agnostic; `getWorkspaceMetrics`.
  - `AnalyticsHttpClientAdapter` — injects `IHttpClient`; `ANALYTICS_SERVICE_URL` via `getOrThrow`; `RawMetricsSummary → MetricsSummaryDto` mapper.
  - `AnalyticsController` — `GET /workspaces/:workspaceId/analytics`; Owner-only; full Swagger.
  - `AnalyticsModule` — wires `IHttpClient → FetchHttpClientAdapter`, `IAnalyticsClient → AnalyticsHttpClientAdapter`.
- **`AppModule`** — added `AuditModule` + `AnalyticsModule` to imports.
- Tests: 9 new (audit controller ×6, analytics controller ×3). 244/244 total. Lint: clean.
- **Post-implementation fixes (same session):**
  - **Bug:** `ANALYTICS_SERVICE_URL` was documented without the `/api/v1` prefix → analytics service returned 404 → `mapDownstreamError` misclassified as 500 (404 < 500 threshold). Fix: corrected `.env.example` + improved `mapDownstreamError` in both controllers to emit `"Analytics service responded with unexpected 404"` so routing bugs are diagnosable from the response body without reading service logs.
  - **Global prefix consistency:** `services/audit` had no `app.setGlobalPrefix('api/v1')` while billing and analytics already did. Added prefix to audit. `BillingHttpClientAdapter` was using `config.get('BILLING_SERVICE_URL', 'http://localhost:3001')` with a no-prefix default — calling wrong paths since T3.1. Changed to `config.getOrThrow('BILLING_SERVICE_URL')`. `.env.example` updated: added missing `BILLING_PORT` + `BILLING_SERVICE_URL`, corrected `AUDIT_SERVICE_URL`, filled in `APPS_API_INTERNAL_URL`.
- **Setup:** All `*_SERVICE_URL` env vars **must include `/api/v1`** — see `.env.example` for exact values. (ADR-065)

### 2026-07-06 — T3.4 Audit Service (MongoDB)

- **`services/audit/`** scaffolded as a full NestJS app (`@fcp/audit`, port 3003 via `AUDIT_PORT`).
- **`AuditEvent` entity** (`audit_events` collection) — `_id` uuid v7 string PK; `eventId` (unique index, idempotency key); `routingKey`; `workspaceId` (nullable, indexed for T3.5 workspace queries); `payload` (raw, PII stripped); `receivedAt`. Append-only — no `deletedAt` (CLAUDE.md exception).
- **`AuditConsumer`** — single `@RabbitSubscribe({ routingKey: '#' })` on `audit.all` queue captures every event on `fcp.events`. Routing key read from `amqpMsg.fields.routingKey`. PII fields (`email`, `fullName`, `accessToken`, `pageToken`, `password`) stripped before insert. Missing `eventId` → `Nack(false)` (permanent discard).
- **Idempotency** — MongoDB unique index on `eventId` (not Redis). Repository catches duplicate-key error code 11000 and returns silently (ADR-064). No Redis dependency in this service.
- **`IAuditEventRepository`** port + `MikroOrmAuditEventRepository` adapter — `insert`, `findByWorkspace` (newest first, limit + cursor), `findById`.
- **`AuditService`** — `getWorkspaceAuditLogs` + `getAuditEvent` (Result pattern).
- **`AuditController`** — `GET /workspaces/:id/audit-logs` + `GET /audit-logs/:id` (no auth yet — T3.5 adds Owner guard + Swagger).
- **`@Global() AuditMessagingModule`** — same RabbitMQ wrapper pattern as billing/analytics (ADR-063); `enableControllerDiscovery: true`; no Redis module.
- `docs/DECISIONS.md` — ADR-064 (MongoDB dedup, wildcard consumer, append-only, PII strip list, no Redis).
- Tests: 9 new (consumer ×5, service ×4). 235/235 total. Lint: clean. tsc: 0 errors.
- **Post-implementation fixes (same session):**
  - `@Index({ unique: true })` not valid in `@mikro-orm/decorators/legacy` → replaced with `@Unique({ properties: ['eventId'] })` at class level (same pattern as `PostMetrics`).
  - `persistAndFlush` not exposed on `MongoEntityManager` type → replaced with `em.persist(doc); await em.flush()`.
  - `Record<string, unknown>` where clause → `FilterQuery<AuditEvent>` from `@mikro-orm/core`.
  - `import { EntityManager } from '@mikro-orm/mongodb'` → `@mikro-orm/core` — `@mikro-orm/nestjs` registers the EM under the core token; driver-specific import caused `UnknownDependenciesException` at startup.
  - `MONGODB_URL` → `MONGODB_URI` in `app.module.ts` and `mikro-orm.config.ts` to match the existing env var name.
  - Root `migration:audit` script removed from `package.json` (MongoDB does not support SQL migrations; indexes are created via `ensureIndexes: true` on startup).
- **Setup:** Add `MONGODB_URI=mongodb://localhost:27017/fcp_audit` and `AUDIT_PORT=3003` to `.env`. Indexes created automatically on startup.

### 2026-07-06 — T3.3 Analytics service

- **`services/analytics/`** scaffolded as a full NestJS app (`@fcp/analytics`, port 3002 via `ANALYTICS_PORT`).
- **`PostMetrics` entity** (`analytics.post_metrics`) — uuid v7 PK (app-generated); `postId` + `workspaceId` as logical scalar FKs (ADR-046, BR-R06) with btree indexes; `metricDate` (Date); `reach`, `impressions`, `likes`, `comments`, `shares`; UNIQUE `(postId, metricDate)` for idempotent upsert.
- **`Migration20260706000001_AnalyticsSchema`** — `CREATE SCHEMA analytics` + `post_metrics` table + 3 btree indexes.
- **Ports:** `IPostMetricsRepository` (upsert + findByPost + aggregateByWorkspace), `IInternalApiClient` (getFacebookAccount), `IFacebookInsightsProvider` (getPostInsights).
- **Adapters:** `MikroOrmPostMetricsRepository` (upsert via `em.upsert`; aggregate via raw SQL `em.getConnection().execute()`), `InternalApiHttpAdapter` (calls `GET /internal/facebook-accounts/:id` with `x-internal-secret`), `FacebookInsightsAdapter` (calls Graph API `v25.0 /{graphPostId}/insights`; returns zeros on 4xx).
- **`PostPublishedConsumer`** — `@RabbitSubscribe` on `analytics.posts.published`; Redis `SET NX EX` dedup; resolves token via internal API → Graph API insights → upsert; clears dedup key + rethrows on failure.
- **`AnalyticsService`** — `getWorkspaceMetrics(workspaceId)` + `getPostMetrics(postId)` (read-side only).
- **`AnalyticsController`** — `GET /workspaces/:id/metrics` + `GET /posts/:id/metrics`.
- **`apps/api` internal endpoint** (ADR-050):
  - `InternalSecretGuard` (`common/guards/`) — checks `x-internal-secret` header against `INTERNAL_API_SECRET` env var.
  - `InternalFacebookController` (`modules/facebook/`) — `GET /internal/facebook-accounts/:id` returns `{ id, pageToken }` (decrypted token from `EncryptedText`); no Swagger, no Clerk JWT.
  - `IFacebookAccountRepository.findById(id)` added to port + repository.
- `docs/DECISIONS.md` — ADR-061 (analytics service env vars, global module pattern), ADR-062 (tsconfig split), ADR-063 (`@Global()` wrapper for RabbitMQ + Redis in services).
- Tests: 9 new (consumer ×5, service ×4). 226/226 total. Lint: clean.
- **Post-implementation fixes (same session):**
  - `tsconfig.json` in both services corrected: keep `rootDir: ./src`, drop `mikro-orm.config.ts` from `include` (CLI uses `useTsNode`); `tsconfig.build.json` added to exclude specs from `nest build`; `vitest.config.ts` updated with `exclude: ['**/dist/**']`.
  - `@golevelup/nestjs-rabbitmq` v9 is not `@Global()` — `AmqpConnection` not visible in feature modules. Fix: inline `@Global() AnalyticsMessagingModule` + `@Global() RedisModule` wrapper classes in `app.module.ts` (same pattern applied to `services/billing` for `AmqpConnection`).
  - `aggregateByWorkspace` rewritten: `em.getKnex()` does not exist on MikroORM 7 EM; replaced with `em.getConnection().execute()` raw SQL.
  - `FacebookInsightsAdapter`: `res.json()` → `unknown` under strict TS; cast to `InsightsResponse`. Graph API version corrected from `v21.0` → `v25.0` to match codebase standard.
- **Setup:** `cd services/analytics && pnpm mikro-orm migration:up` + add `ANALYTICS_PORT=3002`, `APPS_API_INTERNAL_URL=http://localhost:3000/api/v1`, `INTERNAL_API_SECRET=<secret>` to `.env`.

### 2026-07-06 — T2.9 Publish Job + fallback poll + token-expiry scheduler

- **`@nestjs/schedule@^6.1.3`** added to `apps/api/package.json` (ADR-054). `ScheduleModule.forRoot()` imported in `AppModule`.
- **`FacebookTokenExpiringEvent`** (`facebook/events/facebook-token-expiring.event.ts`) — `routingKey='facebook.token_expiring'`; payload: `accountId, workspaceId, pageId, tokenExpiresAt`; no token value (BR-F11).
- **`IFacebookGraphApiProvider`** extended with two new abstract methods:
  - `publishPost(pageId, token, content, mediaUrl?)` → `{ postId }` — `POST /{pageId}/feed`
  - `checkPostLive(graphPostId, token)` → `boolean` — `GET /{postId}?fields=id`; returns `false` on 4xx (post gone/token expired), rethrows on network failure.
- **`FacebookGraphApiAdapter`** implements both methods.
- **`PublishJob`** (`posts/jobs/publish.job.ts`) — `@Cron(EVERY_MINUTE)`; injects `MikroORM`, `IFacebookGraphApiProvider`, `IEventBus`, `Logger`; forks EM per run; loads `scheduled` posts with `scheduledAt <= now()`; calls Graph API per post; on success → `publishing` + sets `facebookGraphPostId`; on error / no account → `failed` + `PostFailedEvent`.
- **`PublishFallbackPollJob`** (`posts/jobs/publish-fallback-poll.job.ts`) — `@Cron('0 */5 * * * *')`; reads `PUBLISH_TTL_MINUTES` (default 30) from env; loads `publishing` posts with `updatedAt <= now() - TTL`; calls `checkPostLive`; if live → `published` + `PostPublishedEvent`; if within TTL×3 → no-op; if beyond TTL×3 → `failed` + `PostFailedEvent`.
- **`FacebookTokenExpiryScheduler`** (`facebook/jobs/facebook-token-expiry.job.ts`) — `@Cron(EVERY_DAY_AT_MIDNIGHT)`; finds accounts with `tokenExpiresAt < now() + 7 days`; emits `FacebookTokenExpiringEvent` per account; no PII in payload.
- **`PostsModule`** — added `PublishJob`, `PublishFallbackPollJob` + `IFacebookGraphApiProvider → FacebookGraphApiAdapter` binding.
- **`FacebookModule`** — added `FacebookTokenExpiryScheduler`.
- `docs/DECISIONS.md` — ADR-053 (token-expiry events) + ADR-054 (forked EM per job run).
- Tests: 11 new (publish.job ×4, publish-fallback-poll.job ×4, facebook-token-expiry.job ×3). 217/217 total (199 apps/api + 18 services/billing). Lint: clean.

### 2026-07-06 — T2.8 Accept invitation + role-change endpoint

- **`events/member-joined.event.ts`** — `MemberJoinedEvent`; `routingKey = 'workspace.member-joined'`; payload: `workspaceId, userId, role, invitationId`; no PII.
- **`events/member-role-changed.event.ts`** — `MemberRoleChangedEvent`; `routingKey = 'workspace.role-changed'`; payload: `workspaceId, userId, oldRole, newRole, changedByUserId`; no PII.
- **`IInvitationRepository`** updated — added `findByToken(token): Promise<Invitation | null>` (looks up invitation by its single-use 64-char hex token regardless of status; caller guards status + expiry).
- **`IWorkspaceMemberRepository`** updated — added `findByWorkspaceAndUserId(workspaceId, userId)` and `save(member)` (persist + flush; one flush per request §6).
- **`MikroOrmInvitationRepository`** — implements `findByToken` via `repo.findOne({ token })`.
- **`MikroOrmWorkspaceMemberRepository`** — implements `findByWorkspaceAndUserId` + `save`.
- **`ChangeRoleDto`** added to `dto/invite-member.dto.ts` — `role: WorkspaceRole` with `@IsIn(['owner', 'editor', 'viewer'])` and Swagger annotation.
- **`WorkspaceService.acceptInvitation(workspaceId, token, userId)`** — token lookup → workspace match → status/expiry guards (BR-F03) → mutation `invitation.status='accepted'` → `WorkspaceMember.forAcceptedInvite` factory → `members.save(member)` commits both in one flush → emits `MemberJoinedEvent` after commit (§6). Returns `err(NOT_FOUND | CONFLICT | VALIDATION_ERROR)`.
- **`WorkspaceService.changeMemberRole(workspaceId, targetUserId, newRole, changedByUserId)`** — lookup by userId → sole-owner guard for demotions (BR-R02) → `member.role = newRole` → `members.save(member)` → emits `MemberRoleChangedEvent` after commit (§6). Returns `err(NOT_FOUND | FORBIDDEN)`.
- **`WorkspaceController`** — two new endpoints:
  - `POST :workspaceId/invitations/:token/accept` — `ClerkAuthGuard` only (no `WorkspaceRolesGuard`; accepting user is not yet a member; token is the credential); HTTP 201.
  - `PATCH :workspaceId/members/:userId/role` — `WorkspaceRolesGuard` Owner; HTTP 200; `ChangeRoleDto` body.
- Tests: 12 new (`acceptInvitation` ×7, `changeMemberRole` ×5). 206/206 total (188 apps/api + 18 services/billing). Lint: clean.
- No new migration — `acceptedAt` lives on `WorkspaceMember` (already in entity + factory); `Invitation` table needs no new column.

### 2026-07-06 — T2.6.5 Messaging schema migration

- **`Migration20260703000001_MessagingSchema`** — creates `messaging` schema; `messaging.event_message_logs` (app-UUID PK, no DB DEFAULT, `processing_status` CHECK, 2 indexes) and `messaging.dead_letter_messages` (FK to event_message_logs ON DELETE RESTRICT, UNIQUE on event_id per BR-R09). `dead_letter_messages.id` uses `DEFAULT gen_random_uuid()` per reference DDL — infra-table exception to ADR-013.
- **`IMessagingLogRepository`** port (`src/common/events/messaging-log.port.ts`) — `insertPending`, `markProcessed`, `markFailed`, `markDlq`, `insertDeadLetter`; lives in `common/events/` alongside the event bus.
- **`PostgresMessagingLogRepository`** adapter (`src/infrastructure/rabbitmq/messaging-log.repository.ts`) — raw SQL via `MikroORM.em.getConnection().execute()`; no entity/flush lifecycle for infra writes; injects `MikroORM` (not `EntityManager`) per ADR-030.
- **`RabbitMqEventBus`** updated — injects `IMessagingLogRepository`; `publish()` calls `insertPending` before `amqp.publish`, `markProcessed` on success, `markFailed` + rethrows on error.
- **`DlqConsumer`** (`src/infrastructure/rabbitmq/consumers/dlq.consumer.ts`) — `@RabbitSubscribe` on `fcp.dlq` fanout, queue `dlq.logger`; extracts `eventId` from payload; calls `markDlq` + `insertDeadLetter`; returns `Nack(false)` if `eventId` absent (no infinite loop).
- **`RabbitmqModule`** updated — registers `IMessagingLogRepository → PostgresMessagingLogRepository` + `DlqConsumer`; exports `IMessagingLogRepository`.
- `verify-seed.sql` already references `messaging.*` tables — no change needed.
- Tests: 7 new (3 event-bus log-flow tests + 4 DLQ consumer tests). 194/194 total (176 apps/api + 18 services/billing). Lint: clean.
- **Setup required:** `pnpm mikro-orm migration:up` (in `apps/api`) to apply `Migration20260703000001_MessagingSchema`.

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
