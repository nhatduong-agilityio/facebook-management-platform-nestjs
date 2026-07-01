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

## Change log
| Date | Decision |
|---|---|
| 2026-06-29 | Initial version pinning; TS held at 5.9, ESLint at 9 (see rationale). |
| 2026-06-29 | **Roadmap reorder (no effort change, ~222h):** moved MikroORM, BaseEntity (uuid v7 + timestamps + soft delete), PII `EncryptedText`, and the Result pattern from Week 5 into Week 1 (T1.2). These are foundational/cross-cutting — every feature inherits them, so building features first and "migrating" later would force a full rewrite of entities, repositories, and service signatures. Moved the Audit Service to Week 3 (after the event bus is stable, so audit can be exercised end-to-end). Week 5 is now verification + Artillery load testing, not building. This removes hidden rework and de-risks the schedule. |
| 2026-06-30 | **T1.2 complete.** MikroORM v7 wired to PG + Mongo; BaseEntity (uuid v7 + timestamps + soft-delete); AppError + toHttpException; EncryptedText (AES-256-GCM); Pino logger with PII redaction; User entity + initial migration. See ADR-021/022/023 for v7 decorator split, TsMorph metadata provider, and offline migration workflow. |
| 2026-06-30 | **T1.2 boot-verification fixes.** (1) Removed `exports: [MikroOrmModule]` from DatabaseModule — `@mikro-orm/nestjs` registers providers globally so explicit export is not needed, and re-exporting dynamic modules by class reference throws `UnknownExportException` in NestJS. (2) Added `discovery: { warnWhenNoEntities: false }` to the MongoDB context so startup is not blocked until Audit Service entities are added in T3.x. |
| 2026-07-01 | **T1.3 complete.** Clerk JWT guard (`ClerkAuthGuard`), `IdentityService.getOrCreateUser` (DB upsert with Clerk API fallback on first sign-in), `GET /auth/me`, RBAC role types + `WorkspaceRolesGuard`. ADR-024 below. |
| 2026-07-01 | **Post-T1.3 enhancements.** (1) Hexagonal Architecture refactor: repository + identity-provider ports; MikroORM + Clerk adapters; `IdentityService` now depends only on abstract ports — zero ORM/SDK/ConfigService imports; §13 added to CODING-STANDARDS.md. (2) `DevAuthModule`: `POST /dev-auth/token` calls Clerk Backend API to return a real JWT for Postman (dev only). (3) Clerk webhook receiver: `POST /webhooks/clerk` syncs `user.created/updated/deleted` to `core.users` using `verifyWebhook` from `@clerk/backend/webhooks`; no separate `svix` dep. ADR-026. `rawBody: true` added to bootstrap. 60 tests passing. |
| 2026-06-30 | **T1.1 complete.** pnpm workspace, NestJS 11 app, ESLint 9 flat config, vitest 4 + unplugin-swc, husky pre-commit (hooksPath set via `git rev-parse --show-prefix`), Docker Compose (PG 16, Mongo 7, Redis 7, RabbitMQ 3). Note ADR-020 above re vitest/swc cosmetic warning. |
| 2026-06-30 | **ADR-019 Performance optimization order — Index → Query → Cache.** Redis caching (response cache, RBAC cache, query cache) is Week 5-only and requires T5.5 Artillery benchmark data to justify. Most p99 regressions are solved by a missing index or an N+1 query; adding cache without that evidence buys invalidation complexity, stale-read risk, and extra monitoring for no proven gain. Consumer deduplication keys (`dedup:<eventId>`) are the only pre-T5 Redis use — they are idempotency infrastructure, not a performance cache. When cache is added in T5.6, record the before/after p99 and load level in this file. |
